import AppKit
import KujiraCore

/// A pure picture surface: the quiet wallpaper never takes keyboard or mouse input.
@MainActor
final class SceneView: NSView {
    private let painter: ScenePainter
    private let plan: () -> ScenePlan
    private let onFailure: (String) -> Void
    private var reportedFailure = false
    override var isFlipped: Bool { true }
    override var isOpaque: Bool { true }
    override var acceptsFirstResponder: Bool { false }

    init(painter: ScenePainter, plan: @escaping () -> ScenePlan, onFailure: @escaping (String) -> Void,
         wallpaper: Bool = false) {
        self.painter = painter; self.plan = plan; self.onFailure = onFailure
        super.init(frame: .zero)
        wantsLayer = true
        setAccessibilityRole(.image)
        setAccessibilityLabel(painter.engine.assets.configuration.layout.description)
        // A click-through wallpaper picture must not read out interaction instructions.
        setAccessibilityHelp(wallpaper
            ? "壁紙として表示中です。クリックは透過します。操作はメニューバーの「くじら」メニューから。"
            : "眺めるための風景です。操作はツールバーとメニューバーの「くじら」メニューから。")
    }
    required init?(coder: NSCoder) { nil }
    override func draw(_ dirtyRect: NSRect) {
        guard bounds.width > 0, bounds.height > 0, let context = NSGraphicsContext.current?.cgContext else { return }
        do { try painter.draw(plan(), width: bounds.width, height: bounds.height, in: context) }
        catch {
            guard !reportedFailure else { return }
            reportedFailure = true
            let message = error.localizedDescription
            Task { @MainActor [weak self] in self?.onFailure(message) }
        }
    }
}

@MainActor
final class WallpaperPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
