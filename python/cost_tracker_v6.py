#!/usr/bin/env python3
"""Compteur de cout centralise pour la V6 (OpenRouter).

Agrege l'usage (tokens) et le cout (USD) de tous les appels LLM par
session / agent / modele. Alimente par le champ `usage` renvoye par
OpenRouter lorsque la requete inclut `usage: {include: true}` (le cout
reel est alors disponible dans `usage.cost`).

Sert a la fois :
- au panneau cout du front (GET /api/usage),
- au kill-switch budget (MAX_SESSION_USD).
"""
from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Optional


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class CostTracker:
    """Etat en memoire : session -> agent -> model -> compteurs."""

    def __init__(self) -> None:
        self._lock = Lock()
        # { session_id: { agent_id: { model: {calls, prompt_tokens, completion_tokens, cost_usd} } } }
        self._data: dict[str, dict[str, dict[str, dict]]] = {}
        self._started_at = datetime.now(timezone.utc)

    @staticmethod
    def _empty_counters() -> dict:
        return {
            "calls": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cost_usd": 0.0,
        }

    def record(
        self,
        session_id: Optional[str],
        agent_id: Optional[str],
        model: Optional[str],
        usage: Optional[dict],
    ) -> dict:
        """Enregistre l'usage d'un appel. Retourne les compteurs cumules de la cellule."""
        session_id = session_id or "default"
        agent_id = agent_id or "unknown"
        model = model or "unknown"
        usage = usage or {}

        prompt_tokens = _safe_int(usage.get("prompt_tokens"))
        completion_tokens = _safe_int(usage.get("completion_tokens"))
        total_tokens = _safe_int(usage.get("total_tokens"), prompt_tokens + completion_tokens)
        # OpenRouter renvoie le cout reel (USD) dans usage.cost quand usage.include=true.
        cost_usd = _safe_float(usage.get("cost"))

        with self._lock:
            cell = (
                self._data
                .setdefault(session_id, {})
                .setdefault(agent_id, {})
                .setdefault(model, self._empty_counters())
            )
            cell["calls"] += 1
            cell["prompt_tokens"] += prompt_tokens
            cell["completion_tokens"] += completion_tokens
            cell["total_tokens"] += total_tokens
            cell["cost_usd"] = round(cell["cost_usd"] + cost_usd, 6)
            return dict(cell)

    def session_cost(self, session_id: Optional[str]) -> float:
        session_id = session_id or "default"
        with self._lock:
            agents = self._data.get(session_id, {})
            return round(
                sum(
                    cell["cost_usd"]
                    for models in agents.values()
                    for cell in models.values()
                ),
                6,
            )

    def total_cost(self) -> float:
        with self._lock:
            return round(
                sum(
                    cell["cost_usd"]
                    for agents in self._data.values()
                    for models in agents.values()
                    for cell in models.values()
                ),
                6,
            )

    def is_over_budget(self, session_id: Optional[str], max_session_usd: float) -> bool:
        """True si la session depasse le plafond. max<=0 => pas de limite."""
        if not max_session_usd or max_session_usd <= 0:
            return False
        return self.session_cost(session_id) >= max_session_usd

    def snapshot(self, session_id: Optional[str] = None) -> dict:
        """Agregats pour le front. Si session_id fourni, restreint a cette session."""
        with self._lock:
            sessions = (
                {session_id: self._data.get(session_id or "default", {})}
                if session_id is not None
                else {sid: agents for sid, agents in self._data.items()}
            )

            out_sessions = {}
            grand_total = self._empty_counters()
            for sid, agents in sessions.items():
                session_total = self._empty_counters()
                by_model: dict[str, dict] = {}
                out_agents = {}
                for aid, models in agents.items():
                    agent_total = self._empty_counters()
                    for model, cell in models.items():
                        for k in agent_total:
                            agent_total[k] += cell[k]
                        bm = by_model.setdefault(model, self._empty_counters())
                        for k in bm:
                            bm[k] += cell[k]
                    out_agents[aid] = {
                        "by_model": {m: dict(c) for m, c in models.items()},
                        "total": agent_total,
                    }
                    for k in session_total:
                        session_total[k] += agent_total[k]
                out_sessions[sid] = {
                    "agents": out_agents,
                    "by_model": by_model,
                    "total": session_total,
                }
                for k in grand_total:
                    grand_total[k] += session_total[k]

            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "started_at": self._started_at.isoformat(),
                "sessions": out_sessions,
                "grand_total": grand_total,
            }

    def reset(self, session_id: Optional[str] = None) -> None:
        with self._lock:
            if session_id is None:
                self._data.clear()
            else:
                self._data.pop(session_id, None)


# Instance globale partagee par le serveur V6
cost_tracker = CostTracker()
