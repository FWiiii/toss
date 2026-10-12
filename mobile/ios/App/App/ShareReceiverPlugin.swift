import Capacitor
import Foundation
import UIKit

/**
 原生分享接收（iOS Share Extension）。

 分享扩展把内容写入 App Group 共享容器 `share-inbox/<uuid>/`，本插件把它导入到
 App 私有目录 `Library/toss-inbox/`（对应 JS 侧 `Directory.Library` +
 `INBOX_DIRECTORY`），再把描述信息交给 JS。

 去重：导入成功后立即删除共享容器中的条目目录，且 `pending` 在投递时清空，
 因此同一份分享既不会被导入两次，也不会被投递两次。
 */
@objc(ShareReceiverPlugin)
public class ShareReceiverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareReceiverPlugin"
    public let jsName = "ShareReceiver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise)
    ]

    /// 与 Share Extension 及 App.entitlements 保持一致；必须由真实团队签名后生效。
    static let appGroupIdentifier = "group.app.toss.mobile"
    static let shareInboxDirectoryName = "share-inbox"
    /// 与 lib/native-storage-cleanup.ts 的 INBOX_DIRECTORY 保持一致。
    static let inboxDirectoryName = "toss-inbox"
    static let eventName = "incomingShare"
    static let manifestName = "manifest.json"

    private static let maxFileNameLength = 128
    private static let fallbackFileName = "received-file"
    private static let fallbackMimeType = "application/octet-stream"

    private let importQueue = DispatchQueue(label: "app.toss.mobile.share-receiver")
    private let stateLock = NSLock()
    /// 已导入但尚未交给 JS 的内容。
    private var pending: [String: Any]?
    /// 已导入过的共享条目名，避免崩溃窗口内重复导入同一份分享。
    private static let consumedLedgerKey = "app.toss.mobile.share-receiver.consumed"
    private static let consumedLedgerLimit = 200
    /// 清单缺失时，超过该时长的条目视为扩展留下的残骸。
    private static let staleEntryAge: TimeInterval = 60

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        // 冷启动：先把扩展留下的内容导入，JS 之后通过 getPendingShare 取走。
        importQueue.async { [weak self] in
            guard let self else { return }
            self.importSharedEntries()
            DispatchQueue.main.async { self.deliverIfPossible() }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func getPendingShare(_ call: CAPPluginCall) {
        importQueue.async { [weak self] in
            guard let self else {
                call.resolve()
                return
            }
            self.importSharedEntries()
            let payload = self.takePending()
            DispatchQueue.main.async {
                if let payload {
                    call.resolve(payload)
                } else {
                    call.resolve()
                }
            }
        }
    }

    @objc private func applicationDidBecomeActive() {
        // 热启动：扩展刚写入内容后 App 回到前台。
        importQueue.async { [weak self] in
            guard let self else { return }
            self.importSharedEntries()
            DispatchQueue.main.async { self.deliverIfPossible() }
        }
    }

    /// 有 JS 监听时立即投递；没有监听时保留，等待 getPendingShare。
    private func deliverIfPossible() {
        guard hasListeners(Self.eventName) else {
            return
        }
        guard let payload = takePending() else {
            return
        }
        notifyListeners(Self.eventName, data: payload)
    }

    private func takePending() -> [String: Any]? {
        stateLock.lock()
        defer { stateLock.unlock() }
        // 内存中的积压丢失时（进程被杀）从磁盘恢复，保证冷启动仍能交付。
        let payload = pending ?? readPendingFile()
        pending = nil
        removePendingFile()
        return payload
    }

    private func mergePending(_ payload: [String: Any]) {
        stateLock.lock()
        defer { stateLock.unlock() }

        let existing = pending ?? readPendingFile()
        let existingItems = existing?["items"] as? [[String: Any]] ?? []
        let existingText = existing?["text"] as? String ?? ""
        let incomingItems = payload["items"] as? [[String: Any]] ?? []
        let incomingText = payload["text"] as? String ?? ""

        let text: String
        if existingText.isEmpty || incomingText.isEmpty {
            text = existingText + incomingText
        } else {
            text = existingText + "\n" + incomingText
        }

        pending = ["items": existingItems + incomingItems, "text": text]
        if let pending {
            writePendingFile(pending)
        }
    }

    /// 未消费积压的落盘位置。文件名以点开头，而导入文件名的清洗会去掉前导点，
    /// 因此不会与用户分享进来的文件重名。
    private static let pendingFileName = ".pending-share.json"

    private func pendingFileURL() -> URL? {
        guard let library = try? FileManager.default.url(
            for: .libraryDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return nil
        }
        let inbox = library.appendingPathComponent(Self.inboxDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: inbox.path),
           (try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)) == nil {
            return nil
        }
        return inbox.appendingPathComponent(Self.pendingFileName)
    }

    private func writePendingFile(_ payload: [String: Any]) {
        guard let url = pendingFileURL(),
              let data = try? JSONSerialization.data(withJSONObject: payload) else {
            return
        }
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            CAPLog.print("⚡️ ShareReceiver: 写入积压失败 \(error)")
        }
    }

    private func readPendingFile() -> [String: Any]? {
        guard let url = pendingFileURL(),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return raw
    }

    private func removePendingFile() {
        guard let url = pendingFileURL() else {
            return
        }
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - 导入共享容器内容

    /// 扫描 App Group 共享容器，把每个条目导入 App 私有收件目录后删除条目。
    /// 必须在 importQueue 上调用。
    private func importSharedEntries() {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier
        ) else {
            // 未配置 App Group（缺少团队/描述文件）时无法交接内容。
            CAPLog.print("⚡️ ShareReceiver: App Group \(Self.appGroupIdentifier) 不可用，跳过导入")
            return
        }

        let shareInbox = container.appendingPathComponent(Self.shareInboxDirectoryName, isDirectory: true)
        guard let entries = try? FileManager.default.contentsOfDirectory(
            at: shareInbox,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        for entry in entries {
            let entryName = entry.lastPathComponent
            if isConsumed(entryName) {
                // 上一轮已导入过；条目目录残留时清掉，不重复投递。
                try? FileManager.default.removeItem(at: entry)
                continue
            }

            let manifest = entry.appendingPathComponent(Self.manifestName)
            guard let data = try? Data(contentsOf: manifest),
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                // 扩展可能仍在写入（无清单），只在明显过期时清理，避免与扩展竞态。
                if isStale(entry) {
                    try? FileManager.default.removeItem(at: entry)
                }
                continue
            }

            let payload = importEntry(entry, raw: raw)
            markConsumed(entryName)
            if let payload {
                mergePending(payload)
            }
            try? FileManager.default.removeItem(at: entry)
        }
    }

    private func isConsumed(_ entryName: String) -> Bool {
        consumedLedger().contains(entryName)
    }

    private func markConsumed(_ entryName: String) {
        var ledger = consumedLedger()
        ledger.removeAll { $0 == entryName }
        ledger.append(entryName)
        // 只保留最近的条目名，避免 UserDefaults 无界增长。
        let trimmed = Array(ledger.suffix(Self.consumedLedgerLimit))
        UserDefaults.standard.set(trimmed, forKey: Self.consumedLedgerKey)
    }

    private func consumedLedger() -> [String] {
        UserDefaults.standard.stringArray(forKey: Self.consumedLedgerKey) ?? []
    }

    private func isStale(_ entry: URL) -> Bool {
        let attributes = try? FileManager.default.attributesOfItem(atPath: entry.path)
        guard let modified = attributes?[.modificationDate] as? Date else {
            return false
        }
        return Date().timeIntervalSince(modified) > Self.staleEntryAge
    }

    private func importEntry(_ entry: URL, raw: [String: Any]) -> [String: Any]? {
        let text = (raw["text"] as? String) ?? ""
        let descriptors = (raw["items"] as? [[String: Any]]) ?? []
        var items: [[String: Any]] = []

        for descriptor in descriptors {
            guard let sourceName = descriptor["name"] as? String, !sourceName.isEmpty else {
                continue
            }
            let mimeType = (descriptor["mimeType"] as? String)?.nilIfEmpty ?? Self.fallbackMimeType
            let source = entry.appendingPathComponent(sourceName)
            guard FileManager.default.fileExists(atPath: source.path) else {
                continue
            }

            do {
                let destination = try copyIntoInbox(from: source, preferredName: sourceName)
                let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.intValue ?? 0
                items.append([
                    "mimeType": mimeType,
                    "name": destination.lastPathComponent,
                    "path": "\(Self.inboxDirectoryName)/\(destination.lastPathComponent)",
                    "uri": destination.absoluteString,
                    "size": size
                ])
            } catch {
                CAPLog.print("⚡️ ShareReceiver: 导入失败 \(sourceName): \(error)")
            }
        }

        if items.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return nil
        }
        return ["items": items, "text": text]
    }

    private func copyIntoInbox(from source: URL, preferredName: String) throws -> URL {
        let inbox = try ensureInboxDirectory()
        let destination = availableDestination(in: inbox, preferredName: preferredName)
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.copyItem(at: source, to: destination)
        return destination
    }

    private func ensureInboxDirectory() throws -> URL {
        let library = try FileManager.default.url(
            for: .libraryDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let inbox = library.appendingPathComponent(Self.inboxDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: inbox.path) {
            try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        }
        return inbox
    }

    /// 与 lib/native-receive-storage.ts 的命名规则保持一致：只保留最后一段，
    /// 去掉控制字符与文件系统保留字符，避免路径穿越与非法路径。
    static func sanitizeFileName(_ name: String) -> String {
        let base = name.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? ""
        var cleaned = ""
        for scalar in base.unicodeScalars {
            let value = scalar.value
            let isControl = value < 0x20 || value == 0x7F
            let isReserved = "<>:\"|?*".unicodeScalars.contains(scalar)
            cleaned.unicodeScalars.append(isControl || isReserved ? "_" : scalar)
        }

        while cleaned.hasPrefix(".") {
            cleaned.removeFirst()
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.count > Self.maxFileNameLength {
            cleaned = String(cleaned.prefix(Self.maxFileNameLength))
        }
        return cleaned.isEmpty ? Self.fallbackFileName : cleaned
    }

    private func availableDestination(in directory: URL, preferredName: String) -> URL {
        let fileName = Self.sanitizeFileName(preferredName)
        let candidate = directory.appendingPathComponent(fileName)
        if !FileManager.default.fileExists(atPath: candidate.path) {
            return candidate
        }

        let extensionPart = (fileName as NSString).pathExtension
        let stem = (fileName as NSString).deletingPathExtension
        let suffix = extensionPart.isEmpty ? "" : ".\(extensionPart)"

        for attempt in 1..<100 {
            let next = directory.appendingPathComponent("\(stem) (\(attempt))\(suffix)")
            if !FileManager.default.fileExists(atPath: next.path) {
                return next
            }
        }

        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        return directory.appendingPathComponent("\(stem) (\(stamp))\(suffix)")
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
