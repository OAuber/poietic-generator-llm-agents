#!/usr/bin/env python3
"""
Serveur AI pour Poietic Generator
- Proxy API pour LLM (Anthropic, OpenAI) - évite CORS
- Collecte et diffuse les données d'hypothèses des agents LLM en temps réel
- Dashboard analytics
- (Futur) Communication inter-IA
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from pathlib import Path
from collections import deque
import asyncio
import json
import httpx
import time
from PIL import Image
import io
import base64

app = FastAPI(title="Poietic AI Server", version="2.0.0")

# Statistiques de performance Ollama (garder les 100 dernières requêtes)
ollama_stats = deque(maxlen=100)

# CORS pour permettre les requêtes depuis les pages web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Modèles de données ===

class Hypothesis(BaseModel):
    name: str
    description: Optional[str] = None
    C_d_current: Optional[float] = None
    C_d_anticipated: Optional[float] = None
    gain: Optional[float] = None
    i_confidence: Optional[float] = None
    h_pixels: Optional[int] = None
    score: Optional[float] = None

class AnalyticsData(BaseModel):
    agent_id: str
    iteration: int
    timestamp: Optional[str] = None
    position: Optional[List[int]] = None
    strategy: Optional[str] = None
    hypotheses: Optional[List[Hypothesis]] = []
    chosen_hypothesis: Optional[str] = None
    reasoning: Optional[str] = None
    pixel_count: Optional[int] = None
    neighbor_count: Optional[int] = None

# === Stockage en mémoire ===

agents_data: Dict[str, Dict[str, Any]] = {}
connected_dashboards: List[WebSocket] = []

# Limite de l'historique par agent (éviter la saturation mémoire)
MAX_HISTORY_PER_AGENT = 100

# === Helpers ===

def get_timestamp():
    return datetime.now(timezone.utc).isoformat()

async def broadcast_to_dashboards(message: dict):
    """Diffuse un message à tous les dashboards connectés"""
    disconnected = []
    for ws in connected_dashboards:
        try:
            await ws.send_json(message)
        except:
            disconnected.append(ws)
    
    # Nettoyer les connexions mortes
    for ws in disconnected:
        if ws in connected_dashboards:
            connected_dashboards.remove(ws)

# === Endpoints REST ===

@app.get("/")
async def root():
    return HTMLResponse("""
    <html>
        <head><title>Poietic AI Server</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #0a0a0a; color: #e0e0e0;">
            <h1>🤖 Poietic AI Server</h1>
            <p>Serveur centralisé pour les agents IA du Générateur Poïétique</p>
            
            <h2>🔌 Proxy LLM (évite CORS):</h2>
            <ul>
                <li><code>POST /api/llm/anthropic</code> - Proxy Claude API</li>
                <li><code>POST /api/llm/openai</code> - Proxy OpenAI API</li>
                <li><code>POST /api/llm/ollama</code> - Proxy Ollama (OVH AI Deploy)</li>
            </ul>
            
            <h2>📊 Analytics:</h2>
            <ul>
                <li><code>POST /api/analytics/hypothesis</code> - Recevoir les données d'un agent</li>
                <li><code>GET /api/analytics/agents</code> - Liste des agents actifs</li>
                <li><code>GET /api/analytics/export</code> - Export JSON complet</li>
                <li><code>WS /analytics</code> - WebSocket temps réel pour dashboards</li>
            </ul>
            
            <p><a href="/analytics-dashboard.html" style="color: #667eea; font-size: 18px;">📊 Ouvrir le Dashboard Analytics</a></p>
            <p><a href="/ollama-stats.html" style="color: #764ba2; font-size: 18px;">🚀 Statistiques Ollama (OVH)</a></p>
            
            <p style="color: #888; font-size: 12px; margin-top: 40px;">Version 2.0.0 | Port 8003</p>
        </body>
    </html>
    """)

@app.get("/ollama-stats.html")
async def serve_ollama_stats():
    """Servir la page de statistiques Ollama"""
    try:
        from fastapi.responses import FileResponse
        current_dir = Path(__file__).resolve().parent
        stats_path = current_dir / "ollama-stats.html"
        
        if not stats_path.exists():
            return HTMLResponse(content="<h1>ollama-stats.html not found</h1>", status_code=404)
        
        return FileResponse(stats_path)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)

@app.get("/analytics-dashboard.html")
async def serve_dashboard():
    """Servir le fichier public/analytics-dashboard.html"""
    try:
        from fastapi.responses import FileResponse
        # Chercher le fichier dans le répertoire courant (où tourne le serveur)
        current_dir = Path(__file__).resolve().parent
        dashboard_path = current_dir / "public" / "analytics-dashboard.html"
        
        # Si pas trouvé, essayer un niveau au-dessus
        if not dashboard_path.exists():
            project_root = Path(__file__).resolve().parents[1]
            dashboard_path = project_root / "public" / "analytics-dashboard.html"
        
        if dashboard_path.exists():
            return FileResponse(str(dashboard_path), media_type="text/html")
        
        return JSONResponse(status_code=404, content={
            "error": "Dashboard file not found",
            "searched_paths": [
                str(current_dir / "public" / "analytics-dashboard.html"),
                str(project_root / "public" / "analytics-dashboard.html")
            ]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/analytics/hypothesis")
async def receive_hypothesis(data: AnalyticsData):
    """Recevoir les données d'hypothèses d'un agent"""
    agent_id = data.agent_id
    timestamp = data.timestamp or get_timestamp()
    
    # Initialiser l'agent si nouveau
    if agent_id not in agents_data:
        agents_data[agent_id] = {
            "agent_id": agent_id,
            "first_seen": timestamp,
            "last_seen": timestamp,
            "position": data.position,
            "iterations": []
        }
    
    # Mettre à jour les infos de l'agent
    agents_data[agent_id]["last_seen"] = timestamp
    if data.position:
        agents_data[agent_id]["position"] = data.position
    
    # Ajouter l'itération
    iteration_data = {
        "iteration": data.iteration,
        "timestamp": timestamp,
        "strategy": data.strategy,
        "hypotheses": [h.dict() for h in (data.hypotheses or [])],
        "chosen_hypothesis": data.chosen_hypothesis,
        "reasoning": data.reasoning,
        "pixel_count": data.pixel_count,
        "neighbor_count": data.neighbor_count
    }
    
    agents_data[agent_id]["iterations"].append(iteration_data)
    
    # Limiter l'historique
    if len(agents_data[agent_id]["iterations"]) > MAX_HISTORY_PER_AGENT:
        agents_data[agent_id]["iterations"] = agents_data[agent_id]["iterations"][-MAX_HISTORY_PER_AGENT:]
    
    # Diffuser aux dashboards
    await broadcast_to_dashboards({
        "type": "new_iteration",
        "agent_id": agent_id,
        "data": iteration_data
    })
    
    return {"status": "ok", "agent_id": agent_id, "iteration": data.iteration}

@app.get("/api/analytics/agents")
async def get_agents():
    """Liste des agents actifs avec leur dernière itération"""
    agents_summary = {}
    for agent_id, agent_data in agents_data.items():
        last_iteration = agent_data["iterations"][-1] if agent_data["iterations"] else None
        agents_summary[agent_id] = {
            "agent_id": agent_id,
            "position": agent_data.get("position"),
            "first_seen": agent_data["first_seen"],
            "last_seen": agent_data["last_seen"],
            "iteration_count": len(agent_data["iterations"]),
            "last_iteration": last_iteration
        }
    
    return {
        "agent_count": len(agents_summary),
        "agents": agents_summary
    }

@app.get("/api/analytics/export")
async def export_data():
    """Export complet des données en JSON"""
    return {
        "export_timestamp": get_timestamp(),
        "agent_count": len(agents_data),
        "agents": agents_data
    }

@app.get("/api/analytics/ollama/stats")
async def get_ollama_stats():
    """Statistiques de performance Ollama sur OVH"""
    if not ollama_stats:
        return {
            "total_requests": 0,
            "message": "Aucune requête Ollama enregistrée"
        }
    
    stats_list = list(ollama_stats)
    
    # Calculer les moyennes
    avg_prompt_tokens = sum(s["prompt_tokens"] for s in stats_list) / len(stats_list)
    avg_generated_tokens = sum(s["generated_tokens"] for s in stats_list) / len(stats_list)
    avg_prompt_speed = sum(s["prompt_tokens_per_sec"] for s in stats_list) / len(stats_list)
    avg_eval_speed = sum(s["eval_tokens_per_sec"] for s in stats_list) / len(stats_list)
    avg_total_time = sum(s["total_time"] for s in stats_list) / len(stats_list)
    avg_load_time = sum(s["load_time"] for s in stats_list) / len(stats_list)
    
    # Trouver min/max
    min_time = min(s["total_time"] for s in stats_list)
    max_time = max(s["total_time"] for s in stats_list)
    
    # Requêtes par minute (dernière minute)
    now = time.time()
    recent_requests = [s for s in stats_list if now - s["timestamp"] < 60]
    requests_per_minute = len(recent_requests)
    
    return {
        "total_requests": len(stats_list),
        "requests_per_minute": requests_per_minute,
        "averages": {
            "prompt_tokens": round(avg_prompt_tokens, 1),
            "generated_tokens": round(avg_generated_tokens, 1),
            "prompt_speed_tok_per_sec": round(avg_prompt_speed, 1),
            "eval_speed_tok_per_sec": round(avg_eval_speed, 1),
            "total_time_sec": round(avg_total_time, 2),
            "load_time_sec": round(avg_load_time, 2)
        },
        "response_time": {
            "min_sec": round(min_time, 2),
            "max_sec": round(max_time, 2),
            "avg_sec": round(avg_total_time, 2)
        },
        "recent_requests": stats_list[-10:]  # 10 dernières requêtes
    }

@app.get("/api/analytics/agent/{agent_id}")
async def get_agent_history(agent_id: str, limit: int = 50):
    """Historique d'un agent spécifique"""
    if agent_id not in agents_data:
        return JSONResponse(status_code=404, content={"error": "Agent not found"})
    
    agent_data = agents_data[agent_id]
    iterations = agent_data["iterations"][-limit:] if limit else agent_data["iterations"]
    
    return {
        "agent_id": agent_id,
        "position": agent_data.get("position"),
        "first_seen": agent_data["first_seen"],
        "last_seen": agent_data["last_seen"],
        "iteration_count": len(agent_data["iterations"]),
        "iterations": iterations
    }

