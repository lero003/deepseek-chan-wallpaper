import AppKit
import KujiraCore

@MainActor
final class FightersControls: NSObject {
    let view = NSStackView()
    private let modeLabel = NSTextField(labelWithString: "ときどき、小さなお片付け。")
    private let health = NSTextField(labelWithString: "")
    private let manualRow = NSStackView()
    private let onCommand: (String) -> Void
    private var buttons: [String: NSButton] = [:]
    init(onCommand: @escaping (String) -> Void) {
        self.onCommand = onCommand
        super.init()
        modeLabel.font = .systemFont(ofSize: 10); modeLabel.textColor = .secondaryLabelColor
        modeLabel.lineBreakMode = .byTruncatingTail
        health.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        health.setContentHuggingPriority(.required, for: .horizontal)
        let modeRow = NSStackView(views: [modeLabel, NSView(), button("事件を見る", "demo"), button("遊ぶ", "play"), button("もう一度遊ぶ", "retry"), button("壁紙へ戻る", "home")])
        modeRow.orientation = .horizontal; modeRow.spacing = 9; modeRow.alignment = .centerY
        manualRow.orientation = .horizontal; manualRow.spacing = 9; manualRow.alignment = .centerY
        for child in [health, NSView(), button("攻撃 J", "attack"), button("回避 K", "dodge"), button("必殺 L", "special"), button("ポーズ Esc", "pause")] { manualRow.addArrangedSubview(child) }
        view.orientation = .vertical; view.alignment = .leading; view.spacing = 7
        view.addArrangedSubview(modeRow); view.addArrangedSubview(manualRow)
        modeRow.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true
        manualRow.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true
        manualRow.isHidden = true; buttons["retry"]?.isHidden = true; buttons["home"]?.isHidden = true
    }
    private func button(_ title: String, _ command: String) -> NSButton {
        let button = NSButton(title: title, target: self, action: #selector(pressed(_:)))
        button.identifier = NSUserInterfaceItemIdentifier(command)
        button.font = .systemFont(ofSize: 11)
        buttons[command] = button
        return button
    }
    @objc private func pressed(_ sender: NSButton) { if let command = sender.identifier?.rawValue { onCommand(command) } }
    func update(_ state: GameUI?, enabled: Bool) {
        guard let state else { return }
        let manual = state.manual, result = state.phase == "result" || state.phase == "retry"
        manualRow.isHidden = !manual
        buttons["play"]?.isHidden = manual; buttons["demo"]?.isHidden = manual
        buttons["home"]?.isHidden = !manual; buttons["retry"]?.isHidden = !result
        buttons["play"]?.isEnabled = enabled
        buttons["demo"]?.isEnabled = enabled && state.phase == "rest"
        buttons["retry"]?.isEnabled = enabled
        buttons["pause"]?.title = state.paused ? "再開 Esc" : "ポーズ Esc"
        buttons["pause"]?.isEnabled = enabled && !result
        buttons["attack"]?.isEnabled = enabled && !state.paused && !result
        buttons["dodge"]?.isEnabled = enabled && !state.paused && !result && state.dodgeReady
        buttons["special"]?.isEnabled = enabled && !state.paused && !result && state.specialReady
        modeLabel.stringValue = manual ? "WASD / 矢印で移動 · J/Z 攻撃 · K/X 回避 · L/C 必殺" : state.phase == "rest" ? "ときどき、小さなお片付け。仮素材MVP・音なし" : "小事件：\(state.phaseLabel)"
        health.stringValue = "HP \(state.hp)/5   夕凪 \(state.gauge)/100"
    }
}
