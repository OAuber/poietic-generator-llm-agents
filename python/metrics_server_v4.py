#!/usr/bin/env python3
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from datetime import datetime
import json

app = FastAPI(title="Poietic Metrics Server V4", version="4.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MetricsV4:
    def __init__(self):
        self.clients: List[WebSocket] = []
        self.last_o: Dict = None
        self.last_w: Dict[str, Dict] = {}

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.clients:
            try:
                await ws.send_json(message)
            except:
                dead.append(ws)
        for ws in dead:
            self.clients.remove(ws)

metrics = MetricsV4()

@app.websocket('/ws')
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    metrics.clients.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get('type') == 'o_metrics_update':
                metrics.last_o = msg
                await metrics.broadcast({ 'type': 'o_metrics', **msg, 'timestamp': datetime.utcnow().isoformat() })
            elif msg.get('type') == 'w_metrics_update':
                uid = msg.get('user_id', 'unknown')
                metrics.last_w[uid] = msg
                await metrics.broadcast({ 'type': 'w_metrics', **msg, 'timestamp': datetime.utcnow().isoformat() })
            elif msg.get('type') == 'ping':
                await ws.send_json({ 'type': 'pong' })
    except WebSocketDisconnect:
        if ws in metrics.clients:
            metrics.clients.remove(ws)

@app.get('/')
async def root():
    return { 'service': 'metrics-v4', 'status': 'ok' }

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5004, log_level='warning')