@app.delete("/api/analytics/reset")
async def reset_data():
    """Réinitialiser toutes les données (utile pour tests)"""
    global agents_data
    agents_data = {}
    await broadcast_to_dashboards({"type": "reset"})
    return {"status": "ok", "message": "All data cleared"}

# === Proxy LLM (éviter CORS) ===

@app.post("/api/llm/anthropic")
async def proxy_anthropic(request: Request):
    """Proxy pour l'API Anthropic Claude"""
    try:
        body = await request.json()
        
        api_key = body.get("api_key")
        messages = body.get("messages")
        model = body.get("model", "claude-3-5-sonnet-20241022")
        max_tokens = body.get("max_tokens", 2000)
        
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "API key manquante"})
        
        if not messages:
            return JSONResponse(status_code=400, content={"error": "Messages manquants"})
        
        # Construire le payload pour Anthropic
        anthropic_payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages
        }
        
        # Faire la requête à l'API Anthropic
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                },
                json=anthropic_payload
            )
        
        return JSONResponse(
            status_code=response.status_code,
            content=response.json()
        )
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/grid-to-image")
async def grid_to_image(request: Request):
    """Convertir une grille de pixels en image PNG (pour LLaVA)"""
    try:
        body = await request.json()
        pixels = body.get("pixels", [])
        
        if not pixels:
            return JSONResponse(status_code=400, content={"error": "Aucun pixel fourni"})
        
        # Créer une image 20×20 (fond noir par défaut)
        img = Image.new('RGB', (20, 20), color=(0, 0, 0))
        pixels_data = img.load()
        
        # Remplir avec les pixels fournis
        for pixel in pixels:
            x = pixel.get('x')
            y = pixel.get('y')
            color = pixel.get('color')  # format #RRGGBB
            
            if x is None or y is None or color is None:
                continue
                
            if 0 <= x < 20 and 0 <= y < 20:
                # Convertir #RRGGBB en RGB
                r = int(color[1:3], 16)
                g = int(color[3:5], 16)
                b = int(color[5:7], 16)
                pixels_data[x, y] = (r, g, b)
        
        # Upscale à 200×200 (10× pour que LLaVA voit mieux)
        img = img.resize((200, 200), Image.NEAREST)
        
        # Convertir en base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        print(f"[GRID→IMAGE] Converti {len(pixels)} pixels en image 200×200")
        
        return JSONResponse(content={"image": img_base64})
        
    except Exception as e:
        print(f"[GRID→IMAGE] Erreur: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/global-canvas-image")
