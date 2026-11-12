import Foundation
import CoreGraphics
import Testing
@testable import KujiraCore

/// Synthetic optional sheets keep these boundaries testable in placeholder builds too.
/// Fixtures only touch isolated, ignored local copies, never the approved art bytes.
@MainActor
struct LifeArtTests {
    private let sheetPath = "character/life/sheet.png"
    private let atlasPath = "character/life/atlas.json"
    private let animationKeys = ["hop", "giggle", "sway", "peek", "stretch", "daydream"]

    private func project() -> URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }
    private func object(_ url: URL) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func write(_ value: [String: Any], to url: URL) throws {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: url)
    }
    private func atlasObject() -> [String: Any] {
        var animations: [String: Any] = [:]
        for (index, key) in animationKeys.enumerated() {
            animations[key] = ["frames": Array((index * 4)..<(index * 4 + 4)), "frameDurationMs": 180,
                               "frameDurationsMs": [120, 160, 240, 200]]
        }
        return ["version": 1, "frameWidth": 80, "frameHeight": 128, "columns": 4, "rows": 6,
                "anchor": ["x": 40, "y": 124], "animations": animations]
    }
    private func decodeAtlas(_ raw: [String: Any]) throws -> LifeAtlas {
        try JSONDecoder().decode(LifeAtlas.self, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func colorHex(_ frame: Int) -> String { String(format: "#%02x%02x%02x", 40 + frame * 7, 208 - frame * 5, 80 + frame * 3) }
    private func sheet() throws -> CGImage {
        let space = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try #require(CGContext(data: nil, width: 320, height: 768, bitsPerComponent: 8, bytesPerRow: 320 * 4,
                                             space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.translateBy(x: 0, y: 768); context.scaleBy(x: 1, y: -1)
        context.setShouldAntialias(false)
        for frame in 0..<24 {
            context.setFillColor(CGColor(srgbRed: Double(40 + frame * 7) / 255,
                                          green: Double(208 - frame * 5) / 255, blue: Double(80 + frame * 3) / 255, alpha: 1))
            context.fill(CGRect(x: frame % 4 * 80 + 36, y: frame / 4 * 128 + 116, width: 8, height: 8))
        }
        return try #require(context.makeImage())
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
    private func fixture(_ original: Assets, withLife: Bool = true) throws -> URL {
        let parent = project().appendingPathComponent("private-art/native-fault-tests/life", isDirectory: true).standardizedFileURL
        let root = parent.appendingPathComponent(UUID().uuidString, isDirectory: true).standardizedFileURL
        guard root.path.hasPrefix(parent.path + "/") else { throw KujiraError.invalid("Unsafe life fixture path") }
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: original.root, to: root)
        let configURL = root.appendingPathComponent("configuration.json")
        var config = try object(configURL)
        var layout = try #require(config["layout"] as? [String: Any])
        config.removeValue(forKey: "life"); layout.removeValue(forKey: "lifeAtlas")
        if withLife {
            let sheetURL = try Assets.checkedURL(root: root, relative: sheetPath)
            try FileManager.default.createDirectory(at: sheetURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try ScenePainter.writePNG(sheet(), to: sheetURL)
            try write(atlasObject(), to: Assets.checkedURL(root: root, relative: atlasPath))
            config["life"] = ["sheet": sheetPath, "atlas": atlasPath]
            layout["lifeAtlas"] = atlasObject()
            let manifestURL = root.appendingPathComponent("manifest.json")
            var manifest = try object(manifestURL)
            var records = try #require(manifest["assets"] as? [[String: Any]])
            records.removeAll { [sheetPath, atlasPath].contains($0["path"] as? String ?? "") }
            for (index, path) in [sheetPath, atlasPath].enumerated() {
                records.append(["id": "life-native-fixture-\(index)", "path": path, "name": "Synthetic life fixture",
                                "dimensions": path == sheetPath ? "320×768" : "JSON", "author": "Native test fixture",
                                "license": "LicenseRef-Test-Fixture-Only", "sha256": Assets.sha(try Data(contentsOf: Assets.checkedURL(root: root, relative: path))),
                                "permission": ["status": "test-fixture-only", "webPublication": false,
                                               "sourceRedistribution": false, "macAppBundling": false]])
            }
            manifest["assets"] = records
            try write(manifest, to: manifestURL)
        }
        config["layout"] = layout
        try write(config, to: configURL)
        return root
    }
    private func plan(frame: Int = 0, lifeFrame: Int? = nil, facing: Int = 1, motion: [String: Double]? = nil,
                      battle: [String: Any]? = nil) throws -> ScenePlan {
        var raw: [String: Any] = ["tick": 0, "state": "idle", "x": 240.0, "floorY": 236.0,
                                  "facing": facing, "frame": frame, "quads": []]
        if let lifeFrame { raw["lifeFrame"] = lifeFrame }
        if let motion { raw["motion"] = motion }
        if let battle { raw["battle"] = battle }
        return try JSONDecoder().decode(ScenePlan.self, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func pixels(_ image: CGImage) throws -> Data {
        let provider = try #require(image.dataProvider)
        return try #require(provider.data) as Data
    }

    @Test func parserKeepsSixFourFrameAnimationsIndependentFromTheOldAtlas() throws {
        let atlas = try decodeAtlas(atlasObject())
        try atlas.validate()
        #expect(atlas.frameWidth == 80 && atlas.frameHeight == 128 && atlas.columns == 4 && atlas.rows == 6)
        #expect(atlas.anchor == Anchor(x: 40, y: 124))
        #expect(Set(atlas.animations.keys) == Set(animationKeys))
        #expect(Set(atlas.animations.values.flatMap(\.frames)) == Set(0..<24))
        var minimal = atlasObject()
        var animations = try #require(minimal["animations"] as? [String: [String: Any]])
        for key in animationKeys { animations[key]?.removeValue(forKey: "frameDurationsMs") }
        animations["hop"]?["frameDurationMs"] = 1
        animations["giggle"]?["frameDurationMs"] = 60000
        minimal["animations"] = animations
        try decodeAtlas(minimal).validate()
        let original = try CoreTests().assets()
        #expect(original.frames.count == 16)
        try original.configuration.atlas.validate()
    }

    @Test(arguments: ["version", "width", "height", "columns", "rows", "anchor-x", "anchor-y", "missing", "unknown",
                      "short", "long", "duplicate-in", "duplicate-across", "negative", "out-of-range", "duration-zero",
                      "duration-large", "times-short", "times-zero", "times-large"])
    func parserRejectsInvalidGeometryCoverageAndTiming(fault: String) throws {
        var raw = atlasObject()
        var animations = try #require(raw["animations"] as? [String: [String: Any]])
        var hop = try #require(animations["hop"])
        switch fault {
        case "version": raw["version"] = 2
        case "width": raw["frameWidth"] = 81
        case "height": raw["frameHeight"] = 112
        case "columns": raw["columns"] = 6
        case "rows": raw["rows"] = 4
        case "anchor-x": raw["anchor"] = ["x": 39, "y": 124]
        case "anchor-y": raw["anchor"] = ["x": 40, "y": 125]
        case "missing": animations.removeValue(forKey: "daydream")
        case "unknown": animations["wave"] = hop
        case "short": hop["frames"] = [0, 1, 2]
        case "long": hop["frames"] = [0, 1, 2, 3, 4]
        case "duplicate-in": hop["frames"] = [0, 1, 1, 3]
        case "duplicate-across": hop["frames"] = [0, 1, 2, 4]
        case "negative": hop["frames"] = [-1, 1, 2, 3]
        case "out-of-range": hop["frames"] = [0, 1, 2, 24]
        case "duration-zero": hop["frameDurationMs"] = 0
        case "duration-large": hop["frameDurationMs"] = 60001
        case "times-short": hop["frameDurationsMs"] = [120, 160, 200]
        case "times-zero": hop["frameDurationsMs"] = [120, 0, 240, 200]
        case "times-large": hop["frameDurationsMs"] = [120, 60001, 240, 200]
        default: throw KujiraError.invalid("Unknown parser fixture")
        }
        animations["hop"] = hop; raw["animations"] = animations
        let atlas = try decodeAtlas(raw)
        #expect(throws: KujiraError.self) { try atlas.validate() }
    }

    @Test func preparedLifeResourcesLoadOnlyWhenExplicitlyConfigured() throws {
        let assets = try CoreTests().assets()
        let config = try object(assets.root.appendingPathComponent("configuration.json"))
        #expect(assets.frames.count == 16)
        guard let paths = config["life"] as? [String: String] else {
            #expect(assets.lifeSprite == nil, "Placeholder resources do not select private life art.")
            return
        }
        #expect(paths["sheet"] == sheetPath && paths["atlas"] == atlasPath)
        let sprite = try #require(assets.lifeSprite, "A prepared valid local enhancement must load, not silently fall back.")
        let atlas = try decodeAtlas(object(assets.root.appendingPathComponent(atlasPath)))
        #expect(sprite.atlas == atlas)
        #expect(sprite.frames.count == 24)
        for image in sprite.frames { #expect(image.width == 80 && image.height == 128) }
    }

    @Test func absentLifeMetadataKeepsTheApprovedSixteenFrames() throws {
        let original = try CoreTests().assets()
        let absent = try Assets(root: fixture(original, withLife: false))
        #expect(absent.lifeSprite == nil)
        let painter = ScenePainter(engine: try SceneEngine(assets: absent))
        #expect(try pixels(painter.bitmap(plan(lifeFrame: 0), width: 960, height: 540))
                == pixels(painter.bitmap(plan(), width: 960, height: 540)))
    }

    @Test func everyLifeFrameSelectsOneDistinctSpriteInsteadOfDrawingTheOldHeroineToo() throws {
        let assets = try Assets(root: fixture(CoreTests().assets()))
        let sprite = try #require(assets.lifeSprite)
        #expect(sprite.frames.count == 24)
        let painter = ScenePainter(engine: try SceneEngine(assets: assets))
        var seen = Set<Data>()
        for frame in 0..<24 {
            let actual = try pixels(painter.bitmap(plan(lifeFrame: frame), width: 960, height: 540))
            #expect(seen.insert(actual).inserted, "Each additional frame must select its own atlas cell.")
            // Only the synthetic 8×8 foot marker should be visible, not a second old16 heroine.
            let rect: [String: Any] = ["kind": "rect", "x": 236, "y": 228, "width": 8, "height": 8,
                                       "alpha": 1, "color": colorHex(frame)]
            let expected = try plan(battle: ["cameraX": 0, "room": true, "commands": [rect]])
            let expectedPixels = try pixels(painter.bitmap(expected, width: 960, height: 540))
            #expect(actual == expectedPixels)
        }
    }

    @Test func optionalAndFallbackSpritesShareMotionAndTheOriginalFrameGuard() throws {
        let original = try CoreTests().assets()
        let root = try fixture(original), assets = try Assets(root: root)
        let painter = ScenePainter(engine: try SceneEngine(assets: assets))
        let motion = ["rotation": 0.08, "scaleX": 1.05, "scaleY": 0.94, "lift": 7.0, "offsetX": -3.0]
        for facing in [-1, 1] {
            let fallback = try pixels(painter.bitmap(plan(frame: 3, facing: facing, motion: motion), width: 960, height: 540))
            for invalid in [-1, 24, Int.max] {
                #expect(try pixels(painter.bitmap(plan(frame: 3, lifeFrame: invalid, facing: facing, motion: motion), width: 960, height: 540)) == fallback)
            }
        }
        #expect(throws: KujiraError.self) { try painter.bitmap(plan(frame: 16, lifeFrame: 0), width: 960, height: 540) }
        #expect(throws: KujiraError.self) { try painter.bitmap(plan(lifeFrame: 0, facing: 0), width: 960, height: 540) }

        // A separate ignored reference swaps only fixture old16 geometry to the same
        // synthetic pixels. Its existing old16 drawing path must produce identical motion.
        let referenceRoot = try fixture(original, withLife: false)
        let configURL = referenceRoot.appendingPathComponent("configuration.json")
        var config = try object(configURL), atlas = try #require(config["atlas"] as? [String: Any])
        atlas["frameWidth"] = 80; atlas["frameHeight"] = 128; atlas["columns"] = 4; atlas["rows"] = 4
        atlas["anchor"] = ["x": 40, "y": 124]
        atlas["collisionHalfWidth"] = 40
        // Keep this widened synthetic reference safe in both local and placeholder
        // profiles without relaxing the production scene/atlas margin validation.
        var layout = try #require(config["layout"] as? [String: Any])
        var scene = try #require(layout["scene"] as? [String: Any])
        scene["actorHalfWidth"] = 40
        layout["scene"] = scene
        config["layout"] = layout
        config["atlas"] = atlas
        try write(config, to: configURL)
        try write(atlas, to: referenceRoot.appendingPathComponent("character/atlas.json"))
        let referenceSheet = try #require(try sheet().cropping(to: CGRect(x: 0, y: 0, width: 320, height: 512)))
        try ScenePainter.writePNG(referenceSheet, to: referenceRoot.appendingPathComponent("character/sheet.png"))
        for path in ["character/sheet.png", "character/atlas.json"] { try updateHash(path, root: referenceRoot) }
        let reference = ScenePainter(engine: try SceneEngine(assets: Assets(root: referenceRoot)))
        for facing in [-1, 1] {
            #expect(try pixels(painter.bitmap(plan(lifeFrame: 0, facing: facing, motion: motion), width: 960, height: 540))
                    == pixels(reference.bitmap(plan(facing: facing, motion: motion), width: 960, height: 540)))
        }
    }

    @Test(arguments: ["missing-sheet", "missing-atlas", "sheet-hash", "atlas-hash", "png", "dimensions", "atlas-file", "atlas-geometry", "atlas-mismatch",
                      "life-absent", "life-null", "life-string", "life-number", "life-bool", "life-array", "life-object", "unsafe-path",
                      "metadata-absent", "metadata-null", "metadata-string", "metadata-number", "metadata-bool", "metadata-array", "metadata-object",
                      "manifest-missing", "manifest-duplicate", "author", "license"])
    func optionalFailuresRemainIndependentAndPreserveExactOld16Fallback(fault: String) throws {
        let original = try CoreTests().assets()
        let root = try fixture(original), configURL = root.appendingPathComponent("configuration.json")
        var config = try object(configURL), layout = try #require(config["layout"] as? [String: Any])
        let sheetURL = try Assets.checkedURL(root: root, relative: sheetPath)
        let atlasURL = try Assets.checkedURL(root: root, relative: atlasPath)
        switch fault {
        case "missing-sheet": try FileManager.default.removeItem(at: sheetURL)
        case "missing-atlas": try FileManager.default.removeItem(at: atlasURL)
        case "sheet-hash": var bytes = try Data(contentsOf: sheetURL); bytes.append(0); try bytes.write(to: sheetURL)
        case "atlas-hash": var bytes = try Data(contentsOf: atlasURL); bytes.append(32); try bytes.write(to: atlasURL)
        case "png": try Data([0, 1, 2, 3]).write(to: sheetURL); try updateHash(sheetPath, root: root)
        case "dimensions":
            try Data(contentsOf: original.root.appendingPathComponent("scene/seaside-room.png")).write(to: sheetURL)
            try updateHash(sheetPath, root: root)
        case "atlas-file": try Data("{\"version\":false}".utf8).write(to: atlasURL); try updateHash(atlasPath, root: root)
        case "atlas-geometry":
            var raw = atlasObject(); raw["frameHeight"] = 112
            try write(raw, to: atlasURL); try updateHash(atlasPath, root: root)
        case "atlas-mismatch":
            var raw = atlasObject(), animations = try #require(raw["animations"] as? [String: [String: Any]])
            animations["hop"]?["frameDurationMs"] = 200
            raw["animations"] = animations; layout["lifeAtlas"] = raw
        case "life-absent": config.removeValue(forKey: "life")
        case "metadata-absent": layout.removeValue(forKey: "lifeAtlas")
        case "unsafe-path": config["life"] = ["sheet": "../sheet.png", "atlas": atlasPath]
        case "manifest-missing", "manifest-duplicate", "author", "license":
            let url = root.appendingPathComponent("manifest.json")
            var manifest = try object(url), records = try #require(manifest["assets"] as? [[String: Any]])
            let index = try #require(records.firstIndex { $0["path"] as? String == sheetPath })
            switch fault {
            case "manifest-missing": records.remove(at: index)
            case "manifest-duplicate": records.append(records[index])
            case "author": records[index]["author"] = "   "
            default: records[index]["license"] = ""
            }
            manifest["assets"] = records; try write(manifest, to: url)
        default:
            let values: [String: Any] = ["null": NSNull(), "string": "bad", "number": 42, "bool": true,
                                         "array": [1, 2, 3], "object": ["sheet": 123]]
            let parts = fault.split(separator: "-")
            let value = try #require(values[String(parts[1])])
            if parts[0] == "life" { config["life"] = value } else { layout["lifeAtlas"] = value }
        }
        config["layout"] = layout
        try write(config, to: configURL)
        let damaged = try Assets(root: root)
        #expect(damaged.lifeSprite == nil, "Only the broken optional life enhancement is unavailable.")
        #expect(damaged.frames.count == 16)
        #expect(damaged.bossAtlasesByBoss == original.bossAtlasesByBoss)
        #expect(damaged.poseSprites.keys.sorted() == original.poseSprites.keys.sorted())
        #expect(damaged.variants.count == original.variants.count)
        for frame in 0..<16 { #expect(try pixels(damaged.frames[frame]) == pixels(original.frames[frame])) }
        let engine = try SceneEngine(assets: damaged), painter = ScenePainter(engine: engine)
        #expect(try engine.snapshot().state == "idle", "Malformed optional metadata cannot break JavaScriptCore startup.")
        let motion = ["rotation": -0.07, "scaleX": 0.95, "scaleY": 1.04, "lift": 3.0, "offsetX": 2.0]
        #expect(try pixels(painter.bitmap(plan(frame: 2, lifeFrame: 18, facing: -1, motion: motion), width: 960, height: 540))
                == pixels(painter.bitmap(plan(frame: 2, facing: -1, motion: motion), width: 960, height: 540)))
    }
}
