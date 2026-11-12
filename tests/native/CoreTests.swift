import Foundation
import CoreGraphics
import Testing
@testable import KujiraCore

@MainActor
struct CoreTests {
    func assets() throws -> Assets {
        let path = try #require(ProcessInfo.processInfo.environment["KUJIRA_TEST_RESOURCES"])
        return try Assets(root: URL(fileURLWithPath: path, isDirectory: true))
    }
    private func pixel(_ image: CGImage, x: Int, y: Int) throws -> (Int, Int, Int) {
        let provider = try #require(image.dataProvider)
        let data = try #require(provider.data) as Data
        let offset = y * image.bytesPerRow + x * 4
        guard offset >= 0, offset + 3 < data.count else { throw KujiraError.invalid("ピクセル位置が範囲外です。") }
        return (Int(data[offset]), Int(data[offset + 1]), Int(data[offset + 2]))
    }
    private func rgb(_ hex: String) throws -> (Int, Int, Int) {
        guard hex.count == 7, hex.first == "#", let value = Int(hex.dropFirst(), radix: 16) else {
            throw KujiraError.invalid("描画色が不正です。")
        }
        return (Int((value >> 16) & 255), Int((value >> 8) & 255), Int(value & 255))
    }

    @Test func packagedAssetsAndInitialWorld() throws {
        let assets = try assets()
        let engine = try SceneEngine(assets: assets)
        let frame = try engine.snapshot()
        #expect(frame.tick == 0)
        #expect(frame.state == "idle")
        #expect(frame.frame == 0)
        #expect(assets.frames.count == 16)
        #expect(assets.background.width == 480)
        #expect(assets.background.height == 270)
        if let info = assets.configuration.layout.matte {
            let matte = try #require(assets.matte)
            #expect(matte.width == info.width)
            #expect(matte.height == info.height)
            #expect(info.roomX + 480 <= info.width)
            #expect(info.roomY + 270 <= info.height)
        } else {
            #expect(assets.matte == nil)
        }
        for variant in assets.variants {
            #expect(!variant.id.isEmpty)
            #expect(!variant.label.isEmpty)
            #expect(variant.background.width == 480)
            #expect(variant.background.height == 270)
            if let info = assets.configuration.layout.matte {
                let wide = try #require(variant.matte)
                #expect(wide.width == info.width)
                #expect(wide.height == info.height)
            }
        }
        #expect(frame.quads.count >= 14)
    }
    @Test func thirtyMinuteJavaScriptCoreReplayMatchesTheWebEngine() throws {
        let assets = try assets()
        let data = try Data(contentsOf: assets.root.appendingPathComponent("test-fixtures.json"))
        let fixture = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let cases = try #require(fixture["replays"] as? [[String: Any]])
        for replay in cases {
            let fps = try #require(replay["fps"] as? Int)
            let expected = try #require(replay["world"] as? NSDictionary)
            let engine = try SceneEngine(assets: assets)
            let json = try engine.replayJSON(frames: 1800 * fps, step: 1 / Double(fps))
            let actual = try #require(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? NSDictionary)
            #expect(actual.isEqual(expected), "The same seed and thirty minutes must match V8 at 15/30/60fps.")
        }
    }
    @Test func worldUsesRealSharedFixedTicks() throws {
        let engine = try SceneEngine(assets: assets())
        let initial = try engine.snapshot()
        let advanced = try engine.advance(1.0 / 30)
        #expect(initial.tick == 0)
        #expect(advanced.tick == 2)
        let still = try engine.snapshot(decorations: false)
        #expect(still.tick == advanced.tick)
        #expect(still.quads.count == 2)
    }
    @Test(arguments: [(1920.0, 1080.0), (1440.0, 900.0), (3440.0, 1440.0), (390.0, 844.0)])
    func logicalSafeArea(size: (Double, Double)) throws {
        let engine = try SceneEngine(assets: assets())
        let viewport = try engine.viewport(width: size.0, height: size.1)
        #expect(viewport.originX >= 0)
        #expect(viewport.originY >= 0)
        #expect(viewport.originX + 480 <= viewport.width)
        #expect(viewport.originY + 270 <= viewport.height)
        #expect(viewport.pixelWidth == Int(size.0.rounded()))
        #expect(viewport.pixelHeight == Int(size.1.rounded()))
        if viewport.scale >= 2 { #expect(viewport.scale == viewport.scale.rounded()) }
    }
    @Test func processFootprintIsReadable() throws {
        let bytes = try #require(ProcessMemory.footprintBytes())
        #expect(bytes > 0)
        #expect(ProcessMemory.megabytes(bytes) != "0.0")
    }
    @Test func selectableBackgroundsRenderAndValidate() throws {
        let assets = try assets()
        let engine = try SceneEngine(assets: assets)
        let painter = ScenePainter(engine: engine)
        let plan = try engine.snapshot()
        let base = try painter.bitmap(plan, width: 480, height: 270)
        #expect(painter.currentVariantID == "sunset")
        if let first = assets.variants.first {
            try painter.selectVariant(1)
            #expect(painter.currentVariantID == first.id)
            let alternate = try painter.bitmap(plan, width: 480, height: 270)
            #expect(base.width == alternate.width && base.height == alternate.height)
            let baseBytes = base.dataProvider?.data as Data?
            let alternateBytes = alternate.dataProvider?.data as Data?
            #expect(baseBytes != alternateBytes, "a selectable background must change the rendered room")
        }
        #expect(throws: KujiraError.self) { try painter.selectVariant(assets.variants.count + 1) }
    }
    @Test func backgroundSelectionFollowsAmbientMoodAndPalette() throws {
        let assets = try assets()
        let engine = try SceneEngine(assets: assets)
        let painter = ScenePainter(engine: engine)
        #expect(try engine.worldJSON().contains("\"mood\":\"sunset\""), "the default life rhythm is sunset")
        let sunsetQuads = try engine.snapshot().quads
        for (index, variant) in (assets.configuration.variants ?? []).enumerated() {
            try painter.selectVariant(index + 1)
            let mood = variant.appearance?.ambience?.mood ?? "sunset"
            #expect(try engine.worldJSON().contains("\"mood\":\"\(mood)\""), "selecting \(variant.id) sets the \(mood) life rhythm")
            let plan = try engine.snapshot()
            _ = try painter.bitmap(plan, width: 480, height: 270)
            if mood != "sunset" {
                #expect(plan.quads != sunsetQuads, "\(variant.id) must change the ambient overlay")
            }
        }
        try painter.selectVariant(0)
        #expect(try engine.worldJSON().contains("\"mood\":\"sunset\""), "returning to sunset restores the life rhythm")
    }
    @Test func paintedArenaBackdropIsOptionalValidatedAndArenaOnly() throws {
        let assets = try assets()
        let engine = try SceneEngine(assets: assets)
        let painter = ScenePainter(engine: engine)
        if assets.configuration.arena != nil {
            let arena = try #require(assets.arenaBackdrop)
            #expect(arena.width == 480)
            #expect(arena.height == 270)
        } else {
            #expect(assets.arenaBackdrop == nil, "placeholder keeps the code-drawn terrace")
        }
        try engine.command("play")
        try engine.setManualFocus(true)
        _ = try engine.replayGameJSON(frames: 150, step: 1.0 / 60)
        let battle = try engine.snapshot()
        #expect(battle.battle?.arena == true, "the manual arena flags its battle frame")
        let wallpaper = try engine.snapshot(presentation: "wallpaper")
        #expect(wallpaper.battle == nil, "the passive wallpaper never carries the arena frame")
        let bitmap = try painter.bitmap(battle, width: 480, height: 270)
        #expect(bitmap.width == 480)
        #expect(bitmap.height == 270)
    }
    @Test func arenaMarginsUseOneFlatFrameColourInsteadOfStretchedEdges() throws {
        let assets = try assets()
        // The placeholder keeps the code-drawn terrace and has no painted arena to frame.
        guard assets.arenaBackdrop != nil else { return }
        let frame = try rgb(try #require(assets.configuration.layout.arenaFrameColor))
        let engine = try SceneEngine(assets: assets)
        let viewport = try engine.viewport(width: 1600, height: 700)
        #expect(viewport.scale == 2)
        #expect(viewport.originX == 160)
        #expect(viewport.originY == 40)
        try engine.command("play")
        try engine.setManualFocus(true)
        _ = try engine.replayGameJSON(frames: 150, step: 1.0 / 60)
        let plan = try engine.snapshot()
        #expect(plan.battle?.arena == true)
        let image = try ScenePainter(engine: engine).bitmap(plan, width: 1600, height: 700)
        // Every margin pixel is the same deliberate frame colour, at any height/row.
        for y in [0, 100, 350, 699] {
            for x in [0, 1599] {
                let sample = try pixel(image, x: x, y: y)
                #expect(abs(sample.0 - frame.0) <= 1 && abs(sample.1 - frame.1) <= 1 && abs(sample.2 - frame.2) <= 1,
                        "arena margin (\(x),\(y)) must be the flat frame colour, not a stretched edge column")
            }
        }
    }
    @Test func nativeBitmapAndIconAreComplete() throws {
        let engine = try SceneEngine(assets: assets())
        let painter = ScenePainter(engine: engine)
        let bitmap = try painter.bitmap(engine.snapshot(), width: 480, height: 270)
        #expect(bitmap.width == 480)
        #expect(bitmap.height == 270)
        let icon = try painter.makeIcon(size: 1024)
        #expect(icon.width == 1024)
        #expect(icon.height == 1024)
    }
    @Test(arguments: ["../secret", "/etc/passwd", "character/../../secret", "character\\sheet.png"])
    func refusesUnsafePaths(path: String) throws {
        #expect(throws: KujiraError.self) { try Assets.checkedURL(root: URL(fileURLWithPath: "/tmp/kujira-assets"), relative: path) }
    }
}

struct PolicyTests {
    @Test func pauseSleepHiddenAndReducedMotionNeverAutoResume() {
        var policy = PlaybackPolicy()
        policy.hasVisibleSurface = true
        #expect(policy.shouldAnimate)
        policy.manuallyPaused = true
        policy.sleeping = true
        policy.sleeping = false
        #expect(policy.shouldAnimate == false)
        policy.manuallyPaused = false
        policy.reducedMotion = true
        #expect(policy.shouldAnimate == false)
        policy.reducedMotion = false
        policy.hasVisibleSurface = false
        #expect(policy.shouldAnimate == false)
        policy.hasVisibleSurface = true
        policy.sessionActive = false
        #expect(policy.shouldAnimate == false)
        policy.sessionActive = true
        policy.terminating = true
        #expect(policy.shouldAnimate == false)
    }
    @Test func lowPowerIsNativeAndCannotChangeSpeed() {
        var policy = PlaybackPolicy()
        #expect(policy.fps == 30)
        policy.systemLowPower = true
        #expect(policy.fps == 15)
        policy.userLowPower = true
        policy.systemLowPower = false
        #expect(policy.fps == 15)
    }
    @Test func clockDropsResumeBackwardsAndInvalidTime() {
        var clock = FrameClock()
        #expect(clock.sample(1) == 0)
        #expect(abs(clock.sample(1.1) - 0.1) < 0.000001)
        #expect(clock.sample(1000) == 0)
        #expect(clock.sample(999) == 0)
        clock.reset()
        #expect(clock.sample(1001) == 0)
        #expect(clock.sample(.nan) == 0)
    }
}
