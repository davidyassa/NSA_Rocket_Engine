# CapApp-SPM

This local Swift package connects the iOS app to Capacitor and its plugins. Its [package manifest](Package.swift) is managed by the Capacitor CLI and resolves local plugin dependencies from the repository's `node_modules`.

After installing npm dependencies or changing the web bundle, run `npm run cap:sync` from the repository root. [Mobile build guide](../../../docs/mobile-roadmap.md)
