# Run Sol Check on a phone

## Browser demo

From the repository root, install dependencies with `npm ci` and run `npm run serve:phones`. This builds the production web app, starts LAN previews on ports 4173 (HTTP) and 4174 (HTTPS), and prints a QR code. Open it from a phone on the same Wi-Fi. The HTTPS preview uses a local self-signed certificate. For camera and microphone access, use a trusted HTTPS origin on the phone. Desktop preview at localhost can use media permissions directly. [Preview configuration](../vite.config.ts) · [Browser media requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

On phones, Dashboard, Assessment, Check-in and Timeline are in the bottom bar. **More** opens the other destinations. The web app can work offline once **Demo and data** reports it is ready. For offline voice, let speech recognition and the local Sol voice load while the server is reachable so their models are cached.

## Native iOS and Android builds

The Capacitor 8 projects use app ID `com.solcheck.astronaut`. The iOS project supports iOS 15 or later and needs macOS with Xcode 26 or later to build. The Android project uses Java 21, compiles and targets API 36, and has a minimum SDK of API 24. Set up the platform tools and run commands from the repository root. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) · [Android SDK settings](../android/variables.gradle)

| Goal | Command |
| --- | --- |
| Build the web assets and sync both native projects | `npm run cap:sync` |
| Sync and open Xcode | `npm run ios` |
| Sync and open Android Studio | `npm run android` |
| Build a debug APK | `npm run android:apk` |
| Copy an existing debug APK to `dist/` and show its download QR | `npm run android:qr` |
| Build and install on a connected iPhone in Developer Mode | `APPLE_TEAM_ID=YOUR_TEAM_ID npm run ios:device` |
| Regenerate icons and splash screens | `npm run icons` |

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. To use its QR code, start `npm run preview` after building the APK and keep the phone on the same Wi-Fi. Android may ask permission to install the APK from the browser. For iPhone device installation, use a signing team configured in Xcode and unlock and trust the device. [Android QR helper](../scripts/android-qr.mjs) · [iPhone install script](../scripts/ios-install.mjs)

To build for the iOS Simulator from the command line after syncing:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

The native build places the web app, data and models inside the WebView bundle and disables the service worker. The postbuild step renames the camera dependencies' extensionless `+esm` modules to `esm.mjs` and patches their references for WebView loading. [Capacitor configuration](../capacitor.config.ts) · [Postbuild script](../scripts/native-postbuild.mjs)

The camera scans use a video-only stream. The read-aloud voice check, push-to-talk and hands-free voice mode request separate audio access. Camera and microphone usage strings are defined in the iOS app, and the Android manifest declares camera and audio permissions. Native checklist and save confirmations can trigger haptics. The vigilance task uses a visual stimulus. [iOS usage strings](../ios/App/App/Info.plist) · [Android permissions](../android/app/src/main/AndroidManifest.xml) · [Native integration](../src/app/native.ts)

## Device checks

An earlier build was smoke-tested offline in the iPhone 17 Pro simulator and an Android API 36 emulator. The Android run also checked camera module imports, WASM MIME type and the astronaut model with six markers. This repository includes synthetic camera and microphone bench results. It has no recorded physical-device comparison for the sensor estimates. [Validation](validation/README.md)

For a native build, check first launch in airplane mode, reload after saving a check-in, and open both 3D viewers. On physical devices, check camera and microphone grant and deny flows, stop a capture mid-session and change routes, then confirm manual entry remains available. Check the bottom bar, safe areas and 3D markers with VoiceOver or TalkBack.

## Expo Go preview

[The Expo project](../solcheck-expo/AGENTS.md) is a development WebView wrapper that loads a reachable web server. It currently uses endpoints embedded in `App.js`. The QR helper writes its URL to `appUrl.js`, which that screen does not consume. The Capacitor projects bundle the app for native offline use.
