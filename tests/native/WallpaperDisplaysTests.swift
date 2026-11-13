import CoreGraphics
import Testing
@testable import KujiraCore

struct WallpaperDisplaysTests {
    @Test func everyDistinctConnectedDisplayGetsExactlyOnePanel() {
        let displays = [
            WallpaperDisplay(id: 3, frame: CGRect(x: 1440, y: 0, width: 1920, height: 1080)),
            WallpaperDisplay(id: 1, frame: CGRect(x: 0, y: 0, width: 1440, height: 900)),
            WallpaperDisplay(id: 2, frame: CGRect(x: -1200, y: 180, width: 1200, height: 1920)),
        ]
        #expect(WallpaperDisplayLayout.frames(for: displays) == [
            CGRect(x: -1200, y: 180, width: 1200, height: 1920),
            CGRect(x: 0, y: 0, width: 1440, height: 900),
            CGRect(x: 1440, y: 0, width: 1920, height: 1080),
        ])
    }

    @Test func mirroredDisplaysAndRepeatedFramesDoNotStackDuplicatePanels() {
        let displays = [
            WallpaperDisplay(id: 1, frame: CGRect(x: 0, y: 0, width: 1920, height: 1080)),
            WallpaperDisplay(id: 2, frame: CGRect(x: 0, y: 0, width: 1920, height: 1080)),
            WallpaperDisplay(id: 3, frame: CGRect(x: 0, y: 0, width: 1920, height: 1080)),
        ]
        #expect(WallpaperDisplayLayout.frames(for: displays) == [CGRect(x: 0, y: 0, width: 1920, height: 1080)])
    }

    @Test func emptyInvalidAndNonFiniteFramesAreSkippedWithoutLosingUsableDisplays() throws {
        let displays = [
            WallpaperDisplay(id: 1, frame: .zero),
            WallpaperDisplay(id: 2, frame: CGRect(x: CGFloat.nan, y: 0, width: 800, height: 600)),
            WallpaperDisplay(id: 3, frame: CGRect(x: 0, y: CGFloat.infinity, width: 800, height: 600)),
            WallpaperDisplay(id: 4, frame: CGRect(x: 0, y: 0, width: 800, height: 600)),
        ]
        #expect(WallpaperDisplayLayout.frames(for: displays) == [CGRect(x: 0, y: 0, width: 800, height: 600)])
        #expect(WallpaperDisplayLayout.frames(for: []).isEmpty)
        #expect(WallpaperDisplayLayout.frames(for: Array(displays.prefix(3))).isEmpty)
    }

    @Test func disconnectedAndRearrangedLayoutsProduceFreshStablePanels() throws {
        let two = [
            WallpaperDisplay(id: 1, frame: CGRect(x: 0, y: 0, width: 1440, height: 900)),
            WallpaperDisplay(id: 2, frame: CGRect(x: 1440, y: 90, width: 2560, height: 1440)),
        ]
        #expect(WallpaperDisplayLayout.frames(for: two).count == 2)
        // Unplugging the external display leaves exactly the built-in panel.
        #expect(WallpaperDisplayLayout.frames(for: [two[0]]) == [CGRect(x: 0, y: 0, width: 1440, height: 900)])
        // Re-arranging the external display preserves one panel per physical display.
        let rearranged = [
            WallpaperDisplay(id: 1, frame: CGRect(x: 2560, y: 0, width: 1440, height: 900)),
            WallpaperDisplay(id: 2, frame: CGRect(x: 0, y: 90, width: 2560, height: 1440)),
        ]
        #expect(WallpaperDisplayLayout.frames(for: rearranged) == [
            CGRect(x: 0, y: 90, width: 2560, height: 1440),
            CGRect(x: 2560, y: 0, width: 1440, height: 900),
        ])
    }
}