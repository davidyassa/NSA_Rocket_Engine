import { Ear } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { heySolWanted, onHeySolChange, setHeySolWanted } from './solListener';
import { speak } from './voiceOutput';

export function VoiceSettings() {
  const heySol = useSyncExternalStore(onHeySolChange, heySolWanted);
  const [testNote, setTestNote] = useState('');
  const [testing, setTesting] = useState(false);
  const playback = useRef<AbortController | null>(null);
  useEffect(() => () => playback.current?.abort(), []);

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

      <p className="voice-setting-note">Sol uses a local neural voice. The web app caches it after first use. Answer text stays on this device.</p>
      <div className="voice-setting-test">
        <button type="button" className="button button-secondary" onClick={() => void test()}>{testing ? 'Stop test' : 'Test voice'}</button>
        {testNote && <span className="voice-setting-note" role="status">{testNote}</span>}
      </div>
    </section>
  );
}
