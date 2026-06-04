#!/usr/bin/env python3
"""Poietic AI Server V4or - variante de V4, provider-agnostique via OpenRouter.

Scope B : agents W (vision, cote navigateur) + machine O d'observation
(cote serveur), tous deux routes par OpenRouter avec une cle serveur.

Points cles :
- Proxy unique POST /api/llm/openrouter (format OpenAI, vision via image_url).
- Cle serveur (OPENROUTER_API_KEY) ; base_url configurable (couture local, non
  utilisee par defaut).
- Compteur de cout centralise (cost_tracker_v4or) + kill-switch MAX_SESSION_USD.
- Machine O periodique via OpenRouter, isolee dans run_analysis_pipeline()
  pour brancher la machine N plus tard (evolution vers C, flag ENABLE_N).

Port : 8006.
"""
from __future__ import annotations

from fastapi import FastAPI, Body, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
import os
import re
import json
import httpx

from cost_tracker_v4or import cost_tracker

# ==============================================================================
# CONFIG (env)
# ==============================================================================

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
# base_url configurable : couture pour pointer vers un endpoint local compatible
# OpenAI (Ollama) plus tard. Defaut : OpenRouter (V4or = 100% cloud).
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
CHAT_COMPLETIONS_URL = f"{OPENROUTER_BASE_URL}/chat/completions"

O_MODEL = os.getenv("O_MODEL", "google/gemini-3.5-flash")
DEFAULT_W_MAX_TOKENS = int(os.getenv("W_MAX_TOKENS", "2000"))
DEFAULT_O_MAX_TOKENS = int(os.getenv("O_MAX_TOKENS", "2000"))
DEFAULT_REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")  # maitrise des couts
MAX_SESSION_USD = float(os.getenv("MAX_SESSION_USD", "0") or "0")  # 0 => pas de limite
ENABLE_N = os.getenv("ENABLE_N", "false").lower() in ("1", "true", "yes")

# En-tetes d'attribution recommandes par OpenRouter
APP_URL = os.getenv("APP_URL", "http://localhost:3001")
APP_TITLE = os.getenv("APP_TITLE", "Poietic Generator V4or")

O_CADENCE_SECONDS = int(os.getenv("O_CADENCE_SECONDS", "25"))
# Session du banc : doit correspondre au ?session= du front (defaut "poietic-v4or").
# La machine O (serveur) enregistre son cout sous cette session pour que le
# panneau "Session cost" reflete le cout reel (W agents + O).
BENCH_SESSION_ID = os.getenv("SESSION_ID", "poietic-v4or")

# ==============================================================================
# STORE O (repris de V4, simplifie)
# ==============================================================================

class OSnapshotStore:
    def __init__(self):
        self.latest: Optional[dict] = None
        self.version: int = 0
        self.latest_image_base64: Optional[str] = None
        self.agents_count: int = 0
        self.last_update_time: Optional[datetime] = None
        self.first_update_time: Optional[datetime] = None
        self.updates_count: int = 0

    def set_snapshot(self, snapshot: dict):
        self.version += 1
        snapshot["version"] = self.version
        snapshot["timestamp"] = datetime.now(timezone.utc).isoformat()
        self.latest = snapshot

    def set_image(self, image_base64: str):
        self.latest_image_base64 = image_base64
        self.last_update_time = datetime.now(timezone.utc)
        if self.first_update_time is None:
            self.first_update_time = self.last_update_time
        self.updates_count += 1

    def set_agents_count(self, n: int):
        try:
            self.agents_count = max(0, int(n))
        except Exception:
            self.agents_count = 0
        self.last_update_time = datetime.now(timezone.utc)
        if self.first_update_time is None:
            self.first_update_time = self.last_update_time
        self.updates_count += 1

    def is_stale(self, timeout_seconds: int = 30) -> bool:
        if self.last_update_time is None:
            return True
        delta = (datetime.now(timezone.utc) - self.last_update_time).total_seconds()
        return delta > timeout_seconds


store = OSnapshotStore()

# Store W (inerte par defaut, alimente seulement si ENABLE_N) - couture vers C
w_agents_data: dict[str, dict] = {}

# ==============================================================================
# CHARGEMENT PROMPT O
# ==============================================================================

O_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "prompts", "v4or-observation.json")
_o_prompt_template: Optional[str] = None


