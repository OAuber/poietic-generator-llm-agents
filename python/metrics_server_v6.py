#!/usr/bin/env python3
"""
Quantum Metrics Server V6
Port 5006

Tracks quantum coherence metrics:
- φ-coherence (phase alignment)
- ξ-correlation (spatial correlation length)
- τ-condensation (Bose-Einstein metric)
- I-visibility (fringe visibility)
- Prediction errors and rankings
"""
import asyncio
import json
import copy
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from collections import defaultdict
import websockets
from websockets.server import serve

# ==============================================================================
# QUANTUM SIMPLICITY TRACKER
# ==============================================================================

class QuantumSimplicityTracker:
    """Tracks quantum metrics for the Q-machine system"""
    
    def __init__(self):
        # History of metrics
        self.history = {
            'timestamps': [],
            'versions': [],
            'C_w': [],
            'C_d': [],
            'U': [],
            'phi_coherence': [],
            'xi_correlation': [],
            'I_visibility': [],
            'tau_condensation': [],
            'delta_S_entropy': []
        }
        
        # Agent-level tracking
        self.agent_error_history: Dict[str, List[float]] = defaultdict(list)
        self.agent_quantum_measures: Dict[str, dict] = {}  # {agent_id: {psi, eta, lambda}}
        
        # Session info
        self.session_start = datetime.now(timezone.utc)
        self.snapshot_count = 0
    
    def add_quantum_snapshot(self, snapshot: dict):
        """Add a quantum snapshot to history"""
        self.snapshot_count += 1
        timestamp = datetime.now(timezone.utc).isoformat()
        
        self.history['timestamps'].append(timestamp)
        self.history['versions'].append(snapshot.get('version', self.snapshot_count))
        
        # Simplicity metrics
        sa = snapshot.get('simplicity_assessment', {})
        self.history['C_w'].append(sa.get('C_w_current', {}).get('value', 0))
        self.history['C_d'].append(sa.get('C_d_current', {}).get('value', 0))
        self.history['U'].append(sa.get('U_current', {}).get('value', 0))
        
        # Coherence observables
        co = snapshot.get('coherence_observables', {})
        self.history['phi_coherence'].append(co.get('phi_coherence', 0))
        self.history['xi_correlation'].append(co.get('xi_correlation_length', 0))
        self.history['I_visibility'].append(co.get('I_fringe_visibility', 0))
        
        # Emergence observables
        eo = snapshot.get('emergence_observables', {})
        self.history['tau_condensation'].append(eo.get('tau_condensation', 0))
        self.history['delta_S_entropy'].append(eo.get('delta_S_entropy', 0))
        
        # Update agent errors
        prediction_errors = snapshot.get('prediction_errors', {})
        for agent_id, err_data in prediction_errors.items():
            if isinstance(err_data, dict) and 'error' in err_data:
                error = err_data['error']
                if isinstance(error, (int, float)):
                    self.agent_error_history[agent_id].append(error)
        
        # Limit history length
        max_history = 500
        for key in self.history:
            if len(self.history[key]) > max_history:
                self.history[key] = self.history[key][-max_history:]
        
        for agent_id in list(self.agent_error_history.keys()):
            if len(self.agent_error_history[agent_id]) > max_history:
                self.agent_error_history[agent_id] = self.agent_error_history[agent_id][-max_history:]
    
    def calculate_agent_rankings(self, prediction_errors: dict, agent_positions: dict) -> dict:
        """Calculate agent rankings based on cumulative average error"""
        # Update error history
        for agent_id, err_data in prediction_errors.items():
            if isinstance(err_data, dict) and 'error' in err_data:
                error = err_data['error']
                if isinstance(error, (int, float)):
                    self.agent_error_history[agent_id].append(error)
        
        # Calculate average errors
        avg_errors = {}
        for agent_id in agent_positions.keys():
            errors = self.agent_error_history.get(agent_id, [])
            if errors:
                avg_errors[agent_id] = sum(errors) / len(errors)
            else:
                avg_errors[agent_id] = 1.0  # Default high error
        
        # Sort by error (lower = better rank)
        sorted_agents = sorted(avg_errors.items(), key=lambda x: x[1])
        
        # Build rankings
        rankings = {}
        for rank, (agent_id, avg_error) in enumerate(sorted_agents, 1):
            rankings[agent_id] = {
                'rank': rank,
                'avg_error': avg_error,
                'total_iterations': len(self.agent_error_history.get(agent_id, [])),
                'position': agent_positions.get(agent_id, [0, 0])
            }
        
        return rankings
    
    def get_state(self) -> dict:
        """Get current tracker state for clients"""
        return {
            'session_start': self.session_start.isoformat(),
            'snapshot_count': self.snapshot_count,
            'history': self.history,
            'agent_count': len(self.agent_error_history),
            'latest_metrics': {
                'C_w': self.history['C_w'][-1] if self.history['C_w'] else 0,
                'C_d': self.history['C_d'][-1] if self.history['C_d'] else 0,
                'U': self.history['U'][-1] if self.history['U'] else 0,
                'phi_coherence': self.history['phi_coherence'][-1] if self.history['phi_coherence'] else 0,
                'tau_condensation': self.history['tau_condensation'][-1] if self.history['tau_condensation'] else 0
            }
        }
    
    def reset(self):
        """Reset all tracking data"""
        for key in self.history:
            self.history[key] = []
        self.agent_error_history.clear()
        self.agent_quantum_measures.clear()
        self.session_start = datetime.now(timezone.utc)
        self.snapshot_count = 0


