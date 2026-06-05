#!/usr/bin/env python3
"""
Persistance des énoncés W/O/N en sidecar JSONL, liés au session_id du recorder Crystal.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
UTTERANCES_DIR = ROOT / "db" / "utterances"
EXPORTS_DIR = ROOT / "db" / "exports"

RECORDER_URL = os.environ.get("POIETIC_RECORDER_URL", "http://localhost:3001")
MAX_TEXT_LEN = int(os.environ.get("UTTERANCE_MAX_TEXT", "50000"))

_lock = threading.Lock()
_session_cache: Optional[str] = None
_session_cache_at: float = 0.0
_on_append_callbacks: list = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    UTTERANCES_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _sidecar_path(session_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_id)
    return UTTERANCES_DIR / f"{safe}.jsonl"


def fetch_current_session_id(force_refresh: bool = False) -> Optional[str]:
    global _session_cache, _session_cache_at
    import time

    now = time.time()
    if not force_refresh and _session_cache and (now - _session_cache_at) < 2.0:
        return _session_cache

    try:
        req = urllib.request.Request(
            f"{RECORDER_URL}/api/current-session",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode())
        sid = data.get("session_id") or data.get("id")
        if sid:
            _session_cache = str(sid)
            _session_cache_at = now
            return _session_cache
    except Exception:
        pass
    return _session_cache


def detect_lang(text: str) -> str:
    sample = (text or "")[:400].lower()
    fr = len(__import__("re").findall(r"\b(le|la|les|des|une|dans|pour|avec|est)\b", sample))
    en = len(__import__("re").findall(r"\b(the|and|with|for|agent|is|are)\b", sample))
    return "fr" if fr >= en else "en"


def append_utterance(
    *,
    source: str,
    text: str,
    session_id: Optional[str] = None,
    iteration: int = 0,
    agent_id: Optional[str] = None,
    position: Optional[List[int]] = None,
    lang: Optional[str] = None,
    ts: Optional[str] = None,
) -> Optional[dict]:
    """Ajoute une ligne JSONL. Retourne l'enregistrement ou None si texte vide."""
    text = (text or "").strip()
    if not text:
        return None
    if len(text) > MAX_TEXT_LEN:
        text = text[:MAX_TEXT_LEN]

    sid = session_id or fetch_current_session_id()
    if not sid:
        sid = f"orphan_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

    lang = lang or detect_lang(text)
    ts_val = ts or _now_iso()
    uid_src = f"{sid}|{ts_val}|{source}|{agent_id}|{iteration}|{text[:80]}"
    uid = hashlib.sha256(uid_src.encode()).hexdigest()[:16]

    record = {
        "id": uid,
        "ts": ts_val,
        "iteration": iteration,
        "source": source,
        "agentId": agent_id,
        "position": position or [0, 0],
        "lang": lang,
        "text": text,
        "session_id": sid,
    }

    _ensure_dirs()
    line = json.dumps(record, ensure_ascii=False) + "\n"
    with _lock:
        with open(_sidecar_path(sid), "a", encoding="utf-8") as f:
            f.write(line)
    for cb in list(_on_append_callbacks):
        try:
            cb(record)
        except Exception:
            pass
    return record


def register_on_append(callback) -> None:
    _on_append_callbacks.append(callback)


def list_utterances(session_id: str) -> List[dict]:
    path = _sidecar_path(session_id)
    if not path.exists():
        return []
    out: List[dict] = []
    with _lock:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    out.sort(key=lambda u: u.get("ts", ""))
    return out


def list_session_ids() -> List[str]:
    _ensure_dirs()
    ids = []
    for p in UTTERANCES_DIR.glob("*.jsonl"):
        ids.append(p.stem)
    return sorted(ids, reverse=True)


def extract_o_text(snapshot: dict) -> str:
    sa = snapshot.get("simplicity_assessment") or {}
    cd = sa.get("C_d_current") or {}
    return (cd.get("description") or "").strip()


def extract_n_text(snapshot: dict) -> str:
    nar = snapshot.get("narrative") or {}
    return (nar.get("summary") or "").strip()


def extract_w_text(agent_data: dict) -> str:
    parts = []
    for key in ("strategy", "rationale"):
        v = agent_data.get(key) or ""
        if v:
            parts.append(v)
    preds = agent_data.get("predictions") or {}
    for key in ("individual_after_prediction", "collective_after_prediction"):
        v = preds.get(key) or ""
        if v:
            parts.append(v)
    return "\n\n".join(parts).strip()


def record_o_from_snapshot(snapshot: dict, session_id: Optional[str] = None) -> Optional[dict]:
    text = extract_o_text(snapshot)
    if not text:
        return None
    return append_utterance(
        source="O",
        text=text,
        session_id=session_id,
        iteration=int(snapshot.get("version") or 0),
        lang=detect_lang(text),
        ts=snapshot.get("timestamp"),
    )


def record_n_from_snapshot(snapshot: dict, session_id: Optional[str] = None) -> Optional[dict]:
    text = extract_n_text(snapshot)
    if not text:
        return None
    return append_utterance(
        source="N",
        text=text,
        session_id=session_id,
        iteration=int(snapshot.get("version") or 0),
        lang=detect_lang(text),
        ts=snapshot.get("timestamp"),
    )


def record_w_from_agent(agent_data: dict, session_id: Optional[str] = None) -> Optional[dict]:
    text = extract_w_text(agent_data)
    if not text:
        return None
    return append_utterance(
        source="W",
        text=text,
        session_id=session_id,
        iteration=int(agent_data.get("iteration") or 0),
        agent_id=agent_data.get("id"),
        position=agent_data.get("position"),
        lang=detect_lang(text),
        ts=agent_data.get("timestamp"),
    )