def load_o_prompt() -> str:
    global _o_prompt_template
    if _o_prompt_template is None:
        try:
            with open(O_PROMPT_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            system_lines = data.get("system", [])
            if not isinstance(system_lines, list):
                system_lines = []
            _o_prompt_template = "\n".join(system_lines) if system_lines else "You are an O-machine."
        except Exception as e:
            print(f"[O] Erreur chargement prompt: {e}")
            _o_prompt_template = "You are an O-machine. Analyze the image and return JSON."
    return _o_prompt_template

# ==============================================================================
# PARSING JSON ROBUSTE
# ==============================================================================

def parse_json_robust(text: str, prefix: str = "") -> Optional[dict]:
    if not text:
        return None
    original = text
    try:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        first = text.find("{")
        last = text.rfind("}")
        if first != -1 and last > first:
            slice_ = text[first:last + 1]
            slice_ = re.sub(r",(\s*[}\]])", r"\1", slice_)
            slice_ = re.sub(r"([{\[])\s*,", r"\1", slice_)
            try:
                parsed = json.loads(slice_)
                print(f"{prefix} JSON repare")
                return parsed
            except json.JSONDecodeError as e:
                print(f"{prefix} Echec parsing: {e}")
    except Exception as e:
        print(f"{prefix} Erreur parsing JSON: {e}")
        print(f"{prefix} Texte: {original[:600]}")
    return None

# ==============================================================================
# APPEL OPENROUTER (coeur partage W + O)
# ==============================================================================

def _openrouter_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": APP_URL,
        "X-Title": APP_TITLE,
    }