# Global tracker instance
tracker = QuantumSimplicityTracker()

# ==============================================================================
# SESSION RECORDER (for agent events)
# ==============================================================================

class SessionRecorder:
    """Records agent events for metrics dashboard"""
    
    def __init__(self):
        self.events: List[dict] = []
        self.last_agent_data: Dict[str, dict] = {}
    
    def record_agent_action(self, agent_id: str, position: List[int],
                            delta_C_w: float = 0, delta_C_d: float = 0,
                            U_expected: float = 0, prediction_error: float = 0,
                            strategy: str = "", strategy_id: str = "",
                            strategy_ids: List[str] = None,
                            source_agents: List[List[int]] = None,
                            rationale: str = "", pixels: List[str] = None,
                            agent_type: str = "ai",
                            tokens: dict = None, signalling_tokens: dict = None,
                            rank: int = 999, iteration: int = 0) -> dict:
        """Record an agent action and return formatted data"""
        agent_data = {
            "id": agent_id,
            "position": position,
            "type": agent_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "rank": rank,
            "iteration": iteration
        }
        
        if agent_type == "ai":
            agent_data.update({
                "delta_C_w": delta_C_w,
                "delta_C_d": delta_C_d,
                "U_expected": U_expected,
                "prediction_error": prediction_error,
                "strategy": strategy,
                "strategy_id": strategy_id,
                "strategy_ids": strategy_ids if strategy_ids else ([strategy_id] if strategy_id else []),
                "source_agents": source_agents or [],
                "rationale": rationale[:500] if rationale else ""
            })
            
            if tokens:
                agent_data["tokens"] = tokens
            if signalling_tokens:
                agent_data["signalling_tokens"] = signalling_tokens
        
        if pixels:
            agent_data["pixels"] = pixels
        
        self.last_agent_data[agent_id] = copy.deepcopy(agent_data)
        
        self.events.append({
            "type": "agent",
            "timestamp": agent_data["timestamp"],
            "data": copy.deepcopy(agent_data)
        })
        
        # Limit events history
        if len(self.events) > 1000:
            self.events = self.events[-1000:]
        
        return agent_data

# Global session recorder
session_recorder = SessionRecorder()

# ==============================================================================
# WEBSOCKET SERVER
# ==============================================================================

connected_clients: Set[websockets.WebSocketServerProtocol] = set()

