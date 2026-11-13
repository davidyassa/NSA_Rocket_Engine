#!/usr/bin/env node
/**
 * Expo Go flow for Sol Check: scan the QR in Expo Go (Android) or the iPhone
 * Camera app, and the Expo shell (solcheck-expo/) opens Sol Check full screen.
 *
 * The shell loads Sol Check from a trusted https:// link (Cloudflare quick
 * tunnel to the local preview server) because phones only allow the camera on
 * https://. Usage:
 *   npm run preview                 # local server on :4173 (or npm run serve:phones)
 *   (cd solcheck-expo && npx expo start --go --lan)
 *   npm run expo:go                 # starts the tunnel if needed, wires the app, shows the QR
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = path.join(tmpdir(), 'solcheck-tunnel.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findUrl = () => (existsSync(log) ? readFileSync(log, 'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] : undefined);

let url = process.env.SOLCHECK_PUBLIC_URL || findUrl();
if (!url) {
  const out = openSync(log, 'w');
  spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://localhost:4173', '--http-host-header', 'localhost'],
    { detached: true, stdio: ['ignore', out, out] }).unref();
  for (let i = 0; i < 40 && !url; i += 1) { await sleep(1000); url = findUrl(); }
  if (!url) { console.error('Tunnel did not start. Is cloudflared installed (brew install cloudflared)?'); process.exit(1); }
}
writeFileSync(path.join(root, 'solcheck-expo', 'appUrl.js'),
  `// Where the Expo app loads Sol Check from. Must be a trusted https:// address so the\n// phone allows the camera inside the app (written by scripts/expo-go.mjs).\nexport const APP_URL = '${url}/';\n`);

const ip = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address)
  .find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a));
const expoUrl = `exp://${ip}:8081`;
const png = path.join(root, 'dist', 'expo-go-qr.png');
console.log(await QRCode.toString(expoUrl, { type: 'terminal', small: true }));
console.log(`  Expo Go: ${expoUrl}   (phone on the same Wi-Fi as this Mac)`);
console.log(`  Sol Check loads from: ${url}/`);
console.log('  iPhone: scan with the Camera app → open in Expo Go.  Android: Expo Go → Scan QR code.');
await QRCode.toFile(png, expoUrl, { width: 640, margin: 2, color: { dark: '#070B14', light: '#FFFFFF' } });
console.log(`  QR image: ${png}`);
if (process.platform === 'darwin' && !process.env.NO_OPEN) execFile('open', [png]);
