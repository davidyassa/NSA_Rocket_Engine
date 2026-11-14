import { describe, expect, it } from 'vitest';
import { HEALTH_DOMAINS } from '../../../contracts';
import {
  anchorDomain, domainFromHotspotName, fallbackAnchor, framingDistance, normalizeTransform, pulsePeriodSeconds, resolveAnchors,
} from './hotspots';

const bounds = { min: { x: -0.4, y: 0, z: -0.3 }, max: { x: 0.4, y: 1.8, z: 0.3 } };

describe('3D model integration contract', () => {
  it('parses Blender hotspot empty names, including .001 duplicates', () => {
    expect(domainFromHotspotName('hotspot_cardiovascular')).toBe('cardiovascular');
    expect(domainFromHotspotName('hotspot_sleep.001')).toBe('sleep');
    expect(domainFromHotspotName('hotspot_spleen')).toBeNull();
    expect(domainFromHotspotName('Helmet')).toBeNull();
  });

  it('accepts Hotspot_* empties that carry a domain custom property', () => {
    expect(anchorDomain('Hotspot_Chest_Heart', { domain: 'cardiovascular', label: 'Cardiovascular & Heart Rate' })).toBe('cardiovascular');
    expect(anchorDomain('Hotspot_Visor', { solcheck_domain: 'sleep' })).toBe('sleep');
    expect(anchorDomain('Hotspot_Visor', {})).toBeNull();
    expect(anchorDomain('Helmet_Shell', { domain: 'sleep' })).toBeNull();
    expect(anchorDomain('hotspot_metabolic', undefined)).toBe('metabolic');
  });

  it('resolves all six anchors, preferring named empties', () => {
    const { anchors, fromModel } = resolveAnchors({ sleep: { x: 0, y: 1.6, z: 0.2 } }, bounds);
    expect(Object.keys(anchors).sort()).toEqual([...HEALTH_DOMAINS].sort());
    expect(anchors.sleep).toEqual({ x: 0, y: 1.6, z: 0.2 });
    expect(fromModel).toEqual(['sleep']);
  });

  it('places fallback anchors inside the model bounds with head above chest above abdomen', () => {
    const head = fallbackAnchor('behavioral', bounds);
    const chest = fallbackAnchor('cardiovascular', bounds);
    const abdomen = fallbackAnchor('metabolic', bounds);
    for (const p of [head, chest, abdomen]) {
      expect(p.y).toBeGreaterThanOrEqual(bounds.min.y);
      expect(p.y).toBeLessThanOrEqual(bounds.max.y);
    }
    expect(head.y).toBeGreaterThan(chest.y);
    expect(chest.y).toBeGreaterThan(abdomen.y);
    expect(chest.z).toBeGreaterThan(0); // front of the suit
  });

  it('normalizes any export scale to a 1.8 m figure standing on the ground', () => {
    const cm = { min: { x: -40, y: 10, z: -30 }, max: { x: 40, y: 190, z: 30 } };
    const { scale, offset } = normalizeTransform(cm);
    expect(scale).toBeCloseTo(0.01);
    expect(cm.min.y * scale + offset.y).toBeCloseTo(0);
    expect(cm.max.y * scale + offset.y).toBeCloseTo(1.8);
  });

  it('frames the full figure in the camera', () => {
    const distance = framingDistance(1.8, 0.8, 30, 0.75);
    const visibleHeight = 2 * distance * Math.tan((30 * Math.PI) / 360);
    expect(visibleHeight).toBeGreaterThan(1.8);
  });

  it('drives the chest pulse from heart rate with safe bounds', () => {
    expect(pulsePeriodSeconds(60)).toBeCloseTo(1);
    expect(pulsePeriodSeconds(null)).toBeCloseTo(60 / 68);
    expect(pulsePeriodSeconds(400)).toBeCloseTo(60 / 180);
  });
});
