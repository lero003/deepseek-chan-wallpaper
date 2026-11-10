import AppKit
import KujiraCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let assets: Assets
    private let smokeTest: Bool
    private var owner: AppController?
    private var smokeTimer: Timer?
    var exitCode: Int32 = 0
    init(assets: Assets, smokeTest: Bool) { self.assets = assets; self.smokeTest = smokeTest }
    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let owner = try AppController(assets: assets, persistSettings: !smokeTest)
            self.owner = owner
            owner.start(activate: !smokeTest)
            if smokeTest {
                let timer = Timer(timeInterval: 1.5, target: self, selector: #selector(finishSmoke), userInfo: nil, repeats: false)
                smokeTimer = timer
                RunLoop.main.add(timer, forMode: .common)
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
    @objc private func finishSmoke() {
        smokeTimer?.invalidate(); smokeTimer = nil
        if let owner {
            do {
                let json = try JSONSerialization.data(withJSONObject: owner.smokeSummary, options: [.sortedKeys])
                print("NATIVE_STARTUP_PASS: " + (String(data: json, encoding: .utf8) ?? "{}"))
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
        smokeTimer?.invalidate(); smokeTimer = nil
        owner?.shutdown(); owner = nil
    }
}
