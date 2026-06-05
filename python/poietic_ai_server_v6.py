#!/usr/bin/env python3
"""
Poietic AI Server V6 - Quantum Architecture
Port 8006

Q-machine cycle: Ss → O → N → Ws → O → N → Ws → ...
- O-machine: Quantum measurement apparatus (collapses superpositions)
- N-machine: Quantum narrative interpreter (interprets collapsed states)
- W-machines: Quantum evolution operators (slits in multi-slit apparatus)
"""
from fastapi import FastAPI, Body, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, Tuple, List, Dict
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
import httpx
import json
import os
import base64
import re
import math
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

# ==============================================================================
# CONFIGURATION
# ==============================================================================
TOKEN_TO_BITS_FACTOR_O = float(os.getenv('TOKEN_TO_BITS_FACTOR_O', '4.0'))
TOKEN_TO_BITS_FACTOR_N = float(os.getenv('TOKEN_TO_BITS_FACTOR_N', '4.0'))
TOKEN_TO_BITS_FACTOR_W = float(os.getenv('TOKEN_TO_BITS_FACTOR_W', '4.0'))

# === OpenRouter (V6 route ses appels LLM via OpenRouter, pas Gemini en direct) ===
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_BASE_URL = os.getenv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').rstrip('/')
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE_URL}/chat/completions"
LLM_MODEL = os.getenv('O_MODEL', 'google/gemini-3.5-flash')
APP_URL = os.getenv('APP_URL', 'http://localhost:3001')
APP_TITLE = os.getenv('APP_TITLE', 'Poietic Generator V6')


def _gemini_parts_to_openai_content(parts):
    """Convertit des `parts` Gemini ([{text}|{inline_data}]) en `content` OpenAI."""
    content = []
    for p in parts:
        if 'text' in p:
            content.append({'type': 'text', 'text': p['text']})
        elif 'inline_data' in p:
            data_b64 = p['inline_data'].get('data', '')
            mime = p['inline_data'].get('mime_type', 'image/png')
            content.append({'type': 'image_url', 'image_url': {'url': f"data:{mime};base64,{data_b64}"}})
    return content


def _openrouter_headers():
    return {
        'Authorization': f'Bearer {OPENROUTER_API_KEY}',
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': APP_TITLE,
    }


# Suivi de cout (reutilise le CostTracker generique de V4or)
from cost_tracker_v4or import CostTracker
cost_tracker = CostTracker()
BENCH_SESSION_ID = 'poietic-v6'  # libelle de session fige (independant de SESSION_ID partage)
MAX_SESSION_USD = float(os.getenv('MAX_SESSION_USD', '0') or '0')

# ==============================================================================
# QUANTUM STORES
# ==============================================================================

class QuantumWAgentDataStore:
    """Store for quantum W-agent data with quantum metrics"""
    def __init__(self):
        self.agents_data = {}  # {agent_id: {position, strategy, predictions, quantum_measures, ...}}
        self.last_update_time: Optional[datetime] = None
    
    def update_agent_data(self, agent_id: str, data: dict):
        """Update W-agent quantum data"""
        is_heartbeat = data.get('is_heartbeat', False)
        if is_heartbeat:
            if agent_id in self.agents_data:
                self.agents_data[agent_id]['timestamp'] = data.get('timestamp', datetime.now(timezone.utc).isoformat())
                self.last_update_time = datetime.now(timezone.utc)
            else:
                self.agents_data[agent_id] = {
                    'agent_id': agent_id,
                    'position': data.get('position', [0, 0]),
                    'iteration': data.get('iteration', 0),
                    'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat()),
                    'strategy': 'Heartbeat - quantum instance active',
                    'rationale': 'Awaiting coherent beam...',
                    'predictions': {},
                    'previous_predictions': {},
                    'quantum_measures': {},
                    'pixels': []
                }
                self.last_update_time = datetime.now(timezone.utc)
            return
        
        previous_record = self.agents_data.get(agent_id, {})
        current_iteration = data.get('iteration', 0)
        previous_predictions = previous_record.get('predictions', {})
        
        self.agents_data[agent_id] = {
            'agent_id': agent_id,
            'position': data.get('position', [0, 0]),
            'iteration': current_iteration,
            'previous_iteration': previous_record.get('iteration', -1),
            'strategy': data.get('strategy', 'N/A'),
            'rationale': data.get('rationale', ''),
            'predictions': data.get('predictions', {}),
            'previous_predictions': previous_predictions,
            # V6: Quantum measures from seed
            'quantum_measures': data.get('quantum_measures', {}),
            'delta_complexity': data.get('delta_complexity', {}),
            'pixels': data.get('pixels', []),
            'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat())
        }
        self.last_update_time = datetime.now(timezone.utc)
    
    def get_all_agents_data(self):
        return self.agents_data.copy()
    
    def clear_stale_agents(self, timeout=60):
        """Remove agents that haven't sent data recently"""
        if not self.agents_data:
            return
        now = datetime.now(timezone.utc)
        stale_agents = []
        for agent_id, data in self.agents_data.items():
            timestamp_str = data.get('timestamp', '')
            try:
                agent_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                delta = (now - agent_time).total_seconds()
                # Shorter timeout: 60s for all agents
                if delta > timeout:
                    stale_agents.append((agent_id, delta))
            except:
                # Invalid timestamp - mark as stale
                stale_agents.append((agent_id, 999))
        for agent_id, delta in stale_agents:
            del self.agents_data[agent_id]
            print(f"[Q-W] Agent {agent_id[:8]} removed (inactive {delta:.0f}s)")
    
    def all_agents_finished(self, quiescence_delay=5.0):
        if not self.agents_data:
            return True, 0.0
        now = datetime.now(timezone.utc)
        if self.last_update_time:
            time_since_last_update = (now - self.last_update_time).total_seconds()
        else:
            time_since_last_update = float('inf')
        all_finished = time_since_last_update >= quiescence_delay
        return all_finished, time_since_last_update


