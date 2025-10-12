// AI Player - Logique principale
// Version: 2025-10-11-20:15 - Fix recentUpdates not persisting
import { SpatialAnalysis } from './spatial-analysis.js';
import { AnthropicAdapter } from './llm-adapters/anthropic.js';
import { OpenAIAdapter } from './llm-adapters/openai.js';
import { OllamaAdapter } from './llm-adapters/ollama.js';

class AIPlayer {
    constructor() {
        console.log('[AI Player] ✅ Version chargée: 2025-10-11-20:15');
        // Configuration - Détection automatique de l'environnement
        const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const WS_HOST = window.location.hostname === 'localhost' 
            ? 'localhost:3001' 
            : window.location.host;
        
        const AI_SERVER = window.location.hostname === 'localhost'
            ? 'http://localhost:8003'
            : 'https://ai.poietic-generator.net';
        
        this.WS_URL = `${WS_PROTOCOL}//${WS_HOST}/updates?type=bot`;  // S'identifier comme bot
        this.ANALYTICS_URL = `${AI_SERVER}/api/analytics/hypothesis`;
        
        // État
        this.socket = null;
        this.myUserId = null;
        this.isRunning = false;
        this.isPaused = false;
        this.interval = 20;
        this.iterationCount = 0;
        this.myPixelCount = 0;
        this.otherUsers = {};
        this.myCellState = {};
        this.gridSize = 1;
        this.userPositions = {};
        this.myPosition = null;
        this.consecutiveErrors = 0;
        this.manualContent = null;
        this.isFirstLlmRequest = true;
        this.currentAdapter = null;

        // Éléments DOM
        this.elements = {
            apiKey: document.getElementById('api-key'),
            llmModelSelect: document.getElementById('llm-model-select'),
            viewerUrl: document.getElementById('viewer-url'),
            viewerFrame: document.getElementById('viewer-frame'),
            toggleViewerUrl: document.getElementById('toggle-viewer-url'),
            interval: document.getElementById('interval'),
            customPrompt: document.getElementById('custom-prompt'),
            btnStart: document.getElementById('btn-start'),
            btnPause: document.getElementById('btn-pause'),
            statusBadge: document.getElementById('status-badge'),
            userIdDisplay: document.getElementById('user-id-display'),
            decisionBox: document.getElementById('decision-box'),
            journal: document.getElementById('journal')
        };

        this.init();
    }

    init() {
        this.loadApiKey();
        this.loadManual();
        this.setupEventListeners();
        this.updateApiKeyPlaceholder('ollama'); // Initialiser avec Ollama par défaut (gratuit)
        this.addJournalEntry('👋 AI Player initialisé. Sélectionnez un modèle et cliquez sur Démarrer.');
    }

    // === Configuration ===
    loadApiKey() {
        const saved = localStorage.getItem('anthropic_api_key');
        if (saved) this.elements.apiKey.value = saved;
    }

    saveApiKey() {
        localStorage.setItem('anthropic_api_key', this.elements.apiKey.value);
        this.addJournalEntry('✅ Clé API sauvegardée', 'success');
    }

    clearApiKey() {
        localStorage.removeItem('anthropic_api_key');
        this.elements.apiKey.value = '';
        this.addJournalEntry('🗑️ Clé API effacée', 'success');
    }

    async loadManual(modelName = null) {
        // Si un modèle est spécifié, charger son manuel spécifique
        if (modelName) {
            try {
                const manualFile = this.getManualFileForModel(modelName);
                const resp = await fetch(manualFile);
                if (resp.ok) {
                    this.manualContent = await resp.text();
                    return this.manualContent;
                }
            } catch (_) {}
        }
        
        // Sinon, utiliser le manuel en cache ou le manuel par défaut
        if (this.manualContent) return this.manualContent;
        try {
            const resp = await fetch('/MANUEL_PRATIQUE_LLM.md');
            if (resp.ok) {
                this.manualContent = await resp.text();
                return this.manualContent;
            }
        } catch (_) {}
        return null;
    }
    
