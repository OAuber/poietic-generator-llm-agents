#!/usr/bin/env python3
"""
Poietic Generator - API REST pour IA
====================================

Serveur API REST qui facilite l'accès au Poietic Generator pour les IA/LLM
qui ne peuvent pas gérer directement des WebSockets.

Cette API maintient des sessions WebSocket en arrière-plan et expose
des endpoints HTTP simples pour dessiner et obtenir l'état.

Usage:
    python api_server.py --port 8000
    
Ensuite, utilisez l'API REST sur http://localhost:8000
"""

import asyncio
import logging
from typing import Dict, Optional, List, Tuple
from datetime import datetime
import uuid

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from poietic_client import PoieticClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# Modèles de données
# ============================================================================

class CreateSessionRequest(BaseModel):
    """Requête pour créer une nouvelle session."""
    poietic_url: str = "ws://localhost:3001/updates"
    name: Optional[str] = None


class CreateSessionResponse(BaseModel):
    """Réponse de création de session."""
    session_id: str
    status: str
    message: str


class DrawPixelRequest(BaseModel):
    """Requête pour dessiner un pixel."""
    x: int
    y: int
    color: str


class DrawMultipleRequest(BaseModel):
    """Requête pour dessiner plusieurs pixels."""
    pixels: List[Tuple[int, int, str]]  # [(x, y, color), ...]


class SessionInfo(BaseModel):
    """Informations sur une session."""
    session_id: str
    name: Optional[str]
    poietic_user_id: Optional[str]
    is_connected: bool
    grid_size: int
    user_count: int
    created_at: str


class CellState(BaseModel):
    """État de la cellule d'un utilisateur."""
    pixels: Dict[str, str]  # {"x,y": "#RRGGBB"}
    pixel_count: int


# ============================================================================
# Gestionnaire de sessions
# ============================================================================

class SessionManager:
    """Gère les sessions WebSocket en arrière-plan."""
    
    def __init__(self):
        self.sessions: Dict[str, PoieticClient] = {}
        self.session_metadata: Dict[str, dict] = {}
        
    async def create_session(
        self, 
        poietic_url: str, 
        name: Optional[str] = None
    ) -> str:
        """Crée une nouvelle session et se connecte au serveur Poietic."""
        session_id = str(uuid.uuid4())
        
        # Créer le client
        client = PoieticClient(url=poietic_url)
        
        # Se connecter
        try:
            await client.connect()
        except Exception as e:
            logger.error(f"Erreur de connexion: {e}")
            raise HTTPException(status_code=500, detail=f"Erreur de connexion: {e}")
            
        # Attendre l'état initial
        await asyncio.sleep(1)
        
        # Stocker la session
        self.sessions[session_id] = client
        self.session_metadata[session_id] = {
            "name": name,
            "poietic_url": poietic_url,
            "created_at": datetime.now().isoformat()
        }
        
        logger.info(f"Session créée: {session_id} (Poietic user: {client.my_user_id})")
        return session_id
        
    def get_session(self, session_id: str) -> PoieticClient:
        """Récupère une session."""
        if session_id not in self.sessions:
            raise HTTPException(status_code=404, detail="Session non trouvée")
        return self.sessions[session_id]
        
    async def close_session(self, session_id: str):
        """Ferme une session."""
        if session_id in self.sessions:
            client = self.sessions[session_id]
            await client.disconnect()
            del self.sessions[session_id]
            del self.session_metadata[session_id]
            logger.info(f"Session fermée: {session_id}")
            
    def list_sessions(self) -> List[dict]:
        """Liste toutes les sessions actives."""
        result = []
        for session_id, client in self.sessions.items():
            metadata = self.session_metadata.get(session_id, {})
            result.append({
                "session_id": session_id,
                "name": metadata.get("name"),
                "poietic_user_id": client.my_user_id,
                "is_connected": client.is_connected,
                "grid_size": client.grid_size,
                "user_count": len(client.user_positions),
                "created_at": metadata.get("created_at")
            })
        return result


# ============================================================================
# Application FastAPI
# ============================================================================

app = FastAPI(
    title="Poietic Generator API for AI",
    description="API REST pour permettre aux IA d'interagir avec Poietic Generator",
    version="1.0.0"
)

# CORS pour permettre les requêtes depuis n'importe où
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gestionnaire de sessions global
manager = SessionManager()


# ============================================================================
# Routes
# ============================================================================

@app.get("/")
async def root():
    """Page d'accueil de l'API."""
    return {
        "name": "Poietic Generator API for AI",
        "version": "1.0.0",
        "docs": "/docs",
        "active_sessions": len(manager.sessions)
    }


