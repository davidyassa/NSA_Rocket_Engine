"""Re-record Sol's instant alert clips (public/vendor/piper/alerts) in the Piper voice.

    voice-server/.venv/bin/python voice-server/make_alerts.py
"""
import re
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import ROOT, SOL_SPEED, load_piper, trim_silence  # noqa: E402

# Must match the openings in src/features/assistant/urgentSpeech.ts.
source = (ROOT / "src/features/assistant/urgentSpeech.ts").read_text()
CLIPS = {
    "crew": re.search(r"URGENT_CREW = '([^']+)'", source)[1],
    "habitat": re.search(r"URGENT_HABITAT = '([^']+)'", source)[1],
    "crisis": re.search(r"URGENT_CRISIS = '([^']+)'", source)[1],
    "entry-range": "I can't assign that value.",
}

speak = load_piper()
out = ROOT / "public/vendor/piper/alerts"
out.mkdir(parents=True, exist_ok=True)
for name, text in CLIPS.items():
    samples, rate = speak(text.replace("’", "'"), SOL_SPEED)
    samples = trim_silence(samples, rate)
    with wave.open(str(out / f"{name}.wav"), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"{name}.wav  {len(samples) / rate:.1f} s  {text}")
