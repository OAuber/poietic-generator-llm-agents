#!/usr/bin/env python3
"""
API REST pour faire le pont entre le bot et Claude
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
import json
import time
import os
from datetime import datetime

app = FastAPI(title="Claude Bot Bridge API", version="1.0.0")

# Modèles de données
class Pixel(BaseModel):
    x: int
    y: int
    color: str
    reason: str

class DrawingInstruction(BaseModel):
    strategy: str
    pixels: List[Pixel]

class EnvironmentState(BaseModel):
    my_cell: Dict
    other_users: List[Dict]
    global_environment: Dict
    iteration: int
    timestamp: float

class ClaudeResponse(BaseModel):
    instruction: Optional[DrawingInstruction] = None
    status: str  # "waiting", "ready", "error"
    message: str = ""

# État global de l'API
current_state: Optional[EnvironmentState] = None
pending_instruction: Optional[DrawingInstruction] = None
api_status = "idle"  # "idle", "waiting_for_claude", "ready"
current_prompt: str = ""  # Prompt libre pour orienter Claude

# Fichiers de pont (pour permettre à Claude de lire/écrire via le workspace)
BRIDGE_DIR = os.path.dirname(__file__)
ENV_PATH = os.path.join(BRIDGE_DIR, ".bridge_environment.json")
INSTR_PATH = os.path.join(BRIDGE_DIR, ".bridge_instruction.json")

def write_json_atomic(target_path: str, data: dict):
    """Écrit un JSON de façon atomique pour éviter les lectures partielles."""
    tmp_path = f"{target_path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, target_path)

def safe_unlink(path: str):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass

# Journal succinct des analyses/décisions (en mémoire + fichier optionnel)
MAX_EVENTS = 200
events: List[Dict] = []

def add_event(event: Dict):
    event["ts"] = datetime.now().isoformat()
    events.append(event)
    if len(events) > MAX_EVENTS:
        del events[: len(events) - MAX_EVENTS]

@app.get("/")
async def root():
    return FileResponse("web_interface.html")

@app.get("/api/")
async def api_root():
    return {
        "message": "Claude Bot Bridge API",
        "status": api_status,
        "current_iteration": current_state.iteration if current_state else 0,
        "has_prompt": bool(current_prompt)
    }

@app.post("/api/submit_environment")
async def submit_environment(state: EnvironmentState):
    """Le bot soumet l'état de l'environnement et attend une instruction de Claude."""
    global current_state, api_status, pending_instruction
    
    current_state = state
    api_status = "waiting_for_claude"
    pending_instruction = None
    
    print(f"\n{'='*80}")
    print(f"🤖 BOT A SOUMIS L'ÉTAT DE L'ENVIRONNEMENT - ITÉRATION {state.iteration}")
    print(f"{'='*80}")
    print(f"📊 MA CELLULE:")
    print(f"   - {state.my_cell['pixel_count']} pixels dessinés sur 400 possibles")
    print(f"   - Densité: {state.my_cell['density']:.1%}")
    print(f"   - Couleurs: {state.my_cell['colors']}")
    
    print(f"\n👥 AUTRES UTILISATEURS ({len(state.other_users)}):")
    for i, user in enumerate(state.other_users, 1):
        print(f"   - Utilisateur {i} ({user['user_id']}): {user['pixel_count']} pixels, couleurs: {user['colors']}")
    
    print(f"\n🌍 ENVIRONNEMENT GLOBAL:")
    print(f"   - {state.global_environment['distinct_colors']} couleurs différentes")
    print(f"   - Activité totale: {state.global_environment['total_activity']} pixels")
    
    print(f"\n{'='*80}")
    print("🎨 CLAUDE, DONNEZ VOS INSTRUCTIONS DE DESSIN !")
    print("📋 Répondez avec le JSON suivant :")
    print("""
{
    "strategy": "description de votre stratégie artistique",
    "pixels": [
        {"x": 5, "y": 7, "color": "#FF6B6B", "reason": "créer un point focal"},
        {"x": 6, "y": 7, "color": "#4ECDC4", "reason": "compléter le motif"}
    ]
}
""")
    print("Règles: x et y entre 0 et 19, couleurs en format hex (#RRGGBB), jusqu'à 400 pixels si pertinent")
    print(f"{'='*80}")
    
    # Écrire l'environnement dans le fichier de pont
    try:
        write_json_atomic(ENV_PATH, {
            "my_cell": state.my_cell,
            "other_users": state.other_users,
            "global_environment": state.global_environment,
            "iteration": state.iteration,
            "timestamp": state.timestamp,
            "api_status": api_status
        })
    except Exception as e:
        print(f"⚠️ Impossible d'écrire {ENV_PATH}: {e}")

    # Ajouter un événement succinct
    try:
        add_event({
            "type": "environment",
            "iteration": state.iteration,
            "my_pixel_count": state.my_cell.get("pixel_count"),
            "my_density": state.my_cell.get("density"),
            "other_users": len(state.other_users),
            "distinct_colors": state.global_environment.get("distinct_colors")
        })
    except Exception:
        pass

    return {
        "status": "waiting_for_claude",
        "message": "État reçu, en attente des instructions de Claude",
        "iteration": state.iteration
    }

@app.post("/api/submit_instruction")
async def submit_claude_instruction(instruction: DrawingInstruction):
    """Claude soumet ses instructions de dessin."""
    global pending_instruction, api_status
    
    if api_status != "waiting_for_claude":
        raise HTTPException(status_code=400, detail="Aucune demande en attente")
    
    pending_instruction = instruction
    api_status = "ready"
    
    print(f"\n✅ CLAUDE A RÉPONDU !")
    print(f"🎯 Stratégie: {instruction.strategy}")
    print(f"✏️ {len(instruction.pixels)} pixels à dessiner")
    for pixel in instruction.pixels:
        print(f"   - ({pixel.x},{pixel.y}) = {pixel.color} - {pixel.reason}")
    
    # Écrire les instructions dans le fichier de pont
    try:
        write_json_atomic(INSTR_PATH, json.loads(instruction.json()))
    except Exception as e:
        print(f"⚠️ Impossible d'écrire {INSTR_PATH}: {e}")

    # Journaliser l'instruction succincte
    try:
        add_event({
            "type": "decision",
            "strategy": instruction.strategy,
            "pixels": len(instruction.pixels)
        })
    except Exception:
        pass
    
    return {
        "status": "ready",
        "message": "Instructions reçues et prêtes à être exécutées",
        "pixel_count": len(instruction.pixels)
    }

@app.get("/api/get_instruction")
async def get_instruction():
    """Le bot récupère les instructions de Claude."""
    global pending_instruction, api_status
    
    if api_status == "ready" and pending_instruction:
        instruction = pending_instruction
        # Réinitialiser pour la prochaine itération
        pending_instruction = None
        api_status = "idle"
        
        return {
            "status": "ready",
            "instruction": instruction
        }
    elif api_status == "waiting_for_claude":
        return {
            "status": "waiting",
            "message": "En attente des instructions de Claude"
        }
    else:
        return {
            "status": "idle",
            "message": "Aucune instruction disponible"
        }

@app.get("/api/status")
async def get_status():
    """Statut de l'API."""
    return {
        "api_status": api_status,
        "current_iteration": current_state.iteration if current_state else 0,
        "has_pending_instruction": pending_instruction is not None,
        "timestamp": datetime.now().isoformat(),
        "has_prompt": bool(current_prompt)
    }

