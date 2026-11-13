#!/usr/bin/env node
/**
 * Renders the Sol Check mark (console palette, no NASA insignia or logotype)
 * into the source images used by `npx capacitor-assets generate` and the web
 * favicon / PWA icons.
 *
 *   node scripts/generate-app-icons.mjs && npx capacitor-assets generate --ios --android \
 *     --iconBackgroundColor "#070B14" --splashBackgroundColor "#070B14"
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const publicDir = path.join(root, 'public');
mkdirSync(assetsDir, { recursive: true });

const NAVY = '#070B14';
const SURFACE = '#0E1524';
const NASA_BLUE = '#0B3D91';
const ACCENT = '#4FD1FF';
const STEADY = '#52E0A4';

/** The mark on a 1024 canvas. `background` false leaves it transparent (Android adaptive foreground). */
function mark({ background = true, scale = 1 } = {}) {
  const s = (v) => (v * scale + 512 * (1 - scale)).toFixed(1);
  const r = (v) => (v * scale).toFixed(1);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <radialGradient id="glow" cx="50%" cy="42%" r="60%">
        <stop offset="0%" stop-color="${NASA_BLUE}" stop-opacity="0.85"/>
        <stop offset="70%" stop-color="${SURFACE}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${NAVY}" stop-opacity="1"/>
      </radialGradient>
      <radialGradient id="mars" cx="38%" cy="34%" r="70%">
        <stop offset="0%" stop-color="#E07A4A"/>
        <stop offset="60%" stop-color="#A9472A"/>
        <stop offset="100%" stop-color="#5C2414"/>
      </radialGradient>
    </defs>
    ${background ? `<rect width="1024" height="1024" fill="url(#glow)"/>` : ''}
    <ellipse cx="${s(512)}" cy="${s(512)}" rx="${r(330)}" ry="${r(132)}" fill="none" stroke="${ACCENT}" stroke-opacity="0.45" stroke-width="${r(14)}" transform="rotate(-18 512 512)"/>
    <circle cx="${s(512)}" cy="${s(512)}" r="${r(196)}" fill="url(#mars)"/>
    <circle cx="${s(512)}" cy="${s(512)}" r="${r(196)}" fill="none" stroke="${ACCENT}" stroke-width="${r(18)}"/>
    <path d="M ${s(250)} ${s(540)} H ${s(410)} L ${s(452)} ${s(452)} L ${s(506)} ${s(628)} L ${s(560)} ${s(404)} L ${s(608)} ${s(540)} H ${s(774)}"
      fill="none" stroke="${STEADY}" stroke-width="${r(30)}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${s(800)}" cy="${s(360)}" r="${r(30)}" fill="${ACCENT}"/>
  </svg>`;
}

function splash() {
  // 2732 square: the mark small and centred on the console background.
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <rect width="2732" height="2732" fill="${NAVY}"/>
    <g transform="translate(1058 1058) scale(0.6)">${mark({ background: false }).replace(/<\/?svg[^>]*>/g, '')}</g>
  </svg>`;
}

const render = (svg, file, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);

await render(mark(), path.join(assetsDir, 'icon-only.png'), 1024);
await render(mark({ background: false, scale: 0.72 }), path.join(assetsDir, 'icon-foreground.png'), 1024);
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NAVY } }).png().toFile(path.join(assetsDir, 'icon-background.png'));
await render(splash(), path.join(assetsDir, 'splash.png'), 2732);
await render(splash(), path.join(assetsDir, 'splash-dark.png'), 2732);

// Web favicon and PWA icons share the same mark.
writeFileSync(path.join(publicDir, 'sol-check.svg'), mark().trim() + '\n');
await render(mark(), path.join(publicDir, 'sol-check-192.png'), 192);
await render(mark(), path.join(publicDir, 'sol-check-512.png'), 512);

console.log('Icon sources written to assets/ and public/.');