async def global_canvas_image(request: Request):
    """Générer une image du canvas global complet (toutes les grilles assemblées)"""
    try:
        body = await request.json()
        grids = body.get("grids", {})  # {user_id: {position: [x,y], pixels: [{x,y,color}]}}
        grid_size = body.get("grid_size", 1)  # Taille du canvas global (NxN grilles)
        my_user_id = body.get("my_user_id", None)  # ID de l'agent qui demande l'image
        
        if not grids:
            return JSONResponse(status_code=400, content={"error": "Aucune grille fournie"})
        
        # Calculer la taille de l'image finale
        # Chaque grille = 20×20 pixels, upscalée à 10× = 200×200
        cell_size = 200  # Taille d'une grille upscalée
        canvas_width = grid_size * cell_size
        canvas_height = grid_size * cell_size
        
        # Créer l'image du canvas complet (fond noir)
        canvas = Image.new('RGB', (canvas_width, canvas_height), color=(0, 0, 0))
        
        # Remplir chaque grille
        for user_id, grid_data in grids.items():
            position = grid_data.get("position", [0, 0])
            pixels = grid_data.get("pixels", [])
            
            # Position de la grille dans le canvas global
            grid_x = position[0]
            grid_y = position[1]
            
            # Créer une image 20×20 pour cette grille
            grid_img = Image.new('RGB', (20, 20), color=(0, 0, 0))
            grid_pixels = grid_img.load()
            
            # Remplir avec les pixels de l'utilisateur
            for pixel in pixels:
                x = pixel.get('x')
                y = pixel.get('y')
                color = pixel.get('color')
                
                if x is None or y is None or color is None:
                    continue
                    
                if 0 <= x < 20 and 0 <= y < 20:
                    # Convertir #RRGGBB en RGB
                    r = int(color[1:3], 16)
                    g = int(color[3:5], 16)
                    b = int(color[5:7], 16)
                    grid_pixels[x, y] = (r, g, b)
            
            # Upscale la grille à 200×200
            grid_img = grid_img.resize((cell_size, cell_size), Image.NEAREST)
            
            # Calculer la position dans le canvas global
            # Convertir position de grille en coordonnées canvas
            # Le centre du canvas est à (grid_size // 2, grid_size // 2)
            center = grid_size // 2
            canvas_x = (grid_x + center) * cell_size
            canvas_y = (grid_y + center) * cell_size
            
            # Coller la grille dans le canvas
            canvas.paste(grid_img, (canvas_x, canvas_y))
            
            # HIGHLIGHT: Si c'est la grille de l'agent actif, ajouter une bordure
            if my_user_id and user_id == my_user_id:
                from PIL import ImageDraw
                draw = ImageDraw.Draw(canvas)
                
                # Bordure jaune vif (très visible) de 4 pixels d'épaisseur
                border_color = (255, 255, 0)  # Jaune
                border_width = 4
                
                # Dessiner la bordure autour de la grille
                for i in range(border_width):
                    draw.rectangle(
                        [canvas_x + i, canvas_y + i, 
                         canvas_x + cell_size - 1 - i, canvas_y + cell_size - 1 - i],
                        outline=border_color
                    )
                
                # Ajouter une croix au centre pour bien identifier
                center_x = canvas_x + cell_size // 2
                center_y = canvas_y + cell_size // 2
                cross_size = 10
                draw.line([center_x - cross_size, center_y, center_x + cross_size, center_y], fill=border_color, width=3)
                draw.line([center_x, center_y - cross_size, center_x, center_y + cross_size], fill=border_color, width=3)
                
                print(f"[GLOBAL CANVAS] Highlighted grid for user {my_user_id} at position ({grid_x}, {grid_y})")
        
        # Convertir en base64
        buffer = io.BytesIO()
        canvas.save(buffer, format='PNG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # SAUVEGARDER le snapshot sur disque pour debug
        import os
        from datetime import datetime
        snapshot_dir = "snapshots"
        os.makedirs(snapshot_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        snapshot_filename = f"{snapshot_dir}/canvas_{timestamp}_{canvas_width}x{canvas_height}_{len(grids)}grids.png"
        canvas.save(snapshot_filename)
        
        print(f"[GLOBAL CANVAS] Généré canvas {canvas_width}×{canvas_height} avec {len(grids)} grilles")
        print(f"[GLOBAL CANVAS] 📸 Snapshot sauvegardé: {snapshot_filename}")
        
        return JSONResponse(content={
            "image": img_base64,
            "width": canvas_width,
            "height": canvas_height,
            "grid_count": len(grids)
        })
        
    except Exception as e:
        print(f"[GLOBAL CANVAS] Erreur: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/llm/ollama")
async def proxy_ollama(request: Request):
    """Proxy pour Ollama hébergé sur OVHcloud AI Deploy"""
    import time
    start_time = time.time()
    
    try:
        body = await request.json()
        
        messages = body.get("messages")
        system_prompt = body.get("system_prompt", "")  # NOUVEAU: message système séparé
        model = body.get("model", "qwen2:0.5b")
        max_tokens = body.get("max_tokens", 2000)  # Récupérer max_tokens du frontend
        
        # print(f"[DEBUG] Ollama request - max_tokens: {max_tokens}, system_prompt: {len(system_prompt)} chars")
        
        if not messages:
            return JSONResponse(status_code=400, content={"error": "Messages manquants"})
        
        # Extraire le prompt ET les images du format OpenAI-like
        user_prompt = messages[0].get("content", "") if messages else ""
        images = messages[0].get("images", []) if messages else []
        
        # if images:
        #     print(f"[DEBUG] 🖼️ {len(images)} image(s) détectée(s) pour LLaVA")
        
        # Combiner system + user en ajoutant des marqueurs pour Ollama
        if system_prompt:
            # Format Ollama avec system prompt clairement marqué
            full_prompt = f"<<SYSTEM>>\n{system_prompt}\n<</SYSTEM>>\n\n<<USER>>\n{user_prompt}\n<</USER>>"
            # print(f"[DEBUG] System prompt: {len(system_prompt)} chars")
            # print(f"[DEBUG] User prompt: {len(user_prompt)} chars")
            # print(f"[DEBUG] System (extrait): {system_prompt[:200]}...")
        else:
            full_prompt = user_prompt
        
        prompt_length = len(full_prompt)
        # print(f"[DEBUG] Prompt total: {prompt_length} chars")
        
        # URL de l'instance Ollama sur OVH
        OLLAMA_URL = "https://2d30a9cf-f8ff-4217-9edd-1c44b3f8a857.app.bhs.ai.cloud.ovh.net"
        
        # Faire la requête à Ollama avec /api/generate (format simple et fiable)
        # Intégrer le system prompt AVANT le user prompt avec un marqueur clair
        if system_prompt:
            # Format optimisé pour que Ollama comprenne la hiérarchie
            full_prompt = f"""<<INSTRUCTIONS SYSTÈME - À SUIVRE STRICTEMENT>>

{system_prompt}

<<FIN INSTRUCTIONS - DÉBUT CONTEXTE UTILISATEUR>>

{user_prompt}"""
            # print(f"[DEBUG] System prompt intégré: {len(system_prompt)} chars")
            # print(f"[DEBUG] User prompt: {len(user_prompt)} chars")
        else:
            full_prompt = user_prompt
        
        ollama_payload = {
            "model": model,
            "prompt": full_prompt,
            "stream": False,
            "options": {
                "num_ctx": 8192,
                "num_predict": max_tokens,
                "temperature": 0.8,
                "repeat_penalty": 1.1,
                "top_k": 50,
                "top_p": 0.95
            }
        }
        
        # Ajouter les images si présentes (pour LLaVA)
        if images:
            ollama_payload["images"] = images
            # print(f"[DEBUG] 🖼️ Images ajoutées au payload Ollama")
        
        endpoint = "/api/generate"
        
        # print(f"[DEBUG] Using Ollama endpoint: {endpoint}")
        # print(f"[DEBUG] Full prompt length: {len(full_prompt)} chars (~{len(full_prompt)//4} tokens)")
        # print(f"[DEBUG] Sending to Ollama - num_predict: {max_tokens}, temp: 0.8, repeat_penalty: 1.1")
        
        # IMPORTANT: Afficher les 500 derniers caractères pour voir le "YOUR TURN"
        # print(f"[DEBUG] Fin du prompt envoyé: ...{full_prompt[-500:]}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minutes pour llama3.1:8b
            response = await client.post(
                f"{OLLAMA_URL}{endpoint}",
                json=ollama_payload
            )
        
        if response.status_code != 200:
            return JSONResponse(
                status_code=response.status_code,
                content={
                    "error": f"Ollama error: {response.status_code}",
                    "detail": response.text
                }
            )
        
        ollama_response = response.json()
        
        # Extraire le texte généré (toujours /api/generate maintenant)
        generated_text = ollama_response.get("response", "")
        
        # Extraire les métriques de performance
        total_duration_ms = ollama_response.get("total_duration", 0) / 1_000_000  # ns -> ms
        load_duration_ms = ollama_response.get("load_duration", 0) / 1_000_000
        prompt_eval_duration_ms = ollama_response.get("prompt_eval_duration", 0) / 1_000_000
        eval_duration_ms = ollama_response.get("eval_duration", 0) / 1_000_000
        
        prompt_eval_count = ollama_response.get("prompt_eval_count", 0)
        eval_count = ollama_response.get("eval_count", 0)
        
        # Calculer les tokens/sec
        prompt_tokens_per_sec = (prompt_eval_count / (prompt_eval_duration_ms / 1000)) if prompt_eval_duration_ms > 0 else 0
        eval_tokens_per_sec = (eval_count / (eval_duration_ms / 1000)) if eval_duration_ms > 0 else 0
        
        request_time = time.time() - start_time
        
        # Afficher les stats de performance
        print(f"[PERF] Ollama {model} | Prompt: {prompt_length} chars, {prompt_eval_count} tokens | "
              f"Generated: {eval_count} tokens | "
              f"Speed: {prompt_tokens_per_sec:.1f} tok/s (prompt), {eval_tokens_per_sec:.1f} tok/s (gen) | "
              f"Time: {request_time:.2f}s (total: {total_duration_ms/1000:.2f}s, load: {load_duration_ms/1000:.2f}s)")
        
        # Enregistrer les stats
        ollama_stats.append({
            "timestamp": time.time(),
            "model": model,
            "prompt_length": prompt_length,
            "prompt_tokens": prompt_eval_count,
            "generated_tokens": eval_count,
            "prompt_tokens_per_sec": round(prompt_tokens_per_sec, 1),
            "eval_tokens_per_sec": round(eval_tokens_per_sec, 1),
            "total_time": round(request_time, 2),
            "load_time": round(load_duration_ms / 1000, 2),
            "prompt_eval_time": round(prompt_eval_duration_ms / 1000, 2),
            "eval_time": round(eval_duration_ms / 1000, 2)
        })
        
        # Convertir au format attendu par le frontend
        # Utiliser generated_text qui a été extrait selon l'endpoint
        
        return JSONResponse(content={
            "response": generated_text,
            "model": model,
            "done": ollama_response.get("done", True)
        })
    
    except httpx.TimeoutException as e:
        print(f"[ERROR] Ollama timeout: {e}")
        return JSONResponse(
            status_code=504,
            content={"error": "Ollama timeout - le modèle met trop de temps à répondre"}
        )
    except httpx.ConnectError as e:
        print(f"[ERROR] Ollama connection error: {e}")
        return JSONResponse(
            status_code=503,
            content={"error": "Impossible de se connecter au serveur Ollama sur OVH"}
        )
    except Exception as e:
        error_msg = str(e) if str(e) else f"Erreur inconnue: {type(e).__name__}"
        print(f"[ERROR] Ollama proxy error: {error_msg}")
        return JSONResponse(
            status_code=500,
            content={"error": error_msg}
        )

@app.post("/api/llm/openai")
async def proxy_openai(request: Request):
    """Proxy pour l'API OpenAI GPT"""
    try:
        body = await request.json()
        
        api_key = body.get("api_key")
        messages = body.get("messages")
        model = body.get("model", "gpt-4o-mini")
        max_tokens = body.get("max_tokens", 2000)
        
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "API key manquante"})
        
        if not messages:
            return JSONResponse(status_code=400, content={"error": "Messages manquants"})
        
        # Construire le payload pour OpenAI
        openai_payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages
        }
        
        # Faire la requête à l'API OpenAI
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                },
                json=openai_payload
            )
        
        return JSONResponse(
            status_code=response.status_code,
            content=response.json()
        )
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# === WebSocket pour dashboards ===

