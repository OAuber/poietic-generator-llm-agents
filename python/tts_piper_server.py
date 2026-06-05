#!/usr/bin/env python3
"""
Microservice TTS Piper (local, CPU).
POST /tts {text, voice, lang} -> audio/wav

Si Piper n'est pas installé, renvoie un WAV silencieux minimal (fallback dev).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "db" / "tts_cache"
VOICES_DIR = Path(os.environ.get("PIPER_VOICES_DIR", str(ROOT / "voices")))

VOICE_CATALOG = {
    "fr_FR-siwis-medium": "fr",
    "fr_FR-upmc-medium": "fr",
    "en_US-lessac-medium": "en",
    "en_GB-alba-medium": "en",
}

app = FastAPI(title="Piper TTS", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TtsRequest(BaseModel):
    text: str
    voice: str = "fr_FR-siwis-medium"
    lang: str = "fr"


def _cache_key(text: str, voice: str) -> str:
    h = hashlib.sha256(f"{voice}|{text}".encode()).hexdigest()
    return h


def _silent_wav(duration_sec: float = 0.3, sample_rate: int = 22050) -> bytes:
    """WAV PCM 16-bit mono minimal."""
    import struct

    n_samples = int(sample_rate * duration_sec)
    data_size = n_samples * 2
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        data_size,
    )
    return header + (b"\x00" * data_size)


def _find_piper() -> str | None:
    for name in ("piper", "piper-tts"):
        p = shutil.which(name)
        if p:
            return p
    return None


def _voice_model_path(voice: str) -> Path | None:
    for ext in (".onnx", ""):
        p = VOICES_DIR / f"{voice}{ext}"
        if p.exists():
            return p
    p = VOICES_DIR / voice / f"{voice}.onnx"
    if p.exists():
        return p
    return None


def synthesize_piper(text: str, voice: str) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _cache_key(text, voice)
    cached = CACHE_DIR / f"{key}.wav"
    if cached.exists():
        return cached.read_bytes()

    piper_bin = _find_piper()
    model = _voice_model_path(voice)
    if not piper_bin or not model:
        wav = _silent_wav(min(0.5 + len(text) * 0.002, 30))
        cached.write_bytes(wav)
        return wav

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = tmp.name
    try:
        cmd = [
            piper_bin,
            "--model",
            str(model),
            "--output_file",
            out_path,
        ]
        proc = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode()[:500])
        data = Path(out_path).read_bytes()
        cached.write_bytes(data)
        return data
    finally:
        Path(out_path).unlink(missing_ok=True)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "piper": _find_piper() is not None,
        "voices_dir": str(VOICES_DIR),
        "catalog": list(VOICE_CATALOG.keys()),
    }


@app.get("/voices")
async def voices():
    return {"voices": list(VOICE_CATALOG.keys())}


@app.post("/tts")
async def tts(req: TtsRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    if len(text) > 10000:
        text = text[:10000]
    voice = req.voice if req.voice in VOICE_CATALOG else "fr_FR-siwis-medium"
    try:
        wav = synthesize_piper(text, voice)
    except Exception as e:
        raise HTTPException(500, str(e)) from e
    return Response(content=wav, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PIPER_TTS_PORT", "5012"))
    print(f"Piper TTS on http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
