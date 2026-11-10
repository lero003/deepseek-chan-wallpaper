import Foundation
import Testing
@testable import KujiraCore

@MainActor
struct CoreTests {
    func assets() throws -> Assets {
        let path = try #require(ProcessInfo.processInfo.environment["KUJIRA_TEST_RESOURCES"])
        return try Assets(root: URL(fileURLWithPath: path, isDirectory: true))
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
