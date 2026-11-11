import Foundation
import CoreGraphics
import Testing
@testable import KujiraCore

@MainActor
struct CombatArtTests {
    private func prepared() throws -> Assets { try CoreTests().assets() }
    private func project() -> URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }
    private func fixture(_ assets: Assets) throws -> URL {
        let parent = project().appendingPathComponent("private-art/native-fault-tests", isDirectory: true)
        let root = parent.appendingPathComponent(UUID().uuidString, isDirectory: true).standardizedFileURL
        guard root.path.hasPrefix(parent.standardizedFileURL.path + "/") else { throw KujiraError.invalid("Unsafe fixture path") }
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: assets.root, to: root)
        return root // Isolated generated fixtures stay Git-ignored; no host cache/data cleanup.
    }
    private func object(_ url: URL) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func write(_ value: [String: Any], to url: URL) throws {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: url)
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
    private func plans(_ assets: Assets) throws -> [[String: Any]] {
        try #require(try object(assets.root.appendingPathComponent("test-fixtures.json"))["artPlans"] as? [[String: Any]])
    }
    private func decode(_ raw: [String: Any]) throws -> ScenePlan {
        try JSONDecoder().decode(ScenePlan.self, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func pixels(_ image: CGImage) throws -> Data {
        let provider = try #require(image.dataProvider)
        return try #require(provider.data) as Data
    }

    @Test func optionalSheetsHaveIndependentGeometryAndAllNativePosesRender() throws {
        let assets = try prepared()
        let samples = try plans(assets)
        let config = try object(assets.root.appendingPathComponent("configuration.json"))
        let entries = config["sprites"] as? [String: [String: String]] ?? [:]
        let expected = Set(["combat", "slime", "popup"].filter { entries[$0] != nil })
        #expect(Set(assets.poseSprites.keys) == expected)
        #expect(samples.count == expected.reduce(0) { $0 + ($1 == "combat" ? 8 : 18) })
        // All sheets are independent enhancements, including an older local profile
        // with none/some present. Don't turn their absence into a build requirement.
        if expected.isEmpty { #expect(samples.isEmpty); return }
        let engine = try SceneEngine(assets: assets), painter = ScenePainter(engine: engine)
        let output = project().appendingPathComponent("private-art/qa/brushup/native-combat", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        for sample in samples {
            let name = try #require(sample["name"] as? String)
            let raw = try #require(sample["plan"] as? [String: Any])
            let plan = try decode(raw)
            let image = try painter.bitmap(plan, width: 1440, height: 810)
            #expect(image.width == 1440)
            #expect(image.height == 810)
            try ScenePainter.writePNG(image, to: output.appendingPathComponent(name + ".png"))
            let kind = try #require(sample["sheet"] as? String)
            let sprite = try #require(assets.poseSprites[kind])
            #expect(sprite.frames.count == (kind == "combat" ? 8 : 18))
            #expect(plan.battle?.commands.contains { $0.sheet == kind } == true)
        }
        // Same art commands must still work in an ultrawide viewport with an origin offset.
        let first = try #require(samples.first?["plan"] as? [String: Any])
        #expect(try painter.bitmap(decode(first), width: 3440, height: 1440).width == 3440)
    }

    @Test(arguments: ["combat", "slime", "popup"], ["missing", "hash", "png", "dimensions", "atlas-config", "atlas-file", "entry",
        "atlas-null", "atlas-string", "atlas-number", "atlas-bool", "atlas-array"])
    func aFailedOptionalSheetKeepsOtherSheetsAndExactCameraRelativeFallback(sheet: String, fault: String) throws {
        let original = try prepared()
        if original.poseSprites[sheet] == nil {
            let config = try object(original.root.appendingPathComponent("configuration.json"))
            let entries = config["sprites"] as? [String: [String: String]] ?? [:]
            #expect(entries[sheet] == nil, "A genuinely absent enhancement is supported; configured healthy art must load.")
            return
        }
        let root = try fixture(original), configURL = root.appendingPathComponent("configuration.json")
        var config = try object(configURL)
        var entries = try #require(config["sprites"] as? [String: [String: Any]])
        let paths = try #require(entries[sheet])
        let sheetPath = try #require(paths["sheet"] as? String)
        let atlasPath = try #require(paths["atlas"] as? String)
        let imageURL = try Assets.checkedURL(root: root, relative: sheetPath)
        switch fault {
        case "missing":
            // checkedURL resolves and verifies this exact isolated fixture target first.
            try FileManager.default.removeItem(at: imageURL)
        case "hash":
            var bytes = try Data(contentsOf: imageURL); bytes.append(0); try bytes.write(to: imageURL)
        case "png":
            try Data([0, 1, 2, 3]).write(to: imageURL); try updateHash(sheetPath, root: root)
        case "dimensions":
            try Data(contentsOf: original.root.appendingPathComponent("scene/seaside-room.png")).write(to: imageURL)
            try updateHash(sheetPath, root: root)
        case "atlas-config":
            var layout = try #require(config["layout"] as? [String: Any]); layout[sheet + "Atlas"] = ["version": "bad"]
            config["layout"] = layout
        case "atlas-null", "atlas-string", "atlas-number", "atlas-bool", "atlas-array":
            var layout = try #require(config["layout"] as? [String: Any])
            let malformed: [String: Any] = ["atlas-null": NSNull(), "atlas-string": "bad", "atlas-number": 42,
                                             "atlas-bool": true, "atlas-array": [1, 2, 3]]
            guard let malformedValue = malformed[fault] else { throw KujiraError.invalid("Unknown fault fixture") }
            layout[sheet + "Atlas"] = malformedValue
            config["layout"] = layout
        case "atlas-file":
            try Data("{\"version\":false}".utf8).write(to: root.appendingPathComponent(atlasPath))
            try updateHash(atlasPath, root: root)
        default:
            entries[sheet] = ["sheet": 123]; config["sprites"] = entries
        }
        try write(config, to: configURL)
        let damaged = try Assets(root: root)
        #expect(damaged.frames.count == 16)
        #expect(damaged.poseSprites[sheet] == nil)
        for other in ["combat", "slime", "popup"] where other != sheet {
            #expect(damaged.poseSprites[other]?.frames.count == original.poseSprites[other]?.frames.count)
        }
        let sample = try #require(try plans(original).first { $0["sheet"] as? String == sheet })
        let rawPlan = try #require(sample["plan"] as? [String: Any])
        let actual = try decode(rawPlan)
        var expanded = rawPlan
        var battle = try #require(expanded["battle"] as? [String: Any])
        let commands = try #require(battle["commands"] as? [[String: Any]])
        battle["commands"] = commands.flatMap { command -> [[String: Any]] in
            if command["sheet"] as? String == sheet { return command["fallback"] as? [[String: Any]] ?? [] }
            return [command]
        }
        expanded["battle"] = battle
        let painter = ScenePainter(engine: try SceneEngine(assets: damaged))
        #expect(try pixels(painter.bitmap(actual, width: 960, height: 540))
                == pixels(painter.bitmap(decode(expanded), width: 960, height: 540)),
                "Optional fallback must be expanded once before sprite transforms/alpha, not painted as heroine art.")
        // Malformed optional metadata must not break JavaScriptCore startup/snapshots either.
        let engine = try SceneEngine(assets: damaged)
        try engine.command("play"); try engine.setManualFocus(true)
        #expect(try engine.snapshot().battle != nil)
    }

    @Test func nativeArenaUsesHostValidatedAvailabilityInsteadOfConfiguredPresence() throws {
        let original = try prepared()
        guard let arena = original.configuration.arena else {
            #expect(original.arenaBackdrop == nil)
            return
        }
        let root = try fixture(original)
        let target = try Assets.checkedURL(root: root, relative: arena.scene)
        try FileManager.default.removeItem(at: target)
        let missing = try Assets(root: root)
        #expect(missing.arenaBackdrop == nil)
        let good = try SceneEngine(assets: original), fallback = try SceneEngine(assets: missing)
        for engine in [good, fallback] { try engine.command("play"); try engine.setManualFocus(true) }
        let full = try #require(try fallback.snapshot().battle), painted = try #require(try good.snapshot().battle)
        let faint = { (commands: [DrawCommand]) in commands.filter { $0.kind == "rect" && $0.alpha < 0.2 }.count }
        #expect(faint(full.commands) > faint(painted.commands))
        #expect(try ScenePainter(engine: fallback).bitmap(fallback.snapshot(), width: 960, height: 540).width == 960)
    }
}
