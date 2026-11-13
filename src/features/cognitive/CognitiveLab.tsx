import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VigilanceReadings } from './VigilanceReadings';
import { summarizeVigilance, type VigilanceTrial } from './pvtEngine';
import { VIGILANCE_MODES, type VigilanceMode, type VigilanceSession } from './vigilance';
import './cognitive.css';

type Stage = 'idle' | 'waiting' | 'stimulus' | 'feedback' | 'completed';

interface Run {
  mode: VigilanceMode;
  stage: 'waiting' | 'stimulus' | 'feedback';
  trials: VigilanceTrial[];
  shownAt: number;
  deadline: number;
  timer?: number;
  durationTimer?: number;
  frame?: number;
}

const RESPONSE_WINDOW_MS = 2000;

export function CognitiveLab({ currentSol, history, onSave }: {
  currentSol: number;
  history: readonly VigilanceSession[];
  onSave: (session: VigilanceSession) => void;
}) {
  const [mode, setMode] = useState<VigilanceMode>('quick');
  const [stage, setStage] = useState<Stage>('idle');
  const [trialCount, setTrialCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<VigilanceSession | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const runRef = useRef<Run | null>(null);
  const target = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const lastActionRef = useRef<number>(0);
  const active = stage === 'waiting' || stage === 'stimulus' || stage === 'feedback';

  function clearRun() {
    const run = runRef.current;
    if (!run) return;
    window.clearTimeout(run.timer);
    window.clearTimeout(run.durationTimer);
    if (run.frame !== undefined) window.cancelAnimationFrame(run.frame);
    runRef.current = null;
  }

  function stop(message: string) {
    clearRun();
    setStage('idle');
    setNotice(message);
    if (!document.hidden) requestAnimationFrame(() => startButton.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && runRef.current) stop('Session ended when the app went into the background. Start again when ready.');
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearRun();
    };
  }, []);

  // Global keyboard listener: Space and Enter immediately respond without needing focus on the button
  useEffect(() => {
    if (!active) return;
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault(); // Stop window scrolling
        if (!event.repeat) {
          handleUserAction();
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [active, stage]);

  // Keep target button focused when test is active
  useEffect(() => {
    if (active && target.current) {
      target.current.focus({ preventScroll: true });
    }
  }, [active, stage]);

  useEffect(() => {
    if (!active || mode !== 'timed') return;
    const interval = window.setInterval(() => {
      const run = runRef.current;
      if (run) setSecondsLeft(Math.max(0, Math.ceil((run.deadline - performance.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(interval);
  }, [active, mode]);

  function persist(session: VigilanceSession) {
    try {
      onSave(session);
      setUnsaved(false);
      setNotice(`Result saved on Sol ${currentSol} (mean: ${session.meanRtMs ?? '—'} ms · ${session.lapsesCount} lapses).`);
    } catch (error) {
      setUnsaved(true);
      setNotice(error instanceof Error ? error.message : 'The result could not be saved. Try saving again.');
    }
  }

  function finish(run: Run) {
    if (runRef.current !== run) return;
    clearRun();
    const session = summarizeVigilance(run.trials, run.mode, currentSol);
    if (!session) {
      stop('No valid reaction times were recorded (all responses were early or missed). Start a new session to try again.');
      return;
    }

    setResult(session);
    setStage('completed');
    persist(session);
    requestAnimationFrame(() => startButton.current?.focus({ preventScroll: true }));
  }

  function playStimulusCue() {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {
      // AudioContext unavailable or autoplay restricted
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(60); } catch {}
    }
  }

  function next(run: Run) {
    const config = VIGILANCE_MODES[run.mode];
    // In trial-based modes (quick, standard), complete the requested number of stimulus trials
    const stimulusDone = run.trials.filter((t) => typeof t === 'number' || t === 'missed').length;
    if ('trialCount' in config && (stimulusDone >= config.trialCount || run.trials.length >= config.trialCount + 4)) {
      finish(run);
      return;
    }
    run.stage = 'waiting';
    run.shownAt = 0;
    setStage('waiting');
    const delay = config.minWaitMs + Math.random() * (config.maxWaitMs - config.minWaitMs);
    run.timer = window.setTimeout(() => {
      if (runRef.current !== run) return;
      if (performance.now() >= run.deadline) {
        finish(run);
        return;
      }
      run.stage = 'stimulus';
      setStage('stimulus');
      playStimulusCue();
      const now = performance.now();
      run.shownAt = now;
      run.frame = requestAnimationFrame((rafNow) => {
        if (runRef.current !== run || run.stage !== 'stimulus') return;
        run.shownAt = rafNow;
      });
      run.timer = window.setTimeout(() => record(run, 'missed'), RESPONSE_WINDOW_MS);
    }, delay);
  }

  function record(run: Run, trial: VigilanceTrial) {
    if (runRef.current !== run || run.stage === 'feedback') return;
    if (performance.now() >= run.deadline) {
      finish(run);
      return;
    }
    window.clearTimeout(run.timer);
    if (run.frame !== undefined) window.cancelAnimationFrame(run.frame);
    run.trials.push(trial);
    run.stage = 'feedback';
    setStage('feedback');
    setTrialCount(run.trials.length);
    setFeedback(
      trial === 'early'
        ? 'Too early · Wait for the signal'
        : trial === 'missed'
          ? 'Missed (> 2000 ms)'
          : `${trial} ms${trial >= VIGILANCE_MODES[run.mode].lapseMs ? ' · Lapse' : ''}`,
    );
    run.timer = window.setTimeout(() => next(run), 650);
  }

  function respond() {
    const run = runRef.current;
    if (!run || run.stage === 'feedback') return;
    const now = performance.now();
    if (run.stage === 'waiting') {
      record(run, 'early');
      return;
    }
    const stimulusTime = run.shownAt || now;
    const elapsed = Math.round(now - stimulusTime);
    if (elapsed < VIGILANCE_MODES[run.mode].earlyMs) {
      record(run, 'early');
    } else if (elapsed >= RESPONSE_WINDOW_MS) {
      record(run, 'missed');
    } else {
      record(run, elapsed);
    }
  }

  function handleUserAction() {
    const now = performance.now();
    if (now - lastActionRef.current < 60) return; // Prevent double events
    lastActionRef.current = now;
    respond();
  }

  function start() {
    const config = VIGILANCE_MODES[mode];
    const started = performance.now();
    const run: Run = {
      mode, stage: 'waiting', trials: [], shownAt: 0,
      deadline: 'durationMs' in config ? started + config.durationMs : Infinity,
    };
    runRef.current = run;
    if ('durationMs' in config) run.durationTimer = window.setTimeout(() => finish(run), config.durationMs);
    setNotice('');
    setResult(null);
    setTrialCount(0);
    setSecondsLeft('durationMs' in config ? config.durationMs / 1000 : null);
    next(run);
  }

  const activeConfig = VIGILANCE_MODES[mode];
  const maxTrials = 'trialCount' in activeConfig ? activeConfig.trialCount : null;

  return (
    <div className="cognitive-container">
      <header className="page-intro">
        <h1>Cognitive Lab</h1>
        <p>Sol {currentSol} · Check sustained attention with a visual reaction-time task.</p>
        <Link to="/hazards/isolation" className="text-link">Hazard 2 monitoring</Link>
      </header>

      <section className="panel cognitive-arena-card" aria-labelledby="vigilance-test-title">
        <h2 id="vigilance-test-title">Vigilance check</h2>

        {result && stage === 'completed' && !active && (
          <div className="vigilance-completed-card" aria-live="polite">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, color: 'var(--status-steady, #34d399)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✓</span> Vigilance Check Completed (Sol {currentSol})
              </h3>
              <span className="badge badge-steady">Saved to Flight Log</span>
            </div>
            <div className="vigilance-completed-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.8rem', margin: '0.9rem 0' }}>
              <div className="mood-score-box">
                <span className="mood-score-box-label">Mean Reaction Time</span>
                <span className="mood-score-box-value" style={{ color: result.meanRtMs && result.meanRtMs < 355 ? 'var(--status-steady)' : 'var(--text-primary)' }}>
                  {result.meanRtMs !== null ? `${result.meanRtMs} ms` : '—'}
                </span>
                <span className="mood-score-box-sub">
                  {result.meanRtMs && result.meanRtMs < 300 ? 'Optimal alertness' : result.meanRtMs && result.meanRtMs < 500 ? 'Normal cognitive speed' : 'Slowed response'}
                </span>
              </div>
              <div className="mood-score-box">
                <span className="mood-score-box-label">Attention Lapses</span>
                <span className="mood-score-box-value" style={{ color: result.lapsesCount === 0 ? 'var(--status-steady)' : 'var(--warning, #fbbf24)' }}>
                  {result.lapsesCount}
                </span>
                <span className="mood-score-box-sub">
                  {result.lapsesCount === 0 ? 'Zero lapses' : `${result.lapsesCount} lapse(s) (>500ms)`}
                </span>
              </div>
              <div className="mood-score-box">
                <span className="mood-score-box-label">False Starts</span>
                <span className="mood-score-box-value">
                  {result.falseStartsCount}
                </span>
                <span className="mood-score-box-sub">
                  {result.falseStartsCount === 0 ? 'Perfect timing' : `${result.falseStartsCount} early tap(s)`}
                </span>
              </div>
            </div>
          </div>
        )}

        {!active && (
          <>
            <fieldset className="vigilance-modes" disabled={unsaved}>
              <legend>Test mode</legend>
              {Object.entries(VIGILANCE_MODES).map(([id, config]) => (
                <label key={id}><input type="radio" name="vigilance-mode" checked={mode === id}
                  onChange={() => setMode(id as VigilanceMode)} /> {config.label}</label>
              ))}
            </fieldset>
            <p className="muted">
              Tap the target or press <strong>Space</strong> or <strong>Enter</strong> as soon as <strong>“Respond now”</strong> appears.
              Use the same mode and input method for comparisons.
            </p>
            <div className="hazard-actions">
              <button ref={startButton} className="button button-primary" type="button" onClick={start} disabled={unsaved}>
                {result ? 'Run another check' : 'Start vigilance check'}
              </button>
              {history.length === 0 && !result && (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    const sampleSession = summarizeVigilance([245, 270, 255], mode, currentSol);
                    if (sampleSession) persist(sampleSession);
                  }}
                >
                  Load sample test result
                </button>
              )}
              {unsaved && result && (
                <button className="button button-secondary" type="button" onClick={() => persist(result)}>
                  Retry saving
                </button>
              )}
            </div>
          </>
        )}
        {active && (
          <>
            <div className="vigilance-progress">
              <span>
                <strong>{activeConfig.label}</strong> · {trialCount}{maxTrials ? ` of ${maxTrials}` : ''} trial{trialCount === 1 ? '' : 's'} recorded
                {secondsLeft !== null && ` · ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} left`}
              </span>
              <button type="button" className="button button-sm button-secondary" onClick={() => stop('Session ended.')}>
                End session
              </button>
            </div>
            <button
              ref={target}
              type="button"
              className="vigilance-target"
              data-stage={stage}
              onTouchStart={(event) => {
                event.preventDefault();
                handleUserAction();
              }}
              onPointerDown={(event) => {
                if (event.isPrimary && event.button === 0) handleUserAction();
              }}
              onClick={() => handleUserAction()}
            >
              {stage === 'stimulus' ? (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 'clamp(1.5rem, 5.5vw, 2.6rem)', fontWeight: 800, letterSpacing: '0.03em', display: 'block' }}>
                    ⚡ RESPOND NOW ⚡
                  </span>
                  <small style={{ fontSize: '1rem', fontWeight: 600, display: 'block', marginTop: '6px' }}>
                    Tap anywhere!
                  </small>
                </div>
              ) : stage === 'feedback' ? (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 'clamp(1.4rem, 4.5vw, 2.2rem)', fontWeight: 700, display: 'block' }}>
                    {feedback}
                  </span>
                </div>
              ) : (
                <div className="vigilance-waiting-content">
                  <div className="vigilance-radar-pulse" aria-hidden="true" />
                  <span style={{ fontSize: '1.25rem', fontWeight: 650 }}>
                    Ready... watching for signal
                  </span>
                  <small style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.85, maxWidth: '22rem' }}>
                    Do not tap yet. Tap or press Space as soon as the box flashes gold!
                  </small>
                </div>
              )}
            </button>
          </>
        )}
        {notice && <p role={unsaved ? 'alert' : 'status'} className="muted" style={{ marginTop: '0.8rem' }}>{notice}</p>}
      </section>

      {result && unsaved && <VigilanceReadings sol={currentSol} history={[result]} />}
      <VigilanceReadings sol={currentSol} history={history} showHistory />
      <details className="panel cognitive-arena-card">
        <summary>Scoring and NASA evidence</summary>
        <p>Quick and standard modes count responses of 500 ms or longer as lapses. The timed mode uses the 355 ms lapse and 130 ms early-response thresholds from the ISS study. Missed responses count as lapses and are excluded from mean reaction time.</p>
        <p>Sol Check is a browser-based prototype. The medical team interprets these observations alongside sleep, mood, and symptoms.</p>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197/" target="_blank" rel="noreferrer">Read the ISS reaction-time study</a>
      </details>
    </div>
  );
}
