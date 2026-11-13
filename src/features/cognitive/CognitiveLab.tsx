import { useEffect, useRef, useState } from 'react';
import {
  evaluatePvtTrials,
  PVT_CONFIG,
  type PvTrialResult,
  type PvtSessionSummary,
} from './pvtEngine';
import './cognitive.css';

type PvtState = 'idle' | 'waiting' | 'stimulus' | 'feedback' | 'completed';

export function CognitiveLab({ currentSol = 43 }: { currentSol?: number }) {
  const [gameState, setGameState] = useState<PvtState>('idle');
  const [trialsCount, setTrialsCount] = useState<number>(PVT_CONFIG.defaultTrialCount);
  const [currentTrial, setCurrentTrial] = useState<number>(0);
  const [displayMs, setDisplayMs] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<'good' | 'lapse' | 'early'>('good');
  const [results, setResults] = useState<PvTrialResult[]>([]);
  const [summary, setSummary] = useState<PvtSessionSummary | null>(null);

  const timerRef = useRef<number | null>(null);
  const waitTimeoutRef = useRef<number | null>(null);
  const stimulusStartRef = useRef<number>(0);
  const isInputLockedRef = useRef<boolean>(false);

  // Teardown timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
    };
  }, []);

  // Keyboard response listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleInteraction();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, currentTrial]);

  function startTest() {
    setResults([]);
    setSummary(null);
    setCurrentTrial(0);
    startTrial(1);
  }

  function startTrial(trialNum: number) {
    if (trialNum > trialsCount) {
      finishTest(results);
      return;
    }

    setCurrentTrial(trialNum);
    setGameState('waiting');
    setDisplayMs(0);
    isInputLockedRef.current = false;

    // Random inter-stimulus interval (ISI)
    const delay =
      PVT_CONFIG.minIntervalMs +
      Math.random() * (PVT_CONFIG.maxIntervalMs - PVT_CONFIG.minIntervalMs);

    waitTimeoutRef.current = window.setTimeout(() => {
      triggerStimulus();
    }, delay);
  }

  function triggerStimulus() {
    stimulusStartRef.current = performance.now();
    setGameState('stimulus');

    function tick() {
      const elapsed = Math.round(performance.now() - stimulusStartRef.current);
      setDisplayMs(elapsed);
      timerRef.current = requestAnimationFrame(tick);
    }
    timerRef.current = requestAnimationFrame(tick);
  }

  function handleInteraction() {
    if (isInputLockedRef.current) return;

    if (gameState === 'waiting') {
      // Premature click / False start
      isInputLockedRef.current = true;
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);

      const earlyResult: PvTrialResult = {
        trialIndex: currentTrial,
        reactionTimeMs: 50,
        isFalseStart: true,
        isLapse: false,
        timestamp: Date.now(),
      };

      setResults(prev => [...prev, earlyResult]);
      setFeedbackMsg('FALSE START · Wait for counter to start');
      setFeedbackType('early');
      setGameState('feedback');

      setTimeout(() => {
        startTrial(currentTrial + 1);
      }, 1500);
    } else if (gameState === 'stimulus') {
      // Valid or lapse reaction
      isInputLockedRef.current = true;
      if (timerRef.current) cancelAnimationFrame(timerRef.current);

      const reactionTimeMs = Math.round(performance.now() - stimulusStartRef.current);
      const isLapse = reactionTimeMs >= PVT_CONFIG.lapseThresholdMs;

      const trialResult: PvTrialResult = {
        trialIndex: currentTrial,
        reactionTimeMs,
        isFalseStart: false,
        isLapse,
        timestamp: Date.now(),
      };

      const updatedResults = [...results, trialResult];
      setResults(updatedResults);

      if (isLapse) {
        setFeedbackMsg(`${reactionTimeMs} ms · Cognitive Lapse (> 500 ms)`);
        setFeedbackType('lapse');
      } else {
        setFeedbackMsg(`${reactionTimeMs} ms`);
        setFeedbackType('good');
      }
      setGameState('feedback');

      setTimeout(() => {
        if (currentTrial >= trialsCount) {
          finishTest(updatedResults);
        } else {
          startTrial(currentTrial + 1);
        }
      }, 1200);
    } else if (gameState === 'idle' || gameState === 'completed') {
      startTest();
    }
  }

  function finishTest(finalResults: PvTrialResult[]) {
    setGameState('completed');
    const summaryData = evaluatePvtTrials(finalResults, currentSol, PVT_CONFIG.nominalBaselineRtMs);
    setSummary(summaryData);
  }

  return (
    <div className="cognitive-container">
      <header className="page-intro">
        <div>
          <p className="eyebrow">Neurobehavioral readiness</p>
          <h1>Cognitive Performance Laboratory</h1>
          <p className="muted">
            Standard NASA Brief Psychomotor Vigilance Task (PVT-B) used aboard the ISS to detect
            fatigue, sleep restriction, and circadian performance degradation.
          </p>
        </div>
      </header>

      {/* Main Testing Arena */}
      <section className="cognitive-arena-card" aria-label="PVT Test Arena">
        <div className="pvt-progress-bar">
          <span>
            {gameState === 'idle'
              ? 'Ready to test'
              : gameState === 'completed'
              ? 'Test completed'
              : `Trial ${currentTrial} of ${trialsCount}`}
          </span>
          <div className="pvt-progress-track">
            <div
              className="pvt-progress-fill"
              style={{
                width: `${
                  trialsCount > 0 ? Math.min(100, Math.round((currentTrial / trialsCount) * 100)) : 0
                }%`,
              }}
            />
          </div>
          <span>Baseline: 220 ms</span>
        </div>

        <div
          className={`pvt-target-box ${
            gameState === 'idle'
              ? 'idle'
              : gameState === 'waiting'
              ? 'waiting'
              : gameState === 'stimulus'
              ? 'active'
              : gameState === 'feedback'
              ? `feedback-${feedbackType}`
              : 'idle'
          }`}
          onClick={handleInteraction}
          role="button"
          tabIndex={0}
          aria-label="Reaction stimulus box"
        >
          {gameState === 'idle' && (
            <div>
              <h2>Click or press Spacebar to begin</h2>
              <p className="pvt-instruction-hint">
                As soon as numbers appear in the box, press <span className="pvt-key-badge">Spacebar</span> or tap immediately.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                <span className="pvt-instruction-hint">Test length:</span>
                <button
                  type="button"
                  className={`button button-sm button-secondary tab-toggle${trialsCount === 3 ? ' is-selected' : ''}`}
            aria-pressed={trialsCount === 3}
                  onClick={e => {
                    e.stopPropagation();
                    setTrialsCount(3);
                  }}
                >
                  Quick (3 trials)
                </button>
                <button
                  type="button"
                  className={`button button-sm button-secondary tab-toggle${trialsCount === 6 ? ' is-selected' : ''}`}
            aria-pressed={trialsCount === 6}
                  onClick={e => {
                    e.stopPropagation();
                    setTrialsCount(6);
                  }}
                >
                  Standard (6 trials)
                </button>
              </div>
              <button
                type="button"
                className="button button-primary"
                style={{ marginTop: '1rem' }}
                onClick={e => {
                  e.stopPropagation();
                  startTest();
                }}
              >
                Start {trialsCount}-trial test
              </button>
            </div>
          )}

          {gameState === 'waiting' && (
            <div>
              <p className="pvt-counter-display" style={{ opacity: 0.2 }}>
                000
              </p>
              <p className="pvt-instruction-hint">Wait for stimulus... Do NOT click early</p>
            </div>
          )}

          {gameState === 'stimulus' && (
            <div>
              <p className="pvt-counter-display">{displayMs} ms</p>
              <p className="pvt-instruction-hint">PRESS NOW!</p>
            </div>
          )}

          {gameState === 'feedback' && (
            <div>
              <p className="pvt-counter-display">{feedbackMsg}</p>
              <p className="pvt-instruction-hint">Preparing next trial...</p>
            </div>
          )}

          {gameState === 'completed' && summary && (
            <div>
              <h2>Session complete</h2>
              <p className="pvt-instruction-hint">
                Mean RT: <strong>{summary.meanRtMs} ms</strong> · Lapses:{' '}
                <strong>{summary.lapsesCount}</strong> · Score:{' '}
                <strong>{summary.vigilanceScore}/100</strong>
              </p>
              <button
                type="button"
                className="button button-secondary"
                style={{ marginTop: '1rem' }}
                onClick={e => {
                  e.stopPropagation();
                  startTest();
                }}
              >
                Repeat test
              </button>
            </div>
          )}
        </div>

        {/* Live Trial Chips */}
        {results.length > 0 && (
          <div>
            <span className="pvt-stat-label">Trials in this session:</span>
            <div className="pvt-trial-history-list">
              {results.map((r, i) => (
                <span
                  key={i}
                  className={`pvt-trial-chip ${
                    r.isFalseStart ? 'early' : r.isLapse ? 'lapse' : 'good'
                  }`}
                >
                  #{r.trialIndex}: {r.isFalseStart ? 'Early' : `${r.reactionTimeMs}ms`}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Results & NASA HRP Correlation Card */}
      {summary && (
        <section className="cognitive-arena-card">
          <h2>Cognitive Readiness Evaluation (Sol {summary.sol})</h2>
          <div className="pvt-summary-grid">
            <div className="pvt-stat-tile">
              <span className="pvt-stat-label">Mean reaction time</span>
              <span className="pvt-stat-val">{summary.meanRtMs} ms</span>
              <span
                className={`pvt-stat-delta ${
                  (summary.baselineDiffMs ?? 0) <= 20 ? 'good' : 'bad'
                }`}
              >
                {(summary.baselineDiffMs ?? 0) >= 0 ? '+' : ''}
                {summary.baselineDiffMs} ms vs nominal (220 ms)
              </span>
            </div>

            <div className="pvt-stat-tile">
              <span className="pvt-stat-label">Cognitive lapses (&gt;500ms)</span>
              <span className="pvt-stat-val">{summary.lapsesCount}</span>
              <span className="pvt-stat-label">Primary sleep loss marker</span>
            </div>

            <div className="pvt-stat-tile">
              <span className="pvt-stat-label">Vigilance index</span>
              <span className="pvt-stat-val">{summary.vigilanceScore} / 100</span>
              <span className={`pvt-stat-delta ${summary.vigilanceScore >= 80 ? 'good' : 'bad'}`}>
                Tier: {summary.performanceTier.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div className="pvt-stat-tile">
              <span className="pvt-stat-label">Fastest / Slowest</span>
              <span className="pvt-stat-val">
                {summary.fastestRtMs} / {summary.slowestRtMs} ms
              </span>
              <span className="pvt-stat-label">Response stability</span>
            </div>
          </div>

          <div
            className="pvt-evidence-card"
            style={{
              borderColor:
                summary.performanceTier === 'significant_fatigue'
                  ? 'var(--nasa-red)'
                  : summary.performanceTier === 'mild_fatigue'
                  ? 'var(--status-trend)'
                  : 'var(--status-steady)',
            }}
          >
            <strong>Operational Assessment:</strong>
            <p>{summary.clinicalInterpretation}</p>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              <strong>HRP Evidence Link:</strong> NASA Human Research Program Risk of Adverse
              Cognitive or Behavioral Conditions (BHP-01). Cognitive lapses on PVT-B reliably
              correlate with acute cumulative sleep loss (&lt; 6h) and anticipate operational errors
              during robotic manipulation, piloting, and EVA.
            </p>
          </div>
        </section>
      )}

      {/* NASA Context & Scientific Validation */}
      <section className="pvt-evidence-card">
        <h3>NASA Human Research Program Context: Psychomotor Vigilance</h3>
        <p>
          The Psychomotor Vigilance Test (PVT) was pioneered by Dr. David F. Dinges at the
          University of Pennsylvania under NASA HRP grant funding. Unlike subjective sleepiness
          scales where astronauts consistently underestimate their own impairment, the PVT measures
          sustained attention and involuntary micro-sleeps without practice-learning effects.
        </p>
        <p>
          <strong>Operational Thresholds:</strong> A nominal astronaut response time is 200–240 ms.
          A lapse is strictly defined as any reaction time exceeding 500 ms. Two or more lapses in a
          brief 3-minute battery signify a neurobehavioral deficit comparable to moderate blood
          alcohol concentration or 24 hours of sustained wakefulness.
        </p>
      </section>
    </div>
  );
}
