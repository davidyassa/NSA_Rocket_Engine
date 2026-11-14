import { Cpu, Ear, ShieldCheck, Zap } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { heySolWanted, onHeySolChange, setHeySolWanted } from './solListener';
import { speak } from './voiceOutput';
import { onVoiceServerChange, voiceServerAvailable, voiceServerUp } from './voiceServer';

export function VoiceSettings() {
  const heySol = useSyncExternalStore(onHeySolChange, heySolWanted);
  const [testNote, setTestNote] = useState('');
  const [testing, setTesting] = useState(false);
  const playback = useRef<AbortController | null>(null);
  const serverUp = useSyncExternalStore(onVoiceServerChange, voiceServerUp);
  useEffect(() => { void voiceServerAvailable(); return () => playback.current?.abort(); }, []);

  async function test() {
    playback.current?.abort();
    if (testing) {
      setTesting(false);
      setTestNote('');
      return;
    }
    const speech = new AbortController();
    playback.current = speech;
    setTesting(true);
    setTestNote('Preparing Sol’s voice…');
    const result = await speak('Hi, I’m Sol. I can walk you through your check-in, or show you around.', speech.signal);
    if (speech.signal.aborted) return;
    setTesting(false);
    setTestNote(result === 'device' ? 'Played with the installed device voice.' : result === 'unavailable' ? 'Voice playback is unavailable here.' : '');
  }

  return (
    <section className="panel voice-settings" id="voice-settings" tabIndex={-1} aria-labelledby="voice-settings-title">
      <h2 id="voice-settings-title">Voice settings</h2>
      <label className="voice-setting-row">
        <input type="checkbox" role="switch" checked={heySol} onChange={(e) => setHeySolWanted(e.target.checked)} />
        <Ear size={16} aria-hidden="true" />
        <span><strong>“Hey Sol”</strong>: keep the microphone on so you can call Sol from any tab.</span>
      </label>
      <p className="voice-setting-note">Wake listening is on by default while Sol Check is visible, once you allow microphone access. Microphone audio stays on this device and is never saved.</p>

      <p className="voice-setting-note">Sol speaks with the Piper “lessac” voice and says a short version of each answer; the full answer stays on screen. The web app caches the voice after first use.</p>
      <p className="voice-setting-note" role="status">{serverUp
        ? 'Voice server connected: faster-whisper listens and Piper speaks on this laptop.'
        : 'Using the on-device voice. Run “npm run voice:server” on the laptop for faster, more accurate listening.'}</p>
      <div className="voice-setting-test">
        <button type="button" className="button button-secondary" onClick={() => void test()}>{testing ? 'Stop test' : 'Test voice'}</button>
        {testNote && <span className="voice-setting-note" role="status">{testNote}</span>}
      </div>

      <hr className="voice-setting-divider" />
      <div className="voice-edge-card">
        <div className="voice-edge-header">
          <Cpu size={18} aria-hidden="true" />
          <strong>Runs on this device, or on a laptop next to it</strong>
        </div>
        <p className="voice-setting-note">
          Sol runs inside your browser using Web Workers and WebAssembly, or uses the optional voice server on a laptop on the same network. No cloud services and no API keys. Designed for Mars missions where Earth is minutes away.
        </p>
        <div className="voice-edge-grid">
          <div className="voice-edge-item">
            <Zap size={14} aria-hidden="true" />
            <div>
              <strong>Listening:</strong> faster-whisper small.en on the voice server; Moonshine or Whisper tiny on the device.
            </div>
          </div>
          <div className="voice-edge-item">
            <Cpu size={14} aria-hidden="true" />
            <div>
              <strong>Speaking:</strong> Piper “lessac”, sentence by sentence, with the next sentence prepared while one plays.
            </div>
          </div>
          <div className="voice-edge-item">
            <ShieldCheck size={14} aria-hidden="true" />
            <div>
              <strong>Safety Guard:</strong> Deterministic dialogue verification; no hallucinated medical advice.
            </div>
          </div>
          <div className="voice-edge-item">
            <Zap size={14} aria-hidden="true" />
            <div>
              <strong>UI Control:</strong> Direct hands-free browser automation (scrolling, logging, 3D model navigation).
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
