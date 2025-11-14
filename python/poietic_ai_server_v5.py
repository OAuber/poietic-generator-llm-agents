#!/usr/bin/env python3
from fastapi import FastAPI, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Tuple, List
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
import httpx
import json
import os
import base64
import re
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

# ==============================================================================
# STORES
# ==============================================================================

class WAgentDataStore:
    """Store pour les données envoyées par les agents W"""
    def __init__(self):
        self.agents_data = {}  # {agent_id: {position, rationale, predictions, previous_predictions, strategy, iteration, previous_iteration, timestamp}}
        self.last_update_time: Optional[datetime] = None
    
    def update_agent_data(self, agent_id: str, data: dict):
        """Mettre à jour les données d'un agent W"""
        previous_record = self.agents_data.get(agent_id, {})
        self.agents_data[agent_id] = {
            'agent_id': agent_id,
            'position': data.get('position', [0, 0]),
            'iteration': data.get('iteration', 0),
            'previous_iteration': previous_record.get('iteration'),
            'strategy': data.get('strategy', 'N/A'),
            'rationale': data.get('rationale', ''),
            'predictions': data.get('predictions', {}),
            # Conserver les prédictions de l'itération précédente pour N (évaluation erreur)
            'previous_predictions': previous_record.get('predictions', {}),
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
    
    def all_agents_finished(self, quiescence_delay=5.0):
        """
        Vérifier si tous les agents W actifs ont terminé leurs actions.
        Un agent a terminé s'il n'a pas envoyé de données depuis quiescence_delay secondes.
        Retourne (all_finished, time_since_last_update)
        """
        if not self.agents_data:
            # Pas d'agents W actifs : considérer comme terminé
            return True, 0.0
        
        now = datetime.now(timezone.utc)
        
        # Temps depuis la dernière mise à jour globale
        if self.last_update_time:
            time_since_last_update = (now - self.last_update_time).total_seconds()
        else:
            time_since_last_update = float('inf')
        
        # Vérifier que tous les agents ont terminé (pas de mise à jour depuis quiescence_delay)
        all_finished = time_since_last_update >= quiescence_delay
        
        return all_finished, time_since_last_update


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
# CLIENT SERVEUR DE MÉTRIQUES
# ==============================================================================

class MetricsClient:
    """Client WebSocket pour envoyer snapshots O/N au serveur de métriques"""
    def __init__(self, url: str = "ws://localhost:5005/metrics"):
        self.url = url
        self.websocket = None
        self.connected = False
        self.reconnect_delay = 5
        self._reconnect_task = None
    
    async def connect(self):
        """Se connecter au serveur de métriques avec reconnexion automatique"""
        while True:
            try:
                print(f"[Metrics] Connexion au serveur de métriques {self.url}...")
                self.websocket = await websockets.connect(self.url)
                self.connected = True
                print("[Metrics] ✅ Connecté au serveur de métriques")
                
                # Demander l'état initial
                await self.send({'type': 'get_state'})
                
                # Écouter les messages (pour debug, en arrière-plan)
                try:
                    while True:
                        try:
                            message = await asyncio.wait_for(self.websocket.recv(), timeout=1.0)
                            # Messages du serveur (pour debug, ignorés pour l'instant)
                        except asyncio.TimeoutError:
                            # Timeout normal, continuer à écouter
                            continue
                except ConnectionClosed:
                    print("[Metrics] Connexion fermée par le serveur")
                    self.connected = False
                    self.websocket = None
                        
            except (ConnectionRefusedError, OSError, WebSocketException) as e:
                self.connected = False
                self.websocket = None
                print(f"[Metrics] ⚠️ Erreur connexion métriques: {e}")
                print(f"[Metrics] Reconnexion dans {self.reconnect_delay}s...")
                await asyncio.sleep(self.reconnect_delay)
            except Exception as e:
                self.connected = False
                self.websocket = None
                print(f"[Metrics] Erreur inattendue: {e}")
                await asyncio.sleep(self.reconnect_delay)
    
    async def send(self, message: dict):
        """Envoyer un message au serveur de métriques"""
        if not self.connected or not self.websocket:
            return False
        
        try:
            await self.websocket.send(json.dumps(message))
            return True
        except (ConnectionClosed, WebSocketException) as e:
            print(f"[Metrics] Erreur envoi message: {e}")
            self.connected = False
            self.websocket = None
            return False
        except Exception as e:
            print(f"[Metrics] Erreur inattendue envoi: {e}")
            return False
    
    async def send_o_snapshot(self, snapshot: dict):
        """Envoyer snapshot O au serveur de métriques"""
        return await self.send({
            'type': 'o_snapshot',
            'snapshot': snapshot
        })
    
    async def send_n_snapshot(self, snapshot: dict):
        """Envoyer snapshot N au serveur de métriques"""
        return await self.send({
            'type': 'n_snapshot',
            'snapshot': snapshot
        })
    
    def start_background_connection(self):
        """Démarrer la connexion en arrière-plan"""
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self.connect())

