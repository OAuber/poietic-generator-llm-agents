#!/usr/bin/env python3
"""
Serveur de métriques Simplicity Theory pour Poietic Generator V5 (Architecture O-N-W)
Port 5005 - WebSocket indépendant
Agrège les évaluations O (C_d), N (C_w, erreurs prédiction), W (actions)

V5.1: Ajout SessionRecorder pour collecte complète et export de sessions
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid
import copy

app = FastAPI(title="Poietic Metrics Server V5", version="5.1.0")


# ==============================================================================
# SESSION RECORDER - Collecte complète des données de session
# ==============================================================================

class SessionRecorder:
    """
    Enregistre tous les événements d'une session pour export et replay.
    
    Collecte pour chaque itération et chaque agent:
    - timestamp, version (itération globale)
    - agent_id, position, type (ai/human)
    - C_w, C_d, U (valeurs globales O+N)
    - delta_C_w, delta_C_d, U_expected (deltas W - IA uniquement)
    - prediction_error, mean_error, std_error
    - strategy, strategy_id, source_agents, rationale
    - pixels générés
    - ranking des agents
    """
    
    def __init__(self):
        self.session_id = datetime.now().isoformat()
        self.start_time = datetime.now()
        self.events: List[dict] = []
        self.agents_registry: Dict[str, dict] = {}  # {agent_id: {type, position, ...}}
        self.current_iteration = 0
        self.canvas_snapshots: List[dict] = []  # Snapshots canvas périodiques
        self.last_global_metrics: dict = {}  # Dernières métriques globales C_w, C_d, U
        self.last_rankings: dict = {}  # Dernier classement des agents
        self.last_agent_data: dict = {}  # V5.1: Dernières données complètes par agent (pour record_iteration_event)
        self.last_o_snapshot: dict = {}  # V5.1: Dernier snapshot O complet
        self.last_n_snapshot: dict = {}  # V5.1: Dernier snapshot N complet
    
    def register_agent(self, agent_id: str, position: List[int], agent_type: str = "ai"):
        """Enregistre ou met à jour un agent (IA ou humain)"""
        self.agents_registry[agent_id] = {
            "id": agent_id,
            "position": position,
            "type": agent_type,  # "ai" ou "human"
            "first_seen": datetime.now().isoformat(),
            "last_seen": datetime.now().isoformat()
        }
    
    def update_global_metrics(self, C_w: float, C_d: float, U: float, 
                               mean_error: float = 0, std_error: float = 0,
                               version: int = 0):
        """Met à jour les métriques globales (O+N)"""
        self.last_global_metrics = {
            "C_w": C_w,
            "C_d": C_d,
            "U": U,
            "mean_error": mean_error,
            "std_error": std_error,
            "version": version
        }
        self.current_iteration = version
    
    def update_rankings(self, rankings: dict):
        """Met à jour le classement des agents"""
        self.last_rankings = rankings
    
    def record_iteration_event(self, version: int, agents_data: List[dict], 
                                canvas_snapshot: Optional[str] = None,
                                o_snapshot: Optional[dict] = None,
                                n_snapshot: Optional[dict] = None):
        """
        Enregistre un événement d'itération complet.
        
        Args:
            version: Numéro d'itération global
            agents_data: Liste des données agents pour cette itération
            canvas_snapshot: Base64 du canvas (optionnel, pour replay visuel)
            o_snapshot: Snapshot O-machine complet (optionnel)
            n_snapshot: Snapshot N-machine complet (optionnel)
        """
        event = {
            "type": "iteration",
            "version": version,
            "timestamp": datetime.now().isoformat(),
            "global": copy.deepcopy(self.last_global_metrics),
            "rankings": copy.deepcopy(self.last_rankings),
            "agents": agents_data,
            "agents_count": len(agents_data),
            "ai_agents_count": sum(1 for a in agents_data if a.get("type") == "ai"),
            "human_agents_count": sum(1 for a in agents_data if a.get("type") == "human")
        }
        
        if canvas_snapshot:
            event["canvas_snapshot"] = canvas_snapshot
        
        # V5.1: Inclure les snapshots O et N pour les verbatim
        if o_snapshot:
            event["o_snapshot"] = {
                "structures": o_snapshot.get("structures", []),
                "formal_relations": o_snapshot.get("formal_relations", {})
            }
        if n_snapshot:
            event["n_snapshot"] = {
                "narrative": n_snapshot.get("narrative", {})
            }
        
        self.events.append(event)
        self.current_iteration = version
    
    def record_agent_action(self, agent_id: str, position: List[int],
                            delta_C_w: float = 0, delta_C_d: float = 0, 
                            U_expected: float = 0, prediction_error: float = 0,
                            strategy: str = "", strategy_id: str = "",
                            strategy_ids: List[str] = None,  # CRITICAL FIX: Support for multiple strategies
                            source_agents: List[List[int]] = None,
                            rationale: str = "", pixels: List[str] = None,
                            verbatim_summary: str = "", agent_type: str = "ai",
                            tokens: dict = None, signalling_tokens: dict = None,
                            rank: int = 999, iteration: int = 0):  # CRITICAL FIX: Add iteration parameter
        """
        Enregistre une action d'agent individuelle.
        Retourne les données formatées pour inclusion dans un événement d'itération.
        """
        # Mettre à jour le registre
        self.register_agent(agent_id, position, agent_type)
        self.agents_registry[agent_id]["last_seen"] = datetime.now().isoformat()
        
        agent_data = {
            "id": agent_id,
            "position": position,
            "type": agent_type,
            "timestamp": datetime.now().isoformat(),
            "rank": rank,  # V5.1: Rank au moment de l'action
            "iteration": iteration  # CRITICAL FIX: Store iteration for verbatim display
        }
        
        # Données spécifiques aux agents IA
        if agent_type == "ai":
            agent_data.update({
                "delta_C_w": delta_C_w,
                "delta_C_d": delta_C_d,
                "U_expected": U_expected,
                "prediction_error": prediction_error,
                "strategy": strategy,
                "strategy_id": strategy_id,
                "strategy_ids": strategy_ids if strategy_ids else ([strategy_id] if strategy_id else []),  # CRITICAL FIX: Support for multiple strategies
                "source_agents": source_agents or [],
                "rationale": rationale[:500] if rationale else "",  # Limiter la taille
                "verbatim_summary": verbatim_summary[:1000] if verbatim_summary else ""
            })
            
            # V5.1: Ajouter les métriques de tokens si disponibles
            if tokens:
                agent_data["tokens"] = tokens
            if signalling_tokens:
                agent_data["signalling_tokens"] = signalling_tokens
        
        if pixels:
            agent_data["pixels"] = pixels
        
        # V5.1: Stocker les dernières données complètes de l'agent
        self.last_agent_data[agent_id] = copy.deepcopy(agent_data)
        
        # V5.1: Enregistrer l'événement dans self.events pour l'export
        self.events.append({
            "type": "agent",
            "timestamp": agent_data["timestamp"],
            "data": copy.deepcopy(agent_data)
        })
        
        return agent_data
    
    def add_canvas_snapshot(self, version: int, snapshot_base64: str):
        """Ajoute un snapshot du canvas (pour replay visuel)"""
        snapshot_data = {
            "version": version,
            "timestamp": datetime.now().isoformat(),
            "data": snapshot_base64
        }
        self.canvas_snapshots.append(snapshot_data)
        # Garder les 100 derniers snapshots
        if len(self.canvas_snapshots) > 100:
            self.canvas_snapshots = self.canvas_snapshots[-100:]
        
        # V5.1: Enregistrer aussi dans self.events pour l'export
        self.events.append({
            "type": "canvas_snapshot",
            "timestamp": snapshot_data["timestamp"],
            "data": {
                "version": version,
                "snapshot": snapshot_base64  # Stocker seulement la référence, pas les données complètes
            }
        })
    
    def export_session(self) -> dict:
        """Exporte la session complète au format JSON"""
        # Reconstruire agentMetrics à partir des événements
        agent_metrics = {}
        for event in self.events:
            if event.get("type") == "agent" and event.get("data"):
                agent_data = event["data"]
                agent_id = agent_data.get("id")
                if agent_id:
                    agent_metrics[agent_id] = agent_data
        
        # Reconstruire globalMetrics à partir des événements d'itération
        global_metrics = []
        for event in self.events:
            if event.get("type") == "iteration" and event.get("global"):
                global_metrics.append({
                    "version": event.get("version", 0),
                    **event.get("global", {}),
                    "timestamp": event.get("timestamp", "")
                })
        
        return {
            "session_id": self.session_id,
            "metadata": {
                "start_time": self.start_time.isoformat(),
                "end_time": datetime.now().isoformat(),
                "total_iterations": self.current_iteration,
                "total_events": len(self.events),
                "agents_registry": self.agents_registry,
                "ai_agents_count": sum(1 for a in self.agents_registry.values() if a.get("type") == "ai"),
                "human_agents_count": sum(1 for a in self.agents_registry.values() if a.get("type") == "human")
            },
            "events": self.events,
            "globalMetrics": global_metrics,
            "agentMetrics": agent_metrics,
            "rankings": self.last_rankings,
            "canvasSnapshots": self.canvas_snapshots[-20:]  # Derniers 20 snapshots pour le replay
        }
    
    def clear(self):
        """Réinitialise la session"""
        self.session_id = datetime.now().isoformat()
        self.start_time = datetime.now()
        self.events = []
        self.agents_registry = {}
        self.current_iteration = 0
        self.canvas_snapshots = []
        self.last_global_metrics = {}
        self.last_rankings = {}
        self.last_agent_data = {}
        self.last_o_snapshot = {}
        self.last_n_snapshot = {}
    
    def get_summary(self) -> dict:
        """Retourne un résumé de la session en cours"""
        return {
            "session_id": self.session_id,
            "start_time": self.start_time.isoformat(),
            "current_iteration": self.current_iteration,
            "total_events": len(self.events),
            "agents_count": len(self.agents_registry),
            "ai_agents": sum(1 for a in self.agents_registry.values() if a.get("type") == "ai"),
            "human_agents": sum(1 for a in self.agents_registry.values() if a.get("type") == "human"),
            "last_global_metrics": self.last_global_metrics,
            "last_rankings": self.last_rankings
        }


# Instance globale du SessionRecorder
session_recorder = SessionRecorder()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GlobalSimplicityTrackerV5:
    """
    Tracker global pour métriques V5 (Architecture O-N-W)
    
    Stocke:
    - Agents W: deltas (ΔC_w, ΔC_d, U_after_expected), erreurs prédiction, stratégies
    - Snapshots O: structures, C_d, relations formelles
    - Snapshots N: narrative, C_w, erreurs prédiction (avec écart-type = fragmentation narrative)
    
    Calcule:
    - Moyennes des deltas agents W
    - Moyenne et écart-type des erreurs de prédiction (fragmentation narrative)
    """
    def __init__(self):
        self.agents: Dict[str, dict] = {}
        self.update_count = 0
        self.history = []
        self.o_snapshots = []  # Historique snapshots O (structures, C_d)
        self.n_snapshots = []  # Historique snapshots N (narrative, C_w, erreurs avec std)
        self.agent_error_history: Dict[str, List[float]] = {}  # Historique cumulatif des erreurs par agent
    
    def update_agent(self, user_id: str, position: List[int], 
                     delta_C_w: float, delta_C_d: float, U_after_expected: float, 
                     prediction_error: Optional[float] = None, 
                     strategy: Optional[str] = None):
        """Update agent with deltas (ΔC_w, ΔC_d, U_after_expected) and prediction error"""
        self.agents[user_id] = {
            'position': position,
            'delta_C_w': delta_C_w,  # V5: Delta, pas valeur absolue
            'delta_C_d': delta_C_d,  # V5: Delta, pas valeur absolue
            'U_after_expected': U_after_expected,  # V5: U attendu après action
            'prediction_error': prediction_error if prediction_error is not None else 0.0,
            'strategy': strategy or 'N/A',
            'timestamp': datetime.now().isoformat()
        }
        self.update_count += 1
    
    def store_o_snapshot(self, snapshot: dict):
        """Store O-machine snapshot (structures, C_d, formal_relations)"""
        snapshot_data = {
            'timestamp': datetime.now().isoformat(),
            'version': snapshot.get('version', 0),
            'structures_count': len(snapshot.get('structures', [])),
            'C_d': snapshot.get('simplicity_assessment', {}).get('C_d_current', {}).get('value', 0),
            'formal_relations': snapshot.get('formal_relations', {}).get('summary', '')
        }
        # V5: Ajouter machine_metrics si disponibles
        if 'machine_metrics' in snapshot:
            machine_metrics = snapshot.get('machine_metrics', {})
            if 'C_d_machine' in machine_metrics:
                snapshot_data['C_d_machine'] = machine_metrics['C_d_machine'].get('value', 0)
                snapshot_data['C_d_machine_tokens'] = machine_metrics['C_d_machine'].get('tokens', 0)
        self.o_snapshots.append(snapshot_data)
        # Garder seulement les 100 derniers snapshots
        if len(self.o_snapshots) > 100:
            self.o_snapshots = self.o_snapshots[-100:]
    
    def store_n_snapshot(self, snapshot: dict):
        """Store N-machine snapshot (narrative, C_w, prediction_errors)"""
        errors = snapshot.get('prediction_errors', {})
        # CRITICAL FIX: Filtrer les valeurs non numériques (ex: "N/A", None, strings)
        error_values = [
            e.get('error', 0) 
            for e in errors.values() 
            if isinstance(e, dict) and isinstance(e.get('error', 0), (int, float))
        ]
        
        # Calcul moyenne et écart-type
        mean_error = sum(error_values) / len(error_values) if error_values else 0.0
        std_error = 0.0
        if len(error_values) > 1:
            variance = sum([(e - mean_error) ** 2 for e in error_values]) / len(error_values)
            std_error = variance ** 0.5
        
        snapshot_data = {
            'timestamp': datetime.now().isoformat(),
            'version': snapshot.get('version', 0),
            'C_w': snapshot.get('simplicity_assessment', {}).get('C_w_current', {}).get('value', 0),
            'narrative_length': len(snapshot.get('narrative', {}).get('summary', '')),
            'agents_count': len(errors),
            'mean_prediction_error': mean_error,
            'std_prediction_error': std_error,  # V5: Écart-type (fragmentation narrative)
            'max_prediction_error': max(error_values) if error_values else 0.0,
            'min_prediction_error': min(error_values) if error_values else 0.0
        }
        # V5: Ajouter machine_metrics si disponibles
        if 'machine_metrics' in snapshot:
            machine_metrics = snapshot.get('machine_metrics', {})
            if 'C_w_machine' in machine_metrics:
                snapshot_data['C_w_machine'] = machine_metrics['C_w_machine'].get('value', 0)
                snapshot_data['C_w_machine_tokens'] = machine_metrics['C_w_machine'].get('tokens', 0)
            if 'U_machine' in machine_metrics:
                snapshot_data['U_machine'] = machine_metrics['U_machine'].get('value', 0)
        self.n_snapshots.append(snapshot_data)
        # Garder seulement les 100 derniers snapshots
        if len(self.n_snapshots) > 100:
            self.n_snapshots = self.n_snapshots[-100:]
    
    def remove_agent(self, user_id: str):
        if user_id in self.agents:
            del self.agents[user_id]
        if user_id in self.agent_error_history:
            del self.agent_error_history[user_id]
    
    def calculate_agent_rankings(self, prediction_errors: dict, agent_positions: dict, version: int = 0) -> dict:
        """
        Calcule le ranking des agents basé sur leur erreur de prédiction moyenne cumulative.
        Plus l'erreur est basse, meilleur est le rang (rank 1 = meilleur prédicteur).
        
        Args:
            prediction_errors: Dict {agent_id: {'error': float, 'explanation': str}}
            agent_positions: Dict {agent_id: [x, y]}
            version: Numéro de version/itération pour éviter les doublons
        
        Returns:
            Dict {agent_id: {'rank': int, 'avg_error': float, 'total_iterations': int, 'position': [x,y]}}
        """
        # Pour chaque agent, mettre à jour son historique d'erreurs
        # On stocke maintenant (version, error) pour éviter les doublons
        for agent_id, error_data in prediction_errors.items():
            if not isinstance(error_data, dict):
                continue
            error = error_data.get('error', 1.0)
            
            # CRITICAL: Ne stocker que les valeurs numériques (ignorer "N/A", None, etc.)
            if not isinstance(error, (int, float)):
                continue
            
            # Initialiser si nécessaire
            if agent_id not in self.agent_error_history:
                self.agent_error_history[agent_id] = {}  # Dict {version: error} au lieu de liste
            
            # Ajouter l'erreur seulement si pas déjà enregistrée pour cette version
            if version not in self.agent_error_history[agent_id]:
                self.agent_error_history[agent_id][version] = error
        
        # Calculer moyenne cumulative pour chaque agent ACTIF uniquement
        # (ne classer que les agents présents dans agent_positions)
        agent_stats = {}
        for agent_id, error_history in self.agent_error_history.items():
            # Ignorer les agents qui ne sont pas actifs (pas dans agent_positions)
            if agent_id not in agent_positions:
                continue
            if len(error_history) == 0:
                continue
            
            # Moyenne cumulative sur toutes les itérations (valeurs du dict)
            # CRITICAL: Filtrer les valeurs non numériques ("N/A", None, etc.)
            errors = [e for e in error_history.values() if isinstance(e, (int, float))]
            if len(errors) == 0:
                continue  # Ignorer les agents sans erreurs numériques
            avg_error = sum(errors) / len(errors)
            position = agent_positions[agent_id]  # Garanti d'exister car on a vérifié ci-dessus
            
            agent_stats[agent_id] = {
                'avg_error': avg_error,
                'total_iterations': len(errors),
                'position': position
            }
        
        # Trier par erreur moyenne croissante (meilleur = erreur la plus basse)
        sorted_agents = sorted(
            agent_stats.items(),
            key=lambda x: x[1]['avg_error']
        )
        
        # Assigner les rangs
        rankings = {}
        for rank, (agent_id, stats) in enumerate(sorted_agents, start=1):
            rankings[agent_id] = {
                'rank': rank,
                'avg_error': stats['avg_error'],
                'total_iterations': stats['total_iterations'],
                'position': stats['position']
            }
        
        return rankings
    
    def calculate_average_metrics(self):
        """Calculate average deltas (ΔC_w, ΔC_d, U_after_expected), prediction_error, and std_dev of prediction errors"""
        if not self.agents:
            return None
        
        agent_list = list(self.agents.values())
        
        # V5: Calcul moyennes des DELTAS (pas valeurs absolues)
        # CRITICAL FIX: Filtrer les valeurs non numériques pour tous les deltas
        delta_cw_values = [
            a.get('delta_C_w', 0) 
            for a in agent_list 
            if isinstance(a.get('delta_C_w', 0), (int, float))
        ]
        delta_cd_values = [
            a.get('delta_C_d', 0) 
            for a in agent_list 
            if isinstance(a.get('delta_C_d', 0), (int, float))
        ]
        u_after_values = [
            a.get('U_after_expected', 0) 
            for a in agent_list 
            if isinstance(a.get('U_after_expected', 0), (int, float))
        ]
        # CRITICAL: Filtrer les valeurs non numériques (ex: "N/A")
        prediction_errors = [
            a.get('prediction_error', 0) 
            for a in agent_list 
            if isinstance(a.get('prediction_error', 0), (int, float)) and a.get('prediction_error', 0) >= 0
        ]
        
        # Moyennes
        avg_delta_cw = sum(delta_cw_values) / len(delta_cw_values) if delta_cw_values else 0
        avg_delta_cd = sum(delta_cd_values) / len(delta_cd_values) if delta_cd_values else 0
        avg_u_after = sum(u_after_values) / len(u_after_values) if u_after_values else 0
        avg_error = sum(prediction_errors) / len(prediction_errors) if prediction_errors else 0
        
        # V5: Écart-type des erreurs de prédiction (mesure fragmentation narrative)
        # Un écart-type élevé = agents ont des visions divergentes de l'évolution du canvas
        # Un écart-type faible = agents ont une vision cohérente (narrative unifiée)
        std_error = 0.0
        if len(prediction_errors) > 1:
            variance = sum([(e - avg_error) ** 2 for e in prediction_errors]) / len(prediction_errors)
            std_error = variance ** 0.5
        
        return {
            'agents_count': len(self.agents),
            'avg_delta_C_w': round(avg_delta_cw, 2),  # V5: Moyenne des deltas
            'avg_delta_C_d': round(avg_delta_cd, 2),  # V5: Moyenne des deltas
            'avg_U_after_expected': round(avg_u_after, 2),  # V5: Moyenne U attendu
            'avg_prediction_error': round(avg_error, 3),
            'std_prediction_error': round(std_error, 3),  # V5: Écart-type (fragmentation narrative)
            'timestamp': datetime.now().isoformat()
        }
    
    def get_state_summary(self):
        """Get current state with history"""
        avg = self.calculate_average_metrics()
        
        return {
            'agents': self.agents,
            'averages': avg,
            'update_count': self.update_count,
            'o_snapshots_count': len(self.o_snapshots),
            'n_snapshots_count': len(self.n_snapshots),
            'latest_o': self.o_snapshots[-1] if self.o_snapshots else None,
            'latest_n': self.n_snapshots[-1] if self.n_snapshots else None,
            'history': self.history[-50:]  # Derniers 50 états
        }
    
    def record_history(self):
        """Record current state in history"""
        avg = self.calculate_average_metrics()
        if avg:
            self.history.append(avg)
            # Garder seulement les 200 dernières entrées
            if len(self.history) > 200:
                self.history = self.history[-200:]

tracker = GlobalSimplicityTrackerV5()

# WebSocket connections actives
connections: List[WebSocket] = []

# Paramètres de stratégie configurables (valeurs par défaut)
strategy_params = {
    'strategy_u_threshold': 70,
    'strategy_rank_divisor': 2,
    'strategy_error_threshold': 0.5
}

@app.websocket("/metrics")
async def metrics_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.append(websocket)
    print(f"[MetricsV5] Client connecté. Total: {len(connections)}")
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            msg_type = msg.get('type')
            
            if msg_type == 'agent_update':
                # Mise à jour agent W (V5: deltas au lieu de valeurs absolues)
                user_id = msg.get('user_id')
                position = msg.get('position', [0, 0])
                delta_C_w = msg.get('delta_C_w', 0)  # V5: Delta, pas valeur absolue
                delta_C_d = msg.get('delta_C_d', 0)  # V5: Delta, pas valeur absolue
                U_after_expected = msg.get('U_after_expected', 0)  # V5: U attendu après action
                prediction_error = msg.get('prediction_error')
                strategy = msg.get('strategy')
                agent_type = msg.get('agent_type', 'ai')  # V5.1: Type d'agent (ai/human)
                pixels = msg.get('pixels', [])  # V5.1: Pixels générés
                strategy_id = msg.get('strategy_id', '')
                strategy_ids = msg.get('strategy_ids', [])  # CRITICAL FIX: Support for multiple strategies
                source_agents = msg.get('source_agents', [])
                rationale = msg.get('rationale', '')
                verbatim_summary = msg.get('verbatim_summary', '')
                iteration = msg.get('iteration', 0)
                tokens = msg.get('tokens')  # V5.1: Métriques de tokens
                signalling_tokens = msg.get('signalling_tokens')  # V5.1: Tokens de signalement réels
                
                # V5.1: Si l'agent recommence (iteration <= 1), réinitialiser son historique
                if iteration <= 1 and user_id in tracker.agent_error_history:
                    del tracker.agent_error_history[user_id]
                    print(f"[MetricsV5] Agent {user_id[:8]}... reset (iteration={iteration})")
                
                tracker.update_agent(user_id, position, delta_C_w, delta_C_d, U_after_expected, prediction_error, strategy)
                tracker.record_history()
                
                # V5.1: Calculer le rank actuel de l'agent pour l'inclure dans les données
                # On calcule un ranking temporaire basé sur l'erreur moyenne cumulative
                # (sans modifier agent_error_history)
                agent_stats = {}
                for aid, error_history in tracker.agent_error_history.items():
                    if aid not in tracker.agents:
                        continue
                    if len(error_history) == 0:
                        continue
                    # CRITICAL: Filtrer les valeurs non numériques
                    errors = [e for e in error_history.values() if isinstance(e, (int, float))]
                    if len(errors) == 0:
                        continue
                    avg_error = sum(errors) / len(errors)
                    agent_stats[aid] = avg_error
                
                # Trier par erreur moyenne croissante
                sorted_agents = sorted(agent_stats.items(), key=lambda x: x[1])
                current_rank = 999
                for rank, (aid, _) in enumerate(sorted_agents, start=1):
                    if aid == user_id:
                        current_rank = rank
                        break
                
                # V5.1: Enregistrer dans SessionRecorder
                agent_data = session_recorder.record_agent_action(
                    agent_id=user_id,
                    position=position,
                    delta_C_w=delta_C_w,
                    delta_C_d=delta_C_d,
                    U_expected=U_after_expected,
                    prediction_error=prediction_error or 0,
                    strategy=strategy or '',
                    strategy_id=strategy_id,
                    strategy_ids=strategy_ids,  # CRITICAL FIX: Pass strategy_ids
                    source_agents=source_agents,
                    rationale=rationale,
                    pixels=pixels,
                    verbatim_summary=verbatim_summary,
                    agent_type=agent_type,
                    tokens=tokens,
                    signalling_tokens=signalling_tokens,
                    rank=current_rank,  # V5.1: Ajouter le rank actuel
                    iteration=iteration  # CRITICAL FIX: Pass iteration
                )
                
                # Broadcast state to all connected clients
                state = tracker.get_state_summary()
                dead_connections = []
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'state_update',
                            'data': state
                        })
                        # V5.1: Broadcast aussi l'événement agent pour ai-metrics.html
                        await conn.send_json({
                            'type': 'session_agent_event',
                            'data': agent_data
                        })
                    except:
                        dead_connections.append(conn)
                # Nettoyer les connexions mortes
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'o_snapshot':
                # Snapshot O-machine
                snapshot = msg.get('snapshot', {})
                tracker.store_o_snapshot(snapshot)
                
                # V5.1: Stocker le snapshot O complet pour l'événement d'itération
                session_recorder.last_o_snapshot = copy.deepcopy(snapshot)
                
                # V5.1: Extraire et stocker les métriques globales
                simplicity = snapshot.get('simplicity_assessment', {})
                C_d = simplicity.get('C_d_current', {}).get('value', 0)
                version = snapshot.get('version', 0)
                
                # Broadcast
                dead_connections = []
                # V5.1: Envoyer le snapshot O complet (pas seulement les métadonnées)
                o_data = {
                    'version': version,
                    'structures': snapshot.get('structures', []),
                    'formal_relations': snapshot.get('formal_relations', {}),
                    'simplicity_assessment': snapshot.get('simplicity_assessment', {})
                }
                # V5: Ajouter machine_metrics si disponibles
                if 'machine_metrics' in snapshot:
                    o_data['machine_metrics'] = snapshot.get('machine_metrics', {})
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'o_snapshot_update',
                            'data': o_data
                        })
                    except:
                        dead_connections.append(conn)
                # Nettoyer les connexions mortes
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'n_snapshot':
                # Snapshot N-machine
                snapshot = msg.get('snapshot', {})
                tracker.store_n_snapshot(snapshot)
                
                # V5.1: Mettre à jour les métriques globales dans SessionRecorder
                simplicity = snapshot.get('simplicity_assessment', {})
                C_w = simplicity.get('C_w_current', {}).get('value', 0)
                C_d = simplicity.get('C_d_current', {}).get('value', 0)
                U = simplicity.get('U_current', {}).get('value', 0)
                version = snapshot.get('version', 0)
                
                # Calculer mean/std des erreurs de prédiction
                errors = snapshot.get('prediction_errors', {})
                # CRITICAL FIX: Filtrer les valeurs non numériques (ex: "N/A", None, strings)
                error_values = [
                    e.get('error', 0) 
                    for e in errors.values() 
                    if isinstance(e, dict) and isinstance(e.get('error', 0), (int, float))
                ]
                mean_error = sum(error_values) / len(error_values) if error_values else 0.0
                std_error = 0.0
                if len(error_values) > 1:
                    variance = sum([(e - mean_error) ** 2 for e in error_values]) / len(error_values)
                    std_error = variance ** 0.5
                
                session_recorder.update_global_metrics(C_w, C_d, U, mean_error, std_error, version)
                
                # V5.1: Calculer et stocker les rankings
                agent_positions = {aid: a.get('position', [0, 0]) for aid, a in tracker.agents.items()}
                rankings = tracker.calculate_agent_rankings(errors, agent_positions, version)
                session_recorder.update_rankings(rankings)
                
                # V5.1: Enregistrer l'événement d'itération
                # Utiliser les dernières données complètes stockées pour chaque agent
                agents_data = []
                for agent_id in tracker.agents.keys():
                    if agent_id in session_recorder.last_agent_data:
                        # Utiliser les données complètes stockées (inclut tokens, pixels, etc.)
                        agent_data = copy.deepcopy(session_recorder.last_agent_data[agent_id])
                        # Mettre à jour le rank si disponible
                        if agent_id in rankings:
                            agent_data["rank"] = rankings[agent_id].get('rank', 999)
                        agents_data.append(agent_data)
                    else:
                        # Fallback: construire à partir de tracker.agents si pas de données complètes
                        agent_info = tracker.agents[agent_id]
                        agent_data = {
                            "id": agent_id,
                            "position": agent_info.get('position', [0, 0]),
                            "type": "ai",
                            "timestamp": datetime.now().isoformat()
                        }
                        if 'delta_C_w' in agent_info:
                            agent_data["delta_C_w"] = agent_info.get('delta_C_w', 0)
                            agent_data["delta_C_d"] = agent_info.get('delta_C_d', 0)
                            agent_data["U_expected"] = agent_info.get('U_after_expected', 0)
                            agent_data["prediction_error"] = agent_info.get('prediction_error', 0)
                            agent_data["strategy"] = agent_info.get('strategy', '')
                        if agent_id in rankings:
                            agent_data["rank"] = rankings[agent_id].get('rank', 999)
                        agents_data.append(agent_data)
                
                # V5.1: Récupérer les derniers snapshots O et N pour l'événement
                o_snapshot_data = None
                n_snapshot_data = snapshot  # Le snapshot N vient d'être reçu
                
                # Stocker le snapshot N complet
                session_recorder.last_n_snapshot = copy.deepcopy(snapshot)
                
                # Utiliser le dernier snapshot O stocké
                if session_recorder.last_o_snapshot:
                    o_snapshot_data = {
                        "structures": session_recorder.last_o_snapshot.get('structures', []),
                        "formal_relations": session_recorder.last_o_snapshot.get('formal_relations', {})
                    }
                
                # Enregistrer l'événement d'itération avec les snapshots O et N
                session_recorder.record_iteration_event(
                    version, 
                    agents_data,
                    o_snapshot=o_snapshot_data,
                    n_snapshot=n_snapshot_data
                )
                
                # Broadcast
                dead_connections = []
                # CRITICAL FIX: Envoyer le snapshot complet (combiné O+N) au lieu de tracker.n_snapshots[-1]
                # tracker.n_snapshots[-1] ne contient pas structures ni formal_relations
                # Le snapshot reçu contient toutes les données nécessaires (structures, formal_relations, narrative, prediction_errors, etc.)
                n_data = {
                    'version': snapshot.get('version', 0),
                    'structures': snapshot.get('structures', []),
                    'formal_relations': snapshot.get('formal_relations', {}),
                    'narrative': snapshot.get('narrative', {}),
                    'prediction_errors': snapshot.get('prediction_errors', {}),
                    'simplicity_assessment': snapshot.get('simplicity_assessment', {}),
                    'agent_rankings': snapshot.get('agent_rankings', {}),
                    'timestamp': snapshot.get('timestamp', '')
                }
                # V5: Ajouter machine_metrics au snapshot N si disponibles
                if 'machine_metrics' in snapshot:
                    n_data['machine_metrics'] = snapshot.get('machine_metrics', {})
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'n_snapshot_update',
                            'data': n_data
                        })
                        # V5.1: Broadcast l'événement d'itération complet pour ai-metrics.html
                        n_snapshot_data = {
                            "narrative": snapshot.get('narrative', {})
                        }
                        # V5: Ajouter machine_metrics au n_snapshot si disponibles
                        if 'machine_metrics' in snapshot:
                            n_snapshot_data['machine_metrics'] = snapshot.get('machine_metrics', {})
                        
                        await conn.send_json({
                            'type': 'session_iteration_event',
                            'data': {
                                'version': version,
                                'global': session_recorder.last_global_metrics,
                                'rankings': rankings,
                                'agents': agents_data,  # V5.1: Inclure les données des agents
                                'agents_count': len(agents_data),
                                'ai_agents_count': sum(1 for a in agents_data if a.get("type") == "ai"),
                                'human_agents_count': sum(1 for a in agents_data if a.get("type") == "human"),
                                'o_snapshot': o_snapshot_data,  # V5.1: Inclure snapshot O
                                'n_snapshot': n_snapshot_data,  # V5.1: Inclure snapshot N (narrative + machine_metrics)
                                'timestamp': datetime.now().isoformat()
                            }
                        })
                    except:
                        dead_connections.append(conn)
                # Nettoyer les connexions mortes
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'disconnect':
                user_id = msg.get('user_id')
                tracker.remove_agent(user_id)
                tracker.record_history()
                
                # Broadcast
                state = tracker.get_state_summary()
                dead_connections = []
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'state_update',
                            'data': state
                        })
                    except:
                        dead_connections.append(conn)
                # Nettoyer les connexions mortes
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'get_state':
                # Demande état complet
                state = tracker.get_state_summary()
                await websocket.send_json({
                    'type': 'state_update',
                    'data': state
                })
                # V5.1: Envoyer aussi le résumé de session
                await websocket.send_json({
                    'type': 'session_summary',
                    'data': session_recorder.get_summary()
                })
                # Envoyer les paramètres de stratégie actuels
                await websocket.send_json({
                    'type': 'strategy_params_update',
                    'params': strategy_params
                })
            
            elif msg_type == 'set_strategy_params':
                # Mise à jour des paramètres de stratégie
                params = msg.get('params', {})
                if 'strategy_u_threshold' in params:
                    strategy_params['strategy_u_threshold'] = float(params['strategy_u_threshold'])
                if 'strategy_rank_divisor' in params:
                    strategy_params['strategy_rank_divisor'] = float(params['strategy_rank_divisor'])
                if 'strategy_error_threshold' in params:
                    strategy_params['strategy_error_threshold'] = float(params['strategy_error_threshold'])
                
                print(f"[MetricsV5] Strategy params updated: {strategy_params}")
                
                # Diffuser à tous les clients
                dead_connections = []
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'strategy_params_update',
                            'params': strategy_params
                        })
                    except:
                        dead_connections.append(conn)
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'human_pixels':
                # V5.1: Pixels d'un agent humain (pas de métriques W)
                user_id = msg.get('user_id')
                position = msg.get('position', [0, 0])
                pixels = msg.get('pixels', [])
                
                # Enregistrer comme agent humain
                agent_data = session_recorder.record_agent_action(
                    agent_id=user_id,
                    position=position,
                    pixels=pixels,
                    agent_type="human"
                )
                
                # Broadcast l'événement
                dead_connections = []
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'session_agent_event',
                            'data': agent_data
                        })
                    except:
                        dead_connections.append(conn)
                for conn in dead_connections:
                    if conn in connections:
                        connections.remove(conn)
            
            elif msg_type == 'canvas_snapshot':
                # V5.1: Snapshot du canvas pour replay visuel
                version = msg.get('version', session_recorder.current_iteration)
                snapshot_base64 = msg.get('data', '')
                
                if snapshot_base64:
                    session_recorder.add_canvas_snapshot(version, snapshot_base64)
                    
                    # Broadcast
                    dead_connections = []
                    for conn in connections:
                        try:
                            await conn.send_json({
                                'type': 'canvas_snapshot_update',
                                'data': {
                                    'version': version,
                                    'timestamp': datetime.now().isoformat()
                                }
                            })
                        except:
                            dead_connections.append(conn)
                    for conn in dead_connections:
                        if conn in connections:
                            connections.remove(conn)
            
            elif msg_type == 'get_session_export':
                # V5.1: Demande d'export de session via WebSocket
                await websocket.send_json({
                    'type': 'session_export',
                    'data': session_recorder.export_session()
                })
    
    except WebSocketDisconnect:
        connections.remove(websocket)
        print(f"[MetricsV5] Client déconnecté. Total: {len(connections)}")
    except Exception as e:
        print(f"[MetricsV5] Erreur: {e}")
        if websocket in connections:
            connections.remove(websocket)

@app.get("/health")
async def health():
    return {"status": "ok", "version": "5.0.0", "clients": len(connections)}

@app.get("/state")
async def get_state():
    """HTTP endpoint pour récupérer l'état actuel"""
    return tracker.get_state_summary()

