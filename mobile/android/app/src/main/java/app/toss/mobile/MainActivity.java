package app.toss.mobile;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.toss.mobile.share.ShareReceiverPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App 内置插件不在 npm 包列表里，必须在 Bridge 创建前注册。
        registerPlugin(ShareReceiverPlugin.class);

        // 进程被杀后系统会用原始分享 Intent 重建 Activity，此时内容已经导入过。
        // 在 Bridge 拿到该 Intent 之前打标记，插件据此跳过重放。
        Intent intent = getIntent();
        if (savedInstanceState != null && intent != null) {
            intent.putExtra(ShareReceiverPlugin.EXTRA_RESTORED_ACTIVITY, true);
        }

        super.onCreate(savedInstanceState);
    }
}
