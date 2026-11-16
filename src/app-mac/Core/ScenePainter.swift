import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CoreText

/// A backdrop bitmap depends only on the logical viewport, never on the target's
/// point size: two windows with the same logical scene share one cached image.
private struct BackdropKey: Hashable { let width: Int; let height: Int; let originX: Int; let originY: Int }
private struct ViewportSize: Hashable { let width: Int; let height: Int }

/// Small LRU: evict one oldest entry instead of dropping every display's cached
/// backdrop whenever a live resize walks through a handful of sizes.
private struct BackdropCache {
    private var images: [BackdropKey: CGImage] = [:]
    private var order: [BackdropKey] = []
    func image(for key: BackdropKey) -> CGImage? { images[key] }
    mutating func store(_ image: CGImage, for key: BackdropKey, limit: Int = 4) {
        if images[key] != nil { images[key] = image; return }
        if order.count >= limit { images.removeValue(forKey: order.removeFirst()) }
        images[key] = image; order.append(key)
    }
    mutating func removeAll() { images.removeAll(keepingCapacity: false); order.removeAll(keepingCapacity: false) }
    var isEmpty: Bool { images.isEmpty }
}

@MainActor
public final class ScenePainter {
    public let engine: SceneEngine
    private var backdrops = BackdropCache()
    private var colors: [String: CGColor] = [:]
    private var wideBackdrops = BackdropCache()
    private var arenaBackdrops = BackdropCache()
    private var viewports: [ViewportSize: Viewport] = [:]
    private var fonts: [Double: CTFont] = [:]
    private var variantIndex = 0
    public init(engine: SceneEngine) { self.engine = engine }

    /// 0 = the approved sunset room, 1..n = additional backgrounds.
    public var currentVariantIndex: Int { variantIndex }
    public var currentVariantID: String {
        variantIndex == 0 ? "sunset" : engine.assets.variants[variantIndex - 1].id
    }
    public var currentVariantLabel: String {
        variantIndex == 0 ? engine.assets.configuration.layout.label : engine.assets.variants[variantIndex - 1].label
    }
    public func selectVariant(_ index: Int) throws {
        guard index >= 0, index <= engine.assets.variants.count else { throw KujiraError.invalid("背景の選択が不正です。") }
        if index == variantIndex { return }
        // Keep the shared core's ambient palette and life rhythm in sync with the image.
        try engine.setVariant(index)
        variantIndex = index
        backdrops.removeAll()
        wideBackdrops.removeAll()
    }
    private var activeBackground: CGImage {
        variantIndex == 0 ? engine.assets.background : engine.assets.variants[variantIndex - 1].background
    }
    private var activeMatte: CGImage? {
        variantIndex == 0 ? engine.assets.matte : engine.assets.variants[variantIndex - 1].matte
    }