async def broadcast(message: dict):
    """Broadcast message to all connected clients"""
    if not connected_clients:
        return
    
    msg_json = json.dumps(message)
    disconnected = set()
    
    for client in connected_clients:
        try:
            await client.send(msg_json)
        except:
            disconnected.add(client)
    
    for client in disconnected:
        connected_clients.discard(client)


async def handle_message(websocket: websockets.WebSocketServerProtocol, message: str):
    """Handle incoming WebSocket message"""
    try:
        data = json.loads(message)
        msg_type = data.get('type')
        
        if msg_type == 'quantum_snapshot':
            snapshot = data.get('snapshot', {})
            tracker.add_quantum_snapshot(snapshot)
            
            # Extract data for V5-compatible events
            version = snapshot.get('version', tracker.snapshot_count)
            prediction_errors = snapshot.get('prediction_errors', {})
            agent_rankings = snapshot.get('agent_rankings', {})
            sa = snapshot.get('simplicity_assessment', {})
            
            # Calculate global metrics
            C_w = sa.get('C_w_current', {}).get('value', 0)
            C_d = sa.get('C_d_current', {}).get('value', 0)
            U = sa.get('U_current', {}).get('value', 0)
            
            # Calculate mean/std errors
            error_values = [
                e.get('error', 0) 
                for e in prediction_errors.values() 
                if isinstance(e, dict) and isinstance(e.get('error', 0), (int, float))
            ]
            mean_error = sum(error_values) / len(error_values) if error_values else 0.0
            std_error = 0.0
            if len(error_values) > 1:
                variance = sum([(e - mean_error) ** 2 for e in error_values]) / len(error_values)
                std_error = variance ** 0.5
            
            # Build agent data from rankings
            agents_data = []
            for agent_id, ranking_info in agent_rankings.items():
                agents_data.append({
                    'id': agent_id,
                    'position': ranking_info.get('position', [0, 0]),
                    'type': 'ai',
                    'rank': ranking_info.get('rank', 999),
                    'avg_error': ranking_info.get('avg_error', 0),
                    'timestamp': datetime.now(timezone.utc).isoformat()
                })
            
            # Broadcast quantum snapshot
            await broadcast({
                'type': 'quantum_snapshot',
                'snapshot': snapshot,
                'state': tracker.get_state()
            })
            
            # Also broadcast V5-compatible iteration event for popups compatibility
            await broadcast({
                'type': 'session_iteration_event',
                'data': {
                    'version': version,
                    'global': {
                        'C_w': C_w,
                        'C_d': C_d,
                        'U': U,
                        'mean_error': mean_error,
                        'std_error': std_error
                    },
                    'rankings': agent_rankings,
                    'agents': agents_data,
                    'agents_count': len(agents_data),
                    'ai_agents_count': len(agents_data),
                    'human_agents_count': 0,
                    'o_snapshot': {
                        'structures': snapshot.get('structures', []),
                        'formal_relations': snapshot.get('formal_relations', {})
                    },
                    'n_snapshot': {
                        'narrative': snapshot.get('narrative', {})
                    },
                    'timestamp': snapshot.get('timestamp', datetime.now(timezone.utc).isoformat())
                }
            })
        
        elif msg_type == 'get_state':
            await websocket.send(json.dumps({
                'type': 'state',
                'state': tracker.get_state()
            }))
        
        elif msg_type == 'reset':
            tracker.reset()
            await broadcast({
                'type': 'reset',
                'state': tracker.get_state()
            })
        
        elif msg_type == 'get_history':
            await websocket.send(json.dumps({
                'type': 'history',
                'history': tracker.history
            }))
        
        elif msg_type == 'get_session_export':
            # Build complete export from server-side data
            export_data = {
                'version': '6.0',
                'session_id': tracker.session_start.isoformat(),
                'metadata': {
                    'export_time': datetime.now(timezone.utc).isoformat(),
                    'total_iterations': tracker.snapshot_count,
                    'agents_count': len(tracker.agent_error_history),
                    'quantum_snapshots_count': tracker.snapshot_count,
                    'session_start': tracker.session_start.isoformat()
                },
                # Server-side tracker data
                'tracker_state': tracker.get_state(),
                'tracker_history': tracker.history,
                'agent_error_history': dict(tracker.agent_error_history),
                'agent_quantum_measures': tracker.agent_quantum_measures,
                # Session recorder data
                'events': session_recorder.events,
                'last_agent_data': session_recorder.last_agent_data
            }
            
            await websocket.send(json.dumps({
                'type': 'session_export',
                'data': export_data
            }))
        
        elif msg_type == 'agent_update':
            # Handle agent update from W-machines (like V5)
            user_id = data.get('user_id')
            position = data.get('position', [0, 0])
            delta_C_w = data.get('delta_C_w', 0)
            delta_C_d = data.get('delta_C_d', 0)
            U_after_expected = data.get('U_after_expected', 0)
            prediction_error = data.get('prediction_error', 0)
            strategy = data.get('strategy', '')
            agent_type = data.get('agent_type', 'ai')
            pixels = data.get('pixels', [])
            strategy_id = data.get('strategy_id', '')
            strategy_ids = data.get('strategy_ids', [])
            source_agents = data.get('source_agents', [])
            rationale = data.get('rationale', '')
            iteration = data.get('iteration', 0)
            tokens = data.get('tokens')
            signalling_tokens = data.get('signalling_tokens')
            
            # Update agent error history
            if prediction_error is not None and isinstance(prediction_error, (int, float)):
                if iteration <= 1 and user_id in tracker.agent_error_history:
                    # Reset if agent restarts
                    tracker.agent_error_history[user_id] = []
                tracker.agent_error_history[user_id].append(prediction_error)
            
            # Calculate current rank
            agent_stats = {}
            for aid, error_history in tracker.agent_error_history.items():
                if len(error_history) == 0:
                    continue
                errors = [e for e in error_history if isinstance(e, (int, float))]
                if len(errors) == 0:
                    continue
                avg_error = sum(errors) / len(errors)
                agent_stats[aid] = avg_error
            
            sorted_agents = sorted(agent_stats.items(), key=lambda x: x[1])
            current_rank = 999
            for rank, (aid, _) in enumerate(sorted_agents, start=1):
                if aid == user_id:
                    current_rank = rank
                    break
            
            # Record agent action
            agent_data = session_recorder.record_agent_action(
                agent_id=user_id,
                position=position,
                delta_C_w=delta_C_w,
                delta_C_d=delta_C_d,
                U_expected=U_after_expected,
                prediction_error=prediction_error or 0,
                strategy=strategy,
                strategy_id=strategy_id,
                strategy_ids=strategy_ids,
                source_agents=source_agents,
                rationale=rationale,
                pixels=pixels,
                agent_type=agent_type,
                tokens=tokens,
                signalling_tokens=signalling_tokens,
                rank=current_rank,
                iteration=iteration
            )
            
            # Broadcast agent event to all clients
            await broadcast({
                'type': 'session_agent_event',
                'data': agent_data
            })
        
    except json.JSONDecodeError:
        print(f"[Q-Metrics] Invalid JSON: {message[:100]}")
    except Exception as e:
        print(f"[Q-Metrics] Error handling message: {e}")


async def handler(websocket: websockets.WebSocketServerProtocol, path: str = None):
    """Handle WebSocket connection"""
    connected_clients.add(websocket)
    client_id = id(websocket)
    print(f"[Q-Metrics] Client {client_id} connected ({len(connected_clients)} total)")
    
    try:
        # Send current state on connect
        await websocket.send(json.dumps({
            'type': 'state',
            'state': tracker.get_state()
        }))
        
        async for message in websocket:
            await handle_message(websocket, message)
    
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[Q-Metrics] Client {client_id} disconnected ({len(connected_clients)} remaining)")


async def main():
    """Start WebSocket server"""
    port = 5006
    print(f"[Q-Metrics] 🚀 Quantum Metrics Server V6 starting on port {port}")
    
    async with serve(handler, "0.0.0.0", port):
        print(f"[Q-Metrics] ✅ Server ready at ws://localhost:{port}/quantum-metrics")
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    asyncio.run(main())

