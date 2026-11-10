import Foundation
import CoreGraphics
import ImageIO
import CryptoKit

@MainActor
public final class Assets {
    public let root: URL
    public let configuration: NativeConfiguration
    public let configurationJSON: String
    public let coreSource: String
    public let manifest: AssetManifest
    public let background: CGImage
    public let frames: [CGImage]

    public static func checkedURL(root: URL, relative: String) throws -> URL {
        guard root.isFileURL, !relative.hasPrefix("/"), !relative.contains("\\"), !relative.split(separator: "/").contains(".."), !relative.isEmpty else {
            throw KujiraError.invalid("素材パスが不正です。")
        }
        let base = root.resolvingSymlinksInPath().standardizedFileURL
        let url = base.appendingPathComponent(relative).resolvingSymlinksInPath().standardizedFileURL
        guard url.path.hasPrefix(base.path + "/") else { throw KujiraError.invalid("素材フォルダーの外は読み込めません。") }
        return url
    }

    public init(root: URL) throws {
        self.root = root.resolvingSymlinksInPath().standardizedFileURL
        func bytes(_ name: String) throws -> Data { try Data(contentsOf: Self.checkedURL(root: root, relative: name)) }
        let configurationData = try bytes("configuration.json")
        configuration = try JSONDecoder().decode(NativeConfiguration.self, from: configurationData)
        guard configuration.schemaVersion == 1, configuration.localPreviewOnly else { throw KujiraError.invalid("個人用ローカル試作の設定が必要です。") }
        try configuration.atlas.validate()
        guard configuration.layout.scene.width == 480, configuration.layout.scene.height == 270,
              configuration.layout.scene.floorY.isFinite, (0...270).contains(configuration.layout.scene.floorY) else { throw KujiraError.invalid("背景の安全領域が不正です。") }
        guard let json = String(data: configurationData, encoding: .utf8) else { throw KujiraError.invalid("設定がUTF-8ではありません。") }
        configurationJSON = json
        let coreData = try bytes("world.js")
        guard Self.sha(coreData) == configuration.coreSha256,
              let core = String(data: coreData, encoding: .utf8) else { throw KujiraError.invalid("共有コアの整合性を確認できません。") }
        coreSource = core
        manifest = try JSONDecoder().decode(AssetManifest.self, from: bytes("manifest.json"))
        let required = Set(["character/sheet.png", "character/atlas.json", "scene/seaside-room.png"])
        for name in required {
            let matches = manifest.assets.filter { $0.path == name }
            guard matches.count == 1, let entry = matches.first, Self.sha(try bytes(name)) == entry.sha256,
                  !entry.author.isEmpty, !entry.license.isEmpty else { throw KujiraError.invalid("素材のハッシュ・出典を確認できません：\(name)") }
        }
        let atlas = try JSONDecoder().decode(Atlas.self, from: bytes("character/atlas.json"))
        guard atlas == configuration.atlas else { throw KujiraError.invalid("アトラスとアプリ設定が一致しません。") }
        func image(_ name: String) throws -> CGImage {
            let data = try bytes(name)
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw KujiraError.invalid("画像を読み込めません：\(name)") }
            return image
        }
        let sheet = try image("character/sheet.png")
        background = try image("scene/seaside-room.png")
        guard sheet.width == atlas.frameWidth * atlas.columns, sheet.height == atlas.frameHeight * atlas.rows,
              background.width == 480, background.height == 270 else { throw KujiraError.invalid("画像の寸法がアトラスと一致しません。") }
        var frames: [CGImage] = []
        for index in 0..<16 {
            let rect = CGRect(x: index % atlas.columns * atlas.frameWidth, y: index / atlas.columns * atlas.frameHeight,
                              width: atlas.frameWidth, height: atlas.frameHeight)
            guard let frame = sheet.cropping(to: rect) else { throw KujiraError.invalid("フレームを切り出せません。") }
            frames.append(frame)
        }
        self.frames = frames
    }

    public static func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
}
