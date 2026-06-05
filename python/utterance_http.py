#!/usr/bin/env python3
"""
API HTTP énoncés + export bundle + flux SSE live (Tableau parlant).
Port par défaut : 5010
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import zipfile
from pathlib import Path
from typing import AsyncGenerator, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

import utterance_store as store

app = FastAPI(title="Poietic Utterances API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_live_subscribers: List[asyncio.Queue] = []
_loop: asyncio.AbstractEventLoop | None = None


def _on_store_append(record: dict) -> None:
    if _loop and record:
        asyncio.run_coroutine_threadsafe(_broadcast_live(record), _loop)


@app.on_event("startup")
async def startup():
    global _loop
    _loop = asyncio.get_event_loop()
    store.register_on_append(_on_store_append)


class UtteranceIn(BaseModel):
    source: str
    text: str
    session_id: str | None = None
    iteration: int = 0
    agentId: str | None = None
    position: list[int] | None = None
    lang: str | None = None
    ts: str | None = None


async def _broadcast_live(record: dict) -> None:
    if not record:
        return
    dead = []
    for q in _live_subscribers:
        try:
            q.put_nowait(record)
        except Exception:
            dead.append(q)
    for q in dead:
        if q in _live_subscribers:
            _live_subscribers.remove(q)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "utterance_http"}


@app.get("/api/utterances/sessions")
async def list_sessions():
    return {"sessions": store.list_session_ids()}


@app.get("/api/utterances/{session_id}")
async def get_utterances(session_id: str):
    return {"session_id": session_id, "utterances": store.list_utterances(session_id)}


@app.post("/api/utterances")
async def post_utterance(body: UtteranceIn):
    rec = store.append_utterance(
        source=body.source,
        text=body.text,
        session_id=body.session_id,
        iteration=body.iteration,
        agent_id=body.agentId,
        position=body.position,
        lang=body.lang,
        ts=body.ts,
    )
    if rec:
        await _broadcast_live(rec)
    return {"ok": True, "utterance": rec}


def _try_piper_wav(text: str, voice: str, lang: str) -> bytes | None:
    import urllib.request

    port = os.environ.get("PIPER_TTS_PORT", "5012")
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/tts",
            data=json.dumps({"text": text, "voice": voice, "lang": lang}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except Exception:
        return None


@app.get("/api/utterances/{session_id}/export")
async def export_bundle(session_id: str):
    utterances = store.list_utterances(session_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "session_id": session_id,
            "utterance_count": len(utterances),
            "utterances": utterances,
        }
        zf.writestr("utterances.json", json.dumps(manifest, ensure_ascii=False, indent=2))

        html = _bundle_index_html(session_id)
        zf.writestr("index.html", html)

        engine_src = Path(__file__).resolve().parent.parent / "public/js/tts/speech-engine.js"
        if engine_src.exists():
            zf.writestr("js/speech-engine.js", engine_src.read_text(encoding="utf-8"))

        prebake = os.environ.get("EXPORT_PREBAKE_TTS", "1") == "1"
        if prebake:
            for u in utterances:
                lang = u.get("lang") or "fr"
                voice = "fr_FR-siwis-medium" if lang == "fr" else "en_US-lessac-medium"
                if u.get("source") == "N":
                    voice = "fr_FR-upmc-medium" if lang == "fr" else "en_GB-alba-medium"
                wav = _try_piper_wav(u.get("text", ""), voice, lang)
                if wav:
                    zf.writestr(f"audio/{u['id']}.wav", wav)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="tableau-parlant-{session_id}.zip"'},
    )


def _bundle_index_html(session_id: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Tableau parlant — {session_id}</title>
  <style>
    body {{ font-family: system-ui; background:#0a0a0a; color:#e0e0e0; margin:0; }}
    .grid {{ display:grid; grid-template-columns:repeat(5,1fr); gap:4px; max-width:520px; margin:16px; }}
    .cell {{ aspect-ratio:1; background:#222; border:1px solid #444; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:10px; }}
    .cell:hover {{ background:#333; }}
    #log {{ margin:16px; max-height:40vh; overflow:auto; font-size:13px; }}
  </style>
</head>
<body>
  <h1>Tableau parlant</h1>
  <p>Survolez une cellule pour entendre le dernier énoncé W de cet agent.</p>
  <div class="grid" id="agent-grid"></div>
  <div id="log"></div>
  <script type="module">
    import {{ SpeechEngine }} from './js/speech-engine.js';
    const manifest = await fetch('utterances.json').then(r => r.json());
    const utterances = manifest.utterances || [];
    const engine = new SpeechEngine({{ backend: 'prebaked', prebakedBaseUrl: '.' }});
    engine.setMasterEnabled(true);
    engine.setSkipToLatest(false);
    const byPos = new Map();
    for (const u of utterances) {{
      if (u.source !== 'W') continue;
      const k = `${{u.position[0]}},${{u.position[1]}}`;
      if (!byPos.has(k)) byPos.set(k, u);
    }}
    const grid = document.getElementById('agent-grid');
    for (let y = 0; y < 5; y++) {{
      for (let x = 0; x < 5; x++) {{
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.textContent = `[${{x}},${{y}}]`;
        const u = byPos.get(`${{x}},${{y}}`);
        if (u) {{
          cell.title = u.text.slice(0, 120);
          cell.addEventListener('mouseenter', () => engine.speakNow({{
            text: u.text, source: 'W', lang: u.lang, position: u.position,
            utteranceId: u.id, agentId: u.agentId
          }}));
        }}
        grid.appendChild(cell);
      }}
    }}
    document.getElementById('log').textContent =
      utterances.filter(u => u.source === 'N' || u.source === 'O')
        .map(u => `[${{u.source}}] ${{u.text.slice(0, 200)}}...`).join('\\n\\n');
  </script>
</body>
</html>"""


@app.get("/api/utterances/live/stream")
async def live_stream():
    async def gen() -> AsyncGenerator[bytes, None]:
        q: asyncio.Queue = asyncio.Queue()
        _live_subscribers.append(q)
        try:
            yield b"data: {\"type\":\"connected\"}\n\n"
            while True:
                record = await q.get()
                payload = json.dumps({"type": "utterance", "data": record}, ensure_ascii=False)
                yield f"data: {payload}\n\n".encode()
        finally:
            if q in _live_subscribers:
                _live_subscribers.remove(q)

    return StreamingResponse(gen(), media_type="text/event-stream")


def run_server(port: int = 5010):
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info", access_log=False)


if __name__ == "__main__":
    run_server()
