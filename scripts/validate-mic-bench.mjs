/**
 * Microphone bench test: plays recordings with a known answer into Chrome as the microphone
 * and reads the result from the real app, so the whole path is tested (browser audio capture,
 * recorder, analysis and the result card), not a shortcut.
 *
 *   npm run build
 *   node --experimental-strip-types scripts/validate-mic-bench.mjs
 *
 * Needs Google Chrome. Nothing is uploaded anywhere. Writes docs/validation/mic-bench.csv.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProductionServer } from './prod-server.mjs';
import { synthBreathSound, synthHeartSound, synthVoice } from '../src/features/checkin/audio/synthetic.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(probe, description, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await probe();
    if (value) return value;
    await sleep(200);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    };
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools disconnected'));
      this.pending.clear();
    };
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  async eval(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  }
}

function wav(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const clickText = (text) => `(() => { const el = [...document.querySelectorAll('button:not(:disabled)')].find((b) => b.innerText.trim().includes(${JSON.stringify(text)})); el?.click(); return Boolean(el); })()`;
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const voice = synthVoice();
const CASES = [
  { kind: 'heart', truth: 58, unit: 'bpm', samples: synthHeartSound({ bpm: 58, seconds: 30, seed: 11 }), page: 0, open: 'Listen to my heartbeat', duration: 20, tolerance: 1 },
  { kind: 'heart', truth: 84, unit: 'bpm', samples: synthHeartSound({ bpm: 84, seconds: 30, seed: 12, noise: 0.8 }), page: 0, open: 'Listen to my heartbeat', duration: 20, tolerance: 1 },
  { kind: 'breath', truth: 12, unit: 'breaths/min', samples: synthBreathSound({ breathsPerMinute: 12, seconds: 60, seed: 13 }), page: 1, open: 'Measure breathing with the microphone', duration: 40, tolerance: 1.5 },
  { kind: 'breath', truth: 18, unit: 'breaths/min', samples: synthBreathSound({ breathsPerMinute: 18, seconds: 60, seed: 14, inhaleLevel: 1 }), page: 1, open: 'Measure breathing with the microphone', duration: 40, tolerance: 1.5 },
  { kind: 'voice', truth: voice.truth.pitchSdSt, unit: 'semitones (pitch movement)', samples: voice.samples, page: 5, open: 'Read a short passage aloud', duration: Math.ceil(voice.samples.length / voice.sampleRate), tolerance: 0.15 },
];

const work = mkdtempSync(join(tmpdir(), 'solcheck-mic-'));
let server;
const rows = ['kind,true_value,sol_check_value,unit,result_text,true_pace_syllables_s,sol_check_pace_syllables_s,true_pause_percent,sol_check_pause_percent'];
let failures = 0;
try {
  server = await startProductionServer({ distDir: join(root, 'dist'), port: 0 });
  const appUrl = `http://127.0.0.1:${server.address().port}/#/check-in`;
  for (const [index, test] of CASES.entries()) {
    const file = join(work, `case-${index}.wav`);
    writeFileSync(file, wav(test.samples, 48000));
    const profile = mkdtempSync(join(work, 'chrome-'));
    const logFile = join(profile, 'chrome.log');
    const logFd = openSync(logFile, 'w');
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--enable-logging=stderr',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}%noloop`,
      '--autoplay-policy=no-user-gesture-required',
      // Allow the audio service to read the local fixture in this temporary Chrome profile.
      '--disable-features=AudioServiceSandbox', 'about:blank'], { stdio: ['ignore', 'ignore', logFd] });
    closeSync(logFd);
    const exited = once(chrome, 'exit');
    let chromeError;
    chrome.on('error', (error) => { chromeError = error; });
    exited.catch(() => undefined);
    let cdp;
    try {
      const cdpPort = await waitFor(() => {
        if (chromeError) throw chromeError;
        if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`);
        try { return readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { return null; }
      }, 'Chrome DevTools to start');
      const [target] = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      cdp = new Cdp(target.webSocketDebuggerUrl);
      await cdp.connect();
      if (index === 0) console.log((await cdp.send('Browser.getVersion')).product);
      await cdp.send('Page.navigate', { url: appUrl });
      for (let page = 0; page < test.page; page += 1) {
        await waitFor(() => cdp.eval(`(() => {
          const step = document.querySelector('[aria-current="step"]');
          const next = document.querySelector('button[data-action="next"]');
          const steps = [...document.querySelectorAll('.wizard-steps button')];
          if (!next || steps.indexOf(step) !== ${page}) return false;
          next.click();
          return true;
        })()`), `Next on check-in page ${page + 1}`);
      }
      await waitFor(() => cdp.eval(clickText(test.open)), `"${test.open}"`);
      await waitFor(() => cdp.eval(clickText('Start microphone')), '"Start microphone"');
      await waitFor(() => cdp.eval(`document.querySelector('.mic-recording') !== null`), 'microphone recording to start');
      if (test.kind === 'voice') {
        await waitFor(() => cdp.eval(`Number(document.querySelector('.mic-recording .camera-pulse-measuring-info')?.innerText.match(/Listening · (\\d+) s/)?.[1]) >= ${test.duration}`),
          'the full voice fixture to play', (test.duration + 10) * 1000);
        await waitFor(() => cdp.eval(clickText('I’ve finished')), '"I’ve finished"');
      }
      const result = await waitFor(() => cdp.eval(`(() => {
        const card = document.querySelector('.mic-check .camera-pulse-success, .mic-check .camera-pulse-weak');
        if (!card) return null;
        const voice = [...card.querySelectorAll('.mic-voice-grid dd')].map(el => parseFloat(el.textContent));
        const rate = card.querySelector('.mic-result-number strong')?.textContent;
        return { ok: card.classList.contains('camera-pulse-success'), rate: rate ? Number(rate) : null, voice, text: card.innerText };
      })()`), 'a microphone result', (test.duration + 10) * 1000);
      const [pitch, pace, pause] = result.ok ? result.voice : [];
      const value = result.ok ? (test.kind === 'voice' ? pitch : result.rate) : null;
      const expectedPace = voice.truth.syllables / voice.truth.phonationSeconds;
      const expectedPause = 100 * voice.truth.pauseSeconds / voice.truth.readingSeconds;
      const passed = Number.isFinite(value) && Math.abs(value - test.truth) <= test.tolerance
        && (test.kind !== 'voice' || (Math.abs(pace - expectedPace) <= 0.15 && Math.abs(pause - expectedPause) <= 2));
      if (!passed) failures += 1;
      const summary = result.text.split('\n').filter(Boolean).slice(0, 4).join(' | ');
      const extra = test.kind === 'voice' ? [expectedPace.toFixed(2), pace, expectedPause.toFixed(2), pause] : ['', '', '', ''];
      rows.push([test.kind, test.truth.toFixed(2), value, test.unit, csvCell(summary), ...extra].join(','));
      console.log(`${passed ? 'PASS' : 'FAIL'} ${test.kind}: expected ${test.truth.toFixed(2)}, got ${value ?? 'no reading'} ${test.unit}`);
      if (test.kind === 'voice') console.log(`  pace ${pace ?? '—'} / ${expectedPace.toFixed(2)} syllables/s, pauses ${pause ?? '—'} / ${expectedPause.toFixed(2)}%`);
      if (!passed) console.error(summary);
    } catch (error) {
      failures += 1;
      const details = await cdp?.eval(`document.querySelector('.mic-check')?.innerText`).catch(() => '');
      const audioError = readFileSync(logFile, 'utf8').split('\n').find((line) => line.includes('fake device'));
      const message = [error.message, details, audioError].filter(Boolean).join(' | ').replaceAll('\n', ' ');
      rows.push([test.kind, test.truth.toFixed(2), '', test.unit, csvCell(message), '', '', '', ''].join(','));
      console.error(`FAIL ${test.kind}: ${message}`);
    } finally {
      cdp?.ws?.close();
      chrome.kill();
      await exited.catch(() => undefined);
    }
  }
  writeFileSync(join(root, 'docs/validation/mic-bench.csv'), `${rows.join('\n')}\n`);
  console.log('Wrote docs/validation/mic-bench.csv');
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
}
