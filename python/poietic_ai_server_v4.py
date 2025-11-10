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
        self.last_update_time: Optional[datetime] = None  # Timestamp de dernière mise à jour (image ou agents)
        self.first_update_time: Optional[datetime] = None  # Première mise à jour depuis le démarrage
        self.updates_count: int = 0  # Nombre cumulé de mises à jour (image/agents)

    def set_snapshot(self, snapshot: dict):
        self.version += 1
        snapshot['version'] = self.version
        snapshot['timestamp'] = datetime.now(timezone.utc).isoformat()
        self.latest = snapshot

    def set_image(self, image_base64: str):
        self.latest_image_base64 = image_base64
        self.last_update_time = datetime.now(timezone.utc)
        if self.first_update_time is None:
            self.first_update_time = self.last_update_time
        self.updates_count += 1
    
    def set_agents_count(self, n: int):
        try:
            self.agents_count = max(0, int(n))
            self.last_update_time = datetime.now(timezone.utc)
            if self.first_update_time is None:
                self.first_update_time = self.last_update_time
            self.updates_count += 1
        except Exception:
            self.agents_count = 0
            self.last_update_time = datetime.now(timezone.utc)
            if self.first_update_time is None:
                self.first_update_time = self.last_update_time
            self.updates_count += 1
    
    def is_stale(self, timeout_seconds: int = 30) -> bool:
        """Vérifie si les données sont obsolètes (timeout)"""
        if self.last_update_time is None:
            return True  # Jamais mis à jour = obsolète
        delta = (datetime.now(timezone.utc) - self.last_update_time).total_seconds()
        return delta > timeout_seconds

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
                system_lines = data.get('system', [])
                # S'assurer que system_lines est une liste
                if not isinstance(system_lines, list):
                    print(f"[O] ⚠️ 'system' n'est pas une liste, type: {type(system_lines)}")
                    system_lines = []
                o_prompt_template = '\n'.join(system_lines) if system_lines else "You are an O-machine. Analyze the image and return JSON with structures, narrative, and simplicity_assessment."
        except Exception as e:
            print(f"[O] Erreur chargement prompt: {e}")
            o_prompt_template = "You are an O-machine. Analyze the image and return JSON with structures, narrative, and simplicity_assessment."
    # S'assurer que o_prompt_template est bien une chaîne, pas None
    if not isinstance(o_prompt_template, str):
        print(f"[O] ⚠️ o_prompt_template n'est pas une chaîne, type: {type(o_prompt_template)}, réinitialisation")
        o_prompt_template = "You are an O-machine. Analyze the image and return JSON with structures, narrative, and simplicity_assessment."
    return o_prompt_template

