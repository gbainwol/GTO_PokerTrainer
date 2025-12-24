# UI stack options for mobile and desktop

## Evaluation criteria
- **Plugin availability:** Breadth and maintenance of packages for native capabilities (e.g., auth, storage, device APIs) and third-party integrations.
- **Desktop maturity:** First-party desktop support, community adoption, performance (native vs. web shell), and stability of long-running releases.
- **Build tooling:** Quality of CLI/IDE tooling, CI friendliness, caching, and reproducibility across macOS, Windows, and Linux.

## Capability comparison
| Area | Flutter | React Native |
| --- | --- | --- |
| Mobile | Mature, production-grade on iOS/Android with strong hot-reload and stable release cadence. | Mature on iOS/Android with large community; Metro bundler and Hermes optional. |
| Plugin availability | Extensive, first-party maintained plugins (camera, auth, storage) plus well-supported community packages; federated plugins cover desktop. | Very large ecosystem, but quality varies; some native modules are iOS/Android-only, requiring custom bridges for desktop/Electron/Tauri. |
| Desktop maturity | First-class macOS/Windows/Linux targets with native rendering; stable stable channels and LTS-style cadence. | Official macOS/Windows support exists but lags mobile; Linux support is community-driven. Often paired with Electron/Tauri for desktop parity. |
| Build tooling | `flutter` CLI provides reproducible builds, artifact caching, and built-in flavoring; good CI support with `flutter build` per target. | Relies on Xcode/Android Studio plus Node-based Metro bundler; desktop via RN-macos/win or Electron/Tauri adds extra build systems. |

## Recommendation
Choose **Flutter** for a unified mobile + desktop stack. It provides:
- Native desktop targets without an additional shell (lower runtime overhead).
- Consistent plugin coverage across mobile and desktop via federated packages.
- Single CLI/toolchain that simplifies CI for all targets.

React Native remains viable for mobile-first teams with deep JavaScript/TypeScript investment, but desktop parity typically requires adding Electron or Tauri and maintaining extra native modules.

## Shared component library location
- Use a mono-repo package at `packages/ui/` to host shared design system components and theming.
- For Flutter: implement as a Flutter package exporting widgets, themes, and platform adaptations.
- For React Native: implement as a React Native package with platform-specific modules and web/Electron adapters when needed.

## Desktop packaging paths and CI
### Flutter desktop
1. Targets: macOS `.app`/`.dmg`, Windows `.exe` or MSIX, Linux `.deb`/AppImage via `flutter build <platform>`.
2. CI steps (per platform):
   - Install Flutter SDK (pin channel/version) and platform SDK (Xcode, MSVC/WinSDK, Linux build-essential).
   - `flutter pub get` → `flutter analyze` (optional) → `flutter test` (if applicable).
   - `flutter build macos|windows|linux --release` with caching for `~/.pub-cache` and build outputs.
   - Archive artifacts for release pipelines (e.g., notarization/signing handled downstream).

### React Native desktop (Electron or Tauri)
1. Use React Native for mobile; wrap the web bundle for desktop via Electron or Tauri to ensure parity.
2. CI steps:
   - Install Node/Yarn/PNPM and platform SDKs (Xcode for macOS builds, Windows SDK/MSVC, Linux prerequisites).
   - `npm|yarn|pnpm install` → lint/tests → `react-native bundle` (or `expo export`) to produce web assets.
   - Electron: package with `electron-builder`/`electron-packager` for `.app`, `.exe`, `.deb`/AppImage`.
   - Tauri: run `tauri build`, ensuring Rust toolchain installed and signing configs set per platform.
   - Cache `node_modules`/bundler cache and target-specific build artifacts; publish per-platform installers.

### When to choose each desktop path
- Prefer **Flutter desktop** when keeping a single Dart toolchain and native rendering is desired.
- Use **React Native + Electron/Tauri** if the team prioritizes JavaScript/TypeScript reuse and accepts a web-shell runtime for desktop.
