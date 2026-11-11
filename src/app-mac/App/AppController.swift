import AppKit
import CoreGraphics
import KujiraCore

@MainActor
final class AppController: NSObject, NSWindowDelegate {
    let assets: Assets
    let engine: SceneEngine
    let painter: ScenePainter
    private(set) var plan: ScenePlan
    private var wallpaperPlan: ScenePlan
    private var previewScene: SceneView?
    private var fightersControls: FightersControls?
    private var manualInputFocus = false
    private var playItem: NSMenuItem?
    private var homeItem: NSMenuItem?
    private var effectsItem: NSMenuItem?
    private var frequencyItems: [String: NSMenuItem] = [:]
    private(set) var policy = PlaybackPolicy()
    private let persistSettings: Bool
    private var clock = FrameClock()
    private var timer: Timer?
    private var timerFPS = 0
    private var previewWindow: NSWindow?
    private var previewRequested = false
    private var wallpaperWindow: WallpaperPanel?
    private var wallpaperView: SceneView?
    private var views: [SceneView] = []
    private var statusItem: NSStatusItem?
    private var pauseItem: NSMenuItem?
    private var wallpaperItem: NSMenuItem?
    private var lowPowerItem: NSMenuItem?
    private var pauseButton: NSButton?
    private var wallpaperButton: NSButton?
    private var lowPowerButton: NSButton?
    private var statusLabel: NSTextField?
    private var memoryItem: NSMenuItem?
    private var memoryProbeTick = 0
    private var backgroundVariantIndex = 0
    private var backgroundPopup: NSPopUpButton?
    private var backgroundItems: [NSMenuItem] = []
    private var observers: [(NotificationCenter, NSObjectProtocol)] = []
    private var systemSleeping = false
    private var displaysSleeping = false
    private var failed = false
    private var modalOpen = false

    init(assets: Assets, persistSettings: Bool) throws {
        self.assets = assets
        let engine = try SceneEngine(assets: assets)
        self.engine = engine
        self.painter = ScenePainter(engine: engine)
        let initial = try engine.snapshot()
        self.plan = initial
        self.wallpaperPlan = initial
        self.persistSettings = persistSettings
        super.init()
        if persistSettings {
            policy.manuallyPaused = UserDefaults.standard.bool(forKey: "manuallyPaused")
            policy.userLowPower = UserDefaults.standard.bool(forKey: "userLowPower")
            if let frequency = UserDefaults.standard.string(forKey: "encounterFrequency"), ["off", "low", "normal"].contains(frequency) { try engine.command("frequency", value: frequency) }
            if let low = UserDefaults.standard.object(forKey: "effectsLow") as? Bool { try engine.command("effects", value: low) }
            if let saved = UserDefaults.standard.string(forKey: "wallpaperVariant"),
               let index = assets.variants.firstIndex(where: { $0.id == saved }) {
                try painter.selectVariant(index + 1)
                backgroundVariantIndex = index + 1
            }
            self.plan = try engine.snapshot(); self.wallpaperPlan = self.plan
        }
    }

    func start(activate: Bool) {
        installMenus()
        installObservers()
        showPreview(activate: activate)
    }