@app.post("/api/reset")
async def reset():
    """Réinitialiser l'API."""
    global current_state, pending_instruction, api_status
    current_state = None
    pending_instruction = None
    api_status = "idle"
    global current_prompt
    current_prompt = ""
    # Nettoyer les fichiers de pont
    safe_unlink(ENV_PATH)
    safe_unlink(INSTR_PATH)
    return {"message": "API réinitialisée"}

class PromptBody(BaseModel):
    prompt: str

@app.post("/api/prompt")
async def set_prompt(body: PromptBody):
    """Définit un prompt libre pour orienter Claude."""
    global current_prompt
    current_prompt = body.prompt or ""
    add_event({"type": "prompt", "length": len(current_prompt)})
    return {"message": "Prompt mis à jour", "length": len(current_prompt)}

@app.get("/api/prompt")
async def get_prompt():
    return {"prompt": current_prompt}

class EventBody(BaseModel):
    type: str
    message: str = ""

@app.post("/api/event")
async def push_event(body: EventBody):
    try:
        add_event({"type": body.type, "message": body.message})
        return {"status": "ok"}
    except Exception:
        return {"status": "err"}

@app.get("/api/environment")
async def get_environment():
    """Récupère l'état actuel de l'environnement."""
    if current_state is None:
        raise HTTPException(status_code=404, detail="Aucun état d'environnement disponible")
    
    return {
        "my_cell": current_state.my_cell,
        "other_users": current_state.other_users,
        "global_environment": current_state.global_environment,
        "iteration": current_state.iteration,
        "timestamp": current_state.timestamp
    }

@app.get("/api/events")
async def get_events(limit: int = 50):
    """Récupère les derniers événements (analyses/décisions) de façon succincte."""
    try:
        data = events[-limit:]
        return JSONResponse(data)
    except Exception:
        return JSONResponse([])

if __name__ == "__main__":
    import uvicorn
    print("🚀 Démarrage de l'API Claude Bot Bridge...")
    print("📡 L'API sera disponible sur http://localhost:8001")
    print("📋 Documentation sur http://localhost:8001/docs")
    uvicorn.run(app, host="0.0.0.0", port=8001)