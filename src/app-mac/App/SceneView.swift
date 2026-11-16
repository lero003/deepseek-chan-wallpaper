import AppKit
import KujiraCore

/// Only the foreground preview can accept input. Wallpaper panels stay click-through.
@MainActor
final class SceneView: NSView {
    private let painter: ScenePainter
    private let plan: () -> ScenePlan
    private let onFailure: (String) -> Void
    private var reportedFailure = false
    private let wallpaper: Bool
    var onKey: ((UInt16, Bool, Bool) -> Bool)?
    var onFocusChanged: (() -> Void)?
    override var isFlipped: Bool { true }
    override var isOpaque: Bool { true }
    override var acceptsFirstResponder: Bool { !wallpaper }

    init(painter: ScenePainter, plan: @escaping () -> ScenePlan, onFailure: @escaping (String) -> Void,
         wallpaper: Bool = false) {
        self.painter = painter; self.plan = plan; self.onFailure = onFailure
        self.wallpaper = wallpaper
        super.init(frame: .zero)
        wantsLayer = true
        setAccessibilityRole(.image)
        setAccessibilityLabel(painter.engine.assets.configuration.layout.description)
        // A click-through wallpaper picture must not read out interaction instructions.
        setAccessibilityHelp(wallpaper
            ? "壁紙として表示中です。クリックは透過します。操作はメニューバーの「くじら」メニューから。"
            : "手動対戦ではクリックして操作。矢印・WASDで移動、Jで攻撃、Kで回避、Lで必殺技。")
    }
    required init?(coder: NSCoder) { nil }
    override func becomeFirstResponder() -> Bool { onFocusChanged?(); return !wallpaper }
    override func resignFirstResponder() -> Bool { onFocusChanged?(); return true }
    override func mouseDown(with event: NSEvent) { if !wallpaper { window?.makeFirstResponder(self) } }
    override func keyDown(with event: NSEvent) {
        if !event.modifierFlags.intersection([.command, .control, .option]).isEmpty { super.keyDown(with: event); return }
        if onKey?(event.keyCode, true, event.isARepeat) != true { super.keyDown(with: event) }
    }
    override func keyUp(with event: NSEvent) {
        if onKey?(event.keyCode, false, false) != true { super.keyUp(with: event) }
    }
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