    private func color(_ hex: String) throws -> CGColor {
        if let cached = colors[hex] { return cached }
        guard hex.count == 7, hex.first == "#", let value = UInt32(hex.dropFirst(), radix: 16) else { throw KujiraError.invalid("描画色が不正です。") }
        let color = CGColor(srgbRed: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255,
                            blue: Double(value & 255) / 255, alpha: 1)
        colors[hex] = color
        return color
    }
    private func context(width: Int, height: Int) throws -> CGContext {
        guard width > 0, height > 0, width <= 8192, height <= 8192,
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw KujiraError.invalid("描画領域を作成できません。") }
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .none
        context.setShouldAntialias(false)
        return context
    }
    private func image(_ image: CGImage, rect: CGRect, context: CGContext) {
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.maxY)
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(origin: .zero, size: rect.size))
        context.restoreGState()
    }
    private func backdropKey(_ viewport: Viewport) -> BackdropKey {
        BackdropKey(width: viewport.width, height: viewport.height, originX: viewport.originX, originY: viewport.originY)
    }
    private func backdrop(_ viewport: Viewport) throws -> CGImage {
        let key = backdropKey(viewport)
        if let cached = backdrops.image(for: key) { return cached }
        let ctx = try context(width: viewport.width, height: viewport.height)
        let layout = engine.assets.configuration.layout
        let w = CGFloat(viewport.width), h = CGFloat(viewport.height), ox = CGFloat(viewport.originX), oy = CGFloat(viewport.originY)
        ctx.setFillColor(try color(layout.ceilingColor ?? "#617e77")); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.setFillColor(try color(layout.floorColor ?? "#8a8d75")); ctx.fill(CGRect(x: 0, y: oy + 203, width: w, height: h - oy - 203))
        if let matte = activeMatte, let info = layout.matte {
            // The matte contains the approved room at (roomX, roomY); the flat colours above
            // only show in the extreme letterbox beyond the matte (very tall/narrow views).
            image(matte, rect: CGRect(x: ox - CGFloat(info.roomX), y: oy - CGFloat(info.roomY),
                                      width: CGFloat(info.width), height: CGFloat(info.height)), context: ctx)
        } else {
            let background = activeBackground
            if ox > 0 {
                guard let left = background.cropping(to: CGRect(x: 0, y: 0, width: 1, height: 270)),
                      let right = background.cropping(to: CGRect(x: 479, y: 0, width: 1, height: 270)) else { throw KujiraError.invalid("背景の端を拡張できません。") }
                image(left, rect: CGRect(x: 0, y: oy, width: ox, height: 270), context: ctx)
                image(right, rect: CGRect(x: ox + 480, y: oy, width: w - ox - 480, height: 270), context: ctx)
            }
            if oy > 0 {
                ctx.setFillColor(try color(layout.ceilingColor ?? "#3b5b5b")); ctx.fill(CGRect(x: 0, y: 0, width: w, height: oy))
                ctx.setFillColor(try color(layout.floorColor ?? "#5c7366")); ctx.fill(CGRect(x: 0, y: oy + 270, width: w, height: h - oy - 270))
            }
            image(background, rect: CGRect(x: ox, y: oy, width: 480, height: 270), context: ctx)
        }
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("背景をキャッシュできません。") }
        backdrops.store(result, for: key)
        return result
    }

    private func wideBackdrop(_ viewport: Viewport) throws -> CGImage {
        let key = backdropKey(viewport)
        if let cached = wideBackdrops.image(for: key) { return cached }
        let width = engine.assets.configuration.stageWidth
        let ctx = try context(width: width, height: viewport.height)
        let layout = engine.assets.configuration.layout
        ctx.setFillColor(try color(layout.ceilingColor ?? "#403f4d")); ctx.fill(CGRect(x: 0, y: 0, width: width, height: viewport.height))
        ctx.setFillColor(try color(layout.floorColor ?? "#866077")); ctx.fill(CGRect(x: 0, y: viewport.originY + 195, width: width, height: viewport.height))
        for quad in try engine.sceneryQuads() {
            ctx.setAlpha(quad.alpha)
            ctx.setFillColor(try color(quad.color))
            ctx.fill(CGRect(x: quad.x, y: quad.y + Double(viewport.originY), width: quad.width, height: quad.height))
        }
        ctx.setAlpha(1)
        image(engine.assets.background, rect: CGRect(x: 120, y: viewport.originY, width: 480, height: 270), context: ctx)
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("横拡張の背景を作れません。") }
        wideBackdrops.store(result, for: key)
        return result
    }

    /// Viewport-sized painted terrace backdrop for the fixed manual arena. The 480×270 art
    /// stays whole; any margins get one flat frame colour instead of a stretched edge
    /// column, matching the Web canvas renderer.
    private func arenaBackdropImage(_ viewport: Viewport) throws -> CGImage? {
        guard let arena = engine.assets.arenaBackdrop else { return nil }
        let key = backdropKey(viewport)
        if let cached = arenaBackdrops.image(for: key) { return cached }
        let ctx = try context(width: viewport.width, height: viewport.height)
        let layout = engine.assets.configuration.layout
        // Must match ARENA_FRAME_COLOR in src/art/scene-profiles.ts; the shared layout
        // normally supplies the value, so this fallback only guards a partial config.
        ctx.setFillColor(try color(layout.arenaFrameColor ?? "#2b2233"))
        ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(viewport.width), height: CGFloat(viewport.height)))
        image(arena, rect: CGRect(x: CGFloat(viewport.originX), y: CGFloat(viewport.originY), width: 480, height: 270), context: ctx)
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("アリーナ背景をキャッシュできません。") }
        arenaBackdrops.store(result, for: key)
        return result
    }
    /// Each generated rival has its own independently loaded sheet/atlas. A nil id keeps
    /// older fixtures on the single Lumie sheet; an unknown id falls back to code drawing.
    private func bossSprite(for command: DrawCommand) -> (frames: [CGImage], atlas: BossAtlas)? {
        if let id = command.bossId {
            if let frames = engine.assets.bossFramesByBoss[id], let atlas = engine.assets.bossAtlasesByBoss[id] {
                return (frames, atlas)
            }
            if id == "lumie", let atlas = engine.assets.bossAtlas { return (engine.assets.bossFrames, atlas) }
            return nil
        }
        if let atlas = engine.assets.bossAtlas { return (engine.assets.bossFrames, atlas) }
        return nil
    }
    private func drawCommands(_ commands: [DrawCommand], in context: CGContext) throws {
        for command in commands {
            if command.kind == "sprite", let sheet = command.sheet, sheet != "hero" {
                let available = sheet == "boss"
                    ? (bossSprite(for: command)?.frames.indices.contains(command.frame ?? -1) ?? false)
                    : engine.assets.poseSprites[sheet]?.frames.indices.contains(command.frame ?? -1) == true
                if !available {
                    // Recurse before translating/setting alpha: fallback is already camera-relative.
                    try drawCommands(command.fallback ?? [], in: context)
                    continue
                }
            }
            context.saveGState()
            defer { context.restoreGState() }
            context.setAlpha(command.alpha); context.translateBy(x: command.x, y: command.y)
            switch command.kind {
            case "rect":
                guard let width = command.width, let height = command.height, let fill = command.color else { throw KujiraError.invalid("仮素材の矩形が不正です。") }
                context.setFillColor(try color(fill))
                if let rotation = command.rotation, rotation != 0 {
                    context.translateBy(x: width / 2, y: height / 2); context.rotate(by: rotation)
                    context.fill(CGRect(x: -width / 2, y: -height / 2, width: width, height: height))
                } else { context.fill(CGRect(x: 0, y: 0, width: width, height: height)) }
            case "sprite":
                let frames: [CGImage], anchor: Anchor, frameWidth: Int, frameHeight: Int
                if command.sheet == "boss", let sprite = bossSprite(for: command) {
                    frames = sprite.frames; anchor = sprite.atlas.anchor
                    frameWidth = sprite.atlas.frameWidth; frameHeight = sprite.atlas.frameHeight
                } else if let name = command.sheet, let sprite = engine.assets.poseSprites[name] {
                    frames = sprite.frames; anchor = sprite.atlas.anchor; frameWidth = sprite.atlas.frameWidth; frameHeight = sprite.atlas.frameHeight
                } else {
                    let atlas = engine.assets.configuration.atlas
                    frames = engine.assets.frames; anchor = atlas.anchor; frameWidth = atlas.frameWidth; frameHeight = atlas.frameHeight
                }
                guard let frame = command.frame, frames.indices.contains(frame), let facing = command.facing, abs(facing) == 1 else { throw KujiraError.invalid("ゲームのキャラコマが不正です。") }
                context.rotate(by: command.rotation ?? 0); context.scaleBy(x: Double(facing) * (command.scaleX ?? 1), y: command.scaleY ?? 1)
                image(frames[frame], rect: CGRect(x: -anchor.x, y: -anchor.y, width: Double(frameWidth), height: Double(frameHeight)), context: context)
            case "text":
                guard let text = command.text, let fill = command.color, let size = command.size, size >= 5, size <= 24 else { throw KujiraError.invalid("ゲームの文字が不正です。") }
                let font: CTFont
                if let cached = fonts[size] { font = cached }
                else { font = CTFontCreateWithName("HiraginoSans-W3" as CFString, size, nil); fonts[size] = font }
                let attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): font, NSAttributedString.Key(kCTForegroundColorAttributeName as String): try color(fill)]
                let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes) as CFAttributedString)
                context.translateBy(x: 0, y: size); context.scaleBy(x: 1, y: -1); context.textMatrix = .identity
                CTLineDraw(line, context)
            default: throw KujiraError.invalid("不明なゲーム描画命令です。")
            }
        }
    }

    /// The caller supplies a top-left-origin context (NSView.isFlipped or bitmap()).
    public func draw(_ plan: ScenePlan, width: Double, height: Double, in context: CGContext) throws {
        guard width > 0, height > 0 else { return }
        guard (0..<engine.assets.frames.count).contains(plan.frame), abs(plan.facing) == 1 else { throw KujiraError.invalid("描画フレームが不正です。") }
        // The viewport is a pure function of the size; memoize it so steady-state
        // wallpaper frames skip a JavaScriptCore round-trip per view per tick.
        let size = ViewportSize(width: Int(width.rounded()), height: Int(height.rounded()))
        let viewport: Viewport
        if let cached = viewports[size] { viewport = cached }
        else {
            viewport = try engine.viewport(width: width, height: height)
            if viewports.count >= 8 { viewports.removeAll(keepingCapacity: true) }
            viewports[size] = viewport
        }
        let background = try backdrop(viewport)
        context.saveGState()
        defer { context.restoreGState() }
        context.interpolationQuality = .none
        context.setShouldAntialias(false)
        // Paint the edge pixels in the room colours, then draw the whole scene on one uniform
        // pixel grid. Whole-number scales keep every source pixel the same physical size.
        let layout = engine.assets.configuration.layout
        context.setFillColor(try color(layout.ceilingColor ?? "#617e77"))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.translateBy(x: CGFloat(viewport.offsetX), y: CGFloat(viewport.offsetY))
        context.scaleBy(x: CGFloat(viewport.scale), y: CGFloat(viewport.scale))
        image(background, rect: CGRect(x: 0, y: 0, width: Double(viewport.width), height: Double(viewport.height)), context: context)
        if let battle = plan.battle, battle.room != true {
            if battle.arena == true, let arena = try arenaBackdropImage(viewport) {
                image(arena, rect: CGRect(x: 0, y: 0, width: Double(viewport.width), height: Double(viewport.height)), context: context)
            } else {
                image(try wideBackdrop(viewport), rect: CGRect(x: Double(viewport.originX) - battle.cameraX, y: 0, width: Double(engine.assets.configuration.stageWidth), height: Double(viewport.height)), context: context)
            }
        }
        context.translateBy(x: CGFloat(viewport.originX), y: CGFloat(viewport.originY))
        for quad in plan.quads {
            context.setAlpha(quad.alpha)
            context.setFillColor(try color(quad.color))
            context.fill(CGRect(x: quad.x, y: quad.y, width: quad.width, height: quad.height))
        }
        context.setAlpha(1)
        if let battle = plan.battle { try drawCommands(battle.commands, in: context) }
        else {
            context.saveGState()
            let motion = plan.motion
            context.translateBy(x: plan.x + (motion?.offsetX ?? 0), y: plan.floorY - (motion?.lift ?? 0))
            if let rotation = motion?.rotation, rotation != 0 { context.rotate(by: rotation) }
            context.scaleBy(x: CGFloat(plan.facing) * (motion?.scaleX ?? 1), y: motion?.scaleY ?? 1)
            // Apply one identical foot-pivot transform to either sheet, never both.
            // Keep the old16 guard above even when a loaded life frame is selected.
            if let frame = plan.lifeFrame, let sprite = engine.assets.lifeSprite, sprite.frames.indices.contains(frame) {
                let atlas = sprite.atlas
                image(sprite.frames[frame], rect: CGRect(x: -atlas.anchor.x, y: -atlas.anchor.y,
                                                         width: Double(atlas.frameWidth), height: Double(atlas.frameHeight)), context: context)
            } else {
                let atlas = engine.assets.configuration.atlas
                image(engine.assets.frames[plan.frame], rect: CGRect(x: -atlas.anchor.x, y: -atlas.anchor.y,
                                                                    width: Double(atlas.frameWidth), height: Double(atlas.frameHeight)), context: context)
            }
            context.restoreGState()
        }
        if let overlay = plan.overlay { try drawCommands(overlay, in: context) }
    }
    public func bitmap(_ plan: ScenePlan, width: Int, height: Int) throws -> CGImage {
        let ctx = try context(width: width, height: height)
        try draw(plan, width: Double(width), height: Double(height), in: ctx)
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("画像を書き出せません。") }
        return result
    }
    public static func writePNG(_ image: CGImage, to url: URL) throws {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw KujiraError.invalid("PNG出力先を作成できません。") }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw KujiraError.invalid("PNGを保存できません。") }
    }
    /// Drop the battle backdrop caches when the manual battle is over (several MB at 2048×864).
    public func releaseBattleBackdrops() {
        guard !wideBackdrops.isEmpty || !arenaBackdrops.isEmpty else { return }
        wideBackdrops.removeAll()
        arenaBackdrops.removeAll()
    }

    public func makeIcon(size: Int) throws -> CGImage {
        let ctx = try context(width: size, height: size)
        ctx.scaleBy(x: Double(size) / 1024, y: Double(size) / 1024)
        ctx.setShouldAntialias(true)
        ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 1024, height: 1024), cornerWidth: 185, cornerHeight: 185, transform: nil))
        ctx.setFillColor(try color("#1a2030")); ctx.fillPath()
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: CGRect(x: 20, y: 20, width: 984, height: 984), cornerWidth: 172, cornerHeight: 172, transform: nil))
        ctx.setStrokeColor(try color("#95829f")); ctx.setLineWidth(8); ctx.strokePath()
        ctx.restoreGState()
        ctx.setShouldAntialias(false)
        ctx.setFillColor(try color("#40465e"))
        for index in 0..<5 { ctx.fill(CGRect(x: 80 + index * 175, y: 850 + index % 2 * 25, width: 150, height: 10)) }
        let atlas = engine.assets.configuration.atlas
        let scale = min(8.0, 880.0 / Double(atlas.frameHeight))
        image(engine.assets.frames[0], rect: CGRect(x: 512 - atlas.anchor.x * scale, y: 960 - atlas.anchor.y * scale,
                                                   width: Double(atlas.frameWidth) * scale, height: Double(atlas.frameHeight) * scale), context: ctx)
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("アイコンを作成できません。") }
        return result
    }
}