    private func makeSceneView(wallpaper: Bool = false) -> SceneView {
        let initial = plan
        let view = SceneView(painter: painter, plan: { [weak self] in
            guard let self else { return initial }
            return wallpaper ? self.wallpaperPlan : self.plan
        }, onFailure: { [weak self] in self?.fail($0) }, inputAllowed: { [weak self] in !wallpaper && self?.gameInputEnabled == true },
        movement: { [weak self] x, y in self?.gameMovement(x: x, y: y) }, action: { [weak self] name in self?.performGameCommand(name) })
        views.append(view)
        return view
    }
    @objc func openPreview(_ sender: Any? = nil) { showPreview(activate: true) }
    func showPreview(activate: Bool) {
        if previewWindow == nil { createPreview() }
        previewRequested = true
        if activate { previewWindow?.makeKeyAndOrderFront(nil); NSApp.activate() }
        else { previewWindow?.orderBack(nil) }
        synchronize()
    }
    private func createPreview() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 680),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "くじらの散歩道 — 個人用ローカル試作"
        window.minSize = NSSize(width: 720, height: 470)
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.delegate = self
        window.center()
        let root = NSView()
        window.contentView = root
        let title = NSTextField(labelWithString: assets.configuration.layout.label)
        title.font = .systemFont(ofSize: 14, weight: .medium)
        title.setContentHuggingPriority(.required, for: .horizontal)
        let spacer = NSView()
        let backgrounds = NSPopUpButton(frame: .zero, pullsDown: false)
        backgrounds.addItems(withTitles: ["夕凪の書斎"] + assets.variants.map(\.label))
        backgrounds.selectItem(at: backgroundVariantIndex)
        backgrounds.target = self; backgrounds.action = #selector(changeBackgroundPopup(_:))
        backgrounds.toolTip = "壁紙の背景を切り替えます（夕凪・月夜・雨音）"
        backgrounds.setContentHuggingPriority(.required, for: .horizontal)
        backgroundPopup = backgrounds
        let pause = NSButton(title: "一時停止", target: self, action: #selector(togglePause(_:)))
        let wallpaper = NSButton(title: "壁紙にする", target: self, action: #selector(toggleWallpaper(_:)))
        wallpaper.toolTip = "主画面にだけ表示します。元の壁紙設定は変更しません。"
        let lowPower = NSButton(checkboxWithTitle: "省電力", target: self, action: #selector(toggleLowPower(_:)))
        let about = NSButton(title: "作品について", target: self, action: #selector(showAbout(_:)))
        let toolbar = NSStackView(views: [title, spacer, backgrounds, lowPower, pause, wallpaper, about])
        toolbar.orientation = .horizontal; toolbar.spacing = 12
        toolbar.alignment = .centerY
        let scene = makeSceneView()
        previewScene = scene
        let gameControls = FightersControls(onCommand: { [weak self] in self?.performGameCommand($0) })
        fightersControls = gameControls
        let gameBar = gameControls.view
        let note = NSTextField(labelWithString: "非公式ファン作品・個人用試作。初回はプレビューのみ／壁紙ONは自分で選択。公開・再配布許諾は未確認です。")
        note.font = .systemFont(ofSize: 10)
        note.textColor = .secondaryLabelColor
        note.lineBreakMode = .byTruncatingTail
        let status = NSTextField(labelWithString: "準備中")
        status.font = .systemFont(ofSize: 10)
        status.textColor = .secondaryLabelColor
        let footer = NSStackView(views: [note, NSView(), status])
        footer.orientation = .horizontal; footer.spacing = 12
        for view in [toolbar, scene, gameBar, footer] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        NSLayoutConstraint.activate([
            toolbar.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            toolbar.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            toolbar.topAnchor.constraint(equalTo: root.topAnchor, constant: 12), toolbar.heightAnchor.constraint(equalToConstant: 32),
            scene.leadingAnchor.constraint(equalTo: root.leadingAnchor), scene.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            scene.topAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: 12),
            scene.bottomAnchor.constraint(equalTo: gameBar.topAnchor, constant: -10),
            gameBar.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16), gameBar.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            gameBar.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -10),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16), footer.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -10), footer.heightAnchor.constraint(equalToConstant: 18)
        ])
        pauseButton = pause; wallpaperButton = wallpaper; lowPowerButton = lowPower; statusLabel = status
        previewWindow = window
    }

    private var canStartGame: Bool {
        !policy.reducedMotion && !policy.manuallyPaused && !policy.sleeping && policy.sessionActive && !modalOpen && !policy.terminating && !failed
    }
    private var gameInputEnabled: Bool {
        canStartGame && plan.game?.manual == true && previewRequested && previewWindow?.isKeyWindow == true
    }
    private func refreshPlans() throws {
        plan = try engine.snapshot(decorations: !policy.reducedMotion)
        wallpaperPlan = try engine.snapshot(decorations: !policy.reducedMotion, presentation: "wallpaper")
    }
    private func synchronizeGameFocus() throws {
        let focused = gameInputEnabled
        if focused != manualInputFocus {
            manualInputFocus = focused
            if !focused { previewScene?.releaseKeys() }
            try engine.setManualFocus(focused)
        }
    }
    private func gameMovement(x: Double, y: Double) {
        guard !policy.terminating else { return }
        do { try engine.setMovement(x: x, y: y) } catch { fail(error.localizedDescription) }
    }
    private func performGameCommand(_ name: String) {
        guard !failed, !policy.terminating, name == "home" || canStartGame else { return }
        if ["attack", "dodge", "special", "pause"].contains(name) && !gameInputEnabled { return }
        do {
            try engine.command(name)
            try refreshPlans()
            if name == "play" || name == "retry" { showPreview(activate: true) }
            synchronize()
            if plan.game?.manual == true, let scene = previewScene { previewWindow?.makeFirstResponder(scene) }
            else { previewScene?.releaseKeys() }
        } catch { fail(error.localizedDescription) }
    }
    @objc private func changeBackgroundPopup(_ sender: NSPopUpButton) { applyBackground(sender.indexOfSelectedItem) }
    @objc private func setBackgroundMenu(_ sender: NSMenuItem) { applyBackground(sender.tag) }
    private func applyBackground(_ index: Int) {
        guard index >= 0, index <= assets.variants.count else { return }
        do { try painter.selectVariant(index) } catch { fail(error.localizedDescription); return }
        backgroundVariantIndex = index
        if persistSettings {
            if index == 0 { UserDefaults.standard.removeObject(forKey: "wallpaperVariant") }
            else { UserDefaults.standard.set(assets.variants[index - 1].id, forKey: "wallpaperVariant") }
        }
        for view in views { view.needsDisplay = true }
        synchronize()
    }
    @objc private func startPlaying(_ sender: Any?) { performGameCommand("play") }
    @objc private func goHome(_ sender: Any?) { performGameCommand("home") }
    @objc private func setFrequency(_ sender: NSMenuItem) {
        guard let frequency = sender.representedObject as? String, ["off", "low", "normal"].contains(frequency) else { return }
        do {
            try engine.command("frequency", value: frequency)
            if persistSettings { UserDefaults.standard.set(frequency, forKey: "encounterFrequency") }
            synchronize()
        } catch { fail(error.localizedDescription) }
    }
    @objc private func toggleEffects(_ sender: Any?) {
        let low = !(plan.game?.effectsLow ?? true)
        do {
            try engine.command("effects", value: low)
            if persistSettings { UserDefaults.standard.set(low, forKey: "effectsLow") }
            synchronize()
        } catch { fail(error.localizedDescription) }
    }
    private func updateFighterControls() {
        fightersControls?.update(plan.game, enabled: canStartGame)
        playItem?.isEnabled = canStartGame && plan.game?.manual != true
        homeItem?.isEnabled = plan.game?.manual == true || (plan.game?.phase != "rest" && plan.game != nil)
        effectsItem?.state = plan.game?.effectsLow == false ? .off : .on
        for (frequency, item) in frequencyItems { item.state = plan.game?.frequency == frequency ? .on : .off }
    }

    private func installMenus() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "くじら"
        item.button?.setAccessibilityLabel("くじらの散歩道の操作")
        let menu = NSMenu(); menu.autoenablesItems = false
        func add(_ title: String, _ action: Selector?, key: String = "") -> NSMenuItem {
            let entry = NSMenuItem(title: title, action: action, keyEquivalent: key); entry.target = self
            menu.addItem(entry); return entry
        }
        let heading = add("くじらの散歩道（個人用試作）", nil); heading.isEnabled = false
        memoryItem = add("メモリ使用量（プロセス）: 計測中", nil)
        memoryItem?.isEnabled = false
        _ = add("プレビューを開く", #selector(openPreview(_:)))
        wallpaperItem = add("壁紙を表示（主画面のみ）", #selector(toggleWallpaper(_:)))
        let backgroundMenu = NSMenu(title: "背景"); backgroundMenu.autoenablesItems = false
        let backgroundParent = add("背景", nil); backgroundParent.submenu = backgroundMenu
        for (index, label) in (["夕凪の書斎（標準）"] + assets.variants.map(\.label)).enumerated() {
            let entry = NSMenuItem(title: label, action: #selector(setBackgroundMenu(_:)), keyEquivalent: "")
            entry.target = self; entry.tag = index; backgroundMenu.addItem(entry); backgroundItems.append(entry)
        }
        pauseItem = add("一時停止", #selector(togglePause(_:)))
        lowPowerItem = add("省電力にする", #selector(toggleLowPower(_:)))
        menu.addItem(.separator())
        playItem = add("ファイターズを遊ぶ", #selector(startPlaying(_:)))
        homeItem = add("壁紙へ戻る", #selector(goHome(_:)))
        let frequencyMenu = NSMenu(title: "自動対戦の頻度"); frequencyMenu.autoenablesItems = false
        let frequencyParent = add("自動対戦の頻度", nil); frequencyParent.submenu = frequencyMenu
        for (value, title) in [("low", "少なめ（3〜5分）"), ("normal", "通常（1.5〜2.5分）"), ("off", "対戦なし")] {
            let entry = NSMenuItem(title: title, action: #selector(setFrequency(_:)), keyEquivalent: "")
            entry.target = self; entry.representedObject = value; frequencyMenu.addItem(entry); frequencyItems[value] = entry
        }
        effectsItem = add("エフェクト控えめ", #selector(toggleEffects(_:)))
        menu.addItem(.separator())
        _ = add("作品について・クレジット", #selector(showAbout(_:)))
        let quit = add("終了", #selector(NSApplication.terminate(_:)), key: "q"); quit.target = NSApp
        item.menu = menu; statusItem = item
        let mainMenu = NSMenu()
        let appItem = NSMenuItem(); mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        let about = NSMenuItem(title: "くじらの散歩道について", action: #selector(showAbout(_:)), keyEquivalent: ""); about.target = self
        appMenu.addItem(about); appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        let windowItem = NSMenuItem(); mainMenu.addItem(windowItem)
        let windowMenu = NSMenu(title: "ウィンドウ")
        let reopen = NSMenuItem(title: "プレビューを開く", action: #selector(openPreview(_:)), keyEquivalent: "1"); reopen.target = self
        windowMenu.addItem(reopen); windowItem.submenu = windowMenu
        NSApp.mainMenu = mainMenu
    }

    @objc func togglePause(_ sender: Any?) {
        guard !policy.reducedMotion else { return }
        policy.manuallyPaused.toggle()
        if persistSettings { UserDefaults.standard.set(policy.manuallyPaused, forKey: "manuallyPaused") }
        synchronize()
    }
    @objc func toggleLowPower(_ sender: Any?) {
        policy.userLowPower.toggle()
        if persistSettings { UserDefaults.standard.set(policy.userLowPower, forKey: "userLowPower") }
        synchronize()
    }
    @objc func toggleWallpaper(_ sender: Any?) {
        if wallpaperWindow != nil { stopWallpaper(); return }
        do { try startWallpaper() } catch { fail(error.localizedDescription) }
    }
    private func startWallpaper() throws {
        guard let screen = NSScreen.screens.first else { throw KujiraError.invalid("主画面を確認できません。プレビューでご確認ください。") }
        let desktop = Int(CGWindowLevelForKey(.desktopWindow))
        let icons = Int(CGWindowLevelForKey(.desktopIconWindow))
        guard desktop + 1 < icons else { throw KujiraError.invalid("デスクトップアイコンの背後に表示するレイヤーを確保できません。") }
        let window = WallpaperPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        window.hidesOnDeactivate = false
        window.isFloatingPanel = false
        window.isOpaque = true
        window.backgroundColor = .black
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.isExcludedFromWindowsMenu = true
        window.animationBehavior = .none
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.delegate = self
        let view = makeSceneView(wallpaper: true)
        view.autoresizingMask = [.width, .height]
        window.contentView = view
        window.setFrame(screen.frame, display: false)
        // Set the level LAST: NSPanel floating policy must never move this above icons/apps.
        window.level = NSWindow.Level(rawValue: desktop + 1)
        guard window.level.rawValue == desktop + 1, window.level.rawValue < icons, window.ignoresMouseEvents else {
            views.removeAll { $0 === view }
            throw KujiraError.invalid("安全な壁紙レイヤーを設定できません。")
        }
        wallpaperWindow = window; wallpaperView = view
        window.orderFrontRegardless()
        synchronize()
    }
    private func stopWallpaper() {
        let window = wallpaperWindow
        wallpaperWindow = nil
        if let view = wallpaperView { views.removeAll { $0 === view } }
        wallpaperView = nil
        window?.close()
        synchronize()
    }

    private func updateMemoryItem() {
        guard let text = ProcessMemory.formatted() else { return }
        memoryItem?.title = "メモリ使用量（プロセス）: \(text)"
    }

    private func observe(_ center: NotificationCenter, _ name: Notification.Name, action: @escaping @MainActor (AppController) -> Void) {
        let token = center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, !self.policy.terminating else { return }
                action(self)
            }
        }
        observers.append((center, token))
    }
    private func installObservers() {
        let workspace = NSWorkspace.shared.notificationCenter
        observe(workspace, NSWorkspace.willSleepNotification) { $0.systemSleeping = true; $0.synchronize() }
        observe(workspace, NSWorkspace.didWakeNotification) { $0.systemSleeping = false; $0.synchronize() }
        observe(workspace, NSWorkspace.screensDidSleepNotification) { $0.displaysSleeping = true; $0.synchronize() }
        observe(workspace, NSWorkspace.screensDidWakeNotification) { $0.displaysSleeping = false; $0.synchronize() }
        observe(workspace, NSWorkspace.sessionDidResignActiveNotification) { $0.policy.sessionActive = false; $0.synchronize() }
        observe(workspace, NSWorkspace.sessionDidBecomeActiveNotification) { $0.policy.sessionActive = true; $0.synchronize() }
        observe(workspace, NSWorkspace.accessibilityDisplayOptionsDidChangeNotification) { $0.synchronize() }
        observe(.default, .NSProcessInfoPowerStateDidChange) { $0.synchronize() }
        observe(.default, NSApplication.didChangeScreenParametersNotification) { owner in
            if owner.wallpaperWindow != nil {
                owner.stopWallpaper()
                do { try owner.startWallpaper() } catch { owner.fail(error.localizedDescription) }
            } else { owner.synchronize() }
        }
    }

    func synchronize() {
        guard !policy.terminating, !failed else { stopTimer(); return }
        policy.systemLowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        policy.reducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        policy.sleeping = systemSleeping || displaysSleeping
        let visiblePreview = previewRequested && previewWindow?.isVisible == true && previewWindow?.occlusionState.contains(.visible) == true
        let visibleWallpaper = wallpaperWindow?.isVisible == true && wallpaperWindow?.occlusionState.contains(.visible) == true
        policy.hasVisibleSurface = visiblePreview || visibleWallpaper
        do { try synchronizeGameFocus() } catch { fail(error.localizedDescription); return }
        let running = policy.shouldAnimate && !modalOpen
        if running {
            if timer == nil || timerFPS != policy.fps {
                stopTimer(); clock.reset(); _ = clock.sample(ProcessInfo.processInfo.systemUptime)
                let timer = Timer(timeInterval: 1 / Double(policy.fps), target: self, selector: #selector(tick), userInfo: nil, repeats: true)
                timer.tolerance = 0.002
                self.timer = timer; timerFPS = policy.fps
                RunLoop.main.add(timer, forMode: .common)
            }
        } else { stopTimer() }
        do { try refreshPlans() }
        catch { fail(error.localizedDescription); return }
        for view in views { view.needsDisplay = true }
        pauseItem?.title = policy.manuallyPaused ? "再開" : "一時停止"
        pauseItem?.state = policy.manuallyPaused ? .on : .off
        pauseItem?.isEnabled = !policy.reducedMotion
        pauseButton?.title = policy.manuallyPaused ? "再開" : "一時停止"
        pauseButton?.isEnabled = !policy.reducedMotion
        backgroundPopup?.selectItem(at: backgroundVariantIndex)
        for (index, item) in backgroundItems.enumerated() { item.state = index == backgroundVariantIndex ? .on : .off }
        wallpaperItem?.state = wallpaperWindow == nil ? .off : .on
        wallpaperButton?.title = wallpaperWindow == nil ? "壁紙にする" : "壁紙をOFF"
        lowPowerItem?.state = policy.userLowPower ? .on : .off
        lowPowerItem?.title = policy.systemLowPower ? "省電力（OS設定でも有効）" : "省電力にする"
        lowPowerButton?.state = policy.userLowPower ? .on : .off
        statusLabel?.stringValue = policy.status
        updateFighterControls()
    }
    @objc private func tick() {
        guard policy.shouldAnimate, !modalOpen, !failed else { stopTimer(); return }
        do {
            plan = try engine.advance(clock.sample(ProcessInfo.processInfo.systemUptime), decorations: !policy.reducedMotion)
            wallpaperPlan = try engine.snapshot(decorations: !policy.reducedMotion, presentation: "wallpaper")
            // The scrolling stage caches are only needed while a manual battle is on screen.
            if plan.game?.phase == "rest" || plan.game?.phase == "result" { painter.releaseBattleBackdrops() }
            updateFighterControls()
            memoryProbeTick += 1
            if memoryProbeTick % 120 == 0 { updateMemoryItem() }
            for view in views { view.needsDisplay = true }
        } catch { fail(error.localizedDescription) }
    }
    private func stopTimer() { timer?.invalidate(); timer = nil; timerFPS = 0; clock.reset() }

    @objc func showAbout(_ sender: Any?) {
        modalOpen = true; synchronize()
        defer { modalOpen = false; synchronize() }
        let alert = NSAlert()
        alert.messageText = "くじらの散歩道（個人用ローカル試作）"
        let memory = ProcessMemory.formatted().map { "\nメモリ使用量（プロセスfootprint）: \($0)" } ?? ""
        alert.informativeText = "非公式ファン作品／DeepSeek社との提携・承認なし\n「DeepSeekちゃん（クジラ娘）」の原案・デザインは、これを生み出したファンコミュニティと原案者に帰属します。本プロジェクトは権利を主張せず、独自ライセンスを付与しません。\n壁紙設定を書き換えず、停止・終了で下層ウィンドウを閉じます。\n通信・音声・通知・分析・ログイン自動起動はありません。" + memory
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 560, height: 280))
        scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder
        let text = NSTextView(frame: scroll.bounds)
        text.isEditable = false; text.isSelectable = true
        text.font = .systemFont(ofSize: 12); text.textColor = .labelColor
        text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
        text.string = "ファイターズ：海辺のテラスで雑魚戦2回 → 綴星リュミエとの一騎打ち → 決着と帰宅。移動で先へ進む必要はありません。主人公の承認済み16コマは変更せず再利用しています。ボスはClaudeの文章・思考を着想にしたオリジナルのAI擬人化案で、公式キャラクターではなくAnthropic社の提携・承認もありません。制作アートはローカル専用、素材がない環境は独自の仮ピクセル描画です。ローカル版ではテラス背景・主人公の戦闘8キー姿勢・既存敵2種の6姿勢を生成素材として追加し、元の生活16コマは不変です。画像なし／読込失敗時は従来描画へ戻ります。連続動作の自然さ・操作感・実時間負荷の実機受け入れとは別です。音はありません。\n\n" + assets.configuration.layout.provenance + "\n\n" + assets.manifest.note + "\n\n" + assets.manifest.assets.map {
            "\($0.id) — \($0.name)\n\($0.author)\n\($0.dimensions) · \($0.license)\n\($0.permission.status)\n"
        }.joined(separator: "\n")
        scroll.documentView = text
        alert.accessoryView = scroll
        alert.addButton(withTitle: "閉じる")
        alert.runModal()
    }
    private func fail(_ message: String) {
        guard !failed else { return }
        failed = true; stopTimer()
        wallpaperWindow?.close(); wallpaperWindow = nil
        statusLabel?.stringValue = "表示を停止しました"
        let alert = NSAlert(); alert.alertStyle = .warning
        alert.messageText = "風景の表示を停止しました"
        alert.informativeText = message + "\n元の壁紙設定は変更していません。アプリを終了してから再起動してください。"
        alert.runModal()
    }
    func windowWillClose(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window === previewWindow {
            // Closing the preview must release its window backing store and scene view; the
            // menu can recreate it later. Keeping them alive was the largest avoidable heap cost.
            previewRequested = false
            previewScene?.releaseKeys()
            if let scene = previewScene { views.removeAll { $0 === scene } }
            previewScene = nil
            fightersControls = nil
            previewWindow = nil
            pauseButton = nil; wallpaperButton = nil; lowPowerButton = nil; statusLabel = nil
            backgroundPopup = nil
        }
        synchronize()
    }
    func windowDidBecomeKey(_ notification: Notification) { synchronize() }
    func windowDidResignKey(_ notification: Notification) { synchronize() }
    func windowDidChangeOcclusionState(_ notification: Notification) { synchronize() }
    func windowDidMiniaturize(_ notification: Notification) { synchronize() }
    func windowDidDeminiaturize(_ notification: Notification) { synchronize() }
    func shutdown() {
        policy.terminating = true
        stopTimer()
        for (center, token) in observers { center.removeObserver(token) }
        observers.removeAll()
        wallpaperWindow?.close(); wallpaperWindow = nil
        previewWindow?.close(); previewWindow = nil
        views.removeAll()
        if let item = statusItem { NSStatusBar.system.removeStatusItem(item) }
        statusItem = nil
    }
    var smokeSummary: [String: Any] {
        ["profile": assets.configuration.layout.id, "previewCreated": previewWindow != nil,
         "processFootprintBytes": ProcessMemory.footprintBytes().map { Int($0) } as Any,
         "backgroundVariant": painter.currentVariantID, "backgroundVariants": assets.variants.map(\.id),
         "wallpaperEnabled": wallpaperWindow != nil, "originalWallpaperChanged": false,
         "statusMenuCreated": statusItem != nil, "timerRunning": timer != nil,
         "visibleSurface": policy.hasVisibleSurface, "fightersControlsCreated": fightersControls != nil,
         "gameMode": plan.game?.mode ?? "unknown", "manualInputFocus": manualInputFocus,
         "scope": "Native startup only; not physical gameplay/keyboard/wallpaper/Spaces/sleep acceptance."]
    }
}
