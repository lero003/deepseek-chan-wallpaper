import Foundation
import Testing
@testable import KujiraCore

@MainActor
struct FightersTests {
    private func engine() throws -> SceneEngine { try SceneEngine(assets: CoreTests().assets()) }
    @Test func thirtyMinuteFullGameMatchesV8AtEveryFrameRate() throws {
        let engine = try engine()
        let data = try Data(contentsOf: engine.assets.root.appendingPathComponent("test-fixtures.json"))
        let fixture = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let cases = try #require(fixture["gameReplays"] as? [[String: Any]])
        #expect(cases.count == 3)
        for replay in cases {
            let fps = try #require(replay["fps"] as? Int)
            let expected = try #require(replay["game"] as? NSDictionary)
            let candidate = try self.engine()
            let json = try candidate.replayGameJSON(frames: 1800 * fps, step: 1 / Double(fps))
            let actual = try #require(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? NSDictionary)
            #expect(actual.isEqual(expected), "Full Fighters simulation must match V8, not only the ambient world.")
        }
    }
    @Test func autoEventCompletesAndReturnsWithoutUserInput() throws {
        let engine = try engine()
        #expect(try engine.snapshot().battle == nil)
        try engine.command("demo")
        _ = try engine.replayGameJSON(frames: 120 * 60, step: 1.0 / 60)
        let frame = try engine.snapshot()
        #expect(frame.game?.phase == "rest")
        #expect(frame.game?.outcome == "win")
        #expect(frame.battle == nil)
    }
    @Test func manualPreviewAndPassiveWallpaperHaveSeparateRenderPresentations() throws {
        let engine = try engine()
        try engine.command("play"); try engine.setManualFocus(true)
        _ = try engine.replayGameJSON(frames: 190, step: 1.0 / 60)
        let preview = try engine.snapshot(), wallpaper = try engine.snapshot(presentation: "wallpaper")
        #expect(preview.game?.manual == true)
        #expect(preview.battle != nil)
        #expect(wallpaper.battle == nil)
        #expect(wallpaper.overlay == nil)
        #expect(wallpaper.quads.count >= 14)
        let painter = ScenePainter(engine: engine)
        #expect(try painter.bitmap(preview, width: 960, height: 540).width == 960)
        #expect(try painter.bitmap(wallpaper, width: 960, height: 540).height == 540)
    }
    @Test func lossOfFocusStopsCombatButNotThePassiveLivingWorld() throws {
        let engine = try engine()
        try engine.command("play"); try engine.setManualFocus(true); try engine.setMovement(x: 1, y: 0)
        _ = try engine.advance(0.25)
        try engine.setManualFocus(false)
        let before = try #require(try JSONSerialization.jsonObject(with: Data(engine.gameJSON().utf8)) as? NSDictionary)
        _ = try engine.advance(0.25)
        let after = try #require(try JSONSerialization.jsonObject(with: Data(engine.gameJSON().utf8)) as? NSDictionary)
        #expect(before["combatTick"] as? Int == after["combatTick"] as? Int)
        #expect((before["hero"] as? NSDictionary)?.isEqual(after["hero"]) == true)
        #expect(before["tick"] as? Int != after["tick"] as? Int)
    }
    @Test func commandsCannotEvaluateArbitraryScriptsOrInvalidSettings() throws {
        let engine = try engine()
        #expect(throws: KujiraError.self) { try engine.command("exec", value: "anything") }
        #expect(throws: KujiraError.self) { try engine.command("frequency", value: "endless") }
        try engine.command("frequency", value: "off")
        #expect(try engine.snapshot().game?.frequency == "off")
    }
}

struct GameKeysTests {
    @Test(arguments: [(UInt16(38), "attack"), (6, "attack"), (40, "dodge"), (7, "dodge"), (37, "special"), (8, "special"), (53, "pause"), (123, "arrowleft"), (126, "arrowup")])
    func explicitLocalKeys(pair: (UInt16, String)) {
        #expect(GameKeys.name(for: pair.0) == pair.1)
        #expect(GameKeys.name(for: 12) == nil)
    }
    @Test func releasingAndOppositeDirectionsNeverLeaveStickyMovement() {
        var held = HeldGameKeys()
        held.update(2, down: true); #expect(held.direction.x == 1)
        held.update(0, down: true); #expect(held.direction.x == 0)
        held.update(2, down: false); #expect(held.direction.x == -1)
        held.update(13, down: true); #expect(held.direction.y == -1)
        held.clear(); #expect(held.direction.x == 0 && held.direction.y == 0)
    }
}
