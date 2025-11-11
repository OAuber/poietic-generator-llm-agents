#!/usr/bin/env python3
from fastapi import FastAPI, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
import httpx
import json
import os
import base64
import re

# ==============================================================================
# STORES
# ==============================================================================

class WAgentDataStore:
    """Store pour les données envoyées par les agents W"""
    def __init__(self):
        self.agents_data = {}  # {agent_id: {position, rationale, predictions, strategy, iteration, timestamp}}
        self.last_update_time: Optional[datetime] = None
    
    def update_agent_data(self, agent_id: str, data: dict):
        """Mettre à jour les données d'un agent W"""
        self.agents_data[agent_id] = {
            'agent_id': agent_id,
            'position': data.get('position', [0, 0]),
            'iteration': data.get('iteration', 0),
            'strategy': data.get('strategy', 'N/A'),
            'rationale': data.get('rationale', ''),
            'predictions': data.get('predictions', {}),
            'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat())
        }
        self.last_update_time = datetime.now(timezone.utc)
    
    def get_all_agents_data(self):
        """Retourner toutes les données W pour N"""
        return self.agents_data.copy()
    
    def clear_stale_agents(self, timeout=30):
        """Nettoyer les agents inactifs (obsolètes)"""
        if not self.agents_data:
            return
        
        now = datetime.now(timezone.utc)
        stale_agents = []
        
        for agent_id, data in self.agents_data.items():
            timestamp_str = data.get('timestamp', '')
            try:
                agent_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                delta = (now - agent_time).total_seconds()
                if delta > timeout:
                    stale_agents.append(agent_id)
            except:
                pass
        
        for agent_id in stale_agents:
            del self.agents_data[agent_id]
            print(f"[W] Agent {agent_id} supprimé (inactif > {timeout}s)")


class OSnapshotStore:
    """Store pour les snapshots O+N combinés"""
    def __init__(self):
        self.latest: Optional[dict] = None
        self.version: int = 0
        self.latest_image_base64: Optional[str] = None
        self.agents_count: int = 0
        self.last_update_time: Optional[datetime] = None
        self.first_update_time: Optional[datetime] = None
        self.updates_count: int = 0

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
        """Vérifie si les données sont obsolètes"""
        if self.last_update_time is None:
            return True
        delta = (datetime.now(timezone.utc) - self.last_update_time).total_seconds()
        return delta > timeout_seconds


# Instances globales
store = OSnapshotStore()
w_store = WAgentDataStore()

# ==============================================================================
# CHARGEMENT DES PROMPTS
# ==============================================================================

O_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'gemini-prompts-v5-observation.json')
N_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'gemini-prompts-v5-narration.json')

o_prompt_template = None
n_prompt_template = None