async def call_gemini_o(image_base64: str, agents_count: int, previous_snapshot: Optional[dict] = None) -> Optional[dict]:
    """Appelle Gemini avec l'image globale pour analyse O"""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[O] GEMINI_API_KEY non définie, utilisation du mock")
        return None
    
    # Charger le prompt et vérifier qu'il est bien une chaîne
    try:
        prompt = load_o_prompt()
        if not isinstance(prompt, str):
            print(f"[O] ⚠️ Erreur: prompt n'est pas une chaîne, type: {type(prompt)}")
            return None
    except Exception as e:
        print(f"[O] Erreur chargement prompt dans call_gemini_o: {e}")
        return None
    
    # Injecter agents_count dans le prompt (remplacer toutes les occurrences)
    try:
        # Convertir agents_count en chaîne (utiliser f-string comme méthode sûre)
        agents_count_str = f"{agents_count}"
        prompt = prompt.replace('{{agents_count}}', agents_count_str)
    except (AttributeError, TypeError) as e:
        print(f"[O] Erreur remplacement agents_count: {e}, prompt type: {type(prompt)}")
        return None
    
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
        # Vérifier que httpx est bien un module, pas une chaîne
        if not hasattr(httpx, 'AsyncClient'):
            print(f"[O] ⚠️ Erreur: httpx.AsyncClient n'existe pas, httpx type: {type(httpx)}")
            return None
        # Utiliser httpx.Timeout pour la compatibilité avec les versions récentes
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
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
            
            if not text or len(text.strip()) < 10:
                print("[O] Réponse Gemini vide ou trop courte")
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
                    
                    # Réparations supplémentaires pour erreurs communes (plus conservatrices)
                    # 1. Enlever virgules en trop avant } ou ] (sauf si dans une chaîne)
                    json_slice = re.sub(r',(\s*[}\]])', r'\1', json_slice)
                    # 2. Enlever virgules en trop après { ou [
                    json_slice = re.sub(r'([{\[])\s*,', r'\1', json_slice)
                    # 3. Nettoyer les virgules multiples
                    json_slice = re.sub(r',\s*,+', ',', json_slice)
                    
                    # Essayer de parser
                    try:
                        parsed = json.loads(json_slice)
                        print("[O] JSON réparé avec succès (extraction + nettoyage)")
                        return parsed
                    except json.JSONDecodeError as e2:
                        # Dernière tentative : extraire seulement les structures valides avec parsing récursif
                        try:
                            # Chercher le début du tableau structures
                            struct_start = json_slice.find('"structures"')
                            if struct_start != -1:
                                # Trouver le [ qui suit
                                bracket_start = json_slice.find('[', struct_start)
                                if bracket_start != -1:
                                    # Compter les accolades et crochets pour trouver la fin
                                    depth = 0
                                    bracket_count = 1
                                    i = bracket_start + 1
                                    while i < len(json_slice) and bracket_count > 0:
                                        if json_slice[i] == '[':
                                            bracket_count += 1
                                        elif json_slice[i] == ']':
                                            bracket_count -= 1
                                        i += 1
                                    if bracket_count == 0:
                                        structures_text = json_slice[bracket_start:i]
                                        try:
                                            structures_array = json.loads(structures_text)
                                            if isinstance(structures_array, list) and len(structures_array) > 0:
                                                # Construire un snapshot minimal valide
                                                # Essayer d'estimer C_w et C_d à partir des structures
                                                num_structures = len(structures_array)
                                                # Estimation basique : C_w et C_d augmentent avec le nombre de structures
                                                estimated_cw = 15 + (num_structures * 5)
                                                estimated_cd = 12 + (num_structures * 6)  # Plus élevé pour structures déconnectées
                                                estimated_u = max(-5, estimated_cw - estimated_cd)  # U peut être négatif
                                                
                                                minimal_snapshot = {
                                                    "structures": structures_array,
                                                    "narrative": {"summary": f"Partial snapshot: {num_structures} structure(s) detected (parsing error)"},
                                                    "simplicity_assessment": {
                                                        "C_w_current": {"value": estimated_cw, "rationale": "Estimated from structures count"},
                                                        "C_d_current": {"value": estimated_cd, "description": f"Partial description of {num_structures} structure(s)"},
                                                        "U_current": {"value": estimated_u, "interpretation": "WEAK_EMERGENCE" if estimated_u < 6 else "MODERATE_EMERGENCE"},
                                                        "reasoning": f"Partial snapshot extracted from malformed JSON. {num_structures} structure(s) detected. C_w/C_d estimated."
                                                    }
                                                }
                                                print(f"[O] JSON partiel extrait ({num_structures} structures, C_w={estimated_cw}, C_d={estimated_cd}, U={estimated_u})")
                                                return minimal_snapshot
                                        except:
                                            pass
                        except Exception as e3:
                            pass
                        
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
        
        # Vérifier si les données sont obsolètes (agents déconnectés)
        if store.is_stale(timeout_seconds=30):
            if store.agents_count > 0:
                print(f"[O] Timeout détecté (dernière mise à jour > 30s), agents considérés déconnectés")
                store.set_agents_count(0)  # Réinitialiser le compteur
        
        if store.agents_count == 0:
            print("[O] Pas d'agents actifs, attente...")
            continue
        
        # Fenêtre de warmup au démarrage: attendre quelques mises à jour agents/image
        # - au moins 2 mises à jour (image/agents)
        # - ET au moins 5s depuis la première mise à jour
        now = datetime.now(timezone.utc)
        if (store.updates_count or 0) < 2 or (store.first_update_time and (now - store.first_update_time).total_seconds() < 5):
            print("[O] Warmup en cours (attente premières mises à jour des seeds)...")
            continue
        
        # Fenêtre de stabilisation: éviter d'analyser en plein flux, attendre 3s de calme
        # Ce délai permet de s'assurer que tous les agents W ont fini de dessiner leurs pixels
        # et que le canvas est complètement rendu avant l'analyse O
        if store.last_update_time and (now - store.last_update_time).total_seconds() < 3.0:
            print(f"[O] Attente de stabilisation (dernière mise à jour il y a {(now - store.last_update_time).total_seconds():.1f}s, besoin de 3s de calme)...")
            continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        print(f"[O] Analyse avec Gemini ({store.agents_count} agents, image: {img_size} bytes)...")
        previous = store.latest
        
        # Appeler Gemini avec l'image (avec retry pour réponses vides)
        result = None
        for attempt in range(2):  # 2 tentatives max
            result = await call_gemini_o(store.latest_image_base64, store.agents_count, previous)
            if result:
                break
            if attempt < 1:
                print(f"[O] Tentative {attempt + 1} échouée, retry dans 2s...")
                await asyncio.sleep(2)
        
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


