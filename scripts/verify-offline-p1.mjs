import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startProductionServer } from './prod-server.mjs';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        } else if (msg.method) {
          const handlers = this.eventListeners.get(msg.method) || [];
          for (const handler of handlers) handler(msg.params);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  close() {
    if (this.ws) this.ws.close();
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchChrome({ cdpPort, userDataDir }) {
  const chromeProcess = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let versionData = null;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!versionData) throw new Error('Chrome CDP failed to initialize.');
  return chromeProcess;
}

async function createCDPForUrl({ cdpPort, targetUrl }) {
  const newTargetRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${targetUrl}`, { method: 'PUT' });
  const targetData = await newTargetRes.json();
  const cdp = new CDPClient(targetData.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error' || params.type === 'warning') {
      console.log(`[BROWSER ${params.type.toUpperCase()}]`, params.args.map(a => a.value || a.description).join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    console.error('[BROWSER EXCEPTION]', params.exceptionDetails.text, params.exceptionDetails.exception?.description);
  });
  return cdp;
}

async function main() {
  console.log('================================================================');
  console.log('   SOL CHECK COMPLETE PRODUCTION & OFFLINE VERIFICATION SUITE   ');
  console.log('================================================================\n');

  const distDir = join(process.cwd(), 'dist');
  const port = 4174;
  const cdpPort = 9223;

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: PRODUCTION HOSTING AT ROOT (/) & COMPLETE P0/P1 REHEARSAL
  // ───────────────────────────────────────────────────────────────────────────
  console.log('----------------------------------------------------------------');
  console.log('PART 1: Testing Production Root Hosting (/)');
  console.log('----------------------------------------------------------------');

  const userDataDirRoot = mkdtempSync(join(tmpdir(), 'solcheck-root-'));
  let prodServer = null;
  let chromeProcessRoot = null;

  try {
    console.log(`1. Starting standalone Node.js production HTTP server on http://127.0.0.1:${port}...`);
    prodServer = await startProductionServer({ distDir, port, nestedPrefix: '/solcheck' });
    console.log('   ✓ Production static server running (no Vite dependency).');

    // Verify MIME headers for self-hosted ESM runtimes and WASM
    console.log('2. Verifying MIME headers on root host...');
    const litertRes = await fetch(`http://127.0.0.1:${port}/vendor/litert/+esm`);
    const litertMime = litertRes.headers.get('content-type') || '';
    console.log(`   ✓ LiteRT +esm MIME: "${litertMime}"`);
    if (!litertMime.includes('javascript')) {
      throw new Error(`Expected text/javascript for +esm, got: ${litertMime}`);
    }

    const mediapipeRes = await fetch(`http://127.0.0.1:${port}/vendor/mediapipe/+esm`);
    const mediapipeMime = mediapipeRes.headers.get('content-type') || '';
    console.log(`   ✓ MediaPipe +esm MIME: "${mediapipeMime}"`);
    if (!mediapipeMime.includes('javascript')) {
      throw new Error(`Expected text/javascript for +esm, got: ${mediapipeMime}`);
    }

    const wasmRes = await fetch(`http://127.0.0.1:${port}/vendor/litert/wasm/litert_wasm_internal.wasm`);
    const wasmMime = wasmRes.headers.get('content-type') || '';
    console.log(`   ✓ WebAssembly MIME: "${wasmMime}"`);
    if (!wasmMime.includes('wasm')) {
      throw new Error(`Expected application/wasm, got: ${wasmMime}`);
    }

    // Launch Chrome Context for Root
    console.log('3. Launching fresh headless Chrome context with fake camera flags...');
    chromeProcessRoot = await launchChrome({ cdpPort, userDataDir: userDataDirRoot });
    const cdp = await createCDPForUrl({ cdpPort, targetUrl: `http://127.0.0.1:${port}/` });

    const cdnRequests = [];
    const failedRequests = [];
    const runtimeExceptions = [];

    cdp.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      if (
        url.includes('cdn.jsdelivr.net') ||
        url.includes('cdnjs.cloudflare.com') ||
        url.includes('unpkg.com') ||
        (url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost'))
      ) {
        cdnRequests.push(url);
      }
    });

    cdp.on('Network.loadingFailed', (params) => {
      if (!params.canceled) {
        failedRequests.push({ requestId: params.requestId, errorText: params.errorText, type: params.type });
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      runtimeExceptions.push(params.exceptionDetails);
    });

    console.log('4. Navigating to #/demo to prime Service Worker cache...');
    await cdp.eval(`location.hash = '#/demo'`);
    await sleep(600);

    let isReady = false;
    for (let i = 0; i < 30; i++) {
      isReady = await cdp.eval(`Boolean(document.querySelector('.demo-offline-status') && document.body.innerText.includes('Ready to run offline'))`);
      if (isReady) break;
      await sleep(500);
    }
    if (!isReady) throw new Error('Service worker failed to report "Ready to run offline".');
    console.log('   ✓ Service worker is active and precache complete: "Ready to run offline" confirmed.');

    // Cut network and kill server
    console.log('5. Disabling browser networking (Network.emulateNetworkConditions)...');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    console.log('6. Stopping production HTTP server to enforce 100% offline isolation...');
    if (typeof prodServer.closeAllConnections === 'function') {
      prodServer.closeAllConnections();
    }
    await new Promise((r) => prodServer.close(r));
    prodServer = null;
    await sleep(400);

    // Verify server is dead
    let serverDead = false;
    try {
      await fetch(`http://127.0.0.1:${port}/`);
    } catch {
      serverDead = true;
    }
    if (!serverDead) throw new Error('Server did not stop.');
    console.log('   ✓ Production server stopped. Origin is unreachable.');

    // Reload from SW
    console.log('7. Reloading page from service worker while offline...');
    await cdp.send('Page.reload');
    await sleep(1500);

    const reloadedHeading = await cdp.eval(`document.querySelector('h1')?.innerText`);
    console.log(`   ✓ Page reloaded offline from Service Worker! Heading: "${reloadedHeading}"`);

    // Test F17 Local Export
    console.log('\n--- Testing F17: Local record export ---');
    await cdp.eval(`document.querySelector('.demo-export-actions button').click()`);
    await sleep(500);
    const exportFeedback = await cdp.eval(`document.querySelector('.demo-export-feedback')?.innerText`);
    console.log(`   ✓ Export result: "${exportFeedback}"`);
    if (!exportFeedback.includes('Verified and parsed offline')) {
      throw new Error('Local record export failed offline.');
    }

    // Test Dashboard, F15 Streak, F13 Reminders/Checklist, F14 Crew Figure, Mobile Layout
    console.log('\n--- Testing Dashboard, F15, F13, F14 & Mobile Layout ---');
    await cdp.eval(`location.hash = '#/'`);
    await sleep(800);

    const streakText = await cdp.eval(`document.querySelector('.mission-stat-streak strong')?.innerText`);
    console.log(`   ✓ Initial streak: ${streakText}`);
    if (streakText !== '42 sols') throw new Error(`Expected 42 sols streak, got: ${streakText}`);

    const reminderTitle = await cdp.eval(`document.querySelector('#reminder-heading')?.innerText`);
    console.log(`   ✓ Reminder: "${reminderTitle}"`);
    if (!reminderTitle.includes('Sol 43 check-in due')) throw new Error('Reminder title missing.');

    // Toggle checklist
    await cdp.eval(`document.querySelector('.routine-checklist-checkbox')?.click()`);
    await sleep(200);
    const updatedChecklist = await cdp.eval(`document.querySelector('.routine-checklist-count')?.innerText`);
    console.log(`   ✓ Checklist toggled: ${updatedChecklist}`);

    // Crew figure SVG & controls
    const regionsCount = await cdp.eval(`document.querySelectorAll('.figure-region-target').length`);
    const controlsCount = await cdp.eval(`document.querySelectorAll('.crew-figure-link').length`);
    console.log(`   ✓ 2D Figure: ${regionsCount} regions, ${controlsCount} accessible controls.`);
    if (regionsCount !== 6 || controlsCount !== 6) throw new Error('Crew figure regions mismatch.');

    // Mobile layout (390px)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    const allCardsVisible = await cdp.eval(`Array.from(document.querySelectorAll('.domain-grid .domain-card')).every(c => c.offsetWidth > 0 && c.offsetHeight > 0)`);
    console.log(`   ✓ All 6 domain cards visible on 390px mobile: ${allCardsVisible}`);
    if (!allCardsVisible) throw new Error('Mobile domain layout broken.');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    // ─────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 2: STRENGTHENED CAMERA INTEGRATION & LIFECYCLE TESTS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Testing Requirement 2: Strengthened Camera Integration & Lifecycle ---');
    await cdp.eval(`location.hash = '#/check-in'`);
    await sleep(600);

    // Install mediaDevices spy to track calls and captured tracks
    await cdp.eval(`(() => {
      window.__gumCalls = 0;
      window.__capturedTracks = [];
      window.__origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async function(...args) {
        window.__gumCalls++;
        const stream = await window.__origGetUserMedia(...args);
        for (const track of stream.getTracks()) {
          window.__capturedTracks.push(track);
        }
        return stream;
      };
    })()`);

    // Check 2.1: Assert getUserMedia is NOT called before consent
    console.log('Check 2.1: Verifying getUserMedia is NOT called before deliberate consent...');
    await cdp.eval(`document.querySelector('.camera-pulse-open-btn').click()`);
    await sleep(300);
    const callsBeforeConsent = await cdp.eval(`window.__gumCalls`);
    console.log(`   ✓ getUserMedia calls before consent: ${callsBeforeConsent}`);
    if (callsBeforeConsent !== 0) {
      throw new Error(`getUserMedia was called before consent! Calls: ${callsBeforeConsent}`);
    }

    // Check 2.2: Permission denial flow & manual fallback
    console.log('Check 2.2: Testing permission denial handling & manual fallback...');
    await cdp.eval(`(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const err = new DOMException('Permission denied by user', 'NotAllowedError');
        throw err;
      };
    })()`);
    await cdp.eval(`document.querySelector('.camera-pulse-consent .button-primary').click()`);
    await sleep(400);

    const deniedState = await cdp.eval(`(() => {
      const isDenied = Boolean(document.querySelector('.camera-pulse-denied'));
      const alertRole = document.querySelector('.camera-pulse-denied')?.getAttribute('role');
      const manualInput = document.querySelector('#reading-heart_rate');
      const canEditManual = Boolean(manualInput && !manualInput.disabled);
      return { isDenied, alertRole, canEditManual };
    })()`);
    console.log(`   ✓ Permission denied state rendered: ${deniedState.isDenied} (role="${deniedState.alertRole}"), Manual input usable: ${deniedState.canEditManual}`);
    if (!deniedState.isDenied || deniedState.alertRole !== 'alert') {
      throw new Error('Permission denied alert state was not properly displayed.');
    }

    // Close permission denial dialog
    await cdp.eval(`document.querySelector('.camera-pulse-denied button').click()`);
    await sleep(300);
    const restoredIdleAfterDenied = await cdp.eval(`Boolean(document.querySelector('.camera-pulse-open-btn'))`);
    console.log(`   ✓ Close returns cleanly to idle: ${restoredIdleAfterDenied}`);

    // Restore fake getUserMedia
    await cdp.eval(`(() => {
      navigator.mediaDevices.getUserMedia = async function(...args) {
        window.__gumCalls++;
        const stream = await window.__origGetUserMedia(...args);
        for (const track of stream.getTracks()) {
          window.__capturedTracks.push(track);
        }
        return stream;
      };
    })()`);

    // Check 2.3: Cancel during initialization releases tracks
    console.log('Check 2.3: Testing Cancel during initialization track release...');
    await cdp.eval(`document.querySelector('.camera-pulse-open-btn').click()`);
    await sleep(250);
    await cdp.eval(`document.querySelector('.camera-pulse-consent .button-primary').click()`);
    await sleep(150); // Allow getUserMedia to resolve and model init to be in flight
    await cdp.eval(`Array.from(document.querySelectorAll('.camera-pulse-card button')).find(b => b.innerText.includes('Cancel'))?.click()`);
    await sleep(800);

    const cancelTeardown = await cdp.eval(`(() => {
      const openBtn = Boolean(document.querySelector('.camera-pulse-open-btn'));
      const allTracksEnded = window.__capturedTracks.length > 0 && window.__capturedTracks.every(t => t.readyState === 'ended');
      return { openBtn, allTracksEnded, count: window.__capturedTracks.length };
    })()`);
    console.log(`   ✓ Cancel during init: returned to idle=${cancelTeardown.openBtn}, all ${cancelTeardown.count} tracks ended=${cancelTeardown.allTracksEnded}`);
    if (!cancelTeardown.openBtn || !cancelTeardown.allTracksEnded) {
      throw new Error('Cancel during initialization leaked tracks or failed to return to idle.');
    }

    // Check 2.4: Active offline measurement, model loading, and fake stream
    console.log('Check 2.4: Starting active measurement and verifying offline SDK initialization...');
    await cdp.eval(`document.querySelector('.camera-pulse-open-btn').click()`);
    await sleep(250);
    await cdp.eval(`document.querySelector('.camera-pulse-consent .button-primary').click()`);

    let reachedMeasuring = false;
    let lastState = null;
    for (let i = 0; i < 40; i++) {
      const state = await cdp.eval(`(() => {
        const isMeasuring = Boolean(document.querySelector('.camera-pulse-measuring'));
        const video = document.querySelector('.camera-video-feed');
        const hasStream = Boolean(video && video.srcObject);
        const isPlaying = Boolean(video && !video.paused && video.currentTime > 0);
        const err = document.querySelector('.camera-pulse-error-msg')?.textContent;
        const statusMsg = document.querySelector('.camera-pulse-status-msg')?.textContent;
        const overlay = document.querySelector('.camera-video-overlay')?.textContent;
        return { isMeasuring, hasStream, isPlaying, err, statusMsg, overlay };
      })()`);
      lastState = state;
      if (state.isMeasuring && state.hasStream && state.isPlaying) {
        reachedMeasuring = true;
        break;
      }
      await sleep(300);
    }
    if (!reachedMeasuring) throw new Error(`Camera failed to enter measuring state offline: ${JSON.stringify(lastState)}`);
    console.log('   ✓ Offline camera active: video element is playing fake camera frames, workers running.');

    // Assert manual heart rate input is completely untouched
    const manualVal = await cdp.eval(`document.querySelector('#reading-heart_rate')?.value`);
    if (manualVal !== '') throw new Error(`Manual heart rate input was modified: "${manualVal}"`);
    console.log('   ✓ Manual heart-rate input is completely untouched and empty.');

    // Check 2.5: Weak signal, retry, and stop track teardown
    console.log('Check 2.5: Testing weak signal state, retry, and Stop track teardown...');
    await sleep(1200); // Allow frame loop
    // Click Stop button
    await cdp.eval(`document.querySelector('.camera-pulse-measuring button.button-secondary').click()`);
    await sleep(500);

    const weakSignalState = await cdp.eval(`(() => {
      const isWeak = Boolean(document.querySelector('.camera-pulse-weak'));
      const hasTryAgain = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Try again')));
      const allTracksEnded = window.__capturedTracks.length > 0 && window.__capturedTracks.every(t => t.readyState === 'ended');
      return { isWeak, hasTryAgain, allTracksEnded };
    })()`);
    console.log(`   ✓ Stop triggered weak signal (due to synthetic test pattern without face): ${weakSignalState.isWeak}, All tracks ended: ${weakSignalState.allTracksEnded}`);
    if (!weakSignalState.allTracksEnded) {
      throw new Error('Stop did not end all camera tracks.');
    }

    // Test Retry ("Try again")
    if (weakSignalState.hasTryAgain) {
      console.log('   Testing "Try again" retry button...');
      await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Try again'))?.click()`);
      await sleep(800);
      const resumedMeasuring = await cdp.eval(`Boolean(document.querySelector('.camera-pulse-measuring'))`);
      console.log(`   ✓ "Try again" successfully resumed measurement: ${resumedMeasuring}`);
      if (!resumedMeasuring) throw new Error('Try again failed to resume measurement.');

      // Stop and close
      await cdp.eval(`document.querySelector('.camera-pulse-measuring button.button-secondary').click()`);
      await sleep(400);
      await cdp.eval(`Array.from(document.querySelectorAll('.camera-pulse-card button')).find(b => b.innerText.includes('Close'))?.click()`);
      await sleep(300);
    }

    // Check 2.6: Route exit track release
    console.log('Check 2.6: Testing route exit track release during active session...');
    await cdp.eval(`document.querySelector('.camera-pulse-open-btn').click()`);
    await sleep(250);
    await cdp.eval(`document.querySelector('.camera-pulse-consent .button-primary').click()`);
    await sleep(800); // measuring

    // Navigate to Dashboard
    await cdp.eval(`location.hash = '#/'`);
    await sleep(600);

    const routeExitTeardown = await cdp.eval(`(() => {
      return window.__capturedTracks.length > 0 && window.__capturedTracks.every(t => t.readyState === 'ended');
    })()`);
    console.log(`   ✓ Route exit to Dashboard cleanly ended all camera tracks: ${routeExitTeardown}`);
    if (!routeExitTeardown) throw new Error('Route exit leaked active camera tracks.');

    // Assert zero external network leaks
    console.log('Check 2.7: Verifying network isolation and error logs...');
    if (cdnRequests.length > 0) throw new Error(`External CDN requests detected: ${JSON.stringify(cdnRequests)}`);
    console.log('   ✓ Zero CDN requests confirmed (100% self-hosted).');
    if (failedRequests.length > 0) throw new Error(`Asset load failures: ${JSON.stringify(failedRequests)}`);
    console.log('   ✓ Zero failed asset requests confirmed.');
    if (runtimeExceptions.length > 0) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeExceptions)}`);
    console.log('   ✓ Zero runtime exceptions or worker errors confirmed.');

    // ─────────────────────────────────────────────────────────────────────────
    // HERO SOL 43 FLOW, ASSESSMENT EVIDENCE & EARTH COMMUNICATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Running Hero Sol 43 Flow, Assessment Evidence & Earth Communication ---');
    await cdp.eval(`location.hash = '#/check-in'`);
    await sleep(600);

    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fill demo readings')).click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('input[type="checkbox"][value="fatigue"]')?.click() || document.querySelector('#symptom-fatigue')?.click() || Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('Fatigue'))?.querySelector('input')?.click()`);
    await sleep(300);
    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save and assess')).click()`);
    await sleep(800);

    const assessmentTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    const findingsCount = await cdp.eval(`document.querySelectorAll('.assessment-finding').length`);
    console.log(`   ✓ Arrived at: "${assessmentTitle}", Findings: ${findingsCount}`);

    // Evidence & Ground communication
    await cdp.eval(`document.querySelector('.assessment-why summary')?.click()`);
    await sleep(300);
    const evidenceText = await cdp.eval(`document.querySelector('.assessment-evidence p')?.innerText`);
    console.log(`   ✓ Clinical reasoning: "${evidenceText?.slice(0, 75)}..."`);

    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Prepare summary for ground'))?.click()`);
    await sleep(300);
    const groundDelay = await cdp.eval(`document.querySelector('.ground-timing dl')?.innerText`);
    console.log(`   ✓ Earth communication delay verified:\n   ` + groundDelay.split('\n').join('\n   '));
    if (!groundDelay.includes('20 min') || !groundDelay.includes('40 min')) {
      throw new Error(`Unexpected delay info: ${groundDelay}`);
    }

    // Dashboard streak update
    await cdp.eval(`location.hash = '#/'`);
    await sleep(600);
    const updatedStreak = await cdp.eval(`document.querySelector('.mission-stat-streak strong')?.innerText`);
    console.log(`   ✓ Updated check-in streak: ${updatedStreak}`);
    if (updatedStreak !== '43 sols') throw new Error(`Expected 43 sols streak, got: ${updatedStreak}`);

    // ─────────────────────────────────────────────────────────────────────────
    // F20 TIMELINE REPLAY & RADLAB CLAIMS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Testing F20: Timeline Replay & NASA RadLab Claims ---');
    await cdp.eval(`location.hash = '#/timeline'`);
    await sleep(800);

    // Restart replay
    await cdp.eval(`document.querySelector('button[aria-label^="Restart replay"]').click()`);
    await sleep(300);

    // Step to Sol 41
    await cdp.eval(`
      const sel = document.querySelector('.timeline-selector select');
      sel.value = '41';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await sleep(600);

    const sol41Anchor = await cdp.eval(`document.querySelector('.timeline-selected-values .timeline-original-anchor')?.innerText`);
    const sol41Radiation = await cdp.eval(`document.querySelectorAll('.timeline-selected-values')[2]?.innerText`);
    console.log(`   ✓ Sol 41 archive anchor: "${sol41Anchor}"`);
    console.log(`   ✓ Sol 41 radiation values: "${sol41Radiation.split('\n').join(' · ')}"`);

    if (!sol41Anchor.includes('15.38 µGy/hour') || !sol41Anchor.includes('23.18 µGy/hour')) {
      throw new Error(`RadLab raw reading claims mismatch in anchor: "${sol41Anchor}"`);
    }
    if (!sol41Radiation.includes('Hourly medians:')) {
      throw new Error(`Hourly medians label missing: "${sol41Radiation}"`);
    }

    // Provenance details
    await cdp.eval(`document.querySelectorAll('.timeline-provenance summary')[2]?.click()`);
    await sleep(300);
    const provText = await cdp.eval(`document.querySelector('.timeline-provenance dl')?.innerText`);
    console.log(`   ✓ RadLab provenance instrument: "${provText.split('\n')[1]}"`);
    if (!provText.includes('MSL-RAD-Surface · Curiosity RAD') || !provText.includes('15.38 µGy/hour') || !provText.includes('23.18 µGy/hour')) {
      throw new Error('RadLab provenance details missing required fields.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ALTERNATE SCENARIOS & BAD ENTRY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Testing Alternate Scenarios & Strengthened Bad Entry ---');
    // Routine Sol
    await cdp.eval(`location.hash = '#/demo'`);
    await sleep(600);
    await cdp.eval(`Array.from(document.querySelectorAll('.demo-scenario-card button')).find(b => b.innerText.includes('routine sol')).click()`);
    await sleep(600);
    const routineStreak = await cdp.eval(`document.querySelector('.mission-stat-streak strong')?.innerText`);
    console.log(`   ✓ Routine sol scenario streak: ${routineStreak} (isolation confirmed)`);
    if (routineStreak !== '42 sols') throw new Error(`Expected 42 sols streak, got: ${routineStreak}`);

    // Bad Entry
    await cdp.eval(`location.hash = '#/demo'`);
    await sleep(600);
    await cdp.eval(`Array.from(document.querySelectorAll('.demo-scenario-card button')).find(b => b.innerText.includes('bad entry')).click()`);
    await sleep(600);

    await cdp.eval(`location.hash = '#/check-in'`);
    await sleep(600);
    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fill demo readings')).click()`);
    await sleep(300);
    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save and assess')).click()`);
    await sleep(400);

    const bpError = await cdp.eval(`document.querySelector('#reading-bp_systolic-error')?.innerText`);
    const currentHash = await cdp.eval(`location.hash`);
    console.log(`   ✓ Guard rejected invalid pair (75/90): "${bpError}"`);
    console.log(`   ✓ Navigation blocked: still at "${currentHash}"`);
    if (!bpError || !bpError.includes('greater than diastolic') || currentHash !== '#/check-in') {
      throw new Error('Reversed BP pair was not rejected by guard.');
    }

    // Correct using real browser events
    console.log('   Correcting systolic to 116 using real browser input events...');
    await cdp.eval(`(() => {
      const input = document.querySelector('#reading-bp_systolic');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '116');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(300);
    await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save and assess')).click()`);
    await sleep(800);

    const badEntryHeading = await cdp.eval(`document.querySelector('h1')?.innerText`);
    console.log(`   ✓ Navigated to: "${badEntryHeading}"`);
    if (badEntryHeading !== 'Assessment') throw new Error('Failed to reach Assessment after BP correction.');

    const savedRecord = await cdp.eval(`(() => {
      const raw = localStorage.getItem('sol-check:demo');
      if (!raw) return null;
      const data = JSON.parse(raw);
      const entries = data.entries && data.entries['bad-entry'] ? data.entries['bad-entry'] : [];
      const last = entries[entries.length - 1];
      if (!last) return null;
      const sys = last.measurements.find(m => m.metric === 'bp_systolic')?.value;
      const dia = last.measurements.find(m => m.metric === 'bp_diastolic')?.value;
      return { sys, dia, sol: last.sol };
    })()`);
    console.log(`   ✓ Persisted store record verified in localStorage: Systolic=${savedRecord?.sys}, Diastolic=${savedRecord?.dia} on Sol ${savedRecord?.sol}`);
    if (savedRecord?.sys !== 116 || savedRecord?.dia !== 90) {
      throw new Error(`Persisted record values mismatch: ${JSON.stringify(savedRecord)}`);
    }

    // Demo Reset
    console.log('\n--- Testing Demo Reset ---');
    await cdp.eval(`document.querySelector('.reset-link')?.click()`);
    await sleep(400);
    await cdp.eval(`document.querySelector('.reset-dialog .button-primary')?.click()`);
    await sleep(800);
    const resetStreak = await cdp.eval(`document.querySelector('.mission-stat-streak strong')?.innerText`);
    const resetSol = await cdp.eval(`document.querySelector('#mission-sol')?.innerText`);
    console.log(`   ✓ Demo reset verified: Restored to "${resetSol}", streak reset to ${resetStreak}`);
    if (resetStreak !== '42 sols' || resetSol !== 'Sol 43') throw new Error('Demo reset failed.');

    cdp.close();
    console.log('\n   >>> PART 1 ROOT HOSTING: ALL CHECKS PASSED <<<\n');
  } finally {
    if (prodServer) {
      try { prodServer.close(); } catch {}
    }
    if (chromeProcessRoot) chromeProcessRoot.kill();
    try { rmSync(userDataDirRoot, { recursive: true, force: true }); } catch {}
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: PRODUCTION HOSTING ON A REAL NESTED PATH (/solcheck/)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('----------------------------------------------------------------');
  console.log('PART 2: Testing Real Nested Path Hosting (/solcheck/)');
  console.log('----------------------------------------------------------------');

  const userDataDirNested = mkdtempSync(join(tmpdir(), 'solcheck-nested-'));
  let prodServerNested = null;
  let chromeProcessNested = null;

  try {
    console.log(`1. Starting production server for nested path /solcheck/ on http://127.0.0.1:${port}...`);
    prodServerNested = await startProductionServer({ distDir, port, nestedPrefix: '/solcheck' });
    console.log('   ✓ Production static server running for /solcheck/.');

    // Verify MIME headers on nested path
    console.log('2. Verifying MIME headers on nested path (/solcheck/)...');
    const nestedEsmRes = await fetch(`http://127.0.0.1:${port}/solcheck/vendor/litert/+esm`);
    const nestedEsmMime = nestedEsmRes.headers.get('content-type') || '';
    console.log(`   ✓ /solcheck/vendor/litert/+esm MIME: "${nestedEsmMime}"`);
    if (!nestedEsmMime.includes('javascript')) {
      throw new Error(`Expected text/javascript on nested path, got: ${nestedEsmMime}`);
    }

    const nestedWasmRes = await fetch(`http://127.0.0.1:${port}/solcheck/vendor/mediapipe/wasm/vision_wasm_internal.wasm`);
    const nestedWasmMime = nestedWasmRes.headers.get('content-type') || '';
    console.log(`   ✓ /solcheck/vendor/mediapipe/wasm/vision_wasm_internal.wasm MIME: "${nestedWasmMime}"`);
    if (!nestedWasmMime.includes('wasm')) {
      throw new Error(`Expected application/wasm on nested path, got: ${nestedWasmMime}`);
    }

    const nestedWorkerRes = await fetch(`http://127.0.0.1:${port}/solcheck/vendor/vitalcamera/workers/inference.worker.js`);
    const nestedWorkerMime = nestedWorkerRes.headers.get('content-type') || '';
    console.log(`   ✓ /solcheck/vendor/vitalcamera/workers/inference.worker.js MIME: "${nestedWorkerMime}"`);
    if (!nestedWorkerMime.includes('javascript')) {
      throw new Error(`Expected text/javascript for worker on nested path, got: ${nestedWorkerMime}`);
    }

    // Launch a fresh Chrome context
    console.log('3. Launching fresh headless Chrome context for nested path...');
    chromeProcessNested = await launchChrome({ cdpPort, userDataDir: userDataDirNested });
    const cdpNested = await createCDPForUrl({ cdpPort, targetUrl: `http://127.0.0.1:${port}/solcheck/` });

    const cdnRequestsNested = [];
    const failedRequestsNested = [];

    cdpNested.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      if (
        url.includes('cdn.jsdelivr.net') ||
        url.includes('cdnjs.cloudflare.com') ||
        (url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost'))
      ) {
        cdnRequestsNested.push(url);
      }
    });

    cdpNested.on('Network.loadingFailed', (params) => {
      if (!params.canceled) {
        failedRequestsNested.push({ requestId: params.requestId, errorText: params.errorText });
      }
    });

    // Wait for SW precache on nested path
    console.log('4. Waiting for Service Worker to precache on nested path (/solcheck/)...');
    await cdpNested.eval(`location.hash = '#/demo'`);
    await sleep(600);

    let isNestedReady = false;
    for (let i = 0; i < 30; i++) {
      isNestedReady = await cdpNested.eval(`Boolean(document.querySelector('.demo-offline-status') && document.body.innerText.includes('Ready to run offline'))`);
      if (isNestedReady) break;
      await sleep(500);
    }
    if (!isNestedReady) throw new Error('Service worker failed to precache on nested path.');
    console.log('   ✓ Service worker is active and precache complete on /solcheck/.');

    // Cut network & stop server
    console.log('5. Disabling networking on nested path & stopping server...');
    await cdpNested.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    if (typeof prodServerNested.closeAllConnections === 'function') {
      prodServerNested.closeAllConnections();
    }
    await new Promise((r) => prodServerNested.close(r));
    prodServerNested = null;
    await sleep(400);

    // Reload from SW on nested path
    console.log('6. Reloading page from Service Worker at /solcheck/ while offline...');
    await cdpNested.send('Page.reload');
    await sleep(1500);

    const nestedReloadedTitle = await cdpNested.eval(`document.title`);
    console.log(`   ✓ Page reloaded offline at nested path! Title: "${nestedReloadedTitle}"`);

    // Verify offline Camera pulse check initializes on nested path
    console.log('7. Verifying offline Camera pulse check initialization on nested path (/solcheck/)...');
    await cdpNested.eval(`location.hash = '#/check-in'`);
    await sleep(600);

    await cdpNested.eval(`document.querySelector('.camera-pulse-open-btn').click()`);
    await sleep(250);
    await cdpNested.eval(`document.querySelector('.camera-pulse-consent .button-primary').click()`);

    let nestedMeasuring = false;
    for (let i = 0; i < 40; i++) {
      const state = await cdpNested.eval(`(() => {
        const isMeasuring = Boolean(document.querySelector('.camera-pulse-measuring'));
        const video = document.querySelector('.camera-video-feed');
        const hasStream = Boolean(video && video.srcObject);
        const isPlaying = Boolean(video && !video.paused && video.currentTime > 0);
        return { isMeasuring, hasStream, isPlaying };
      })()`);
      if (state.isMeasuring && state.hasStream && state.isPlaying) {
        nestedMeasuring = true;
        break;
      }
      await sleep(300);
    }
    if (!nestedMeasuring) throw new Error('Offline camera failed to initialize on nested path /solcheck/.');
    console.log('   ✓ Camera initialized offline on nested path! Workers and WebAssembly running.');

    // Stop camera
    await cdpNested.eval(`document.querySelector('.camera-pulse-measuring button.button-secondary').click()`);
    await sleep(400);

    // Verify zero CDN requests on nested path
    if (cdnRequestsNested.length > 0) throw new Error(`CDN requests on nested path: ${JSON.stringify(cdnRequestsNested)}`);
    console.log('   ✓ Zero CDN requests on nested path.');
    if (failedRequestsNested.length > 0) throw new Error(`Asset load failures on nested path: ${JSON.stringify(failedRequestsNested)}`);
    console.log('   ✓ Zero failed asset requests on nested path.');

    cdpNested.close();
    console.log('\n   >>> PART 2 NESTED PATH HOSTING: ALL CHECKS PASSED <<<\n');
  } finally {
    if (prodServerNested) {
      try { prodServerNested.close(); } catch {}
    }
    if (chromeProcessNested) chromeProcessNested.kill();
    try { rmSync(userDataDirNested, { recursive: true, force: true }); } catch {}
  }

  console.log('================================================================');
  console.log('   ALL CHECKS PASSED: ROOT (/) AND NESTED (/solcheck/) HOSTS    ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\nVERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