    getManualFileForModel(modelName) {
        const manualMap = {
            'anthropic': '/MANUEL_ANTHROPIC.md',
            'openai': '/MANUEL_OPENAI.md',
            'ollama': '/MANUEL_OLLAMA.md'
        };
        return manualMap[modelName] || '/MANUEL_PRATIQUE_LLM.md';
    }

    // === WebSocket ===
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.WS_URL);
            let lastMessageAt = Date.now();
            
            // Watchdog statut UI
            const watchdog = setInterval(() => {
                const idle = Date.now() - lastMessageAt;
                if (this.socket && this.socket.readyState === WebSocket.OPEN && idle < 40000) {
                    this.updateStatus('connected');
                }
            }, 3000);

            this.socket.onopen = () => {
                this.addJournalEntry('✅ Connecté au Poietic Generator', 'success');
                this.updateStatus('connected');
            };

            this.socket.onmessage = (event) => {
                lastMessageAt = Date.now();
                const message = JSON.parse(event.data);
                
                if (message.type === 'initial_state' && !this.myUserId && message.my_user_id) {
                    this.myUserId = message.my_user_id;
                    this.elements.userIdDisplay.textContent = `ID: ${this.myUserId.substring(0, 8)}...`;
                }
                
                this.handleMessage(message);
                
                if (message.type === 'initial_state' && this.myUserId) {
                    resolve();
                }
            };

            this.socket.onerror = (error) => {
                this.addJournalEntry(`❌ Erreur WebSocket: ${this.stringifyError(error)}`, 'error');
                this.updateStatus('disconnected');
                reject(new Error('WebSocket error'));
            };

            this.socket.onclose = () => {
                this.addJournalEntry('🔌 Déconnecté', 'error');
                this.updateStatus('disconnected');
                clearInterval(watchdog);
                this.isRunning = false;
                this.isPaused = false;
                this.elements.btnStart.textContent = '▶ Démarrer';
                this.elements.btnPause.disabled = true;
            };
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'initial_state':
                this.gridSize = message.grid_size || 1;
                const gridState = typeof message.grid_state === 'string' 
                    ? JSON.parse(message.grid_state) 
                    : message.grid_state;
                
                // Parser les positions
                if (gridState && gridState.user_positions) {
                    this.userPositions = {};
                    Object.entries(gridState.user_positions).forEach(([uid, pos]) => {
                        if (Array.isArray(pos) && pos.length === 2) {
                            this.userPositions[uid] = [parseInt(pos[0]), parseInt(pos[1])];
                        }
                    });
                    if (this.myUserId && this.userPositions[this.myUserId]) {
                        this.myPosition = this.userPositions[this.myUserId];
                    }
                }
                
                // Parser sub_cell_states
                if (message.sub_cell_states) {
                    Object.entries(message.sub_cell_states).forEach(([userId, pixels]) => {
                        if (userId !== this.myUserId) {
                            this.otherUsers[userId] = { 
                                pixels: pixels,
                                position: this.userPositions[userId] || [0, 0]
                            };
                        }
                    });
                }
                break;

            case 'cell_update':
                // Vérifier que user_id existe
                if (!message.user_id) {
                    console.warn('[AI Player] cell_update reçu sans user_id', message);
                    break;
                }
                
                if (message.user_id === this.myUserId) {
                    const key = `${message.sub_x},${message.sub_y}`;
                    this.myCellState[key] = message.color;
                } else {
                    // Initialiser l'objet si nécessaire (DÉFENSIF)
                    if (!this.otherUsers) {
                        console.error('[AI Player] ⚠️ this.otherUsers est undefined !');
                        this.otherUsers = {};
                    }
                    
                    // Toujours garantir que l'objet et ses propriétés existent
                    if (!this.otherUsers[message.user_id] || !this.otherUsers[message.user_id].recentUpdates) {
                        this.otherUsers[message.user_id] = { 
                            pixels: this.otherUsers[message.user_id]?.pixels || {}, 
                            recentUpdates: [],
                            lastStrategy: this.otherUsers[message.user_id]?.lastStrategy || null
                        };
                    }
                    
                    const key = `${message.sub_x},${message.sub_y}`;
                    this.otherUsers[message.user_id].pixels[key] = message.color;
                    
                    // Tracker les updates récents (garder les 100 derniers)
                    this.otherUsers[message.user_id].recentUpdates.push({
                        x: message.sub_x,
                        y: message.sub_y,
                        color: message.color,
                        timestamp: Date.now()
                    });
                    
                    // Limiter à 200 updates récents par voisin (~4-5 minutes d'historique)
                    if (this.otherUsers[message.user_id].recentUpdates.length > 200) {
                        this.otherUsers[message.user_id].recentUpdates.shift();
                    }
                }
                this.updateStats();
                break;

            case 'new_user':
                if (message.user_id !== this.myUserId) {
                    const position = message.position || [0, 0];
                    this.userPositions[message.user_id] = position;
                    this.otherUsers[message.user_id] = { pixels: {}, position: position };
                    this.updateStats();
                }
                break;

            case 'user_left':
                delete this.otherUsers[message.user_id];
                delete this.userPositions[message.user_id];
                this.updateStats();
                break;
        }
    }

    sendCellUpdate(subX, subY, color) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'cell_update',
                sub_x: subX,
                sub_y: subY,
                color: color
            }));
        }
    }

    // === Analyse et exécution ===
    analyzeEnvironment() {
        return SpatialAnalysis.analyzeEnvironment(
            this.myCellState, 
            this.otherUsers, 
            this.myPosition, 
            this.userPositions, 
            this.myUserId, 
            this.gridSize
        );
    }

    async askLLM(analysis, customPrompt) {
        // Sélectionner l'adaptateur basé sur le choix utilisateur
        const selectedModel = this.elements.llmModelSelect.value;
        this.currentAdapter = this.getAdapterForModel(selectedModel);

        const apiKey = this.elements.apiKey.value;
        if (!apiKey && selectedModel !== 'ollama') {
            throw new Error('API Key manquante');
        }

        // Charger le manuel spécifique au modèle si première requête
        if (this.isFirstLlmRequest) {
            await this.loadManual(selectedModel);
        }

        // Récupérer ma stratégie précédente pour maintenir la cohérence
        const myLastStrategy = this.otherUsers[this.myUserId]?.lastStrategy || null;
        
        // Construire le prompt : analyse du manuel pour la 1ère requête, prompt normal ensuite
        let systemPrompt;
        if (this.isFirstLlmRequest && this.manualContent && this.currentAdapter.buildManualAnalysisPrompt) {
            systemPrompt = this.currentAdapter.buildManualAnalysisPrompt(this.manualContent);
        } else {
            systemPrompt = this.currentAdapter.buildSystemPrompt(
                analysis, 
                customPrompt, 
                this.isFirstLlmRequest, 
                this.manualContent, 
                this.iterationCount,
                myLastStrategy  // NOUVEAU: Passer la stratégie précédente
            );
        }

        this.setLlmStatus('Actif', 'running');

        try {
            const response = await this.currentAdapter.callAPI(apiKey, systemPrompt);
            this.setLlmStatus('En attente', 'paused');

            // Mettre à jour les compteurs de tokens
            this.updateTokenCounters(response.usage);

            const parsed = this.currentAdapter.parseResponse(response.content);
            this.consecutiveErrors = 0;

            if (this.isFirstLlmRequest) {
                this.isFirstLlmRequest = false;
                const modelName = this.elements.llmModelSelect.value.toUpperCase();
                this.addJournalEntry(`📖 Manuel ${modelName} envoyé à l'agent (1ère requête)`, 'success');
            }

            // Afficher les hypothèses et le raisonnement
            this.displayReasoning(parsed);

            // Envoyer les données au serveur Analytics
            this.sendToAnalytics(parsed, analysis);

            return parsed;

        } catch (error) {
            this.setLlmStatus('Inactif', 'disconnected');
            throw error;
        }
    }

    async executePixels(instructions) {
        let pixels = [];
        
        if (Array.isArray(instructions.pixels) && instructions.pixels.length > 0) {
            pixels = instructions.pixels;
        } else if (Array.isArray(instructions.grid)) {
            // Convertir une grille 20x20 en liste de pixels
            const grid = instructions.grid;
            for (let y = 0; y < Math.min(20, grid.length); y++) {
                const row = Array.isArray(grid[y]) ? grid[y] : [];
                for (let x = 0; x < Math.min(20, row.length); x++) {
                    const color = row[x];
                    if (typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)) {
                        pixels.push({ x, y, color });
                    }
                }
            }
        } else {
            return 0;
        }

        // Post-traitement: validation des coordonnées uniquement
        pixels = pixels.map(p => ({
            x: Math.max(0, Math.min(19, p.x)),
            y: Math.max(0, Math.min(19, p.y)),
            color: p.color
        }));

        // NOUVEAU: Envoi progressif "au compte-gouttes"
        const delayAfterMs = (parseInt(this.elements.interval.value) || 0) * 1000;
        const pixelCount = pixels.length;
        
        if (pixelCount === 0) return 0;
        
        // Calculer le délai optimal entre pixels pour un dessin fluide
        // Si délai = 0, dessiner rapidement (10s max), sinon utiliser 80% du délai
        let drawingTime;
        if (delayAfterMs === 0) {
            // Mode rapide: 10 secondes max pour dessiner
            drawingTime = Math.min(10000, pixelCount * 200); // 200ms/pixel, max 10s
        } else {
            // Mode espacé: utiliser 80% du délai configuré
            drawingTime = delayAfterMs * 0.8;
        }
        
        const delayPerPixel = Math.max(50, drawingTime / pixelCount); // Min 50ms entre pixels
        
        console.log(`[Progressive] ${pixelCount} pixels sur ${Math.round(drawingTime/1000)}s (${Math.round(delayPerPixel)}ms/pixel), puis attente ${delayAfterMs/1000}s`);
        
        // Envoyer les pixels progressivement
        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i];
            
            // Envoyer avec délai progressif
            setTimeout(() => {
                if (!this.isRunning) return; // Arrêter si l'agent est stoppé
                
                if (pixel.x >= 0 && pixel.x < 20 && pixel.y >= 0 && pixel.y < 20) {
                    this.sendCellUpdate(pixel.x, pixel.y, pixel.color);
                    const key = `${pixel.x},${pixel.y}`;
                    this.myCellState[key] = pixel.color;
                    this.myPixelCount = Object.keys(this.myCellState).length;
                }
            }, i * delayPerPixel);
        }

        return pixels.length;
    }

    // === Boucle principale ===
    async mainLoop() {
        while (this.isRunning) {
            if (this.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                this.addJournalEntry(`⚠️ WebSocket déconnecté, attente reconnexion...`, 'error');
                this.updateStatus('disconnected');
                this.setLlmStatus('Inactif', 'disconnected');
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }

            if (!this.myUserId) {
                this.addJournalEntry(`⚠️ En attente de l'ID utilisateur...`, 'error');
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            // Marquer le début de l'itération
            const iterationStart = Date.now();
            const targetIntervalMs = parseInt(this.elements.interval.value) * 1000;

            try {
                this.iterationCount++;
                this.updateStats();

                this.addJournalEntry(`🤔 Itération ${this.iterationCount}...`);

                const analysis = this.analyzeEnvironment();
                const customPrompt = this.elements.customPrompt.value.trim();

                const instructions = await this.askLLM(analysis, customPrompt);
                const pixelCount = await this.executePixels(instructions);

                this.updateDecision(instructions.strategy, pixelCount);
                this.addJournalEntry(`✅ ${pixelCount} pixels dessinés | "${instructions.strategy}"`, 'success');
                
                // Stocker ma propre stratégie pour que les voisins la voient
                if (!this.otherUsers[this.myUserId]) {
                    this.otherUsers[this.myUserId] = { pixels: {}, recentUpdates: [], lastStrategy: null };
                }
                this.otherUsers[this.myUserId].lastStrategy = instructions.strategy;
                
                // NOTE: Ne PAS vider recentUpdates ici, car on en a besoin pour la prochaine itération
                // La limite de 100 est déjà appliquée dans handleMessage (cell_update)

            } catch (error) {
                const msg = this.stringifyError(error);
                this.addJournalEntry(`❌ Erreur: ${msg}`, 'error');
                
                this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
                let backoffMs = 0;
                if (/429|Rate limit/i.test(msg)) {
                    this.setLlmStatus('Rate limited', 'paused');
                    backoffMs = Math.max(60000, (parseInt(this.elements.interval.value) || 20) * 1000);
                } else {
                    backoffMs = this.consecutiveErrors === 1 ? 15000 : this.consecutiveErrors === 2 ? 60000 : 120000;
                }
                this.addJournalEntry(`⏳ Backoff ${Math.round(backoffMs/1000)}s (erreurs consécutives: ${this.consecutiveErrors})`, '');
                await new Promise(r => setTimeout(r, backoffMs));
            }

            // Calculer le temps restant pour respecter l'intervalle
            const elapsed = Date.now() - iterationStart;
            const remainingTime = Math.max(0, targetIntervalMs - elapsed);
            
            if (remainingTime > 0) {
                console.log(`[Timing] Itération: ${Math.round(elapsed/1000)}s, attente: ${Math.round(remainingTime/1000)}s (total: ${Math.round((elapsed + remainingTime)/1000)}s)`);
                await new Promise(resolve => setTimeout(resolve, remainingTime));
            } else {
                console.log(`[Timing] Itération trop longue: ${Math.round(elapsed/1000)}s (cible: ${Math.round(targetIntervalMs/1000)}s)`);
            }
        }
    }

    // === Gestion des adaptateurs LLM ===
    getAdapterForModel(modelName) {
        switch (modelName) {
            case 'anthropic':
                return AnthropicAdapter;
            case 'openai':
                return OpenAIAdapter;
            case 'ollama':
                return OllamaAdapter;
            case 'claude-vision':
                // TODO: Implémenter ClaudeVisionAdapter
                throw new Error('Claude Vision pas encore implémenté');
            case 'dalle':
                // TODO: Implémenter DalleAdapter
                throw new Error('DALL-E 3 pas encore implémenté');
            case 'gemini':
                // TODO: Implémenter GeminiAdapter
                throw new Error('Google Gemini pas encore implémenté');
            default:
                return AnthropicAdapter;
        }
    }

    // === Utilitaires ===
    stringifyError(err) {
        try {
            if (!err) return 'Erreur inconnue';
            if (typeof err === 'string') return err;
            if (err.message) return err.message;
            if (err.response && err.response.status) return `HTTP ${err.response.status}`;
            if (err.error) return err.error;
            if (err.detail) return err.detail;
            
            // Tenter de sérialiser l'objet
            try {
                const serialized = JSON.stringify(err);
                if (serialized && serialized !== '{}') return serialized;
            } catch (_) {}
            
            // Dernier recours : convertir en string
            return String(err);
        } catch (_) {
            return 'Erreur (non sérialisable)';
        }
    }

    setLlmStatus(label, cls = 'paused') {
        const el = document.getElementById('llm-status-badge');
        if (!el) return;
        el.textContent = `LLM: ${label}`;
        el.className = `status-badge ${cls}`;
    }

    updateStatus(status) {
        if (status === 'connected') {
            this.elements.statusBadge.textContent = 'Connecté';
            this.elements.statusBadge.className = 'status-badge connected';
            const llm = document.getElementById('llm-status-badge');
            if (llm) { llm.textContent = 'LLM: En attente'; llm.className = 'status-badge paused'; }
        } else if (status === 'running') {
            this.elements.statusBadge.textContent = 'En cours';
            this.elements.statusBadge.className = 'status-badge running';
            const llm = document.getElementById('llm-status-badge');
            if (llm) { llm.textContent = 'LLM: Actif'; llm.className = 'status-badge running'; }
        } else if (status === 'paused') {
            this.elements.statusBadge.textContent = 'Pause';
            this.elements.statusBadge.className = 'status-badge paused';
            const llm = document.getElementById('llm-status-badge');
            if (llm) { llm.textContent = 'LLM: En pause'; llm.className = 'status-badge paused'; }
        } else {
            this.elements.statusBadge.textContent = 'Déconnecté';
            this.elements.statusBadge.className = 'status-badge disconnected';
            const llm = document.getElementById('llm-status-badge');
            if (llm) { llm.textContent = 'LLM: Inactif'; llm.className = 'status-badge disconnected'; }
        }
    }

    updateStats() {
        this.myPixelCount = Object.keys(this.myCellState).length;
        // Autres stats si nécessaire
    }

    updateDecision(strategy, pixelCount) {
        const time = new Date().toLocaleTimeString('fr-FR');
        this.elements.decisionBox.innerHTML = `
            <div class="decision-strategy">"${strategy}"</div>
            <div class="decision-meta">Itération ${this.iterationCount} • ${pixelCount} pixels • ${time}</div>
        `;
    }

    addJournalEntry(text, className = '') {
        const time = new Date().toLocaleTimeString('fr-FR');
        const entry = document.createElement('div');
        entry.className = `journal-entry ${className}`;
        entry.textContent = `[${time}] ${text}`;
        this.elements.journal.insertBefore(entry, this.elements.journal.firstChild);
        
        while (this.elements.journal.children.length > 50) {
            this.elements.journal.removeChild(this.elements.journal.lastChild);
        }
    }

    updateTokenCounters(usage) {
        try {
            const inLast = usage?.input_tokens;
            const outLast = usage?.output_tokens;
            if (inLast !== null && inLast !== undefined) {
                const elInLast = document.getElementById('tokens-in-last');
                const elInTotal = document.getElementById('tokens-in-total');
                if (elInLast) elInLast.textContent = inLast;
                if (elInTotal) elInTotal.textContent = ((parseInt(elInTotal.textContent) || 0) + inLast).toString();
            }
            if (outLast !== null && outLast !== undefined) {
                const elOutLast = document.getElementById('tokens-out-last');
                const elOutTotal = document.getElementById('tokens-out-total');
                if (elOutLast) elOutLast.textContent = outLast;
                if (elOutTotal) elOutTotal.textContent = ((parseInt(elOutTotal.textContent) || 0) + outLast).toString();
            }
        } catch (_) {}
    }

    displayReasoning(parsed) {
        try {
            // Afficher l'analyse du manuel si présente (1ère requête)
            if (parsed.manual_analysis) {
                const ma = parsed.manual_analysis;
                this.addJournalEntry(`📚 ═══ ANALYSE DU MANUEL ═══`, 'success');
                if (ma.summary) {
                    this.addJournalEntry(`📝 Résumé: ${ma.summary}`, '');
                }
                if (ma.suitability_score !== undefined) {
                    this.addJournalEntry(`⭐ Score d'adéquation: ${(ma.suitability_score * 100).toFixed(0)}%`, '');
                }
                if (Array.isArray(ma.strengths) && ma.strengths.length > 0) {
                    this.addJournalEntry(`✅ Forces: ${ma.strengths.slice(0, 3).join(' | ')}`, '');
                }
                if (Array.isArray(ma.weaknesses) && ma.weaknesses.length > 0) {
                    this.addJournalEntry(`⚠️ Faiblesses: ${ma.weaknesses.slice(0, 3).join(' | ')}`, '');
                }
                if (Array.isArray(ma.suggested_adaptations) && ma.suggested_adaptations.length > 0) {
                    this.addJournalEntry(`💡 Suggestions: ${ma.suggested_adaptations.slice(0, 2).join(' | ')}`, '');
                }
                if (ma.confidence_by_task) {
                    const tasks = Object.entries(ma.confidence_by_task)
                        .map(([k, v]) => `${k}=${(v*100).toFixed(0)}%`)
                        .join(', ');
                    this.addJournalEntry(`🎯 Confiance par tâche: ${tasks}`, '');
                }
                this.addJournalEntry(`═══════════════════════════`, '');
            }
            
            // Afficher les hypothèses normales
            if (Array.isArray(parsed.hypotheses) && parsed.hypotheses.length > 0) {
                this.addJournalEntry(`🔬 Hypothèses explorées: ${parsed.hypotheses.length}`, '');
                parsed.hypotheses.forEach((h, idx) => {
                    const name = h.name || `H${idx+1}`;
                    const score = (h.score !== undefined && h.score !== null) ? h.score.toFixed(3) : '?';
                    const gain = h.gain !== undefined ? `Δ${h.gain}b` : '';
                    const conf = h.i_confidence !== undefined ? `i=${h.i_confidence}` : '';
                    const px = h.h_pixels !== undefined ? `${h.h_pixels}px` : '';
                    this.addJournalEntry(`  ${idx === 0 ? '🏆' : '  '} ${name}: score=${score} (${gain}, ${conf}, ${px})`, '');
                });
            }
            if (parsed.chosen_hypothesis) {
                this.addJournalEntry(`✅ Choix: ${parsed.chosen_hypothesis}`, 'success');
            }
            if (parsed.reasoning) {
                this.addJournalEntry(`💭 Raisonnement: ${parsed.reasoning}`, '');
            }
            if (Array.isArray(parsed.agent_needs) && parsed.agent_needs.length) {
                this.addJournalEntry(`🧩 Besoins agent: ${parsed.agent_needs.slice(0,5).join(' | ')}`, '');
            }
            if (Array.isArray(parsed.agent_suggestions) && parsed.agent_suggestions.length) {
                this.addJournalEntry(`💡 Suggestions agent: ${parsed.agent_suggestions.slice(0,5).join(' | ')}`, '');
            }
        } catch (_) {}
    }

    async sendToAnalytics(parsed, analysis) {
        try {
            const payload = {
                agent_id: this.myUserId || 'unknown',
                iteration: this.iterationCount,
                timestamp: new Date().toISOString(),
                position: this.myPosition,
                strategy: parsed.strategy,
                hypotheses: parsed.hypotheses || [],
                chosen_hypothesis: parsed.chosen_hypothesis,
                reasoning: parsed.reasoning,
                pixel_count: analysis.myPixelCount,
                neighbor_count: analysis.neighborCount
            };
            
            await fetch(this.ANALYTICS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.warn('⚠️ Échec envoi Analytics:', error);
        }
    }

    // === Event Listeners ===
    setupEventListeners() {
        // Toggle Viewer URL
        this.elements.toggleViewerUrl.addEventListener('click', () => {
            const isHidden = this.elements.viewerUrl.style.display === 'none';
            this.elements.viewerUrl.style.display = isHidden ? 'block' : 'none';
            this.elements.toggleViewerUrl.textContent = isHidden ? '▲ Cacher' : '▼ Changer';
        });

        this.elements.viewerUrl.addEventListener('change', () => {
            this.elements.viewerFrame.src = this.elements.viewerUrl.value;
            this.addJournalEntry(`🔄 Viewer URL changée: ${this.elements.viewerUrl.value}`, 'success');
        });

        // Bouton Start/Stop
        this.elements.btnStart.addEventListener('click', async () => {
            if (!this.isRunning) {
                // Vérifier l'API key sauf pour Ollama (gratuit)
                const isOllama = this.currentAdapter && this.currentAdapter.name && this.currentAdapter.name.includes('Ollama');
                if (!isOllama && !this.elements.apiKey.value) {
                    alert('⚠️ Veuillez entrer votre API Key');
                    return;
                }
                this.saveApiKey();
                this.isRunning = true;
                this.isPaused = false;
                this.elements.btnStart.textContent = '■ Arrêter';
                this.elements.btnPause.disabled = false;
                this.updateStatus('running');
                try {
                    await this.connectWebSocket();
                    this.mainLoop();
                } catch (error) {
                    this.addJournalEntry(`❌ Impossible de se connecter: ${this.stringifyError(error)}`, 'error');
                    this.isRunning = false;
                    this.elements.btnStart.textContent = '▶ Démarrer';
                    this.elements.btnPause.disabled = true;
                }
            } else {
                this.isRunning = false;
                this.isPaused = false;
                this.isFirstLlmRequest = true;
                try { if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close(); } catch (_) {}
                this.updateStatus('disconnected');
                this.elements.btnStart.textContent = '▶ Démarrer';
                this.elements.btnPause.disabled = true;
                this.addJournalEntry('⏹️ Arrêt demandé (LLM et WS fermés).', '');
            }
        });

        // Bouton Pause
        this.elements.btnPause.addEventListener('click', () => {
            this.isPaused = !this.isPaused;
            this.elements.btnPause.textContent = this.isPaused ? '▶ Reprendre' : '⏸ Pause';
            this.updateStatus(this.isPaused ? 'paused' : 'running');
            this.addJournalEntry(this.isPaused ? '⏸ Pause' : '▶ Reprise');
        });

        // Bouton Clear API Key
        document.getElementById('btn-clear-key').addEventListener('click', () => this.clearApiKey());
        
        // Bouton Submit Prompt
        document.getElementById('btn-submit-prompt').addEventListener('click', () => {
            const prompt = this.elements.customPrompt.value.trim();
            if (prompt) {
                this.addJournalEntry(`📝 Prompt mis à jour: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, 'success');
            } else {
                this.addJournalEntry(`📝 Prompt réinitialisé (mode libre)`, 'success');
            }
        });

        // Sélecteur de modèle LLM
        this.elements.llmModelSelect.addEventListener('change', async () => {
            const selectedModel = this.elements.llmModelSelect.value;
            const selectedOption = this.elements.llmModelSelect.options[this.elements.llmModelSelect.selectedIndex];
            
            if (selectedOption.disabled) {
                this.addJournalEntry(`⚠️ ${selectedOption.textContent} n'est pas encore disponible`, 'error');
                // Revenir à Anthropic par défaut
                this.elements.llmModelSelect.value = 'anthropic';
                return;
            }
            
            this.addJournalEntry(`🔄 Modèle LLM changé: ${selectedOption.textContent}`, 'success');
            
            // Mettre à jour le placeholder de l'API Key selon le modèle
            this.updateApiKeyPlaceholder(selectedModel);
            
            // Recharger le manuel spécifique au nouveau modèle
            this.isFirstLlmRequest = true; // Forcer le rechargement du manuel
            await this.loadManual(selectedModel);
            this.addJournalEntry(`📖 Manuel ${selectedModel.toUpperCase()} chargé`, 'success');
        });
    }

    // Mettre à jour le placeholder de l'API Key selon le modèle sélectionné
    updateApiKeyPlaceholder(modelName) {
        const placeholders = {
            'anthropic': 'sk-ant-api03-...',
            'openai': 'sk-proj-...',
            'ollama': '(Aucune clé nécessaire - Gratuit)',
            'claude-vision': 'sk-ant-api03-...',
            'dalle': 'sk-proj-...',
            'gemini': 'AIza...'
        };
        
        const placeholder = placeholders[modelName] || 'sk-ant-api03-...';
        this.elements.apiKey.placeholder = placeholder;
        
        // Désactiver le champ API Key pour Ollama (gratuit)
        if (modelName === 'ollama') {
            this.elements.apiKey.disabled = true;
            this.elements.apiKey.value = 'ollama-local';
        } else {
            this.elements.apiKey.disabled = false;
            if (this.elements.apiKey.value === 'ollama-local') {
                this.elements.apiKey.value = '';
            }
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.aiPlayer = new AIPlayer();
});

// Export pour utilisation dans d'autres modules
export { AIPlayer };