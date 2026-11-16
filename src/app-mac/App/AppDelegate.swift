import AppKit
import KujiraCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let assets: Assets
    private let smokeTest: Bool
    private var owner: AppController?
    private var smokeTimers: [Timer] = []
    private var smokeClosedCleanly = false
    var exitCode: Int32 = 0
    init(assets: Assets, smokeTest: Bool) { self.assets = assets; self.smokeTest = smokeTest }
    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let owner = try AppController(assets: assets, persistSettings: !smokeTest)
            self.owner = owner
            owner.start(activate: !smokeTest)
            if smokeTest {
                // Startup → close the preview (release its window/view) → reopen it → report.
                scheduleSmoke(0.8, #selector(smokeClosePreview))
                scheduleSmoke(1.6, #selector(smokeReopenPreview))
                scheduleSmoke(2.4, #selector(finishSmoke))
            }
        } catch {
            exitCode = 1
            if smokeTest { print("NATIVE_STARTUP_FAIL: \(error.localizedDescription)"); stopRunLoop() }
            else {
                let alert = NSAlert(); alert.messageText = "風景を準備できませんでした"
                alert.informativeText = error.localizedDescription + "\n元の壁紙設定は変更していません。"
                alert.runModal(); NSApp.terminate(nil)
            }
        }
    }
    private func scheduleSmoke(_ delay: TimeInterval, _ selector: Selector) {
        let timer = Timer(timeInterval: delay, target: self, selector: selector, userInfo: nil, repeats: false)
        smokeTimers.append(timer)
        RunLoop.main.add(timer, forMode: .common)
    }
    @objc private func smokeClosePreview() {
        owner?.smokeClosePreview()
        let summary = owner?.smokeSummary
        smokeClosedCleanly = summary?["previewCreated"] as? Bool == false
            && summary?["captionCreated"] as? Bool == false
    }
    @objc private func smokeReopenPreview() { owner?.showPreview(activate: false) }
    @objc private func finishSmoke() {
        for timer in smokeTimers { timer.invalidate() }
        smokeTimers.removeAll()
        if let owner {
            var summary = owner.smokeSummary
            summary["previewCloseReopenVerified"] = smokeClosedCleanly && summary["previewCreated"] as? Bool == true
            do {
                let json = try JSONSerialization.data(withJSONObject: summary, options: [.sortedKeys])
                if summary["previewCloseReopenVerified"] as? Bool == true {
                    print("NATIVE_STARTUP_PASS: " + (String(data: json, encoding: .utf8) ?? "{}"))
                } else {
                    print("NATIVE_STARTUP_FAIL: preview close/reopen cleanup was not verified. " + (String(data: json, encoding: .utf8) ?? "{}"))
                    exitCode = 1
                }
            } catch { print("NATIVE_STARTUP_FAIL: \(error)"); exitCode = 1 }
        } else { exitCode = 1 }
        owner?.shutdown(); owner = nil
        stopRunLoop()
    }
    private func stopRunLoop() {
        NSApp.stop(nil)
        if let event = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [], timestamp: 0,
                                         windowNumber: 0, context: nil, subtype: 0, data1: 0, data2: 0) { NSApp.postEvent(event, atStart: false) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        owner?.showPreview(activate: true)
        return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        for timer in smokeTimers { timer.invalidate() }
        smokeTimers.removeAll()
        owner?.shutdown(); owner = nil
    }
}
