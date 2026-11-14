"""
Sol voice server: fast listening (faster-whisper) and speaking (Piper, or Kokoro) for Sol Check.

Runs on a laptop next to the app. The app sends it short phrases of audio and
reply text over the local network; nothing goes to the internet. When this server
is not running, the app falls back to its on-device models, so Sol still works.

    voice-server/.venv/bin/python voice-server/server.py            # small.en, port 8765
    voice-server/.venv/bin/python voice-server/server.py --model base.en   # faster, a little less accurate
    voice-server/.venv/bin/python voice-server/server.py --voice kokoro    # the older, softer voice

Endpoints (the Vite dev/preview server proxies them at /sol-voice/):
    GET  /health  -> {"ok": true, "stt": "...", "tts": "piper"}
    POST /stt     body: 16 kHz mono 16-bit PCM            -> {"text": "...", "ms": 123}
    POST /tts     body: {"text": "...", "speed": 1.25}    -> mono 16-bit PCM (X-Sample-Rate header)
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
KOKORO_DIR = ROOT / "public/vendor/kokoro/onnx-community/Kokoro-82M-v1.0-ONNX"
PIPER_VOICE = ROOT / "public/vendor/piper/en_US-lessac-medium"
SOL_SPEED = 1.25
# Steadier than the voice's defaults (0.667 / 0.8): fewer misheard words (same as the app).
PIPER_NOISE_SCALE, PIPER_NOISE_W = 0.5, 0.6
CACHE = Path(__file__).resolve().parent / ".cache"

STT_RATE = 16_000
MAX_STT_BYTES = 2 * 60 * STT_RATE  # 60 s of 16-bit audio
MAX_TTS_CHARS = 1200
# Words Sol must hear right: the wake phrase, the app's terms, emergency words.
PROMPT = ("Hey Sol. Sol Check, crew medical officer, CO2, HRV, SANS, EVA, airlock, storm shelter, "
          "not breathing, bleeding, chest pain, fire, smoke, pressure leak, ammonia.")

log = logging.getLogger("sol-voice")


def load_whisper(name: str, device: str):
    from faster_whisper import WhisperModel

    attempts = [("mps", "default"), ("cpu", "int8")] if device == "auto" else [(device, "int8" if device == "cpu" else "default")]
    last: Exception | None = None
    for dev, compute in attempts:
        try:
            try:  # use the downloaded copy without asking the internet; download only the first time
                model = WhisperModel(name, device=dev, compute_type=compute, cpu_threads=8, local_files_only=True)
            except Exception:  # noqa: BLE001
                log.info("downloading faster-whisper %s (one time)", name)
                model = WhisperModel(name, device=dev, compute_type=compute, cpu_threads=8)
            silent = np.zeros(STT_RATE, dtype=np.float32)
            list(model.transcribe(silent, language="en", beam_size=1)[0])  # warm up
            log.info("listening: faster-whisper %s on %s (%s)", name, dev, compute)
            return model
        except Exception as error:  # noqa: BLE001 - try the next device
            last = error
            log.warning("faster-whisper on %s failed: %s", dev, error)
    raise RuntimeError(f"faster-whisper could not start: {last}")


def load_piper():
    """Piper "lessac": the same voice file the app bundles, ~40x faster than real time on a laptop CPU."""
    import espeakng_loader
    import onnxruntime as ort
    from phonemizer.backend import EspeakBackend
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
    phonemizer = EspeakBackend("en-us", preserve_punctuation=True, with_stress=True)
    config = json.loads(Path(f"{PIPER_VOICE}.onnx.json").read_text())
    ids_for, rate = config["phoneme_id_map"], config["audio"]["sample_rate"]
    inference = config["inference"]
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(f"{PIPER_VOICE}.onnx", options, providers=["CPUExecutionProvider"])

    def speak(text: str, speed: float) -> tuple[np.ndarray, int]:
        phonemes = phonemizer.phonemize([text], strip=True)[0]
        ids = list(ids_for["^"])
        for symbol in phonemes:  # each phoneme, then the pad
            if symbol in ids_for:
                ids += ids_for[symbol] + ids_for["_"]
        ids += ids_for["$"]
        audio = session.run(None, {
            "input": np.array([ids], dtype=np.int64),
            "input_lengths": np.array([len(ids)], dtype=np.int64),
            "scales": np.array([PIPER_NOISE_SCALE, inference["length_scale"] / speed, PIPER_NOISE_W], dtype=np.float32),
        })[0].squeeze().astype(np.float32)
        return audio, rate

    speak("Ready.", 1.0)  # warm up
    log.info("speaking: Piper lessac")
    return speak


def load_kokoro():
    from kokoro_onnx import Kokoro

    # Use the exact voice the app ships with, so Sol sounds the same either way.
    CACHE.mkdir(exist_ok=True)
    voices = CACHE / "voices.npz"
    style = np.fromfile(KOKORO_DIR / "voices/af_heart.bin", dtype=np.float32).reshape(-1, 1, 256)
    np.savez(voices, af_heart=style)
    kokoro = Kokoro(str(KOKORO_DIR / "onnx/model_quantized.onnx"), str(voices))
    kokoro.create("Ready.", voice="af_heart", speed=1.0, lang="en-us")  # warm up
    log.info("speaking: Kokoro 82M (af_heart)")

    def speak(text: str, speed: float) -> tuple[np.ndarray, int]:
        return kokoro.create(text, voice="af_heart", speed=speed, lang="en-us")

    return speak


def trim_silence(samples: np.ndarray, rate: int) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) >= 0.004)
    if not loud.size:
        return samples
    return samples[max(0, loud[0] - int(rate * 0.02)): min(len(samples), loud[-1] + int(rate * 0.09))]


class Voice:
    """
    Each model lives on its own long-running thread: one request at a time per model,
    listening and speaking side by side. (The HTTP server starts a new thread per
    request, and the first model call on a fresh thread is 3-5x slower.)
    """

    def __init__(self, model: str, device: str, voice: str):
        self.model = model
        self.voice = voice
        self.stt = ThreadPoolExecutor(1, thread_name_prefix="stt")
        self.tts = ThreadPoolExecutor(1, thread_name_prefix="tts")
        self.whisper = self.stt.submit(load_whisper, model, device).result()
        self.say = self.tts.submit(load_piper if voice == "piper" else load_kokoro).result()

    def _transcribe(self, audio: np.ndarray) -> str:
        segments, _ = self.whisper.transcribe(
            audio, language="en", beam_size=1, without_timestamps=True,
            condition_on_previous_text=False, initial_prompt=PROMPT, vad_filter=False,
        )
        # Drop what Whisper "hears" in silence or noise.
        kept = [s.text.strip() for s in segments if not (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0)]
        return " ".join(t for t in kept if t).strip()

    def _speak(self, text: str, speed: float) -> tuple[np.ndarray, int]:
        samples, rate = self.say(text, speed)
        return trim_silence(samples, rate), rate

    def transcribe(self, audio: np.ndarray) -> str:
        return self.stt.submit(self._transcribe, audio).result()

    def speak(self, text: str, speed: float) -> tuple[np.ndarray, int]:
        # Pronounce the name like "soul", as the app does.
        text = re.sub(r"\bSol\b", "soul", text, flags=re.IGNORECASE).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
        return self.tts.submit(self._speak, text, speed).result()


def handler_for(voice: Voice):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # quieter than the default access log
            log.debug(fmt, *args)

        def cors(self):
            # The native app (capacitor://localhost) calls the server directly.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def reply(self, status: int, body: bytes, kind: str, extra: dict[str, str] | None = None):
            self.send_response(status)
            self.cors()
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def json(self, status: int, data: dict):
            self.reply(status, json.dumps(data).encode(), "application/json")

        def body(self, limit: int) -> bytes | None:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > limit:
                self.json(413 if length > limit else 400, {"error": "bad body size"})
                return None
            return self.rfile.read(length)

        def do_OPTIONS(self):
            self.reply(204, b"", "text/plain")

        def do_GET(self):
            if self.path.rstrip("/") in ("/health", ""):
                self.json(200, {"ok": True, "stt": f"faster-whisper {voice.model}", "tts": voice.voice})
            else:
                self.json(404, {"error": "not found"})

        def do_POST(self):
            started = time.perf_counter()
            try:
                if self.path == "/stt":
                    raw = self.body(MAX_STT_BYTES)
                    if raw is None:
                        return
                    audio = np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2").astype(np.float32) / 32768
                    text = voice.transcribe(audio)
                    ms = round((time.perf_counter() - started) * 1000)
                    log.info("heard in %d ms: %r", ms, text)
                    self.json(200, {"text": text, "ms": ms})
                elif self.path == "/tts":
                    raw = self.body(16_384)
                    if raw is None:
                        return
                    request = json.loads(raw)
                    text = str(request.get("text", "")).strip()[:MAX_TTS_CHARS]
                    speed = min(2.0, max(0.5, float(request.get("speed", SOL_SPEED))))
                    if not text:
                        self.json(400, {"error": "no text"})
                        return
                    samples, rate = voice.speak(text, speed)
                    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
                    log.info("spoke %.1f s of audio in %d ms", len(samples) / rate, round((time.perf_counter() - started) * 1000))
                    self.reply(200, pcm, "application/octet-stream", {"X-Sample-Rate": str(rate)})
                else:
                    self.json(404, {"error": "not found"})
            except Exception as error:  # noqa: BLE001 - report, keep serving
                log.exception("request failed")
                self.json(500, {"error": str(error)})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="small.en", help="faster-whisper model: tiny.en, base.en, small.en (default), medium.en")
    parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu", "cuda"], help="auto: Apple GPU, then CPU")
    parser.add_argument("--voice", default="piper", choices=["piper", "kokoro"], help="piper: fastest (default); kokoro: softer, slower")
    parser.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 only if the native phone app must reach this laptop directly")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s sol-voice %(message)s", datefmt="%H:%M:%S")
    for noisy in ("httpx", "faster_whisper", "phonemizer", "kokoro_onnx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    voice = Voice(args.model, args.device, args.voice)
    server = ThreadingHTTPServer((args.host, args.port), handler_for(voice))
    log.info("ready on http://%s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
