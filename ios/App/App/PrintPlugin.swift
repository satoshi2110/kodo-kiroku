import UIKit
import Capacitor

/// アプリの中の画面（WKWebView）では window.print() が開かないので、
/// iPhone の印刷の画面を開く小さな部品。PDF レポート（仕様書 6.12）から呼ぶ。
/// 印刷の画面の共有ボタンから「ファイルに保存」で PDF にできる。
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func print(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "行動記録"
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                call.reject("画面が見つかりません")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = name
            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, _, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve()
                }
            }
        }
    }
}

/// 上の部品をアプリに登録するための画面（Main.storyboard から使う）
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PrintPlugin())
    }
}