class QuantumOSnapshotStore:
    """Store for quantum O+N snapshots with coherence observables"""
    def __init__(self):
        self.latest: Optional[dict] = None
        self.version: int = 0
        self.latest_image_base64: Optional[str] = None
        self.agents_count: int = 0
        self.first_analysis_start_time: Optional[datetime] = None
        self.last_update_time: Optional[datetime] = None
        self.first_update_time: Optional[datetime] = None
        self.updates_count: int = 0
        
        # V6: Quantum coherence history
        self.coherence_history = {
            'phi_coherence': [],
            'xi_correlation': [],
            'I_visibility': [],
            'tau_condensation': []
        }

    def set_snapshot(self, snapshot: dict):
        self.version += 1
        snapshot['version'] = self.version
        snapshot['timestamp'] = datetime.now(timezone.utc).isoformat()
        self.latest = snapshot
        
        # Track coherence history
        coherence = snapshot.get('coherence_observables', {})
        if coherence:
            self.coherence_history['phi_coherence'].append(coherence.get('phi_coherence', 0))
            self.coherence_history['xi_correlation'].append(coherence.get('xi_correlation_length', 0))
            self.coherence_history['I_visibility'].append(coherence.get('I_fringe_visibility', 0))
        emergence = snapshot.get('emergence_observables', {})
        if emergence:
            self.coherence_history['tau_condensation'].append(emergence.get('tau_condensation', 0))
        
        if self.first_analysis_start_time is not None:
            self.first_analysis_start_time = None

    def set_image(self, image_base64: str):
        now = datetime.now(timezone.utc)
        self.latest_image_base64 = image_base64
        self.last_update_time = now
        if self.first_update_time is None:
            self.first_update_time = self.last_update_time
        self.updates_count += 1
    
    def set_agents_count(self, n: int):
        try:
            self.agents_count = max(0, int(n))
        except:
            self.agents_count = 0
        self.last_update_time = datetime.now(timezone.utc)
        if self.first_update_time is None:
            self.first_update_time = self.last_update_time
        self.updates_count += 1
    
    def is_stale(self, timeout_seconds: int = 30) -> bool:
        if self.last_update_time is None:
            return True
        delta = (datetime.now(timezone.utc) - self.last_update_time).total_seconds()
        return delta > timeout_seconds


# Global instances
store = QuantumOSnapshotStore()
w_store = QuantumWAgentDataStore()

# ==============================================================================
# METRICS CLIENT (connects to quantum metrics server on port 5006)
# ==============================================================================

