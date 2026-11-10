import Foundation

/// Maps only events delivered to the explicit manual preview responder. No global monitor.
public enum GameKeys {
    public static func name(for code: UInt16) -> String? {
        switch code {
        case 0: "a"; case 1: "s"; case 2: "d"; case 13: "w"
        case 123: "arrowleft"; case 124: "arrowright"; case 125: "arrowdown"; case 126: "arrowup"
        case 38, 6: "attack"; case 40, 7: "dodge"; case 37, 8: "special"; case 53: "pause"
        default: nil
        }
    }
    public static func isMovement(_ name: String) -> Bool { ["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown"].contains(name) }
}
public struct HeldGameKeys: Sendable {
    private var codes: Set<UInt16> = []
    public init() {}
    public mutating func update(_ code: UInt16, down: Bool) {
        guard let name = GameKeys.name(for: code), GameKeys.isMovement(name) else { return }
        if down { codes.insert(code) } else { codes.remove(code) }
    }
    public mutating func clear() { codes.removeAll(keepingCapacity: true) }
    public var direction: (x: Double, y: Double) {
        var x = 0.0, y = 0.0
        for code in codes {
            switch GameKeys.name(for: code) {
            case "a", "arrowleft": x -= 1
            case "d", "arrowright": x += 1
            case "w", "arrowup": y -= 1
            case "s", "arrowdown": y += 1
            default: break
            }
        }
        return (max(-1, min(1, x)), max(-1, min(1, y)))
    }
}