def load_o_prompt():
    global o_prompt_template
    if o_prompt_template is None:
        try:
            with open(O_PROMPT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                system_lines = data.get('system', [])
                if not isinstance(system_lines, list):
                    print(f"[O] ⚠️ 'system' n'est pas une liste")
                    system_lines = []
                o_prompt_template = '\n'.join(system_lines) if system_lines else "You are an O-machine."
        except Exception as e:
            print(f"[O] Erreur chargement prompt: {e}")
            o_prompt_template = "You are an O-machine."
    
    if not isinstance(o_prompt_template, str):
        o_prompt_template = "You are an O-machine."
    return o_prompt_template


def load_n_prompt():
    global n_prompt_template
    if n_prompt_template is None:
        try:
            with open(N_PROMPT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                system_lines = data.get('system', [])
                if not isinstance(system_lines, list):
                    print(f"[N] ⚠️ 'system' n'est pas une liste")
                    system_lines = []
                n_prompt_template = '\n'.join(system_lines) if system_lines else "You are an N-machine."
        except Exception as e:
            print(f"[N] Erreur chargement prompt: {e}")
            n_prompt_template = "You are an N-machine."
    
    if not isinstance(n_prompt_template, str):
        n_prompt_template = "You are an N-machine."
    return n_prompt_template

# ==============================================================================
# APPELS GEMINI
# ==============================================================================

async def call_gemini_o(image_base64: str, agents_count: int, previous_snapshot: Optional[dict] = None) -> Optional[dict]:
    """Appelle Gemini pour O-machine (observation des structures et calcul C_d)"""
    print(f"[O] 🚀 Début appel Gemini O (agents: {agents_count}, image: {len(image_base64)} bytes)")
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[O] GEMINI_API_KEY non définie")
        return None
    
    try:
        prompt = load_o_prompt()
        if not isinstance(prompt, str):
            print(f"[O] ⚠️ Prompt n'est pas une chaîne")
            return None
    except Exception as e:
        print(f"[O] Erreur chargement prompt: {e}")
        return None
    
    # Injecter agents_count
    try:
        prompt = prompt.replace('{{agents_count}}', str(agents_count))
        print(f"[O] 📝 Prompt final: {len(prompt)} chars (~{len(prompt)//4} tokens)")
    except Exception as e:
        print(f"[O] Erreur injection agents_count: {e}")
        return None
    
    # Préparer le body
    parts = [{'text': prompt}]
    if image_base64:
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
            'maxOutputTokens': 16000  # V5: Augmenter pour laisser place aux thoughts + réponse
        }
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, json=body)
            if not resp.is_success:
                error_text = resp.text
                print(f"[O] Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return None
            
            data = resp.json()
            text = ''
            if data.get('candidates') and len(data['candidates']) > 0:
                content = data['candidates'][0].get('content', {})
                for part in content.get('parts', []):
                    if 'text' in part:
                        text += part['text']
            
            if not text or len(text.strip()) < 10:
                print(f"[O] ❌ Réponse Gemini vide ou trop courte (longueur: {len(text) if text else 0})")
                print(f"[O] Status: {resp.status_code}, Headers: {dict(resp.headers)}")
                print(f"[O] 🔍 Réponse JSON brute: {json.dumps(data, indent=2)[:1000]}")
                if text:
                    print(f"[O] Texte reçu: '{text}'")
                return None
            
            # Parser JSON
            result = parse_json_robust(text, "[O]")
            if result:
                print(f"[O] ✅ Gemini O réussi (longueur réponse: {len(text)} chars, thoughts: {data.get('usageMetadata', {}).get('thoughtsTokenCount', 0)} tokens)")
            else:
                print(f"[O] ❌ Parsing JSON échoué")
            return result
                
    except Exception as e:
        print(f"[O] Erreur appel Gemini: {e}")
        return None


async def call_gemini_n(o_snapshot: dict, w_agents_data: dict, previous_combined: Optional[dict] = None) -> Optional[dict]:
    """Appelle Gemini pour N-machine (narration, C_w, erreurs prédiction)"""
    print(f"[N] 🚀 Début appel Gemini N avec {len(w_agents_data)} agents W")
    print(f"[N]    O-snapshot: {len(o_snapshot.get('structures', []))} structures")
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[N] GEMINI_API_KEY non définie")
        return None
    
    try:
        prompt = load_n_prompt()
        if not isinstance(prompt, str):
            print(f"[N] ⚠️ Prompt n'est pas une chaîne")
            return None
    except Exception as e:
        print(f"[N] Erreur chargement prompt: {e}")
        return None
    
    # Construire le prompt avec les données O et W
    try:
        # Injecter snapshot O
        o_json = json.dumps(o_snapshot, ensure_ascii=False, indent=2)
        prompt = prompt.replace('{{o_snapshot}}', o_json)
        
        # Injecter données W
        w_json = json.dumps(w_agents_data, ensure_ascii=False, indent=2)
        prompt = prompt.replace('{{w_agents_data}}', w_json)
        # Log aperçu des données W injectées
        for agent_id, data in list(w_agents_data.items())[:3]:  # Max 3 agents pour lisibilité
            print(f"[N]    → Agent {agent_id[:8]}: strategy={data.get('strategy', 'N/A')}, iter={data.get('iteration', 'N/A')}")
        
        # Injecter snapshot précédent (si disponible)
        if previous_combined:
            prev_json = json.dumps(previous_combined, ensure_ascii=False, indent=2)
            prompt = prompt.replace('{{previous_snapshot}}', prev_json)
        else:
            prompt = prompt.replace('{{previous_snapshot}}', 'null')
        
        # Log taille du prompt final
        prompt_length = len(prompt)
        prompt_tokens = prompt_length // 4  # Approximation: 1 token ≈ 4 chars
        print(f"[N] 📝 Prompt final: {prompt_length} chars (~{prompt_tokens} tokens)")
        
    except Exception as e:
        print(f"[N] Erreur injection données: {e}")
        return None
    
    url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={api_key}"
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 16000  # V5: Augmenter pour laisser place aux thoughts + réponse
        }
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, json=body)
            if not resp.is_success:
                error_text = resp.text
                print(f"[N] Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return None
            
            data = resp.json()
            text = ''
            if data.get('candidates') and len(data['candidates']) > 0:
                content = data['candidates'][0].get('content', {})
                for part in content.get('parts', []):
                    if 'text' in part:
                        text += part['text']
            
            if not text or len(text.strip()) < 10:
                print(f"[N] ❌ Réponse Gemini vide ou trop courte (longueur: {len(text) if text else 0})")
                print(f"[N] Status: {resp.status_code}, Headers: {dict(resp.headers)}")
                if text:
                    print(f"[N] Texte reçu: '{text}'")
                return None
            
            # Parser JSON
            result = parse_json_robust(text, "[N]")
            if result:
                print(f"[N] ✅ Gemini N réussi (longueur réponse: {len(text)} chars, thoughts: {data.get('usageMetadata', {}).get('thoughtsTokenCount', 0)} tokens)")
            else:
                print(f"[N] ❌ Parsing JSON échoué")
            return result
                
    except Exception as e:
        print(f"[N] Erreur appel Gemini: {e}")
        return None


def parse_json_robust(text: str, prefix: str = "") -> Optional[dict]:
    """Parser JSON avec nettoyage robuste"""
    original_text = text
    
    try:
        # Enlever markdown code blocks
        text = text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1]) if len(lines) > 2 else text
        if '```json' in text:
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*$', '', text).strip()
        
        # Essai direct
        try:
            parsed = json.loads(text)
            return parsed
        except json.JSONDecodeError:
            pass
        
        # Extraction { ... }
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            json_slice = text[first_brace:last_brace+1]
            
            # Nettoyer retours à la ligne dans les chaînes
            def clean_value(m):
                value = m.group(1)
                value = value.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                value = re.sub(r'\s+', ' ', value).strip()
                return '": "' + value + '"'
            
            pattern = r'":\s*"([^"]*(?:\n[^"]*)*)"'
            json_slice = re.sub(pattern, clean_value, json_slice, flags=re.MULTILINE)
            json_slice = re.sub(r'\n\s*', ' ', json_slice)
            json_slice = re.sub(r'\s+', ' ', json_slice)
            
            # Réparations communes
            json_slice = re.sub(r',(\s*[}\]])', r'\1', json_slice)
            json_slice = re.sub(r'([{\[])\s*,', r'\1', json_slice)
            json_slice = re.sub(r',\s*,+', ',', json_slice)
            
            try:
                parsed = json.loads(json_slice)
                print(f"{prefix} JSON réparé avec succès")
                return parsed
            except json.JSONDecodeError as e:
                print(f"{prefix} Échec parsing: {e}")
    
    except Exception as e:
        print(f"{prefix} Erreur parsing JSON: {e}")
        print(f"{prefix} Texte (premiers 1000 chars): {original_text[:1000]}")
    
    return None