# Instance globale
metrics_client = MetricsClient()

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
# VALIDATION STRUCTURES
# ==============================================================================

def validate_structures_no_overlap(o_result: dict) -> Tuple[bool, List[str]]:
    """
    Valide que chaque agent [X,Y] n'apparaît qu'une seule fois dans toutes les structures.
    Retourne (is_valid, list_of_errors).
    """
    if not o_result or 'structures' not in o_result:
        return True, []  # Pas de structures = pas de chevauchement
    
    structures = o_result.get('structures', [])
    agent_to_structure = {}  # {tuple(X,Y): structure_idx}
    errors = []
    
    for idx, struct in enumerate(structures):
        agent_positions = struct.get('agent_positions', [])
        if not isinstance(agent_positions, list):
            continue
        
        for pos in agent_positions:
            if not isinstance(pos, list) or len(pos) != 2:
                continue
            pos_tuple = tuple(pos)  # Convertir [X,Y] en tuple pour hashable
            
            if pos_tuple in agent_to_structure:
                # Agent déjà dans une autre structure !
                other_idx = agent_to_structure[pos_tuple]
                errors.append(
                    f"Agent {list(pos_tuple)} appears in both structure {idx} "
                    f"({struct.get('type', 'unknown')}) and structure {other_idx}"
                )
            else:
                agent_to_structure[pos_tuple] = idx
    
    is_valid = len(errors) == 0
    return is_valid, errors

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
                # Log aperçu des erreurs de prédiction retournées
                pred_errors = result.get('prediction_errors', {})
                if isinstance(pred_errors, dict):
                    print(f"[N] 📊 Erreurs de prédiction retournées par Gemini: {len(pred_errors)} agents")
                    for agent_id, err in list(pred_errors.items())[:3]:  # Max 3 pour lisibilité
                        err_val = err.get('error', 'N/A') if isinstance(err, dict) else 'N/A'
                        print(f"[N]    → Agent {agent_id[:8]}: error={err_val}")
                else:
                    print(f"[N] ⚠️  prediction_errors n'est pas un dict: {type(pred_errors)}")
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
    """Tâche périodique : O puis N puis combinaison
    Déclenche l'analyse O+N lorsque tous les agents W actifs ont terminé leurs actions.
    """
    while True:
        await asyncio.sleep(2)  # V5: Vérifier toutes les 2s si tous les agents W ont terminé
        
        # Vérifications préalables
        if not store.latest_image_base64:
            print("[ON] Pas d'image disponible, attente...")
            continue
        
        now = datetime.now(timezone.utc)
        
        # Warmup : attendre que les agents aient terminé leurs seeds
        warmup_delay = 30  # V5: Augmenter à 30s pour laisser temps aux seeds d'être visibles et appliqués
        # V5: Réduire min_updates à 3 (2 agents peuvent ne pas atteindre 5 updates rapidement)
        # Mais exiger au moins 2 updates par agent (donc min_updates = agents_count * 2, minimum 3)
        min_updates = max(3, store.agents_count * 2) if store.agents_count > 0 else 3
        is_warmup = (store.updates_count or 0) < min_updates or (store.first_update_time and (now - store.first_update_time).total_seconds() < warmup_delay)
        
        if is_warmup:
            elapsed = (now - store.first_update_time).total_seconds() if store.first_update_time else 0
            print(f"[ON] Warmup en cours ({elapsed:.1f}s / {warmup_delay}s, {store.updates_count or 0}/{min_updates} updates)...")
            # V5: Ne pas marquer les agents déconnectés pendant le warmup
            continue
        
        # Vérifier obsolescence (agents déconnectés) - seulement après le warmup
        # V5: Timeout plus long pour la phase initiale (seeds peuvent prendre du temps)
        timeout_seconds = 60 if (store.updates_count or 0) < 10 else 30
        if store.is_stale(timeout_seconds=timeout_seconds):
            if store.agents_count > 0:
                print(f"[ON] Timeout détecté ({timeout_seconds}s), agents considérés déconnectés")
                store.set_agents_count(0)
        
        if store.agents_count == 0:
            print("[ON] Pas d'agents actifs, attente...")
            continue
        
        # V5: Vérifier qu'il y a des données W disponibles (au moins 1 agent a fait une action)
        # Pour la première analyse, on peut accepter 0 données W (seeds seulement)
        # Mais pour les analyses suivantes, on veut s'assurer qu'il y a des données W récentes
        w_data = w_store.get_all_agents_data()
        if len(w_data) == 0 and store.latest is None:
            # Première analyse : accepter même sans données W (seeds seulement)
            pass
        elif len(w_data) == 0 and store.latest is not None:
            # Analyse suivante mais pas de données W : attendre
            print(f"[ON] Aucune donnée W disponible, attente données agents...")
            continue
        
        # V5: Vérifier que l'image a été mise à jour récemment
        # Pendant le warmup ou la première analyse, être plus tolérant (30s)
        # Sinon, 15s maximum
        image_age = 0
        if store.last_update_time:
            image_age = (now - store.last_update_time).total_seconds()
            max_image_age = 30.0 if store.latest is None else 15.0
            if image_age > max_image_age:
                print(f"[ON] Image trop ancienne ({image_age:.1f}s > {max_image_age}s), attente mise à jour récente...")
                continue
        
        # V5: CRITIQUE - Vérifier si tous les agents W actifs ont terminé leurs actions
        # Quiescence : si aucun agent W n'a envoyé de données depuis quiescence_delay secondes,
        # alors tous ont terminé et on peut déclencher l'analyse O+N
        quiescence_delay = 5.0 if store.latest is None else 4.0  # 5s pour première analyse, 4s pour suivantes
        all_finished, time_since_last_w_update = w_store.all_agents_finished(quiescence_delay=quiescence_delay)
        
        # Vérifier qu'on a au moins des données W si des agents sont actifs
        w_data_check = w_store.get_all_agents_data()
        if store.agents_count > 0 and len(w_data_check) == 0:
            # Des agents sont actifs mais n'ont pas encore envoyé de données (en cours de démarrage/seed)
            print(f"[ON] {store.agents_count} agents actifs mais aucune donnée W reçue - attente seed...")
            continue
        
        if not all_finished:
            # Des agents W sont encore en train d'agir, attendre
            print(f"[ON] Agents W encore actifs (dernière mise à jour il y a {time_since_last_w_update:.1f}s < {quiescence_delay}s), attente...")
            continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        # V5: Vérifier taille minimale d'image (éviter images vides ou trop petites)
        min_image_size = 1000  # 1KB minimum (une image 20x20 avec quelques pixels devrait faire ~2-5KB)
        if img_size < min_image_size:
            print(f"[ON] Image trop petite ({img_size} bytes < {min_image_size} bytes), attente image valide...")
            continue
        
        print(f"[ON] Analyse avec Gemini ({store.agents_count} agents, image: {img_size} bytes, age: {image_age:.1f}s)...")
        
        # Nettoyer agents W obsolètes (mais seulement ceux vraiment inactifs)
        # Ne pas nettoyer si on a des agents actifs selon agents_count
        # car ils peuvent être en train de générer leur première action (seed)
        if store.agents_count > 0:
            # Nettoyer seulement les agents vraiment obsolètes (timeout plus long)
            w_store.clear_stale_agents(timeout=60)  # 60s au lieu de 30s pour éviter de supprimer des agents en cours de démarrage
        else:
            # Pas d'agents actifs, nettoyer normalement
            w_store.clear_stale_agents(timeout=30)
        
        # Étape 1 : O analysis (structures + C_d + relations formelles)
        o_result = None
        for attempt in range(3):  # Augmenter à 3 tentatives
            o_result = await call_gemini_o(store.latest_image_base64, store.agents_count, store.latest)
            if o_result:
                # V5: Valider qu'aucun agent n'apparaît dans plusieurs structures
                is_valid, errors = validate_structures_no_overlap(o_result)
                if not is_valid:
                    print("=" * 60)
                    print("[O] ⚠️  ERREUR VALIDATION: Agents apparaissant dans plusieurs structures:")
                    for err in errors:
                        print(f"[O]    {err}")
                    print("[O] ⚠️  Le résultat O sera ignoré, conservation snapshot précédent")
                    print("=" * 60)
                    o_result = None  # Invalider le résultat
                    if attempt < 2:
                        delay = 3 * (attempt + 1)
                        print(f"[O] Retry dans {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                else:
                    break  # Résultat valide
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
        
        # V5: Envoyer snapshot O au serveur de métriques
        await metrics_client.send_o_snapshot(o_result)
        
        # Étape 2 : N analysis (narrative + C_w + erreurs prédiction)
        w_data = w_store.get_all_agents_data()
        n_result = None
        
        print(f"[N] Données W disponibles: {len(w_data)} agents (agents_count: {store.agents_count})")
        
        # Si aucun agent W n'a de données mais qu'il y a des agents actifs,
        # cela signifie qu'ils sont peut-être encore en train de générer leur seed
        # Dans ce cas, on peut quand même faire l'analyse N avec 0 agents (première analyse)
        if len(w_data) == 0 and store.agents_count > 0:
            print(f"[N] ⚠️  Aucune donnée W disponible mais {store.agents_count} agents actifs - agents peut-être encore en cours de démarrage")
        for agent_id, data in w_data.items():
            print(f"  - Agent {agent_id[:8]}: iter={data.get('iteration')}, strategy={data.get('strategy')}")
        
        for attempt in range(3):  # Augmenter à 3 tentatives
            n_result = await call_gemini_n(o_result, w_data, store.latest)
            if n_result:
                # V5: Valider que tous les agents W actifs ont une erreur de prédiction
                prediction_errors = n_result.get('prediction_errors', {})
                if not isinstance(prediction_errors, dict):
                    print(f"[N] ⚠️  prediction_errors n'est pas un dict (type: {type(prediction_errors)}), conversion...")
                    prediction_errors = {}
                
                print(f"[N] 🔍 Validation: {len(w_data)} agents W actifs, {len(prediction_errors)} erreurs retournées par Gemini")
                
                missing_agents = []
                invalid_agents = []
                
                for agent_id in w_data.keys():
                    if agent_id not in prediction_errors:
                        missing_agents.append(agent_id)
                        print(f"[N]    ⚠️  Agent {agent_id[:8]} manquant dans prediction_errors")
                    else:
                        # Vérifier que l'erreur est valide (a 'error' et 'explanation')
                        err_data = prediction_errors[agent_id]
                        if not isinstance(err_data, dict):
                            invalid_agents.append(agent_id)
                            print(f"[N]    ⚠️  Agent {agent_id[:8]}: erreur n'est pas un dict (type: {type(err_data)})")
                        elif 'error' not in err_data or 'explanation' not in err_data:
                            invalid_agents.append(agent_id)
                            print(f"[N]    ⚠️  Agent {agent_id[:8]}: erreur manque 'error' ou 'explanation' (keys: {list(err_data.keys())})")
                        elif not err_data.get('explanation') or err_data.get('explanation', '').strip() == '':
                            # Erreur existe mais explication vide
                            err_data['explanation'] = 'Prediction error calculated but no explanation provided'
                            print(f"[N]    → Agent {agent_id[:8]}: explication vide, ajout message par défaut")
                
                if missing_agents:
                    print(f"[N] ⚠️  Agents sans erreur de prédiction: {len(missing_agents)} agents")
                    for agent_id in missing_agents:
                        # Ajouter erreur par défaut pour agents manquants
                        prediction_errors[agent_id] = {
                            'error': 0.0,
                            'explanation': 'No previous prediction available (first action or no prediction data)'
                        }
                        print(f"[N]    → Agent {agent_id[:8]}: ajout erreur par défaut (0.0)")
                
                if invalid_agents:
                    print(f"[N] ⚠️  Agents avec format d'erreur invalide: {len(invalid_agents)} agents")
                    for agent_id in invalid_agents:
                        # Corriger format invalide
                        err_data = prediction_errors.get(agent_id, {})
                        if not isinstance(err_data, dict):
                            err_data = {}
                        prediction_errors[agent_id] = {
                            'error': err_data.get('error', 0.0) if isinstance(err_data.get('error'), (int, float)) else 0.0,
                            'explanation': err_data.get('explanation', 'Invalid error format, defaulted to 0.0') if isinstance(err_data.get('explanation'), str) else 'Invalid error format, defaulted to 0.0'
                        }
                        print(f"[N]    → Agent {agent_id[:8]}: correction format erreur")
                
                n_result['prediction_errors'] = prediction_errors
                
                # Log résumé final des erreurs
                print(f"[N] ✅ Erreurs de prédiction validées: {len(prediction_errors)} agents (attendu: {len(w_data)})")
                for agent_id, err in list(prediction_errors.items())[:5]:  # Max 5 pour lisibilité
                    err_val = err.get('error', 0) if isinstance(err, dict) else 0
                    err_exp = err.get('explanation', 'N/A') if isinstance(err, dict) else 'N/A'
                    print(f"[N]    → Agent {agent_id[:8]}: error={err_val:.2f}, explanation={err_exp[:60]}...")
                
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
            
            # V5: Envoyer snapshot N (combiné) au serveur de métriques
            # Le snapshot combiné contient toutes les données N (narrative, C_w, prediction_errors)
            await metrics_client.send_n_snapshot(combined_snapshot)
        
        except Exception as e:
            print(f"[ON] Erreur combinaison O+N: {e}")
            # En cas d'erreur, conserver le snapshot précédent

# ==============================================================================
# FASTAPI APP
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrer la connexion au serveur de métriques
    metrics_client.start_background_connection()
    # Démarrer la tâche périodique O→N
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
        # Récupérer l'erreur de prédiction pour cet agent, ou utiliser valeur par défaut
        all_errors = snapshot.get('prediction_errors', {})
        agent_error = all_errors.get(agent_id)
        if not agent_error:
            # Pas d'erreur pour cet agent : utiliser valeur par défaut
            agent_error = {
                'error': 0.0,
                'explanation': 'No previous prediction available (first action or no prediction data)'
            }
        personalized = {
            **snapshot,
            'prediction_errors': {
                agent_id: agent_error
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

