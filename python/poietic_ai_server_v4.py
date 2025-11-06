#!/usr/bin/env python3
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
import httpx
import json
import os
import base64

# App sera créé après la définition du lifespan

class OSnapshotStore:
    def __init__(self):
        self.latest: Optional[dict] = None
        self.version: int = 0
        self.latest_image_base64: Optional[str] = None  # PNG base64 (sans préfixe data:)
        self.agents_count: int = 0

    def set_snapshot(self, snapshot: dict):
        self.version += 1
        snapshot['version'] = self.version
        snapshot['timestamp'] = datetime.now(timezone.utc).isoformat()
        self.latest = snapshot

    def set_image(self, image_base64: str):
        self.latest_image_base64 = image_base64
    
    def set_agents_count(self, n: int):
        try:
            self.agents_count = max(0, int(n))
        except Exception:
            self.agents_count = 0

store = OSnapshotStore()

# Charger le prompt O
O_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'gemini-prompts-v4-observation.json')
o_prompt_template = None

def load_o_prompt():
    global o_prompt_template
    if o_prompt_template is None:
        try:
            with open(O_PROMPT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                o_prompt_template = '\n'.join(data.get('system', []))
        except Exception as e:
            print(f"[O] Erreur chargement prompt: {e}")
            o_prompt_template = "You are an O-machine. Analyze the image and return JSON with structures, narrative, and simplicity_assessment."
    return o_prompt_template

async def call_gemini_o(image_base64: str, agents_count: int, previous_snapshot: Optional[dict] = None) -> Optional[dict]:
    """Appelle Gemini avec l'image globale pour analyse O"""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[O] GEMINI_API_KEY non définie, utilisation du mock")
        return None
    
    prompt = load_o_prompt()
    # Injecter agents_count dans le prompt (remplacer toutes les occurrences)
    prompt = prompt.replace('{{agents_count}}', str(agents_count))
    
    # Log pour vérification
    if '{{agents_count}}' in prompt:
        print(f"[O] ⚠️ Avertissement: {{agents_count}} non remplacé dans le prompt")
    else:
        print(f"[O] Prompt chargé avec {agents_count} agents injectés")
    
    # Préparer le body Gemini
    parts = [{'text': prompt}]
    if image_base64:
        # Nettoyer le préfixe data: si présent
        clean_base64 = image_base64
        if clean_base64.startswith('data:image/png;base64,'):
            clean_base64 = clean_base64.replace('data:image/png;base64,', '')
        parts.append({
            'inline_data': {
                'mime_type': 'image/png',
                'data': clean_base64
            }
        })
    
    url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={api_key}"
    body = {
        'contents': [{'parts': parts}],
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 8000
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=body)
            if not resp.is_success:
                error_text = await resp.text()
                print(f"[O] Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return None
            data = resp.json()
            
            # Extraire le texte de la réponse
            text = ''
            if data.get('candidates') and len(data['candidates']) > 0:
                content = data['candidates'][0].get('content', {})
                for part in content.get('parts', []):
                    if 'text' in part:
                        text += part['text']
            
            if not text:
                print("[O] Réponse Gemini vide")
                return None
            
            # Parser JSON (tentative de nettoyage si nécessaire)
            import re
            original_text = text
            
            try:
                # Enlever markdown code blocks si présents
                text = text.strip()
                if text.startswith('```'):
                    lines = text.split('\n')
                    text = '\n'.join(lines[1:-1]) if len(lines) > 2 else text
                if '```json' in text:
                    text = re.sub(r'```json\s*', '', text)
                    text = re.sub(r'```\s*$', '', text).strip()
                
                # Essayer de parser directement d'abord
                try:
                    parsed = json.loads(text)
                    return parsed
                except json.JSONDecodeError:
                    pass
                
                # Si échec, extraire le JSON entre { et } le plus externe
                first_brace = text.find('{')
                last_brace = text.rfind('}')
                if first_brace != -1 and last_brace > first_brace:
                    json_slice = text[first_brace:last_brace+1]
                    
                    # Nettoyer les caractères de contrôle dans les valeurs JSON
                    # Utiliser une approche plus robuste avec regex pour remplacer les retours à la ligne dans les valeurs
                    # Pattern: trouver les valeurs de chaînes et remplacer les \n par des espaces
                    def fix_json_strings(s):
                        # Trouver toutes les chaînes JSON (entre guillemets) et nettoyer les retours à la ligne
                        def replace_in_string(match):
                            full_match = match.group(0)
                            # Extraire la clé et la valeur
                            if ':' in full_match:
                                key_part, value_part = full_match.split(':', 1)
                                # Nettoyer la valeur (enlever retours à la ligne, garder structure)
                                value_cleaned = value_part.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                                # Nettoyer les espaces multiples
                                value_cleaned = re.sub(r'\s+', ' ', value_cleaned).strip()
                                return key_part + ':' + value_cleaned
                            return full_match
                        
                        # Pattern pour trouver les paires clé:valeur avec valeurs de chaînes multi-lignes
                        # Chercher ": "..." avec retours à la ligne possibles
                        pattern = r'":\s*"([^"]*(?:\n[^"]*)*)"'
                        def clean_value(m):
                            value = m.group(1)
                            # Remplacer retours à la ligne par espaces
                            value = value.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                            value = re.sub(r'\s+', ' ', value).strip()
                            return '": "' + value + '"'
                        
                        s = re.sub(pattern, clean_value, s, flags=re.MULTILINE)
                        return s
                    
                    json_slice = fix_json_strings(json_slice)
                    # Nettoyer aussi les retours à la ligne hors des chaînes (structure JSON)
                    json_slice = re.sub(r'\n\s*', ' ', json_slice)  # Remplacer retours à la ligne + indentation par espace
                    json_slice = re.sub(r'\s+', ' ', json_slice)  # Nettoyer espaces multiples
                    
                    # Essayer de parser
                    try:
                        parsed = json.loads(json_slice)
                        print("[O] JSON réparé avec succès (extraction + nettoyage)")
                        return parsed
                    except json.JSONDecodeError as e2:
                        print(f"[O] Réparation échouée: {e2}")
                        print(f"[O] Position erreur: ligne {e2.lineno}, colonne {e2.colno}")
                        print(f"[O] Contexte: {json_slice[max(0, e2.pos-50):e2.pos+50]}")
                
            except Exception as e:
                print(f"[O] Erreur parsing JSON: {e}")
                print(f"[O] Texte reçu (premiers 1500 chars):\n{original_text[:1500]}")
            
            return None
                
    except Exception as e:
        print(f"[O] Erreur appel Gemini: {e}")
        return None

async def periodic_o_task():
    """Tâche périodique O : appelle Gemini avec l'image globale toutes les 25s"""
    while True:
        await asyncio.sleep(25)  # Attendre avant le premier appel
        
        # Vérifier qu'on a une image et des agents
        if not store.latest_image_base64:
            print("[O] Pas d'image disponible, attente...")
            continue
        
        if store.agents_count == 0:
            print("[O] Pas d'agents, attente...")
            continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        print(f"[O] Analyse avec Gemini ({store.agents_count} agents, image: {img_size} bytes)...")
        previous = store.latest
        
        # Appeler Gemini avec l'image
        result = await call_gemini_o(store.latest_image_base64, store.agents_count, previous)
        
        if result:
            # Valider et normaliser la structure
            snapshot = {
                'structures': result.get('structures', []),
                'narrative': result.get('narrative', {'summary': ''}),
                'simplicity_assessment': result.get('simplicity_assessment', {
                    'C_w_current': {'value': 0},
                    'C_d_current': {'value': 0},
                    'U_current': {'value': 0}
                }),
                'agents_count': store.agents_count
            }
            # S'assurer que reasoning existe
            if 'reasoning' not in snapshot['simplicity_assessment']:
                snapshot['simplicity_assessment']['reasoning'] = 'No reasoning provided'
            
            store.set_snapshot(snapshot)
            print(f"[O] Snapshot mis à jour (version {store.version}, {len(snapshot['structures'])} structures)")
        else:
            # Fallback: conserver le dernier snapshot valide plutôt que d'utiliser des valeurs mockées erronées
            print("[O] Échec Gemini, conservation du dernier snapshot valide")
            if store.latest:
                print(f"[O] Conservation snapshot version {store.version} ({len(store.latest.get('structures', []))} structures)")
                # Ne pas mettre à jour, garder le dernier snapshot valide
            else:
                # Seulement si aucun snapshot n'existe, créer un snapshot minimal
                print("[O] Aucun snapshot précédent, création snapshot minimal")
                snapshot = {
                    'structures': [],
                    'narrative': { 'summary': 'Waiting for first successful O analysis...' },
                    'simplicity_assessment': {
                        'C_w_current': { 'value': 0, 'rationale': 'No analysis available' },
                        'C_d_current': { 'value': 0, 'description': 'No analysis available' },
                        'U_current':   { 'value': 0, 'interpretation': 'WEAK_EMERGENCE' },
                        'reasoning': '[MOCK FALLBACK] Gemini unavailable. No previous snapshot available.'
                    },
                    'agents_count': store.agents_count
                }
                store.set_snapshot(snapshot)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    asyncio.create_task(periodic_o_task())
    yield
    # Shutdown (si nécessaire)

app = FastAPI(title="Poietic AI Server V4", version="4.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/o/latest")
async def get_latest_o():
    return store.latest or {
        'version': 0,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'structures': [],
        'narrative': { 'summary': '' },
        'simplicity_assessment': {
            'C_w_current': { 'value': 0 },
            'C_d_current': { 'value': 0 },
            'U_current':   { 'value': 0 }
        }
    }

@app.post("/o/image")
async def post_o_image(payload: dict = Body(...)):
    # payload: { "image_base64": "..." } — accepte dataURL complet ou base64 pur
    img = payload.get('image_base64') or ''
    agents = payload.get('agents_count')
    if img.startswith('data:image/png;base64,'):
        img = img.replace('data:image/png;base64,', '')
    # Validation rapide base64
    if not img or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in img):
        return { 'ok': False, 'error': 'invalid_base64' }
    store.set_image(img)
    if agents is not None:
        store.set_agents_count(agents)
    return { 'ok': True, 'timestamp': datetime.now(timezone.utc).isoformat(), 'agents_count': store.agents_count }

@app.get("/o/image")
async def get_o_image():
    # Retourne l'image PNG base64 (sans préfixe), pour diagnostic ou réinjection dans prompts O
    return { 'image_base64': store.latest_image_base64, 'timestamp': datetime.now(timezone.utc).isoformat() }

@app.post("/o/agents")
async def post_o_agents(payload: dict = Body(...)):
    n = payload.get('count')
    if n is None:
        return { 'ok': False, 'error': 'missing_count' }
    store.set_agents_count(n)
    return { 'ok': True, 'agents_count': store.agents_count, 'timestamp': datetime.now(timezone.utc).isoformat() }

@app.post("/o/analyze")
async def trigger_o_analysis():
    """Déclenche manuellement une analyse O (utile pour tests)"""
    if not store.latest_image_base64:
        return { 'ok': False, 'error': 'no_image' }
    if store.agents_count == 0:
        return { 'ok': False, 'error': 'no_agents' }
    
    result = await call_gemini_o(store.latest_image_base64, store.agents_count, store.latest)
    if result:
        snapshot = {
            'structures': result.get('structures', []),
            'narrative': result.get('narrative', {'summary': ''}),
            'simplicity_assessment': result.get('simplicity_assessment', {
                'C_w_current': {'value': 0},
                'C_d_current': {'value': 0},
                'U_current': {'value': 0}
            }),
            'agents_count': store.agents_count
        }
        if 'reasoning' not in snapshot['simplicity_assessment']:
            snapshot['simplicity_assessment']['reasoning'] = 'No reasoning provided'
        store.set_snapshot(snapshot)
        return { 'ok': True, 'snapshot': snapshot, 'version': store.version }
    else:
        return { 'ok': False, 'error': 'gemini_failed' }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")


