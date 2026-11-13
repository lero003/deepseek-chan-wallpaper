import CoreGraphics

/// One physical display as AppKit reports it. `id` is kept for tests/diagnostics;
/// drawn panels are keyed by their frame so mirrored displays never stack windows.
public struct WallpaperDisplay: Equatable, Sendable {
    public let id: UInt32
    public let frame: CGRect
    public init(id: UInt32, frame: CGRect) {
        self.id = id
        self.frame = frame
    }
}

public enum WallpaperDisplayLayout {
    /// Unique, stable frames for every usable connected display. Invalid rectangles
    /// are skipped rather than used to create a panel at an unsafe size/position.
    public static func frames(for displays: [WallpaperDisplay]) -> [CGRect] {
        var frames: [CGRect] = []
        for display in displays {
            // Validate the AppKit frame as reported. A negative width is malformed,
            // not an invitation to normalize and create a surprising panel.
            let raw = display.frame
            guard raw.origin.x.isFinite, raw.origin.y.isFinite,
                  raw.width.isFinite, raw.height.isFinite,
                  raw.width >= 1, raw.height >= 1 else { continue }
            let frame = raw.standardized
            guard !frames.contains(where: { $0.equalTo(frame) }) else { continue }
            frames.append(frame)
        }
        return frames.sorted {
            if $0.origin.x != $1.origin.x { return $0.origin.x < $1.origin.x }
            if $0.origin.y != $1.origin.y { return $0.origin.y < $1.origin.y }
            if $0.width != $1.width { return $0.width < $1.width }
            return $0.height < $1.height
        }
    }
}