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
        let modeRow = NSStackView(views: [modeLabel, NSView(), button("呼んでみる", "call"), button("対戦を見る", "demo"), button("テラスで3連戦", "play"), button("もう一戦", "retry"), button("書斎へ戻る", "home")])
        modeRow.orientation = .horizontal; modeRow.spacing = 9; modeRow.alignment = .centerY
        manualRow.orientation = .horizontal; manualRow.spacing = 9; manualRow.alignment = .centerY
        for child in [health, NSView(), button("攻撃 J", "attack"), button("回避 K", "dodge"), button("必殺 L", "special"), button("ポーズ Esc", "pause")] { manualRow.addArrangedSubview(child) }
        view.orientation = .vertical; view.alignment = .leading; view.spacing = 7
        view.addArrangedSubview(modeRow); view.addArrangedSubview(manualRow)
        modeRow.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true
        manualRow.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true
        manualRow.isHidden = true; buttons["retry"]?.isHidden = true; buttons["home"]?.isHidden = true; buttons["call"]?.isHidden = true
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
        let fighting = state.phase == "battle" || state.phase == "boss"
        let autoRest = !manual && state.phase == "rest"
        manualRow.isHidden = !manual
        buttons["play"]?.isHidden = manual; buttons["demo"]?.isHidden = manual
        buttons["home"]?.isHidden = !manual; buttons["retry"]?.isHidden = !result
        // B03: the call button lives only in the quiet study (auto + rest); manual keeps its combat row.
        buttons["call"]?.isHidden = !autoRest
        let callEnabled = enabled && (state.callReady ?? false)
        buttons["call"]?.isEnabled = callEnabled
        let callReason = state.callReason ?? ""
        let callHint = callEnabled || callReason.isEmpty ? "DeepSeekちゃんに呼びかけます。小さな応答はプレビューだけ。" : callReason
        buttons["call"]?.toolTip = callHint
        buttons["call"]?.setAccessibilityHelp(callHint)
        buttons["play"]?.isEnabled = enabled
        buttons["demo"]?.isEnabled = enabled && state.phase == "rest"
        buttons["retry"]?.isEnabled = enabled
        buttons["retry"]?.title = state.phase == "retry" ? "このラウンドを再挑戦" : "もう一戦"
        buttons["pause"]?.title = state.paused ? "再開 Esc" : "ポーズ Esc"
        buttons["pause"]?.isEnabled = enabled && !result
        buttons["attack"]?.isEnabled = enabled && !state.paused && fighting
        buttons["dodge"]?.isEnabled = enabled && !state.paused && fighting && state.dodgeReady
        buttons["special"]?.isEnabled = enabled && !state.paused && fighting && state.specialReady
        // B04: auto mode shows the shared companion line (call > homecoming > bout > quiet life).
        // Manual keeps the round/phase readout. The footer statusLabel owns the playback/stop reason.
        if manual {
            modeLabel.stringValue = "R\(state.round)/\(state.rounds) · \(state.roundLabel) · \(state.paused ? "ひと休み中" : state.phaseLabel)"
        } else {
            let line = state.companionLine ?? ""
            modeLabel.stringValue = line.isEmpty
                ? (state.phase == "rest" ? "静かな書斎。気分転換に、テラスで3連戦。" : "自動対戦：\(state.phaseLabel)")
                : line
        }
        health.stringValue = "HP \(state.hp)/5  夕凪 \(state.gauge)/100  SCORE \(state.arcade.score)  TIME \(state.arcade.secondsLeft)"
        modeLabel.toolTip = manual
            ? "WASD / 矢印で間合いを調整 · J/Z 攻撃 · K/X 回避 · L/C 必殺"
            : "同居人のいま（プレビュー専用・壁紙に文字は出ません）。雑魚戦2回 → 綴星リュミエとの一騎打ち → 書斎へ。壁紙の自動対戦にはボスは現れません。"
    }
}
