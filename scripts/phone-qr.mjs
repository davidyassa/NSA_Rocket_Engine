#!/usr/bin/env node
/**
 * Expo-style "scan to open" for Sol Check: prints a QR code for this computer's
 * Wi-Fi address so a phone on the same network can open the app with its camera.
 * Points at the HTTPS server (port 4174) because phones only allow the camera on https://.
 *
 *   npm run serve:phones   # starts the servers (http 4173 → redirects, https 4174)
 *   npm run phone          # shows the QR code
 */
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const port = process.env.SOLCHECK_HTTPS_PORT ?? '4174';
const route = process.argv[2] ?? '';
const addresses = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
// Prefer typical home/office Wi-Fi ranges.
const ip = addresses.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ?? addresses[0];
if (!ip) {
  console.error('No Wi-Fi/LAN address found. Connect this computer to the same Wi-Fi as the phone.');
  process.exit(1);
}
const url = `https://${ip}:${port}/${route ? `#/${route}` : ''}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.join(root, 'dist', 'phone-qr.png');

console.log(await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'M' }));
console.log(`  Scan with the phone camera (iPhone Camera app / Android camera or Google Lens)`);
console.log(`  → ${url}\n`);
console.log('  First time only: the phone warns about the local certificate.');
console.log('    iPhone: Show Details → visit this website    Android: Advanced → Proceed');
console.log('  Phone and computer must be on the same Wi-Fi.\n');

try {
  await QRCode.toFile(pngPath, url, { width: 640, margin: 2, color: { dark: '#070B14', light: '#FFFFFF' } });
  console.log(`  QR image: ${pngPath}`);
  if (process.platform === 'darwin' && !process.env.NO_OPEN) execFile('open', [pngPath]);
} catch {
  // Terminal QR above is enough.
}
