// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KujiraWallpaper",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "KujiraWallpaper", targets: ["KujiraApp"])],
    dependencies: [],
    targets: [
        .target(name: "KujiraCore", path: "src/app-mac/Core"),
        .executableTarget(name: "KujiraApp", dependencies: ["KujiraCore"], path: "src/app-mac/App"),
        .testTarget(name: "KujiraCoreTests", dependencies: ["KujiraCore"], path: "tests/native")
    ],
    swiftLanguageModes: [.v6]
)
