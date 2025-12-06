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
# CONFIGURATION - Token to bits conversion factors
# ==============================================================================
TOKEN_TO_BITS_FACTOR_O = float(os.getenv('TOKEN_TO_BITS_FACTOR_O', '4.0'))
TOKEN_TO_BITS_FACTOR_N = float(os.getenv('TOKEN_TO_BITS_FACTOR_N', '4.0'))
TOKEN_TO_BITS_FACTOR_W = float(os.getenv('TOKEN_TO_BITS_FACTOR_W', '4.0'))

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
        # V5.2: Ignorer les heartbeats pour la logique métier (ne pas écraser les vraies données)
        is_heartbeat = data.get('is_heartbeat', False)
        if is_heartbeat:
            # Heartbeat : seulement mettre à jour le timestamp pour éviter suppression
            if agent_id in self.agents_data:
                # CRITICAL: Mettre à jour le timestamp même si l'agent existe déjà
                # Cela permet de maintenir l'agent actif même s'il est bloqué en attente
                self.agents_data[agent_id]['timestamp'] = data.get('timestamp', datetime.now(timezone.utc).isoformat())
                self.last_update_time = datetime.now(timezone.utc)
            else:
                # CRITICAL: Si l'agent n'existe pas encore, créer une entrée minimale
                # Cela peut arriver si l'agent a été supprimé mais envoie encore des heartbeats
                self.agents_data[agent_id] = {
                    'agent_id': agent_id,
                    'position': data.get('position', [0, 0]),
                    'iteration': data.get('iteration', 0),
                    'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat()),
                    'strategy': 'Heartbeat - agent still active',
                    'rationale': 'Waiting for snapshot or generating action...',
                    'predictions': {},
                    'previous_predictions': {},
                    'pixels': []
                }
                self.last_update_time = datetime.now(timezone.utc)
            return  # Ne pas traiter comme une vraie mise à jour
        
        previous_record = self.agents_data.get(agent_id, {})
        current_iteration = data.get('iteration', 0)
        previous_iteration = previous_record.get('iteration', -1)
        
        # CRITICAL: Conserver les prédictions de l'itération précédente
        # Si previous_record existe, utiliser ses predictions comme previous_predictions
        # Sinon, si current_iteration > 0, cela signifie que l'agent a été supprimé et recréé
        previous_predictions = previous_record.get('predictions', {})
        
        # Si l'itération actuelle est > 0 et qu'on n'a pas de previous_predictions,
        # mais qu'on a un previous_record avec des predictions, utiliser celles-ci
        if current_iteration > 0 and not previous_predictions:
            # Vérifier si previous_record a des predictions (peut-être sous un autre format)
            if 'predictions' in previous_record and previous_record['predictions']:
                previous_predictions = previous_record['predictions']
        
        # Log pour diagnostiquer
        if current_iteration > 0 and not previous_predictions:
            print(f"[W] ⚠️  Agent {agent_id[:8]}: iteration {current_iteration} mais pas de previous_predictions (previous_iteration={previous_iteration})")
            if previous_record:
                print(f"[W] 🔍 Agent {agent_id[:8]}: previous_record existe mais pas de predictions: {list(previous_record.keys())}")
            else:
                print(f"[W] 🔍 Agent {agent_id[:8]}: previous_record n'existe pas (agent supprimé ou première fois)")
        
        # CRITICAL: Avant de mettre à jour, sauvegarder les predictions actuelles comme previous_predictions
        # pour la prochaine itération
        current_predictions = data.get('predictions', {})
        
        self.agents_data[agent_id] = {
            'agent_id': agent_id,
            'position': data.get('position', [0, 0]),
            'iteration': current_iteration,
            'previous_iteration': previous_iteration,
            'strategy': data.get('strategy', 'N/A'),
            'rationale': data.get('rationale', ''),
            'predictions': current_predictions,
            # Conserver les prédictions de l'itération précédente pour N (évaluation erreur)
            # Si previous_predictions est vide mais qu'on a des predictions actuelles et iteration > 0,
            # cela signifie que c'est la première action après seed, donc previous_predictions devrait être vide
            'previous_predictions': previous_predictions,
            # V5: Stocker les pixels pour calcul C_w_machine (prolongement sensori-moteur)
            'pixels': data.get('pixels', []),
            'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat())
        }
        self.last_update_time = datetime.now(timezone.utc)
    
    def get_all_agents_data(self):
        """Retourner toutes les données W pour N"""
        return self.agents_data.copy()
    
    def clear_stale_agents(self, timeout=30):
        """Nettoyer les agents inactifs (obsolètes)
        
        CRITICAL: Ne pas supprimer les agents qui ont des prédictions importantes
        car on a besoin de leurs previous_predictions pour évaluer l'erreur de prédiction.
        """
        if not self.agents_data:
            return
        
        now = datetime.now(timezone.utc)
        stale_agents = []
        
        for agent_id, data in self.agents_data.items():
            timestamp_str = data.get('timestamp', '')
            iteration = data.get('iteration', -1)
            has_predictions = bool(data.get('predictions', {}))
            has_previous_predictions = bool(data.get('previous_predictions', {}))
            
            try:
                agent_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                delta = (now - agent_time).total_seconds()
                
                # V5.2: Timeout adaptatif selon l'itération
                # - Seeds (iter=0) : 480s (8 minutes) - les seeds doivent générer 400 pixels, 
                #   l'appel Gemini peut prendre jusqu'à 420s, et l'envoi des pixels peut prendre du temps
                # - Première action (iter=1) : timeout normal
                # - Agents actifs (iter > 1) : timeout beaucoup plus long car ils sont clairement actifs
                #   et peuvent prendre du temps entre actions (attente snapshot, génération, rate limits)
                if iteration == 0:
                    effective_timeout = 480  # Seeds : 8 minutes (correspond au timeout Gemini max 420s + marge)
                elif iteration == 1:
                    effective_timeout = timeout  # Première action
                elif iteration > 1:
                    # Agents actifs : timeout beaucoup plus long (15 minutes)
                    # Car ils peuvent prendre du temps entre actions (attente snapshot, génération Gemini jusqu'à 420s, rate limits)
                    # Agents actifs : timeout beaucoup plus long (20 minutes)
                    # Car ils peuvent prendre du temps entre actions (attente snapshot, génération Gemini jusqu'à 420s, rate limits)
                    # CRITICAL: Le heartbeat est envoyé toutes les 30s, donc avec un timeout de 1200s (20 min),
                    # on peut manquer jusqu'à 40 heartbeats avant suppression (tolérance réseau/WiFi élevée)
                    effective_timeout = 1200  # 20 minutes pour agents actifs (tolérance réseau/WiFi)
                else:
                    effective_timeout = timeout
                
                # CRITICAL: Ne pas supprimer les agents qui ont des prédictions mais pas encore de previous_predictions
                # car ils vont bientôt envoyer leur prochaine itération et on aura besoin de leurs prédictions actuelles
                # comme previous_predictions pour la prochaine itération
                if has_predictions and not has_previous_predictions and iteration > 0:
                    # Agent a des prédictions mais pas de previous_predictions - il va bientôt envoyer sa prochaine itération
                    # Ne pas supprimer avant 180s (3 minutes) pour laisser le temps
                    effective_timeout = max(effective_timeout, 180)
                
                # CRITICAL: Ne pas supprimer les seeds (iter=0) qui ont des pixels mais pas encore de données W complètes
                # Les seeds peuvent prendre du temps à générer et envoyer leurs 400 pixels
                if iteration == 0:
                    has_pixels = bool(data.get('pixels', []))
                    if has_pixels:
                        # Seed a déjà généré des pixels, ne pas supprimer trop rapidement
                        # Augmenter le timeout à 600s (10 minutes) si le seed a des pixels
                        effective_timeout = max(effective_timeout, 600)
                
                if delta > effective_timeout:
                    # Stocker le timeout avec l'agent_id pour le log
                    stale_agents.append((agent_id, effective_timeout))
            except:
                pass
        
        for agent_id, agent_timeout in stale_agents:
            iteration = self.agents_data.get(agent_id, {}).get('iteration', -1)
            del self.agents_data[agent_id]
            print(f"[W] Agent {agent_id[:8]} supprimé (inactif > {agent_timeout}s, iter={iteration})")
    
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
        self.first_analysis_start_time: Optional[datetime] = None  # V5: Timestamp début attente première analyse
        self.last_update_time: Optional[datetime] = None
        self.first_update_time: Optional[datetime] = None
        self.updates_count: int = 0

    def set_snapshot(self, snapshot: dict):
        self.version += 1
        snapshot['version'] = self.version
        snapshot['timestamp'] = datetime.now(timezone.utc).isoformat()
        self.latest = snapshot
        # V5: Réinitialiser timestamp première analyse après snapshot réussi
        if self.first_analysis_start_time is not None:
            self.first_analysis_start_time = None

    def set_image(self, image_base64: str):
        # V5: Accepter toutes les images (tous les clients envoient leur vue)
        # Le serveur utilise simplement la dernière image reçue
        # NOTE: Tous les clients devraient voir la même chose via WebSocket,
        # donc leurs images devraient être identiques (ou très similaires)
        now = datetime.now(timezone.utc)
        self.latest_image_base64 = image_base64
        self.last_update_time = now
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