class QuantumMetricsClient:
    """WebSocket client for quantum metrics server"""
    def __init__(self, url: str = "ws://localhost:5006/quantum-metrics"):
        self.url = url
        self.websocket = None
        self.connected = False
        self.reconnect_delay = 5
        self._reconnect_task = None
    
    async def connect(self):
        while True:
            try:
                print(f"[Q-Metrics] Connecting to quantum metrics server {self.url}...")
                self.websocket = await websockets.connect(self.url)
                self.connected = True
                print("[Q-Metrics] ✅ Connected to quantum metrics server")
                await self.send({'type': 'get_state'})
                try:
                    while True:
                        try:
                            await asyncio.wait_for(self.websocket.recv(), timeout=1.0)
                        except asyncio.TimeoutError:
                            continue
                except ConnectionClosed:
                    print("[Q-Metrics] Connection closed")
                    self.connected = False
                    self.websocket = None
            except (ConnectionRefusedError, OSError, WebSocketException) as e:
                self.connected = False
                self.websocket = None
                print(f"[Q-Metrics] ⚠️ Connection error: {e}")
                await asyncio.sleep(self.reconnect_delay)
            except Exception as e:
                self.connected = False
                self.websocket = None
                print(f"[Q-Metrics] Unexpected error: {e}")
                await asyncio.sleep(self.reconnect_delay)
    
    async def send(self, message: dict):
        if not self.connected or not self.websocket:
            return False
        try:
            await self.websocket.send(json.dumps(message))
            return True
        except:
            self.connected = False
            self.websocket = None
            return False
    
    async def send_quantum_snapshot(self, snapshot: dict):
        return await self.send({'type': 'quantum_snapshot', 'snapshot': snapshot})
    
    def start_background_connection(self):
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self.connect())

metrics_client = QuantumMetricsClient()

# Local tracker for rankings
try:
    from metrics_server_v6 import QuantumSimplicityTracker
    local_metrics_tracker = QuantumSimplicityTracker()
except ImportError as e:
    print(f"[Q-ON] ⚠️ Could not import QuantumSimplicityTracker: {e}")
    local_metrics_tracker = None

# ==============================================================================
# PROMPT LOADING
# ==============================================================================

O_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'gemini-prompts-v6-observation.json')
N_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'gemini-prompts-v6-narration.json')

o_prompt_template = None
n_prompt_template = None

