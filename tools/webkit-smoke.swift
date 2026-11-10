// Native macOS smoke test using system WebKit, not a downloaded automation browser.
// swiftc -swift-version 6 -parse-as-library tools/webkit-smoke.swift -o <ignored-output>/webkit-smoke
// <ignored-output>/webkit-smoke http://127.0.0.1:4173/ <ignored-output>
import AppKit
import WebKit

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
}

@MainActor
final class SmokeRunner: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let webView: WKWebView
    let window: NSWindow
    let destination: URL
    var exitCode: Int32 = 1
    private var checks: [String: Bool] = [:]
    private var scriptErrors: [String] = []
    private var finished = false
    private var started = false
    private var runTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?

    init(destination: URL) {
        self.destination = destination
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: configuration)
        window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 1440, height: 900), styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        window.isReleasedWhenClosed = false
        window.hidesOnDeactivate = false
        if let screen = NSScreen.main {
            window.setFrameOrigin(NSPoint(x: screen.visibleFrame.minX + 20, y: screen.visibleFrame.minY + 20))
        }
        window.contentView = webView
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        configuration.userContentController.add(self, name: "smokeError")
        configuration.userContentController.addUserScript(WKUserScript(source: """
          window.addEventListener('error', e => window.webkit.messageHandlers.smokeError.postMessage(String(e.message)));
          window.addEventListener('unhandledrejection', e => window.webkit.messageHandlers.smokeError.postMessage(String(e.reason)));
          """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func start(url: URL) {
        // Visible for animation assertions: an occluded page is correctly paused by the app.
        // Click-through + no activation request avoid intercepting input or taking focus.
        window.ignoresMouseEvents = true
        window.orderFrontRegardless()
        webView.load(URLRequest(url: url))
        timeoutTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(45))
                self?.finish(error: SmokeFailure(description: "Native WebKit smoke timed out."))
            } catch { /* Finished or cancelled. */ }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        scriptErrors.append(String(describing: message.body))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error: error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error: error) }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !started else { return }
        started = true
        // One owned root task bridges the synchronous navigation delegate to structured async steps.
        runTask = Task { [weak self] in
            guard let self else { return }
            do { try await self.run(); self.finish(error: nil) }
            catch {
                let state = try? await self.js("JSON.stringify({ hidden: document.hidden, visibility: document.visibilityState, paused: document.querySelector('#pause-button').getAttribute('aria-pressed'), disabled: document.querySelector('#pause-button').disabled, still: document.querySelector('#still-setting').checked, dialog: document.querySelector('#about-dialog').open, status: document.querySelector('#playback-status').textContent })")
                print("WEBKIT_DIAGNOSTICS: \(state ?? "unavailable"); windowVisible=\(self.window.isVisible); occluded=\(!self.window.occlusionState.contains(.visible))")
                self.finish(error: error)
            }
        }
    }

    private func js(_ source: String) async throws -> String {
        try Task.checkCancellation()
        let value = try await webView.evaluateJavaScript(source)
        guard let result = value as? String else { throw SmokeFailure(description: "JavaScript did not return a string.") }
        return result
    }

    private func require(_ name: String, _ condition: String) async throws {
        let result = try await js("String(\(condition))")
        checks[name] = result == "true"
        if result != "true" { throw SmokeFailure(description: "Check failed: \(name)") }
    }

    private func snapshot(_ name: String) async throws {
        let configuration = WKSnapshotConfiguration()
        configuration.rect = webView.bounds
        configuration.snapshotWidth = NSNumber(value: Double(webView.bounds.width))
        let image = try await webView.takeSnapshot(configuration: configuration)
        guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            throw SmokeFailure(description: "Unable to encode WebKit snapshot.")
        }
        try png.write(to: destination.appendingPathComponent(name))
    }

    private func run() async throws {
        var ready = false
        for _ in 0..<120 {
            if try await js("String(document.querySelector('#scene').dataset.ready === 'true' && document.querySelector('#scene').getAttribute('aria-busy') === 'false')") == "true" { ready = true; break }
            try await Task.sleep(for: .milliseconds(50))
        }
        guard ready else { throw SmokeFailure(description: "Scene did not become ready.") }
        try await require("no asset error", "document.querySelector('#scene-error').hidden")
        try await require("local production profile", "document.documentElement.dataset.art === 'local-design'")
        try await require("canvas is laid out", "document.querySelector('#world').width >= 480 && document.querySelector('#world').height >= 270")
        try await require("desktop has no horizontal overflow", "document.documentElement.scrollWidth <= innerWidth")
        try await Task.sleep(for: .seconds(1))
        // Static first-frame capture is useful even when this host is occluded.
        try await snapshot("desktop.png")
        for (name, width, height) in [("layout-mobile", 390.0, 844.0), ("layout-ultrawide", 1960.0, 900.0)] {
            window.setContentSize(NSSize(width: width, height: height))
            try await Task.sleep(for: .milliseconds(200))
            try await require("\(name) has no horizontal overflow", "document.documentElement.scrollWidth <= innerWidth")
            try await snapshot("\(name).png")
        }
        window.setContentSize(NSSize(width: 1440, height: 900))
        try await Task.sleep(for: .milliseconds(200))
        try await require("visible page for animation checks", "document.visibilityState === 'visible'")

        let reduced = try await js("String(matchMedia('(prefers-reduced-motion: reduce)').matches)") == "true"
        if !reduced {
            _ = try await js("document.querySelector('#pause-button').click(); window.__smokeCanvas = document.querySelector('#world').toDataURL(); 'ok'")
            try await require("manual pause state", "document.querySelector('#pause-button').getAttribute('aria-pressed') === 'true'")
            try await Task.sleep(for: .milliseconds(250))
            try await require("pause freezes canvas pixels", "document.querySelector('#world').toDataURL() === window.__smokeCanvas")
        } else {
            try await require("OS reduced motion respected", "document.querySelector('#pause-button').disabled")
        }
        _ = try await js("document.querySelector('#about-open').focus(); document.querySelector('#about-open').click(); 'ok'")
        try await require("about opens", "document.querySelector('#about-dialog').open")
        try await require("dialog autofocus", "document.activeElement.id === 'about-close'")
        try await snapshot("about.png")
        _ = try await js("let s = document.querySelector('#still-setting'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#about-close').click(); 'ok'")
        try await require("dialog closes and returns focus", "!document.querySelector('#about-dialog').open && document.activeElement.id === 'about-open'")
        try await require("still mode disables animation control", "document.querySelector('#pause-button').disabled")
        _ = try await js("window.__smokeCanvas = document.querySelector('#world').toDataURL(); 'ok'")
        try await Task.sleep(for: .milliseconds(250))
        try await require("still mode freezes canvas pixels", "document.querySelector('#world').toDataURL() === window.__smokeCanvas")
        _ = try await js("document.querySelector('#about-open').click(); let s2 = document.querySelector('#still-setting'); s2.checked = false; s2.dispatchEvent(new Event('change', { bubbles: true })); let p = document.querySelector('#power-setting'); p.checked = true; p.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#about-close').click(); 'ok'")
        if !reduced {
            try await require("settings preserve manual pause", "document.querySelector('#pause-button').getAttribute('aria-pressed') === 'true'")
            _ = try await js("document.querySelector('#pause-button').click(); 'ok'")
            try await require("resume state", "document.querySelector('#pause-button').getAttribute('aria-pressed') === 'false'")
            try await require("15fps setting active", "document.querySelector('#playback-status').textContent.includes('15fps')")
            _ = try await js("window.__smokeCanvas = document.querySelector('#world').toDataURL(); 'ok'")
            try await Task.sleep(for: .milliseconds(1100))
            try await require("resume advances canvas pixels", "document.querySelector('#world').toDataURL() !== window.__smokeCanvas")
        }
        for (name, width, height) in [("mobile", 390.0, 844.0), ("ultrawide", 1960.0, 900.0)] {
            window.setContentSize(NSSize(width: width, height: height))
            try await Task.sleep(for: .milliseconds(200))
            try await require("\(name) has no horizontal overflow", "document.documentElement.scrollWidth <= innerWidth")
            try await require("\(name) retains logical safe area", "document.querySelector('#world').width >= 480 && document.querySelector('#world').height >= 270")
            try await snapshot("\(name).png")
        }
        window.orderOut(nil)
        for _ in 0..<40 {
            if try await js("String(document.hidden)") == "true" { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        try await require("native hidden event observed", "document.hidden")
        _ = try await js("window.__smokeCanvas = document.querySelector('#world').toDataURL(); 'ok'")
        try await Task.sleep(for: .milliseconds(250))
        try await require("hidden window freezes canvas pixels", "document.querySelector('#world').toDataURL() === window.__smokeCanvas")
        guard scriptErrors.isEmpty else { throw SmokeFailure(description: "JavaScript errors: \(scriptErrors.joined(separator: "; "))") }
        checks["no uncaught JavaScript errors"] = true
        let report: [String: Any] = ["engine": "system macOS WKWebView", "checks": checks, "osReducedMotion": reduced,
                                     "scope": "Native WebKit smoke only; not manual Safari/Chrome, real sleep/wake, or 30-minute power measurement."]
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("report.json"))
        print("WEBKIT_SMOKE_PASS: \(checks.count) checks; screenshots saved in \(destination.path)")
    }

    private func finish(error: Error?) {
        guard !finished else { return }
        finished = true
        exitCode = error == nil ? 0 : 1
        if let error { print("WEBKIT_SMOKE_FAIL: \(error)") }
        runTask?.cancel(); runTask = nil
        timeoutTask?.cancel(); timeoutTask = nil
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "smokeError")
        window.close()
        NSApplication.shared.stop(nil)
        if let event = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [], timestamp: 0,
                                         windowNumber: 0, context: nil, subtype: 0, data1: 0, data2: 0) {
            NSApplication.shared.postEvent(event, atStart: false)
        }
    }
}

@main
struct WebKitSmoke {
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 3, let url = URL(string: CommandLine.arguments[1]),
              url.scheme == "http", ["127.0.0.1", "localhost"].contains(url.host ?? "") else {
            throw SmokeFailure(description: "Usage: webkit-smoke http://127.0.0.1:<port>/ <output-directory>")
        }
        let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let app = NSApplication.shared
        // .prohibited cannot present a visible window; that would test a hidden page.
        app.setActivationPolicy(.accessory)
        app.finishLaunching()
        app.unhideWithoutActivation()
        let runner = SmokeRunner(destination: output)
        runner.start(url: url)
        withExtendedLifetime(runner) { app.run() }
        exit(runner.exitCode)
    }
}
