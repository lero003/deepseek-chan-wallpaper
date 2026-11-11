import Foundation
import Testing
@testable import KujiraCore

private struct ArenaBotHero: Decodable { let x: Double; let y: Double; let gauge: Int }
private struct ArenaBotEnemy: Decodable { let x: Double; let y: Double; let hp: Int; let kind: String; let state: String }
private struct ArenaBotState: Decodable { let hero: ArenaBotHero; let enemies: [ArenaBotEnemy]; let phase: String }

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
    @Test func arenaOpensWithoutTraversalAndStopsBetweenRoundsAndOnPause() throws {
        let engine = try engine()
        try engine.command("play"); try engine.setManualFocus(true)
        let opening = try #require(try engine.snapshot().game)
        #expect(opening.route == "arena")
        #expect(opening.phase == "intro")
        #expect(opening.round == 1 && opening.rounds == 3)
        #expect(opening.dodgeReady == false && opening.specialReady == false)
        #expect(opening.arcade.score == 0 && opening.arcade.secondsLeft == 90)
        try engine.command("attack")
        _ = try engine.replayGameJSON(frames: 60, step: 1.0 / 60)
        let faceOff = try engine.snapshot()
        #expect(faceOff.game?.phase == "intro")
        #expect(faceOff.game?.hp == 5)
        #expect(faceOff.battle?.cameraX == 960)
        _ = try engine.replayGameJSON(frames: 40, step: 1.0 / 60)
        let battle = try #require(try engine.snapshot().game)
        #expect(battle.phase == "battle")
        #expect(battle.enemies == 3)
        #expect(battle.elapsedSeconds == 100.0 / 60)
        try engine.command("pause")
        _ = try engine.replayGameJSON(frames: 120, step: 1.0 / 60)
        #expect(try engine.snapshot().game?.elapsedSeconds == battle.elapsedSeconds)
        try engine.command("pause"); try engine.setManualFocus(false)
        _ = try engine.replayGameJSON(frames: 120, step: 1.0 / 60)
        #expect(try engine.snapshot().game?.elapsedSeconds == battle.elapsedSeconds)
        try engine.command("home")
        let home = try engine.snapshot()
        #expect(home.game?.manual == false)
        #expect(home.battle == nil)
    }
    @Test func arenaBoutReachesTheRivalAndReturnsWithPerBoutResults() throws {
        let engine = try engine()
        let painter = ScenePainter(engine: engine)
        try engine.command("play"); try engine.setManualFocus(true)
        var phases = Set<String>(), renderedRival = false
        for _ in 0..<1200 {
            let state = try JSONDecoder().decode(ArenaBotState.self, from: Data(engine.gameJSON().utf8))
            phases.insert(state.phase)
            if state.phase == "result" || state.phase == "retry" { break }
            if state.phase == "boss" {
                #expect(state.enemies.filter { $0.hp > 0 }.allSatisfy { $0.kind == "boss" })
                if renderedRival == false {
                    let frame = try engine.snapshot()
                    #expect(try painter.bitmap(frame, width: 960, height: 540).width == 960)
                    if engine.assets.bossFrames.isEmpty == false {
                        #expect(frame.battle?.commands.contains { $0.kind == "sprite" && $0.sheet == "boss" } == true)
                    }
                    renderedRival = true
                }
            }
            if let target = state.enemies.filter({ $0.hp > 0 }).min(by: {
                hypot($0.x - state.hero.x, ($0.y - state.hero.y) * 3) < hypot($1.x - state.hero.x, ($1.y - state.hero.y) * 3)
            }) {
                let dx = target.x - state.hero.x, dy = target.y - state.hero.y
                try engine.setMovement(x: abs(dx) > 34 ? (dx < 0 ? -1 : 1) : 0, y: abs(dy) > 6 ? (dy < 0 ? -1 : 1) : 0)
                if abs(dx) < 62 && abs(dy) < 16 { try engine.command("attack") }
                if state.hero.gauge >= 100 { try engine.command("special") }
                if target.state == "windup", abs(dx) < 62 { try engine.command("dodge") }
            } else { try engine.setMovement(x: 0, y: 0) }
            _ = try engine.replayGameJSON(frames: 6, step: 1.0 / 60)
        }
        let result = try #require(try engine.snapshot().game)
        #expect(phases.contains("roundClear"))
        #expect(phases.contains("bossIntro"))
        #expect(renderedRival)
        #expect(result.phase == "result" && result.outcome == "win")
        #expect(result.round == 3 && result.runStats.sections == 3)
        #expect(result.runStats.hits > 0 && result.elapsedSeconds > 0)
        #expect(result.arcade.score > 0)
        #expect(["S", "A", "B", "C"].contains(result.arcade.rank))
        #expect(result.arcade.bestCombo > 0 && result.arcade.secondsLeft > 0)
        #expect(try engine.snapshot().battle == nil)
        try engine.command("retry")
        let next = try #require(try engine.snapshot().game)
        #expect(next.round == 1 && next.phase == "intro")
        #expect(next.elapsedSeconds == 0 && next.runStats.hits == 0)
        #expect(next.arcade.score == 0 && next.arcade.continues == 0 && next.arcade.secondsLeft == 90)
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
