# Sol Check Expo Go preview

This directory is a separate Expo SDK 58 preview. [App.js](App.js) renders a single WebView with HTTPS and local Wi-Fi modes. [index.js](index.js) registers that component. The application routes and health logic live in the [main web app](../src/app/App.tsx).

Run `npm ci` from this directory, then run `npx expo start --go --lan` with a compatible Expo Go client on the same network. The WebView must load a reachable instance of the web app. For camera access, configure a trusted HTTPS endpoint. The root [QR helper](../scripts/expo-go.mjs) writes [appUrl.js](appUrl.js), while the screen still reads the two URL constants in [App.js](App.js). Treat those constants as the current configuration when diagnosing preview connectivity.

Run the main app's `npm test` and `npm run build` from the repository root when changing shared web behavior. To verify a wrapper change, load the WebView in Expo Go and exercise both connection modes. For SDK changes, use `npx expo install` and the reference matching the version in [package.json](package.json). [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/)

See the [mobile build guide](../docs/mobile-roadmap.md) for the offline Capacitor builds.
