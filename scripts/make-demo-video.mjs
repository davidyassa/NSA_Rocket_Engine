#!/usr/bin/env node
/**
 * Generate the 60-second captioned demo video from the built app.
 *
 *   npm run build && node scripts/make-demo-video.mjs [out.mp4]
 *
 * Drives headless Chrome through the Sol 43 storyline, adds a caption bar
 * inside the page for each shot, and joins the frames with ffmpeg crossfades.
 * Needs Google Chrome and ffmpeg. Nothing is uploaded anywhere.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProductionServer } from './prod-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'docs', 'media', 'sol-check-demo.mp4');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1280; const H = 720; const SHOT_SECONDS = 5.6; const FADE = 0.5;
const port = 4199; const cdpPort = 9299;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.value; }
}

const caption = (text) => `(() => {
  let bar = document.getElementById('demo-caption');
  if (!bar) { bar = document.createElement('div'); bar.id = 'demo-caption'; document.body.appendChild(bar); }
  bar.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:18px 40px 22px;background:linear-gradient(transparent,rgba(5,8,14,.92) 30%);color:#fff;font:600 26px/1.3 system-ui,sans-serif;text-align:center;pointer-events:none');
  bar.textContent = ${JSON.stringify(text)};
})()`;
const clickText = (text) => `[...document.querySelectorAll('button, a')].find((el) => el.innerText.trim().startsWith(${JSON.stringify(text)}))?.click()`;

const SHOTS = [
  { go: '#/', caption: 'Sol 43 on Mars. Maya’s nearest doctor is 20 light-minutes away.' },
  { go: '#/check-in', act: [`document.querySelector('.camera-pulse-open-btn')?.click()`], scroll: '.camera-pulse-card', caption: 'A three-minute check-in. The camera reads pulse, breathing and HRV on the device.' },
  { act: [clickText('Fill demo readings')], caption: 'Sol 43, two days after a solar storm: Maya says she feels fine.' },
  { act: [`document.querySelector('button[data-action="save"]')?.click()`], wait: 1800, scroll: '.plain-summary', caption: 'Sol Check compares Maya with Maya, and explains what changed in plain words.' },
  { act: [`document.querySelector('.assessment-findings .assessment-why')?.setAttribute('open', '')`], scroll: '.assessment-findings', caption: 'Every finding shows its readings, personal baseline, rule and source.' },
  { act: [`document.querySelector('.assessment-handoff-toggle')?.parentElement?.setAttribute('open', '')`, clickText('Prepare summary for ground')], scroll: '#ground-summary', caption: 'One complete handoff for Earth, so a single 40-minute round trip is enough.' },
  { go: '#/cmo', caption: 'The crew medical officer reviews the evidence and signs off onboard.' },
  { go: '#/timeline', act: [`(() => { const s = document.querySelector('.timeline-selector select'); if (s) { s.value = '41'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`], scroll: '[aria-labelledby="timeline-habitat-heading"]', caption: 'Real NASA Curiosity data: the 2017 solar storm, replayed as Sol 41, with cabin CO2.' },
  { go: '#/demo', scroll: '.real-crew', caption: 'Tested on real Inspiration4 astronaut data: personal baselines see what population ranges miss.' },
  { end: true, caption: '' },
];

const endCard = `(() => {
  document.body.innerHTML = '<div style="position:fixed;inset:0;display:grid;place-content:center;gap:18px;text-align:center;background:#070B14;color:#E6EDF7;font-family:system-ui,sans-serif">' +
    '<div style="font-size:64px;font-weight:700">Sol Check</div>' +
    '<div style="font-size:30px;color:#A3B1C6">Built for Mars. Useful anywhere the doctor is far away.</div>' +
    '<div style="font-size:22px;color:#7C8BA3">Research prototype · not a diagnosis · NASA Space Apps 2026</div></div>';
})()`;

if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is required');
const frames = mkdtempSync(join(tmpdir(), 'solcheck-video-'));
const profile = mkdtempSync(join(tmpdir(), 'solcheck-video-chrome-'));
const server = await startProductionServer({ distDir: join(root, 'dist'), port, nestedPrefix: '/solcheck' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 40; i += 1) { try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* starting */ } await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${port}/`, { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(2500);
  for (const [index, shot] of SHOTS.entries()) {
    if (shot.end) { await cdp.eval(endCard); await sleep(300); }
    if (shot.go) { await cdp.eval(`location.hash = ${JSON.stringify(shot.go)}`); await sleep(1500); }
    for (const action of shot.act ?? []) { await cdp.eval(action); await sleep(shot.wait ?? 900); }
    if (shot.scroll) { await cdp.eval(`document.querySelector(${JSON.stringify(shot.scroll)})?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80)`); await sleep(500); }
    if (shot.caption) await cdp.eval(caption(shot.caption));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(frames, `shot-${String(index).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
    console.log(`shot ${index + 1}/${SHOTS.length}: ${shot.caption || 'end card'}`);
  }
  // Crossfade the stills into one H.264 video.
  const inputs = SHOTS.flatMap((_, i) => ['-loop', '1', '-t', String(SHOT_SECONDS), '-i', join(frames, `shot-${String(i).padStart(2, '0')}.png`)]);
  let filter = ''; let last = '[0:v]';
  for (let i = 1; i < SHOTS.length; i += 1) {
    const label = `[v${i}]`;
    filter += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(i * (SHOT_SECONDS - FADE)).toFixed(2)}${label};`;
    last = label;
  }
  filter += `${last}format=yuv420p[out]`;
  mkdirSync(dirname(out), { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-r', '30', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error('ffmpeg failed');
  console.log(`Wrote ${out}`);
} finally {
  chrome.kill();
  await server.close?.();
  try { rmSync(frames, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ }
  process.exit(0);
}
