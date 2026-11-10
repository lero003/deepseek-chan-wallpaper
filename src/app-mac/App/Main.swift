import AppKit
import KujiraCore

private struct BotHero: Decodable { let x: Double; let y: Double; let gauge: Int; let state: String }
private struct BotEnemy: Decodable { let x: Double; let y: Double; let hp: Int; let state: String }
private struct BotState: Decodable { let hero: BotHero; let enemies: [BotEnemy] }

@main
struct KujiraMain {
    @MainActor static func main() {
        do { try run() }
        catch { fputs("KujiraWallpaper: \(error.localizedDescription)\n", stderr); exit(1) }
    }
    @MainActor private static func run() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        func value(_ flag: String) throws -> String? {
            guard let index = arguments.firstIndex(of: flag) else { return nil }
            guard index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--") else { throw KujiraError.invalid("引数が不足しています：\(flag)") }
            return arguments[index + 1]
        }
        func dimensions() throws -> (Int, Int) {
            let width = Int(try value("--width") ?? "1440") ?? 1440
            let height = Int(try value("--height") ?? "810") ?? 810
            guard (1...8192).contains(width), (1...8192).contains(height) else { throw KujiraError.invalid("書き出し寸法が不正です。") }
            return (width, height)
        }
        func advanceExact(_ seconds: Double) throws {
            var remaining = max(0, seconds)
            while remaining > 0 {
                let step = min(0.25, remaining)
                _ = try engine.advance(step)
                remaining -= step
            }
        }
        let root: URL
        if let path = try value("--resources") { root = URL(fileURLWithPath: path, isDirectory: true) }
        else if let url = Bundle.main.resourceURL { root = url }
        else { throw KujiraError.invalid("同梱素材が見つかりません。アプリ全体を展開してください。") }
        let assets = try Assets(root: root)
        let engine = try SceneEngine(assets: assets)
        let painter = ScenePainter(engine: engine)
        if arguments.contains("--self-test") {
            let before = try engine.snapshot()
            _ = try engine.replayJSON(frames: 300, step: 1.0 / 30)
            let after = try engine.snapshot()
            let bitmap = try painter.bitmap(after, width: 480, height: 270)
            guard before.tick == 0, after.tick == 600, bitmap.width == 480, assets.frames.count == 16 else { throw KujiraError.invalid("起動時の整合性確認に失敗しました。") }
            print("NATIVE_SELF_TEST_PASS: profile=\(assets.configuration.layout.id), frames=16, tick=\(after.tick), offline=true, wallpaperChanged=false")
            return
        }
        if arguments.contains("--fighters-self-test") {
            try engine.command("demo")
            _ = try engine.replayGameJSON(frames: 120 * 60, step: 1.0 / 60)
            guard try engine.snapshot().game?.phase == "rest" else { throw KujiraError.invalid("オート事件が書斎へ帰還しませんでした。") }
            try engine.command("play"); try engine.setManualFocus(true)
            for _ in 0..<3 { try engine.command("attack") }
            _ = try engine.replayGameJSON(frames: 90, step: 1.0 / 60)
            let manual = try engine.snapshot()
            guard manual.game?.manual == true, manual.battle != nil,
                  try engine.snapshot(presentation: "wallpaper").battle == nil else { throw KujiraError.invalid("手動と壁紙の分離を確認できません。") }
            _ = try painter.bitmap(manual, width: 960, height: 540)
            try engine.setManualFocus(false); try engine.command("home")
            _ = try engine.replayGameJSON(frames: 310, step: 1.0 / 60)
            guard try engine.snapshot().game?.phase == "rest" else { throw KujiraError.invalid("手動から書斎へ帰還しませんでした。") }
            print("NATIVE_FIGHTERS_SELF_TEST_PASS: auto event/home, manual commands, battle renderer, passive wallpaper, return. Not GUI keyboard acceptance.")
            return
        }
        if let output = try value("--render-manual") {
            let seconds = Double(try value("--time") ?? "8") ?? 8
            guard seconds.isFinite, seconds >= 0, seconds <= 180 else { throw KujiraError.invalid("手動書き出し時間が不正です。") }
            try engine.command("play"); try engine.setManualFocus(true)
            let steps = Int(seconds * 60)
            let captureWave = arguments.contains("--capture-wave")
            let captureBoss = arguments.contains("--capture-boss")
            for step in 0..<steps {
                if step % 6 == 0 {
                    let state = try JSONDecoder().decode(BotState.self, from: Data(engine.gameJSON().utf8))
                    if let target = state.enemies.filter({ $0.hp > 0 }).min(by: { hypot($0.x - state.hero.x, ($0.y - state.hero.y) * 3) < hypot($1.x - state.hero.x, ($1.y - state.hero.y) * 3) }) {
                        let dx = target.x - state.hero.x, dy = target.y - state.hero.y
                        try engine.setMovement(x: abs(dx) > 34 ? (dx < 0 ? -1 : 1) : 0, y: abs(dy) > 6 ? (dy < 0 ? -1 : 1) : 0)
                        if abs(dx) < 62 && abs(dy) < 16 { try engine.command("attack") }
                        if state.hero.gauge >= 100 { try engine.command("special") }
                        if target.state == "windup", abs(dx) < 62 { try engine.command("dodge") }
                    } else {
                        // Walk toward the next encounter like a player would.
                        try engine.setMovement(x: 1, y: 0)
                    }
                }
                _ = try engine.advance(1.0 / 60)
                // QA capture: stop on the first frame of the overdrive effect or the boss phase.
                if captureBoss, step % 6 == 0, try engine.gameJSON().contains("\"phase\":\"boss\"") {
                    try engine.setMovement(x: 0, y: 0)
                    let plan = try engine.snapshot()
                    let (captureWidth, captureHeight) = try dimensions()
                    try ScenePainter.writePNG(painter.bitmap(plan, width: captureWidth, height: captureHeight), to: URL(fileURLWithPath: output))
                    print("NATIVE_MANUAL_RENDER_PASS: captured=boss at \(String(format: "%.2f", Double(step + 1) / 60))s. Native renderer export, not a desktop screenshot.")
                    return
                }
                if captureWave, step % 2 == 0, try engine.gameJSON().contains("\"kind\":\"wave\"") {
                    try engine.setMovement(x: 0, y: 0)
                    let plan = try engine.snapshot()
                    let (captureWidth, captureHeight) = try dimensions()
                    try ScenePainter.writePNG(painter.bitmap(plan, width: captureWidth, height: captureHeight), to: URL(fileURLWithPath: output))
                    print("NATIVE_MANUAL_RENDER_PASS: captured=wave at \(String(format: "%.2f", Double(step + 1) / 60))s. Native renderer export, not a desktop screenshot.")
                    return
                }
            }
            try engine.setMovement(x: 0, y: 0)
            let plan = try engine.snapshot()
            let (captureWidth, captureHeight) = try dimensions()
            try ScenePainter.writePNG(painter.bitmap(plan, width: captureWidth, height: captureHeight), to: URL(fileURLWithPath: output))
            print("NATIVE_MANUAL_RENDER_PASS: phase=\(plan.game?.phase ?? "unknown"), commands=\(plan.battle?.commands.count ?? 0). Native renderer export, not a desktop screenshot.")
            return
        }
        if let output = try value("--render-game") {
            let seconds = Double(try value("--time") ?? "12") ?? 12
            guard seconds.isFinite, seconds >= 0, seconds <= 180 else { throw KujiraError.invalid("ゲーム書き出し時間が不正です。") }
            try engine.command("demo")
            _ = try engine.replayGameJSON(frames: Int(seconds * 60), step: 1.0 / 60)
            let plan = try engine.snapshot()
            let (captureWidth, captureHeight) = try dimensions()
            try ScenePainter.writePNG(painter.bitmap(plan, width: captureWidth, height: captureHeight), to: URL(fileURLWithPath: output))
            print("NATIVE_GAME_RENDER_PASS: phase=\(plan.game?.phase ?? "unknown"). Native renderer export, not a desktop screenshot.")
            return
        }
        if let output = try value("--render-room-event") {
            let seconds = Double(try value("--time") ?? "6") ?? 6
            guard seconds.isFinite, seconds >= 0, seconds <= 120 else { throw KujiraError.invalid("小事件の書き出し時間が不正です。") }
            // Wait for the first automatic in-room incident, then advance into its battle.
            var waited = 0.0
            while waited < 400 {
                let plan = try engine.snapshot()
                if plan.game?.phase != "rest" { break }
                try advanceExact(1.0)
                waited += 1.0
            }
            try advanceExact(seconds)
            let plan = try engine.snapshot()
            let (captureWidth, captureHeight) = try dimensions()
            try ScenePainter.writePNG(painter.bitmap(plan, width: captureWidth, height: captureHeight), to: URL(fileURLWithPath: output))
            print("NATIVE_ROOM_EVENT_RENDER_PASS: phase=\(plan.game?.phase ?? "unknown"), room=\(plan.battle?.room ?? false), waited=\(String(format: "%.0f", waited))s. Native renderer export, not a desktop screenshot.")
            return
        }
        if let output = try value("--render-preview") {
            let seconds = Double(try value("--time") ?? "6") ?? 6
            guard seconds.isFinite, seconds >= 0, seconds <= 1800 else { throw KujiraError.invalid("書き出し時間が不正です。") }
            _ = try engine.replayJSON(frames: Int(seconds * 60), step: 1.0 / 60)
            let plan = try engine.snapshot()
            let (captureWidth, captureHeight) = try dimensions()
            let image = try painter.bitmap(plan, width: captureWidth, height: captureHeight)
            try ScenePainter.writePNG(image, to: URL(fileURLWithPath: output))
            print("NATIVE_RENDER_PASS: state=\(plan.state), frame=\(plan.frame), tick=\(plan.tick). Native renderer export, not a desktop screenshot.")
            return
        }
        if let directory = try value("--make-icons") {
            let root = URL(fileURLWithPath: directory, isDirectory: true)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            for (name, size) in [("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
                                 ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
                                 ("icon_512x512", 512), ("icon_512x512@2x", 1024)] {
                try ScenePainter.writePNG(painter.makeIcon(size: size), to: root.appendingPathComponent(name + ".png"))
            }
            print("NATIVE_ICON_PASS")
            return
        }
        let smoke = arguments.contains("--smoke-test")
        let app = NSApplication.shared
        app.setActivationPolicy(smoke ? .accessory : .regular)
        let delegate = AppDelegate(assets: assets, smokeTest: smoke)
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
        exit(delegate.exitCode)
    }
}
