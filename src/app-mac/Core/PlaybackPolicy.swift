import Foundation

public struct PlaybackPolicy: Equatable, Sendable {
    public var manuallyPaused = false
    public var userLowPower = false
    public var systemLowPower = false
    public var reducedMotion = false
    public var sleeping = false
    public var sessionActive = true
    public var hasVisibleSurface = false
    public var terminating = false
    public init() {}
    public var fps: Int { userLowPower || systemLowPower ? 15 : 30 }
    public var shouldAnimate: Bool {
        hasVisibleSurface && !manuallyPaused && !reducedMotion && !sleeping && sessionActive && !terminating
    }
    public var status: String {
        if terminating { return "終了しています" }
        if sleeping || !sessionActive { return "スリープ・非表示のため停止中" }
        if reducedMotion { return "OS設定に合わせて静止中" }
        if manuallyPaused { return "ひと休みしています" }
        if !hasVisibleSurface { return "表示されるまで一休み" }
        return fps == 15 ? "ゆっくり描画 · 15fps" : "音のない、小さな世界"
    }
}

public struct FrameClock: Sendable {
    private var previous: Double?
    public init() {}
    public mutating func reset() { previous = nil }
    public mutating func sample(_ timestamp: Double) -> Double {
        guard timestamp.isFinite else { reset(); return 0 }
        let last = previous
        previous = timestamp
        guard let last else { return 0 }
        let elapsed = timestamp - last
        return elapsed > 0 && elapsed <= 0.25 ? elapsed : 0
    }
}
