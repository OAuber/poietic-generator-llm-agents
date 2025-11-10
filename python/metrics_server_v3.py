#!/usr/bin/env python3
"""
Serveur de métriques Simplicity Theory pour Poietic Generator V3
Port 5002 - WebSocket indépendant
Agrège les évaluations directes de complexité fournies par les agents
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Dict, List
from datetime import datetime

app = FastAPI(title="Poietic Metrics Server V3", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GlobalSimplicityTrackerV3:
    def __init__(self):
        self.agents: Dict[str, dict] = {}
        self.update_count = 0
        self.history = []
    
    def update_agent(self, user_id: str, position: List[int], C_w: float, C_d: float, U: float):
        """Update agent with direct simplicity assessments"""
        self.agents[user_id] = {
            'position': position,
            'C_w': C_w,
            'C_d': C_d,
            'U': U,
            'timestamp': datetime.now().isoformat()
        }
        self.update_count += 1
    
    def remove_agent(self, user_id: str):
        if user_id in self.agents:
            del self.agents[user_id]
    
    def calculate_average_metrics(self):
        """Calculate average C_w, C_d, U across all agents (excluding zero values)"""
        if not self.agents:
            return None
        
        agent_list = list(self.agents.values())
        
        # Filter out zero values for meaningful averages
        C_w_values = [a['C_w'] for a in agent_list if a['C_w'] > 0]
        C_d_values = [a['C_d'] for a in agent_list if a['C_d'] > 0]
        U_values = [a['U'] for a in agent_list if a['U'] != 0]  # U can be negative
        
        # Calculate averages (only from non-zero values)
        # If all values are zero, use 0 as default
        avg_C_w = sum(C_w_values) / len(C_w_values) if C_w_values else 0
        avg_C_d = sum(C_d_values) / len(C_d_values) if C_d_values else 0
        avg_U = sum(U_values) / len(U_values) if U_values else 0
        
        # Count agents with valid (non-zero) values
        valid_agents_C_w = len(C_w_values)
        valid_agents_C_d = len(C_d_values)
        valid_agents_U = len(U_values)
        
        # Calculate variance for consensus (only from non-zero values)
        C_w_variance = sum((v - avg_C_w)**2 for v in C_w_values) / len(C_w_values) if C_w_values else 0
        C_d_variance = sum((v - avg_C_d)**2 for v in C_d_values) / len(C_d_values) if C_d_values else 0
        U_variance = sum((v - avg_U)**2 for v in U_values) / len(U_values) if U_values else 0
        
        # Consensus score: lower variance = higher consensus
        consensus_score = 1 / (1 + (U_variance**0.5)) if U_variance > 0 else 0
        
        metrics = {
            'avg_C_w': round(avg_C_w, 2),
            'avg_C_d': round(avg_C_d, 2),
            'avg_U': round(avg_U, 2),
            'agent_count': len(agent_list),
            'valid_agents_C_w': valid_agents_C_w,
            'valid_agents_C_d': valid_agents_C_d,
            'valid_agents_U': valid_agents_U,
            'consensus_score': round(consensus_score, 3),
            'iteration': self.update_count,
            'timestamp': datetime.now().isoformat()
        }
        
        self.history.append(metrics)
        return metrics

tracker = GlobalSimplicityTrackerV3()
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
    print(f"[Metrics V3] Client connected. Total: {len(active_connections)}")
    
    # Send current metrics if available
    metrics = tracker.calculate_average_metrics()
    if metrics:
        await websocket.send_json({
            'type': 'average_simplicity_metrics',
            **metrics
        })
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            if msg['type'] == 'simplicity_assessment_update':
                tracker.update_agent(
                    msg['user_id'],
                    msg.get('position', [0, 0]),
                    msg.get('C_w', 0),
                    msg.get('C_d', 0),
                    msg.get('U', 0)
                )
                # Broadcast updated averages after each update
                metrics = tracker.calculate_average_metrics()
                if metrics:
                    await broadcast({
                        'type': 'average_simplicity_metrics',
                        **metrics
                    })
            
            elif msg['type'] == 'agent_disconnected':
                tracker.remove_agent(msg['user_id'])
                # Broadcast updated averages after agent removal
                metrics = tracker.calculate_average_metrics()
                if metrics:
                    await broadcast({
                        'type': 'average_simplicity_metrics',
                        **metrics
                    })
            
            elif msg['type'] == 'ping':
                await websocket.send_json({'type': 'pong'})
    
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"[Metrics V3] Client disconnected. Total: {len(active_connections)}")

@app.get("/")
async def root():
    return {"service": "Poietic Metrics Server V3", "status": "running", "port": 5002}

@app.get("/metrics/history")
async def get_history():
    return {"history": tracker.history[-100:]}  # Last 100 entries

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=5002,
        log_level="warning",
        access_log=False
    )

