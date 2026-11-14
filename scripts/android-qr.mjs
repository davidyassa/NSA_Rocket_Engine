#!/usr/bin/env node
/**
 * Expo-style install for the native Android app: publishes the latest debug APK
 * on the local preview server and shows a QR code. Scan it on an Android phone
 * (same Wi-Fi) to download and install Sol Check as a real app.
 *
 *   npm run android:qr        # build APK if needed, publish, show QR
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) {
  console.error('No APK yet. Run: npm run cap:sync && (cd android && ./gradlew assembleDebug)');
  process.exit(1);
}
mkdirSync(path.join(root, 'dist'), { recursive: true });
copyFileSync(apk, path.join(root, 'dist', 'sol-check.apk'));

const ip = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address)
  .find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a));
if (!ip) { console.error('No Wi-Fi address found.'); process.exit(1); }
const url = `http://${ip}:${process.env.SOLCHECK_HTTP_PORT ?? '4173'}/sol-check.apk`;
const png = path.join(root, 'dist', 'android-install-qr.png');

console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
console.log(`  Android: scan with the camera → download → Install → Open "Sol Check"`);
console.log(`  → ${url}`);
console.log('  First time: allow "Install unknown apps" for your browser when Android asks.\n');
await QRCode.toFile(png, url, { width: 640, margin: 2, color: { dark: '#070B14', light: '#FFFFFF' } });
console.log(`  QR image: ${png}`);
if (process.platform === 'darwin' && !process.env.NO_OPEN) execFile('open', [png]);
