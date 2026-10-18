#!/usr/bin/env bash
# Voice track with Piper (open-source TTS). Runs inside python:3.11-slim. Writes out/voice/<id>.wav and out/durations.json.
set -euo pipefail
cd /work
pip install -q piper-tts==1.2.0 2>/dev/null || pip install -q piper-tts
mkdir -p out/voice out/models
V=en_US-lessac-high
if [ ! -f out/models/$V.onnx ]; then
  B=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high
  python - <<PY
import urllib.request
for ext in ["onnx", "onnx.json"]:
    urllib.request.urlretrieve("$B/$V." + ext, "out/models/$V." + ext)
PY
fi
python - <<'PY'
import json, subprocess, wave
scenes = json.load(open("scenes.json"))
d = {}
for s in scenes:
    out = f"out/voice/{s['id']}.wav"
    subprocess.run(["python", "-m", "piper", "-m", "out/models/en_US-lessac-high.onnx", "-f", out,
                    "--length_scale", "1.07", "--sentence_silence", "0.35", "--noise_scale", "0.6", "--noise_w", "0.75"],
                   input=s["text"].encode(), check=True, capture_output=True)
    with wave.open(out) as w:
        d[s["id"]] = round(w.getnframes() / w.getframerate(), 3)
    print(s["id"], d[s["id"]])
json.dump(d, open("out/durations.json", "w"), indent=1)
print("total", round(sum(d.values()), 1))
PY
