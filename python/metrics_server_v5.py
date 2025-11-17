#!/usr/bin/env python3
"""
Serveur de métriques Simplicity Theory pour Poietic Generator V5 (Architecture O-N-W)
Port 5005 - WebSocket indépendant
Agrège les évaluations O (C_d), N (C_w, erreurs prédiction), W (actions)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Dict, List, Optional
from datetime import datetime

app = FastAPI(title="Poietic Metrics Server V5", version="5.0.0")

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
        self.o_snapshots.append({
            'timestamp': datetime.now().isoformat(),
            'version': snapshot.get('version', 0),
            'structures_count': len(snapshot.get('structures', [])),
            'C_d': snapshot.get('simplicity_assessment', {}).get('C_d_current', {}).get('value', 0),
            'formal_relations': snapshot.get('formal_relations', {}).get('summary', '')
        })
        # Garder seulement les 100 derniers snapshots
        if len(self.o_snapshots) > 100:
            self.o_snapshots = self.o_snapshots[-100:]
    
    def store_n_snapshot(self, snapshot: dict):
        """Store N-machine snapshot (narrative, C_w, prediction_errors)"""
        errors = snapshot.get('prediction_errors', {})
        error_values = [e.get('error', 0) for e in errors.values() if isinstance(e, dict)]
        
        # Calcul moyenne et écart-type
        mean_error = sum(error_values) / len(error_values) if error_values else 0.0
        std_error = 0.0
        if len(error_values) > 1:
            variance = sum([(e - mean_error) ** 2 for e in error_values]) / len(error_values)
            std_error = variance ** 0.5
        
        self.n_snapshots.append({
            'timestamp': datetime.now().isoformat(),
            'version': snapshot.get('version', 0),
            'C_w': snapshot.get('simplicity_assessment', {}).get('C_w_current', {}).get('value', 0),
            'narrative_length': len(snapshot.get('narrative', {}).get('summary', '')),
            'agents_count': len(errors),
            'mean_prediction_error': mean_error,
            'std_prediction_error': std_error,  # V5: Écart-type (fragmentation narrative)
            'max_prediction_error': max(error_values) if error_values else 0.0,
            'min_prediction_error': min(error_values) if error_values else 0.0
        })
        # Garder seulement les 100 derniers snapshots
        if len(self.n_snapshots) > 100:
            self.n_snapshots = self.n_snapshots[-100:]
    
    def remove_agent(self, user_id: str):
        if user_id in self.agents:
            del self.agents[user_id]
        if user_id in self.agent_error_history:
            del self.agent_error_history[user_id]
    
    def calculate_agent_rankings(self, prediction_errors: dict, agent_positions: dict) -> dict:
        """
        Calcule le ranking des agents basé sur leur erreur de prédiction moyenne cumulative.
        Plus l'erreur est basse, meilleur est le rang (rank 1 = meilleur prédicteur).
        
        Args:
            prediction_errors: Dict {agent_id: {'error': float, 'explanation': str}}
            agent_positions: Dict {agent_id: [x, y]}
        
        Returns:
            Dict {agent_id: {'rank': int, 'avg_error': float, 'total_iterations': int, 'position': [x,y]}}
        """
        # Pour chaque agent, mettre à jour son historique d'erreurs
        for agent_id, error_data in prediction_errors.items():
            if not isinstance(error_data, dict):
                continue
            error = error_data.get('error', 1.0)
            
            # Initialiser si nécessaire
            if agent_id not in self.agent_error_history:
                self.agent_error_history[agent_id] = []
            
            # Ajouter l'erreur à l'historique cumulatif
            self.agent_error_history[agent_id].append(error)
        
        # Calculer moyenne cumulative pour chaque agent ACTIF uniquement
        # (ne classer que les agents présents dans agent_positions)
        agent_stats = {}
        for agent_id, error_history in self.agent_error_history.items():
            # Ignorer les agents qui ne sont pas actifs (pas dans agent_positions)
            if agent_id not in agent_positions:
                continue
            if len(error_history) == 0:
                continue
            
            # Moyenne cumulative sur toutes les itérations
            avg_error = sum(error_history) / len(error_history)
            position = agent_positions[agent_id]  # Garanti d'exister car on a vérifié ci-dessus
            
            agent_stats[agent_id] = {
                'avg_error': avg_error,
                'total_iterations': len(error_history),
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
        delta_cw_values = [a.get('delta_C_w', 0) for a in agent_list]
        delta_cd_values = [a.get('delta_C_d', 0) for a in agent_list]
        u_after_values = [a.get('U_after_expected', 0) for a in agent_list]
        prediction_errors = [a.get('prediction_error', 0) for a in agent_list if a.get('prediction_error', 0) >= 0]
        
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
                
                tracker.update_agent(user_id, position, delta_C_w, delta_C_d, U_after_expected, prediction_error, strategy)
                tracker.record_history()
                
                # Broadcast state to all connected clients
                state = tracker.get_state_summary()
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'state_update',
                            'data': state
                        })
                    except:
                        pass
            
            elif msg_type == 'o_snapshot':
                # Snapshot O-machine
                snapshot = msg.get('snapshot', {})
                tracker.store_o_snapshot(snapshot)
                
                # Broadcast
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'o_snapshot_update',
                            'data': tracker.o_snapshots[-1] if tracker.o_snapshots else None
                        })
                    except:
                        pass
            
            elif msg_type == 'n_snapshot':
                # Snapshot N-machine
                snapshot = msg.get('snapshot', {})
                tracker.store_n_snapshot(snapshot)
                
                # Broadcast
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'n_snapshot_update',
                            'data': tracker.n_snapshots[-1] if tracker.n_snapshots else None
                        })
                    except:
                        pass
            
            elif msg_type == 'disconnect':
                user_id = msg.get('user_id')
                tracker.remove_agent(user_id)
                tracker.record_history()
                
                # Broadcast
                state = tracker.get_state_summary()
                for conn in connections:
                    try:
                        await conn.send_json({
                            'type': 'state_update',
                            'data': state
                        })
                    except:
                        pass
            
            elif msg_type == 'get_state':
                # Demande état complet
                state = tracker.get_state_summary()
                await websocket.send_json({
                    'type': 'state_update',
                    'data': state
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

if __name__ == "__main__":
    import uvicorn
    print("🚀 Démarrage Poietic Metrics Server V5 (O-N-W Architecture)")
    print("   WebSocket: ws://localhost:5005/metrics")
    print("   Health: http://localhost:5005/health")
    print("   State: http://localhost:5005/state")
    print("   O History: http://localhost:5005/o-history")
    print("   N History: http://localhost:5005/n-history")
    uvicorn.run(app, host="0.0.0.0", port=5005, log_level="info", access_log=False)

