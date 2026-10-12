package app.toss.mobile.share;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.IntentCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 系统分享接收（Android {@code ACTION_SEND} / {@code ACTION_SEND_MULTIPLE}）。
 *
 * <p>外部应用分享进来的文本与文件先被复制到 App 私有目录
 * {@code filesDir/toss-inbox/}（对应 JS 侧 {@code Directory.Library} +
 * {@code INBOX_DIRECTORY}），再把描述信息交给 JS。文件从不写入用户可见目录，
 * 导出由 JS 侧的保存流程决定。
 *
 * <p>冷启动与热启动都只经过 {@link #handleOnNewIntent(Intent)}：{@code BridgeActivity}
 * 在 {@code onCreate} 末尾会把启动 Intent 交给插件，之后每次新的分享也走同一入口。
 * 去重有三层：同一个 Intent 实例只处理一次；{@code MainActivity} 用
 * {@link #EXTRA_RESTORED_ACTIVITY} 标出系统在进程被杀后重放的 Intent，插件再用
 * 分享指纹确认它已被捕获；{@link #pending} 与 {@link #getPendingShare} 在
 * {@link #stateLock} 下互斥。因此一次分享只会投递一次。
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    static final String EVENT_INCOMING_SHARE = "incomingShare";

    /** 与 lib/native-storage-cleanup.ts 的 INBOX_DIRECTORY 保持一致。 */
    static final String INBOX_DIRECTORY = "toss-inbox";

    private static final String TAG = "ShareReceiver";
    /**
     * 未消费积压的元数据。文件名以点开头，而导入文件名的清洗会去掉前导点，
     * 因此不会与用户分享进来的文件重名。
     */
    private static final String PENDING_FILE = ".pending-share.json";
    /**
     * 最近一次成功导入的分享指纹。仅在 Activity 被系统重建（进程曾被杀）时用于
     * 识别重放的 Intent：此时内容早已导入，跳过即可避免重复投递。
     */
    private static final String CONSUMED_FILE = ".last-share";
    /**
     * 由 {@code MainActivity} 在 Activity 被重建时写入。系统在进程被杀后会拿原始
     * Intent 重建 Activity，该标记让插件检查指纹而不是无条件导入。
     */
    public static final String EXTRA_RESTORED_ACTIVITY = "app.toss.mobile.share.restored";
    /** 标记已处理的 Intent 实例，避免同一 Intent 被重复导入。 */
    private static final String HANDLED_EXTRA = "app.toss.mobile.share.handled";
    private static final int COPY_BUFFER_SIZE = 64 * 1024;
    /** 保留的已投递指纹数量，用于识别系统重放的 Intent。 */
    private static final int CONSUMED_FINGERPRINT_LIMIT = 32;
    private static final int MAX_FILE_NAME_LENGTH = 128;
    private static final String FALLBACK_FILE_NAME = "received-file";
    private static final String FALLBACK_MIME_TYPE = "application/octet-stream";

    private final Object stateLock = new Object();
    /** 复制可能较大的文件；Activity 重建后按需重建。 */
    private volatile ExecutorService copyExecutor = newCopyExecutor();

    /** 已导入但尚未交给 JS 的分享内容。 */
    private JSObject pending;

    /** 与 {@link #pending} 对应的分享指纹，用于识别系统重放的 Intent。 */
    private final List<String> pendingFingerprints = new ArrayList<>();

    /** 最近一次处理过的 Intent 实例。 */
    private Intent lastHandledIntent;

    private static ExecutorService newCopyExecutor() {
        return Executors.newSingleThreadExecutor();
    }

    @Override
    protected void handleOnDestroy() {
        // 允许正在进行的复制跑完并落盘，之后由 getPendingShare 从磁盘恢复。
        copyExecutor.shutdown();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !isShareIntent(intent)) {
            return;
        }

        boolean restored;
        synchronized (stateLock) {
            if (intent == lastHandledIntent || intent.getBooleanExtra(HANDLED_EXTRA, false)) {
                return;
            }
            intent.putExtra(HANDLED_EXTRA, true);
            lastHandledIntent = intent;
            restored = intent.getBooleanExtra(EXTRA_RESTORED_ACTIVITY, false);
        }

        // 复制文件可能较大，放到后台线程，避免阻塞 onNewIntent/onCreate。
        executor().execute(() -> {
            if (restored && isAlreadyCaptured(intent)) {
                Log.i(TAG, "Skipping share intent replayed after process death");
                return;
            }

            JSObject payload = importShare(intent);
            if (payload == null) {
                return;
            }
            synchronized (stateLock) {
                pending = pending == null ? payload : merge(pending, payload);
                pendingFingerprints.add(fingerprint(intent));
                writePendingFile(pending, pendingFingerprints);
            }
            // 在 bridge 的任务线程上投递，与 addListener/removeListener 串行。
            getBridge().execute(this::flushPending);
        });
    }

    /**
     * Activity 被系统重建时，原始分享 Intent 会被再次送入。若该指纹已被捕获
     * （仍在积压中或已投递过），跳过以避免重复投递。
     */
    private boolean isAlreadyCaptured(Intent intent) {
        String expected = fingerprint(intent);
        synchronized (stateLock) {
            if (pendingFingerprints.contains(expected)) {
                return true;
            }
        }

        JSObject entry = readPendingEntry();
        if (entry != null) {
            JSONArray stored = entry.optJSONArray("fingerprints");
            if (stored != null) {
                for (int index = 0; index < stored.length(); index++) {
                    if (expected.equals(stored.optString(index, null))) {
                        return true;
                    }
                }
            }
        }

        return readConsumedFingerprints().contains(expected);
    }

    /**
     * 分享内容的稳定指纹：动作、类型、文本与流 URI。URI 顺序可能变化，排序后比较。
     */
    private static String fingerprint(Intent intent) {
        StringBuilder builder = new StringBuilder();
        builder.append(intent.getAction()).append('|').append(intent.getType()).append('|');
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        builder.append(text == null ? "" : text).append('|');

        List<String> uris = new ArrayList<>();
        for (Uri uri : collectStreamUris(intent)) {
            uris.add(uri.toString());
        }
        Collections.sort(uris);
        for (int index = 0; index < uris.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(uris.get(index));
        }
        return builder.toString();
    }

    private List<String> readConsumedFingerprints() {
        File file = consumedFingerprintFile();
        if (!file.isFile()) {
            return new ArrayList<>();
        }
        try (InputStream input = new FileInputStream(file)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return readStoredFingerprints(new JSObject(buffer.toString(StandardCharsets.UTF_8.name())));
        } catch (IOException | JSONException ex) {
            Log.w(TAG, "Unable to read share fingerprints", ex);
            return new ArrayList<>();
        }
    }

    private void writeConsumedFingerprint(List<String> fingerprints) {
        if (fingerprints.isEmpty()) {
            return;
        }

        List<String> merged = readConsumedFingerprints();
        for (String value : fingerprints) {
            if (value == null || value.isEmpty() || merged.contains(value)) {
                continue;
            }
            merged.add(value);
        }
        // 只保留最近的记录，避免文件无界增长。
        while (merged.size() > CONSUMED_FINGERPRINT_LIMIT) {
            merged.remove(0);
        }

        JSObject entry = new JSObject();
        entry.put("fingerprints", new JSArray(merged));
        File file = consumedFingerprintFile();
        try {
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                return;
            }
            try (OutputStream output = new FileOutputStream(file)) {
                output.write(entry.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException ex) {
            Log.w(TAG, "Unable to persist share fingerprints", ex);
        }
    }

    @Override
    protected void handleOnResume() {
        // JS 侧可能在分享到达之后才注册监听，回到前台时补投一次。
        getBridge().execute(this::flushPending);
    }

    private ExecutorService executor() {
        ExecutorService current = copyExecutor;
        if (current.isShutdown()) {
            synchronized (stateLock) {
                if (copyExecutor.isShutdown()) {
                    copyExecutor = newCopyExecutor();
                }
                current = copyExecutor;
            }
        }
        return current;
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject payload;
        synchronized (stateLock) {
            payload = takePendingLocked();
        }

        if (payload == null) {
            call.resolve();
            return;
        }

        call.resolve(payload);
    }

    /**
     * 有 JS 监听时立即投递并清空积压；没有监听时保留积压，等待 {@code getPendingShare}。
     */
    private void flushPending() {
        JSObject payload;
        synchronized (stateLock) {
            if (!hasListeners(EVENT_INCOMING_SHARE)) {
                return;
            }
            payload = takePendingLocked();
        }

        if (payload == null) {
            return;
        }
        notifyListeners(EVENT_INCOMING_SHARE, payload);
    }

    /**
     * 取走积压（内存优先，其次磁盘），并把指纹记入已消费记录后清除积压文件。
     * 必须在 {@link #stateLock} 下调用。
     */
    private JSObject takePendingLocked() {
        JSObject entry = pending;
        List<String> fingerprints = new ArrayList<>(pendingFingerprints);
        pending = null;
        pendingFingerprints.clear();
        if (entry == null) {
            // 进程被杀后积压只留在磁盘上，冷启动由这里恢复。
            entry = readPendingEntry();
            fingerprints = readStoredFingerprints(entry);
        }
        deletePendingFile();

        if (entry == null) {
            return null;
        }
        // 内容已经交给 JS，之后系统重放同一 Intent 时必须靠指纹识别。
        writeConsumedFingerprint(fingerprints);

        JSObject payload = new JSObject();
        JSONArray items = entry.optJSONArray("items");
        payload.put("items", items == null ? new JSArray() : items);
        payload.put("text", entry.optString("text", ""));
        JSONArray failed = entry.optJSONArray("failed");
        if (failed != null && failed.length() > 0) {
            payload.put("failed", failed);
        }
        return payload;
    }

    private static List<String> readStoredFingerprints(JSObject entry) {
        List<String> fingerprints = new ArrayList<>();
        if (entry == null) {
            return fingerprints;
        }
        JSONArray stored = entry.optJSONArray("fingerprints");
        if (stored == null) {
            return fingerprints;
        }
        for (int index = 0; index < stored.length(); index++) {
            String value = stored.optString(index, null);
            if (value != null && !value.isEmpty()) {
                fingerprints.add(value);
            }
        }
        return fingerprints;
    }

    private static boolean isShareIntent(Intent intent) {
        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    private JSObject importShare(Intent intent) {
        ContentResolver resolver = getContext().getContentResolver();
        JSArray items = new JSArray();
        StringBuilder text = new StringBuilder();

        CharSequence sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (sharedText != null && sharedText.length() > 0) {
            text.append(sharedText);
        }

        List<String> failed = new ArrayList<>();
        for (Uri uri : collectStreamUris(intent)) {
            try {
                JSObject item = copyIntoInbox(resolver, uri, intent.getType());
                if (item != null) {
                    items.put(item);
                }
            } catch (IOException | RuntimeException ex) {
                // 单个 URI 读取失败（例如授权已失效）不得中断同一批其余内容。
                Log.w(TAG, "Failed to import shared content " + uri, ex);
                failed.add(describeSource(uri));
            }
        }

        // 全部失败时也要投递，交给 JS 提示用户，而不是静默丢弃。
        if (items.length() == 0 && text.length() == 0 && failed.isEmpty()) {
            return null;
        }

        JSObject payload = new JSObject();
        payload.put("items", items);
        payload.put("text", text.toString());
        if (!failed.isEmpty()) {
            payload.put("failed", new JSArray(failed));
        }
        return payload;
    }

    /** 失败项的可读名称，用于向用户说明哪一项没读到。 */
    private static String describeSource(Uri source) {
        String segment = source.getLastPathSegment();
        return segment == null || segment.trim().isEmpty() ? source.toString() : segment;
    }

    private static List<Uri> collectStreamUris(Intent intent) {
        Set<Uri> uris = new LinkedHashSet<>();

        Uri single = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (single != null) {
            uris.add(single);
        }

        ArrayList<Uri> multiple = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (multiple != null) {
            uris.addAll(multiple);
        }

        // ACTION_SEND 在 Android 10+ 常把 URI 放在 ClipData 里，且可能重复 EXTRA_STREAM。
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) {
                    uris.add(uri);
                }
            }
        }

        return new ArrayList<>(uris);
    }

    private JSObject copyIntoInbox(ContentResolver resolver, Uri source, String intentType) throws IOException {
        File inbox = ensureInboxDirectory();
        String mimeType = resolveMimeType(resolver, source, intentType);
        File destination = resolveAvailableFile(inbox, resolveDisplayName(resolver, source));

        try (InputStream input = resolver.openInputStream(source)) {
            if (input == null) {
                throw new IOException("Unable to open shared content: " + source);
            }
            try (OutputStream output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[COPY_BUFFER_SIZE];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
            }
        } catch (IOException | RuntimeException ex) {
            // 半成品不留在收件目录里。
            destination.delete();
            throw ex;
        }

        JSObject item = new JSObject();
        item.put("mimeType", mimeType);
        item.put("name", destination.getName());
        item.put("path", INBOX_DIRECTORY + "/" + destination.getName());
        item.put("uri", Uri.fromFile(destination).toString());
        item.put("size", destination.length());
        return item;
    }

    private File ensureInboxDirectory() throws IOException {
        File inbox = new File(getContext().getFilesDir(), INBOX_DIRECTORY);
        if (!inbox.isDirectory() && !inbox.mkdirs() && !inbox.isDirectory()) {
            throw new IOException("Unable to create inbox directory: " + inbox);
        }
        return inbox;
    }

    private static String resolveDisplayName(ContentResolver resolver, Uri source) {
        try (Cursor cursor = resolver.query(source, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.trim().isEmpty()) {
                        return name;
                    }
                }
            }
        } catch (RuntimeException ex) {
            Log.w(TAG, "Unable to read display name for " + source, ex);
        }

        String segment = source.getLastPathSegment();
        return segment == null || segment.trim().isEmpty() ? FALLBACK_FILE_NAME : segment;
    }

    private static String resolveMimeType(ContentResolver resolver, Uri source, String intentType) {
        String resolved = resolver.getType(source);
        if (resolved != null && !resolved.isEmpty() && !"*/*".equals(resolved)) {
            return resolved;
        }
        if (intentType != null && !intentType.isEmpty() && !"*/*".equals(intentType)) {
            return intentType;
        }
        String extension = MimeTypeMap.getFileExtensionFromUrl(source.toString());
        if (extension != null && !extension.isEmpty()) {
            String fromExtension = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
            if (fromExtension != null && !fromExtension.isEmpty()) {
                return fromExtension;
            }
        }
        return FALLBACK_MIME_TYPE;
    }

    /**
     * 与 lib/native-receive-storage.ts 的命名规则保持一致：只保留最后一段，
     * 去掉控制字符与文件系统保留字符，避免路径穿越与非法路径。
     */
    static String sanitizeFileName(String name) {
        String base = name;
        int separator = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        if (separator >= 0) {
            base = base.substring(separator + 1);
        }

        StringBuilder cleaned = new StringBuilder(base.length());
        for (int index = 0; index < base.length(); index++) {
            char current = base.charAt(index);
            if (current < 0x20 || current == 0x7F || "<>:\"|?*".indexOf(current) >= 0) {
                cleaned.append('_');
            } else {
                cleaned.append(current);
            }
        }

        String result = cleaned.toString();
        while (result.startsWith(".")) {
            result = result.substring(1);
        }
        result = result.trim();
        if (result.length() > MAX_FILE_NAME_LENGTH) {
            result = result.substring(0, MAX_FILE_NAME_LENGTH);
        }
        return result.isEmpty() ? FALLBACK_FILE_NAME : result;
    }

    private static File resolveAvailableFile(File directory, String rawName) {
        String fileName = sanitizeFileName(rawName);
        File candidate = new File(directory, fileName);
        if (!candidate.exists()) {
            return candidate;
        }

        int dotIndex = fileName.lastIndexOf('.');
        String stem = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        String extension = dotIndex > 0 ? fileName.substring(dotIndex) : "";

        for (int attempt = 1; attempt < 100; attempt++) {
            candidate = new File(directory, stem + " (" + attempt + ")" + extension);
            if (!candidate.exists()) {
                return candidate;
            }
        }

        return new File(directory, stem + " (" + System.currentTimeMillis() + ")" + extension);
    }

    private static JSObject merge(JSObject existing, JSObject incoming) {
        JSObject merged = new JSObject();
        JSArray items = new JSArray();

        appendAll(items, existing.optJSONArray("items"));
        appendAll(items, incoming.optJSONArray("items"));

        String existingText = existing.optString("text", "");
        String incomingText = incoming.optString("text", "");
        String text = existingText.isEmpty() || incomingText.isEmpty()
            ? existingText + incomingText
            : existingText + "\n" + incomingText;

        merged.put("items", items);
        merged.put("text", text);

        JSArray failed = new JSArray();
        appendAll(failed, existing.optJSONArray("failed"));
        appendAll(failed, incoming.optJSONArray("failed"));
        if (failed.length() > 0) {
            merged.put("failed", failed);
        }
        return merged;
    }

    private static void appendAll(JSArray target, JSONArray source) {
        if (source == null) {
            return;
        }
        for (int index = 0; index < source.length(); index++) {
            target.put(source.opt(index));
        }
    }

    private File pendingFile() {
        return new File(getContext().getFilesDir(), INBOX_DIRECTORY + "/" + PENDING_FILE);
    }

    private File consumedFingerprintFile() {
        return new File(getContext().getFilesDir(), INBOX_DIRECTORY + "/" + CONSUMED_FILE);
    }

    /**
     * 记录未消费的积压内容（含指纹），进程被杀后冷启动仍可交给 JS。
     * 文件名以点开头，导入文件名的清洗会去掉前导点，因此不会与用户文件重名。
     */
    private void writePendingFile(JSObject payload, List<String> fingerprints) {
        File file = pendingFile();
        try {
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                return;
            }
            JSObject entry = new JSObject();
            JSONArray items = payload.optJSONArray("items");
            entry.put("items", items == null ? new JSArray() : items);
            entry.put("text", payload.optString("text", ""));
            JSONArray failed = payload.optJSONArray("failed");
            if (failed != null && failed.length() > 0) {
                entry.put("failed", failed);
            }
            entry.put("fingerprints", new JSArray(new ArrayList<>(fingerprints)));
            try (OutputStream output = new FileOutputStream(file)) {
                output.write(entry.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException ex) {
            Log.w(TAG, "Unable to persist pending share", ex);
        }
    }

    private void deletePendingFile() {
        File file = pendingFile();
        if (file.exists() && !file.delete()) {
            Log.w(TAG, "Unable to remove pending share file");
        }
    }

    /** 冷启动兜底：内存中的积压丢失时（例如 Activity 重建）从磁盘恢复。 */
    private JSObject readPendingEntry() {
        File file = pendingFile();
        if (!file.isFile()) {
            return null;
        }
        try (InputStream input = new FileInputStream(file)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return new JSObject(buffer.toString(StandardCharsets.UTF_8.name()));
        } catch (IOException | JSONException ex) {
            Log.w(TAG, "Unable to read pending share", ex);
            return null;
        }
    }
}
