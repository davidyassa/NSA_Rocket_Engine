import { useEffect, useRef, useState } from 'react';
import { Check, Ear, Hand, Headphones, Mic, Play, Settings2, ShieldCheck, Smartphone, Square, VolumeX, Wind } from 'lucide-react';
import type { MetricId } from '../../../contracts';
import { analyzeBreathSound, BREATH_SOUND_ALGORITHM, type BreathSoundResult } from './breathSound';
import { analyzeHeartSound, HEART_SOUND_ALGORITHM, type HeartSoundResult } from './heartSound';
import { MicPermissionError, MicRecorder, microphoneSupported, playRecording } from './micRecorder';
import { analyzeVoice, READING_PASSAGE, VOICE_ALGORITHM, type VoiceResult } from './voiceAnalysis';
import './micCheck.css';

export type MicCheckMode = 'heart' | 'breath' | 'voice';

/** What the check hands to the check-in form when the crew member chooses to use it. */
export interface MicReading {
  capturedAtUtc: string;
  algorithm: string;
  quality: number;
  values: Partial<Record<MetricId, number>>;
}

type Status = 'idle' | 'setup' | 'starting' | 'recording' | 'analyzing' | 'result' | 'denied' | 'unavailable';
type Analysis =
  | { mode: 'heart'; result: HeartSoundResult }
  | { mode: 'breath'; result: BreathSoundResult }
  | { mode: 'voice'; result: VoiceResult };

const SECONDS: Record<MicCheckMode, { target: number; max: number; min: number }> = {
  heart: { target: 20, max: 20, min: 20 },
  breath: { target: 40, max: 40, min: 40 },
  voice: { target: 40, max: 90, min: 12 },
};

const COPY: Record<MicCheckMode, { title: string; open: string; intro: string; steps: { Icon: typeof Mic; title: string; text: string }[] }> = {
  heart: {
    title: 'Heart sound check (microphone)',
    open: 'Listen to my heartbeat with the phone (20 s)',
    intro: 'A phone microphone pressed against your chest can hear your heart sounds. Sol Check counts the beats from the sound.',
    steps: [
      { Icon: Smartphone, title: 'Use a phone', text: 'Laptop microphones cannot touch your chest. Find the microphone hole on the bottom edge of the phone.' },
      { Icon: Hand, title: 'Press it to your chest', text: 'On bare skin or one thin layer, just left of your breastbone, level with the nipple. Press firmly and hold still.' },
      { Icon: VolumeX, title: 'Quiet, 20 seconds', text: 'Sit, breathe gently and do not talk. Rubbing and talking drown out the heartbeat.' },
    ],
  },
  breath: {
    title: 'Breath sound check (microphone)',
    open: 'Measure breathing with the microphone (40 s)',
    intro: 'The microphone hears the air of each breath. Sol Check counts breaths from the sound in 40 seconds.',
    steps: [
      { Icon: Smartphone, title: 'Hold the microphone close', text: 'Hold the phone’s bottom edge (or the laptop’s microphone) 2–3 cm below your nose.' },
      { Icon: Wind, title: 'Breathe normally', text: 'Through your nose, mouth closed. Do not slow down or speed up on purpose.' },
      { Icon: VolumeX, title: 'Quiet room', text: 'No talking, music or fans close by for 40 seconds.' },
    ],
  },
  voice: {
    title: 'Voice check (read aloud)',
    open: 'Read a short passage aloud (about 40 s)',
    intro: 'You read the same short passage every sol. Sol Check measures how much your pitch moves, your speaking pace and your pauses, and compares them with your own usual. It does not diagnose anything.',
    steps: [
      { Icon: Mic, title: 'Same place, same device', text: 'Use the same microphone each sol, about 20–30 cm from your mouth, in a quiet spot.' },
      { Icon: Ear, title: 'Read naturally', text: 'Read the whole passage once, at your normal pace and volume. Small slips are fine; keep going.' },
      { Icon: Headphones, title: 'Nobody else talking', text: 'Other voices are counted as yours.' },
    ],
  },
};