@app.websocket("/analytics")
async def websocket_analytics(websocket: WebSocket):
    """WebSocket pour diffuser les données en temps réel aux dashboards"""
    await websocket.accept()
    connected_dashboards.append(websocket)
    
    # Envoyer l'état initial
    try:
        await websocket.send_json({
            "type": "initial_state",
            "agent_count": len(agents_data),
            "agents": {
                agent_id: {
                    "agent_id": agent_id,
                    "position": agent_data.get("position"),
                    "last_seen": agent_data["last_seen"],
                    "iteration_count": len(agent_data["iterations"]),
                    "last_iteration": agent_data["iterations"][-1] if agent_data["iterations"] else None
                }
                for agent_id, agent_data in agents_data.items()
            }
        })
        
        # Maintenir la connexion
        while True:
            # Ping/pong pour détecter les déconnexions
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except:
                await asyncio.sleep(1)
    
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in connected_dashboards:
            connected_dashboards.remove(websocket)

# === Heartbeat pour nettoyer les agents inactifs ===

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_inactive_agents())

async def cleanup_inactive_agents():
    """Nettoyer les agents inactifs après 5 minutes"""
    while True:
        await asyncio.sleep(60)  # Vérifier toutes les minutes
        now = datetime.now(timezone.utc)
        inactive_threshold = 300  # 5 minutes
        
        to_remove = []
        for agent_id, agent_data in agents_data.items():
            try:
                last_seen = datetime.fromisoformat(agent_data["last_seen"])  # déjà en UTC ISO8601
                if (now - last_seen).total_seconds() > inactive_threshold:
                    to_remove.append(agent_id)
            except:
                pass
        
        for agent_id in to_remove:
            del agents_data[agent_id]
            await broadcast_to_dashboards({
                "type": "agent_removed",
                "agent_id": agent_id
            })

if __name__ == "__main__":
    import uvicorn
    print("🤖 Démarrage du Poietic AI Server...")
    print("🔌 Proxy LLM: http://localhost:8003/api/llm/")
    print("📊 Dashboard Analytics: http://localhost:8003/analytics-dashboard.html")
    print("🚀 Ollama Stats: http://localhost:8003/ollama-stats.html")
    print("🔌 WebSocket Analytics: ws://localhost:8003/analytics")
    print("⚙️  Port: 8003")
    # Configuration avec timeout de 7 minutes (420 secondes) pour requêtes longues
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info", timeout_keep_alive=420)
