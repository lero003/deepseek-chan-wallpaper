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
    /// Optional wide/tall wallpaper backdrop containing the room at its approved offset.
    public let matte: CGImage?
    public let frames: [CGImage]
    /// An optional local-only original rival. Empty/nil selects code-only drawing.
    public let bossFrames: [CGImage]
    public let bossAtlas: BossAtlas?
    public let variants: [BackgroundVariant]

    public struct BackgroundVariant: Sendable {
        public let id: String
        public let label: String
        public let background: CGImage
        public let matte: CGImage?
    }

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
        var required = Set(["character/sheet.png", "character/atlas.json", "scene/seaside-room.png"])
        if configuration.layout.matte != nil { required.insert("scene/seaside-room-matte.png") }
        for variant in configuration.variants ?? [] {
            required.insert(variant.scene)
            if let matte = variant.matte, configuration.layout.matte != nil { required.insert(matte) }
        }
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
        if let info = configuration.layout.matte {
            let wide = try image("scene/seaside-room-matte.png")
            guard wide.width == info.width, wide.height == info.height,
                  info.roomX >= 0, info.roomY >= 0, info.roomX + 480 <= info.width, info.roomY + 270 <= info.height else {
                throw KujiraError.invalid("ワイド背景の寸法・部屋の位置が不正です。")
            }
            matte = wide
        } else { matte = nil }
        guard sheet.width == atlas.frameWidth * atlas.columns, sheet.height == atlas.frameHeight * atlas.rows,
              background.width == 480, background.height == 270 else { throw KujiraError.invalid("画像の寸法がアトラスと一致しません。") }
        var frames: [CGImage] = []
        for index in 0..<16 {
            let rect = CGRect(x: index % atlas.columns * atlas.frameWidth, y: index / atlas.columns * atlas.frameHeight,
                              width: atlas.frameWidth, height: atlas.frameHeight)
            guard let frame = sheet.cropping(to: rect) else { throw KujiraError.invalid("フレームを切り出せません。") }
            frames.append(frame)
        }
        var loadedVariants: [BackgroundVariant] = []
        var seenIDs = Set<String>()
        for variant in configuration.variants ?? [] {
            guard !variant.id.isEmpty, !variant.label.isEmpty, seenIDs.insert(variant.id).inserted else {
                throw KujiraError.invalid("背景バリアントのID・ラベルが不正か重複しています。")
            }
            let variantBackground = try image(variant.scene)
            guard variantBackground.width == 480, variantBackground.height == 270 else {
                throw KujiraError.invalid("背景バリアントの寸法が不正です：\(variant.scene)")
            }
            var variantMatte: CGImage? = nil
            if let info = configuration.layout.matte {
                guard let path = variant.matte else { throw KujiraError.invalid("背景バリアントのワイドマットがありません：\(variant.id)") }
                let wide = try image(path)
                guard wide.width == info.width, wide.height == info.height else {
                    throw KujiraError.invalid("背景バリアントのマット寸法が不正です：\(path)")
                }
                variantMatte = wide
            }
            loadedVariants.append(BackgroundVariant(id: variant.id, label: variant.label,
                                                    background: variantBackground, matte: variantMatte))
        }
        var loadedBossFrames: [CGImage] = []
        var loadedBossAtlas: BossAtlas? = nil
        if let boss = configuration.boss, let info = configuration.layout.bossAtlas {
            do {
                try info.validate()
                // Optional must not mean unverified: keep the same manifest/hash gate.
                for name in [boss.sheet, boss.atlas] {
                    let matches = manifest.assets.filter { $0.path == name }
                    guard matches.count == 1, let entry = matches.first,
                          Self.sha(try bytes(name)) == entry.sha256, !entry.author.isEmpty, !entry.license.isEmpty else {
                        throw KujiraError.invalid("ライバル素材のハッシュ・出典を確認できません：\(name)")
                    }
                }
                let localAtlas = try JSONDecoder().decode(BossAtlas.self, from: bytes(boss.atlas))
                try localAtlas.validate()
                guard localAtlas == info else { throw KujiraError.invalid("ライバルアトラスと設定が一致しません。") }
                let bossSheet = try image(boss.sheet)
                guard bossSheet.width == info.frameWidth * info.columns, bossSheet.height == info.frameHeight * info.rows else {
                    throw KujiraError.invalid("ライバルシートの寸法がアトラスと一致しません。")
                }
                var extracted: [CGImage] = []
                for index in 0..<(info.columns * info.rows) {
                    let rect = CGRect(x: index % info.columns * info.frameWidth, y: index / info.columns * info.frameHeight,
                                      width: info.frameWidth, height: info.frameHeight)
                    guard let frame = bossSheet.cropping(to: rect) else { throw KujiraError.invalid("ライバル姿勢を切り出せません。") }
                    extracted.append(frame)
                }
                loadedBossFrames = extracted
                loadedBossAtlas = info
            } catch {
                // The prepared configuration still supplies fallback commands to both painters.
                // Missing or corrupt optional art cannot make the approved room/hero unavailable.
                NSLog("[kujira] Optional rival art unavailable; using code-only rival: %@", error.localizedDescription)
            }
        }
        self.bossFrames = loadedBossFrames
        self.bossAtlas = loadedBossAtlas
        self.variants = loadedVariants
        self.frames = frames
    }

    public static func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
}