def load_o_prompt():
    global o_prompt_template
    if o_prompt_template is None:
        try:
            with open(O_PROMPT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                system_lines = data.get('system', [])
                o_prompt_template = '\n'.join(system_lines) if isinstance(system_lines, list) else "You are an O-machine."
        except Exception as e:
            print(f"[Q-O] Error loading prompt: {e}")
            o_prompt_template = "You are a quantum O-machine."
    return o_prompt_template


def load_n_prompt():
    global n_prompt_template
    if n_prompt_template is None:
        try:
            with open(N_PROMPT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                system_lines = data.get('system', [])
                n_prompt_template = '\n'.join(system_lines) if isinstance(system_lines, list) else "You are an N-machine."
        except Exception as e:
            print(f"[Q-N] Error loading prompt: {e}")
            n_prompt_template = "You are a quantum N-machine."
    return n_prompt_template

# ==============================================================================
# QUANTUM METRICS CALCULATIONS
# ==============================================================================

def calculate_tau_condensation(phi_coherence: float, xi_correlation: float, agent_count: int) -> float:
    """
    Calculate Bose-Einstein condensation metric
    τ ≈ φ-coherence × ξ-correlation / √agent_count
    """
    if agent_count <= 0:
        return 0.0
    tau = (phi_coherence * xi_correlation) / math.sqrt(agent_count)
    return min(1.0, max(0.0, tau))


def calculate_emergence_interpretation(u_value: float, tau: float) -> str:
    """Calculate quantum emergence interpretation"""
    if tau >= 0.8:
        return "BOSE_EINSTEIN_CONDENSATE"
    elif tau >= 0.6:
        return "QUANTUM_COHERENT"
    elif tau >= 0.4:
        return "PARTIAL_COHERENCE"
    elif u_value >= 16:
        return "EXCEPTIONAL_EMERGENCE"
    elif u_value >= 11:
        return "STRONG_EMERGENCE"
    elif u_value >= 6:
        return "MODERATE_EMERGENCE"
    elif u_value >= 0:
        return "WEAK_EMERGENCE"
    else:
        return "DECOHERENCE"


def validate_structures_no_overlap(o_result: dict) -> Tuple[bool, List[str]]:
    """Validate that each agent appears in only one structure"""
    if not o_result or 'structures' not in o_result:
        return True, []
    
    structures = o_result.get('structures', [])
    agent_to_structure = {}
    errors = []
    
    for idx, struct in enumerate(structures):
        agent_positions = struct.get('agent_positions', [])
        if not isinstance(agent_positions, list):
            continue
        
        for pos in agent_positions:
            if not isinstance(pos, list) or len(pos) != 2:
                continue
            pos_tuple = tuple(pos)
            if pos_tuple in agent_to_structure:
                other_idx = agent_to_structure[pos_tuple]
                errors.append(f"Agent {list(pos_tuple)} in structure {idx} and {other_idx}")
            else:
                agent_to_structure[pos_tuple] = idx
    
    return len(errors) == 0, errors

# ==============================================================================
# GEMINI API CALLS
# ==============================================================================

def _truncate_text(text: str, max_length: int = 200) -> str:
    if not text or len(text) <= max_length:
        return text
    return text[:max_length] + '...'


async def call_gemini_o_quantum(image_base64: str, agents_count: int, previous_snapshot: Optional[dict] = None, agent_positions: Optional[list] = None) -> Tuple[Optional[dict], Optional[int]]:
    """Call Gemini for quantum O-machine (measurement apparatus)"""
    print(f"[Q-O] 🚀 Quantum measurement with Gemini ({agents_count} slits, image: {len(image_base64)} bytes)")
    api_key = OPENROUTER_API_KEY
    if not api_key:
        print("[Q-O] OPENROUTER_API_KEY not set")
        return (None, None)
    
    try:
        prompt = load_o_prompt()
    except Exception as e:
        print(f"[Q-O] Error loading prompt: {e}")
        return (None, None)
    
    # Inject variables
    prompt = prompt.replace('{{agents_count}}', str(agents_count))
    prompt = prompt.replace('{{strategies_reference}}', 'N/A (strategies are for W-machines, not O)')
    
    # Format agent positions
    if agent_positions and len(agent_positions) > 0:
        sorted_positions = sorted(agent_positions, key=lambda p: (p[1], p[0]))
        num_agents = len(sorted_positions)
        
        if num_agents >= 25:
            positions_str = ', '.join([f'[{pos[0]},{pos[1]}]' for pos in sorted_positions])
            min_x = min(p[0] for p in sorted_positions)
            max_x = max(p[0] for p in sorted_positions)
            min_y = min(p[1] for p in sorted_positions)
            max_y = max(p[1] for p in sorted_positions)
            position_desc = f"{positions_str}\nGRID SPAN: X=[{min_x} to {max_x}], Y=[{min_y} to {max_y}]. [0,0] is CENTER."
        else:
            positions_str = ', '.join([f'[{pos[0]},{pos[1]}]' for pos in sorted_positions])
            position_desc = positions_str
        
        prompt = prompt.replace('{{agent_positions}}', position_desc)
    else:
        prompt = prompt.replace('{{agent_positions}}', 'No slit positions available')
    
    # Prepare request
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
    
    url = OPENROUTER_CHAT_URL
    body = {
        'model': LLM_MODEL,
        'messages': [{'role': 'user', 'content': _gemini_parts_to_openai_content(parts)}],
        'temperature': 0.7,
        'max_tokens': 16000,
        'usage': {'include': True}
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, headers=_openrouter_headers(), json=body)
            if not resp.is_success:
                print(f"[Q-O] HTTP Error {resp.status_code}: {resp.text[:500]}")
                return (None, None)
            
            raw = resp.json()
            text = ''
            try:
                text = (raw['choices'][0]['message']['content'] or '')
            except (KeyError, IndexError, TypeError):
                text = ''
            _u = raw.get('usage', {}) if isinstance(raw, dict) else {}
            data = {'usageMetadata': {
                'candidatesTokenCount': _u.get('completion_tokens', 0),
                'promptTokenCount': _u.get('prompt_tokens', 0),
                'totalTokenCount': _u.get('total_tokens', 0),
                'thoughtsTokenCount': 0,
            }}
            cost_tracker.record(BENCH_SESSION_ID, 'O-machine', LLM_MODEL, _u)

            if not text or len(text.strip()) < 10:
                print(f"[Q-O] ❌ Empty or too short Gemini response")
                return (None, None)
            
            result = parse_json_robust(text, "[Q-O]")
            usage_metadata = data.get('usageMetadata', {})
            output_tokens = usage_metadata.get('candidatesTokenCount', 0)
            
            if result:
                print(f"[Q-O] ✅ Quantum measurement successful (output: {output_tokens} tokens)")
            return (result, output_tokens if result else None)
                
    except Exception as e:
        print(f"[Q-O] Gemini call error: {e}")
        return (None, None)


async def call_gemini_n_quantum(o_snapshot: dict, w_agents_data: dict, previous_combined: Optional[dict] = None) -> Tuple[Optional[dict], Optional[int]]:
    """Call Gemini for quantum N-machine (narrative interpreter)"""
    print(f"[Q-N] 🚀 Quantum interpretation with Gemini ({len(w_agents_data)} W-instances)")
    api_key = OPENROUTER_API_KEY
    if not api_key:
        print("[Q-N] OPENROUTER_API_KEY not set")
        return (None, None)
    
    try:
        prompt = load_n_prompt()
    except Exception as e:
        print(f"[Q-N] Error loading prompt: {e}")
        return (None, None)
    
    # Inject data
    o_json = json.dumps(o_snapshot, ensure_ascii=False, separators=(',', ':'))
    prompt = prompt.replace('{{o_snapshot}}', o_json)
    
    # Optimize W data
    w_optimized = {}
    for agent_id, data in w_agents_data.items():
        w_optimized[agent_id] = {
            'agent_id': agent_id,
            'position': data.get('position', [0, 0]),
            'iteration': data.get('iteration', 0),
            'strategy': data.get('strategy', 'N/A'),
            'rationale': _truncate_text(data.get('rationale', ''), 100),
            'predictions': data.get('predictions', {}),
            'previous_predictions': data.get('previous_predictions', {}),
            'quantum_measures': data.get('quantum_measures', {}),
            'delta_complexity': data.get('delta_complexity', {})
        }
    
    w_json = json.dumps(w_optimized, ensure_ascii=False, separators=(',', ':'))
    prompt = prompt.replace('{{w_agents_data}}', w_json)
    
    if previous_combined:
        prev_optimized = {
            'narrative': previous_combined.get('narrative', {}),
            'simplicity_assessment': previous_combined.get('simplicity_assessment', {}),
            'coherence_observables': previous_combined.get('coherence_observables', {}),
            'emergence_observables': previous_combined.get('emergence_observables', {}),
            'version': previous_combined.get('version', 0)
        }
        prev_json = json.dumps(prev_optimized, ensure_ascii=False, separators=(',', ':'))
        prompt = prompt.replace('{{previous_snapshot}}', prev_json)
    else:
        prompt = prompt.replace('{{previous_snapshot}}', 'null')
    
    url = OPENROUTER_CHAT_URL
    body = {
        'model': LLM_MODEL,
        'messages': [{'role': 'user', 'content': _gemini_parts_to_openai_content([{'text': prompt}])}],
        'temperature': 0.7,
        'max_tokens': 16000,
        'usage': {'include': True}
    }
    
    try:
        timeout_obj = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, headers=_openrouter_headers(), json=body)
            if not resp.is_success:
                print(f"[Q-N] HTTP Error {resp.status_code}: {resp.text[:500]}")
                return (None, None)
            
            raw = resp.json()
            text = ''
            try:
                text = (raw['choices'][0]['message']['content'] or '')
            except (KeyError, IndexError, TypeError):
                text = ''
            _u = raw.get('usage', {}) if isinstance(raw, dict) else {}
            data = {'usageMetadata': {
                'candidatesTokenCount': _u.get('completion_tokens', 0),
                'promptTokenCount': _u.get('prompt_tokens', 0),
                'totalTokenCount': _u.get('total_tokens', 0),
                'thoughtsTokenCount': 0,
            }}
            cost_tracker.record(BENCH_SESSION_ID, 'N-machine', LLM_MODEL, _u)

            if not text or len(text.strip()) < 10:
                print(f"[Q-N] ❌ Empty or too short Gemini response")
                return (None, None)
            
            result = parse_json_robust(text, "[Q-N]")
            usage_metadata = data.get('usageMetadata', {})
            output_tokens = usage_metadata.get('candidatesTokenCount', 0)
            
            if result:
                print(f"[Q-N] ✅ Quantum interpretation successful (output: {output_tokens} tokens)")
            return (result, output_tokens if result else None)
                
    except Exception as e:
        print(f"[Q-N] Gemini call error: {e}")
        return (None, None)


def parse_json_robust(text: str, prefix: str = "") -> Optional[dict]:
    """Robust JSON parser with cleanup"""
    original_text = text
    
    try:
        text = text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1]) if len(lines) > 2 else text
        if '```json' in text:
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*$', '', text).strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            json_slice = text[first_brace:last_brace+1]
            json_slice = re.sub(r',(\s*[}\]])', r'\1', json_slice)
            json_slice = re.sub(r'([{\[])\s*,', r'\1', json_slice)
            json_slice = re.sub(r',\s*,+', ',', json_slice)
            
            try:
                return json.loads(json_slice)
            except json.JSONDecodeError as e:
                print(f"{prefix} Parse failed: {e}")
    
    except Exception as e:
        print(f"{prefix} JSON parsing error: {e}")
    
    return None

