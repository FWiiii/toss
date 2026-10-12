import UIKit
import UniformTypeIdentifiers

/**
 系统分享接收扩展入口。

 职责只有两件：把分享进来的文本与文件写进 App Group 共享容器
 `share-inbox/<uuid>/`，然后立刻结束请求（不阻塞分享面板）。
 主 App 在下次启动/回到前台时导入这些内容，见 `ShareReceiverPlugin`。
 */
final class ShareViewController: UIViewController {

    private let completionLock = NSLock()
    private var didComplete = false
    /// 附件复制串行化，保证同名文件不会互相覆盖。
    private static let copyQueue = DispatchQueue(label: "app.toss.mobile.share-extension.copy")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleShare()
    }

    // MARK: - 收集分享内容

    private func handleShare() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        guard !items.isEmpty else {
            complete()
            return
        }

        guard let entry = ShareInbox.makeEntryDirectory() else {
            // App Group 不可用（缺少团队/描述文件或容器未开启）。
            NSLog("ShareExtension: 无法创建共享容器目录")
            complete()
            return
        }

        let group = DispatchGroup()
        var attachments: [[String: Any]] = []
        var texts: [String] = []
        let stateLock = NSLock()
        var remainingBytes = ShareInbox.maxTotalBytes

        for item in items {
            if let attributed = item.attributedContentText?.string, !attributed.isEmpty {
                stateLock.lock()
                texts.append(attributed)
                stateLock.unlock()
            }

            for provider in item.attachments ?? [] {
                group.enter()
                loadAttachment(provider, into: entry) { descriptor, text, consumed in
                    stateLock.lock()
                    if let descriptor, consumed <= remainingBytes {
                        remainingBytes -= consumed
                        attachments.append(descriptor)
                    }
                    if let text, !text.isEmpty {
                        texts.append(text)
                    }
                    stateLock.unlock()
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            // 同一个文本可能既在 attributedContentText 又作为附件出现，去重后拼接。
            var seen = Set<String>()
            let uniqueTexts = texts.filter { !$0.isEmpty && seen.insert($0).inserted }
            let manifest: [String: Any] = [
                "items": attachments,
                "text": uniqueTexts.joined(separator: "\n")
            ]

            do {
                let data = try JSONSerialization.data(withJSONObject: manifest, options: [])
                try ShareInbox.writeManifest(data, to: entry)
            } catch {
                NSLog("ShareExtension: 写入清单失败 \(error)")
                try? FileManager.default.removeItem(at: entry)
            }

            self?.complete()
        }
    }

    /**
     把一个附件写入共享容器。文件优先走 `loadFileRepresentation`（系统给出临时副本，
     大文件不会整份进内存），文本与 URL 走 `loadItem` 取字符串。
     */
    private func loadAttachment(
        _ provider: NSItemProvider,
        into entry: URL,
        completion: @escaping ([String: Any]?, String?, Int) -> Void
    ) {
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                guard let url = Self.fileURL(from: item) else {
                    completion(nil, nil, 0)
                    return
                }
                Self.copyIntoContainer(url, into: entry, completion: completion)
            }
            return
        }

        // 先处理文本与 URL，避免把纯文本附件当成 public.data 文件落盘。
        for typeIdentifier in [UTType.plainText.identifier, UTType.text.identifier, UTType.url.identifier]
        where provider.hasItemConformingToTypeIdentifier(typeIdentifier) {
            provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, _ in
                completion(nil, Self.string(from: item), 0)
            }
            return
        }

        for typeIdentifier in [UTType.image.identifier, UTType.movie.identifier, UTType.data.identifier]
        where provider.hasItemConformingToTypeIdentifier(typeIdentifier) {
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _ in
                guard let url else {
                    completion(nil, nil, 0)
                    return
                }
                Self.copyIntoContainer(url, into: entry, completion: completion)
            }
            return
        }

        completion(nil, nil, 0)
    }

    /// `loadItem` 可能给出 URL、NSURL、Data 或 String。
    private static func fileURL(from item: NSSecureCoding?) -> URL? {
        if let url = item as? URL {
            return url
        }
        if let url = item as? NSURL {
            return url as URL
        }
        if let data = item as? Data, let string = String(data: data, encoding: .utf8) {
            return URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        if let string = item as? String {
            return URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }

    private static func string(from item: NSSecureCoding?) -> String? {
        if let string = item as? String {
            return string
        }
        if let attributed = item as? NSAttributedString {
            return attributed.string
        }
        if let url = item as? URL {
            return url.absoluteString
        }
        if let url = item as? NSURL {
            return url.absoluteString
        }
        if let data = item as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    private static func copyIntoContainer(
        _ source: URL,
        into entry: URL,
        completion: @escaping ([String: Any]?, String?, Int) -> Void
    ) {
        // 多个附件可能并发回调；串行化后同名文件才能稳定地拿到不同名字。
        copyQueue.async {
            let fileName = ShareInbox.sanitizeFileName(source.lastPathComponent)
            let destination = ShareInbox.availableURL(in: entry, preferredName: fileName)

            do {
                try FileManager.default.copyItem(at: source, to: destination)
                let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.intValue ?? 0
                completion(
                    [
                        "name": destination.lastPathComponent,
                        "mimeType": ShareInbox.mimeType(for: source)
                    ],
                    nil,
                    size
                )
            } catch {
                NSLog("ShareExtension: 复制附件失败 \(error)")
                completion(nil, nil, 0)
            }
        }
    }

    private func complete() {
        completionLock.lock()
        let alreadyDone = didComplete
        didComplete = true
        completionLock.unlock()

        guard !alreadyDone else {
            return
        }
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
