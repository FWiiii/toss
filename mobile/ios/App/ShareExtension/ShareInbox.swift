import Foundation
import UniformTypeIdentifiers

/**
 分享扩展与主 App 之间的共享容器约定。

 扩展把内容写进 App Group 的 `share-inbox/<uuid>/`：
 - `manifest.json`：`{ "items": [{ "name": "shared-0.png", "mimeType": "image/png" }], "text": "…" }`
 - 同目录下的文件副本。

 主 App 的 `ShareReceiverPlugin` 读取该目录、导入到私有收件目录后删除条目目录，
 因此这里不做任何投递逻辑，只负责落盘。
 */
enum ShareInbox {
    /// 必须与主 App 的 App Group 一致（App.entitlements / ShareExtension.entitlements）。
    static let appGroupIdentifier = "group.app.toss.mobile"
    static let directoryName = "share-inbox"
    static let manifestName = "manifest.json"

    /// 扩展单次分享允许写入的最大字节数；超出部分跳过，避免共享容器被占满。
    static let maxTotalBytes = 512 * 1024 * 1024

    static func containerURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
    }

    static func makeEntryDirectory() -> URL? {
        guard let container = containerURL() else {
            return nil
        }
        let entry = container
            .appendingPathComponent(directoryName, isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: entry, withIntermediateDirectories: true)
            return entry
        } catch {
            return nil
        }
    }

    /// 与主 App `ShareReceiverPlugin.sanitizeFileName` 保持一致的清洗规则。
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
        if cleaned.count > 128 {
            cleaned = String(cleaned.prefix(128))
        }
        return cleaned.isEmpty ? "shared-file" : cleaned
    }

    static func mimeType(for url: URL) -> String {
        if let type = UTType(filenameExtension: url.pathExtension), let mime = type.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }

    /// 原子写入：主 App 只会在清单完整落盘后才导入该条目（清单即提交标记）。
    static func writeManifest(_ data: Data, to entry: URL) throws {
        try data.write(to: entry.appendingPathComponent(manifestName), options: .atomic)
    }

    /// 与主 App `ShareReceiverPlugin.availableDestination` 一致的避让规则。
    static func availableURL(in directory: URL, preferredName: String) -> URL {
        let candidate = directory.appendingPathComponent(preferredName)
        if !FileManager.default.fileExists(atPath: candidate.path) {
            return candidate
        }

        let extensionPart = (preferredName as NSString).pathExtension
        let stem = (preferredName as NSString).deletingPathExtension
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