# ==============================================================================
# PERIODIC QUANTUM O→N TASK
# ==============================================================================

async def periodic_quantum_on_task():
    """Periodic quantum measurement cycle: O (measurement) → N (interpretation)"""
    print("[Q-ON] 🚀 Quantum O→N periodic task started")
    while True:
        await asyncio.sleep(2)
        
        now = datetime.now(timezone.utc)
        
        # Clean stale agents first
        w_store.clear_stale_agents(timeout=60)
        
        # Check if we have any active agents
        w_data = w_store.get_all_agents_data()
        agents_with_data = len(w_data)
        
        if agents_with_data == 0:
            # No active agents - skip and reset image state
            if store.latest_image_base64:
                store.latest_image_base64 = None
                store.agents_count = 0
                print("[Q-ON] No active agents, waiting...")
            continue
        
        if not store.latest_image_base64:
            continue
        
        # Warmup
        warmup_delay = 30
        warmup_timeout = 60
        
        min_agents_ratio = 0.75
        if store.agents_count == 1:
            min_agents_with_data = 1
        else:
            min_agents_with_data = max(2, int(store.agents_count * min_agents_ratio)) if store.agents_count > 0 else 2
        
        elapsed = (now - store.first_update_time).total_seconds() if store.first_update_time else 0
        
        is_warmup = False
        if store.latest is None:
            if elapsed < warmup_delay and agents_with_data < min_agents_with_data:
                is_warmup = True
            elif elapsed >= warmup_timeout:
                print(f"[Q-ON] ⚠️ Warmup timeout ({elapsed:.1f}s) - forcing with {agents_with_data}/{store.agents_count} slits")
                is_warmup = False
        
        if is_warmup:
            print(f"[Q-ON] Warmup ({elapsed:.1f}s, {agents_with_data}/{store.agents_count} slits)...")
            continue
        
        if store.agents_count == 0:
            continue
        
        # Check quiescence
        quiescence_delay = 6.0 if store.latest is None else 5.0
        all_finished, time_since_last = w_store.all_agents_finished(quiescence_delay=quiescence_delay)
        
        if not all_finished:
            continue
        
        img_size = len(store.latest_image_base64) if store.latest_image_base64 else 0
        if img_size < 1000:
            continue
        
        print(f"[Q-ON] Quantum measurement with Gemini ({store.agents_count} slits, image: {img_size} bytes)...")
        
        # Extract positions
        agent_positions_list = []
        for agent_id, agent_data in w_data.items():
            position = agent_data.get('position', [0, 0])
            if isinstance(position, list) and len(position) == 2:
                agent_positions_list.append(position)
        agent_positions_list.sort(key=lambda p: (p[1], p[0]))
        
        # Clean stale agents
        w_store.clear_stale_agents(timeout=480)
        
        # O-machine measurement
        o_result = None
        o_tokens = None
        for attempt in range(3):
            o_result, o_tokens = await call_gemini_o_quantum(store.latest_image_base64, store.agents_count, store.latest, agent_positions_list)
            if o_result:
                is_valid, errors = validate_structures_no_overlap(o_result)
                if not is_valid:
                    print(f"[Q-O] ⚠️ Validation warning (continuing anyway): {errors[:2]}...")
                    # Don't reject - just warn and continue
                break
            if attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
        
        if not o_result:
            print("[Q-O] Quantum measurement failed")
            continue
        
        # N-machine interpretation
        w_data = w_store.get_all_agents_data()
        
        n_result = None
        n_tokens = None
        for attempt in range(3):
            n_result, n_tokens = await call_gemini_n_quantum(o_result, w_data, store.latest)
            if n_result:
                # Validate prediction errors
                prediction_errors = n_result.get('prediction_errors', {})
                if not isinstance(prediction_errors, dict):
                    prediction_errors = {}
                
                for agent_id in w_data.keys():
                    if agent_id not in prediction_errors:
                        prediction_errors[agent_id] = {
                            'error': 0.0,
                            'explanation': 'No previous prediction (first measurement or no data)'
                        }
                
                n_result['prediction_errors'] = prediction_errors
                break
            if attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
        
        if not n_result:
            print("[Q-N] Quantum interpretation failed, using fallback")
            n_result = {
                'narrative': {'summary': 'Quantum interpretation pending...'},
                'prediction_errors': {},
                'simplicity_assessment': {'C_w_current': {'value': 15}},
                'emergence_observables': {'tau_condensation': 0.0, 'delta_S_entropy': 0.0}
            }
        
        # Combine O + N into quantum snapshot
        try:
            c_w = n_result['simplicity_assessment']['C_w_current']['value']
            c_d = o_result['simplicity_assessment']['C_d_current']['value']
            u_value = c_w - c_d
            
            # Get coherence observables (support both naming conventions)
            coherence = o_result.get('coherence_observables', {})
            phi = coherence.get('phi_coherence') or coherence.get('phi_formal_resonance') or 0.0
            xi = coherence.get('xi_correlation_length') or coherence.get('xi_collective_extent') or 0.0
            I_vis = coherence.get('I_fringe_visibility') or coherence.get('I_pareidolic_contrast') or 0.0
            
            # Get or calculate emergence observables (support both naming conventions)
            emergence = n_result.get('emergence_observables', {})
            tau = emergence.get('tau_condensation') or emergence.get('tau_narrative_convergence')
            if tau is None:
                tau = calculate_tau_condensation(phi, xi, store.agents_count)
            delta_s = emergence.get('delta_S_entropy') or emergence.get('delta_S_complexity_flux') or 0.0
            
            interpretation = calculate_emergence_interpretation(u_value, tau)
            
            # Calculate rankings
            prediction_errors = n_result.get('prediction_errors', {})
            agent_positions = {}
            for agent_id, agent_data in w_data.items():
                if isinstance(agent_data, dict) and 'position' in agent_data:
                    agent_positions[agent_id] = agent_data['position']
            
            rankings = {}
            if local_metrics_tracker:
                try:
                    rankings = local_metrics_tracker.calculate_agent_rankings(prediction_errors, agent_positions)
                except Exception as e:
                    print(f"[Q-ON] ⚠️ Rankings calculation error: {e}")
            
            combined_snapshot = {
                'structures': o_result.get('structures', []),
                'formal_relations': o_result.get('formal_relations', {}),
                'narrative': n_result.get('narrative', {'summary': ''}),
                'prediction_errors': prediction_errors,
                'agent_rankings': rankings,
                'coherence_observables': {
                    'phi_coherence': phi,
                    'xi_correlation_length': xi,
                    'I_fringe_visibility': I_vis,
                    'justification': coherence.get('justification', '')
                },
                'emergence_observables': {
                    'tau_condensation': tau,
                    'delta_S_entropy': delta_s,
                    'justification': emergence.get('justification', '')
                },
                'simplicity_assessment': {
                    'C_w_current': n_result['simplicity_assessment']['C_w_current'],
                    'C_d_current': o_result['simplicity_assessment']['C_d_current'],
                    'U_current': {
                        'value': u_value,
                        'interpretation': interpretation
                    }
                },
                'agents_count': store.agents_count
            }
            
            store.set_snapshot(combined_snapshot)
            print(f"[Q-ON] ✅ Quantum snapshot v{store.version} (φ={phi:.2f}, τ={tau:.2f}, U={u_value})")
            
            await metrics_client.send_quantum_snapshot(combined_snapshot)
        
        except Exception as e:
            print(f"[Q-ON] Error combining O+N: {e}")