function Trace({ values, markers, seconds, label }: { values: number[]; markers: number[]; seconds: number; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values.map(Math.abs), 1e-9);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(38 - ((v - min) / span) * 34).toFixed(2)}`).join(' ');
  return (
    <figure className="mic-trace">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline points={points} className="mic-trace-line" vectorEffect="non-scaling-stroke" />
        {markers.map((t) => (
          <line key={t} x1={(t / seconds) * 100} x2={(t / seconds) * 100} y1={1} y2={6} className="mic-trace-marker" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function LiveLevel({ levels }: { levels: number[] }) {
  const points = levels.map((v, i) => `${((i / 149) * 100).toFixed(2)},${(39 - v * 37).toFixed(2)}`).join(' ');
  return (
    <svg className="mic-live" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} className="mic-trace-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MicCheck({ mode, onAccept }: { mode: MicCheckMode; onAccept?: (reading: MicReading) => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(150).fill(0));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const recorder = useRef<MicRecorder | null>(null);
  const levelBuffer = useRef<number[]>(Array(150).fill(0));
  const timer = useRef<number | null>(null);
  const stopPlayback = useRef<(() => void) | null>(null);
  const copy = COPY[mode];
  const limits = SECONDS[mode];

  function clearTimer() {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }

  async function release() {
    clearTimer();
    const active = recorder.current;
    recorder.current = null;
    if (active) await active.stop();
  }

  useEffect(() => () => {
    void release();
    stopPlayback.current?.();
  }, []);

  async function start() {
    if (!microphoneSupported()) { setStatus('unavailable'); return; }
    setAnalysis(null);
    setAccepted(false);
    setElapsed(0);
    levelBuffer.current = Array(150).fill(0);
    setLevels(levelBuffer.current);
    setStatus('starting');
    const next = new MicRecorder({
      mode,
      onLevel: (level) => {
        const buffer = levelBuffer.current;
        buffer.push(level);
        buffer.shift();
      },
    });
    try {
      await next.start();
    } catch (error) {
      setStatus(error instanceof MicPermissionError ? 'denied' : 'unavailable');
      return;
    }
    recorder.current = next;
    setStatus('recording');
    timer.current = window.setInterval(() => {
      const seconds = next.seconds;
      setElapsed(seconds);
      setLevels([...levelBuffer.current]);
      if (seconds >= limits.max) void finish();
    }, 100);
  }

  async function finish() {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    clearTimer();
    const { samples, sampleRate } = await active.stop();
    setStatus('analyzing');
    // Let the "Analysing" state paint before the (sub-second) analysis runs.
    window.setTimeout(() => {
      const result: Analysis = mode === 'heart'
        ? { mode, result: analyzeHeartSound(samples, sampleRate) }
        : mode === 'breath'
          ? { mode, result: analyzeBreathSound(samples, sampleRate) }
          : { mode, result: analyzeVoice(samples, sampleRate) };
      setAnalysis(result);
      setStatus('result');
    }, 30);
  }

  async function cancel() {
    await release();
    stopPlayback.current?.();
    setPlaying(false);
    setAnalysis(null);
    setStatus('idle');
  }

  function listen(playback: { samples: Float32Array; sampleRate: number } | null) {
    if (!playback) return;
    if (playing) { stopPlayback.current?.(); setPlaying(false); return; }
    setPlaying(true);
    stopPlayback.current = playRecording(playback.samples, playback.sampleRate, () => setPlaying(false));
  }

  function accept() {
    if (!analysis || !onAccept) return;
    const capturedAtUtc = new Date().toISOString();
    if (analysis.mode === 'heart' && analysis.result.ok && analysis.result.bpm !== null) {
      onAccept({ capturedAtUtc, algorithm: HEART_SOUND_ALGORITHM, quality: analysis.result.quality, values: { heart_rate: analysis.result.bpm } });
    } else if (analysis.mode === 'breath' && analysis.result.ok && analysis.result.brpm !== null) {
      onAccept({ capturedAtUtc, algorithm: BREATH_SOUND_ALGORITHM, quality: analysis.result.quality, values: { respiratory_rate: analysis.result.brpm } });
    } else if (analysis.mode === 'voice' && analysis.result.ok && analysis.result.markers) {
      const m = analysis.result.markers;
      onAccept({
        capturedAtUtc, algorithm: VOICE_ALGORITHM, quality: analysis.result.quality,
        values: { voice_pitch_variability: m.pitchVariabilitySt, voice_articulation_rate: m.articulationRate, voice_pause_ratio: m.pauseRatio },
      });
    } else return;
    setAccepted(true);
  }

  if (status === 'idle') {
    return (
      <div className="camera-pulse-container">
        <button type="button" className="button button-secondary camera-pulse-open-btn" onClick={() => setStatus('setup')}>
          <Mic size={16} aria-hidden="true" /> {copy.open}
        </button>
      </div>
    );
  }

  const progress = Math.min(1, elapsed / limits.target);
  const ok = analysis?.result.ok ?? false;

  return (
    <div className="camera-pulse-container">
      <div className="camera-pulse-card mic-check" role="region" aria-label={copy.title}>
        <div className="camera-pulse-header">
          <h3>{copy.title}</h3>
          <span className="camera-pulse-badge-opt">Optional</span>
        </div>

        {status === 'setup' && (
          <div className="camera-pulse-consent">
            <p className="camera-pulse-consent-text">{copy.intro}</p>
            <ol className="camera-setup-steps">
              {copy.steps.map(({ Icon, title, text }, index) => (
                <li key={title}>
                  <span className="camera-setup-icon" aria-hidden="true"><Icon size={22} /></span>
                  <div><strong>{index + 1}. {title}</strong><p>{text}</p></div>
                </li>
              ))}
            </ol>
            <p className="camera-privacy-line">
              <ShieldCheck size={16} aria-hidden="true" /> Sound stays on this device. Nothing is saved or sent; only the numbers you choose to use are kept.
            </p>
            <div className="camera-pulse-actions">
              <button type="button" className="button button-primary" onClick={() => void start()}>
                <Mic size={18} aria-hidden="true" /> I’m ready · Start microphone
              </button>
              <button type="button" className="button button-secondary" onClick={() => void cancel()}>Cancel</button>
            </div>
          </div>
        )}

        {status === 'starting' && <p className="camera-pulse-measuring-info" role="status">Opening the microphone…</p>}

        {status === 'recording' && (
          <div className="mic-recording" role="status" aria-live="polite">
            {mode === 'voice' && (
              <blockquote className="mic-passage" lang="en">
                {READING_PASSAGE.map((sentence) => <p key={sentence}>{sentence}</p>)}
              </blockquote>
            )}
            <LiveLevel levels={levels} />
            <div className="camera-capture-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Recording progress">
              <div className="camera-capture-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="camera-pulse-measuring-info">
              <span className="mic-rec-dot" aria-hidden="true" /> Listening · {Math.floor(elapsed)} s
              {mode !== 'voice' && <> of {limits.target} s. {mode === 'heart' ? 'Keep pressing and stay quiet.' : 'Breathe normally.'}</>}
              {mode === 'voice' && <>. Read the passage, then tap “I’ve finished”.</>}
            </p>
            <div className="camera-pulse-actions">
              {mode === 'voice' && (
                <button type="button" className="button button-primary" onClick={() => void finish()} disabled={elapsed < limits.min}>
                  <Square size={16} aria-hidden="true" /> I’ve finished
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={() => void cancel()}>Cancel</button>
            </div>
          </div>
        )}

        {status === 'analyzing' && <p className="camera-pulse-measuring-info" role="status">Analysing the sound on this device…</p>}

        {status === 'denied' && (
          <div className="camera-pulse-denied" role="alert">
            <p className="camera-pulse-error-msg"><strong>The microphone is blocked.</strong> Microphone permission is turned off for Sol Check.</p>
            <p className="camera-pulse-measuring-info">No problem: type the number in the box above instead, or allow the microphone in settings and try again.</p>
            <div className="camera-pulse-actions"><button type="button" className="button button-secondary" onClick={() => void cancel()}>Close</button></div>
          </div>
        )}

        {status === 'unavailable' && (
          <div className="camera-pulse-unavailable" role="alert">
            <p className="camera-pulse-error-msg"><strong>No microphone available.</strong> This device or browser cannot record here (it needs a secure https page).</p>
            <div className="camera-pulse-actions"><button type="button" className="button button-secondary" onClick={() => void cancel()}>Close</button></div>
          </div>
        )}

        {status === 'result' && analysis && (
          <div className={ok ? 'camera-pulse-success' : 'camera-pulse-weak'} role="status" aria-live="polite">
            {!ok && <p className="camera-pulse-weak-alert">We couldn’t get a clear reading</p>}
            {!ok && <p className="camera-pulse-measuring-info">{analysis.result.problem}</p>}

            {analysis.mode === 'heart' && (
              <>
                {analysis.result.ok && analysis.result.bpm !== null && (
                  <div className="mic-result-number">
                    <span className="camera-result-label">Heart rate from heart sounds</span>
                    <strong>{analysis.result.bpm}</strong> <span>beats per minute</span>
                  </div>
                )}
                <Trace values={analysis.result.trace.values} markers={analysis.result.trace.markers} seconds={analysis.result.trace.seconds} label="Heart-sound loudness over the recording; ticks mark heart sounds" />
                {ok && <details className="camera-tech-details">
                  <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                  <p className="camera-pulse-result-meta">
                    Whole recording {analysis.result.bpmExact ?? '—'} bpm · 8-second windows {analysis.result.windowBpm.join(', ') || '—'} bpm (spread {analysis.result.windowSpread ?? '—'}) ·
                    pattern quality {Math.round(analysis.result.quality * 100)}% · rubbing noise removed {Math.round(analysis.result.spikeFraction * 100)}%
                    <br /><span className="camera-pulse-method">{HEART_SOUND_ALGORITHM}</span>
                  </p>
                </details>}
              </>
            )}

            {analysis.mode === 'breath' && (
              <>
                {analysis.result.ok && analysis.result.brpm !== null && (
                  <div className="mic-result-number">
                    <span className="camera-result-label">Breathing rate from breath sounds</span>
                    <strong>{analysis.result.brpm}</strong> <span>breaths per minute</span>
                    <p className="camera-result-how">Two separate methods agreed: the repeating sound pattern ({analysis.result.acfBrpm}) and counting {analysis.result.breaths} breaths ({analysis.result.countBrpm}).</p>
                  </div>
                )}
                <Trace values={analysis.result.trace.values} markers={analysis.result.trace.markers} seconds={analysis.result.trace.seconds} label="Breath-sound loudness over the recording; ticks mark counted breaths" />
                {ok && <details className="camera-tech-details">
                  <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                  <p className="camera-pulse-result-meta">
                    Autocorrelation {analysis.result.acfBrpm ?? '—'} · counted {analysis.result.countBrpm ?? '—'} breaths/min ({analysis.result.breaths} breaths{analysis.result.paired ? ', breath-in and breath-out paired' : ''}) ·
                    loudness range {analysis.result.dynamicRangeDb} dB · quality {Math.round(analysis.result.quality * 100)}%
                    <br /><span className="camera-pulse-method">{BREATH_SOUND_ALGORITHM}</span>
                  </p>
                </details>}
              </>
            )}

            {analysis.mode === 'voice' && analysis.result.ok && analysis.result.markers && (
              <>
                <dl className="mic-voice-grid">
                  <div><dt>Pitch movement</dt><dd>{analysis.result.markers.pitchVariabilitySt} <span>semitones</span></dd></div>
                  <div><dt>Speaking pace</dt><dd>{analysis.result.markers.articulationRate} <span>syllables/s</span></dd></div>
                  <div><dt>Time in pauses</dt><dd>{analysis.result.markers.pauseRatio} <span>%</span></dd></div>
                </dl>
                <p className="camera-pulse-result-plain">
                  After you save, Sol Check compares these three with your own usual from the last 14 sols. Flatter pitch, slower pace and longer pauses together can go with tiredness or low mood. It is a prompt to check in with yourself or the crew medical officer, not a diagnosis.
                </p>
                <Trace values={analysis.result.trace.values} markers={analysis.result.trace.markers} seconds={analysis.result.trace.seconds} label="Voice loudness over the reading; ticks mark detected syllables" />
                <details className="camera-tech-details">
                  <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                  <p className="camera-pulse-result-meta">
                    Reading time {analysis.result.markers.readingSeconds} s · {analysis.result.markers.pauseCount} pauses (mean {analysis.result.markers.meanPauseS} s) ·
                    overall rate {analysis.result.markers.speechRate} syllables/s · {analysis.result.markers.syllableNuclei} of 144 syllables detected ·
                    median pitch {analysis.result.markers.pitchMedianHz} Hz · loudness variation {analysis.result.markers.loudnessVariabilityDb} dB · speech {analysis.result.snrDb} dB above background
                    <br />Voice quality (information only): jitter {analysis.result.markers.jitterPct ?? '—'}% · shimmer {analysis.result.markers.shimmerPct ?? '—'}% · harmonics-to-noise {analysis.result.markers.hnrDb ?? '—'} dB.
                    These are measured in connected speech with a consumer microphone, so compare them only with your own earlier readings.
                    <br /><span className="camera-pulse-method">{VOICE_ALGORITHM}</span>
                  </p>
                </details>
              </>
            )}

            {ok && <p className="camera-pulse-result-meta"><span className="camera-pulse-disclaimer">Microphone estimate, not a diagnosis</span></p>}
            <div className="camera-pulse-actions">
              {ok && onAccept && (
                <button type="button" className="button button-primary" onClick={accept} disabled={accepted}>
                  {accepted ? <><Check size={16} aria-hidden="true" /> Added to your check-in</> : 'Use in my check-in'}
                </button>
              )}
              {analysis.mode !== 'voice' && analysis.result.playback && (
                <button type="button" className="button button-secondary" onClick={() => listen(analysis.result.playback)}>
                  {playing ? <><Square size={16} aria-hidden="true" /> Stop</> : <><Play size={16} aria-hidden="true" /> Listen back</>}
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={() => void start()}>Measure again</button>
              <button type="button" className="button button-secondary" onClick={() => void cancel()}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
