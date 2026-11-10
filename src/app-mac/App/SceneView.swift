import AppKit
import KujiraCore

@MainActor
final class SceneView: NSView {
    private let painter: ScenePainter
    private let plan: () -> ScenePlan
    private let onFailure: (String) -> Void
    private let inputAllowed: () -> Bool
    private let movement: (Double, Double) -> Void
    private let action: (String) -> Void
    private var held = HeldGameKeys()
    private var reportedFailure = false
    override var isFlipped: Bool { true }
    override var isOpaque: Bool { true }
    override var acceptsFirstResponder: Bool { inputAllowed() }

    init(painter: ScenePainter, plan: @escaping () -> ScenePlan, onFailure: @escaping (String) -> Void,
         inputAllowed: @escaping () -> Bool = { false }, movement: @escaping (Double, Double) -> Void = { _, _ in },
         action: @escaping (String) -> Void = { _ in }) {
        self.painter = painter; self.plan = plan; self.onFailure = onFailure
        self.inputAllowed = inputAllowed; self.movement = movement; self.action = action
        super.init(frame: .zero)
        wantsLayer = true
        setAccessibilityRole(.image)
        setAccessibilityLabel(painter.engine.assets.configuration.layout.description)
        setAccessibilityHelp("手動時はWASDまたは矢印で移動、Jで攻撃、Kで回避、Lで必殺技、Escでポーズ。")
    }
    required init?(coder: NSCoder) { nil }
    func releaseKeys() { held.clear(); movement(0, 0) }
    override func resignFirstResponder() -> Bool { releaseKeys(); return super.resignFirstResponder() }
    override func mouseDown(with event: NSEvent) {
        if inputAllowed() { window?.makeFirstResponder(self) } else { super.mouseDown(with: event) }
    }
    override func keyDown(with event: NSEvent) {
        guard inputAllowed(), window?.isKeyWindow == true,
              event.modifierFlags.intersection([.command, .control, .option]).isEmpty,
              let name = GameKeys.name(for: event.keyCode) else { super.keyDown(with: event); return }
        if GameKeys.isMovement(name) {
            held.update(event.keyCode, down: true); let d = held.direction; movement(d.x, d.y)
        } else if !event.isARepeat {
            if name == "pause" { releaseKeys() }
            action(name)
        }
    }
    override func keyUp(with event: NSEvent) {
        guard let name = GameKeys.name(for: event.keyCode), GameKeys.isMovement(name) else { super.keyUp(with: event); return }
        held.update(event.keyCode, down: false); let d = held.direction; movement(d.x, d.y)
    }
    override func flagsChanged(with event: NSEvent) {
        if !event.modifierFlags.intersection([.command, .control, .option]).isEmpty { releaseKeys() }
        super.flagsChanged(with: event)
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
