#!/usr/bin/env python3
"""
Serveur de métriques Simplicity Theory pour Poietic Generator V2
Port 5001 - WebSocket indépendant
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Dict, List
from datetime import datetime

app = FastAPI(title="Poietic Metrics Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GlobalSimplicityTracker:
    def __init__(self):
        self.agents: Dict[str, dict] = {}
        self.update_count = 0
        self.history = []
    
    def update_agent(self, user_id: str, h: int, local_desc: str, global_desc: str):
        self.agents[user_id] = {
            'h': h,
            'local_desc': local_desc,
            'global_desc': global_desc,
            'timestamp': datetime.now().isoformat()
        }
        self.update_count += 1
    
    def remove_agent(self, user_id: str):
        if user_id in self.agents:
            del self.agents[user_id]
    
    def calculate_global_metrics(self):
        if not self.agents:
            return None
        
        alpha = 33
        agent_list = list(self.agents.values())
        
        # C_w global = somme pixels modifiés
        C_w_global = sum(a['h'] for a in agent_list) * alpha
        
        # C_d global = MOYENNE des descriptions globales
        global_desc_lengths = [len(a['global_desc']) for a in agent_list]
        avg_global_desc_length = sum(global_desc_lengths) / len(global_desc_lengths)
        C_d_global = avg_global_desc_length * 8
        
        # Score de consensus (écart-type)
        variance = sum((l - avg_global_desc_length)**2 for l in global_desc_lengths) / len(global_desc_lengths)
        consensus_score = 1 / (1 + variance**0.5)
        
        U_global = C_w_global - C_d_global
        
        metrics = {
            'C_w_global': C_w_global,
            'C_d_global': C_d_global,
            'U_global': U_global,
            'agent_count': len(agent_list),
            'consensus_score': consensus_score,
            'iteration': self.update_count,
            'timestamp': datetime.now().isoformat()
        }
        
        self.history.append(metrics)
        return metrics

tracker = GlobalSimplicityTracker()
active_connections: List[WebSocket] = []

async def broadcast(message: dict):
    dead_connections = []
    for connection in active_connections:
        try:
            await connection.send_json(message)
        except:
            dead_connections.append(connection)
    
    for conn in dead_connections:
        active_connections.remove(conn)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"[Metrics] Client connected. Total: {len(active_connections)}")
    
    # Envoyer les métriques actuelles
    metrics = tracker.calculate_global_metrics()
    if metrics:
        await websocket.send_json({
            'type': 'global_simplicity_metrics',
            **metrics
        })
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            if msg['type'] == 'simplicity_update':
                tracker.update_agent(
                    msg['user_id'],
                    msg['h'],
                    msg['local_description'],
                    msg['global_description']
                )
                
                # Broadcast toutes les 5 mises à jour
                if tracker.update_count % 5 == 0:
                    metrics = tracker.calculate_global_metrics()
                    await broadcast({
                        'type': 'global_simplicity_metrics',
                        **metrics
                    })
            
            elif msg['type'] == 'agent_disconnected':
                tracker.remove_agent(msg['user_id'])
            
            elif msg['type'] == 'ping':
                await websocket.send_json({'type': 'pong'})
    
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"[Metrics] Client disconnected. Total: {len(active_connections)}")

@app.get("/")
async def root():
    return {"service": "Poietic Metrics Server", "status": "running", "port": 5001}

@app.get("/metrics/history")
async def get_history():
    return {"history": tracker.history[-100:]}  # Dernières 100 entrées

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=5001,
        log_level="warning",  # Réduire les logs uvicorn (info/warning/error/critical)
        access_log=False      # Désactiver les logs d'accès HTTP
    )

