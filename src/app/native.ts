/**
 * Native shell integration (Capacitor iOS / Android). Every call is a no-op on
 * the web, so the same bundle runs in browsers and inside the native apps.
 */
import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp) return;
  document.documentElement.dataset.native = nativePlatform;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // light icons on the #070B14 console
    if (nativePlatform === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true }); // content draws under it; CSS safe areas pad it
    }
  } catch {
    // Status bar styling is cosmetic; never block start-up.
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // ignore
  }
}

/**
 * Light confirmation tap for completed actions (checklist toggles, saves).
 * Deliberately never used for the PVT-B stimulus: a haptic cue at stimulus
 * onset would change what the reaction-time test measures.
 */
export async function confirmTap(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // ignore
  }
}
