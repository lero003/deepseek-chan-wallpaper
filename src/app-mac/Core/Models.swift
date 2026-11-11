import Foundation

public enum KujiraError: Error, LocalizedError {
    case invalid(String)
    public var errorDescription: String? {
        switch self { case .invalid(let message): message }
    }
}

public struct Anchor: Codable, Equatable, Sendable { public let x: Double; public let y: Double }
public struct Animation: Codable, Equatable, Sendable {
    public let frames: [Int]
    public let frameDurationMs: Int
    public let frameDurationsMs: [Int]?
}
public struct Atlas: Codable, Equatable, Sendable {
    public let version: Int
    public let frameWidth: Int
    public let frameHeight: Int
    public let columns: Int
    public let rows: Int
    public let anchor: Anchor
    public let collisionHalfWidth: Double?
    public let animations: [String: Animation]
    public func validate() throws {
        guard version == 1, frameWidth > 0, frameHeight > 0, frameWidth <= 1024, frameHeight <= 1024,
              columns > 0, rows > 0, columns <= 16, rows <= 16, columns * rows == 16,
              anchor.x.isFinite, anchor.y.isFinite, anchor.x >= 0, anchor.x <= Double(frameWidth),
              anchor.y >= 0, anchor.y <= Double(frameHeight) else { throw KujiraError.invalid("アトラスの寸法・足元が不正です。") }
        if let half = collisionHalfWidth, !half.isFinite || half <= 0 || half > Double(frameWidth) { throw KujiraError.invalid("キャラクターの接触幅が不正です。") }
        var used = Set<Int>()
        for (state, count) in [("idle", 4), ("walk", 6), ("turn", 2), ("sleep", 4)] {
            guard let animation = animations[state], animation.frames.count == count, animation.frameDurationMs > 0,
                  animation.frameDurationMs <= 60000 else { throw KujiraError.invalid("アニメーション設定が不正です。") }
            if let times = animation.frameDurationsMs, times.count != count || times.contains(where: { $0 <= 0 || $0 > 60000 }) {
                throw KujiraError.invalid("フレーム別の表示時間が不正です。")
            }
            for frame in animation.frames {
                guard (0..<16).contains(frame), used.insert(frame).inserted else { throw KujiraError.invalid("フレームが欠落・重複しています。") }
            }
        }
    }
}

/// Independent 6–8 pose sheet. The approved heroine Atlas remains sixteen frames.
public struct BossAtlas: Codable, Equatable, Sendable {
    public let version: Int
    public let frameWidth: Int; public let frameHeight: Int; public let columns: Int; public let rows: Int
    public let anchor: Anchor
    public let poses: [String: Int]
    public func validate() throws {
        guard version == 1, (16...256).contains(frameWidth), (16...256).contains(frameHeight),
              (1...8).contains(columns), (1...8).contains(rows), (6...8).contains(columns * rows),
              anchor.x.isFinite, anchor.y.isFinite, anchor.x.rounded() == anchor.x, anchor.y.rounded() == anchor.y,
              (0...Double(frameWidth)).contains(anchor.x), (0...Double(frameHeight)).contains(anchor.y) else {
            throw KujiraError.invalid("オプションのライバルアトラスの寸法・足元が不正です。")
        }
        for pose in ["idle", "move", "windup", "strike", "cast", "recover", "hurt", "exit"] {
            guard let frame = poses[pose], (0..<(columns * rows)).contains(frame) else {
                throw KujiraError.invalid("オプションのライバル姿勢が不正です：\(pose)")
            }
        }
    }
}

