/**
 * Poietic AI Metrics Dashboard - Main Controller
 * Gère la connexion WebSocket, les données de session et la coordination des popups
 */

class AIMetricsDashboard {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.sessionData = {
            events: [],
            globalMetrics: [],
            agentMetrics: {},
            rankings: {},
            canvasSnapshots: [],
            oSnapshots: [],
            nSnapshots: [],
            // V6 Quantum data
            quantumSnapshots: [],
            quantumHistory: {
                versions: [],  // V6: Array of version numbers for X-axis
                phi_coherence: [],
                xi_correlation_length: [],
                I_fringe_visibility: [],
                tau_condensation: [],
                delta_S_entropy: [],
                C_w: [],
                C_d: [],
                U: []
            },
            latestQuantumSnapshot: null,
            agentRankings: {}
        };
        this.popupManager = null;
        this.replayEngine = null;
        this.isReplayMode = false;
        
        this.init();
    }
    
    init() {
        // Initialiser le PopupManager V6
        this.popupManager = new PopupManager(
            document.getElementById('workspace'),
            (type) => this.onPopupDataRequest(type)
        );
        
        // Initialiser le ReplayEngine
        this.replayEngine = new ReplayEngine((event) => this.onReplayEvent(event));
        
        // Bind UI events
        this.bindEvents();
        
        // Auto-connect au chargement
        setTimeout(() => this.connect(), 500);
    }
    
    bindEvents() {
        // Connect button
        document.getElementById('btn-connect').addEventListener('click', () => {
            if (this.isConnected) {
                this.disconnect();
            } else {
                this.connect();
            }
        });
        
        // Export button
        document.getElementById('btn-export').addEventListener('click', () => this.exportSession());
        
        // Import button
        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        
        document.getElementById('import-file').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importSession(e.target.files[0]);
            }
        });
        
        // Clear button
        document.getElementById('btn-clear').addEventListener('click', () => this.clearSession());
        
        // Add popup menu
        const addBtn = document.getElementById('btn-add-popup');
        const menu = document.getElementById('add-popup-menu');
        
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
        });
        
        document.addEventListener('click', () => {
            menu.classList.remove('show');
        });
        
        menu.querySelectorAll('.add-popup-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = item.dataset.type;
                this.addPopup(type);
                menu.classList.remove('show');
            });
        });
        
        // Strategy parameters button
        document.getElementById('btn-apply-strategy-params').addEventListener('click', () => {
            this.applyStrategyParams();
        });
    }
    
    // =========================================================================
    // WebSocket Connection
    // =========================================================================
    
    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return;
        }
        
        const wsUrl = `ws://${window.location.hostname}:5006/quantum-metrics`;
        console.log('[AIMetrics V6] Connecting to', wsUrl);
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('[AIMetrics V6] ✅ Connected to quantum metrics server');
                this.isConnected = true;
                this.updateConnectionStatus(true);
                
                // Request current state
                this.socket.send(JSON.stringify({ type: 'get_state' }));
                console.log('[AIMetrics V6] Requested initial state');
                
                // Charger les paramètres depuis localStorage au démarrage
                const uThreshold = localStorage.getItem('strategy_u_threshold') || '70';
                const rankDivisor = localStorage.getItem('strategy_rank_divisor') || '2';
                const errorThreshold = localStorage.getItem('strategy_error_threshold') || '0.5';
                document.getElementById('strategy-u-threshold').value = uThreshold;
                document.getElementById('strategy-rank-divisor').value = rankDivisor;
                document.getElementById('strategy-error-threshold').value = errorThreshold;
                
                this.showToast('Connected to metrics server', 'success');
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('[AIMetrics] Parse error:', e);
                }
            };
            
            this.socket.onclose = () => {
                console.log('[AIMetrics V6] Disconnected');
                this.isConnected = false;
                this.updateConnectionStatus(false);
                // Auto-reconnect after 3s
                setTimeout(() => this.connect(), 3000);
            };
            
            this.socket.onerror = (error) => {
                console.error('[AIMetrics V6] WebSocket error:', error);
                this.showToast('Connection error', 'error');
            };
            
        } catch (e) {
            console.error('[AIMetrics V6] Connection failed:', e);
            this.showToast('Failed to connect', 'error');
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus(false);
    }
    
    updateConnectionStatus(connected) {
        const status = document.getElementById('connection-status');
        const btn = document.getElementById('btn-connect');
        
        if (connected) {
            status.className = 'connection-status connected';
            status.querySelector('.text').textContent = 'Connected';
            btn.textContent = '🔌 Disconnect';
        } else {
            status.className = 'connection-status disconnected';
            status.querySelector('.text').textContent = 'Disconnected';
            btn.textContent = '🔌 Connect';
        }
    }
    
    // =========================================================================
    // Message Handling
    // =========================================================================
    
    handleMessage(msg) {
        console.log('[AIMetrics V6] Received message:', msg.type, msg);
        switch (msg.type) {
            case 'state':
                // State message contains tracker state, not a quantum snapshot
                // Update session info from state
                if (msg.state) {
                    const state = msg.state;
                    if (state.snapshot_count !== undefined) {
                        document.getElementById('iteration-count').textContent = state.snapshot_count;
                    }
                    if (state.agent_count !== undefined) {
                        document.getElementById('agents-count').textContent = state.agent_count;
                        document.getElementById('ai-count').textContent = state.agent_count;
                        document.getElementById('human-count').textContent = 0;
                    }
                    // Update session ID if available
                    if (state.session_start) {
                        const sessionId = state.session_start.substring(0, 19).replace('T', ' ');
                        document.getElementById('session-id').textContent = sessionId;
                    }
                }
                break;
                
            case 'quantum_snapshot':
                // Quantum snapshot from O+N server
                const snapshot = msg.snapshot || msg.state || msg;
                this.handleQuantumSnapshot(snapshot);
                break;
                
            case 'strategy_params_update':
                this.handleStrategyParamsUpdate(msg.params);
                break;
                
            case 'session_summary':
                this.handleSessionSummary(msg.data);
                break;
                
            case 'session_agent_event':
                this.handleAgentEvent(msg.data);
                break;
                
            case 'session_iteration_event':
                this.handleIterationEvent(msg.data);
                break;
                
            case 'o_snapshot_update':
                this.handleOSnapshot(msg.data);
                break;
                
            case 'n_snapshot_update':
                this.handleNSnapshot(msg.data);
                break;
                
            case 'canvas_snapshot_update':
                this.handleCanvasSnapshot(msg.data);
                break;
                
            case 'session_export':
                this.handleSessionExport(msg.data);
                break;
                
            default:
                console.log('[AIMetrics V6] Unknown message type:', msg.type);
        }
    }
    
    handleQuantumSnapshot(snapshot) {
        if (!snapshot) {
            console.warn('[AIMetrics V6] handleQuantumSnapshot: No snapshot provided');
            return;
        }
        
        console.log('[AIMetrics V6] handleQuantumSnapshot: v' + (snapshot.version || 'N/A'), {
            hasCoherence: !!snapshot.coherence_observables,
            hasEmergence: !!snapshot.emergence_observables,
            hasSimplicity: !!snapshot.simplicity_assessment
        });
        
        // Store latest snapshot
        this.sessionData.latestQuantumSnapshot = snapshot;
        
        // Extract metrics
        const co = snapshot.coherence_observables || {};
        const eo = snapshot.emergence_observables || {};
        const sa = snapshot.simplicity_assessment || {};
        
        const phi = co.phi_coherence || co.phi_formal_resonance || 0;
        const xi = co.xi_correlation_length || co.xi_collective_extent || 0;
        const I = co.I_fringe_visibility || co.I_pareidolic_contrast || 0;
        const tau = eo.tau_condensation || eo.tau_narrative_convergence || 0;
        const dS = eo.delta_S_entropy || eo.delta_S_complexity_flux || 0;
        const Cw = sa.C_w_current?.value || 0;
        const Cd = sa.C_d_current?.value || 0;
        const U = sa.U_current?.value || (Cw - Cd);
        
        console.log('[AIMetrics V6] Extracted metrics:', { phi, xi, I, tau, dS, Cw, Cd, U });
        
        // Update history
        const history = this.sessionData.quantumHistory;
        const version = snapshot.version || history.versions.length;
        history.versions.push(version);
        history.phi_coherence.push(phi);
        history.xi_correlation_length.push(xi);
        history.I_fringe_visibility.push(I);
        history.tau_condensation.push(tau);
        history.delta_S_entropy.push(dS);
        history.C_w.push(Cw);
        history.C_d.push(Cd);
        history.U.push(U);
        
        // Limit history
        Object.keys(history).forEach(key => {
            if (history[key].length > 100) {
                history[key] = history[key].slice(-100);
            }
        });
        
        // Store snapshot
        this.sessionData.quantumSnapshots.push({
            version: snapshot.version || this.sessionData.quantumSnapshots.length,
            timestamp: new Date().toISOString(),
            snapshot: snapshot
        });
        
        // Limit snapshots
        if (this.sessionData.quantumSnapshots.length > 100) {
            this.sessionData.quantumSnapshots = this.sessionData.quantumSnapshots.slice(-100);
        }
        
        // Update agent rankings
        if (snapshot.agent_rankings) {
            this.sessionData.agentRankings = snapshot.agent_rankings;
        }
        
        // Update iteration count if available
        if (snapshot.version !== undefined) {
            document.getElementById('iteration-count').textContent = snapshot.version;
        }
        
        // Update agent counts if available
        const rankings = snapshot.agent_rankings || {};
        const agentCount = Object.keys(rankings).length;
        if (agentCount > 0) {
            document.getElementById('agents-count').textContent = agentCount;
            // Assume all are AI for now (V6 is quantum-focused)
            document.getElementById('ai-count').textContent = agentCount;
            document.getElementById('human-count').textContent = 0;
        }
        
        // Notify popups
        this.popupManager.updateAll(this.sessionData);
    }
    
    handleStateUpdate(data) {
        if (!data) return;
        
        // Stocker les données des agents
        if (data.agents) {
            for (const [id, agent] of Object.entries(data.agents)) {
                this.sessionData.agentMetrics[id] = agent;
            }
        }
        
        // Mettre à jour les compteurs d'agents
        const aiCount = Object.values(this.sessionData.agentMetrics)
            .filter(a => a.type === 'ai').length;
        const humanCount = Object.values(this.sessionData.agentMetrics)
            .filter(a => a.type === 'human').length;
        
        document.getElementById('ai-count').textContent = aiCount;
        document.getElementById('human-count').textContent = humanCount;
        document.getElementById('agents-count').textContent = aiCount + humanCount;
        
        // Mettre à jour le compteur d'itérations si disponible
        if (data.averages && data.averages.agents_count !== undefined) {
            // Le compteur d'agents est déjà mis à jour ci-dessus
        }
        
        // Notifier les popups
        this.popupManager.updateAll(this.sessionData);
    }
    
    handleSessionSummary(data) {
        if (!data) return;
        
        document.getElementById('session-id').textContent = data.session_id?.substring(0, 19) || '-';
        document.getElementById('iteration-count').textContent = data.current_iteration || 0;
        document.getElementById('agents-count').textContent = data.agents_count || 0;
        document.getElementById('ai-count').textContent = data.ai_agents || 0;
        document.getElementById('human-count').textContent = data.human_agents || 0;
    }
    
    handleAgentEvent(data) {
        if (!data) return;
        
        // Stocker l'événement
        this.sessionData.events.push({
            type: 'agent',
            data: data,
            timestamp: new Date().toISOString()
        });
        
        // Mettre à jour les métriques de l'agent
        this.sessionData.agentMetrics[data.id] = data;
        
        // Mettre à jour les compteurs
        const aiCount = Object.values(this.sessionData.agentMetrics)
            .filter(a => a.type === 'ai').length;
        const humanCount = Object.values(this.sessionData.agentMetrics)
            .filter(a => a.type === 'human').length;
        
        document.getElementById('ai-count').textContent = aiCount;
        document.getElementById('human-count').textContent = humanCount;
        document.getElementById('agents-count').textContent = aiCount + humanCount;
        
        // Notifier les popups
        this.popupManager.updateAll(this.sessionData);
    }
    
    handleIterationEvent(data) {
        if (!data) return;
        
        // Stocker les métriques globales
        const globalMetric = {
            version: data.version,
            ...data.global,
            timestamp: data.timestamp
        };
        
        // V5: Ajouter les métriques machine si disponibles dans n_snapshot
        if (data.n_snapshot?.machine_metrics) {
            const mm = data.n_snapshot.machine_metrics;
            globalMetric.C_w_machine = mm.C_w_machine?.value;
            globalMetric.C_d_machine = mm.C_d_machine?.value;
            globalMetric.U_machine = mm.U_machine?.value;
            globalMetric.C_w_machine_tokens = mm.C_w_machine?.tokens;
            globalMetric.C_d_machine_tokens = mm.C_d_machine?.tokens;
        }
        
        this.sessionData.globalMetrics.push(globalMetric);
        
        // Limiter à 500 entrées
        if (this.sessionData.globalMetrics.length > 500) {
            this.sessionData.globalMetrics = this.sessionData.globalMetrics.slice(-500);
        }
        
        // V5.1: Stocker l'événement d'itération complet (inclut O et N snapshots)
        this.sessionData.events.push({
            type: 'iteration',
            timestamp: data.timestamp || new Date().toISOString(),
            data: {
                version: data.version,
                global: data.global,
                rankings: data.rankings,
                agents: data.agents,
                o_snapshot: data.o_snapshot,  // V5.1: Snapshot O pour verbatim
                n_snapshot: data.n_snapshot   // V5.1: Snapshot N pour verbatim
            }
        });
        
        // V5.1: Stocker les données des agents de l'itération dans agentMetrics
        if (data.agents && Array.isArray(data.agents)) {
            data.agents.forEach(agent => {
                if (agent && agent.id) {
                    this.sessionData.agentMetrics[agent.id] = agent;
                }
            });
        }
        
        // Mettre à jour les rankings
        this.sessionData.rankings = data.rankings || {};
        
        // Mettre à jour le compteur d'itérations
        document.getElementById('iteration-count').textContent = data.version || this.sessionData.globalMetrics.length;
        
        // Mettre à jour les compteurs d'agents
        // Priorité: données de l'événement > calcul depuis agentMetrics
        let aiCount, humanCount, totalCount;
        if (data.ai_agents_count !== undefined && data.human_agents_count !== undefined) {
            aiCount = data.ai_agents_count;
            humanCount = data.human_agents_count;
            totalCount = data.agents_count || (aiCount + humanCount);
        } else {
            // Recalculer depuis agentMetrics
            aiCount = Object.values(this.sessionData.agentMetrics)
                .filter(a => a && a.type === 'ai').length;
            humanCount = Object.values(this.sessionData.agentMetrics)
                .filter(a => a && a.type === 'human').length;
            totalCount = aiCount + humanCount;
        }
        
        document.getElementById('ai-count').textContent = aiCount;
        document.getElementById('human-count').textContent = humanCount;
        document.getElementById('agents-count').textContent = totalCount;
        
        // Notifier les popups
        this.popupManager.updateAll(this.sessionData);
    }
    
    handleOSnapshot(data) {
        // V5.1: Stocker le snapshot O pour les verbatim
        if (data) {
            const version = data.version || 0;
            this.sessionData.oSnapshots.push({
                version: version,
                timestamp: new Date().toISOString(),
                data: {
                    structures: data.structures || [],
                    formal_relations: data.formal_relations || {}
                }
            });
            // Garder seulement les 100 derniers
            if (this.sessionData.oSnapshots.length > 100) {
                this.sessionData.oSnapshots = this.sessionData.oSnapshots.slice(-100);
            }
        }
    }
    
    handleNSnapshot(data) {
        // V5.1: Stocker le snapshot N pour les verbatim
        if (data && data.version !== undefined) {
            this.sessionData.nSnapshots.push({
                version: data.version,
                timestamp: new Date().toISOString(),
                data: data
            });
            // Garder seulement les 100 derniers
            if (this.sessionData.nSnapshots.length > 100) {
                this.sessionData.nSnapshots = this.sessionData.nSnapshots.slice(-100);
            }
        }
    }
    
    handleCanvasSnapshot(data) {
        if (!data) return;
        
        this.sessionData.canvasSnapshots.push(data);
        
        // Limiter à 100 snapshots
        if (this.sessionData.canvasSnapshots.length > 100) {
            this.sessionData.canvasSnapshots = this.sessionData.canvasSnapshots.slice(-100);
        }
        
        // Notifier les popups canvas
        this.popupManager.updateAll(this.sessionData);
    }
    
    handleSessionExport(data) {
        // Télécharger le fichier depuis l'export serveur
        const metadata = data.metadata || {};
        const totalIterations = metadata.total_iterations || 0;
        const quantumSnapshotsCount = metadata.quantum_snapshots_count || 0;
        const agentsCount = metadata.agents_count || 0;
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `poietic-session-v6-server-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast(`Session exported from server: ${totalIterations} iterations, ${quantumSnapshotsCount} quantum snapshots, ${agentsCount} agents`, 'success');
    }
    
    // =========================================================================
    // Popup Management
    // =========================================================================
    
    addPopup(type) {
        // Masquer l'état vide
        document.getElementById('empty-state').style.display = 'none';
        
        // Créer le popup
        const popup = this.popupManager.createPopup(type, this.sessionData);
        
        this.showToast(`Added ${type} visualization`, 'success');
    }
    
    onPopupDataRequest(type) {
        // Retourner les données appropriées pour le type de popup
        return this.sessionData;
    }
    
    // =========================================================================
    // Session Management
    // =========================================================================
    
    async exportSession() {
        if (this.isConnected && this.socket) {
            // Demander l'export via WebSocket
            this.socket.send(JSON.stringify({ type: 'get_session_export' }));
        } else {
            // Exporter les données locales (V6 - toutes les données quantiques incluses)
            const sessionId = document.getElementById('session-id').textContent;
            const totalIterations = parseInt(document.getElementById('iteration-count').textContent) || 0;
            const agentsCount = Object.keys(this.sessionData.agentMetrics).length;
            const quantumSnapshotsCount = this.sessionData.quantumSnapshots?.length || 0;
            
            const exportData = {
                version: '6.0',
                session_id: sessionId,
                metadata: {
                    export_time: new Date().toISOString(),
                    total_iterations: totalIterations,
                    agents_count: agentsCount,
                    quantum_snapshots_count: quantumSnapshotsCount
                },
                // V5-compatible data
                events: this.sessionData.events,
                globalMetrics: this.sessionData.globalMetrics,
                agentMetrics: this.sessionData.agentMetrics,
                rankings: this.sessionData.rankings,
                canvasSnapshots: this.sessionData.canvasSnapshots,
                oSnapshots: this.sessionData.oSnapshots || [],
                nSnapshots: this.sessionData.nSnapshots || [],
                // V6 Quantum data
                quantumSnapshots: this.sessionData.quantumSnapshots || [],
                quantumHistory: this.sessionData.quantumHistory || {},
                latestQuantumSnapshot: this.sessionData.latestQuantumSnapshot,
                agentRankings: this.sessionData.agentRankings || {}
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poietic-session-v6-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showToast(`Session exported: ${totalIterations} iterations, ${quantumSnapshotsCount} quantum snapshots, ${agentsCount} agents`, 'success');
        }
    }
    
    async importSession(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Detect format version
            const version = data.version || (data.quantumSnapshots ? '6.0' : '5.0');
            const isV6 = version.startsWith('6');
            
            console.log(`[AIMetrics] Importing session format ${version}`);
            
            // Réinitialiser proprement sessionData avant import
            this.sessionData = {
                events: [],
                globalMetrics: [],
                agentMetrics: {},
                rankings: {},
                canvasSnapshots: [],
                oSnapshots: [],
                nSnapshots: [],
                quantumSnapshots: [],
                quantumHistory: {
                    versions: [],  // V6: Array of version numbers for X-axis
                    phi_coherence: [],
                    xi_correlation_length: [],
                    I_fringe_visibility: [],
                    tau_condensation: [],
                    delta_S_entropy: [],
                    C_w: [],
                    C_d: [],
                    U: []
                },
                latestQuantumSnapshot: null,
                agentRankings: {}
            };
            
            // Charger les données V5-compatibles
            this.sessionData.events = data.events || [];
            this.sessionData.globalMetrics = data.globalMetrics || [];
            this.sessionData.agentMetrics = data.agentMetrics || {};
            this.sessionData.rankings = data.rankings || {};
            this.sessionData.canvasSnapshots = data.canvasSnapshots || data.canvas_snapshots || [];
            this.sessionData.oSnapshots = data.oSnapshots || [];
            this.sessionData.nSnapshots = data.nSnapshots || [];
            
            // Charger les données V6 si présentes
            if (isV6 || data.quantumSnapshots) {
                this.sessionData.quantumSnapshots = data.quantumSnapshots || [];
                // Merge quantumHistory, en s'assurant que versions existe
                if (data.quantumHistory) {
                    this.sessionData.quantumHistory = {
                        versions: data.quantumHistory.versions || [],
                        phi_coherence: data.quantumHistory.phi_coherence || [],
                        xi_correlation_length: data.quantumHistory.xi_correlation_length || [],
                        I_fringe_visibility: data.quantumHistory.I_fringe_visibility || [],
                        tau_condensation: data.quantumHistory.tau_condensation || [],
                        delta_S_entropy: data.quantumHistory.delta_S_entropy || [],
                        C_w: data.quantumHistory.C_w || [],
                        C_d: data.quantumHistory.C_d || [],
                        U: data.quantumHistory.U || []
                    };
                }
                this.sessionData.latestQuantumSnapshot = data.latestQuantumSnapshot || null;
                this.sessionData.agentRankings = data.agentRankings || {};
            }
            
            // Si format d'export serveur (avec tracker_state), convertir
            if (data.tracker_state && data.tracker_history) {
                // Convertir l'historique du tracker en quantumHistory
                const history = data.tracker_history;
                if (history.versions) {
                    this.sessionData.quantumHistory.versions = history.versions;
                }
                if (history.phi_coherence) {
                    this.sessionData.quantumHistory.phi_coherence = history.phi_coherence;
                }
                if (history.xi_correlation) {
                    this.sessionData.quantumHistory.xi_correlation_length = history.xi_correlation;
                }
                if (history.I_visibility) {
                    this.sessionData.quantumHistory.I_fringe_visibility = history.I_visibility;
                }
                if (history.tau_condensation) {
                    this.sessionData.quantumHistory.tau_condensation = history.tau_condensation;
                }
                if (history.delta_S_entropy) {
                    this.sessionData.quantumHistory.delta_S_entropy = history.delta_S_entropy;
                }
                if (history.C_w) {
                    this.sessionData.quantumHistory.C_w = history.C_w;
                }
                if (history.C_d) {
                    this.sessionData.quantumHistory.C_d = history.C_d;
                }
                if (history.U) {
                    this.sessionData.quantumHistory.U = history.U;
                }
                
                // Convertir les événements du serveur
                if (data.events) {
                    this.sessionData.events = data.events;
                }
                
                // Convertir les données des agents
                if (data.last_agent_data) {
                    Object.entries(data.last_agent_data).forEach(([agentId, agentData]) => {
                        this.sessionData.agentMetrics[agentId] = agentData;
                    });
                }
            }
            
            // Si format d'export serveur (ancien format), convertir
            if (data.metadata && data.events && !data.globalMetrics) {
                this.sessionData.globalMetrics = data.events
                    .filter(e => e.type === 'iteration')
                    .map(e => ({
                        version: e.version,
                        ...e.global,
                        timestamp: e.timestamp
                    }));
                
                // Extraire les agents
                data.events.forEach(e => {
                    if (e.agents) {
                        e.agents.forEach(a => {
                            this.sessionData.agentMetrics[a.id] = a;
                        });
                    }
                });
            }
            
            // Mettre à jour l'affichage
            const sessionId = data.session_id || data.metadata?.session_start || data.metadata?.start_time || 'Imported';
            document.getElementById('session-id').textContent = sessionId.substring(0, 19).replace('T', ' ');
            
            const totalIterations = data.metadata?.total_iterations || 
                                   data.metadata?.total_iterations || 
                                   this.sessionData.globalMetrics.length ||
                                   this.sessionData.quantumSnapshots.length;
            document.getElementById('iteration-count').textContent = totalIterations;
            
            const aiCount = Object.values(this.sessionData.agentMetrics)
                .filter(a => a.type === 'ai').length;
            const humanCount = Object.values(this.sessionData.agentMetrics)
                .filter(a => a.type === 'human').length;
            
            document.getElementById('agents-count').textContent = aiCount + humanCount;
            document.getElementById('ai-count').textContent = aiCount;
            document.getElementById('human-count').textContent = humanCount;
            
            // Passer en mode replay
            this.isReplayMode = true;
            this.replayEngine.load(data);
            
            // Notifier les popups
            this.popupManager.updateAll(this.sessionData);
            
            // Afficher un résumé détaillé
            const quantumSnapshotsCount = this.sessionData.quantumSnapshots.length;
            const formatInfo = isV6 ? 'V6 (Quantum)' : 'V5 (Legacy)';
            const summary = `Session imported (${formatInfo}): ${totalIterations} iterations, ${quantumSnapshotsCount} quantum snapshots, ${aiCount + humanCount} agents`;
            this.showToast(summary, 'success');
            
        } catch (e) {
            console.error('[AIMetrics] Import error:', e);
            this.showToast(`Failed to import session: ${e.message}`, 'error');
        }
    }
    
    async clearSession() {
        if (!confirm('Clear current session data?')) return;
        
        // Réinitialiser les données locales
        this.sessionData = {
            events: [],
            globalMetrics: [],
            agentMetrics: {},
            rankings: {},
            canvasSnapshots: [],
            oSnapshots: [],
            nSnapshots: [],
            // V6 Quantum data
            quantumSnapshots: [],
            quantumHistory: {
                versions: [],  // V6: Array of version numbers for X-axis
                phi_coherence: [],
                xi_correlation_length: [],
                I_fringe_visibility: [],
                tau_condensation: [],
                delta_S_entropy: [],
                C_w: [],
                C_d: [],
                U: []
            },
            latestQuantumSnapshot: null,
            agentRankings: {}
        };
        
        // Demander au serveur de clear si connecté
        if (this.isConnected && this.socket) {
            try {
                this.socket.send(JSON.stringify({ type: 'reset' }));
            } catch (e) {
                console.error('[AIMetrics V6] Clear error:', e);
            }
        }
        
        // Réinitialiser l'affichage
        document.getElementById('session-id').textContent = '-';
        document.getElementById('iteration-count').textContent = '0';
        document.getElementById('agents-count').textContent = '0';
        document.getElementById('ai-count').textContent = '0';
        document.getElementById('human-count').textContent = '0';
        
        // Fermer tous les popups
        this.popupManager.closeAll();
        document.getElementById('empty-state').style.display = 'flex';
        
        // Forcer la mise à jour de tous les popups avec des données vides (au cas où certains seraient encore ouverts)
        this.popupManager.updateAll(this.sessionData);
        
        this.isReplayMode = false;
        
        this.showToast('Session cleared', 'success');
    }
    
    // =========================================================================
    // Replay
    // =========================================================================
    
    onReplayEvent(event) {
        // Simuler la réception d'un événement pendant le replay
        if (event.type === 'iteration') {
            this.handleIterationEvent({
                version: event.version,
                global: event.global,
                rankings: event.rankings,
                timestamp: event.timestamp
            });
        }
    }
    
    // =========================================================================
    // Utilities
    // =========================================================================
    
    handleStrategyParamsUpdate(params) {
        // Mettre à jour les champs de saisie
        if (params.strategy_u_threshold !== undefined) {
            document.getElementById('strategy-u-threshold').value = params.strategy_u_threshold;
            localStorage.setItem('strategy_u_threshold', params.strategy_u_threshold);
        }
        if (params.strategy_rank_divisor !== undefined) {
            document.getElementById('strategy-rank-divisor').value = params.strategy_rank_divisor;
            localStorage.setItem('strategy_rank_divisor', params.strategy_rank_divisor);
        }
        if (params.strategy_error_threshold !== undefined) {
            document.getElementById('strategy-error-threshold').value = params.strategy_error_threshold;
            localStorage.setItem('strategy_error_threshold', params.strategy_error_threshold);
        }
    }
    
    applyStrategyParams() {
        const uThreshold = parseFloat(document.getElementById('strategy-u-threshold').value);
        const rankDivisor = parseFloat(document.getElementById('strategy-rank-divisor').value);
        const errorThreshold = parseFloat(document.getElementById('strategy-error-threshold').value);
        
        if (isNaN(uThreshold) || isNaN(rankDivisor) || isNaN(errorThreshold)) {
            this.showToast('Invalid parameter values', 'error');
            return;
        }
        
        // Toujours stocker localement pour utilisation immédiate
        localStorage.setItem('strategy_u_threshold', uThreshold);
        localStorage.setItem('strategy_rank_divisor', rankDivisor);
        localStorage.setItem('strategy_error_threshold', errorThreshold);
        
        if (this.isConnected && this.socket) {
            this.socket.send(JSON.stringify({
                type: 'set_strategy_params',
                params: {
                    strategy_u_threshold: uThreshold,
                    strategy_rank_divisor: rankDivisor,
                    strategy_error_threshold: errorThreshold
                }
            }));
            this.showToast(`Strategy params updated: U<${uThreshold}, rank>total/${rankDivisor}, err>${errorThreshold}`, 'success');
        } else {
            this.showToast(`Strategy params saved locally: U<${uThreshold}, rank>total/${rankDivisor}, err>${errorThreshold}`, 'success');
        }
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
        toast.innerHTML = `
            <span class="icon">${icon}</span>
            <span class="message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.aiMetrics = new AIMetricsDashboard();
});

