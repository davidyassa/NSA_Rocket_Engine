/**
 * Camera settings that make the face pulse readable in more lighting conditions.
 *
 * The pulse is a change of well under 1 % in skin brightness. A camera's automatic
 * exposure, white balance and focus keep adjusting during a scan, and each adjustment
 * changes the whole face's brightness and colour far more than the pulse does. So once
 * the picture has settled for the current light, these are held fixed for the scan.
 * Where a browser or camera does not support it, nothing changes.
 */

type Mode = 'manual' | 'continuous' | 'single-shot' | 'none';
interface TrackCaps { exposureMode?: Mode[]; whiteBalanceMode?: Mode[]; focusMode?: Mode[] }

const FIELDS = ['exposureMode', 'whiteBalanceMode', 'focusMode'] as const;

/** Which settings this camera can hold fixed (pure: tested with fake capabilities). */
export function lockableSettings(caps: TrackCaps): (typeof FIELDS)[number][] {
  return FIELDS.filter((f) => caps[f]?.includes('manual'));
}

async function apply(track: MediaStreamTrack | null, mode: Mode, fields: readonly (typeof FIELDS)[number][]): Promise<string[]> {
  if (!track || track.readyState !== 'live' || !fields.length) return [];
  const constraint = Object.fromEntries(fields.map((f) => [f, mode])) as MediaTrackConstraintSet;
  try {
    await track.applyConstraints({ advanced: [constraint] });
    return [...fields];
  } catch {
    return [];
  }
}

function caps(track: MediaStreamTrack | null): TrackCaps {
  try { return (track?.getCapabilities?.() ?? {}) as TrackCaps; } catch { return {}; }
}

/** Hold exposure, white balance and focus where they are now. Returns what was held. */
export function holdCameraSettings(track: MediaStreamTrack | null): Promise<string[]> {
  return apply(track, 'manual', lockableSettings(caps(track)));
}

/** Let the camera adjust to the light again (before re-holding after the light changed). */
export function releaseCameraSettings(track: MediaStreamTrack | null): Promise<string[]> {
  const c = caps(track);
  return apply(track, 'continuous', FIELDS.filter((f) => c[f]?.includes('continuous')));
}

/** Seconds of automatic adjustment allowed before the settings are held. */
export const SETTLE_MS = 2000;

/**
 * The face light (screen glows white around the oval) switches on when the face has
 * been this dark for FACE_LIGHT_AFTER_MS; brightness is the 0–1 average inside the oval.
 */
export const FACE_LIGHT = { onBelow: 0.3, afterMs: 1000 } as const;
