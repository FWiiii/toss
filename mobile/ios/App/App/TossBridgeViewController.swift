import Capacitor

/**
 App 内置插件不在 npm 包列表里（`capacitor.config.json` 的 `packageClassList` 由
 Capacitor CLI 生成），因此必须在 bridge 就绪后手动注册。
 */
class TossBridgeViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShareReceiverPlugin())
    }
}
