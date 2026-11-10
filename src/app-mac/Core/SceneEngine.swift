import Foundation
import JavaScriptCore

/// Reuses the exact TypeScript simulation and render plan, without a browser or network.
@MainActor
public final class SceneEngine {
    private let context: JSContext
    private let scene: JSValue
    public let assets: Assets

    public init(assets: Assets, seed: String = "seaside-v01") throws {
        self.assets = assets
        guard let context = JSContext() else { throw KujiraError.invalid("JavaScriptCoreを初期化できません。") }
        self.context = context
        context.evaluateScript(assets.coreSource)
        if let error = context.exception { throw KujiraError.invalid("共有コアの初期化に失敗しました：\(error.toString() ?? "unknown")") }
        guard let module = context.objectForKeyedSubscript("KujiraNative"), !module.isUndefined,
              let scene = module.invokeMethod("create", withArguments: [assets.configurationJSON, String(seed.prefix(128))]),
              context.exception == nil, !scene.isUndefined else { throw KujiraError.invalid("共通の世界を作成できません。") }
        self.scene = scene
    }

    private func string(_ method: String, _ arguments: [Any]) throws -> String {
        context.exception = nil
        guard let value = scene.invokeMethod(method, withArguments: arguments), context.exception == nil,
              !value.isUndefined, let text = value.toString() else {
            throw KujiraError.invalid("共有コアの実行に失敗しました：\(method)")
        }
        return text
    }
    public func snapshot(decorations: Bool = true, presentation: String = "preview") throws -> ScenePlan {
        try JSONDecoder().decode(ScenePlan.self, from: Data(string("gameSnapshotJSON", [decorations, presentation]).utf8))
    }
    public func advance(_ seconds: Double, decorations: Bool = true) throws -> ScenePlan {
        try JSONDecoder().decode(ScenePlan.self, from: Data(string("advanceGameJSON", [seconds, decorations, "preview"]).utf8))
    }
    public func command(_ name: String, value: Any? = nil) throws {
        var arguments: [Any] = [name]
        if let value { arguments.append(value) }
        _ = try string("commandJSON", arguments)
    }
    public func setManualFocus(_ focused: Bool) throws { _ = try string("focusJSON", [focused]) }
    public func setMovement(x: Double, y: Double) throws { _ = try string("movementJSON", [x, y]) }
    public func gameJSON() throws -> String { try string("gameJSON", []) }
    public func replayGameJSON(frames: Int, step: Double) throws -> String { try string("replayGameJSON", [frames, step]) }
    public func sceneryQuads() throws -> [Quad] { try JSONDecoder().decode([Quad].self, from: Data(string("sceneryJSON", []).utf8)) }
    public func viewport(width: Double, height: Double) throws -> Viewport {
        try JSONDecoder().decode(Viewport.self, from: Data(string("viewportJSON", [width, height]).utf8))
    }
    public func worldJSON() throws -> String { try string("worldJSON", []) }
    public func replayJSON(frames: Int, step: Double) throws -> String { try string("replayJSON", [frames, step]) }
}
