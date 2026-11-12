import Foundation
import CoreGraphics
import Testing
@testable import KujiraCore

/// Generated Ritsuka/Yume sheets are optional local-only assets. These tests verify the
/// native boundaries independently: missing assets keep code drawing, and one corrupt
/// rival never removes the other rivals or the legacy Lumie single-sheet path.
@MainActor
struct RivalArtTests {
    private func prepared() throws -> Assets { try CoreTests().assets() }
    private func project() -> URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }
    private func object(_ url: URL) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func write(_ value: [String: Any], to url: URL) throws {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: url)
    }
    private func fixture(_ assets: Assets) throws -> URL {
        let parent = project().appendingPathComponent("private-art/native-fault-tests", isDirectory: true)
        let root = parent.appendingPathComponent(UUID().uuidString, isDirectory: true).standardizedFileURL
        guard root.path.hasPrefix(parent.standardizedFileURL.path + "/") else { throw KujiraError.invalid("Unsafe fixture path") }
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: assets.root, to: root)
        return root
    }
    private func updateHash(_ path: String, root: URL) throws {
        let url = root.appendingPathComponent("manifest.json")
        var manifest = try object(url)
        var records = try #require(manifest["assets"] as? [[String: Any]])
        let index = try #require(records.firstIndex { $0["path"] as? String == path })
        records[index]["sha256"] = Assets.sha(try Data(contentsOf: Assets.checkedURL(root: root, relative: path)))
        manifest["assets"] = records
        try write(manifest, to: url)
    }
    /// A minimal wallpaper plan with one optional rival sprite command at the room floor.
    private func plan(bossId: String?) throws -> ScenePlan {
        var command: [String: Any] = ["kind": "sprite", "x": 240.0, "y": 236.0, "alpha": 1.0, "frame": 1,
            "facing": 1, "rotation": 0.0, "scaleX": 1.0, "scaleY": 1.0, "sheet": "boss"]
        if let bossId { command["bossId"] = bossId }
        let json: [String: Any] = ["tick": 0, "state": "idle", "x": 100.0, "floorY": 236.0,
            "facing": 1, "frame": 0, "quads": [], "battle": ["cameraX": 0, "commands": [command], "room": true]]
        return try JSONDecoder().decode(ScenePlan.self, from: JSONSerialization.data(withJSONObject: json))
    }

    @Test func generatedRivalsKeepIndependentAtlasesAndOnlyLumieBacksTheLegacyField() throws {
        let assets = try prepared()
        let expected = assets.configuration.bosses ?? [:]
        #expect(assets.bossSources.keys.sorted() == expected.keys.sorted())
        #expect(assets.bossFramesByBoss.keys.sorted() == expected.keys.sorted())
        #expect(assets.bossAtlasesByBoss.keys.sorted() == expected.keys.sorted())
        // Placeholder builds legitimately bundle no rival sheet.
        if expected.isEmpty {
            #expect(assets.bossFrames.isEmpty)
            #expect(assets.bossAtlas == nil)
            return
        }
        for (id, source) in expected {
            let atlas = try #require(assets.bossAtlasesByBoss[id])
            let frames = try #require(assets.bossFramesByBoss[id])
            #expect(atlas.frameWidth == 96 && atlas.frameHeight == 112)
            #expect(atlas.columns == 4 && atlas.rows == 2)
            #expect(frames.count == 8)
            #expect(atlas.poses.keys.sorted() == ["cast", "exit", "hurt", "idle", "move", "recover", "strike", "windup"])
            #expect(source.sheet == "fighters/\(id)/sheet.png")
            #expect(source.atlas == "fighters/\(id)/atlas.json")
        }
        #expect(assets.bossAtlas == assets.bossAtlasesByBoss["lumie"])
        #expect(assets.bossFrames.count == 8)
    }

    @Test func eachRivalPicksItsOwnSheetWhileAnUnknownIdCannotBorrowTheHeroine() throws {
        let assets = try prepared()
        guard !assets.bossSources.isEmpty else { return }
        let engine = try SceneEngine(assets: assets), painter = ScenePainter(engine: engine)
        let output = project().appendingPathComponent("private-art/qa/rival-atlas", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        var rendered: [String: Data] = [:]
        for id in assets.bossSources.keys.sorted() {
            let url = output.appendingPathComponent("\(id)-room.png")
            let image = try painter.bitmap(try plan(bossId: id), width: 960, height: 540)
            #expect(image.width == 960 && image.height == 540)
            try ScenePainter.writePNG(image, to: url)
            rendered[id] = try Data(contentsOf: url)
        }
        // If the painter ignored command.bossId it would draw one rival sheet for every id.
        let ids = rendered.keys.sorted()
        for i in ids.indices { for j in ids.indices where i < j { #expect(rendered[ids[i]] != rendered[ids[j]]) } }
        // An unknown id has neither a generated nor legacy sheet: no sprite is drawn and
        // the heroine sheet must never be substituted.
        let unknown = try painter.bitmap(try plan(bossId: "unknown"), width: 960, height: 540)
        let unknownURL = output.appendingPathComponent("unknown-room.png")
        try ScenePainter.writePNG(unknown, to: unknownURL)
        let unknownData = try Data(contentsOf: unknownURL)
        for id in ids { #expect(rendered[id] != unknownData) }
    }

    @Test func oneCorruptRivalLeavesTheOtherGeneratedRivalsAndLegacySheetAvailable() throws {
        let original = try prepared()
        guard let shio = original.configuration.bosses?["shio"], original.configuration.bosses?["yume"] != nil else { return }
        let root = try fixture(original), sheetURL = try Assets.checkedURL(root: root, relative: shio.sheet)
        try Data([0, 1, 2, 3]).write(to: sheetURL)
        try updateHash(shio.sheet, root: root)
        let damaged = try Assets(root: root)
        #expect(damaged.bossSources["shio"] == nil, "the corrupt sheet must fall back alone")
        #expect(damaged.bossFramesByBoss["shio"] == nil)
        #expect(damaged.bossSources["yume"] != nil)
        #expect(damaged.bossSources["lumie"] != nil)
        #expect(damaged.bossFrames.count == 8, "the legacy Lumie field survives an unrelated failure")
    }
}