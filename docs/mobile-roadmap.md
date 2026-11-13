# Native iOS and Android apps (Capacitor 8)

Status: **native projects generated in `ios/` and `android/`.** App ID `com.solcheck.astronaut`.

## Everyday commands

```sh
npm run cap:sync   # native web build + esm.mjs fix-up + copy into ios/ and android/
npm run ios        # sync, then open Xcode (pick a simulator or device, press Run)
npm run android    # sync, then open Android Studio (pick an emulator or device, press Run)
npm run icons      # regenerate app icons and splash screens from scripts/generate-app-icons.mjs
```

Command-line builds (no IDE):

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools android/gradlew -p android assembleDebug
```

## What the native build changes

- `SOLCHECK_TARGET=native` disables the service worker: every asset ships inside the app.
- `scripts/native-postbuild.mjs` copies `vendor/{litert,mediapipe}/+esm` to `esm.mjs` and
  rewrites the camera SDK references. Without this, iOS routes the extensionless module to
  `index.html` (text/html) and Android serves it untyped, so the camera pulse check would fail.
  The script exits with an error if the SDK's references change.
- `src/app/native.ts`: dark status bar with light icons, splash hidden after start-up, and a
  light haptic tap on checklist toggles and check-in saves. No haptic on the PVT-B stimulus.
- The Demo page shows "Bundled in app · works offline" instead of the service-worker status.
- Safe areas use Capacitor Android's injected `--safe-area-inset-*` values, falling back to `env()`.
- Camera permission: `NSCameraUsageDescription` (iOS) and `CAMERA` with the camera feature
  optional (Android). Video only, never audio.
- App icon and splash: the Sol Check mark in the console palette (no NASA insignia).

## Mobile-ready web layer

- Phone layout under 768 px: bottom bar Dashboard · Assessment · **Check-in (centre)** ·
  Timeline · More (CMO console, trends, cognitive lab, hazards, demo data, reset).
- Touch devices (`pointer: coarse`): every button, tab, nav item and `summary` is at least
  44 × 44 px. 3D markers keep a 28 px visual with an invisible 44 px+ hit area.
- Safe areas: `viewport-fit=cover`, plus `env(safe-area-inset-*)` padding on the top bar,
  content gutters and bottom bar (notch, Dynamic Island, gesture bar).
- Charts on `#/trends` keep a 480 px minimum width and scroll sideways on phones.
- Everything is self-hosted (WASM, models, fonts, RadLab CSV, astronaut GLB). No CDN.

## Decisions taken

| Item | Recommendation | Why |
| --- | --- | --- |
| App ID | `com.solcheck.astronaut` (or a domain the team owns) | `gov.nasa.*` implies NASA publishes the app; a reverse domain should be one you control. |
| Camera plugin | **Do not add `@capacitor/camera`** | It captures still photos. The rPPG check uses a live `getUserMedia` stream inside the WebView, which needs only the OS permission strings below. |
| Haptics | Checklist toggles and save confirmations only. **Never on the PVT-B stimulus** | A buzz at stimulus onset would cue the reaction-time test and change what it measures. |
| Splash | Static `#070B14` native splash; any cyan pulse runs in the web layer after load, honouring reduced motion | Native splash screens are static images. |
| Icons | Generate from the existing `public/sol-check.svg` with `@capacitor/assets` | No NASA insignia, logotype or patches in store assets. |

## `capacitor.config.ts`

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.solcheck.astronaut',
  appName: 'Sol Check',
  webDir: 'dist',
  backgroundColor: '#070B14',
  ios: { contentInset: 'never', backgroundColor: '#070B14' },
  android: { backgroundColor: '#070B14' },
  plugins: {
    SplashScreen: { backgroundColor: '#070B14', launchAutoHide: true, showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#070B14', overlaysWebView: true },
  },
  // No `server.url`: the app must load from the bundled dist/, never from a network host.
};

export default config;
```

`StatusBar.style: 'DARK'` means a dark background with light status-bar icons.

## Platform permissions

**iOS `ios/App/App/Info.plist`**

```xml
<key>NSCameraUsageDescription</key>
<string>Sol Check uses the camera only on this device to estimate your pulse. No video or face data is saved or sent.</string>
```

No microphone key: the camera request is video-only.

**Android `android/app/src/main/AndroidManifest.xml`**

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Capacitor's WebChromeClient turns the WebView's camera request into the runtime permission prompt.

## Verification so far (13 Nov 2026)

| Check | iOS (iPhone 17 Pro simulator) | Android (API 36 emulator) |
| --- | --- | --- |
| Native build | `xcodebuild` **BUILD SUCCEEDED** | `gradlew assembleDebug` **BUILD SUCCESSFUL** (15.7 MB debug APK) |
| App launches offline from bundle, console theme, safe areas | ✔ | ✔ (navy system bars, light icons) |
| Camera modules (`esm.mjs`) served as `text/javascript` and importable | not yet inspected | ✔ LiteRT and MediaPipe import, FilesetResolver initialises |
| Original `+esm` path (control) | | ✘ served as `text/html`, import fails (confirms the fix is needed) |
| `.wasm` served as `application/wasm` | not yet inspected | ✔ |
| 3D astronaut renders (team GLB, 6 markers, no 2D fallback) | not yet inspected | ✔ |

## Still to test on real devices

1. **Camera pulse check end to end.** Simulators and emulators have no real face camera. On a
   phone: consent → measuring → estimate → "Use … bpm"; deny permission; background the app
   mid-scan; confirm tracks stop on route change.
2. **iOS WebView inspection.** Use Safari ▸ Develop ▸ Simulator to confirm `esm.mjs` imports
   and the 3D view on iOS, as was done on Android.
3. **WebGL and memory on low-end Android.** Check the 2.7 MB crew GLB on a budget phone
   and confirm the health links stay available if the model cannot load.
4. **Signing and store upload.** Debug builds only so far; release needs a team Apple
   Developer account and an Android upload keystore.

## Device test checklist

- Airplane mode from first launch: dashboard, check-in, assessment, timeline, trends, 3D view.
- Camera pulse check: consent → measuring → weak signal → retry → stop; manual entry untouched.
- Safe areas on a notched iPhone and on Android with gesture navigation.
- VoiceOver / TalkBack through the six body-region markers and the bottom bar.