def calculate_u_interpretation(u_value: float) -> str:
    """Calculer l'interprétation de U"""
    if u_value < 0:
        return "NO_EMERGENCE"
    elif u_value < 6:
        return "WEAK_EMERGENCE"
    elif u_value < 11:
        return "MODERATE_EMERGENCE"
    elif u_value < 16:
        return "STRONG_EMERGENCE"
    else:
        return "EXCEPTIONAL_EMERGENCE"

# ==============================================================================
# TÂCHE PÉRIODIQUE O→N
# ==============================================================================

async def periodic_on_task():
    """Tâche périodique : O puis N puis combinaison"""
    while True:
        await asyncio.sleep(25)
        
        # Vérifications préalables
        if not store.latest_image_base64:
            print("[ON] Pas d'image disponible, attente...")
            continue
        
        # Vérifier obsolescence (agents déconnectés)
        if store.is_stale(timeout_seconds=30):
            if store.agents_count > 0:
                print(f"[ON] Timeout détecté, agents considérés déconnectés")
                store.set_agents_count(0)
        
        if store.agents_count == 0:
            print("[ON] Pas d'agents actifs, attente...")
            continue
        
        # Warmup : attendre que les agents aient terminé leurs seeds
        now = datetime.now(timezone.utc)
        warmup_delay = 20  # V5: Augmenter à 20s pour laisser temps aux seeds
        if (store.updates_count or 0) < 3 or (store.first_update_time and (now - store.first_update_time).total_seconds() < warmup_delay):
            elapsed = (now - store.first_update_time).total_seconds() if store.first_update_time else 0
            print(f"[ON] Warmup en cours ({elapsed:.1f}s / {warmup_delay}s, {store.updates_count or 0} updates)...")
            continue
        
        # Stabilisation : attendre que les agents aient fini d'envoyer leurs données
        if store.last_update_time and (now - store.last_update_time).total_seconds() < 5.0:
            print(f"[ON] Attente stabilisation ({(now - store.last_update_time).total_seconds():.1f}s)...")
            continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        print(f"[ON] Analyse avec Gemini ({store.agents_count} agents, image: {img_size} bytes)...")
        
        # Nettoyer agents W obsolètes
        w_store.clear_stale_agents(timeout=30)
        
        # Étape 1 : O analysis (structures + C_d + relations formelles)
        o_result = None
        for attempt in range(3):  # Augmenter à 3 tentatives
            o_result = await call_gemini_o(store.latest_image_base64, store.agents_count, store.latest)
            if o_result:
                break
            if attempt < 2:
                delay = 3 * (attempt + 1)  # Délai progressif: 3s, 6s
                print(f"[O] Tentative {attempt + 1} échouée, retry dans {delay}s...")
                await asyncio.sleep(delay)
        
        if not o_result:
            print("[O] Échec Gemini O, conservation snapshot précédent")
            if store.latest:
                print(f"[O] Conservation snapshot version {store.version} ({len(store.latest.get('structures', []))} structures)")
                # Ne rien faire, garder le snapshot actuel
            else:
                # Première tentative : créer snapshot minimal
                print("[O] Aucun snapshot précédent, création snapshot minimal (attente première analyse)")
                snapshot = {
                    'structures': [],
                    'formal_relations': {'summary': 'Waiting for first image analysis...', 'connections': []},
                    'narrative': {'summary': 'Waiting for first O+N analysis...'},
                    'prediction_errors': {},
                    'simplicity_assessment': {
                        'C_w_current': {'value': 0},
                        'C_d_current': {'value': 0, 'description': 'Waiting for first analysis'},
                        'U_current': {'value': 0, 'interpretation': 'WEAK_EMERGENCE'},
                        'reasoning_o': 'Waiting for first O analysis...',
                        'reasoning_n': 'Waiting for first N analysis...'
                    },
                    'agents_count': store.agents_count
                }
                store.set_snapshot(snapshot)
            continue
        
        # Étape 2 : N analysis (narrative + C_w + erreurs prédiction)
        w_data = w_store.get_all_agents_data()
        n_result = None
        
        print(f"[N] Données W disponibles: {len(w_data)} agents")
        for agent_id, data in w_data.items():
            print(f"  - Agent {agent_id[:8]}: iter={data.get('iteration')}, strategy={data.get('strategy')}")
        
        for attempt in range(3):  # Augmenter à 3 tentatives
            n_result = await call_gemini_n(o_result, w_data, store.latest)
            if n_result:
                break
            if attempt < 2:
                delay = 3 * (attempt + 1)  # Délai progressif: 3s, 6s
                print(f"[N] Tentative {attempt + 1} échouée, retry dans {delay}s...")
                await asyncio.sleep(delay)
        
        if not n_result:
            print("=" * 60)
            print("[N] ⚠️  ÉCHEC GEMINI N - UTILISATION FALLBACK")
            print("=" * 60)
            # Conserver N précédent si disponible
            if store.latest and 'narrative' in store.latest:
                print(f"[N] 🔄 Réutilisation données N du snapshot version {store.version}")
                print(f"[N]    Narrative: {store.latest.get('narrative', {}).get('summary', 'N/A')[:100]}...")
                print(f"[N]    C_w: {store.latest['simplicity_assessment'].get('C_w_current', {}).get('value', 'N/A')}")
                n_result = {
                    'narrative': store.latest.get('narrative', {'summary': 'Previous narrative preserved'}),
                    'prediction_errors': store.latest.get('prediction_errors', {}),
                    'simplicity_assessment': {
                        'C_w_current': store.latest['simplicity_assessment'].get('C_w_current', {'value': 15}),
                        'reasoning': store.latest['simplicity_assessment'].get('reasoning_n', 'Preserved from previous N analysis')
                    }
                }
            else:
                # Première N : utiliser valeurs par défaut raisonnables
                print("[N] Aucune donnée N précédente, utilisation valeurs par défaut")
                n_result = {
                    'narrative': {'summary': 'First N analysis pending. Agents are initializing their strategies.'},
                    'prediction_errors': {},
                    'simplicity_assessment': {
                        'C_w_current': {'value': 15},
                        'reasoning': 'Default C_w for initial setup (canvas initialization + basic seed parameters). Waiting for first agent strategies to evaluate.'
                    }
                }
        
        # Étape 3 : Combiner O + N
        try:
            c_w = n_result['simplicity_assessment']['C_w_current']['value']
            c_d = o_result['simplicity_assessment']['C_d_current']['value']
            u_value = c_w - c_d
            
            combined_snapshot = {
                'structures': o_result.get('structures', []),
                'formal_relations': o_result.get('formal_relations', {'summary': '', 'connections': []}),
                'narrative': n_result.get('narrative', {'summary': ''}),
                'prediction_errors': n_result.get('prediction_errors', {}),
                'simplicity_assessment': {
                    'C_w_current': n_result['simplicity_assessment']['C_w_current'],
                    'C_d_current': o_result['simplicity_assessment']['C_d_current'],
                    'U_current': {
                        'value': u_value,
                        'interpretation': calculate_u_interpretation(u_value)
                    },
                    'reasoning_o': o_result['simplicity_assessment'].get('reasoning', ''),
                    'reasoning_n': n_result['simplicity_assessment'].get('reasoning', '')
                },
                'agents_count': store.agents_count
            }
            
            store.set_snapshot(combined_snapshot)
            print(f"[ON] Snapshot O+N combiné (version {store.version}, {len(combined_snapshot['structures'])} structures, U={u_value})")
        
        except Exception as e:
            print(f"[ON] Erreur combinaison O+N: {e}")
            # En cas d'erreur, conserver le snapshot précédent