public struct NativeBoss: Codable, Sendable { public let sheet: String; public let atlas: String }
/// Optional painted terrace backdrop for the fixed manual arena only (480×270).
public struct NativeArena: Codable, Sendable { public let scene: String }
public struct FloorInterval: Codable, Sendable { public let left: Double; public let right: Double }
public struct Scene: Codable, Sendable {
    public let width: Int; public let height: Int; public let floorY: Double
    public let actorHalfWidth: Double?
    public let obstacles: [FloorInterval]
}
public struct Water: Codable, Sendable { public let left: Double; public let right: Double; public let top: Double; public let bottom: Double }
/// Per-background ambient palette/episodes. Mirrors the shared AmbienceProfile; all optional.
public struct AmbienceProfile: Codable, Sendable {
    public let mood: String?
    public let waterColumn: Double?
    public let bird: Bool?
    public let rain: Bool?
    public let shootingStar: Bool?
    public let lampScale: Double?
}
/// The appearance subset a selectable background may override.
public struct VariantAppearance: Codable, Sendable {
    public let ceilingColor: String?
    public let floorColor: String?
    public let shadowColor: String?
    public let water: Water?
    public let ambience: AmbienceProfile?
}
/// The approved 480×270 room placed inside a wider/taller wallpaper canvas.
public struct Matte: Codable, Sendable, Hashable { public let width: Int; public let height: Int; public let roomX: Int; public let roomY: Int }
public struct Layout: Codable, Sendable {
    public let id: String; public let kind: String; public let label: String
    public let description: String; public let provenance: String
    public let scene: Scene
    public let ceilingColor: String?; public let floorColor: String?; public let shadowColor: String?
    public let water: Water?
    public let matte: Matte?
    public let bossAtlas: BossAtlas?
    public let ambience: AmbienceProfile?
}
public struct StageInfo: Codable, Sendable { public let width: Int }
public struct NativeVariant: Codable, Sendable {
    public let id: String; public let label: String
    public let scene: String; public let matte: String?
    public let appearance: VariantAppearance?
}
public struct NativeConfiguration: Codable, Sendable {
    public let schemaVersion: Int
    public let localPreviewOnly: Bool
    public let coreSha256: String
    public let atlas: Atlas
    public let layout: Layout
    public let stage: StageInfo?
    public let variants: [NativeVariant]?
    public let boss: NativeBoss?
    public let arena: NativeArena?
    public var stageWidth: Int { max(1440, stage?.width ?? 1440) }
}
public struct Permission: Decodable, Sendable {
    public let status: String
    public let webPublication: Bool
    public let sourceRedistribution: Bool
    public let macAppBundling: Bool
}
public struct AssetCredit: Decodable, Sendable {
    public let id: String; public let path: String; public let name: String
    public let dimensions: String; public let author: String; public let license: String; public let sha256: String
    public let permission: Permission
}
public struct AssetManifest: Decodable, Sendable { public let assets: [AssetCredit]; public let note: String }

public struct Quad: Codable, Sendable, Equatable {
    public let x: Double; public let y: Double; public let width: Double; public let height: Double
    public let color: String; public let alpha: Double
}
public struct GameStats: Codable, Sendable {
    public let episodes: Int; public let wins: Int; public let losses: Int
    public let hits: Int; public let misses: Int; public let dodges: Int; public let specials: Int; public let damageTaken: Int
    public let recoveries: Int; public let maxEnemies: Int; public let maxProjectiles: Int; public let maxEffects: Int; public let sections: Int
}
public struct ArcadeUI: Codable, Sendable {
    public let score: Int; public let secondsLeft: Int; public let multiplier: Int
    public let bestCombo: Int; public let continues: Int; public let lastRoundBonus: Int
    public let perfect: Bool; public let timedOut: Bool; public let rank: String
}
public struct GameUI: Codable, Sendable {
    public let mode: String; public let phase: String; public let phaseLabel: String; public let paused: Bool; public let focused: Bool
    public let hp: Int; public let gauge: Int; public let combo: Int; public let dodgeReady: Bool; public let specialReady: Bool
    public let outcome: String; public let message: String; public let frequency: String; public let effectsLow: Bool
    public let enemies: Int; public let bossHP: Int
    public let route: String; public let round: Int; public let rounds: Int; public let roundLabel: String
    public let elapsedSeconds: Double; public let runStats: GameStats; public let arcade: ArcadeUI
    public var manual: Bool { mode == "manual" }
}
public struct DrawCommand: Codable, Sendable {
    public let kind: String; public let x: Double; public let y: Double; public let alpha: Double
    public let width: Double?; public let height: Double?; public let color: String?; public let rotation: Double?
    public let frame: Int?; public let facing: Int?; public let scaleX: Double?; public let scaleY: Double?
    /// Nil selects the unchanged heroine sheet; boss has a camera-relative code fallback.
    public let sheet: String?; public let fallback: [DrawCommand]?
    public let text: String?; public let size: Double?
}
public struct BattleFrame: Codable, Sendable {
    public let cameraX: Double; public let commands: [DrawCommand]
    /// Short wallpaper incident inside the study: keep the room backdrop, no scrolling stage.
    public let room: Bool?
    /// Fixed manual terrace arena: paint the local backdrop when available, else the code stage.
    public let arena: Bool?
}
public struct ScenePlan: Codable, Sendable {
    public let tick: Int; public let state: String; public let x: Double; public let floorY: Double
    public let facing: Int; public let frame: Int; public let quads: [Quad]
    public let game: GameUI?; public let battle: BattleFrame?; public let overlay: [DrawCommand]?
}
public struct Viewport: Codable, Hashable, Sendable {
    public let width: Int; public let height: Int; public let originX: Int; public let originY: Int
    public let scale: Double; public let pixelWidth: Int; public let pixelHeight: Int
    public let offsetX: Int; public let offsetY: Int
}
