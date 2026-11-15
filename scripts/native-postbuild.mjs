#!/usr/bin/env node
/**
 * Prepares dist/ for the Capacitor iOS and Android shells.
 *
 * The camera SDK loads LiteRT and MediaPipe from extensionless `<base>+esm`
 * module URLs. On the web our server (and service worker) labels them
 * text/javascript, but the native shells cannot:
 *   - iOS: Capacitor's router sends extensionless paths to index.html (SPA
 *     fallback) and labels them text/html.
 *   - Android: Capacitor's local server cannot infer a type for `+esm`.
 * WebKit and Chromium refuse ES modules with a non-JavaScript MIME type, so the
 * camera pulse check would fail. This step gives the modules a `.mjs` name
 * (served as JavaScript on both platforms) and rewrites the SDK references.
 * It also preserves the gzipped model state under a name Android won't unpack
 * during the asset merge. The SDK needs the original compressed bytes.
 *
 * Fails loudly if the expected references are not found, so an SDK upgrade
 * cannot silently break the native camera path.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const NEW_NAME = 'esm.mjs';
const STATE_NAME = 'state.gz';
const NATIVE_STATE_NAME = 'state.gz.bin';

function fail(message) {
  console.error(`native-postbuild: ${message}`);
  process.exit(1);
}

if (!existsSync(dist)) fail(`${dist} does not exist. Run the native build first.`);

// 1. Give each runtime module an extension the native servers understand.
for (const runtime of ['litert', 'mediapipe']) {
  const from = path.join(dist, 'vendor', runtime, '+esm');
  if (!existsSync(from)) fail(`missing ${from}`);
  copyFileSync(from, path.join(dist, 'vendor', runtime, NEW_NAME));
}

// 2. Keep Android's asset merge from inflating state.gz and stripping its extension.
const modelsDir = path.join(dist, 'vendor', 'vitalcamera', 'models');
const state = path.join(modelsDir, STATE_NAME);
if (!existsSync(state)) fail(`missing ${state}`);
renameSync(state, path.join(modelsDir, NATIVE_STATE_NAME));

// 3. Rewrite the SDK references in the app bundle and camera workers.
const modulePattern = /([`'"])\+esm\1/g;
const statePattern = /([`'"])state\.gz\1/g;
function rewrite(file, pattern, name) {
  const source = readFileSync(file, 'utf8');
  let count = 0;
  const next = source.replace(pattern, (_, quote) => {
    count += 1;
    return `${quote}${name}${quote}`;
  });
  if (count) writeFileSync(file, next);
  return count;
}

const assetsDir = path.join(dist, 'assets');
const workersDir = path.join(dist, 'vendor', 'vitalcamera', 'workers');
let bundleRefs = 0;
let workerRefs = 0;
let stateRefs = 0;
for (const name of readdirSync(assetsDir)) {
  if (!name.endsWith('.js')) continue;
  const file = path.join(assetsDir, name);
  bundleRefs += rewrite(file, modulePattern, NEW_NAME);
  stateRefs += rewrite(file, statePattern, NATIVE_STATE_NAME);
}
for (const name of readdirSync(workersDir)) {
  if (name.endsWith('.js')) workerRefs += rewrite(path.join(workersDir, name), modulePattern, NEW_NAME);
}

if (bundleRefs < 2) fail(`expected ≥2 MediaPipe +esm references in the app bundle, found ${bundleRefs}`);
if (workerRefs < 2) fail(`expected ≥2 LiteRT +esm references in camera workers, found ${workerRefs}`);
if (stateRefs < 1) fail(`expected a ${STATE_NAME} reference in the app bundle`);

// 4. The native shell bundles every asset; no service worker should be present.
if (existsSync(path.join(dist, 'sw.js'))) fail('dist/sw.js exists; build with SOLCHECK_TARGET=native (npm run build:native).');

console.log(`native-postbuild: ${NEW_NAME} modules ready (${bundleRefs} bundle + ${workerRefs} worker references rewritten). Packaged ${NATIVE_STATE_NAME}.`);