async def call_openrouter(
    messages: list,
    model: str,
    max_tokens: int,
    reasoning: Optional[dict] = None,
    session_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    temperature: float = 0.8,
    timeout_s: float = 180.0,
) -> tuple[Optional[dict], int, Optional[str]]:
    """Appelle OpenRouter (chat/completions). Retourne (json, status, error).

    Enregistre l'usage/cout dans le cost_tracker (usage.include => usage.cost).
    """
    if not OPENROUTER_API_KEY:
        return None, 500, "OPENROUTER_API_KEY non definie"

    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        # Cout reel renvoye dans usage.cost
        "usage": {"include": True},
    }
    # Bridage du raisonnement (maitrise des couts)
    if reasoning is None:
        reasoning = {"effort": DEFAULT_REASONING_EFFORT}
    if reasoning:
        body["reasoning"] = reasoning

    try:
        timeout_obj = httpx.Timeout(timeout_s, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(CHAT_COMPLETIONS_URL, headers=_openrouter_headers(), json=body)
    except Exception as e:
        return None, 502, f"Erreur reseau OpenRouter: {e}"

    try:
        data = resp.json()
    except Exception:
        return None, resp.status_code, (resp.text or "Reponse non-JSON")[:500]

    if resp.status_code >= 400:
        err = ""
        if isinstance(data, dict):
            err = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else data.get("error")
        return data, resp.status_code, err or f"HTTP {resp.status_code}"

    # Enregistrer l'usage/cout
    usage = data.get("usage") if isinstance(data, dict) else None
    cost_tracker.record(session_id, agent_id, model, usage)
    return data, resp.status_code, None


def extract_text(data: dict) -> str:
    """Extrait le texte de contenu d'une reponse OpenAI/OpenRouter."""
    try:
        choices = data.get("choices") or []
        if not choices:
            return ""
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content
        # content peut etre une liste de parties
        if isinstance(content, list):
            return "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
    except Exception:
        pass
    return ""

# ==============================================================================
# MACHINE O (via OpenRouter)
# ==============================================================================

async def call_openrouter_o(image_base64: str, agents_count: int) -> Optional[dict]:
    prompt = load_o_prompt().replace("{{agents_count}}", str(agents_count))

    clean = image_base64 or ""
    if clean.startswith("data:image"):
        data_url = clean
    else:
        data_url = f"data:image/png;base64,{clean}"

    content = [{"type": "text", "text": prompt}]
    if clean:
        content.append({"type": "image_url", "image_url": {"url": data_url}})

    messages = [{"role": "user", "content": content}]

    data, status, err = await call_openrouter(
        messages=messages,
        model=O_MODEL,
        max_tokens=DEFAULT_O_MAX_TOKENS,
        session_id=BENCH_SESSION_ID,
        agent_id="O-machine",
        temperature=0.7,
    )
    if err or not data:
        print(f"[O] Erreur OpenRouter ({status}): {err}")
        return None

    text = extract_text(data)
    if not text or len(text.strip()) < 10:
        print(f"[O] Reponse O vide/trop courte")
        return None

    return parse_json_robust(text, "[O]")


def normalize_o_snapshot(result: dict) -> dict:
    snapshot = {
        "structures": result.get("structures", []),
        "narrative": result.get("narrative", {"summary": ""}),
        "simplicity_assessment": result.get("simplicity_assessment", {
            "C_w_current": {"value": 0},
            "C_d_current": {"value": 0},
            "U_current": {"value": 0},
        }),
        "agents_count": store.agents_count,
    }
    if "reasoning" not in snapshot["simplicity_assessment"]:
        snapshot["simplicity_assessment"]["reasoning"] = "No reasoning provided"
    return snapshot


async def run_analysis_pipeline() -> None:
    """Pipeline d'analyse : O (puis N plus tard si ENABLE_N).

    Isole pour permettre l'evolution vers C sans refonte : il suffira
    d'ajouter un appel call_openrouter_n() et de combiner O+N ici.
    """
    o_raw = None
    for attempt in range(2):
        o_raw = await call_openrouter_o(store.latest_image_base64, store.agents_count)
        if o_raw:
            break
        if attempt < 1:
            await asyncio.sleep(2)

    if not o_raw:
        if store.latest:
            print("[O] Echec O, conservation snapshot precedent")
        else:
            store.set_snapshot(normalize_o_snapshot({}))
        return

    o_snapshot = normalize_o_snapshot(o_raw)

    # --- Couture machine N (evolution vers C) -------------------------------
    if ENABLE_N:
        # TODO(C): appeler call_openrouter_n(o_snapshot, w_agents_data) puis
        # combiner C_w (N) + C_d (O) -> U, prediction_errors, narrative.
        pass

    store.set_snapshot(o_snapshot)
    s = o_snapshot["simplicity_assessment"]
    print(
        f"[O] Snapshot v{store.version} : {len(o_snapshot['structures'])} structures, "
        f"U={s.get('U_current', {}).get('value', 'N/A')}"
    )


async def periodic_o_task():
    while True:
        await asyncio.sleep(O_CADENCE_SECONDS)
        if not store.latest_image_base64:
            continue
        if store.is_stale(timeout_seconds=30) and store.agents_count > 0:
            print("[O] Timeout (>30s) : agents consideres deconnectes")
            store.set_agents_count(0)
        if store.agents_count == 0:
            continue
        now = datetime.now(timezone.utc)
        if (store.updates_count or 0) < 2 or (
            store.first_update_time and (now - store.first_update_time).total_seconds() < 5
        ):
            continue
        if store.last_update_time and (now - store.last_update_time).total_seconds() < 3.0:
            continue
        print(f"[O] Analyse OpenRouter ({store.agents_count} agents, modele {O_MODEL})...")
        try:
            await run_analysis_pipeline()
        except Exception as e:
            print(f"[O] Erreur pipeline: {e}")

# ==============================================================================
# FASTAPI
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not OPENROUTER_API_KEY:
        print("[V4or] ATTENTION : OPENROUTER_API_KEY non definie. Les appels LLM echoueront.")
    print(f"[V4or] base_url={OPENROUTER_BASE_URL} | O_MODEL={O_MODEL} | ENABLE_N={ENABLE_N} | MAX_SESSION_USD={MAX_SESSION_USD}")
    asyncio.create_task(periodic_o_task())
    yield


app = FastAPI(title="Poietic AI Server V4or", version="4.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "service": "Poietic AI Server V4or",
        "provider": OPENROUTER_BASE_URL,
        "o_model": O_MODEL,
        "enable_n": ENABLE_N,
        "endpoints": [
            "POST /api/llm/openrouter",
            "GET /api/usage",
            "GET /api/usage/openrouter",
            "POST /api/usage/reset",
            "GET /o/latest",
            "POST /o/image",
            "GET /o/image",
            "POST /o/agents",
            "POST /o/analyze",
            "POST /v4or/w-data",
        ],
    }


@app.post("/api/llm/openrouter")
async def proxy_openrouter(request: Request):
    """Proxy vers OpenRouter (format OpenAI). Cle serveur, cout enregistre."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "JSON invalide"})

    messages = body.get("messages")
    if not messages:
        return JSONResponse(status_code=400, content={"error": "messages manquants"})

    model = body.get("model") or O_MODEL
    max_tokens = int(body.get("max_tokens") or DEFAULT_W_MAX_TOKENS)
    reasoning = body.get("reasoning")  # None => defaut (effort low)
    session_id = body.get("session_id")
    agent_id = body.get("agent_id")
    temperature = float(body.get("temperature", 0.8))

    # Kill-switch budget (avant l'appel)
    if cost_tracker.is_over_budget(session_id, MAX_SESSION_USD):
        return JSONResponse(
            status_code=402,
            content={
                "error": "budget_exceeded",
                "message": f"Plafond de session atteint (MAX_SESSION_USD={MAX_SESSION_USD}).",
                "session_cost_usd": cost_tracker.session_cost(session_id),
            },
        )

    data, status, err = await call_openrouter(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        reasoning=reasoning,
        session_id=session_id,
        agent_id=agent_id,
        temperature=temperature,
    )

    if err and not data:
        return JSONResponse(status_code=status, content={"error": err})

    # Renvoyer la reponse OpenRouter telle quelle (compatible OpenAI) + cout session
    if isinstance(data, dict):
        data["_session_cost_usd"] = cost_tracker.session_cost(session_id)
    return JSONResponse(status_code=status, content=data)


@app.get("/api/usage")
async def get_usage(session_id: Optional[str] = Query(None)):
    return cost_tracker.snapshot(session_id)


@app.get("/api/usage/openrouter")
async def get_openrouter_usage():
    """Consommation officielle du compte OpenRouter (autoritative, cumulee).

    Interroge {base_url}/credits. Permet de reconcilier avec le dashboard.
    Renvoie total_credits, total_usage (USD) et remaining.
    """
    if not OPENROUTER_API_KEY:
        return JSONResponse(status_code=400, content={"error": "OPENROUTER_API_KEY non definie"})
    url = f"{OPENROUTER_BASE_URL}/credits"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.get(url, headers=_openrouter_headers())
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"Erreur reseau credits: {e}"})

    if resp.status_code >= 400:
        return JSONResponse(
            status_code=resp.status_code,
            content={"error": f"HTTP {resp.status_code}", "detail": (resp.text or "")[:300]},
        )

    try:
        payload = resp.json()
    except Exception:
        return JSONResponse(status_code=502, content={"error": "Reponse credits non-JSON"})

    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    total_credits = data.get("total_credits")
    total_usage = data.get("total_usage")
    remaining = None
    try:
        if total_credits is not None and total_usage is not None:
            remaining = round(float(total_credits) - float(total_usage), 6)
    except (TypeError, ValueError):
        remaining = None

    return {
        "total_credits": total_credits,
        "total_usage": total_usage,
        "remaining": remaining,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/usage/reset")
async def reset_usage(payload: dict = Body(default={})):
    cost_tracker.reset(payload.get("session_id"))
    return {"ok": True}


@app.get("/o/latest")
async def get_latest_o(agent_id: Optional[str] = Query(None)):
    return store.latest or {
        "version": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "structures": [],
        "narrative": {"summary": ""},
        "simplicity_assessment": {
            "C_w_current": {"value": 0},
            "C_d_current": {"value": 0},
            "U_current": {"value": 0},
        },
        "_pending": True,
    }


@app.post("/o/image")
async def post_o_image(payload: dict = Body(...)):
    img = payload.get("image_base64") or ""
    agents = payload.get("agents_count")
    if img.startswith("data:image/png;base64,"):
        img = img.replace("data:image/png;base64,", "")
    valid_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
    if not img or any(c not in valid_chars for c in img):
        return {"ok": False, "error": "invalid_base64"}
    store.set_image(img)
    if agents is not None:
        store.set_agents_count(agents)
    return {"ok": True, "timestamp": datetime.now(timezone.utc).isoformat(), "agents_count": store.agents_count}


@app.get("/o/image")
async def get_o_image():
    return {"image_base64": store.latest_image_base64, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/o/agents")
async def post_o_agents(payload: dict = Body(...)):
    n = payload.get("count")
    if n is None:
        return {"ok": False, "error": "missing_count"}
    store.set_agents_count(n)
    return {"ok": True, "agents_count": store.agents_count}


@app.post("/o/analyze")
async def trigger_o_analysis():
    """Declenche manuellement une analyse O (tests)."""
    if not store.latest_image_base64:
        return {"ok": False, "error": "no_image"}
    if store.agents_count == 0:
        return {"ok": False, "error": "no_agents"}
    await run_analysis_pipeline()
    return {"ok": True, "snapshot": store.latest, "version": store.version}


@app.post("/v4or/w-data")
async def receive_w_data(payload: dict = Body(...)):
    """Recoit les donnees W (strategy/predictions). Inerte sauf si ENABLE_N.

    Couture pour l'evolution vers C : la machine N les consommera.
    """
    agent_id = payload.get("agent_id")
    if not agent_id:
        return {"ok": False, "error": "missing_agent_id"}
    if ENABLE_N:
        w_agents_data[agent_id] = {**payload, "received_at": datetime.now(timezone.utc).isoformat()}
    return {"ok": True, "agent_id": agent_id, "enable_n": ENABLE_N}


if __name__ == "__main__":
    import uvicorn
    print("Demarrage Poietic AI Server V4or (variante de V4, OpenRouter)...")
    print("  Proxy LLM : http://localhost:8006/api/llm/openrouter")
    print("  Usage     : http://localhost:8006/api/usage")
    print("  Docs      : http://localhost:8006/docs")
    uvicorn.run(app, host="0.0.0.0", port=8006, log_level="info", access_log=False)