@app.post("/sessions", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    """
    Crée une nouvelle session et se connecte au serveur Poietic.
    
    Returns:
        session_id: Identifiant de la session à utiliser pour les requêtes suivantes
    """
    try:
        session_id = await manager.create_session(
            poietic_url=request.poietic_url,
            name=request.name
        )
        return CreateSessionResponse(
            session_id=session_id,
            status="connected",
            message="Session créée avec succès"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions", response_model=List[SessionInfo])
async def list_sessions():
    """Liste toutes les sessions actives."""
    return manager.list_sessions()


@app.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Récupère les informations d'une session."""
    client = manager.get_session(session_id)
    metadata = manager.session_metadata.get(session_id, {})
    
    return SessionInfo(
        session_id=session_id,
        name=metadata.get("name"),
        poietic_user_id=client.my_user_id,
        is_connected=client.is_connected,
        grid_size=client.grid_size,
        user_count=len(client.user_positions),
        created_at=metadata.get("created_at", "")
    )


@app.delete("/sessions/{session_id}")
async def close_session(session_id: str):
    """Ferme une session."""
    await manager.close_session(session_id)
    return {"status": "closed", "message": "Session fermée"}


@app.get("/sessions/{session_id}/cell", response_model=CellState)
async def get_my_cell(session_id: str):
    """Récupère l'état de ma cellule."""
    client = manager.get_session(session_id)
    cell = client.get_my_cell()
    
    # Convertir en format string key
    pixels = {f"{x},{y}": color for (x, y), color in cell.items()}
    
    return CellState(
        pixels=pixels,
        pixel_count=len(pixels)
    )


@app.get("/sessions/{session_id}/users")
async def get_users(session_id: str):
    """Liste tous les utilisateurs connectés."""
    client = manager.get_session(session_id)
    
    users = []
    for user_id in client.get_all_users():
        position = client.user_positions.get(user_id)
        users.append({
            "user_id": user_id,
            "position": position,
            "is_me": user_id == client.my_user_id
        })
        
    return {
        "users": users,
        "count": len(users)
    }


@app.get("/sessions/{session_id}/users/{user_id}/cell", response_model=CellState)
async def get_user_cell(session_id: str, user_id: str):
    """Récupère l'état de la cellule d'un autre utilisateur."""
    client = manager.get_session(session_id)
    cell = client.get_user_cell(user_id)
    
    # Convertir en format string key
    pixels = {f"{x},{y}": color for (x, y), color in cell.items()}
    
    return CellState(
        pixels=pixels,
        pixel_count=len(pixels)
    )


@app.post("/sessions/{session_id}/draw")
async def draw_pixel(session_id: str, request: DrawPixelRequest):
    """Dessine un pixel dans ma cellule."""
    client = manager.get_session(session_id)
    
    if not (0 <= request.x < 20 and 0 <= request.y < 20):
        raise HTTPException(
            status_code=400, 
            detail="Coordonnées invalides. x et y doivent être entre 0 et 19"
        )
        
    try:
        await client.draw(request.x, request.y, request.color)
        return {
            "status": "success",
            "x": request.x,
            "y": request.y,
            "color": request.color
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sessions/{session_id}/draw/multiple")
async def draw_multiple_pixels(session_id: str, request: DrawMultipleRequest):
    """Dessine plusieurs pixels d'un coup."""
    client = manager.get_session(session_id)
    
    # Valider toutes les coordonnées
    for x, y, _ in request.pixels:
        if not (0 <= x < 20 and 0 <= y < 20):
            raise HTTPException(
                status_code=400,
                detail=f"Coordonnées invalides: ({x}, {y})"
            )
            
    try:
        await client.draw_multiple(request.pixels)
        return {
            "status": "success",
            "count": len(request.pixels)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.on_event("shutdown")
async def shutdown_event():
    """Ferme toutes les sessions au shutdown."""
    logger.info("Fermeture de toutes les sessions...")
    session_ids = list(manager.sessions.keys())
    for session_id in session_ids:
        await manager.close_session(session_id)


# ============================================================================
# Main
# ============================================================================

def main():
    """Lance le serveur API."""
    import argparse
    
    parser = argparse.ArgumentParser(description="API REST pour Poietic Generator")
    parser.add_argument("--host", default="0.0.0.0", help="Host à écouter")
    parser.add_argument("--port", type=int, default=8000, help="Port à écouter")
    
    args = parser.parse_args()
    
    logger.info(f"🚀 Démarrage de l'API sur http://{args.host}:{args.port}")
    logger.info(f"📖 Documentation: http://{args.host}:{args.port}/docs")
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()