# ==============================================================================
# FASTAPI APP
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    metrics_client.start_background_connection()
    asyncio.create_task(periodic_quantum_on_task())
    yield

app = FastAPI(title="Poietic AI Server V6 - Quantum", version="6.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/q/latest")
async def get_latest_quantum(agent_id: Optional[str] = Query(None)):
    """Get quantum O+N snapshot, personalized if agent_id provided"""
    snapshot = store.latest
    if not snapshot:
        return {
            'version': 0,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'structures': [],
            'formal_relations': {},
            'narrative': {'summary': ''},
            'prediction_errors': {},
            'agent_rankings': {},
            'coherence_observables': {
                'phi_coherence': 0.0,
                'xi_correlation_length': 0.0,
                'I_fringe_visibility': 0.0
            },
            'emergence_observables': {
                'tau_condensation': 0.0,
                'delta_S_entropy': 0.0
            },
            'simplicity_assessment': {
                'C_w_current': {'value': 0},
                'C_d_current': {'value': 0, 'description': 'Awaiting first quantum measurement...'},
                'U_current': {'value': 0, 'interpretation': 'WAITING'}
            },
            '_pending': True
        }
    
    if agent_id:
        all_errors = snapshot.get('prediction_errors', {})
        agent_error = all_errors.get(agent_id, {
            'error': 0.0,
            'explanation': 'No previous prediction (first measurement or no data)'
        })
        all_rankings = snapshot.get('agent_rankings', {})
        agent_ranking = all_rankings.get(agent_id, {})
        
        personalized = {
            **snapshot,
            'prediction_errors': {agent_id: agent_error},
            'agent_rankings': {agent_id: agent_ranking} if agent_ranking else {}
        }
        return personalized
    
    return snapshot