@app.get("/o-history")
async def get_o_history():
    """Historique snapshots O"""
    return {"o_snapshots": tracker.o_snapshots}

@app.get("/n-history")
async def get_n_history():
    """Historique snapshots N"""
    return {"n_snapshots": tracker.n_snapshots}


# ==============================================================================
# ENDPOINTS SESSION RECORDER
# ==============================================================================

@app.get("/api/session/export")
async def export_session():
    """Exporte la session complète au format JSON"""
    return JSONResponse(
        content=session_recorder.export_session(),
        headers={
            "Content-Disposition": f"attachment; filename=session_{session_recorder.session_id}.json"
        }
    )

@app.get("/api/session/summary")
async def get_session_summary():
    """Retourne un résumé de la session en cours"""
    return session_recorder.get_summary()

@app.post("/api/session/clear")
async def clear_session():
    """Réinitialise la session courante"""
    session_recorder.clear()
    return {"status": "ok", "message": "Session cleared", "new_session_id": session_recorder.session_id}

@app.get("/api/session/events")
async def get_session_events(limit: int = 50, offset: int = 0):
    """Retourne les événements de la session avec pagination"""
    events = session_recorder.events
    total = len(events)
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": events[offset:offset + limit]
    }


if __name__ == "__main__":
    import uvicorn
    print("🚀 Démarrage Poietic Metrics Server V5.1 (O-N-W Architecture + SessionRecorder)")
    print("   WebSocket: ws://localhost:5005/metrics")
    print("   Health: http://localhost:5005/health")
    print("   State: http://localhost:5005/state")
    print("   O History: http://localhost:5005/o-history")
    print("   N History: http://localhost:5005/n-history")
    print("   Session Export: http://localhost:5005/api/session/export")
    print("   Session Summary: http://localhost:5005/api/session/summary")
    print("   Session Clear: POST http://localhost:5005/api/session/clear")
    uvicorn.run(app, host="0.0.0.0", port=5005, log_level="info", access_log=False)

