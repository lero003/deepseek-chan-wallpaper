import Foundation
import Testing
@testable import KujiraCore

private struct QuietGuestState: Decodable {
    struct Visits: Decodable {
        struct Guest: Decodable { let bossId: String; let state: String }
        let guest: Guest?
    }
    let visits: Visits
    let phase: String
}

@MainActor
struct VisitorsTests {
    private func state(_ json: String) throws -> QuietGuestState {
        try JSONDecoder().decode(QuietGuestState.self, from: Data(json.utf8))
    }

    @Test func allThreeGuestsRenderInTheQuietWallpaperWithoutACombatFrame() throws {
        let engine = try SceneEngine(assets: CoreTests().assets(), seed: "quiet-native-visitors")
        try engine.command("frequency", value: "off")
        let painter = ScenePainter(engine: engine)
        let project = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let output = project.appendingPathComponent("private-art/qa/quiet-visitors/\(engine.assets.configuration.layout.id)", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        var observed = Set<String>()
        for _ in 0..<3600 {
            let current = try state(engine.replayGameJSON(frames: 30, step: 1.0 / 60))
            guard let guest = current.visits.guest, guest.state == "pausing", observed.insert(guest.bossId).inserted else { continue }
            let frame = try engine.snapshot(presentation: "wallpaper")
            #expect(frame.battle == nil)
            #expect(frame.game?.phase == "rest")
            #expect((frame.overlay?.count ?? 0) > 0)
            let image = try painter.bitmap(frame, width: 1440, height: 810)
            #expect(image.width == 1440)
            #expect(image.height == 810)
            try ScenePainter.writePNG(image, to: output.appendingPathComponent("\(guest.bossId).png"))
            if observed.count == 3 { break }
        }
        #expect(observed == Set(["lumie", "shio", "yume"]))
        // Rendering output is evidence about the painter, not GUI/animation acceptance.
    }

    @Test(arguments: ["play", "demo", "endless"])
    func aBattleEntryCannotKeepAnAmbientGuest(command: String) throws {
        let engine = try SceneEngine(assets: CoreTests().assets(), seed: "quiet-native-visitors")
        try engine.command("frequency", value: "off")
        var guest: QuietGuestState.Visits.Guest?
        for _ in 0..<300 {
            guest = try state(engine.replayGameJSON(frames: 30, step: 1.0 / 60)).visits.guest
            if guest != nil { break }
        }
        _ = try #require(guest)
        try engine.command(command)
        #expect(try state(engine.gameJSON()).visits.guest == nil)
    }
}