@app.get("/q/coherence")
async def get_coherence():
    """Get current coherence observables"""
    snapshot = store.latest
    if not snapshot:
        return {
            'phi_coherence': 0.0,
            'xi_correlation_length': 0.0,
            'I_fringe_visibility': 0.0,
            'tau_condensation': 0.0
        }
    return {
        **snapshot.get('coherence_observables', {}),
        'tau_condensation': snapshot.get('emergence_observables', {}).get('tau_condensation', 0.0)
    }


@app.get("/q/coherence-history")
async def get_coherence_history():
    """Get coherence history for graphing"""
    return store.coherence_history


@app.post("/q/image")
async def post_quantum_image(payload: dict = Body(...)):
    """Receive global canvas image from W-instance"""
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


@app.get("/q/image")
async def get_quantum_image():
    """Get latest canvas image"""
    return {'image_base64': store.latest_image_base64, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.post("/q/agents")
async def post_quantum_agents(payload: dict = Body(...)):
    """Update active agent count"""
    n = payload.get('count')
    if n is None:
        return {'ok': False, 'error': 'missing_count'}
    store.set_agents_count(n)
    return {'ok': True, 'agents_count': store.agents_count, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.post("/q/w-data")
async def receive_quantum_w_data(payload: dict = Body(...)):
    """Receive W-instance quantum data (strategy, predictions, quantum_measures)"""
    agent_id = payload.get('agent_id')
    if not agent_id:
        return {'ok': False, 'error': 'missing_agent_id'}
    
    w_store.update_agent_data(agent_id, payload)
    return {'ok': True, 'agent_id': agent_id, 'timestamp': datetime.now(timezone.utc).isoformat()}


@app.post("/api/llm/openrouter")
async def proxy_openrouter_v6(request: Request):
    """Proxy OpenRouter pour les W-instances quantiques (clé serveur). Format OpenAI."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "JSON invalide"})
    messages = body.get("messages")
    if not messages:
        return JSONResponse(status_code=400, content={"error": "messages manquants"})
    if not OPENROUTER_API_KEY:
        return JSONResponse(status_code=500, content={"error": "OPENROUTER_API_KEY non définie"})
    payload = {
        "model": body.get("model") or LLM_MODEL,
        "messages": messages,
        "max_tokens": int(body.get("max_tokens") or 16000),
        "temperature": float(body.get("temperature", 1.0)),
        "usage": {"include": True},
    }
    if body.get("reasoning") is not None:
        payload["reasoning"] = body["reasoning"]
    model = payload["model"]
    session_id = body.get("session_id") or BENCH_SESSION_ID
    agent_id = body.get("agent_id") or "W-agent"
    if cost_tracker.is_over_budget(session_id, MAX_SESSION_USD):
        return JSONResponse(status_code=402, content={"error": "budget_exceeded", "session_cost_usd": cost_tracker.session_cost(session_id)})
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(420.0, connect=30.0)) as client:
            resp = await client.post(OPENROUTER_CHAT_URL, headers=_openrouter_headers(), json=payload)
        data = resp.json()
        if isinstance(data, dict) and data.get("usage"):
            cost_tracker.record(session_id, agent_id, model, data["usage"])
        return JSONResponse(status_code=resp.status_code, content=data)
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"Erreur reseau OpenRouter: {e}"})


@app.get("/api/usage")
async def get_usage_v6(session_id: Optional[str] = Query(None)):
    """Agregats de cout (session/agent/modele) : O, N et W-instances quantiques."""
    return cost_tracker.snapshot(session_id)


@app.get("/api/usage/openrouter")
async def get_openrouter_usage_v6():
    """Consommation officielle du compte OpenRouter (cumulee)."""
    if not OPENROUTER_API_KEY:
        return JSONResponse(status_code=400, content={"error": "OPENROUTER_API_KEY non définie"})
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.get(f"{OPENROUTER_BASE_URL}/credits", headers=_openrouter_headers())
        payload = resp.json()
        d = payload.get("data", payload) if isinstance(payload, dict) else {}
        tc, tu = d.get("total_credits"), d.get("total_usage")
        rem = (round(float(tc) - float(tu), 6) if (tc is not None and tu is not None) else None)
        return {"total_credits": tc, "total_usage": tu, "remaining": rem}
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})


@app.get("/q/w-data")
async def get_quantum_w_data():
    """Get all W-instance data (debug)"""
    return {'agents': w_store.get_all_agents_data(), 'timestamp': datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006, log_level="info", access_log=False)

