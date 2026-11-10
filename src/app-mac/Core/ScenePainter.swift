import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CoreText

@MainActor
public final class ScenePainter {
    public let engine: SceneEngine
    private var backdrops: [Viewport: CGImage] = [:]
    private var colors: [String: CGColor] = [:]
    private var wideBackdrops: [Viewport: CGImage] = [:]
    private var fonts: [Double: CTFont] = [:]
    public init(engine: SceneEngine) { self.engine = engine }

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
    private func backdrop(_ viewport: Viewport) throws -> CGImage {
        if let cached = backdrops[viewport] { return cached }
        let ctx = try context(width: viewport.width, height: viewport.height)
        let layout = engine.assets.configuration.layout
        let w = CGFloat(viewport.width), h = CGFloat(viewport.height), ox = CGFloat(viewport.originX), oy = CGFloat(viewport.originY)
        ctx.setFillColor(try color(layout.ceilingColor ?? "#617e77")); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.setFillColor(try color(layout.floorColor ?? "#8a8d75")); ctx.fill(CGRect(x: 0, y: oy + 203, width: w, height: h - oy - 203))
        let background = engine.assets.background
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
        guard let result = ctx.makeImage() else { throw KujiraError.invalid("背景をキャッシュできません。") }
        if backdrops.count >= 4 { backdrops.removeAll(keepingCapacity: true) }
        backdrops[viewport] = result
        return result
    }

    private func wideBackdrop(_ viewport: Viewport) throws -> CGImage {
        if let cached = wideBackdrops[viewport] { return cached }
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
        if wideBackdrops.count >= 4 { wideBackdrops.removeAll(keepingCapacity: true) }
        wideBackdrops[viewport] = result
        return result
    }
    private func drawCommands(_ commands: [DrawCommand], in context: CGContext) throws {
        for command in commands {
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
                guard let frame = command.frame, (0..<engine.assets.frames.count).contains(frame), let facing = command.facing, abs(facing) == 1 else { throw KujiraError.invalid("ゲームのキャラコマが不正です。") }
                context.rotate(by: command.rotation ?? 0); context.scaleBy(x: Double(facing) * (command.scaleX ?? 1), y: command.scaleY ?? 1)
                let atlas = engine.assets.configuration.atlas
                image(engine.assets.frames[frame], rect: CGRect(x: -atlas.anchor.x, y: -atlas.anchor.y, width: Double(atlas.frameWidth), height: Double(atlas.frameHeight)), context: context)
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
        let viewport = try engine.viewport(width: width, height: height)
        let background = try backdrop(viewport)
        context.saveGState()
        defer { context.restoreGState() }
        context.interpolationQuality = .none
        context.setShouldAntialias(false)
        context.scaleBy(x: width / Double(viewport.width), y: height / Double(viewport.height))
        image(background, rect: CGRect(x: 0, y: 0, width: viewport.width, height: viewport.height), context: context)
        if let battle = plan.battle {
            image(try wideBackdrop(viewport), rect: CGRect(x: Double(viewport.originX) - battle.cameraX, y: 0, width: Double(engine.assets.configuration.stageWidth), height: Double(viewport.height)), context: context)
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
            context.translateBy(x: plan.x, y: plan.floorY)
            context.scaleBy(x: CGFloat(plan.facing), y: 1)
            let atlas = engine.assets.configuration.atlas
            image(engine.assets.frames[plan.frame], rect: CGRect(x: -atlas.anchor.x, y: -atlas.anchor.y, width: Double(atlas.frameWidth), height: Double(atlas.frameHeight)), context: context)
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
