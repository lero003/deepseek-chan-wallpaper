import AppKit
import CoreGraphics
import KujiraCore

/// The quiet wallpaper app: a seaside study picture, a menu bar item, and nothing else.
/// The fighters feature is shelved — the shared engine still runs the quiet life
/// (auto-bouts are switched off), but no combat UI or input exists on this surface.
@MainActor
final class AppController: NSObject, NSWindowDelegate {
    let assets: Assets
    let engine: SceneEngine
    let painter: ScenePainter
    private(set) var plan: ScenePlan
    private var wallpaperPlan: ScenePlan
    private var previewScene: SceneView?
    private var captionLabel: NSTextField?
    private(set) var policy = PlaybackPolicy()
    private let persistSettings: Bool
    private var clock = FrameClock()
    private var timer: Timer?
    private var timerFPS = 0
    private var previewWindow: NSWindow?
    private var previewRequested = false
    private var wallpaperWindows: [WallpaperPanel] = []
    private var wallpaperViews: [SceneView] = []
    private var views: [SceneView] = []
    private var statusItem: NSStatusItem?
    private var pauseItem: NSMenuItem?
    private var wallpaperItem: NSMenuItem?
    private var lowPowerItem: NSMenuItem?
    private var pauseButton: NSButton?
    private var wallpaperButton: NSButton?
    private var settingsMenu: NSMenu?
    private var settingsLowPowerItem: NSMenuItem?
    private var statusLabel: NSTextField?
    private var memoryItem: NSMenuItem?
    private var memoryProbeTick = 0
    private var backgroundVariantIndex = 0
    private var backgroundPopup: NSPopUpButton?
    private var backgroundItems: [NSMenuItem] = []
    private var previewItem: NSMenuItem?
    private var settingsButton: NSButton?
    private let pauseSymbol = NSImage(systemSymbolName: "pause.fill", accessibilityDescription: "一時停止中")
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
        // Shelved fighters: the quiet life never schedules an auto-bout. Peaceful
        // visitors are independent of this switch and keep coming.
        try engine.command("frequency", value: "off")
        let initial = try engine.snapshot()
        self.plan = initial
        self.wallpaperPlan = initial
        self.persistSettings = persistSettings
        super.init()
        pauseSymbol?.isTemplate = true
        if persistSettings {
            policy.manuallyPaused = UserDefaults.standard.bool(forKey: "manuallyPaused")
            policy.userLowPower = UserDefaults.standard.bool(forKey: "userLowPower")
            // Settings from the shelved fighters surface are dead; drop them once.
            UserDefaults.standard.removeObject(forKey: "encounterFrequency")
            UserDefaults.standard.removeObject(forKey: "effectsLow")
            if let saved = UserDefaults.standard.string(forKey: "wallpaperVariant") {
                if let index = assets.variants.firstIndex(where: { $0.id == saved }) {
                    try painter.selectVariant(index + 1)
                    backgroundVariantIndex = index + 1
                } else {
                    // A saved id from another profile must not resurrect later as a surprise.
                    UserDefaults.standard.removeObject(forKey: "wallpaperVariant")
                }
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
        }, onFailure: { [weak self] in self?.fail($0) }, wallpaper: wallpaper)
        views.append(view)
        return view
    }
    @objc func openPreview(_ sender: Any? = nil) { showPreview(activate: true) }
    /// Smoke-only: close the preview through the normal window-delegate cleanup path.
    func smokeClosePreview() { previewWindow?.performClose(nil) }
    func showPreview(activate: Bool) {
        guard !failed else { return }
        if previewWindow == nil { createPreview() }
        previewRequested = true
        if activate { previewWindow?.makeKeyAndOrderFront(nil); NSApp.activate() }
        else { previewWindow?.orderBack(nil) }
        synchronize()
    }
    private func createPreview() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 680),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "くじらの散歩道"
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
        let tagline = NSTextField(labelWithString: "おっとり。ときどき、ぼうっと。")
        tagline.font = .systemFont(ofSize: 10)
        tagline.textColor = .secondaryLabelColor
        let titleBlock = NSStackView(views: [title, tagline])
        titleBlock.orientation = .vertical; titleBlock.spacing = 1; titleBlock.alignment = .leading
        titleBlock.setContentHuggingPriority(.required, for: .horizontal)
        let spacer = NSView()
        let backgrounds = NSPopUpButton(frame: .zero, pullsDown: false)
        backgrounds.addItems(withTitles: [assets.configuration.layout.label] + assets.variants.map(\.label))
        backgrounds.selectItem(at: backgroundVariantIndex)
        backgrounds.target = self; backgrounds.action = #selector(changeBackgroundPopup(_:))
        // Derived from the real variant list so the tooltip can never drift behind the art again.
        let backgroundNames = ([assets.configuration.layout.label] + assets.variants.map(\.label))
            .map { $0.replacingOccurrences(of: "の書斎", with: "") }
        backgrounds.toolTip = "壁紙の背景を切り替えます（\(backgroundNames.joined(separator: "・"))）"
        backgrounds.setContentHuggingPriority(.required, for: .horizontal)
        backgroundPopup = backgrounds
        let pause = NSButton(title: "一時停止", target: self, action: #selector(togglePause(_:)))
        let wallpaper = NSButton(title: "壁紙にする", target: self, action: #selector(toggleWallpaper(_:)))
        wallpaper.toolTip = "接続中のすべてのディスプレイに表示します。元の壁紙設定は変更しません。"
        let settings = NSButton(title: "設定", target: self, action: #selector(openSettingsMenu(_:)))
        settings.toolTip = "省電力の設定"
        settingsButton = settings
        let about = NSButton(title: "作品について", target: self, action: #selector(showAbout(_:)))
        let toolbar = NSStackView(views: [titleBlock, spacer, backgrounds, pause, wallpaper, settings, about])
        toolbar.orientation = .horizontal; toolbar.spacing = 12
        toolbar.alignment = .centerY
        for control in [backgrounds, pause, wallpaper, settings, about] {
            control.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        let settingsMenu = NSMenu(title: "設定"); settingsMenu.autoenablesItems = false
        settingsLowPowerItem = NSMenuItem(title: "省電力にする", action: #selector(toggleLowPower(_:)), keyEquivalent: "")
        settingsLowPowerItem?.target = self; settingsMenu.addItem(settingsLowPowerItem!)
        self.settingsMenu = settingsMenu
        let scene = makeSceneView()
        previewScene = scene
        // The one quiet caption under the scene: the shared observation line
        // (life, small gestures, peaceful visitors). The footer owns stop reasons.
        let caption = NSTextField(labelWithString: "ただ、ここにいる。")
        caption.font = .systemFont(ofSize: 10)
        caption.textColor = .secondaryLabelColor
        caption.lineBreakMode = .byTruncatingTail
        captionLabel = caption
        let note = NSTextField(labelWithString: "非公式ファン作品。初回はプレビューのみ／壁紙ONは自分で選択。素材の公開・再配布許諾は未確認です。")
        note.font = .systemFont(ofSize: 10)
        note.textColor = .secondaryLabelColor
        note.lineBreakMode = .byTruncatingTail
        let status = NSTextField(labelWithString: "準備中")
        status.font = .systemFont(ofSize: 10)
        status.textColor = .secondaryLabelColor
        status.toolTip = "再生状態と停止理由（一時停止・静止設定・スリープなど）"
        let footer = NSStackView(views: [note, NSView(), status])
        footer.orientation = .horizontal; footer.spacing = 12
        for view in [toolbar, scene, caption, footer] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        NSLayoutConstraint.activate([
            toolbar.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            toolbar.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            toolbar.topAnchor.constraint(equalTo: root.topAnchor, constant: 12), toolbar.heightAnchor.constraint(equalToConstant: 38),
            scene.leadingAnchor.constraint(equalTo: root.leadingAnchor), scene.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            scene.topAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: 12),
            scene.bottomAnchor.constraint(equalTo: caption.topAnchor, constant: -8),
            caption.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16), caption.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            caption.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -8),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16), footer.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -10), footer.heightAnchor.constraint(equalToConstant: 18)
        ])
        pauseButton = pause; wallpaperButton = wallpaper; statusLabel = status
        previewWindow = window
    }
    @objc private func openSettingsMenu(_ sender: NSButton) {
        guard !failed else { return }
        settingsMenu?.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.height + 4), in: sender)
    }

    private func refreshPlans() throws {
        plan = try engine.snapshot(decorations: !policy.reducedMotion)
        // The passive wallpaper plan is only needed while at least one panel exists;
        // preview-only use skips a full shared-core plan + JSON round-trip per event.
        if !wallpaperWindows.isEmpty {
            wallpaperPlan = try engine.snapshot(decorations: !policy.reducedMotion, presentation: "wallpaper")
        }
    }
    /// Change-guarded: the tick runs up to 30 times a second.
    private func updateCaption() {
        guard let captionLabel else { return }
        let line = plan.game?.companionLine ?? ""
        if captionLabel.stringValue != line { captionLabel.stringValue = line }
    }
    @objc private func changeBackgroundPopup(_ sender: NSPopUpButton) { applyBackground(sender.indexOfSelectedItem) }
    @objc private func setBackgroundMenu(_ sender: NSMenuItem) { applyBackground(sender.tag) }
    private func applyBackground(_ index: Int) {
        guard !failed, index >= 0, index <= assets.variants.count else { return }
        do { try painter.selectVariant(index) } catch { fail(error.localizedDescription); return }
        backgroundVariantIndex = index
        if persistSettings {
            if index == 0 { UserDefaults.standard.removeObject(forKey: "wallpaperVariant") }
            else { UserDefaults.standard.set(assets.variants[index - 1].id, forKey: "wallpaperVariant") }
        }
        for view in views { view.needsDisplay = true }
        synchronize()
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
        let heading = add("くじらの散歩道", nil); heading.isEnabled = false
        memoryItem = add("メモリ使用量（プロセス）: 計測中", nil)
        memoryItem?.isEnabled = false
        previewItem = add("プレビューを開く", #selector(openPreview(_:)))
        wallpaperItem = add("壁紙を表示（全ディスプレイ）", #selector(toggleWallpaper(_:)))
        let backgroundMenu = NSMenu(title: "背景"); backgroundMenu.autoenablesItems = false
        let backgroundParent = add("背景", nil); backgroundParent.submenu = backgroundMenu
        for (index, label) in (["\(assets.configuration.layout.label)（標準）"] + assets.variants.map(\.label)).enumerated() {
            let entry = NSMenuItem(title: label, action: #selector(setBackgroundMenu(_:)), keyEquivalent: "")
            entry.target = self; entry.tag = index; backgroundMenu.addItem(entry); backgroundItems.append(entry)
        }
        pauseItem = add("一時停止", #selector(togglePause(_:)))
        lowPowerItem = add("省電力にする", #selector(toggleLowPower(_:)))
        menu.addItem(.separator())
        _ = add("作品について・クレジット", #selector(showAbout(_:)))
        let quit = add("終了", #selector(NSApplication.terminate(_:)), key: "q"); quit.target = NSApp
        item.menu = menu; statusItem = item
        let mainMenu = NSMenu()
        let appItem = NSMenuItem(); mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        let about = NSMenuItem(title: "くじらの散歩道について", action: #selector(showAbout(_:)), keyEquivalent: ""); about.target = self
        appMenu.addItem(about); appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "くじらの散歩道を隠す", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(title: "ほかを隠す", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]; appMenu.addItem(hideOthers)
        appMenu.addItem(NSMenuItem(title: "すべてを表示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        // Standard Edit menu: the About credits text view needs a real ⌘C path.
        let editItem = NSMenuItem(); mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "編集")
        editMenu.addItem(withTitle: "元に戻す", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "やり直す", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "カット", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "コピー", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "ペースト", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "削除", action: #selector(NSText.delete(_:)), keyEquivalent: "")
        editMenu.addItem(withTitle: "すべてを選択", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        let windowItem = NSMenuItem(); mainMenu.addItem(windowItem)
        let windowMenu = NSMenu(title: "ウィンドウ")
        let reopen = NSMenuItem(title: "プレビューを開く", action: #selector(openPreview(_:)), keyEquivalent: "1"); reopen.target = self
        windowMenu.addItem(reopen)
        windowMenu.addItem(.separator())
        windowMenu.addItem(NSMenuItem(title: "しまう", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "拡大／縮小", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        let fullScreen = NSMenuItem(title: "フルスクリーンにする", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]; windowMenu.addItem(fullScreen)
        windowMenu.addItem(.separator())
        windowMenu.addItem(NSMenuItem(title: "すべてを手前に出す", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: ""))
        windowItem.submenu = windowMenu
        NSApp.mainMenu = mainMenu
        // Wallpaper panels opt out of the Windows menu; only the preview is listed.
        NSApp.windowsMenu = windowMenu
    }

    @objc func togglePause(_ sender: Any?) {
        guard !failed, !policy.reducedMotion else { return }
        policy.manuallyPaused.toggle()
        if persistSettings { UserDefaults.standard.set(policy.manuallyPaused, forKey: "manuallyPaused") }
        synchronize()
    }
    @objc func toggleLowPower(_ sender: Any?) {
        guard !failed else { return }
        policy.userLowPower.toggle()
        if persistSettings { UserDefaults.standard.set(policy.userLowPower, forKey: "userLowPower") }
        synchronize()
    }
    @objc func toggleWallpaper(_ sender: Any?) {
        guard !failed else { return }
        if !wallpaperWindows.isEmpty { stopWallpaper(); return }
        do { try startWallpaper() } catch { fail(error.localizedDescription) }
    }
    /// Creates one safe click-through panel per usable display without touching the
    /// currently shown panels. Both the explicit ON and the hotplug rebuild use it.
    private func buildWallpaperPanels() throws -> (windows: [WallpaperPanel], views: [SceneView]) {
        let displays = NSScreen.screens.map { screen in
            let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
            return WallpaperDisplay(id: id, frame: screen.frame)
        }
        let frames = WallpaperDisplayLayout.frames(for: displays)
        guard !frames.isEmpty else { throw KujiraError.invalid("接続中のディスプレイを確認できません。プレビューでご確認ください。") }
        let desktop = Int(CGWindowLevelForKey(.desktopWindow))
        let icons = Int(CGWindowLevelForKey(.desktopIconWindow))
        guard desktop + 1 < icons else { throw KujiraError.invalid("デスクトップアイコンの背後に表示するレイヤーを確保できません。") }
        var createdWindows: [WallpaperPanel] = []
        var createdViews: [SceneView] = []
        do {
            for frame in frames {
                let window = WallpaperPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
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
                window.setFrame(frame, display: false)
                // Set the level LAST: NSPanel floating policy must never move this above icons/apps.
                window.level = NSWindow.Level(rawValue: desktop + 1)
                guard window.level.rawValue == desktop + 1, window.level.rawValue < icons, window.ignoresMouseEvents else {
                    throw KujiraError.invalid("安全な壁紙レイヤーを設定できません。")
                }
                createdWindows.append(window)
                createdViews.append(view)
            }
        } catch {
            for view in createdViews { views.removeAll { $0 === view } }
            for window in createdWindows { window.close() }
            throw error
        }
        return (createdWindows, createdViews)
    }
    private func startWallpaper() throws {
        guard wallpaperWindows.isEmpty else { return }
        let built = try buildWallpaperPanels()
        wallpaperWindows = built.windows
        wallpaperViews = built.views
        // Every connected display receives the same plan; mirrored screens share one panel.
        for window in wallpaperWindows { window.orderFrontRegardless() }
        synchronize()
    }
    private func stopWallpaper() {
        let windows = wallpaperWindows
        let stoppedViews = wallpaperViews
        wallpaperWindows = []
        wallpaperViews = []
        for view in stoppedViews { views.removeAll { $0 === view } }
        for window in windows { window.close() }
        synchronize()
    }

    private func updateMemoryItem() {
        guard let text = ProcessMemory.formatted() else { return }
        let title = "メモリ使用量（プロセス）: \(text)"
        if memoryItem?.title != title { memoryItem?.title = title }
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
        // Any open menu rests the scene, exactly like the Web preview's settings dialog.
        observe(.default, NSMenu.didBeginTrackingNotification) { $0.policy.menuOpen = true; $0.synchronize() }
        observe(.default, NSMenu.didEndTrackingNotification) { $0.policy.menuOpen = false; $0.synchronize() }
        observe(.default, NSApplication.didChangeScreenParametersNotification) { owner in
            guard !owner.wallpaperWindows.isEmpty else { owner.synchronize(); return }
            // Build-then-swap: the new panels go up before the old ones close, so adding,
            // removing or rearranging a display never flashes the original wallpaper.
            // A transient failure keeps the current panels; the next screen-parameters
            // notification retries instead of killing the app permanently.
            do {
                let built = try owner.buildWallpaperPanels()
                let oldWindows = owner.wallpaperWindows
                let oldViews = owner.wallpaperViews
                owner.wallpaperWindows = built.windows
                owner.wallpaperViews = built.views
                for window in built.windows { window.orderFrontRegardless() }
                for view in oldViews { owner.views.removeAll { $0 === view } }
                for window in oldWindows { window.close() }
            } catch {
                // Keep the existing panels; reconfiguration notifications arrive in bursts.
            }
            owner.synchronize()
        }
    }

    func synchronize() {
        guard !policy.terminating, !failed else { stopTimer(); return }
        policy.systemLowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        policy.reducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        policy.sleeping = systemSleeping || displaysSleeping
        let visiblePreview = previewRequested && previewWindow?.isVisible == true && previewWindow?.occlusionState.contains(.visible) == true
        let visibleWallpaper = wallpaperWindows.contains { $0.isVisible && $0.occlusionState.contains(.visible) }
        policy.hasVisibleSurface = visiblePreview || visibleWallpaper
        let running = policy.shouldAnimate && !modalOpen
        if running {
            if timer == nil || timerFPS != policy.fps {
                stopTimer(); clock.reset(); _ = clock.sample(ProcessInfo.processInfo.systemUptime)
                let timer = Timer(timeInterval: 1 / Double(policy.fps), target: self, selector: #selector(tick), userInfo: nil, repeats: true)
                timer.tolerance = policy.fps == 15 ? 0.01 : 0.002
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
        let wallpaperOn = !wallpaperWindows.isEmpty
        wallpaperItem?.state = wallpaperOn ? .on : .off
        wallpaperItem?.title = wallpaperOn ? "壁紙をOFF（全ディスプレイ）" : "壁紙を表示（全ディスプレイ）"
        wallpaperButton?.title = wallpaperOn ? "壁紙をOFF" : "壁紙にする"
        wallpaperButton?.toolTip = wallpaperOn
            ? "\(wallpaperWindows.count)画面に表示中。押すとOFFになります。元の壁紙設定は変更しません。"
            : "接続中のすべてのディスプレイに表示します。元の壁紙設定は変更しません。"
        lowPowerItem?.state = policy.userLowPower ? .on : .off
        lowPowerItem?.title = policy.systemLowPower ? "省電力（OS設定でも有効）" : "省電力にする"
        settingsLowPowerItem?.state = policy.userLowPower ? .on : .off
        settingsLowPowerItem?.title = policy.systemLowPower ? "省電力（OS設定でも有効）" : "省電力にする"
        statusLabel?.stringValue = policy.status
        // The menu bar item itself shows the wallpaper/pause state at a glance.
        if let button = statusItem?.button {
            let title = wallpaperOn ? "くじら・壁紙" : "くじら"
            if button.title != title { button.title = title }
            let paused = policy.manuallyPaused && !policy.reducedMotion
            button.image = paused ? pauseSymbol : nil
            button.imagePosition = .imageLeading
            let summary = (wallpaperOn ? "壁紙: \(wallpaperWindows.count)画面に表示中。" : "壁紙: OFF。") + policy.status
            if button.toolTip != summary { button.toolTip = summary }
            button.setAccessibilityLabel("くじらの散歩道。\(summary)")
        }
        updateCaption()
    }
    @objc private func tick() {
        guard policy.shouldAnimate, !modalOpen, !failed else { stopTimer(); return }
        do {
            plan = try engine.advance(clock.sample(ProcessInfo.processInfo.systemUptime), decorations: !policy.reducedMotion)
            if !wallpaperWindows.isEmpty {
                wallpaperPlan = try engine.snapshot(decorations: !policy.reducedMotion, presentation: "wallpaper")
            }
            updateCaption()
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
        alert.messageText = "くじらの散歩道"
        let memory = ProcessMemory.formatted().map { "\nメモリ使用量（プロセスfootprint）: \($0)" } ?? ""
        alert.informativeText = "海辺の小さな書斎で、クジラ娘がのんびり暮らすドット絵の壁紙です。歩いたり、窓辺でぼんやりしたり、ときどきお昼寝したり。眺めるだけで楽しめます。音はありません。\n\n「DeepSeekちゃん（クジラ娘）」をモチーフにした非公式のファン作品です。キャラクターの原案・デザインは、この子を生み出したファンコミュニティと原案者に帰属します。DeepSeek社との提携・承認はありません。\n壁紙設定は書き換えず、OFF・終了で元の壁紙に戻ります。通信・音声・通知・分析・ログイン自動起動はありません。" + memory
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 560, height: 280))
        scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder
        let text = NSTextView(frame: scroll.bounds)
        text.isEditable = false; text.isSelectable = true
        text.font = .systemFont(ofSize: 12); text.textColor = .labelColor
        // Standard vertically-scrolling recipe: without an unbounded container height
        // the credits list is clipped instead of reachable by the scroller.
        text.autoresizingMask = [.width]
        text.isVerticallyResizable = true
        text.isHorizontallyResizable = false
        text.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        text.textContainer?.containerSize = NSSize(width: scroll.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
        text.textContainer?.widthTracksTextView = true
        text.string = "背景とキャラクターは、このプロジェクトのために制作したドット絵です。外部の画像・フォントは読み込みません。個人的に眺めるためのもので、素材の公開・再配布の許諾は未確認です。\n\n" + assets.manifest.note + "\n\n素材台帳\n" + assets.manifest.assets.map {
            "\($0.id) — \($0.name)\n\($0.author)\n\($0.dimensions) · \($0.license)\n\($0.permission.status)\n"
        }.joined(separator: "\n")
        scroll.documentView = text
        // A small front-facing portrait from the already-loaded sheet, integer-scaled and
        // nearest-neighbour. Optional and graceful: without it the credits keep full width.
        if let face = aboutFaceView() {
            let faceWidth = face.frame.width
            scroll.frame = NSRect(x: 0, y: 0, width: 560 - faceWidth - 12, height: 280)
            face.translatesAutoresizingMaskIntoConstraints = false
            scroll.translatesAutoresizingMaskIntoConstraints = false
            let accessory = NSStackView(views: [face, scroll])
            accessory.orientation = .horizontal; accessory.spacing = 12; accessory.alignment = .centerY
            accessory.frame = NSRect(x: 0, y: 0, width: 560, height: 280)
            NSLayoutConstraint.activate([
                face.widthAnchor.constraint(equalToConstant: faceWidth),
                face.heightAnchor.constraint(equalToConstant: face.frame.height),
                scroll.widthAnchor.constraint(equalToConstant: 560 - faceWidth - 12),
                scroll.heightAnchor.constraint(equalToConstant: 280)
            ])
            alert.accessoryView = accessory
        } else {
            alert.accessoryView = scroll
        }
        alert.addButton(withTitle: "閉じる")
        alert.runModal()
    }
    /// The front-facing frame of the existing turn animation, reused without modifying any art.
    private func aboutFaceView() -> NSImageView? {
        guard let turn = assets.configuration.atlas.animations["turn"], turn.frames.count >= 2 else { return nil }
        let index = turn.frames[1]
        guard assets.frames.indices.contains(index) else { return nil }
        let frame = assets.frames[index]
        let scale = 2
        let size = NSSize(width: frame.width * scale, height: frame.height * scale)
        let view = NSImageView(frame: NSRect(origin: .zero, size: size))
        view.image = NSImage(cgImage: frame, size: size)
        view.imageScaling = .scaleNone
        view.wantsLayer = true
        view.layer?.magnificationFilter = .nearest
        view.setAccessibilityLabel("DeepSeekちゃんの正面フレーム（既存シートの再利用）")
        return view
    }
    private func fail(_ message: String) {
        guard !failed else { return }
        failed = true; stopTimer()
        for view in wallpaperViews { views.removeAll { $0 === view } }
        for window in wallpaperWindows { window.close() }
        wallpaperWindows = []
        wallpaperViews = []
        statusLabel?.stringValue = "表示を停止しました"
        // Nothing may pretend the scene is still live after a rendering failure.
        for item in [pauseItem, wallpaperItem, lowPowerItem, previewItem] { item?.isEnabled = false }
        for item in backgroundItems { item.isEnabled = false }
        pauseButton?.isEnabled = false; wallpaperButton?.isEnabled = false
        backgroundPopup?.isEnabled = false; settingsButton?.isEnabled = false
        let alert = NSAlert(); alert.alertStyle = .warning
        alert.messageText = "風景の表示を停止しました"
        alert.informativeText = message + "\n元の壁紙設定は変更していません。アプリを終了してから再起動してください。"
        alert.addButton(withTitle: "終了")
        alert.addButton(withTitle: "閉じる")
        if alert.runModal() == .alertFirstButtonReturn { NSApp.terminate(nil) }
    }
    func windowWillClose(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window === previewWindow {
            // Closing the preview must release its window backing store and scene view; the
            // menu can recreate it later. Keeping them alive was the largest avoidable heap cost.
            previewRequested = false
            if let scene = previewScene { views.removeAll { $0 === scene } }
            previewScene = nil
            captionLabel = nil
            previewWindow = nil
            pauseButton = nil; wallpaperButton = nil; statusLabel = nil
            backgroundPopup = nil
            settingsMenu = nil; settingsLowPowerItem = nil
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
        for window in wallpaperWindows { window.close() }
        wallpaperWindows = []; wallpaperViews = []
        previewWindow?.close(); previewWindow = nil
        views.removeAll()
        if let item = statusItem { NSStatusBar.system.removeStatusItem(item) }
        statusItem = nil
    }
    var smokeSummary: [String: Any] {
        ["profile": assets.configuration.layout.id, "previewCreated": previewWindow != nil,
         "processFootprintBytes": ProcessMemory.footprintBytes().map { Int($0) } as Any,
         "backgroundVariant": painter.currentVariantID, "backgroundVariants": assets.variants.map(\.id),
         "wallpaperEnabled": !wallpaperWindows.isEmpty, "wallpaperDisplays": wallpaperWindows.count,
         "originalWallpaperChanged": false,
         "statusMenuCreated": statusItem != nil, "settingsMenuCreated": settingsMenu != nil,
         "timerRunning": timer != nil,
         "visibleSurface": policy.hasVisibleSurface, "captionCreated": captionLabel != nil,
         "autoBoutsScheduled": false,
         "scope": "Native startup only; not physical wallpaper/Spaces/sleep acceptance."]
    }
}
