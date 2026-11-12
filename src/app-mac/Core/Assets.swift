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
    public struct LifeSprite {
        public let atlas: LifeAtlas
        public let frames: [CGImage]
    }
    /// Additional local quiet-life art; nil retains the exact approved old16 sheet.
    public let lifeSprite: LifeSprite?
    /// An optional local-only original rival. Empty/nil selects code-only drawing.
    /// The singular fields mirror the legacy Lumie-only resources; the maps carry each
    /// rival independently so one invalid sheet cannot remove the other two.
    public let bossFrames: [CGImage]
    public let bossAtlas: BossAtlas?
    public let bossFramesByBoss: [String: [CGImage]]
    public let bossAtlasesByBoss: [String: BossAtlas]
    public let bossSources: [String: NativeBoss]
    public let variants: [BackgroundVariant]
    /// Optional painted terrace backdrop for the fixed manual arena. nil = code-drawn stage.
    public let arenaBackdrop: CGImage?
    public struct PoseSprite {
        public let atlas: PoseAtlas
        public let frames: [CGImage]
    }
    /// Every optional sheet has its own hash/decode/dimension recovery boundary.
    public let poseSprites: [String: PoseSprite]

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
        var loadedBossFramesByBoss: [String: [CGImage]] = [:]
        var loadedBossAtlasesByBoss: [String: BossAtlas] = [:]
        var loadedBossSources: [String: NativeBoss] = [:]
        // Read optional metadata independently from the main configuration decoder so a
        // malformed rival entry can never prevent the room/heroine from starting.
        let rawJSON = try JSONSerialization.jsonObject(with: configurationData) as? [String: Any]
        let rawLayout = rawJSON?["layout"] as? [String: Any] ?? [:]
        // Neither `life` nor `layout.lifeAtlas` participates in the required decoder.
        // Even null/primitive/malformed metadata must leave the original heroine usable.
        var loadedLife: LifeSprite? = nil
        if rawJSON?["life"] != nil || rawLayout["lifeAtlas"] != nil {
            do {
                guard let paths = rawJSON?["life"] as? [String: Any],
                      let sheetPath = paths["sheet"] as? String, let atlasPath = paths["atlas"] as? String,
                      let configured = rawLayout["lifeAtlas"] as? [String: Any] else {
                    throw KujiraError.invalid("オプション生活素材の設定が不正です。")
                }
                for path in [sheetPath, atlasPath] {
                    let matches = manifest.assets.filter { $0.path == path }
                    guard matches.count == 1, let record = matches.first,
                          Self.sha(try bytes(path)) == record.sha256,
                          !record.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                          !record.license.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        throw KujiraError.invalid("生活素材のハッシュ・出典を確認できません：\(path)")
                    }
                }
                let info = try JSONDecoder().decode(LifeAtlas.self, from: bytes(atlasPath))
                let expected = try JSONDecoder().decode(LifeAtlas.self, from: JSONSerialization.data(withJSONObject: configured))
                try info.validate()
                guard info == expected else { throw KujiraError.invalid("生活アトラスと設定が一致しません。") }
                let sheet = try image(sheetPath)
                guard sheet.width == info.frameWidth * info.columns, sheet.height == info.frameHeight * info.rows else {
                    throw KujiraError.invalid("生活シートの寸法がアトラスと一致しません。")
                }
                var extracted: [CGImage] = []
                for index in 0..<24 {
                    let rect = CGRect(x: index % info.columns * info.frameWidth, y: index / info.columns * info.frameHeight,
                                      width: info.frameWidth, height: info.frameHeight)
                    guard let frame = sheet.cropping(to: rect) else { throw KujiraError.invalid("生活演技を切り出せません。") }
                    extracted.append(frame)
                }
                loadedLife = LifeSprite(atlas: info, frames: extracted)
            } catch {
                NSLog("[kujira] Optional life sheet unavailable; using approved sixteen frames: %@", error.localizedDescription)
            }
        }
        self.lifeSprite = loadedLife
        let rawBosses = rawJSON?["bosses"] as? [String: Any] ?? [:]
        let rawBossAtlases = rawLayout["bossAtlases"] as? [String: Any] ?? [:]
        for id in rawBosses.keys.sorted() {
            do {
                guard let entry = rawBosses[id] as? [String: Any],
                      let sheetPath = entry["sheet"] as? String,
                      let atlasPath = entry["atlas"] as? String,
                      let configuredAtlas = rawBossAtlases[id] as? [String: Any] else {
                    throw KujiraError.invalid("ライバル素材の設定が不正です：\(id)")
                }
                for name in [sheetPath, atlasPath] {
                    let matches = manifest.assets.filter { $0.path == name }
                    guard matches.count == 1, let record = matches.first,
                          Self.sha(try bytes(name)) == record.sha256, !record.author.isEmpty, !record.license.isEmpty else {
                        throw KujiraError.invalid("ライバル素材のハッシュ・出典を確認できません：\(name)")
                    }
                }
                let info = try JSONDecoder().decode(BossAtlas.self, from: bytes(atlasPath))
                let expected = try JSONDecoder().decode(BossAtlas.self, from: JSONSerialization.data(withJSONObject: configuredAtlas))
                try info.validate()
                guard info == expected else { throw KujiraError.invalid("ライバルアトラスと設定が一致しません：\(id)") }
                let sheet = try image(sheetPath)
                guard sheet.width == info.frameWidth * info.columns, sheet.height == info.frameHeight * info.rows else {
                    throw KujiraError.invalid("ライバルシートの寸法がアトラスと一致しません：\(id)")
                }
                var extracted: [CGImage] = []
                for index in 0..<(info.columns * info.rows) {
                    let rect = CGRect(x: index % info.columns * info.frameWidth, y: index / info.columns * info.frameHeight,
                                      width: info.frameWidth, height: info.frameHeight)
                    guard let frame = sheet.cropping(to: rect) else { throw KujiraError.invalid("ライバル姿勢を切り出せません：\(id)") }
                    extracted.append(frame)
                }
                loadedBossAtlasesByBoss[id] = info
                loadedBossFramesByBoss[id] = extracted
                loadedBossSources[id] = NativeBoss(sheet: sheetPath, atlas: atlasPath)
            } catch {
                NSLog("[kujira] Optional rival %@ unavailable; using code-only fallback: %@", id, error.localizedDescription)
            }
        }
        // Legacy prepared resources carry a single `boss` plus layout.bossAtlas.
        // Keep that path valid without overwriting a map entry that already loaded.
        if loadedBossAtlasesByBoss["lumie"] == nil, let boss = configuration.boss, let info = configuration.layout.bossAtlas {
            do {
                try info.validate()
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
                loadedBossFramesByBoss["lumie"] = extracted
                loadedBossAtlasesByBoss["lumie"] = info
                loadedBossSources["lumie"] = boss
            } catch {
                NSLog("[kujira] Optional rival art unavailable; using code-only rival: %@", error.localizedDescription)
            }
        }
        // Optional painted arena backdrop: verified like the rival art, but a failure
        // only falls back to the code-drawn terrace. It never gates the room/heroine.
        var loadedArena: CGImage? = nil
        if let arena = configuration.arena {
            do {
                let matches = manifest.assets.filter { $0.path == arena.scene }
                guard matches.count == 1, let entry = matches.first,
                      Self.sha(try bytes(arena.scene)) == entry.sha256, !entry.author.isEmpty, !entry.license.isEmpty else {
                    throw KujiraError.invalid("アリーナ背景のハッシュ・出典を確認できません：\(arena.scene)")
                }
                let arenaImage = try image(arena.scene)
                guard arenaImage.width == 480, arenaImage.height == 270 else {
                    throw KujiraError.invalid("アリーナ背景の寸法が不正です：\(arena.scene)")
                }
                loadedArena = arenaImage
            } catch {
                NSLog("[kujira] Optional arena backdrop unavailable; using code-drawn terrace: %@", error.localizedDescription)
            }
        }
        var loadedSprites: [String: PoseSprite] = [:]
        let entries = rawJSON?["sprites"] as? [String: Any] ?? [:]
        for name in ["combat", "slime", "popup"] {
            guard let entry = entries[name] else { continue }
            do {
                guard let paths = entry as? [String: Any], let sheetPath = paths["sheet"] as? String,
                      let atlasPath = paths["atlas"] as? String, let configured = rawLayout[name + "Atlas"] as? [String: Any] else {
                    throw KujiraError.invalid("オプション戦闘素材の設定が不正です。")
                }
                for path in [sheetPath, atlasPath] {
                    let matches = manifest.assets.filter { $0.path == path }
                    guard matches.count == 1, let record = matches.first,
                          Self.sha(try bytes(path)) == record.sha256, !record.author.isEmpty, !record.license.isEmpty else {
                        throw KujiraError.invalid("オプション戦闘素材のハッシュ・出典が不正です。")
                    }
                }
                let info = try JSONDecoder().decode(PoseAtlas.self, from: bytes(atlasPath))
                let expected = try JSONDecoder().decode(PoseAtlas.self, from: JSONSerialization.data(withJSONObject: configured))
                try info.validate(sheet: name)
                guard info == expected else { throw KujiraError.invalid("戦闘アトラスと設定が一致しません。") }
                let sheet = try image(sheetPath)
                guard sheet.width == info.frameWidth * info.columns, sheet.height == info.frameHeight * info.rows else {
                    throw KujiraError.invalid("戦闘シートの寸法が不正です。")
                }
                var extracted: [CGImage] = []
                for i in 0..<(info.columns * info.rows) {
                    guard let frame = sheet.cropping(to: CGRect(x: i % info.columns * info.frameWidth, y: i / info.columns * info.frameHeight,
                                                              width: info.frameWidth, height: info.frameHeight)) else {
                        throw KujiraError.invalid("戦闘姿勢を切り出せません。")
                    }
                    extracted.append(frame)
                }
                loadedSprites[name] = PoseSprite(atlas: info, frames: extracted)
            } catch {
                NSLog("[kujira] Optional %@ sheet unavailable; using original drawing: %@", name, error.localizedDescription)
            }
        }
        self.poseSprites = loadedSprites
        self.arenaBackdrop = loadedArena
        self.bossFramesByBoss = loadedBossFramesByBoss
        self.bossAtlasesByBoss = loadedBossAtlasesByBoss
        self.bossSources = loadedBossSources
        self.bossFrames = loadedBossFramesByBoss["lumie"] ?? []
        self.bossAtlas = loadedBossAtlasesByBoss["lumie"]
        self.variants = loadedVariants
        self.frames = frames
    }

    public static func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
}
