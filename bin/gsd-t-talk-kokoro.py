"""gsd-t-talk-kokoro.py — the local voice for `gsd-t talk`.

Reads one JSON request per line on stdin: {"id": n, "text": "..."}.
Writes one JSON reply per line on stdout: {"id": n, "wav": "/path.wav"} or
{"id": n, "error": "..."}. Runs under `uv run --with kokoro-onnx --with numpy`.

Model files download once into ~/.claude/gsd-t-voice/ (about 350 MB).
"""
import json, os, sys, tempfile, urllib.request, wave

import numpy as np
from kokoro_onnx import Kokoro

MODELS = os.path.expanduser("~/.claude/gsd-t-voice")
FILES = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def ensure(name):
    os.makedirs(MODELS, exist_ok=True)
    path = os.path.join(MODELS, name)
    if not os.path.exists(path):
        print("downloading voice model " + name + " (one time) ...", file=sys.stderr, flush=True)
        urllib.request.urlretrieve(FILES[name], path + ".part")
        os.replace(path + ".part", path)
    return path


def main():
    speaker = sys.argv[1]
    out_dir = tempfile.mkdtemp(prefix="gsd-t-talk-")
    kokoro = Kokoro(ensure("kokoro-v1.0.onnx"), ensure("voices-v1.0.bin"))
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        req = json.loads(line)
        try:
            samples, rate = kokoro.create(req["text"], voice=speaker, speed=1.0, lang="en-us")
            path = os.path.join(out_dir, str(req["id"]) + ".wav")
            with wave.open(path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes((np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes())
            print(json.dumps({"id": req["id"], "wav": path}), flush=True)
        except Exception as e:  # reported per sentence; talk shows it red
            print(json.dumps({"id": req["id"], "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
