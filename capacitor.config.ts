import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Sol Check native shells. The web bundle (dist/, built with `npm run build:native`)
 * is packaged inside each app and served locally, so the apps run fully offline.
 * No `server.url`: the app must never load from a network host.
 */
const config: CapacitorConfig = {
  appId: 'com.solcheck.astronaut',
  appName: 'Sol Check',
  webDir: 'dist',
  backgroundColor: '#070B14',
  ios: {
    contentInset: 'never',
    backgroundColor: '#070B14',
    // Camera preview plays inline inside the check-in card rather than full screen.
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: '#070B14',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#070B14',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#070B14',
      overlaysWebView: true,
    },
  },
};

export default config;
