import { HEALTH_DOMAINS, type HealthDomain } from '../../../contracts';

/**
 * Integration contract between the team's Blender astronaut and Sol Check.
 * See docs/3d-model-integration.md for the export checklist.
 *
 * - Model file: assets/astronaut/astronaut_sol_check.glb (imported directly; no copies)
 * - Units metres, +Y up, astronaut faces +Z (Blender: "+Y Up" export, figure faces -Y in Blender)
 * - Hotspot anchors: empties named `hotspot_<domain>` (e.g. hotspot_cardiovascular)
 * - Clickable parts: custom property `solcheck_domain = "<domain>"` on a mesh or a parent
 *   (exported with Include > Custom Properties; arrives in three.js as userData.solcheck_domain)
 */
export const HOTSPOT_NODE_PREFIX = 'hotspot_';
export const DOMAIN_PROPERTY = 'solcheck_domain';
export const TARGET_HEIGHT_M = 1.8;

export interface Vec3Like { x: number; y: number; z: number }
export interface BoundsLike { min: Vec3Like; max: Vec3Like }

/**
 * Fallback anchors as fractions of the model's bounding box, used when the
 * GLB has no `hotspot_<domain>` empty. x/z are -0.5..0.5 of width/depth
 * (+z = front), y is 0..1 of height from the soles. The astronaut's left is +x.
 */
export const FALLBACK_ANCHORS: Record<HealthDomain, Vec3Like> = {
  behavioral: { x: 0, y: 0.975, z: 0.1 },
  sleep: { x: 0, y: 0.89, z: 0.5 },
  cardiovascular: { x: 0.1, y: 0.72, z: 0.5 },
  temperature: { x: -0.06, y: 0.63, z: 0.5 },
  metabolic: { x: 0, y: 0.54, z: 0.46 },
  symptoms: { x: -0.43, y: 0.47, z: 0.3 },
};

/** Spoken/visible region names used by the hotspot buttons. */
export const HOTSPOT_LABELS: Record<HealthDomain, string> = {
  behavioral: 'Head',
  sleep: 'Visor',
  cardiovascular: 'Chest',
  temperature: 'Torso',
  metabolic: 'Abdomen',
  symptoms: 'Limbs',
};

export function isHealthDomain(value: unknown): value is HealthDomain {
  return typeof value === 'string' && (HEALTH_DOMAINS as readonly string[]).includes(value);
}

/** Parses `hotspot_cardiovascular`, `hotspot_cardiovascular.001` (Blender duplicates). */
export function domainFromHotspotName(name: string): HealthDomain | null {
  if (!name.startsWith(HOTSPOT_NODE_PREFIX)) return null;
  const domain = name.slice(HOTSPOT_NODE_PREFIX.length).replace(/\.\d+$/, '');
  return isHealthDomain(domain) ? domain : null;
}

export function fallbackAnchor(domain: HealthDomain, bounds: BoundsLike): Vec3Like {
  const f = FALLBACK_ANCHORS[domain];
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const depth = bounds.max.z - bounds.min.z;
  return {
    x: (bounds.min.x + bounds.max.x) / 2 + f.x * width,
    y: bounds.min.y + f.y * height,
    z: (bounds.min.z + bounds.max.z) / 2 + f.z * depth,
  };
}

/** Named anchors win; every domain without one gets a bounding-box fallback. */
export function resolveAnchors(
  named: Partial<Record<HealthDomain, Vec3Like>>,
  bounds: BoundsLike,
): { anchors: Record<HealthDomain, Vec3Like>; fromModel: HealthDomain[] } {
  const anchors = {} as Record<HealthDomain, Vec3Like>;
  const fromModel: HealthDomain[] = [];
  for (const domain of HEALTH_DOMAINS) {
    const point = named[domain];
    if (point) {
      anchors[domain] = point;
      fromModel.push(domain);
    } else {
      anchors[domain] = fallbackAnchor(domain, bounds);
    }
  }
  return { anchors, fromModel };
}

/** Uniform scale + offset that stands the model on y=0, centred on x/z, TARGET_HEIGHT_M tall. */
export function normalizeTransform(bounds: BoundsLike, targetHeight = TARGET_HEIGHT_M) {
  const height = bounds.max.y - bounds.min.y;
  const scale = height > 0 ? targetHeight / height : 1;
  return {
    scale,
    offset: {
      x: -((bounds.min.x + bounds.max.x) / 2) * scale,
      y: -bounds.min.y * scale,
      z: -((bounds.min.z + bounds.max.z) / 2) * scale,
    },
  };
}

/** Camera distance that fits an object of the given height and width in a vertical FOV. */
export function framingDistance(height: number, width: number, fovDeg: number, aspect: number, margin = 1.18): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const byHeight = height / 2 / Math.tan(vFov / 2);
  const byWidth = width / 2 / Math.tan(hFov / 2);
  return Math.max(byHeight, byWidth) * margin;
}

/**
 * Anchor detection for an exported node. Accepts either naming convention:
 * - `hotspot_<domain>` (name carries the domain), or
 * - any `Hotspot_*` empty with a custom property `domain` / `solcheck_domain`
 *   (the team's generate_astronaut.py writes `Hotspot_Chest_Heart` + domain="cardiovascular").
 */
export function anchorDomain(name: string, userData: Record<string, unknown> | undefined): HealthDomain | null {
  const fromName = domainFromHotspotName(name);
  if (fromName) return fromName;
  if (!/^hotspot/i.test(name)) return null;
  const tagged = userData?.domain ?? userData?.[DOMAIN_PROPERTY];
  return isHealthDomain(tagged) ? tagged : null;
}

/** Heart-rate driven pulse period for the chest node, clamped to a sane range. */
export function pulsePeriodSeconds(bpm: number | null | undefined): number {
  if (!bpm || !Number.isFinite(bpm)) return 60 / 68;
  return 60 / Math.min(180, Math.max(35, bpm));
}