# Instance locale du tracker pour calculer les rankings (sans dépendre du serveur de métriques)
# Import ici pour éviter import circulaire
try:
    from metrics_server_v5 import GlobalSimplicityTrackerV5
    local_metrics_tracker = GlobalSimplicityTrackerV5()
except ImportError as e:
    print(f"[ON] ⚠️  Impossible d'importer GlobalSimplicityTrackerV5: {e}")
    print("[ON] ⚠️  Les rankings ne seront pas calculés")
    local_metrics_tracker = None

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
# TOKEN ESTIMATION AND MACHINE METRICS
# ==============================================================================

def estimate_tokens_from_json_field(data: dict, field_path: List[str]) -> int:
    """
    Estime le nombre de tokens d'un champ JSON.
    
    Args:
        data: Objet JSON
        field_path: Chemin vers le champ (ex: ["structures"], ["formal_relations", "summary"])
    
    Returns:
        Nombre estimé de tokens (approximation: ~4 chars/token pour Gemini)
    """
    try:
        # Naviguer vers le champ
        current = data
        for key in field_path:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return 0
        
        # Sérialiser en JSON compact
        json_text = json.dumps(current, ensure_ascii=False, separators=(',', ':'))
        
        # Estimation: ~4 caractères par token pour Gemini
        tokens = max(0, len(json_text) // 4)
        return tokens
    except Exception as e:
        print(f"[TokenEst] Erreur estimation tokens pour {field_path}: {e}")
        return 0

def calculate_cd_machine_tokens(o_result: dict, n_result: dict, o_total_tokens: int) -> int:
    """
    Calcule les tokens pour C_d_machine en incluant les résultats d'observation/narration
    et en soustrayant UNIQUEMENT les tokens de l'estimation C_d.
    
    Args:
        o_result: Résultat O-machine (structures, formal_relations, simplicity_assessment)
        n_result: Résultat N-machine (narrative)
        o_total_tokens: Nombre total de tokens de sortie de O
    
    Returns:
        Nombre de tokens pour C_d_machine (après soustraction de l'estimation C_d)
    """
    if not o_result or not n_result:
        return 0
    
    total_tokens = 0
    
    # 1. Tokens des structures (RÉSULTAT de l'observation, à INCLURE)
    structures_tokens = estimate_tokens_from_json_field(o_result, ["structures"])
    total_tokens += structures_tokens
    
    # 2. Tokens des formal_relations (RÉSULTAT de l'observation, à INCLURE)
    formal_relations_tokens = estimate_tokens_from_json_field(o_result, ["formal_relations"])
    total_tokens += formal_relations_tokens
    
    # 3. CRITICAL: Soustraire UNIQUEMENT les tokens de l'ESTIMATION de C_d (le calcul/raisonnement)
    # L'estimation C_d est le champ simplicity_assessment.C_d_current qui contient:
    # - La valeur calculée (value)
    # - La description complète de l'estimation (description)
    # Ce champ représente le calcul/raisonnement de O, pas le résultat observé.
    # Les structures et formal_relations sont les RÉSULTATS observés, donc on les inclut.
    # La description dans C_d_current est ambiguë (résultat + estimation), donc on soustrait tout le champ.
    cd_current = o_result.get("simplicity_assessment", {}).get("C_d_current", {})
    if cd_current:
        # Soustraire les tokens de l'estimation C_d complète (valeur + description)
        # C'est le calcul/raisonnement, pas le résultat observé
        cd_estimation_json = json.dumps(cd_current, ensure_ascii=False, separators=(',', ':'))
        cd_estimation_tokens = max(0, len(cd_estimation_json) // 4)
        total_tokens -= cd_estimation_tokens
    
    # 4. Tokens du narrative (RÉSULTAT de la narration, à INCLURE)
    narrative = n_result.get("narrative", {})
    summary_text = narrative.get("summary", "")
    if summary_text:
        narrative_tokens = max(0, len(summary_text) // 4)
        total_tokens += narrative_tokens
    
    return max(0, total_tokens)

def calculate_cw_machine_tokens(w_agents_data: dict) -> int:
    """
    Calcule les tokens pour C_w_machine en sommant les tokens de tous les agents W.
    
    Inclut: strategy, rationale, predictions, pixels (prolongement sensori-moteur).
    
    Args:
        w_agents_data: Dict {agent_id: {strategy, rationale, predictions, pixels, ...}}
    
    Returns:
        Nombre total de tokens pour C_w_machine
    """
    if not w_agents_data:
        return 0
    
    total_tokens = 0
    
    for agent_id, agent_data in w_agents_data.items():
        # 1. Tokens de strategy (texte)
        strategy = agent_data.get("strategy", "")
        if strategy:
            total_tokens += max(0, len(strategy) // 4)
        
        # 2. Tokens de rationale (texte)
        rationale = agent_data.get("rationale", "")
        if rationale:
            total_tokens += max(0, len(rationale) // 4)
        
        # 3. Tokens de predictions (JSON)
        predictions = agent_data.get("predictions", {})
        if predictions:
            predictions_json = json.dumps(predictions, ensure_ascii=False, separators=(',', ':'))
            total_tokens += max(0, len(predictions_json) // 4)
        
        # 4. Tokens de pixels (prolongement sensori-moteur, format ["x,y#HEX", ...])
        # Les pixels apportent de la complexité de génération même s'ils sont redondants avec strategy
        pixels = agent_data.get("pixels", [])
        if pixels:
            pixels_json = json.dumps(pixels, ensure_ascii=False, separators=(',', ':'))
            total_tokens += max(0, len(pixels_json) // 4)
    
    return total_tokens

def calculate_machine_metrics(o_result: dict, n_result: dict, w_agents_data: dict, 
                              o_tokens: Optional[int], n_tokens: Optional[int]) -> dict:
    """
    Calcule les métriques machine (C_d_machine, C_w_machine, U_machine) basées sur les tokens.
    
    Args:
        o_result: Résultat O-machine
        n_result: Résultat N-machine
        w_agents_data: Données de tous les agents W
        o_tokens: Nombre de tokens de sortie de O (optionnel, utilisé pour validation)
        n_tokens: Nombre de tokens de sortie de N (optionnel, non utilisé actuellement)
    
    Returns:
        Dict avec machine_metrics contenant C_d_machine, C_w_machine, U_machine
    """
    # Calculer les tokens pour C_d_machine
    cd_tokens = calculate_cd_machine_tokens(o_result, n_result, o_tokens or 0)
    C_d_machine = cd_tokens * TOKEN_TO_BITS_FACTOR_O
    
    # Calculer les tokens pour C_w_machine
    cw_tokens = calculate_cw_machine_tokens(w_agents_data)
    C_w_machine = cw_tokens * TOKEN_TO_BITS_FACTOR_W
    
    # Calculer U_machine
    U_machine = C_w_machine - C_d_machine
    
    return {
        "machine_metrics": {
            "C_d_machine": {
                "value": C_d_machine,
                "tokens": cd_tokens,
                "factor": TOKEN_TO_BITS_FACTOR_O
            },
            "C_w_machine": {
                "value": C_w_machine,
                "tokens": cw_tokens,
                "factor": TOKEN_TO_BITS_FACTOR_W
            },
            "U_machine": {
                "value": U_machine
            }
        }
    }

# ==============================================================================
# APPELS GEMINI
# ==============================================================================

def _truncate_text(text: str, max_length: int = 200) -> str:
    """Tronquer un texte à max_length caractères"""
    if not text or len(text) <= max_length:
        return text
    return text[:max_length] + '...'

def _truncate_predictions(predictions: dict, max_length: int = 150) -> dict:
    """Tronquer les valeurs de prédictions si elles sont trop longues"""
    if not isinstance(predictions, dict):
        return {}
    truncated = {}
    for key, value in predictions.items():
        if isinstance(value, str):
            truncated[key] = _truncate_text(value, max_length)
        else:
            truncated[key] = value
    return truncated

async def call_gemini_o(image_base64: str, agents_count: int, previous_snapshot: Optional[dict] = None, agent_positions: Optional[list] = None) -> Tuple[Optional[dict], Optional[int]]:
    """Appelle Gemini pour O-machine (observation des structures et calcul C_d)
    Retourne: (résultat JSON, nombre de tokens de sortie)"""
    print(f"[O] 🚀 Début appel Gemini O (agents: {agents_count}, image: {len(image_base64)} bytes)")
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[O] GEMINI_API_KEY non définie")
        return (None, None)
    
    try:
        prompt = load_o_prompt()
        if not isinstance(prompt, str):
            print(f"[O] ⚠️ Prompt n'est pas une chaîne")
            return (None, None)
    except Exception as e:
        print(f"[O] Erreur chargement prompt: {e}")
        return (None, None)
    
    # Injecter agents_count
    try:
        prompt = prompt.replace('{{agents_count}}', str(agents_count))
    except Exception as e:
        print(f"[O] Erreur injection agents_count: {e}")
        return (None, None)
    
    # Injecter les positions réelles des agents
    try:
        if agent_positions and len(agent_positions) > 0:
            # Formater la liste des positions pour le prompt avec indication visuelle
            # Trier pour cohérence (Y puis X)
            sorted_positions = sorted(agent_positions, key=lambda p: (p[1], p[0]))
            num_agents = len(sorted_positions)
            
            # Seuils basés sur les transitions de zoom de la grille (carrés parfaits centrés)
            # 1 (1×1), 9 (3×3), 25 (5×5), 49 (7×7), 81 (9×9), etc.
            # Pour ≥25 agents, utiliser format compact avec GRID SPAN
            if num_agents >= 25:
                # Format compact : liste simple + instructions de mapping
                positions_str = ', '.join([f'[{pos[0]},{pos[1]}]' for pos in sorted_positions])
                
                # Calculer les limites pour donner une idée de la grille
                min_x = min(p[0] for p in sorted_positions)
                max_x = max(p[0] for p in sorted_positions)
                min_y = min(p[1] for p in sorted_positions)
                max_y = max(p[1] for p in sorted_positions)
                
                position_desc = f"{positions_str}\n"
                position_desc += f"GRID SPAN: X=[{min_x} to {max_x}], Y=[{min_y} to {max_y}]. [0,0] is CENTER.\n"
                position_desc += "Find each position visually: X<0=left, X>0=right, Y<0=top, Y>0=bottom relative to center."
            else:
                # Pour peu d'agents, format détaillé avec quadrants
                positions_str = ', '.join([f'[{pos[0]},{pos[1]}]' for pos in sorted_positions])
                
                # Grouper par quadrant pour faciliter la compréhension
                quadrants = {'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [], 'center': []}
                for pos in sorted_positions:
                    x, y = pos[0], pos[1]
                    if x == 0 and y == 0:
                        quadrants['center'].append(f'[{x},{y}]')
                    elif x < 0 and y < 0:
                        quadrants['top-left'].append(f'[{x},{y}]')
                    elif x >= 0 and y < 0:
                        quadrants['top-right'].append(f'[{x},{y}]')
                    elif x < 0 and y >= 0:
                        quadrants['bottom-left'].append(f'[{x},{y}]')
                    else:
                        quadrants['bottom-right'].append(f'[{x},{y}]')
                
                # Construire une description plus claire
                position_desc = f"{positions_str}\n"
                position_desc += "VISUAL MAPPING:\n"
                if quadrants['center']:
                    position_desc += f"- CENTER: {', '.join(quadrants['center'])}\n"
                if quadrants['top-left']:
                    position_desc += f"- TOP-LEFT (Y<0, X<0): {', '.join(quadrants['top-left'])}\n"
                if quadrants['top-right']:
                    position_desc += f"- TOP-RIGHT (Y<0, X>=0): {', '.join(quadrants['top-right'])}\n"
                if quadrants['bottom-left']:
                    position_desc += f"- BOTTOM-LEFT (Y>=0, X<0): {', '.join(quadrants['bottom-left'])}\n"
                if quadrants['bottom-right']:
                    position_desc += f"- BOTTOM-RIGHT (Y>=0, X>=0): {', '.join(quadrants['bottom-right'])}\n"
            
            prompt = prompt.replace('{{agent_positions}}', position_desc)
            print(f"[O] 📍 Positions agents injectées ({len(sorted_positions)} agents): {positions_str[:100]}...")
        else:
            # Si pas de positions, remplacer par un message
            prompt = prompt.replace('{{agent_positions}}', 'No agent positions available')
            print(f"[O] ⚠️  Aucune position d'agent disponible")
    except Exception as e:
        print(f"[O] Erreur injection agent_positions: {e}")
        # Continuer quand même sans les positions
    
    try:
        print(f"[O] 📝 Prompt final: {len(prompt)} chars (~{len(prompt)//4} tokens)")
    except Exception as e:
        pass
    
    # Préparer le body
    parts = [{'text': prompt}]
    if image_base64:
        clean_base64 = image_base64
        if clean_base64.startswith('data:image/png;base64,'):
            clean_base64 = clean_base64.replace('data:image/png;base64,', '')
        
        # Vérifier que l'image base64 est valide (non vide, longueur raisonnable)
        if len(clean_base64) < 100:
            print(f"[O] ⚠️  Image base64 trop courte ({len(clean_base64)} chars) - peut-être invalide")
        else:
            print(f"[O] 📷 Image base64 valide: {len(clean_base64)} chars (début: {clean_base64[:50]}...)")
        
        parts.append({
            'inline_data': {
                'mime_type': 'image/png',
                'data': clean_base64
            }
        })
        print(f"[O] 📷 Image incluse dans la requête Gemini (parts: {len(parts)}, image: {len(clean_base64)} chars)")
    else:
        print(f"[O] ⚠️  ATTENTION: Aucune image fournie à Gemini O!")
    
    url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={api_key}"
    body = {
        'contents': [{'parts': parts}],
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 16000  # V5.1: Augmenter modérément (12000→16000) car thoughts peuvent être longs même avec prompts simplifiés
        }
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, json=body)
            if not resp.is_success:
                error_text = resp.text
                print(f"[O] Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return (None, None)
            
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
                return (None, None)
            
            # Parser JSON
            result = parse_json_robust(text, "[O]")
            # Extraire les tokens de sortie
            usage_metadata = data.get('usageMetadata', {})
            output_tokens = usage_metadata.get('candidatesTokenCount', 0) or usage_metadata.get('outputTokens', 0)
            
            thoughts_tokens = usage_metadata.get('thoughtsTokenCount', 0)
            if result:
                print(f"[O] ✅ Gemini O réussi (longueur réponse: {len(text)} chars, output tokens: {output_tokens}, thoughts: {thoughts_tokens} tokens)")
                # Avertir si thoughts consomment trop de tokens
                if thoughts_tokens > 10000:
                    print(f"[O] ⚠️  ATTENTION: Thoughts très longs ({thoughts_tokens} tokens) - considérer optimisation prompt")
            else:
                print(f"[O] ❌ Parsing JSON échoué (thoughts: {thoughts_tokens} tokens)")
            return (result, output_tokens if result else None)
                
    except Exception as e:
        print(f"[O] Erreur appel Gemini: {e}")
        return (None, None)


async def call_gemini_n(o_snapshot: dict, w_agents_data: dict, previous_combined: Optional[dict] = None) -> Tuple[Optional[dict], Optional[int]]:
    """Appelle Gemini pour N-machine (narration, C_w, erreurs prédiction)
    Retourne: (résultat JSON, nombre de tokens de sortie)"""
    print(f"[N] 🚀 Début appel Gemini N avec {len(w_agents_data)} agents W")
    print(f"[N]    O-snapshot: {len(o_snapshot.get('structures', []))} structures")
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[N] GEMINI_API_KEY non définie")
        return (None, None)
    
    try:
        prompt = load_n_prompt()
        if not isinstance(prompt, str):
            print(f"[N] ⚠️ Prompt n'est pas une chaîne")
            return (None, None)
    except Exception as e:
        print(f"[N] Erreur chargement prompt: {e}")
        return (None, None)
    
    # Construire le prompt avec les données O et W
    try:
        # Injecter snapshot O (optimisé: pas d'indentation pour réduire taille)
        o_json = json.dumps(o_snapshot, ensure_ascii=False, separators=(',', ':'))
        prompt = prompt.replace('{{o_snapshot}}', o_json)
        
        # Optimiser données W avant injection (réduire taille)
        w_optimized = {}
        for agent_id, data in w_agents_data.items():
            # Ne garder que les champs essentiels et tronquer les textes longs
            optimized_data = {
                'agent_id': agent_id,
                'position': data.get('position', [0, 0]),
                'iteration': data.get('iteration', 0),
                'previous_iteration': data.get('previous_iteration', -1),
                'strategy': data.get('strategy', 'N/A'),
                'rationale': _truncate_text(data.get('rationale', ''), max_length=100),  # Tronquer rationale à 100 chars
                'predictions': _truncate_predictions(data.get('predictions', {}), max_length=80),  # Tronquer prédictions à 80 chars
                'previous_predictions': _truncate_predictions(data.get('previous_predictions', {}), max_length=80)  # Tronquer prédictions précédentes à 80 chars
            }
            w_optimized[agent_id] = optimized_data
        
        # Injecter données W optimisées (pas d'indentation pour réduire taille)
        w_json = json.dumps(w_optimized, ensure_ascii=False, separators=(',', ':'))
        prompt = prompt.replace('{{w_agents_data}}', w_json)
        # Log aperçu des données W injectées
        for agent_id, data in w_agents_data.items():  # Tous les agents pour diagnostic
            has_prev_pred = bool(data.get('previous_predictions'))
            has_pred = bool(data.get('predictions'))
            prev_pred_keys = list(data.get('previous_predictions', {}).keys()) if data.get('previous_predictions') else []
            iter_val = data.get('iteration', 'N/A')
            prev_iter_val = data.get('previous_iteration', 'N/A')
            print(f"[N]    → Agent {agent_id[:8]}: iter={iter_val}, prev_iter={prev_iter_val}, has_prev_pred={has_prev_pred}, has_pred={has_pred}, prev_pred_keys={prev_pred_keys}")
        
        # Injecter snapshot précédent (si disponible, optimisé)
        if previous_combined:
            # Ne garder que les champs essentiels du snapshot précédent
            prev_optimized = {
                'narrative': previous_combined.get('narrative', {}),
                'simplicity_assessment': previous_combined.get('simplicity_assessment', {}),
                'version': previous_combined.get('version', 0)
            }
            prev_json = json.dumps(prev_optimized, ensure_ascii=False, separators=(',', ':'))
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
            'maxOutputTokens': 16000  # V5.1: Augmenter modérément (12000→16000) pour éviter MAX_TOKENS avec beaucoup d'agents
        }
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, json=body)
            if not resp.is_success:
                error_text = resp.text
                print(f"[N] Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return (None, None)
            
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
                print(f"[N] 🔍 Réponse JSON brute: {json.dumps(data, indent=2)[:1000]}")
                if text:
                    print(f"[N] Texte reçu: '{text}'")
                return (None, None)
            
            # Parser JSON
            result = parse_json_robust(text, "[N]")
            # Extraire les tokens de sortie
            usage_metadata = data.get('usageMetadata', {})
            output_tokens = usage_metadata.get('candidatesTokenCount', 0) or usage_metadata.get('outputTokens', 0)
            
            thoughts_tokens = usage_metadata.get('thoughtsTokenCount', 0)
            if result:
                print(f"[N] ✅ Gemini N réussi (longueur réponse: {len(text)} chars, output tokens: {output_tokens}, thoughts: {thoughts_tokens} tokens)")
                # Avertir si thoughts consomment trop de tokens
                if thoughts_tokens > 10000:
                    print(f"[N] ⚠️  ATTENTION: Thoughts très longs ({thoughts_tokens} tokens) - considérer optimisation prompt")
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
            return (result, output_tokens if result else None)
                
    except Exception as e:
        print(f"[N] Erreur appel Gemini: {e}")
        return (None, None)


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
    print("[ON] 🚀 Tâche périodique O→N démarrée")
    while True:
        await asyncio.sleep(2)  # V5: Vérifier toutes les 2s si tous les agents W ont terminé
        
        now = datetime.now(timezone.utc)
        
        # Vérifications préalables
        if not store.latest_image_base64:
            # Log seulement toutes les 10s pour éviter le spam (utiliser un compteur simple)
            if not hasattr(periodic_on_task, '_last_no_image_log'):
                periodic_on_task._last_no_image_log = now
            last_log = periodic_on_task._last_no_image_log
            if (now - last_log).total_seconds() >= 10:
                print("[ON] Pas d'image disponible, attente...")
                periodic_on_task._last_no_image_log = now
            continue
        
        # Warmup : attendre que les agents aient terminé leurs seeds
        warmup_delay = 30  # V5: Augmenter à 30s pour laisser temps aux seeds d'être visibles et appliqués
        warmup_timeout = 60  # CRITICAL: Timeout absolu de 60s pour éviter blocage infini
        
        # V5: Vérifier le nombre d'agents qui ont envoyé des données W (plus fiable que updates_count)
        w_data = w_store.get_all_agents_data()
        agents_with_data = len(w_data)
        
        # Pour la première analyse, attendre qu'au moins 75% des agents aient envoyé leurs seeds
        min_agents_ratio = 0.75
        # Permettre 1 agent pour les tests, sinon minimum 2 ou 75% du total
        if store.agents_count == 1:
            min_agents_with_data = 1
        else:
            min_agents_with_data = max(2, int(store.agents_count * min_agents_ratio)) if store.agents_count > 0 else 2
        
        elapsed = (now - store.first_update_time).total_seconds() if store.first_update_time else 0
        
        # Sortir du warmup si :
        # 1. On a assez d'agents avec données (75% ou au moins 2) ET assez de temps écoulé (warmup_delay)
        # 2. OU timeout absolu atteint (warmup_timeout)
        is_warmup = False
        if store.latest is None:  # Première analyse seulement
            if elapsed < warmup_delay and agents_with_data < min_agents_with_data:
                is_warmup = True
            elif elapsed >= warmup_timeout:
                # Timeout absolu : forcer la sortie même si pas tous les agents ont envoyé
                print(f"[ON] ⚠️  Warmup timeout ({elapsed:.1f}s ≥ {warmup_timeout}s) - FORÇAGE sortie avec {agents_with_data}/{store.agents_count} agents")
                is_warmup = False
            else:
                is_warmup = False
        
        if is_warmup:
            print(f"[ON] Warmup en cours ({elapsed:.1f}s / {warmup_delay}s, {agents_with_data}/{store.agents_count} agents avec données, min requis: {min_agents_with_data})...")
            # V5: Ne pas marquer les agents déconnectés pendant le warmup
            continue
        
        # Vérifier obsolescence (agents déconnectés) - seulement après le warmup
        # CRITICAL: Les agents W peuvent prendre jusqu'à 7 minutes pour générer (timeout Gemini client = 420s)
        # Il faut donc un timeout de détection de déconnexion suffisamment long pour éviter les fausses déconnexions
        # V5: Timeout plus long pour la phase initiale (seeds peuvent prendre du temps)
        # CRITICAL: Vérifier aussi l'activité via les données W (plus fiable que seulement l'image)
        # Note: w_data déjà récupéré plus haut pour le warmup, mais on le récupère à nouveau ici pour avoir les données les plus récentes
        w_data = w_store.get_all_agents_data()
        w_last_update = w_store.last_update_time
        w_activity_delta = (now - w_last_update).total_seconds() if w_last_update else float('inf')
        
        # Timeout de détection de déconnexion :
        # - Phase initiale (premiers 10 updates) : 180s (3 minutes) - seeds peuvent prendre du temps
        # - Phase normale : 300s (5 minutes) - laisse le temps aux agents de finir leurs appels Gemini (max 420s)
        #   mais détecte quand même les vraies déconnexions (si un agent ne répond pas pendant 5 minutes, c'est suspect)
        timeout_seconds = 180 if (store.updates_count or 0) < 10 else 300
        image_stale = store.is_stale(timeout_seconds=timeout_seconds)
        w_stale = w_activity_delta > timeout_seconds if w_last_update else False
        
        # V5: Vérifier qu'il y a des données W disponibles AVANT de vérifier la déconnexion
        # Pour avoir le nombre réel d'agents actifs avec données
        w_data = w_store.get_all_agents_data()
        agents_with_data = len(w_data)
        
        # CRITICAL FIX: Détecter déconnexion si :
        # 1. Image ET données W obsolètes (comportement normal)
        # 2. OU si agents_count > agents_with_data ET données W obsolètes (agents déclarés mais pas de données récentes)
        # 3. OU si agents_count > 0 ET agents_with_data == 0 ET données W obsolètes (tous les agents déconnectés)
        should_disconnect = False
        disconnect_reason = ""
        
        if image_stale and w_stale:
            should_disconnect = True
            disconnect_reason = f"image obsolète ({image_stale}) ET données W obsolètes ({w_activity_delta:.1f}s)"
        elif store.agents_count > agents_with_data and w_stale:
            # Plus d'agents déclarés que d'agents avec données, et données obsolètes
            should_disconnect = True
            disconnect_reason = f"agents_count ({store.agents_count}) > agents_with_data ({agents_with_data}) ET données W obsolètes ({w_activity_delta:.1f}s)"
        elif store.agents_count > 0 and agents_with_data == 0 and w_stale:
            # Agents déclarés mais aucun avec données récentes
            should_disconnect = True
            disconnect_reason = f"agents_count ({store.agents_count}) > 0 mais agents_with_data (0) ET données W obsolètes ({w_activity_delta:.1f}s)"
        
        if should_disconnect and store.agents_count > 0:
            print(f"[ON] ⚠️  Déconnexion détectée ({timeout_seconds}s timeout): {disconnect_reason} - agents considérés déconnectés")
            store.set_agents_count(0)
        elif image_stale and not w_stale:
            # Image obsolète mais données W récentes : agents toujours actifs
            print(f"[ON] Image obsolète mais données W récentes ({w_activity_delta:.1f}s < {timeout_seconds}s) - agents toujours actifs ({agents_with_data}/{store.agents_count})")
        
        if store.agents_count == 0:
            print("[ON] Pas d'agents actifs, attente...")
            continue
        
        # V5: Vérifier qu'il y a des données W disponibles (au moins 1 agent a fait une action)
        # Pour la première analyse, on peut accepter 0 données W (seeds seulement)
        # Mais pour les analyses suivantes, on veut s'assurer qu'il y a des données W récentes
        # CRITICAL FIX: Si agents_count est significativement supérieur à agents_with_data,
        # cela signifie que des agents sont déconnectés - arrêter l'analyse
        if store.agents_count > 0 and agents_with_data < store.agents_count:
            # Calculer le ratio d'agents avec données
            agents_ratio = agents_with_data / store.agents_count if store.agents_count > 0 else 0
            # Si moins de 50% des agents ont des données, considérer comme déconnexion
            if agents_ratio < 0.5:
                print(f"[ON] ⚠️  Déconnexion détectée: seulement {agents_with_data}/{store.agents_count} agents avec données ({agents_ratio*100:.1f}%) - arrêt analyse")
                store.set_agents_count(0)
                continue
        
        if len(w_data) == 0 and store.latest is None:
            # Première analyse : accepter même sans données W (seeds seulement)
            pass
        elif len(w_data) == 0 and store.latest is not None:
            # Analyse suivante mais pas de données W : attendre
            print(f"[ON] Aucune donnée W disponible, attente données agents...")
            continue
        
        # V5: CRITIQUE - Vérifier si tous les agents W actifs ont terminé leurs actions
        # Quiescence : si aucun agent W n'a envoyé de données depuis quiescence_delay secondes,
        # alors tous ont terminé et on peut déclencher l'analyse O+N
        quiescence_delay = 6.0 if store.latest is None else 5.0  # 6s pour première analyse, 5s pour suivantes (augmenté pour laisser temps aux images)
        all_finished, time_since_last_w_update = w_store.all_agents_finished(quiescence_delay=quiescence_delay)
        
        # V5: CRITIQUE - Vérifier que l'image a été mise à jour récemment ET après les données W
        # L'image doit être récente (moins de max_image_age secondes) ET idéalement après la dernière donnée W
        image_age = 0
        image_timeout_forced = False  # Flag pour indiquer qu'on a forcé l'analyse
        if store.last_update_time:
            image_age = (now - store.last_update_time).total_seconds()
            max_image_age = 30.0 if store.latest is None else 10.0  # Réduire à 10s pour analyses suivantes (plus strict)
            # CRITICAL FIX: Timeout absolu pour éviter le blocage si les W-machines ne dessinent plus
            # Si l'image est trop ancienne depuis trop longtemps, forcer l'analyse avec l'image disponible
            max_wait_for_image = 60.0  # 60 secondes max d'attente pour une image récente
            if not hasattr(periodic_on_task, '_image_wait_start'):
                periodic_on_task._image_wait_start = now
            
            image_wait_time = (now - periodic_on_task._image_wait_start).total_seconds()
            
            if image_age > max_image_age:
                if image_wait_time >= max_wait_for_image:
                    # Timeout atteint, forcer l'analyse avec l'image disponible
                    print(f"[ON] ⚠️  Timeout image ({image_wait_time:.1f}s ≥ {max_wait_for_image}s) - FORÇAGE analyse avec image de {image_age:.1f}s")
                    periodic_on_task._image_wait_start = now  # Reset pour prochaine analyse
                    image_timeout_forced = True  # Marquer qu'on a forcé
                else:
                    print(f"[ON] Image trop ancienne ({image_age:.1f}s > {max_image_age}s), attente mise à jour récente ({image_wait_time:.1f}s/{max_wait_for_image}s)...")
                    continue
            else:
                # Image récente, reset le timer
                if hasattr(periodic_on_task, '_image_wait_start'):
                    delattr(periodic_on_task, '_image_wait_start')
        
        # V5: CRITIQUE - Vérifier que l'image a été mise à jour après ou en même temps que les dernières données W
        # Si les données W sont plus récentes que l'image, attendre que l'image soit mise à jour
        # SAUF si on a forcé l'analyse à cause du timeout image (image_timeout_forced)
        if not image_timeout_forced and w_store.last_update_time and store.last_update_time:
            w_update_time = w_store.last_update_time
            image_update_time = store.last_update_time
            time_diff = (w_update_time - image_update_time).total_seconds()
            # Si les données W sont plus récentes que l'image de plus de 2s, attendre
            if time_diff > 2.0:
                print(f"[ON] ⏳ Données W plus récentes que l'image ({time_diff:.1f}s d'écart), attente mise à jour image...")
                continue
        
        # CRITIQUE: Récupérer les données W juste avant de vérifier (pas au début de la boucle)
        # car d'autres agents peuvent avoir envoyé leurs données entre-temps
        w_data_check = w_store.get_all_agents_data()
        
        # CRITIQUE: Pour la première analyse, attendre que les agents actifs aient envoyé au moins leur seed
        if store.latest is None:
            # Première analyse : initialiser le timestamp si c'est la première fois
            if store.first_analysis_start_time is None:
                store.first_analysis_start_time = now
            
            if store.agents_count > 0:
                if len(w_data_check) == 0:
                    # Aucune donnée W reçue alors que des agents sont actifs
                    print(f"[ON] ⏳ Première analyse: {store.agents_count} agents actifs mais aucune donnée W reçue - attente seeds...")
                    continue
                
                # Calculer temps d'attente depuis début attente première analyse
                wait_time = (now - store.first_analysis_start_time).total_seconds()
                min_agents_ratio = 0.75  # Accepter si 75% des agents ont envoyé leurs données
                # Permettre 1 agent pour les tests, sinon minimum 2 ou 75% du total
                if store.agents_count == 1:
                    min_agents_count = 1
                else:
                    min_agents_count = max(2, int(store.agents_count * min_agents_ratio))  # Au moins 2 agents ou 75%
                timeout_first_analysis = 20.0  # Timeout de 20s pour première analyse
                
                if len(w_data_check) < store.agents_count:
                    # Pas tous les agents ont envoyé leurs données
                    if len(w_data_check) >= min_agents_count:
                        # On a assez d'agents (75% ou au moins 2) : accepter l'analyse
                        print(f"[ON] ✅ Première analyse: {len(w_data_check)}/{store.agents_count} agents ont envoyé leurs données (≥{min_agents_count} requis) - analyse autorisée")
                    elif wait_time >= timeout_first_analysis:
                        # Timeout atteint : accepter avec les agents disponibles
                        print(f"[ON] ⚠️  Première analyse: timeout ({wait_time:.1f}s ≥ {timeout_first_analysis}s) - analyse avec {len(w_data_check)}/{store.agents_count} agents disponibles")
                    else:
                        # Attendre encore
                        print(f"[ON] ⏳ Première analyse: {len(w_data_check)}/{store.agents_count} agents ont envoyé leurs données (attente {wait_time:.1f}s/{timeout_first_analysis}s)...")
                        continue
                
                # Vérifier aussi qu'on a attendu assez longtemps après la dernière mise à jour
                if time_since_last_w_update < 3.0:  # Minimum 3s après dernière seed
                    print(f"[ON] ⏳ Première analyse: dernière seed il y a {time_since_last_w_update:.1f}s < 3s - attente stabilisation...")
                    continue
        else:
            # Analyses suivantes : vérification standard
            if store.agents_count > 0 and len(w_data_check) == 0:
                # Des agents sont actifs mais n'ont pas encore envoyé de données (en cours de démarrage/seed)
                print(f"[ON] {store.agents_count} agents actifs mais aucune donnée W reçue - attente seed...")
                continue
        
        # V5: Timeout absolu pour éviter l'attente indéfinie si un agent est bloqué
        # Si on a des données W et que ça fait plus de 45s qu'on attend la quiescence, forcer l'analyse
        max_quiescence_wait = 45.0  # 45 secondes max d'attente de quiescence
        force_analysis = False
        
        if not all_finished:
            # Calculer depuis combien de temps on attend
            if not hasattr(periodic_on_task, '_quiescence_start'):
                periodic_on_task._quiescence_start = now
            
            wait_for_quiescence = (now - periodic_on_task._quiescence_start).total_seconds()
            
            if wait_for_quiescence >= max_quiescence_wait and len(w_data_check) >= 2:
                # Timeout atteint, forcer l'analyse avec les données disponibles
                print(f"[ON] ⚠️  Timeout quiescence ({wait_for_quiescence:.1f}s ≥ {max_quiescence_wait}s) - FORÇAGE analyse avec {len(w_data_check)} agents")
                force_analysis = True
                periodic_on_task._quiescence_start = now  # Reset pour prochaine analyse
            else:
                # Des agents W sont encore en train d'agir, attendre
                print(f"[ON] Agents W encore actifs (dernière mise à jour W il y a {time_since_last_w_update:.1f}s < {quiescence_delay}s, attente quiescence {wait_for_quiescence:.1f}s/{max_quiescence_wait}s)...")
                continue
        else:
            # Quiescence atteinte, reset le timer
            if hasattr(periodic_on_task, '_quiescence_start'):
                delattr(periodic_on_task, '_quiescence_start')
        
        # V5: CRITIQUE - Vérification finale : s'assurer que l'image est vraiment récente
        # (au cas où une nouvelle image serait arrivée pendant les vérifications précédentes)
        # CRITICAL: Ignorer cette vérification si on a déjà forcé l'analyse avec timeout
        now_final = datetime.now(timezone.utc)
        if store.last_update_time and not image_timeout_forced:
            final_image_age = (now_final - store.last_update_time).total_seconds()
            if final_image_age > 8.0:  # Si l'image a plus de 8s, elle est probablement obsolète
                print(f"[ON] ⏳ Image finale trop ancienne ({final_image_age:.1f}s), attente mise à jour...")
                continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        # V5: Vérifier taille minimale d'image (éviter images vides ou trop petites)
        min_image_size = 1000  # 1KB minimum (une image 20x20 avec quelques pixels devrait faire ~2-5KB)
        if img_size < min_image_size:
            print(f"[ON] Image trop petite ({img_size} bytes < {min_image_size} bytes), attente image valide...")
            continue
        
        print(f"[ON] Analyse avec Gemini ({store.agents_count} agents, image: {img_size} bytes, age: {image_age:.1f}s)...")
        
        # Étape 1 : O analysis (structures + C_d + relations formelles)
        # CRITICAL: Extraire les positions AVANT de nettoyer les agents obsolètes
        # car on a besoin de toutes les positions pour O, même si certains agents sont inactifs
        agent_positions_list = []
        for agent_id, agent_data in w_data_check.items():
            position = agent_data.get('position', [0, 0])
            if isinstance(position, list) and len(position) == 2:
                agent_positions_list.append(position)
                print(f"[ON] 📍 Agent {agent_id[:8]}: position {position}")
            else:
                print(f"[ON] ⚠️  Agent {agent_id[:8]}: position invalide {position}")
        
        # Trier les positions pour cohérence (par Y puis X)
        agent_positions_list.sort(key=lambda p: (p[1], p[0]))
        print(f"[ON] 📍 Positions extraites pour O: {agent_positions_list}")
        
        if len(agent_positions_list) == 0:
            print(f"[ON] ⚠️  ATTENTION: Aucune position d'agent extraite depuis w_data_check ({len(w_data_check)} agents)")
            # Essayer de récupérer depuis agents_data directement
            for agent_id, agent_data in w_data_check.items():
                print(f"[ON] 🔍 Agent {agent_id[:8]}: données complètes = {json.dumps(agent_data, indent=2)[:200]}")
        
        # Vérifier si toutes les positions attendues sont présentes
        if len(agent_positions_list) < store.agents_count:
            print(f"[ON] ⚠️  ATTENTION: Seulement {len(agent_positions_list)} positions extraites pour {store.agents_count} agents actifs")
        
        # Nettoyer agents W obsolètes APRÈS avoir extrait les positions
        # CRITICAL: Les agents peuvent prendre jusqu'à 7 minutes pour générer (timeout Gemini = 420s)
        # Il faut donc un timeout suffisamment long pour éviter de supprimer des agents en cours de génération
        if store.agents_count > 0:
            # Nettoyer seulement les agents vraiment obsolètes (timeout très long pour laisser le temps aux appels Gemini)
            w_store.clear_stale_agents(timeout=480)  # 480s (8 minutes) pour laisser le temps aux appels Gemini (max 420s) + marge
        else:
            # Pas d'agents actifs, nettoyer normalement (mais toujours avec une marge)
            w_store.clear_stale_agents(timeout=300)  # 300s (5 minutes) même sans agents actifs
        
        o_result = None
        o_tokens = None
        for attempt in range(3):  # Augmenter à 3 tentatives
            o_result, o_tokens = await call_gemini_o(store.latest_image_base64, store.agents_count, store.latest, agent_positions_list)
            if o_result:
                # V5: Valider que toutes les positions dans les structures sont valides
                if agent_positions_list and len(agent_positions_list) > 0:
                    structures = o_result.get('structures', [])
                    invalid_positions = []
                    corrected_structures = []
                    
                    for struct in structures:
                        agent_positions = struct.get('agent_positions', [])
                        valid_positions = []
                        struct_invalid = False
                        
                        for pos in agent_positions:
                            if pos in agent_positions_list:
                                valid_positions.append(pos)
                            else:
                                invalid_positions.append(pos)
                                struct_invalid = True
                        
                        # CRITICAL: Ne garder que les structures avec positions valides
                        if valid_positions:
                            struct['agent_positions'] = valid_positions
                            struct['size_agents'] = len(valid_positions)  # Corriger size_agents
                            corrected_structures.append(struct)
                        # Sinon, rejeter la structure complètement
                    
                    if invalid_positions:
                        print(f"[ON] ⚠️  ATTENTION: O a retourné {len(invalid_positions)} positions invalides: {invalid_positions}")
                        print(f"[ON] 📍 Positions valides: {agent_positions_list}")
                        print(f"[ON] 🔧 Structures corrigées: {len(corrected_structures)}/{len(structures)} conservées")
                    
                    # Remplacer les structures par les versions corrigées
                    o_result['structures'] = corrected_structures
                
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
                    'formal_relations': {'summary': 'Waiting for first image analysis...'},
                    'narrative': {'summary': 'Waiting for first O+N analysis...'},
                    'prediction_errors': {},
                    'simplicity_assessment': {
                        'C_w_current': {'value': 0},
                        'C_d_current': {'value': 0, 'description': 'Waiting for first analysis'},
                        'U_current': {'value': 0, 'interpretation': 'WEAK_EMERGENCE'},
                        'reasoning_n': 'Waiting for first N analysis...'
                    },
                    'agents_count': store.agents_count
                }
                store.set_snapshot(snapshot)
            continue
        
        # V5: Envoyer snapshot O au serveur de métriques
        await metrics_client.send_o_snapshot(o_result)
        
        # Étape 2 : N analysis (narrative + C_w + erreurs prédiction)
        # CRITIQUE: Récupérer les données W JUSTE AVANT d'appeler N (pas au début de la boucle)
        # car d'autres agents peuvent avoir envoyé leurs données entre le début de la boucle et maintenant
        w_data = w_store.get_all_agents_data()
        
        print(f"[N] Données W disponibles: {len(w_data)} agents (agents_count: {store.agents_count})")
        
        # Si on a moins de données W que d'agents actifs, c'est normal pour la première analyse
        # mais pour les analyses suivantes, on devrait avoir des données pour tous les agents actifs
        if len(w_data) < store.agents_count and store.latest is not None:
            print(f"[N] ⚠️  Moins de données W ({len(w_data)}) que d'agents actifs ({store.agents_count}) - certains agents n'ont peut-être pas encore envoyé leurs données")
        
        # Si aucun agent W n'a de données mais qu'il y a des agents actifs,
        # cela signifie qu'ils sont peut-être encore en train de générer leur seed
        # Dans ce cas, on peut quand même faire l'analyse N avec 0 agents (première analyse)
        if len(w_data) == 0 and store.agents_count > 0:
            print(f"[N] ⚠️  Aucune donnée W disponible mais {store.agents_count} agents actifs - agents peut-être encore en cours de démarrage")
        for agent_id, data in w_data.items():
            print(f"  - Agent {agent_id[:8]}: iter={data.get('iteration')}, strategy={data.get('strategy')}")
        
        n_result = None
        n_tokens = None
        for attempt in range(3):  # Augmenter à 3 tentatives
            n_result, n_tokens = await call_gemini_n(o_result, w_data, store.latest)
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
                    # CRITICAL: err_val peut être "N/A" (str) au lieu d'un float si Gemini n'a pas pu évaluer
                    if isinstance(err_val, (int, float)):
                        print(f"[N]    → Agent {agent_id[:8]}: error={err_val:.2f}, explanation={str(err_exp)[:60]}...")
                    else:
                        print(f"[N]    → Agent {agent_id[:8]}: error={err_val}, explanation={str(err_exp)[:60]}...")
                
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
                        'C_w_current': store.latest['simplicity_assessment'].get('C_w_current', {'value': 15})
                    }
                }
            else:
                # Première N : utiliser valeurs par défaut raisonnables
                print("[N] Aucune donnée N précédente, utilisation valeurs par défaut")
                n_result = {
                    'narrative': {'summary': 'First N analysis pending. Agents are initializing their strategies.'},
                    'prediction_errors': {},
                    'simplicity_assessment': {
                        'C_w_current': {'value': 15}
                    }
                }
        
        # Étape 3 : Combiner O + N
        try:
            c_w = n_result['simplicity_assessment']['C_w_current']['value']
            c_d = o_result['simplicity_assessment']['C_d_current']['value']
            u_value = c_w - c_d
            
            # V5: formal_relations ne contient plus que 'summary' (pas de 'connections')
            formal_relations = o_result.get('formal_relations', {})
            if isinstance(formal_relations, dict):
                # S'assurer qu'on ne garde que 'summary', pas 'connections'
                formal_relations = {'summary': formal_relations.get('summary', '')}
            else:
                formal_relations = {'summary': ''}
            
            # V5: Calculer le ranking des agents basé sur l'erreur de prédiction cumulative
            prediction_errors = n_result.get('prediction_errors', {})
            agent_positions = {}
            w_data_check = w_store.get_all_agents_data()
            active_agent_ids = set()  # IDs des agents actifs
            for agent_id, agent_data in w_data_check.items():
                if isinstance(agent_data, dict) and 'position' in agent_data:
                    agent_positions[agent_id] = agent_data['position']
                    active_agent_ids.add(agent_id)
            
            # Nettoyer l'historique des agents inactifs dans le tracker local
            if local_metrics_tracker:
                # Supprimer les agents qui ne sont plus actifs de l'historique
                inactive_agents = []
                for agent_id in list(local_metrics_tracker.agent_error_history.keys()):
                    if agent_id not in active_agent_ids:
                        inactive_agents.append(agent_id)
                        del local_metrics_tracker.agent_error_history[agent_id]
                if inactive_agents:
                    print(f"[ON] 🧹 Nettoyage historique: {len(inactive_agents)} agents inactifs supprimés du ranking")
            
            # Calculer rankings via tracker local (seulement pour agents actifs)
            rankings = {}
            if local_metrics_tracker:
                try:
                    rankings = local_metrics_tracker.calculate_agent_rankings(prediction_errors, agent_positions)
                    print(f"[ON] 📊 Rankings calculés: {len(rankings)} agents classés (agents actifs: {len(active_agent_ids)})")
                    # Log top 3
                    sorted_rankings = sorted(rankings.items(), key=lambda x: x[1]['rank'])[:3]
                    for agent_id, rank_data in sorted_rankings:
                        pos = rank_data.get('position', ['?', '?'])
                        print(f"[ON]    Rank {rank_data['rank']}: Agent [{pos[0]},{pos[1]}] (error={rank_data['avg_error']:.3f}, iterations={rank_data['total_iterations']})")
                except Exception as e:
                    print(f"[ON] ⚠️  Erreur calcul rankings: {e}")
                    import traceback
                    traceback.print_exc()
                    rankings = {}
            else:
                print("[ON] ⚠️  Tracker local non disponible, rankings non calculés")
            
            # V5: Calculer les métriques machine basées sur les tokens
            machine_metrics_data = None
            try:
                machine_metrics_data = calculate_machine_metrics(o_result, n_result, w_data_check, o_tokens, n_tokens)
                if machine_metrics_data:
                    cd_machine = machine_metrics_data['machine_metrics']['C_d_machine']['value']
                    cw_machine = machine_metrics_data['machine_metrics']['C_w_machine']['value']
                    u_machine = machine_metrics_data['machine_metrics']['U_machine']['value']
                    print(f"[MachineMetrics] C_d_machine={cd_machine:.1f} bits ({machine_metrics_data['machine_metrics']['C_d_machine']['tokens']} tokens), "
                          f"C_w_machine={cw_machine:.1f} bits ({machine_metrics_data['machine_metrics']['C_w_machine']['tokens']} tokens), "
                          f"U_machine={u_machine:.1f} bits")
            except Exception as e:
                print(f"[MachineMetrics] ⚠️  Erreur calcul métriques machine: {e}")
                import traceback
                traceback.print_exc()
            
            combined_snapshot = {
                'structures': o_result.get('structures', []),
                'formal_relations': formal_relations,
                'narrative': n_result.get('narrative', {'summary': ''}),
                'prediction_errors': prediction_errors,
                'agent_rankings': rankings,  # V5: Rankings des agents
                'simplicity_assessment': {
                    'C_w_current': n_result['simplicity_assessment']['C_w_current'],
                    'C_d_current': o_result['simplicity_assessment']['C_d_current'],
                    'U_current': {
                        'value': u_value,
                        'interpretation': calculate_u_interpretation(u_value)
                    },
                    'reasoning_n': ''  # V5: N no longer provides reasoning field (done internally)
                },
                'agents_count': store.agents_count
            }
            
            # Ajouter les métriques machine au snapshot si disponibles
            if machine_metrics_data:
                combined_snapshot['machine_metrics'] = machine_metrics_data['machine_metrics']
            
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
            'formal_relations': {'summary': ''},
            'narrative': {'summary': ''},
            'prediction_errors': {},
            'agent_rankings': {},  # V5: Rankings vides si pas de snapshot
            'simplicity_assessment': {
                'C_w_current': {'value': 0},
                'C_d_current': {'value': 0, 'description': 'No analysis yet - waiting for first O+N analysis...'},
                'U_current': {'value': 0, 'interpretation': 'WAITING'},
                'reasoning_n': 'Waiting for first N analysis...'
            },
            '_pending': True
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
        # Inclure aussi le ranking de l'agent dans la réponse personnalisée
        all_rankings = snapshot.get('agent_rankings', {})
        agent_ranking = all_rankings.get(agent_id, {})
        
        personalized = {
            **snapshot,
            'prediction_errors': {
                agent_id: agent_error
            },
            'agent_rankings': {
                agent_id: agent_ranking  # Inclure le ranking de l'agent
            } if agent_ranking else {}
        }
        return personalized
    
    return snapshot


@app.post("/o/image")
async def post_o_image(payload: dict = Body(...)):
    """Recevoir l'image globale d'un agent W
    
    NOTE: Tous les clients W envoient leur image. Le serveur utilise la dernière image reçue.
    Cela peut causer des problèmes si plusieurs clients envoient en même temps.
    Solution: Le serveur accepte toutes les images mais utilise la plus récente (par timestamp).
    """
    img = payload.get('image_base64') or ''
    agents = payload.get('agents_count')
    if img.startswith('data:image/png;base64,'):
        img = img.replace('data:image/png;base64,', '')
    if not img or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in img):
        print(f"[O] ⚠️  Image invalide reçue: longueur={len(img)}, début={img[:50] if img else 'None'}")
        return {'ok': False, 'error': 'invalid_base64'}
    
    # Vérifier si l'image est significativement différente de la précédente (pour éviter spam)
    previous_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
    current_size = len(img)
    size_diff = abs(current_size - previous_size)
    
    # CRITICAL: Mettre à jour last_update_time même si l'image est similaire
    # pour indiquer que les agents sont toujours actifs (évite fausses déconnexions)
    now = datetime.now(timezone.utc)
    store.last_update_time = now
    if store.first_update_time is None:
        store.first_update_time = now
    
    # Accepter l'image si elle est nouvelle ou significativement différente
    if not store.latest_image_base64 or size_diff > 100:  # Au moins 100 chars de différence
        print(f"[O] 📥 Image reçue: {len(img)} chars base64, {agents} agents (diff: {size_diff} chars)")
        store.set_image(img)
        if agents is not None:
            store.set_agents_count(agents)
        return {'ok': True, 'timestamp': datetime.now(timezone.utc).isoformat(), 'agents_count': store.agents_count}
    else:
        # Image très similaire à la précédente - probablement un doublon, ignorer l'image mais mettre à jour timestamp
        # CRITICAL: Mettre à jour last_update_time pour indiquer que les agents sont toujours actifs
        print(f"[O] 📥 Image similaire ignorée (diff: {size_diff} chars < 100) mais timestamp mis à jour (agents actifs)")
        if agents is not None:
            store.set_agents_count(agents)
        return {'ok': True, 'timestamp': datetime.now(timezone.utc).isoformat(), 'agents_count': store.agents_count, 'ignored': True}


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
    uvicorn.run(app, host="0.0.0.0", port=8005, log_level="info", access_log=False)