# ==============================================================================
# FASTAPI APP
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(periodic_on_task())
    yield

app = FastAPI(title="Poietic AI Server V5", version="5.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/o/latest")
async def get_latest_o(agent_id: Optional[str] = Query(None)):
    """Récupère le snapshot O+N, personnalisé si agent_id fourni"""
    snapshot = store.latest
    if not snapshot:
        return {
            'version': 0,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'structures': [],
            'formal_relations': {'summary': '', 'connections': []},
            'narrative': {'summary': ''},
            'prediction_errors': {},
            'simplicity_assessment': {
                'C_w_current': {'value': 0},
                'C_d_current': {'value': 0},
                'U_current': {'value': 0}
            }
        }
    
    # Personnaliser si agent_id fourni
    if agent_id:
        personalized = {
            **snapshot,
            'prediction_errors': {
                agent_id: snapshot.get('prediction_errors', {}).get(agent_id, {'error': 0, 'explanation': 'No data available'})
            }
        }
        return personalized
    
    return snapshot


@app.post("/o/image")
async def post_o_image(payload: dict = Body(...)):
    """Recevoir l'image globale d'un agent W"""
    img = payload.get('image_base64') or ''
    agents = payload.get('agents_count')
    if img.startswith('data:image/png;base64,'):
        img = img.replace('data:image/png;base64,', '')
    if not img or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in img):
        return {'ok': False, 'error': 'invalid_base64'}
    store.set_image(img)
    if agents is not None:
        store.set_agents_count(agents)
    return {'ok': True, 'timestamp': datetime.now(timezone.utc).isoformat(), 'agents_count': store.agents_count}


@app.get("/o/image")
async def get_o_image():
    """Récupère l'image PNG base64"""
    return {'image_base64': store.latest_image_base64, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.post("/o/agents")
async def post_o_agents(payload: dict = Body(...)):
    """Mettre à jour le nombre d'agents actifs"""
    n = payload.get('count')
    if n is None:
        return {'ok': False, 'error': 'missing_count'}
    store.set_agents_count(n)
    return {'ok': True, 'agents_count': store.agents_count, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.post("/n/w-data")
async def receive_w_data(payload: dict = Body(...)):
    """Recevoir les données d'un agent W (rationale, predictions, strategy)"""
    agent_id = payload.get('agent_id')
    if not agent_id:
        return {'ok': False, 'error': 'missing_agent_id'}
    
    w_store.update_agent_data(agent_id, payload)
    return {'ok': True, 'agent_id': agent_id, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.get("/n/w-data")
async def get_w_data():
    """Récupère toutes les données W (pour debug)"""
    return {'agents': w_store.get_all_agents_data(), 'timestamp': datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005, log_level="info")

