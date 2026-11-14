#!/usr/bin/env node
/**
 * One-command install of the native Sol Check app on a connected iPhone
 * (the iPhone counterpart of `npm run android:qr`).
 *
 *   APPLE_TEAM_ID=XXXXXXXXXX npm run ios:device
 *
 * 1. Plug the iPhone into this Mac with a cable and unlock it (tap "Trust" if asked).
 * 2. Builds the app signed with your Apple ID team, registering the iPhone if needed.
 * 3. Installs and launches Sol Check on it.
 * Free Apple IDs: the app works for 7 days; run this again to renew.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const team = process.env.APPLE_TEAM_ID;
if (!team) {
  console.error('Set APPLE_TEAM_ID to your Apple developer team (Xcode → Settings → Accounts).');
  process.exit(1);
}
const work = mkdtempSync(path.join(tmpdir(), 'solcheck-ios-'));
const run = (cmd, args, opts = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Find a connected, reachable iPhone.
const listFile = path.join(work, 'devices.json');
execFileSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', listFile], { stdio: 'ignore' });
const devices = JSON.parse(readFileSync(listFile, 'utf8')).result.devices
  .filter((d) => d.hardwareProperties?.platform === 'iOS');
const device = devices.find((d) => d.connectionProperties?.tunnelState === 'connected')
  ?? devices.find((d) => d.connectionProperties?.tunnelState !== 'unavailable');
if (!device) {
  console.error('No iPhone reachable. Plug it in with a cable, unlock it and tap "Trust This Computer", then run again.');
  console.error(`Known iPhones: ${devices.map((d) => d.deviceProperties.name).join(', ') || 'none'}`);
  process.exit(1);
}
const name = device.deviceProperties.name;
if (device.deviceProperties.developerModeStatus !== 'enabled') {
  console.error(`${name}: turn on Developer Mode first (Settings → Privacy & Security → Developer Mode → On, then restart the iPhone).`);
  process.exit(1);
}
console.log(`\n▶ Building Sol Check for ${name}…`);
run('npm', ['run', 'cap:sync']);
const derived = path.join(work, 'build');
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
  '-destination', `id=${device.hardwareProperties.udid}`, '-derivedDataPath', derived,
  '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration',
  `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-quiet', 'build',
]);
const app = path.join(derived, 'Build/Products/Debug-iphoneos/App.app');
console.log(`\n▶ Installing on ${name}…`);
run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.identifier, app]);
console.log('\n▶ Launching…');
const launch = spawnSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.identifier, 'com.solcheck.astronaut'], { stdio: 'inherit' });
if (launch.status !== 0) {
  console.log('\nFirst install with a free Apple ID: on the iPhone open Settings → General → VPN & Device Management,');
  console.log('tap the "Apple Development" profile → Trust. Then open Sol Check from the Home Screen.');
}
// Restore the web build used by the local servers.
run('npm', ['run', 'build'], { stdio: 'ignore' });
console.log(`\n✓ Sol Check installed on ${name}.`);
