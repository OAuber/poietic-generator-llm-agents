        // AI Player V3 - Logic
        // Version: 2025-01-24-100 - Simplicity Theory Direct Evaluations
import { SpatialAnalysis } from './spatial-analysis.js';
import { AnthropicAdapter } from './llm-adapters/anthropic.js';
import { OpenAIAdapter } from './llm-adapters/openai.js';
import { OllamaAdapter } from './llm-adapters/ollama.js';
import { LlavaAdapter } from './llm-adapters/llava.js';
import { LlavaCanvasGenerator } from './llava-canvas.js';
import { ColorGenerator } from './poietic-color-generator.js';

class AIPlayer {
    constructor() {
        console.log('[AI Player V3] ✅ Version loaded: 2025-01-24-100 - Simplicity Theory Direct Evaluations');
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
        this.heartbeatInterval = null; // Pour envoyer des heartbeats réguliers
        this.currentDrawingIteration = 0; // Numéro d'itération des pixels en cours de dessin
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
        this.promptsContent = null; // Cache des prompts externes
        this.trainingOrder = ['A1','A2','A3','A4','A5','B6','B7','B8','C9','C10','C11','D12','D13','D14'];
        this.currentExercise = null; // Mémoire locale de l'exercice courant
        
        // Memory context for free mode
        this.lastIntention = '';
        this.lastLocalCanvasBase64 = null;
        this.lastGlobalCanvasBase64 = null;
        
        // Simplicity Theory metrics (V2)
        this.initialGeneratedState = null; // État initial généré par ColorGenerator
        this.lastLocalDescription = ''; // Q6 de l'itération précédente
        this.lastGlobalDescription = ''; // Q4 de l'itération précédente
        this.simplicityMetrics = {
            iterations: [],
            C_w: [],
            C_d: [],
            U: [],
            descriptions: []
        };
        
        // V3: No memory managers - agents provide direct simplicity assessments
        
        // WebSocket pour métriques (serveur séparé)
        this.metricsSocket = null;
        
        // Track pending pixel timeouts to cancel them on stop
        this.pendingPixelTimeouts = [];

        // Éléments DOM
        this.elements = {
            apiKey: document.getElementById('api-key'),
            llmModelSelect: document.getElementById('llm-model-select'),
            viewerUrl: document.getElementById('viewer-url'),
            viewerFrame: document.getElementById('viewer-frame'),
            toggleViewerUrl: document.getElementById('toggle-viewer-url'),
            interval: document.getElementById('interval'),
            complexityThreshold: document.getElementById('complexity-threshold'),
            customPrompt: document.getElementById('custom-prompt'),
            btnStart: document.getElementById('btn-start'),
            btnPause: document.getElementById('btn-pause'),
            statusBadge: document.getElementById('status-badge'),
            userIdDisplay: document.getElementById('user-id-display'),
            decisionBox: document.getElementById('decision-box'),
            journal: document.getElementById('journal'),
            trainingEnabled: document.getElementById('training-enabled'),
            trainingPhase: document.getElementById('training-phase'),
            trainingEx: document.getElementById('training-ex')
        };

        this.init();
    }

    init() {
        // S'assurer que l'agent ne démarre pas automatiquement
        this.isRunning = false;
        this.isPaused = false;
        console.log('[AI Player V3] 🔒 Auto-start disabled, isRunning:', this.isRunning);
        
        // V3: No memory managers needed - agents provide direct simplicity assessments
        
        this.loadApiKey();
        this.loadManual();
        this.ensurePromptsLoading();
        this.setupEventListeners();
        // Modèle par défaut: Gemini (vision + JSON structuré)
        if (this.elements.llmModelSelect) {
            try {
                this.elements.llmModelSelect.value = 'gemini';
            } catch (_) {}
        }
        this.updateApiKeyPlaceholder('gemini');
        
        // 🔧 Initialiser l'iframe du viewer avec la valeur sélectionnée
        if (this.elements.viewerFrame && this.elements.viewerUrl) {
            this.elements.viewerFrame.src = this.elements.viewerUrl.value;
            console.log(`[AI Player] 🖼️ Viewer initialisé: ${this.elements.viewerUrl.value}`);
        }
        // Training panel is hidden by default (free mode is default)
        try {
            if (this.elements.trainingEnabled) {
                this.elements.trainingEnabled.checked = false;
            }
            const panel = document.getElementById('training-panel');
            if (panel) panel.style.display = 'none';
        } catch (_) {}
        this.updateJournalTitle(); // Initialiser le titre du journal
        this.addJournalEntry('👋 AI Player initialized. Select a model and click Start.');
        
        // Initialize header display
        this.updateHeaderModel();
        
        // Connecter au serveur de métriques (V2)
        this.connectToMetricsServer();
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
                this.startHeartbeat(); // Démarrer l'envoi de heartbeats
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
                this.addJournalEntry('🔌 Déconnecté du serveur', 'error');
                this.updateStatus('disconnected');
                clearInterval(watchdog);
                this.stopHeartbeat(); // Arrêter les heartbeats
                this.cancelPendingPixels(); // Annuler les pixels en attente
                this.isRunning = false;
                this.isPaused = false;
                this.elements.btnStart.textContent = '▶ Start';
                this.elements.btnPause.disabled = true;
            };
        });
    }

    startHeartbeat() {
        // Envoyer un heartbeat toutes les 5 secondes pour éviter la déconnexion par inactivité
        this.stopHeartbeat(); // S'assurer qu'il n'y a pas de doublon
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
                console.log('[AI Player] 💓 Heartbeat envoyé');
            }
        }, 5000); // Toutes les 5 secondes
        console.log('[AI Player] 💓 Heartbeat démarré (envoi toutes les 5s)');
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('[AI Player] 💓 Heartbeat arrêté');
        }
    }
    
    /**
     * Cancel all pending pixel timeouts to prevent delayed pixel bursts when stopping
     */
    cancelPendingPixels() {
        if (this.pendingPixelTimeouts && this.pendingPixelTimeouts.length > 0) {
            console.log(`[AI Player] 🛑 Annulation de ${this.pendingPixelTimeouts.length} pixels en attente`);
            this.pendingPixelTimeouts.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            this.pendingPixelTimeouts = [];
        }
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
                        this.updateJournalTitle();
                        this.updateHeaderPosition(); // Update header banner position
                    }
                }
                
                // Parser sub_cell_states (INCLURE TOUS LES USERS, y compris soi-même)
                if (message.sub_cell_states) {
                    Object.entries(message.sub_cell_states).forEach(([userId, pixels]) => {
                            this.otherUsers[userId] = { 
                                pixels: pixels,
                                position: this.userPositions[userId] || [0, 0]
                            };
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
                    
                    // Enregistrer nos propres updates avec numéro d'itération pour que les voisins voient la progression
                    if (!this.otherUsers[this.myUserId]) {
                        this.otherUsers[this.myUserId] = { 
                            pixels: {}, 
                            recentUpdates: [], 
                            lastStrategy: null,
                            position: this.myPosition || [0, 0]
                        };
                    }
                    this.otherUsers[this.myUserId].recentUpdates.push({
                        x: message.sub_x,
                        y: message.sub_y,
                        color: message.color,
                        timestamp: Date.now(),
                        iteration: this.currentDrawingIteration // Utiliser le numéro capturé au début du dessin
                    });
                    // Limiter à 200 updates
                    if (this.otherUsers[this.myUserId].recentUpdates.length > 200) {
                        this.otherUsers[this.myUserId].recentUpdates.shift();
                    }
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
                            lastStrategy: this.otherUsers[message.user_id]?.lastStrategy || null,
                            position: this.userPositions[message.user_id] || [0, 0]  // AJOUTER LA POSITION
                        };
                    }
                    
                    // S'assurer que la position est toujours à jour
                    if (!this.otherUsers[message.user_id].position && this.userPositions[message.user_id]) {
                        this.otherUsers[message.user_id].position = this.userPositions[message.user_id];
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
            // Normaliser la couleur en format #RRGGBB (6 caractères)
            let normalizedColor = color;
            if (color && color.length === 4 && color.startsWith('#')) {
                // Convertir #RGB en #RRGGBB
                const r = color[1];
                const g = color[2];
                const b = color[3];
                normalizedColor = `#${r}${r}${g}${g}${b}${b}`;
            }
            
            const message = {
                type: 'cell_update',
                sub_x: subX,
                sub_y: subY,
                color: normalizedColor
            };
            
            this.socket.send(JSON.stringify(message));
        } else {
            console.log(`[AI Player] ❌ WebSocket fermé, pixel non envoyé: (${subX},${subY}) = ${color}`);
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
        if (!apiKey && selectedModel !== 'ollama' && selectedModel !== 'llava' && selectedModel !== 'gemini') {
            throw new Error('API Key manquante');
        }

        // Charger le manuel spécifique au modèle si première requête
        if (this.isFirstLlmRequest) {
            await this.loadManual(selectedModel);
        }

        // S'assurer que les prompts externes sont chargés avant construction du prompt
        await this.ensurePromptsLoading();

        // Forcer le chargement du prompt système côté adapter et tracer l'adapter utilisé
        try {
            console.log('[AI Player] 📦 Adapter sélectionné:', selectedModel, this.currentAdapter?.name || '(unknown)');
            if (this.currentAdapter && typeof this.currentAdapter.loadPrompts === 'function') {
                await this.currentAdapter.loadPrompts('system', true);
                console.log('[AI Player] 🧾 Prompt système Gemini chargé via adapter');
            }
        } catch (e) {
            console.error('[AI Player] ❌ Échec chargement prompt via adapter:', e);
        }

        // Construire le contexte de mémoire pour le mode libre (centralisé dans JSON)
        let memoryContext = '';
        if (this.lastLocalCanvasBase64 || this.lastGlobalCanvasBase64) {
            try {
                const prompts = await this.ensurePromptsLoading();
                if (prompts && Array.isArray(prompts.memory_context)) {
                    const tpl = prompts.memory_context.join('\n');
                    const randomColors = this.generateRandomColors(8);
                    const render = (s) => s
                        .replaceAll('{{lastIntention}}', (this.lastIntention || 'N/A'))
                        .replaceAll('{{colorPalette}}', this.generateColorPalette())
                        .replaceAll('{{color1}}', randomColors[0])
                        .replaceAll('{{color2}}', randomColors[1])
                        .replaceAll('{{color3}}', randomColors[2])
                        .replaceAll('{{color4}}', randomColors[3])
                        .replaceAll('{{color5}}', randomColors[4])
                        .replaceAll('{{color6}}', randomColors[5])
                        .replaceAll('{{color7}}', randomColors[6])
                        .replaceAll('{{color8}}', randomColors[7]);
                    memoryContext = '\n\n' + render(tpl) + '\n';
                } else {
                    // Fallback ancien texte
                    memoryContext = '\n\n--- YOUR MEMORY ---\n';
                    if (this.lastIntention) {
                        memoryContext += `Previous intention: "${this.lastIntention}"\n`;
                    }
                    memoryContext += 'You will see two images:\n';
                    memoryContext += '1. YOUR GRID (20x20): What you drew in your previous iteration\n';
                    memoryContext += '2. GLOBAL CANVAS: The complete collaborative canvas with all agents\n';
                }
            } catch (_) {
                // Fallback robuste
                memoryContext = '\n\n--- YOUR MEMORY ---\n';
                if (this.lastIntention) {
                    memoryContext += `Previous intention: "${this.lastIntention}"\n`;
                }
                memoryContext += 'You will see two images:\n';
                memoryContext += '1. YOUR GRID (20x20): What you drew in your previous iteration\n';
                memoryContext += '2. GLOBAL CANVAS: The complete collaborative canvas with all agents\n';
            }
        }
        
        // Construire le contexte de positionnement global (toujours injecté)
        let globalPositioningContext = '';
        if (this.promptsContent?.global_positioning) {
            const myPosition = this.myPosition || [0, 0];
            const myX = myPosition[0];
            const myY = myPosition[1];
            
            // Calculer la description de position
            let positionDescription = '';
            if (myX === 0 && myY === 0) {
                positionDescription = 'CENTER';
            } else if (myX === 0) {
                positionDescription = myY > 0 ? 'SOUTH' : 'NORTH';
            } else if (myY === 0) {
                positionDescription = myX > 0 ? 'EAST' : 'WEST';
            } else {
                if (myX > 0 && myY > 0) positionDescription = 'SOUTH-EAST';
                else if (myX > 0 && myY < 0) positionDescription = 'NORTH-EAST';
                else if (myX < 0 && myY > 0) positionDescription = 'SOUTH-WEST';
                else if (myX < 0 && myY < 0) positionDescription = 'NORTH-WEST';
            }
            
            const positioningTemplate = this.promptsContent.global_positioning.join('\n');
            const randomColors = this.generateRandomColors(8);
            const renderedPositioning = positioningTemplate
                .replaceAll('{{myX}}', myX)
                .replaceAll('{{myY}}', myY)
                .replaceAll('{{positionDescription}}', positionDescription)
                .replaceAll('{{color1}}', randomColors[0])
                .replaceAll('{{color2}}', randomColors[1])
                .replaceAll('{{color3}}', randomColors[2])
                .replaceAll('{{color4}}', randomColors[3])
                .replaceAll('{{color5}}', randomColors[4])
                .replaceAll('{{color6}}', randomColors[5])
                .replaceAll('{{color7}}', randomColors[6])
                .replaceAll('{{color8}}', randomColors[7]);
            
            globalPositioningContext = '\n\n' + renderedPositioning;
        }

        // Récupérer ma stratégie précédente pour maintenir la cohérence
        const myLastStrategy = this.otherUsers[this.myUserId]?.lastStrategy || null;
        
        // Récupérer mes propres pixels récents pour feedback visuel
        const myRecentUpdates = this.otherUsers[this.myUserId]?.recentUpdates || [];
        
        // Générer les couleurs aléatoires pour tous les prompts (12 pour avoir de la marge)
        const randomColors = this.generateRandomColors(12);
        
        // Construire le prompt : soit exercice d'entraînement, soit manuel/prompt normal
        let systemPrompt;
        if (this.isFirstLlmRequest && this.manualContent && this.currentAdapter.buildManualAnalysisPrompt) {
            systemPrompt = this.currentAdapter.buildManualAnalysisPrompt(this.manualContent);
        } else {
            // Injecter un prompt d'entraînement si activé
            const isTrainingActive = this.elements.trainingEnabled && this.elements.trainingEnabled.checked;
            if (isTrainingActive) {
                this.currentExercise = this.elements.trainingEx?.value || this.currentExercise;
                this.addJournalEntry(`🎓 Exercice actuel: ${this.currentExercise || '(non défini)'}`);
                
                // En mode training, utiliser le prompt training comme système principal
                const trainingPrompt = this.buildTrainingPrompt();
                if (trainingPrompt) {
                    try { this.currentAdapter.complexityThresholdWords = parseInt(this.elements.complexityThreshold?.value) || 50; } catch (_) {}
                    systemPrompt = await this.currentAdapter.buildSystemPrompt(
                        analysis, 
                        trainingPrompt,  // Utiliser le prompt training comme customPrompt
                        this.isFirstLlmRequest, 
                        this.manualContent, 
                        this.iterationCount,
                        myLastStrategy,
                        myRecentUpdates,
                        this.myPosition,
                        randomColors,
                        this.lastLocalDescription,
                        this.lastGlobalDescription
                    );
                    
                    // Forcer le mode training strict avec le prompt spécifique
                    if (systemPrompt && typeof systemPrompt === 'object') {
                        systemPrompt.systemMessage = trainingPrompt;  // Utiliser le prompt training spécifique
                        systemPrompt.needsImage = false;
                        systemPrompt.useGlobalCanvas = false;
                    }
                } else {
                    // Fallback si pas de prompt training
                    systemPrompt = await this.currentAdapter.buildSystemPrompt(
            analysis, 
            customPrompt, 
            this.isFirstLlmRequest, 
            this.manualContent, 
                        this.iterationCount,
                        myLastStrategy,
                        myRecentUpdates,
                        this.myPosition,
                        randomColors,
                        this.lastLocalDescription,
                        this.lastGlobalDescription
                    );
                    
                    if (systemPrompt && typeof systemPrompt === 'object') {
                        systemPrompt.systemMessage = 'TRAINING MODE: Output ONLY pixels in format x,y:#HEX';
                        systemPrompt.needsImage = false;
                        systemPrompt.useGlobalCanvas = false;
                    }
                }
            } else {
                // Mode libre (pas de training)
                try { this.currentAdapter.complexityThresholdWords = parseInt(this.elements.complexityThreshold?.value) || 50; } catch (_) {}
                try { this.currentAdapter.complexityThresholdWords = parseInt(this.elements.complexityThreshold?.value) || 50; } catch (_) {}
                systemPrompt = await this.currentAdapter.buildSystemPrompt(
                    analysis, 
                    customPrompt, 
                    this.isFirstLlmRequest, 
                    this.manualContent, 
                    this.iterationCount,
                    myLastStrategy,
                    myRecentUpdates,
                    this.myPosition,
                    randomColors,
                    this.lastLocalDescription,
                    this.lastGlobalDescription
                );
                
                // Note: La concaténation des prompts (memory_context + global_positioning + continuation_system) 
                // est maintenant gérée directement dans llava.js pour garantir l'ordre correct
            }

            // Gestion des images selon le mode
            try {
                const isTraining = this.elements.trainingEnabled && this.elements.trainingEnabled.checked;
                const isFreeMode = !isTraining; // Mode libre = pas de training
                const exCode = this.elements.trainingEx?.value || '';
                
                if (isFreeMode && systemPrompt && typeof systemPrompt === 'object') {
                    // En mode libre, TOUJOURS envoyer les images (y compris pour seed_system à iter 0!)
                    // LLaVA doit voir la grille initiale pour proposer une simplification
                    systemPrompt.needsImage = true;
                    systemPrompt.useGlobalCanvas = true;
                    const isFirstIteration = this.iterationCount <= 1;
                    console.log(`[AI Player] Mode libre : envoi images activé (${isFirstIteration ? 'seed_system' : 'continuation'})`);
                } else if (isTraining) {
                    // Ne jamais envoyer d'image si entraînement activé et (exercice A, ou ex inconnu)
                    // SAUF pour A5 qui doit voir ce qui a été fait en A4
                    if ((exCode === '' || /^A/.test(exCode)) && exCode !== 'A5' && systemPrompt && typeof systemPrompt === 'object') {
                        systemPrompt.needsImage = false;
                        systemPrompt.useGlobalCanvas = false;
                    }
                    // Pour A5, permettre l'image globale pour voir A4
                    if (exCode === 'A5' && systemPrompt && typeof systemPrompt === 'object') {
                        systemPrompt.needsImage = true;
                        systemPrompt.useGlobalCanvas = true;
                    }
                }
            } catch (_) {}
        }

        this.setLlmStatus('Actif', 'running');

        try {
            // V2 : DÉSACTIVÉ - Pas de grille initiale colorée, fond noir uniquement
            // LLaVA doit voir clairement ce qu'il dessine sur fond noir
            const isV2 = this.currentAdapter && this.currentAdapter.name && 
                         typeof this.currentAdapter.name === 'string' &&
                         this.currentAdapter.name.includes('V2');
            
            // COMMENTÉ: Génération de la grille aléatoire initiale
            /*
            if (isV2 && this.iterationCount === 0 && !this.initialGeneratedState && this.myUserId) {
                console.log('[AI Player] Génération grille initiale 400 pixels AVANT capture images');
                const colors = ColorGenerator.generateInitialColors(this.myUserId);
                this.initialGeneratedState = {};
                
                for (let i = 0; i < 400; i++) {
                    const x = i % 20;
                    const y = Math.floor(i / 20);
                    this.initialGeneratedState[`${x},${y}`] = colors[i];
                }
                console.log('[AI Player] ✅ Grille initiale générée:', Object.keys(this.initialGeneratedState).length, 'pixels');
            }
            */
            console.log('[AI Player] Mode V2: Fond noir (pas de grille initiale colorée)');
            
            // Capturer l'image locale AVANT de générer les images pour LLaVA
            this.captureLocalCanvas();
            
            // Pour LLaVA: générer les images (locale et/ou globale selon config)
            let imageBase64 = null;
            const images = []; // Tableau pour multi-images
            
            if (systemPrompt && systemPrompt.needsImage) {
                // Image 1 : Grille locale (si disponible)
                if (this.lastLocalCanvasBase64 && this.lastLocalCanvasBase64.length > 100) {
                    images.push(this.lastLocalCanvasBase64);
                    console.log('[AI Player] Ajout image locale');
                    // console.log('[AI Player] Image locale Base64:', this.lastLocalCanvasBase64.substring(0, 50) + '...');
                    // console.log('[AI Player] Image locale taille:', this.lastLocalCanvasBase64.length, 'caractères');
                } else if (this.lastLocalCanvasBase64) {
                    console.warn('[AI Player] ⚠️ Image locale trop petite ou vide:', this.lastLocalCanvasBase64.length, 'caractères');
                } else {
                    console.warn('[AI Player] ⚠️ Aucune image locale disponible');
                }
                
                // Image 2 : Canvas global (si configuré)
                if (systemPrompt.useGlobalCanvas) {
                    // VISION GLOBALE: Canvas complet avec toutes les grilles (côté client)
                    console.log('[AI Player] Generation canvas global pour LLaVA (client-side)...');
                    
                    // S'assurer que nos propres pixels sont dans otherUsers
                    if (!this.otherUsers[this.myUserId]) {
                        this.otherUsers[this.myUserId] = {
                            pixels: {},
                            recentUpdates: [],
                            lastStrategy: null,
                            position: this.myPosition || [0, 0]
                        };
                    }
                    
                    // Copier myCellState dans otherUsers[myUserId].pixels
                    this.otherUsers[this.myUserId].pixels = { ...this.myCellState };
                    this.otherUsers[this.myUserId].position = this.myPosition || [0, 0];
                    
                    console.log('[AI Player] Mes pixels: ' + Object.keys(this.myCellState).length + ' dans myCellState');
                    
                    // Générer canvas global en utilisant captureGlobalCanvas() qui fusionne initialGeneratedState
                    await this.captureGlobalCanvas();
                    
                    console.log('[AI Player] 🔍 Debug génération canvas global:');
                    console.log('  - otherUsers keys:', Object.keys(this.otherUsers));
                    console.log('  - myUserId:', this.myUserId);
                    console.log('  - myPosition:', this.myPosition);
                    
                    if (this.lastGlobalCanvasBase64 && this.lastGlobalCanvasBase64.length > 100) {
                        console.log('[AI Player] Canvas global genere (client):');
                        console.log('  - Pure canvas: ' + this.lastGlobalCanvasBase64.length + ' chars');
                        console.log('[AI Player] Image globale Base64:', this.lastGlobalCanvasBase64.substring(0, 50) + '...');
                        
                        images.push(this.lastGlobalCanvasBase64);
                        console.log('[AI Player] Ajout image globale');
                    } else if (this.lastGlobalCanvasBase64) {
                        console.warn('[AI Player] ⚠️ Canvas global trop petit:', this.lastGlobalCanvasBase64.length, 'caractères');
                    } else {
                        console.warn('[AI Player] ⚠️ Canvas global non généré ou vide!');
                    }
                } else {
                    // VISION LOCALE: Uniquement ma grille 20×20
                    if (myRecentUpdates && myRecentUpdates.length > 0) {
                        console.log('[AI Player] Generation image locale pour LLaVA...');
                        const localImage = await this.currentAdapter.gridToImage(myRecentUpdates);
                        if (localImage) {
                            images.push(localImage);
                            console.log('[AI Player] Image locale generee: ' + localImage.length + ' chars');
                        }
                    }
                }
                
                // Si on a des images multiples, les passer comme tableau
                if (images.length > 0) {
                    // WORKAROUND: Ollama/LLaVA ne supporte qu'une seule image
                    // On prend la dernière (globale si disponible, sinon locale)
                    imageBase64 = images[images.length - 1];
                    console.log('[AI Player] 📸 Image envoyée à LLaVA:', images.length > 1 ? `dernière de ${images.length}` : '1 seule');
                    console.log(`[AI Player] Image: ${imageBase64.length} chars, début: ${imageBase64.substring(0, 30)}...`);
                    
                    // Afficher les échantillons d'images dans l'interface
                    this.displayImageSamples(images);
                } else {
                    console.warn('[AI Player] ⚠️ Aucune image à envoyer à LLaVA!');
                }
            }
            
            // Pour Ollama/LLaVA: systemPrompt est un objet {systemMessage, userMessage}
            // Pour les autres: systemPrompt est une string
            let response;
            if (systemPrompt && typeof systemPrompt === 'object' && systemPrompt.systemMessage) {
                // LLaVA avec image
                // console.log('[AI Player] 🚀 Appel à callAPI avec LLaVA...');
                // console.log('[AI Player] SystemMessage length:', systemPrompt.systemMessage.length);
                // console.log('[AI Player] UserMessage length:', systemPrompt.userMessage.length);
                // console.log('[AI Player] ImageBase64 length:', imageBase64 ? imageBase64.length : 'null');
                response = await this.currentAdapter.callAPI(apiKey, systemPrompt.systemMessage, systemPrompt.userMessage, imageBase64);
            } else {
                // Autres adapters
                response = await this.currentAdapter.callAPI(apiKey, systemPrompt);
            }
            this.setLlmStatus('En attente', 'paused');

            // Mettre à jour les compteurs de tokens (si disponible)
            if (response && response.usage) {
            this.updateTokenCounters(response.usage);
            }

            // Pour LLaVA, response est une string directe
            // Pour Gemini V2/V3, response est déjà un objet parsé {pixels, descriptions, usage}
            // Pour les autres adapters, response est un objet {content: ...}
            let parsed;
            let responseContent;
            if (this.currentAdapter.name === 'Gemini V2' || this.currentAdapter.name === 'Gemini V3') {
                // Gemini V2/V3 retourne déjà un objet parsé {pixels, descriptions, usage}
                // Pas besoin de parser à nouveau
                parsed = response;
                // Compact pixels array before stringifying for verbatim display
                const compactedResponse = { ...parsed };
                if (compactedResponse.pixels && Array.isArray(compactedResponse.pixels)) {
                    const pixelCount = compactedResponse.pixels.length;
                    compactedResponse.pixels = `[Array of ${pixelCount} pixels]`;
                }
                responseContent = JSON.stringify(compactedResponse, null, 2);
            } else {
                responseContent = typeof response === 'string' ? response : (response.content || response);
                parsed = this.currentAdapter.parseResponse(responseContent);
            }
            
            // Extraire les descriptions (V2 only)
            if (parsed && parsed.localDescription !== undefined) {
                console.log('[Simplicity] Description locale extraite:', parsed.localDescription.substring(0, 100));
                this.lastLocalDescription = parsed.localDescription;
            }
            if (parsed && parsed.globalDescription !== undefined) {
                console.log('[Simplicity] Description globale extraite:', parsed.globalDescription.substring(0, 100));
                this.lastGlobalDescription = parsed.globalDescription;
            }
            
            // Gérer le cas où LLaVA explique son intention mais ne génère pas de pixels
            if (parsed && parsed.error === 'NO_PIXELS_GENERATED' && parsed.hasIntention) {
                console.warn('[AI Player] LLaVA a expliqué son intention mais n\'a pas généré de pixels');
                this.addJournalEntry('⚠️ LLaVA a expliqué son intention mais n\'a pas généré de pixels. Demande de génération...', 'warning');
                
                // Demander à LLaVA de générer les pixels maintenant
                const pixelRequest = `You explained your intention but didn't generate the pixels command. Please generate the pixels now based on your intention: ${parsed.q5_my_intention || 'your previous intention'}. Use the format: pixels: x,y#HEX x,y#HEX ...`;
                
                const pixelResponse = await this.currentAdapter.callAPI(apiKey, pixelRequest, '', imageBase64);
                const pixelParsed = this.currentAdapter.parseResponse(pixelResponse.content);
                
                if (pixelParsed && pixelParsed.pixels && pixelParsed.pixels.length > 0) {
                    this.addJournalEntry(`✅ Pixels générés après demande: ${pixelParsed.pixels.length} pixels`, 'success');
                    return pixelParsed;
                } else {
                    this.addJournalEntry('❌ Échec de génération des pixels après demande', 'error');
                    return { strategy: 'retry', pixels: [] };
                }
            }
            
            // Accepter le nombre de pixels généré par LLaVA (suppression de la vérification forcée)
            if (parsed && parsed.pixels) {
                console.log(`[AI Player] LLaVA a généré ${parsed.pixels.length} pixels`);
                if (parsed.pixels.length < 200) {
                    this.addJournalEntry(`📝 LLaVA a généré ${parsed.pixels.length} pixels (peut être amélioré dans la prochaine itération)`, 'info');
                } else {
                    this.addJournalEntry(`✅ LLaVA a généré ${parsed.pixels.length} pixels (excellent!)`, 'success');
                }
                
                // Store filtered response (Tab 2: Monitoring)
                this.storeFilteredResponse(parsed, parsed.pixels.length);
            }
            
            // Store verbatim response (Tab 3: Verbatim)
            this.storeVerbatimResponse(responseContent);
            
            // Convert Gemini pixel strings to objects if needed (BEFORE metrics calculation)
            // This MUST happen BEFORE any other processing to ensure parsed.pixels is ready
            if (parsed && parsed.pixels && Array.isArray(parsed.pixels)) {
                if (parsed.pixels.length > 0 && typeof parsed.pixels[0] === 'string') {
                    // Convert "x,y#HEX" strings to {x, y, color} objects
                    parsed.pixels = parsed.pixels.map(pixelStr => {
                        if (typeof pixelStr === 'string' && pixelStr.includes('#') && pixelStr.includes(',')) {
                            const [coords, color] = pixelStr.split('#');
                            const [x, y] = coords.split(',');
                            return {
                                x: parseInt(x, 10),
                                y: parseInt(y, 10),
                                color: `#${color}`
                            };
                        }
                        return pixelStr; // Already an object
                    });
                }
            }
            
            // Update Simplicity Theory Metrics (Tab 2: Monitoring) for Gemini V3
            console.log('[AI Player V3] 🔍 Checking metrics update:', {
                adapterName: this.currentAdapter?.name,
                adapterNameType: typeof this.currentAdapter?.name,
                hasParsed: !!parsed,
                parsedKeys: parsed ? Object.keys(parsed) : [],
                hasSimplicityAssessment: parsed?.simplicity_assessment ? 'YES' : 'NO',
                iteration: this.iterationCount
            });
            
            if (this.currentAdapter && this.currentAdapter.name === 'Gemini V3' && parsed) {
                console.log('[AI Player V3] ✅ Condition met - processing simplicity_assessment');
                try {
                    console.log('[AI Player V3] Extracting simplicity_assessment from parsed:', parsed);
                    // Extract direct simplicity assessment from agent response
                    const assessment = this.currentAdapter.extractSimplicityAssessment(parsed);
                    console.log('[AI Player V3] Assessment extracted:', assessment);
                    
                    if (assessment) {
                        // Filter zero values: only send if at least one value is non-zero
                        const hasValidValues = assessment.C_w > 0 || assessment.C_d > 0 || assessment.U !== 0;
                        
                        if (hasValidValues) {
                            // Send to metrics server V3 (only non-zero values)
                            this.sendSimplicityAssessmentUpdate(assessment.C_w, assessment.C_d, assessment.U);
                            
                            // Update local display with extracted values
                            this.updateLocalSimplicityDisplay(assessment);
                        } else {
                            // All values are zero - skip this update but interpolate previous values
                            console.log('[AI Player V3] All values are zero, skipping update but interpolating');
                            this.interpolateAndUpdateDisplay();
                        }
                    } else {
                        // Iteration 1 (seed) - no assessment yet
                        console.log('[AI Player V3] Iteration 1: no simplicity_assessment (seed phase)');
                        this.interpolateAndUpdateDisplay(); // Interpolate instead of showing zeros
                    }
                } catch (error) {
                    console.error('[AI Player V3] ❌ Error extracting simplicity assessment:', error);
                    console.error('[AI Player V3] Error stack:', error.stack);
                    // Continue even if metrics fail
                }
            } else {
                console.log('[AI Player V3] Skipping metrics update - adapter:', this.currentAdapter?.name, 'parsed:', !!parsed);
            }
            
            // Update LLaVA images display (Tab 5: Debug)
            const colorPalette = this.generateColorPalette();
            this.updateLlavaImages(this.lastLocalCanvasBase64, this.lastGlobalCanvasBase64, colorPalette);
            
            // Validation stricte si entraînement activé
            if (!this.validateTrainingOutput(parsed)) {
                this.addJournalEntry('⚠️ Sortie invalide pour l\'exercice en cours. Nouvelle tentative dans 3s...', 'error');
                await new Promise(r => setTimeout(r, 3000));
                return { strategy: 'retry training', pixels: [] };
            }
            
            // Capturer le contexte de mémoire après succès
            if (parsed.q5_my_intention) {
                this.lastIntention = parsed.q5_my_intention;
            }
            
            // Capturer l'image locale (grille 20x20 de l'agent)
            this.captureLocalCanvas();
            
            // Capturer l'image globale
            await this.captureGlobalCanvas();
            
            // Succès d'entraînement: avancer à l'exercice suivant si activé
            this.maybeAdvanceTrainingOnSuccess();
            this.consecutiveErrors = 0;

            if (this.isFirstLlmRequest) {
                this.isFirstLlmRequest = false;
                const modelName = this.elements.llmModelSelect.value.toUpperCase();
                this.addJournalEntry(`📖 Agent ${modelName} initialisé avec manuel`, 'success');
            }

            // Afficher les hypothèses et le raisonnement
            this.displayReasoning(parsed);

            // Envoyer les données au serveur Analytics
            this.sendToAnalytics(parsed, analysis);

            console.log('[AI Player] 🔍 askLLM retourne:', parsed);
            return parsed;

        } catch (error) {
            this.setLlmStatus('Inactif', 'disconnected');
            throw error;
        }
    }

    // Avance automatiquement à l'exercice suivant en cas de succès
    maybeAdvanceTrainingOnSuccess() {
        try {
            if (!this.elements.trainingEnabled || !this.elements.trainingEnabled.checked) return;
            const sel = this.elements.trainingEx;
            if (!sel) return;
            const current = sel.value;
            const idx = this.trainingOrder.indexOf(current);
            if (idx === -1) return;
            // Si validation manuelle requise, afficher les boutons et attendre l'action utilisateur
            if (this.isManualValidationRequired(current)) {
                this.showTrainingValidationUI(true);
                this.addJournalEntry(`🕒 En attente de validation pour ${current}`, '');
                return;
            }
            // Sinon, avancer automatiquement
            this.advanceToNextTraining(current);
        } catch (_) {}
    }

    isManualValidationRequired(ex) {
        // Par défaut: A1/A2/A3 validation auto, les autres manuelle
        return !['A1','A2','A3'].includes(ex);
    }

    advanceToNextTraining(current) {
        console.log(`🔍 [DEBUG] advanceToNextTraining called with current="${current}"`);
        const sel = this.elements.trainingEx;
        console.log(`🔍 [DEBUG] trainingEx element:`, sel);
        const idx = this.trainingOrder.indexOf(current);
        console.log(`🔍 [DEBUG] current index in trainingOrder: ${idx}`);
        if (idx === -1) {
            console.log(`🔍 [DEBUG] current not found in trainingOrder, returning`);
            return;
        }
        if (idx < this.trainingOrder.length - 1) {
            const next = this.trainingOrder[idx + 1];
            console.log(`🔍 [DEBUG] advancing from ${current} to ${next}`);
            sel.value = next;
            console.log(`🔍 [DEBUG] sel.value set to:`, sel.value);
            this.addJournalEntry(`✅ Exercice ${current} validé → passage à ${next}`, 'success');
        } else {
            console.log(`🔍 [DEBUG] reached end of trainingOrder`);
            this.addJournalEntry(`🏁 Programme d'entraînement terminé (dernier: ${current})`, 'success');
        }
    }

    async executePixels(instructions) {
        console.log('[AI Player] 🎨 executePixels appelé, instructions:', instructions);
        console.log('[AI Player] 🔍 instructions.pixels type:', typeof instructions.pixels, 'length:', instructions.pixels?.length);
        console.log('[AI Player] 🔍 instructions.pixels contenu:', instructions.pixels?.slice(0, 3));
        let pixels = [];
        
        if (Array.isArray(instructions.pixels) && instructions.pixels.length > 0) {
            console.log('[AI Player] 📦 Pixels reçus:', instructions.pixels.length);
            console.log('[AI Player] 🔍 Premier pixel:', instructions.pixels[0], 'Type:', typeof instructions.pixels[0]);
            // Convertir les strings "x,y#HEX" en objets {x, y, color}
            pixels = instructions.pixels.map(pixelStr => {
                if (typeof pixelStr === 'string' && pixelStr.includes('#') && pixelStr.includes(',')) {
                    const [coords, color] = pixelStr.split('#');
                    const [x, y] = coords.split(',');
                    return {
                        x: parseInt(x, 10),
                        y: parseInt(y, 10),
                        color: `#${color}`
                    };
                }
                return pixelStr; // Déjà un objet
            });
            console.log('[AI Player] ✅ Pixels après conversion:', pixels.slice(0, 3));
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

        // Post-traitement: clamp + déduplication + éviter redessins identiques
        pixels = pixels.map(p => ({
            x: Math.max(0, Math.min(19, p.x)),
            y: Math.max(0, Math.min(19, p.y)),
            color: p.color
        }));
        // Déduplication: dernier gagne
        const coordToPixel = new Map();
        for (const p of pixels) {
            coordToPixel.set(`${p.x},${p.y}`, p);
        }
        // Filtrer les pixels identiques à l'état actuel
        const filtered = [];
        let filteredCount = 0;
        coordToPixel.forEach((p, key) => {
            const existing = this.myCellState[key];
            
            
            // Normaliser les couleurs pour la comparaison (#FFF vs #FFFFFF)
            const normalizedExisting = existing && existing.length === 4 ? 
                `#${existing[1]}${existing[1]}${existing[2]}${existing[2]}${existing[3]}${existing[3]}` : existing;
            const normalizedNew = p.color && p.color.length === 4 ? 
                `#${p.color[1]}${p.color[1]}${p.color[2]}${p.color[2]}${p.color[3]}${p.color[3]}` : p.color;
            
            // Filtrer les pixels déjà dessinés avec la même couleur
            if (normalizedExisting && typeof normalizedExisting === 'string' && 
                normalizedExisting.toLowerCase() === normalizedNew.toLowerCase()) {
                filteredCount++;
            } else {
                filtered.push(p);
            }
        });
        
        if (filteredCount > 0) {
            console.log(`[AI Player] ❌ ${filteredCount} pixels filtrés (déjà dessinés avec la même couleur)`);
        }
        
        pixels = filtered;
        
        console.log(`[AI Player] 📊 Après filtrage: ${pixels.length} pixels à dessiner`);
        
        if (pixels.length === 0) {
            console.log('[AI Player] ⚠️ AUCUN PIXEL À DESSINER! Tous les pixels ont été filtrés!');
        }

        // Limiter le nombre de pixels pour éviter la surcharge
        // Pour Gemini, on autorise jusqu'à 400 pixels comme demandé dans le prompt
        const maxPixelsPerIteration = 400;
        if (pixels.length > maxPixelsPerIteration) {
            console.log(`⚠️ [AI Player] Trop de pixels (${pixels.length}), limitation à ${maxPixelsPerIteration}`);
            pixels.splice(maxPixelsPerIteration);
        }

        // NOUVEAU: Envoi progressif "au compte-gouttes"
        const delayAfterMs = (parseInt(this.elements.interval.value) || 0) * 1000;
        const pixelCount = pixels.length;
        
        if (pixelCount === 0) {
            console.log('[AI Player] ⚠️ Aucun pixel à dessiner après filtrage');
            return 0;
        }
        
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
        
        // Nettoyer les timeouts précédents avant d'en créer de nouveaux
        this.cancelPendingPixels();
        
        // Envoyer les pixels progressivement
        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i];
            
            // Envoyer avec délai progressif
            const timeoutId = setTimeout(() => {
                // Retirer de la liste des timeouts en cours
                const index = this.pendingPixelTimeouts.indexOf(timeoutId);
                if (index > -1) {
                    this.pendingPixelTimeouts.splice(index, 1);
                }
                
                // Vérifications multiples pour arrêter proprement
                if (!this.isRunning || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    console.log(`[AI Player] ⏹️ Pixel envoyé annulé (i=${i}, isRunning=${this.isRunning})`);
                    return;
                }
                
                if (pixel.x >= 0 && pixel.x < 20 && pixel.y >= 0 && pixel.y < 20) {
                    this.sendCellUpdate(pixel.x, pixel.y, pixel.color);
                    const key = `${pixel.x},${pixel.y}`;
                    this.myCellState[key] = pixel.color;
                    this.myPixelCount = Object.keys(this.myCellState).length;
                }
            }, i * delayPerPixel);
            
            // Ajouter à la liste des timeouts en cours
            this.pendingPixelTimeouts.push(timeoutId);
        }

        return pixels.length;
    }

    // === Memory capture methods ===
    captureLocalCanvas() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // À l'itération 0 (V2), utiliser la grille initiale générée
            const isV2 = this.currentAdapter && this.currentAdapter.name && 
                         typeof this.currentAdapter.name === 'string' &&
                         this.currentAdapter.name.includes('V2');
            
            if (isV2 && this.initialGeneratedState) {
                console.log('[AI Player] Capture canvas local: grille initiale (fond) + pixels dessinés');
                // V2 : toujours fusionner initialGeneratedState (fond) + myCellState (pixels dessinés)
                for (let y = 0; y < 20; y++) {
                    for (let x = 0; x < 20; x++) {
                        // Utiliser myCellState si existe, sinon initialGeneratedState
                        const color = this.myCellState[`${x},${y}`] || this.initialGeneratedState[`${x},${y}`] || '#000000';
                        ctx.fillStyle = color;
                        ctx.fillRect(x * 10, y * 10, 10, 10);
                    }
                }
            } else {
                // V1 : Dessiner la grille 20x20 de l'agent (myCellState)
                for (let y = 0; y < 20; y++) {
                    for (let x = 0; x < 20; x++) {
                        const color = this.myCellState[`${x},${y}`] || '#000000';
                        ctx.fillStyle = color;
                        ctx.fillRect(x * 10, y * 10, 10, 10);
                    }
                }
            }
            
            // Extraire seulement les données base64 pures (sans le préfixe data:image/png;base64,)
            const dataURL = canvas.toDataURL('image/png');
            this.lastLocalCanvasBase64 = dataURL.split(',')[1]; // Enlever le préfixe
            // console.log('[AI Player] Canvas local capturé');
        } catch (e) {
            console.error('[AI Player] Erreur capture canvas local:', e);
        }
    }

    generateColorPalette() {
        try {
            // Détecter si on utilise LLaVA V2 (Grid Format)
            const isV2 = this.currentAdapter && this.currentAdapter.name && 
                         typeof this.currentAdapter.name === 'string' &&
                         this.currentAdapter.name.includes('V2');
            
            if (isV2) {
                // Itération 0 : retourner la grille initiale (déjà générée dans askLLM)
                if (this.iterationCount === 0) {
                    if (!this.initialGeneratedState) {
                        console.warn('[AI Player] ⚠️ initialGeneratedState non disponible pour palette V2 seed!');
                        return 'Grid not yet initialized';
                    }
                    
                    // Retourner tous les 400 pixels au format x,y#HEX
                    const allPixels = [];
                    for (let y = 0; y < 20; y++) {
                        for (let x = 0; x < 20; x++) {
                            const color = this.initialGeneratedState[`${x},${y}`] || '#000000';
                            // Format: x,y#HEX (enlever le # du début et ajouter un # entre coordonnées et couleur)
                            const hexColor = color.startsWith('#') ? color.substring(1) : color;
                            allPixels.push(`${x},${y}#${hexColor}`);
                        }
                    }
                    console.log(`[AI Player] Palette V2 seed: 400 pixels générés, exemple: ${allPixels[0]}, ${allPixels[1]}, ${allPixels[2]}`);
                    return allPixels.join(' ');
                }
                
                // Itération ≥1 : montrer seulement les pixels modifiés (non-noirs) pour économiser des tokens
                const drawnPixels = [];
                for (let y = 0; y < 20; y++) {
                    for (let x = 0; x < 20; x++) {
                        const color = this.myCellState[`${x},${y}`];
                        // Ne garder que les pixels non-noirs (dessinés)
                        if (color && color !== '#000000' && color.toLowerCase() !== '#000000') {
                            drawnPixels.push(`${x},${y}${color}`);
                        }
                    }
                }
                
                if (drawnPixels.length === 0) {
                    // console.log('[AI Player] Palette V2 vide (aucun pixel dessiné)');
                    return 'Grid is currently empty (all pixels are black #000000)';
                } else {
                    // console.log(`[AI Player] Palette V2 générée: ${drawnPixels.length} pixels dessinés`);
                    return `Current drawn pixels (${drawnPixels.length} total):\n${drawnPixels.join(' ')}`;
                }
            } else {
                // Format V1 : tableau avec en-tête
                let palette = '';
                
                // En-tête avec numéros de colonnes (parfaitement aligné)
                palette += '         1     2     3     4     5     6     7     8     9    10    11    12    13    14    15    16    17    18    19    20\n';
                
                // Générer chaque ligne
                for (let y = 0; y < 20; y++) {
                    const rowNum = (y + 1).toString().padStart(2);
                    palette += `${rowNum}   `;
                    
                    for (let x = 0; x < 20; x++) {
                        const color = this.myCellState[`${x},${y}`] || '#000000';
                        palette += `${color} `;
                    }
                    palette += '\n';
                }
                
                console.log('[AI Player] Palette V1 (Table Format) générée');
                return palette;
            }
        } catch (e) {
            console.error('[AI Player] Erreur génération palette:', e);
            return 'Palette non disponible';
        }
    }

    generateRandomColors(count = 8) {
        const colors = [];
        const avoidColors = ['#0000FF', '#0000ff', '#FF0000', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF']; // Couleurs communes à éviter
        
        for (let i = 0; i < count; i++) {
            let hex;
            let attempts = 0;
            
            do {
                // Générer des couleurs vives et variées (éviter le noir et les couleurs trop sombres)
                const r = Math.floor(Math.random() * 200) + 55; // 55-255 (éviter trop sombre)
                const g = Math.floor(Math.random() * 200) + 55;
                const b = Math.floor(Math.random() * 200) + 55;
                hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
                attempts++;
            } while (avoidColors.includes(hex) && attempts < 10);
            
            colors.push(hex);
        }
        return colors;
    }

    async captureGlobalCanvas() {
        try {
            // V2 : fusionner initialGeneratedState comme fond + pixels dessinés par-dessus
            const isV2 = this.currentAdapter && this.currentAdapter.name && 
                         typeof this.currentAdapter.name === 'string' &&
                         this.currentAdapter.name.includes('V2');
            
            if (isV2 && this.initialGeneratedState) {
                console.log('[AI Player] Canvas global: fusion grille initiale (fond) + pixels dessinés pour TOUS les agents');
                // Créer une copie temporaire de otherUsers avec grille initiale + pixels dessinés
                const otherUsersWithFull = JSON.parse(JSON.stringify(this.otherUsers));
                
                // Pour CHAQUE agent, générer sa grille initiale et fusionner avec ses pixels dessinés
                for (const [userId, userData] of Object.entries(otherUsersWithFull)) {
                    // Générer la grille initiale de cet agent (basée sur son userId)
                    const agentInitialColors = ColorGenerator.generateInitialColors(userId);
                    const agentInitialState = {};
                    
                    for (let i = 0; i < 400; i++) {
                        const x = i % 20;
                        const y = Math.floor(i / 20);
                        agentInitialState[`${x},${y}`] = agentInitialColors[i];
                    }
                    
                    // Fusion: grille initiale (fond) + pixels dessinés (premier plan)
                    userData.pixels = {
                        ...agentInitialState,
                        ...(userData.pixels || {}) // Écrase avec les pixels dessinés
                    };
                }
                
                const result = LlavaCanvasGenerator.generateGlobalCanvas(otherUsersWithFull, this.myUserId);
                this.lastGlobalCanvasBase64 = result.pureCanvas;
            } else {
                // Utiliser directement LlavaCanvasGenerator au lieu de this.currentAdapter
                const result = LlavaCanvasGenerator.generateGlobalCanvas(this.otherUsers, this.myUserId);
                this.lastGlobalCanvasBase64 = result.pureCanvas;
            }
            console.log('[AI Player] Canvas global capturé');
        } catch (e) {
            console.error('[AI Player] Erreur capture canvas global:', e);
        }
    }
    
    // === Simplicity Theory Metrics ===
    // V3: Send direct simplicity assessments from agent evaluations
    sendSimplicityAssessmentUpdate(C_w, C_d, U) {
        if (this.metricsSocket && this.metricsSocket.readyState === WebSocket.OPEN) {
            const position = this.myPosition || [0, 0];
            this.metricsSocket.send(JSON.stringify({
                type: 'simplicity_assessment_update',
                user_id: this.myUserId,
                position: position,
                C_w: C_w,
                C_d: C_d,
                U: U
            }));
            console.log(`[Simplicity V3] Évaluations envoyées au serveur V3: C_w=${C_w}, C_d=${C_d}, U=${U}`);
        }
    }
    
    connectToMetricsServer() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname;
        const metricsUrl = `${wsProtocol}//${wsHost}:5002/ws`;
        
        this.metricsSocket = new WebSocket(metricsUrl);
        
        this.metricsSocket.onopen = () => {
            console.log('[Simplicity V3] ✅ Connecté au serveur de métriques V3 (port 5002)');
        };
        
        this.metricsSocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'average_simplicity_metrics') {
                console.log('[Simplicity V3] Moyennes globales reçues:', message);
                this.updateGlobalSimplicityChart(message);
            }
        };
        
        this.metricsSocket.onerror = (error) => {
            console.warn('[Simplicity] Serveur de métriques non disponible (fonctionnalité optionnelle)');
        };
        
        this.metricsSocket.onclose = () => {
            console.log('[Simplicity] Déconnecté du serveur de métriques');
            // Tentative de reconnexion après 5 secondes
            setTimeout(() => this.connectToMetricsServer(), 5000);
        };
    }
    
    /**
     * Interpolate missing (zero) values using linear interpolation between valid points
     */
    interpolateValues(values) {
        if (values.length === 0) return values;
        
        const interpolated = [...values];
        let lastValidIndex = -1;
        let lastValidValue = null;
        
        // First pass: find valid values and interpolate forward
        for (let i = 0; i < interpolated.length; i++) {
            if (interpolated[i] > 0 || (interpolated[i] < 0 && interpolated[i] !== 0)) {
                // Valid value found
                if (lastValidIndex >= 0 && lastValidValue !== null) {
                    // Interpolate between lastValidIndex and i
                    const steps = i - lastValidIndex;
                    const stepValue = (interpolated[i] - lastValidValue) / steps;
                    for (let j = lastValidIndex + 1; j < i; j++) {
                        interpolated[j] = lastValidValue + stepValue * (j - lastValidIndex);
                    }
                }
                lastValidIndex = i;
                lastValidValue = interpolated[i];
            }
        }
        
        // Second pass: fill remaining zeros at the beginning if needed
        if (lastValidIndex >= 0 && lastValidValue !== null) {
            for (let i = 0; i < lastValidIndex; i++) {
                if (interpolated[i] === 0) {
                    interpolated[i] = lastValidValue; // Use first valid value
                }
            }
        }
        
        // Third pass: fill remaining zeros at the end if needed
        if (lastValidIndex >= 0 && lastValidValue !== null) {
            for (let i = lastValidIndex + 1; i < interpolated.length; i++) {
                if (interpolated[i] === 0) {
                    interpolated[i] = lastValidValue; // Extend last valid value
                }
            }
        }
        
        return interpolated;
    }
    
    /**
     * Update display with interpolated values when current assessment is invalid
     */
    interpolateAndUpdateDisplay() {
        if (!this.simplicityMetrics || !this.simplicityMetrics.iterations.length) {
            return; // No data to interpolate
        }
        
        // Add placeholder for current iteration (will be interpolated)
        this.simplicityMetrics.iterations.push(this.iterationCount);
        this.simplicityMetrics.C_w.push(0);
        this.simplicityMetrics.C_d.push(0);
        this.simplicityMetrics.U.push(0);
        
        // Interpolate all three metrics
        this.simplicityMetrics.C_w = this.interpolateValues(this.simplicityMetrics.C_w);
        this.simplicityMetrics.C_d = this.interpolateValues(this.simplicityMetrics.C_d);
        this.simplicityMetrics.U = this.interpolateValues(this.simplicityMetrics.U);
        
        // Get interpolated values for current iteration
        const lastIndex = this.simplicityMetrics.C_w.length - 1;
        const C_w = this.simplicityMetrics.C_w[lastIndex];
        const C_d = this.simplicityMetrics.C_d[lastIndex];
        const U = this.simplicityMetrics.U[lastIndex];
        
        // Update display
        const iterSpan = document.getElementById('local-iteration');
        const cwSpan = document.getElementById('local-cw');
        const cdSpan = document.getElementById('local-cd');
        const uSpan = document.getElementById('local-u');
        
        if (iterSpan) iterSpan.textContent = this.iterationCount;
        if (cwSpan) cwSpan.textContent = Math.round(C_w);
        if (cdSpan) cdSpan.textContent = Math.round(C_d);
        if (uSpan) uSpan.textContent = Math.round(U);
        
        // Redraw chart with interpolated values
        this.drawLocalSimplicityChart();
    }
    
    updateLocalSimplicityDisplay(assessment) {
        console.log('[Simplicity V3] Updating local display:', assessment);
        
        try {
            // Initialize if needed
            if (!this.simplicityMetrics) {
                this.simplicityMetrics = {
                    iterations: [],
                    C_w: [],
                    C_d: [],
                    U: []
                };
            }
            
            // Use extracted values directly (filter zeros: only store if valid)
            const C_w = assessment?.C_w ?? 0;
            const C_d = assessment?.C_d ?? 0;
            const U = assessment?.U ?? 0;
            
            // Store metrics data (including zeros, will be interpolated later if needed)
            this.simplicityMetrics.iterations.push(this.iterationCount);
            this.simplicityMetrics.C_w.push(C_w);
            this.simplicityMetrics.C_d.push(C_d);
            this.simplicityMetrics.U.push(U);
            
            // Interpolate any zeros in the data to smooth curves
            this.simplicityMetrics.C_w = this.interpolateValues(this.simplicityMetrics.C_w);
            this.simplicityMetrics.C_d = this.interpolateValues(this.simplicityMetrics.C_d);
            this.simplicityMetrics.U = this.interpolateValues(this.simplicityMetrics.U);
            
            // Get interpolated values for display (use last stored values after interpolation)
            const lastIndex = this.simplicityMetrics.C_w.length - 1;
            const display_C_w = this.simplicityMetrics.C_w[lastIndex];
            const display_C_d = this.simplicityMetrics.C_d[lastIndex];
            const display_U = this.simplicityMetrics.U[lastIndex];
            
            console.log('[Simplicity V3] Metrics stored, drawing chart...');
            
            // Update display values (using interpolated values for smooth display)
            const iterSpan = document.getElementById('local-iteration');
            const cwSpan = document.getElementById('local-cw');
            const cdSpan = document.getElementById('local-cd');
            const uSpan = document.getElementById('local-u');
            
            if (iterSpan) iterSpan.textContent = this.iterationCount;
            if (cwSpan) cwSpan.textContent = Math.round(display_C_w);
            if (cdSpan) cdSpan.textContent = Math.round(display_C_d);
            if (uSpan) uSpan.textContent = Math.round(display_U);
            
            // Update agent position in panel title
            if (this.myPosition) {
                const positionSpan = document.getElementById('agent-position');
                if (positionSpan) {
                    positionSpan.textContent = `${this.myPosition[0]},${this.myPosition[1]}`;
                }
            }
            
            // Redraw chart
            this.drawLocalSimplicityChart();
            console.log('[Simplicity V3] Chart drawn successfully');
        } catch (error) {
            console.error('[Simplicity V3] Error in updateLocalSimplicityDisplay:', error);
        }
    }
    
    drawLocalSimplicityChart() {
        const canvas = document.getElementById('simplicity-chart-local');
        if (!canvas) {
            console.warn('[Simplicity V3] Canvas local not found');
            return;
        }
        
        // Set explicit dimensions if not set
        if (!canvas.width || canvas.width === 0) {
            canvas.width = canvas.offsetWidth || 400;
        }
        if (!canvas.height || canvas.height === 0) {
            canvas.height = canvas.offsetHeight || 120;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        console.log('[Simplicity V3] Drawing chart, dimensions:', width, 'x', height, 'data points:', this.simplicityMetrics?.iterations?.length || 0);
        
        // Effacer
        ctx.clearRect(0, 0, width, height);
        
        const data = this.simplicityMetrics;
        if (!data || !data.iterations || data.iterations.length === 0) {
            console.log('[Simplicity V3] No data to draw');
            return;
        }
        
        console.log('[Simplicity V3] Data to draw:', {
            iterations: data.iterations.length,
            C_w: data.C_w,
            C_d: data.C_d,
            U: data.U
        });
        
        // Calculer échelles
        const allValues = [...data.C_w, ...data.C_d, ...data.U.map(u => Math.abs(u))];
        const maxY = Math.max(...allValues, 1); // At least 1 to avoid division by zero
        if (maxY === 0) {
            console.log('[Simplicity V3] MaxY is 0, cannot draw');
            return;
        }
        
        console.log('[Simplicity V3] MaxY for scale:', maxY);
        
        // Use actual number of iterations
        const numIterations = data.iterations.length;
        // Scale X so the last point reaches the right edge: if we have n points, we need n-1 intervals
        const scaleX = numIterations > 1 ? width / (numIterations - 1) : width;
        const scaleY = (height - 20) / maxY;
        
        console.log('[Simplicity V3] Chart scaling:', {
            width,
            numIterations,
            scaleX,
            scaleY,
            lastX: numIterations > 0 ? (numIterations - 1) * scaleX : 0
        });
        
        // Dessiner courbes
        this.drawCurve(ctx, data.iterations, data.C_w, scaleX, scaleY, height, '#4A90E2'); // Bleu
        this.drawCurve(ctx, data.iterations, data.C_d, scaleX, scaleY, height, '#E24A4A'); // Rouge
        this.drawCurve(ctx, data.iterations, data.U, scaleX, scaleY, height, '#4AE290');   // Vert
        
        // Ligne zéro pour U
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height - 10);
        ctx.lineTo(width, height - 10);
        ctx.stroke();
    }
    
    drawCurve(ctx, iterations, values, scaleX, scaleY, height, color) {
        if (values.length === 0) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < values.length; i++) {
            const x = i * scaleX;
            const y = height - 10 - (values[i] * scaleY);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    updateGlobalSimplicityChart(metrics) {
        console.log('[Simplicity V3] Mise à jour graphique global:', metrics);
        
        // Stocker les métriques globales (moyennes, filtrées des zéros côté serveur)
        if (!this.globalSimplicityMetrics) {
            this.globalSimplicityMetrics = {
                iterations: [],
                C_w: [],
                C_d: [],
                U: []
            };
        }
        
        // Only store non-zero averages (server already filtered zeros)
        if (metrics.avg_C_w > 0 || metrics.avg_C_d > 0 || metrics.avg_U !== 0) {
            this.globalSimplicityMetrics.iterations.push(metrics.iteration);
            this.globalSimplicityMetrics.C_w.push(metrics.avg_C_w);
            this.globalSimplicityMetrics.C_d.push(metrics.avg_C_d);
            this.globalSimplicityMetrics.U.push(metrics.avg_U);
            
            // Interpolate any zeros in global data for smooth curves
            if (this.globalSimplicityMetrics.iterations.length > 1) {
                this.globalSimplicityMetrics.C_w = this.interpolateValues(this.globalSimplicityMetrics.C_w);
                this.globalSimplicityMetrics.C_d = this.interpolateValues(this.globalSimplicityMetrics.C_d);
                this.globalSimplicityMetrics.U = this.interpolateValues(this.globalSimplicityMetrics.U);
            }
        } else {
            // All averages are zero - interpolate previous values
            if (this.globalSimplicityMetrics.iterations.length > 0) {
                const lastIteration = this.globalSimplicityMetrics.iterations[this.globalSimplicityMetrics.iterations.length - 1];
                this.globalSimplicityMetrics.iterations.push(metrics.iteration);
                this.globalSimplicityMetrics.C_w.push(this.globalSimplicityMetrics.C_w[this.globalSimplicityMetrics.C_w.length - 1] || 0);
                this.globalSimplicityMetrics.C_d.push(this.globalSimplicityMetrics.C_d[this.globalSimplicityMetrics.C_d.length - 1] || 0);
                this.globalSimplicityMetrics.U.push(this.globalSimplicityMetrics.U[this.globalSimplicityMetrics.U.length - 1] || 0);
                
                // Interpolate
                this.globalSimplicityMetrics.C_w = this.interpolateValues(this.globalSimplicityMetrics.C_w);
                this.globalSimplicityMetrics.C_d = this.interpolateValues(this.globalSimplicityMetrics.C_d);
                this.globalSimplicityMetrics.U = this.interpolateValues(this.globalSimplicityMetrics.U);
            }
        }
        
        // Dessiner le graphique global
        this.drawGlobalSimplicityChart();
        
        // Mettre à jour les valeurs affichées
        const agentsSpan = document.getElementById('global-agents');
        const cwSpan = document.getElementById('global-cw');
        const cdSpan = document.getElementById('global-cd');
        const uSpan = document.getElementById('global-u');
        
        if (agentsSpan) agentsSpan.textContent = metrics.agent_count;
        if (cwSpan) cwSpan.textContent = Math.round(metrics.avg_C_w);
        if (cdSpan) cdSpan.textContent = Math.round(metrics.avg_C_d);
        if (uSpan) uSpan.textContent = Math.round(metrics.avg_U);
    }
    
    drawGlobalSimplicityChart() {
        const canvas = document.getElementById('simplicity-chart-global');
        if (!canvas) {
            console.warn('[Simplicity V3] Canvas global not found');
            return;
        }
        
        // Set explicit dimensions if not set
        if (!canvas.width || canvas.width === 0) {
            canvas.width = canvas.offsetWidth || 400;
        }
        if (!canvas.height || canvas.height === 0) {
            canvas.height = canvas.offsetHeight || 120;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Effacer
        ctx.clearRect(0, 0, width, height);
        
        const data = this.globalSimplicityMetrics;
        if (!data || !data.iterations || data.iterations.length === 0) {
            console.log('[Simplicity V3] No global data to draw');
            return;
        }
        
        // Calculer échelles
        const allValues = [...data.C_w, ...data.C_d, ...data.U.map(u => Math.abs(u))];
        const maxY = Math.max(...allValues, 1); // At least 1 to avoid division by zero
        if (maxY === 0) return;
        
        // Use actual number of iterations
        const numIterations = data.iterations.length;
        // Scale X so the last point reaches the right edge: if we have n points, we need n-1 intervals
        const scaleX = numIterations > 1 ? width / (numIterations - 1) : width;
        const scaleY = (height - 20) / maxY;
        
        // Dessiner courbes
        this.drawCurve(ctx, data.iterations, data.C_w, scaleX, scaleY, height, '#4A90E2'); // Bleu
        this.drawCurve(ctx, data.iterations, data.C_d, scaleX, scaleY, height, '#E24A4A'); // Rouge
        this.drawCurve(ctx, data.iterations, data.U, scaleX, scaleY, height, '#4AE290');   // Vert
        
        // Ligne zéro pour U
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height - 10);
        ctx.lineTo(width, height - 10);
        ctx.stroke();
    }
    
    updateConsensusGauge(consensusScore) {
        // Sera implémenté dans le HTML avec la jauge
        console.log('[Simplicity] Consensus score:', (consensusScore * 100).toFixed(1) + '%');
        const gaugeBar = document.getElementById('consensus-bar');
        const gaugeValue = document.getElementById('consensus-value');
        if (gaugeBar) {
            gaugeBar.style.width = (consensusScore * 100) + '%';
        }
        if (gaugeValue) {
            gaugeValue.textContent = (consensusScore * 100).toFixed(0) + '%';
        }
    }

    // === Filtered and Verbatim Responses Management ===
    storeFilteredResponse(parsedData, pixelCount) {
        const container = document.getElementById('filtered-responses');
        if (!container) return;
        
        // Remove placeholder if exists
        const placeholder = container.querySelector('.image-placeholder');
        if (placeholder) placeholder.remove();
        
        // Create response item
        const item = document.createElement('div');
        item.className = 'response-item';
        
        const timestamp = new Date().toLocaleTimeString();
        
        let html = `
            <div class="response-header">
                <span class="response-timestamp">${timestamp}</span>
                <span class="response-iteration">Iteration #${this.iterationCount}</span>
            </div>
        `;
        
        // Display parsed Q&A if available
        if (parsedData) {
            if (parsedData.localDescription) {
                html += `
                    <div class="filtered-response-section">
                        <div class="filtered-response-label">Q6: Local Description</div>
                        <div class="filtered-response-text">${parsedData.localDescription}</div>
                    </div>
                `;
            }
            if (parsedData.globalDescription) {
                html += `
                    <div class="filtered-response-section">
                        <div class="filtered-response-label">Q4: Global Description</div>
                        <div class="filtered-response-text">${parsedData.globalDescription}</div>
                    </div>
                `;
            }
        }
        
        // Display pixel count
        html += `
            <div class="filtered-response-section">
                <div class="filtered-response-label">Pixels Drawn</div>
                <div class="filtered-response-text">${pixelCount} pixels</div>
            </div>
        `;
        
        item.innerHTML = html;
        
        // Insert at top (most recent first)
        container.insertBefore(item, container.firstChild);
        
        // Keep only last 10 responses
        while (container.children.length > 10) {
            container.removeChild(container.lastChild);
        }
    }
    
    storeVerbatimResponse(rawResponse) {
        const container = document.getElementById('verbatim-responses');
        if (!container) return;
        
        // Remove placeholder if exists
        const placeholder = container.querySelector('.image-placeholder');
        if (placeholder) placeholder.remove();
        
        // Handle objects (e.g., Gemini returns structured object)
        let responseText = rawResponse;
        
        // Try to parse if it's a string containing JSON
        let responseObj = null;
        if (typeof rawResponse === 'string') {
            try {
                responseObj = JSON.parse(rawResponse);
            } catch (e) {
                // Not JSON string, keep as is
            }
        } else if (typeof rawResponse === 'object' && rawResponse !== null) {
            responseObj = rawResponse;
        }
        
        // If we have a parsed object with descriptions, format it as readable text
        if (responseObj && responseObj.descriptions) {
            try {
                const desc = responseObj.descriptions;
                
                // Get pixel count
                let pixelInfo = '';
                if (responseObj.pixels && Array.isArray(responseObj.pixels)) {
                    pixelInfo = `\n\n📊 Pixels Generated: ${responseObj.pixels.length}`;
                } else if (responseObj.pixels) {
                    pixelInfo = `\n\n📊 Pixels Generated: ${responseObj.pixels}`;
                }
                
                // Format as readable text
                responseText = 
                    `🗣️ CURRENT STATE\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `\n🎨 Grid [0,0]:\n${desc.individual_before_description}\n` +
                    `\n🌍 Collective Canvas:\n${desc.collective_before_description}\n` +
                    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `\n📊 PREDICTION EVALUATION\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `\nGrid Predictability: ${desc.predictability_individual}/10\n` +
                    `Collective Predictability: ${desc.predictability_collective}/10\n` +
                    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `\n🔮 FUTURE PREDICTIONS\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `\n🌍 Collective Evolution:\n${desc.collective_after_prediction}\n` +
                    `\n🎨 Grid [0,0] Evolution:\n${desc.individual_after_prediction}` +
                    pixelInfo;
            } catch (e) {
                responseText = String(rawResponse);
            }
        } else if (responseObj) {
            // Generic object handling
            responseText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(responseObj, null, 2);
        }
        
        // Create response item
        const item = document.createElement('div');
        item.className = 'response-item';
        
        const timestamp = new Date().toLocaleTimeString();
        
        // Use <pre> tag for formatted text to preserve whitespace
        const usePreTag = responseObj && responseObj.descriptions;
        
        item.innerHTML = `
            <div class="response-header">
                <span class="response-timestamp">${timestamp}</span>
                <span class="response-iteration">Iteration #${this.iterationCount}</span>
            </div>
            <div class="response-content">${usePreTag ? `<pre style="white-space: pre-wrap; font-family: monospace;">${this.escapeHtml(responseText)}</pre>` : this.escapeHtml(responseText)}</div>
        `;
        
        // Insert at top (most recent first)
        container.insertBefore(item, container.firstChild);
        
        // Keep only last 5 responses
        while (container.children.length > 5) {
            container.removeChild(container.lastChild);
        }
    }
    
    updateLlavaImages(localImageBase64, globalImageBase64, colorPalette = null) {
        const container = document.getElementById('llava-images');
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        // Helper to add data:image prefix if needed
        const ensureDataUrl = (base64) => {
            if (!base64) return null;
            return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
        };
        
        const localUrl = ensureDataUrl(localImageBase64);
        const globalUrl = ensureDataUrl(globalImageBase64);
        
        // Add local canvas image
        if (localUrl) {
            const localItem = document.createElement('div');
            localItem.className = 'image-item';
            localItem.innerHTML = `
                <div class="image-label">Local Canvas (20x20)</div>
                <img src="${localUrl}" class="image-thumbnail" alt="Local Canvas" onclick="window.aiPlayer.showImageModal(this.src)">
            `;
            container.appendChild(localItem);
        }
        
        // Add global canvas image
        if (globalUrl) {
            const globalItem = document.createElement('div');
            globalItem.className = 'image-item';
            globalItem.innerHTML = `
                <div class="image-label">Global Canvas</div>
                <img src="${globalUrl}" class="image-thumbnail" alt="Global Canvas" onclick="window.aiPlayer.showImageModal(this.src)">
            `;
            container.appendChild(globalItem);
        }
        
        // Add colorPalette text (especially useful for iteration 0)
        if (colorPalette) {
            const paletteItem = document.createElement('div');
            paletteItem.className = 'image-item';
            const pixels = colorPalette.split(' ');
            const pixelCount = pixels.length;
            const preview = pixels.slice(0, 10).join(' ') + (pixelCount > 10 ? ` ... (${pixelCount} total)` : '');
            paletteItem.innerHTML = `
                <div class="image-label">Color Palette (sent to LLaVA)</div>
                <div style="background: #0d0d0d; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 10px; color: #aaa; max-height: 100px; overflow-y: auto;">
                    ${this.escapeHtml(preview)}
                </div>
                <div style="font-size: 9px; color: #666; margin-top: 4px;">
                    ${pixelCount} pixels in palette
                </div>
            `;
            container.appendChild(paletteItem);
        }
        
        // Show placeholder if no images
        if (!localUrl && !globalUrl && !colorPalette) {
            container.innerHTML = '<div class="image-placeholder">No images sent yet</div>';
        }
    }
    
    showImageModal(imageSrc) {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('modal-image');
        if (modal && modalImg) {
            modal.style.display = 'block';
            modalImg.src = imageSrc;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updateHeaderPosition() {
        const headerPosition = document.getElementById('header-position');
        if (headerPosition && this.myPosition) {
            const [x, y] = this.myPosition;
            headerPosition.textContent = `[${x}, ${y}]`;
        }
    }
    
    updateHeaderModel() {
        const headerModel = document.getElementById('header-llm-model');
        const modelSelect = this.elements.llmModelSelect;
        if (headerModel && modelSelect) {
            const selectedOption = modelSelect.options[modelSelect.selectedIndex];
            // Extract just the model name (e.g., "LLaVA 7B" from "👁️ LLaVA 7B Vision...")
            const modelText = selectedOption.textContent.split('(')[0].trim();
            headerModel.textContent = modelText.replace(/^[^\w]+/, ''); // Remove leading emojis
        }
    }

    // === Boucle principale ===
    async mainLoop() {
        console.log('[AI Player] 🔄 mainLoop() appelé, isRunning:', this.isRunning);
        while (this.isRunning) {
            if (this.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                this.addJournalEntry(`⚠️ WebSocket déconnecté, arrêt de l'agent`, 'error');
                this.updateStatus('disconnected');
                this.setLlmStatus('Inactif', 'disconnected');
                this.isRunning = false;
                this.elements.btnStart.textContent = '▶ Start';
                this.elements.btnPause.disabled = true;
                break;
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
                const analysis = this.analyzeEnvironment();
                
                // Pour Gemini, ajouter colorPalette à analysis
                if (this.currentAdapter && this.currentAdapter.name && this.currentAdapter.name === 'Gemini V2') {
                    analysis.colorPalette = this.generateColorPalette();
                    console.log('[AI Player] 🎨 ColorPalette ajouté à analysis pour Gemini');
                }
                
                // En mode training, utiliser le prompt training comme customPrompt
                let customPrompt;
                if (this.elements.trainingEnabled && this.elements.trainingEnabled.checked) {
                    customPrompt = this.buildTrainingPrompt();
                } else {
                    customPrompt = this.elements.customPrompt ? (this.elements.customPrompt.value.trim()) : '';
                }

                console.log('[AI Player] 🚀 Appel à askLLM avec iterationCount:', this.iterationCount);
                const instructions = await this.askLLM(analysis, customPrompt);
                console.log('[AI Player] 📨 Réponse reçue de askLLM:', instructions ? 'OK' : 'NULL');
                if (!instructions) {
                    this.addJournalEntry(`⚠️ Aucune instruction reçue de LLaVA`, 'error');
                    this.addJournalEntry(`⏳ Attente de 60s avant nouvelle tentative`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 secondes au lieu de 5
                    continue;
                }

                // Incrémenter le compteur APRÈS avoir reçu la réponse de LLaVA
                this.iterationCount++;
                this.currentDrawingIteration = this.iterationCount;
                this.updateStats();
                this.addJournalEntry(`🤔 Itération ${this.iterationCount}...`);

                const pixelCount = await this.executePixels(instructions);
                console.log('[AI Player] 🔍 executePixels terminé, pixelCount:', pixelCount);

                // Envoyer la mise à jour globale au serveur de métriques (après dessin)
                try {
                    if (this.metricsSocket && this.metricsSocket.readyState === WebSocket.OPEN) {
                        const localDesc = (instructions && instructions.descriptions && instructions.descriptions.individual_before_description) 
                            || this.lastLocalDescription || '';
                        const globalDesc = (instructions && instructions.descriptions && instructions.descriptions.collective_before_description) 
                            || this.lastGlobalDescription || '';
                        this.metricsSocket.send(JSON.stringify({
                            type: 'simplicity_update',
                            user_id: this.myUserId || 'unknown',
                            h: pixelCount || 0,
                            local_description: localDesc,
                            global_description: globalDesc
                        }));
                    }
                } catch (_) {}

                // Mise à jour métriques locales après dessin pour affichage fiable
                try {
                    if (this.currentAdapter && this.currentAdapter.name === 'Gemini V2' && instructions && instructions.descriptions) {
                        // V3: Extract simplicity assessment from parsed response (already done in askLLM)
                        // This fallback is for non-Gemini adapters - skip for V3
                        if (this.currentAdapter.name !== 'Gemini V3') {
                            const individualDesc = instructions.descriptions?.individual_before_description || '';
                            const alphaBitsPerPixel = 33;
                            const C_w = (pixelCount || 0) * alphaBitsPerPixel;
                            const C_d = individualDesc.length * 8;
                            const U = C_w - C_d;
                            // For V3, this should not be called - assessments come from extractSimplicityAssessment
                            // Keeping for compatibility with other adapters
                        }
                    }
                } catch (_) {}

                // === GEMINI MEMORY MANAGEMENT ===
                if (this.currentAdapter && this.currentAdapter.name === 'Gemini V2' && this.geminiContextManager) {
                    console.log('[Gemini Memory] 🔍 Vérification instructions.descriptions:', !!instructions.descriptions);
                    console.log('[Gemini Memory] 🔍 Instructions structure:', Object.keys(instructions || {}));
                    
                    // Extraire descriptions de la réponse
                    let extracted = null;
                    if (instructions.descriptions) {
                        extracted = this.currentAdapter.extractDescriptions(instructions);
                        
                        // Stocker l'itération i complète (SANS images - économie mémoire)
                        this.geminiContextManager.storeIteration(this.iterationCount, {
                            pixelCount: pixelCount,
                            localImageBase64: null,  // Pas stockées
                            globalImageBase64: null, // Pas stockées
                            individualAfterPrediction: extracted.individualAfterPrediction,
                            collectiveAfterPrediction: extracted.collectiveAfterPrediction,
                            individualBeforeDescription: extracted.individualBeforeDescription,
                            collectiveBeforeDescription: extracted.collectiveBeforeDescription,
                            predictabilityIndividual: extracted.predictabilityIndividual,
                            predictabilityCollective: extracted.predictabilityCollective
                        });
                        
                        // Si ce n'est pas la première itération, calculer U pour l'itération précédente
                        if (this.iterationCount > 0 && extracted.individualBeforeDescription) {
                            // Construire pixelCounts array
                            const pixelCounts = [];
                            for (let i = 0; i < this.iterationCount; i++) {
                                const stored = this.geminiContextManager.getIterationMetrics(i);
                                if (stored) pixelCounts.push(stored.pixelCount);
                            }
                            pixelCounts.push(pixelCount); // Current iteration
                            
                            const metrics = this.geminiComplexityCalculator.calculateU(
                                this.iterationCount - 1,
                                pixelCounts,
                                extracted.individualBeforeDescription,
                                false
                            );
                            
                            this.geminiComplexityCalculator.storeMetrics(this.iterationCount - 1, metrics, false);
                            this.geminiComplexityCalculator.storePredictability(
                                this.iterationCount - 1,
                                extracted.predictabilityIndividual,
                                extracted.predictabilityCollective
                            );
                            
                            console.log(`[Gemini Memory] 📊 Métriques stockées pour itération ${this.iterationCount - 1}`);
                            
                            // INTÉGRER dans this.simplicityMetrics pour affichage graphique
                            this.simplicityMetrics.iterations.push(this.iterationCount - 1);
                            this.simplicityMetrics.C_w.push(metrics.C_w);
                            this.simplicityMetrics.C_d.push(metrics.C_d);
                            this.simplicityMetrics.U.push(metrics.U);
                            this.simplicityMetrics.descriptions.push(extracted.individualBeforeDescription);
                            
                            // Dessiner le graphique local
                            this.drawLocalSimplicityChart();
                            
                            console.log('[Gemini Memory] 📈 Graphique local mis à jour');
                        }
                    }
                }

                // Gérer strategy qui peut être undefined pour Gemini
                const strategy = instructions.strategy || 'Gemini drawing';
                this.updateDecision(strategy, pixelCount);
                
                // Délai spécifique pour Gemini (rate limit API gratuite)
                if (this.currentAdapter && this.currentAdapter.name === 'Gemini V2') {
                    // Utiliser le délai de l'interface + délai supplémentaire pour Gemini
                    const baseDelay = (parseInt(this.elements.interval.value) || 20) * 1000; // Délai interface
                    const geminiExtraDelay = 10000; // 10 secondes supplémentaires pour Gemini
                    const randomDelay = Math.random() * 5000; // 0-5 secondes aléatoires
                    const totalDelay = baseDelay + geminiExtraDelay + randomDelay;
                    console.log(`⏳ [Gemini] Délai total ${Math.round(totalDelay/1000)}s (interface: ${Math.round(baseDelay/1000)}s + Gemini: ${Math.round(geminiExtraDelay/1000)}s + aléatoire: ${Math.round(randomDelay/1000)}s)`);
                    await new Promise(resolve => setTimeout(resolve, totalDelay));
                }
                
                // Gérer les itérations sans pixels comme des erreurs partielles
                if (pixelCount === 0) {
                    this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
                    this.addJournalEntry(`⚠️ ${pixelCount} pixels dessinés (${this.consecutiveErrors}/5 erreurs) | "${strategy}"`, 'error');
                    
                    // Arrêter l'agent après 5 itérations consécutives sans pixels
                    if (this.consecutiveErrors >= 5) {
                        this.addJournalEntry(`🛑 Arrêt de l'agent après ${this.consecutiveErrors} itérations sans pixels`, 'error');
                        this.isRunning = false;
                        this.elements.btnStart.textContent = '▶ Start';
                        this.elements.btnPause.disabled = true;
                        this.updateStatus('disconnected');
                        break;
                    }
                    
                    // Attendre 60 secondes avant de réessayer (LLaVA a probablement mal compris le prompt)
                    const zeroPixelBackoff = 60000; // 60 secondes
                    this.addJournalEntry(`⏳ Attente de ${zeroPixelBackoff/1000}s avant nouvelle tentative (0 pixels générés)`, 'warning');
                    await new Promise(r => setTimeout(r, zeroPixelBackoff));
                } else {
                this.addJournalEntry(`✅ ${pixelCount} pixels dessinés | "${strategy}"`, 'success');
                    // Réinitialiser le compteur d'erreurs en cas de succès réel
                    this.consecutiveErrors = 0;
                }
                
                // Calcul des métriques Simplicity Theory (V2) - OLD CODE (LLaVA only)
                // REMOVED: Cette section est maintenant remplacée par le nouveau code Gemini Memory ci-dessus
                const isV2 = false; // Désactivé car remplacé par le nouveau système Gemini
                if (false && isV2 && this.lastLocalDescription) {
                    // Calculer les métriques locales
                    const metrics = this.calculateSimplicityMetrics(this.lastLocalDescription, pixelCount);
                    const metricsStored = this.storeSimplicityMetrics(this.iterationCount, metrics.C_w, metrics.C_d, metrics.U, this.lastLocalDescription);
                    
                    // Envoyer au serveur de métriques seulement si les métriques sont valides
                    if (metricsStored) {
                        this.sendSimplicityUpdate(pixelCount, this.lastLocalDescription, this.lastGlobalDescription);
                    }
                }
                
                // Stocker ma propre stratégie pour que les voisins la voient
                if (!this.otherUsers[this.myUserId]) {
                    this.otherUsers[this.myUserId] = { 
                        pixels: {}, 
                        recentUpdates: [], 
                        lastStrategy: null,
                        position: this.myPosition || [0, 0]
                    };
                }
                this.otherUsers[this.myUserId].lastStrategy = strategy;
                
                // NOTE: Ne PAS vider recentUpdates ici, car on en a besoin pour la prochaine itération
                // La limite de 100 est déjà appliquée dans handleMessage (cell_update)

            } catch (error) {
                const msg = this.stringifyError(error);
                this.addJournalEntry(`❌ Erreur: ${msg}`, 'error');
                
                this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
                
                // Arrêter l'agent après 5 erreurs consécutives
                if (this.consecutiveErrors >= 5) {
                    this.addJournalEntry(`🛑 Arrêt de l'agent après ${this.consecutiveErrors} erreurs consécutives`, 'error');
                    this.isRunning = false;
                    this.elements.btnStart.textContent = '▶ Start';
                    this.elements.btnPause.disabled = true;
                    this.updateStatus('disconnected');
                    break;
                }
                
                let backoffMs = 0;
                if (/429|Rate limit/i.test(msg)) {
                    this.setLlmStatus('Rate limited', 'paused');
                    backoffMs = Math.max(60000, (parseInt(this.elements.interval.value) || 20) * 1000);
                } else if (/Timeout.*150.*seconds/i.test(msg) || /Timeout.*LLaVA/i.test(msg) || /Timeout.*Gemini/i.test(msg)) {
                    this.setLlmStatus('Timeout LLM', 'error');
                    backoffMs = 180000; // 180s (3 minutes) pour laisser le LLM finir
                    this.addJournalEntry(`⏳ LLM timeout - Attente 3 minutes avant nouvelle tentative`, 'warning');
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
            case 'llava':
                // Détecter si LlavaV2Adapter est disponible (pour ai-player-v2.html)
                if (window.LlavaV2Adapter) {
                    console.log('🎨 [V2] Utilisation de LlavaV2Adapter (Grid Format)');
                    return window.LlavaV2Adapter;
                }
                return LlavaAdapter;
            case 'claude-vision':
                // TODO: Implémenter ClaudeVisionAdapter
                throw new Error('Claude Vision pas encore implémenté');
            case 'dalle':
                // TODO: Implémenter DalleAdapter
                throw new Error('DALL-E 3 pas encore implémenté');
            case 'gemini':
                // Détecter si GeminiV3Adapter est disponible (pour ai-player-v3.html)
                if (window.GeminiV3Adapter) {
                    console.log('💎 [V3] Utilisation de GeminiV3Adapter (Simplicity Theory Direct Evaluations)');
                    return window.GeminiV3Adapter;
                }
                throw new Error('Gemini V3 Adapter non disponible');
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

    // Génère un prompt d'entraînement selon les sélecteurs UI
    buildTrainingPrompt() {
        try {
            if (!this.elements.trainingEnabled || !this.elements.trainingEnabled.checked) return '';
            const ex = (this.elements.trainingEx && this.elements.trainingEx.value) || '';
            console.log(`🔍 [DEBUG] buildTrainingPrompt: ex="${ex}", trainingEnabled=${this.elements.trainingEnabled?.checked}`);
            
            const densityByNeighbor = this.computeNeighborDensities();
            const neighborHint = `Neighbors density N:${densityByNeighbor.N} S:${densityByNeighbor.S} E:${densityByNeighbor.E} W:${densityByNeighbor.W} NE:${densityByNeighbor.NE} NW:${densityByNeighbor.NW} SE:${densityByNeighbor.SE} SW:${densityByNeighbor.SW}`;

            const colorCoins = '#FF5733';
            const colorCenter = '#2ECC71';

            // Tenter d'utiliser les prompts externes si déjà chargés
            this.ensurePromptsLoading();
            console.log(`🔍 [DEBUG] promptsContent loaded:`, !!this.promptsContent);
            if (this.promptsContent && this.promptsContent.training && this.promptsContent.training[ex]) {
                try {
                    const raw = this.promptsContent.training[ex];
                    let tpl = Array.isArray(raw) ? raw.join('\n') : String(raw || '');
                    const randomColors = this.generateRandomColors(8);
                    tpl = tpl.replaceAll('{{colorCoins}}', colorCoins)
                             .replaceAll('{{colorCenter}}', colorCenter)
                             .replaceAll('{{neighborHint}}', neighborHint)
                             .replaceAll('{{color1}}', randomColors[0])
                             .replaceAll('{{color2}}', randomColors[1])
                             .replaceAll('{{color3}}', randomColors[2])
                             .replaceAll('{{color4}}', randomColors[3])
                             .replaceAll('{{color5}}', randomColors[4])
                             .replaceAll('{{color6}}', randomColors[5])
                             .replaceAll('{{color7}}', randomColors[6])
                             .replaceAll('{{color8}}', randomColors[7]);
                    console.log(`🔍 [DEBUG] Training prompt built for ${ex}:`, tpl.substring(0, 100) + '...');
                    if (tpl.trim()) return tpl;
                } catch (e) {
                    console.error(`🔍 [DEBUG] Error building training prompt:`, e);
                }
            }

            switch (ex) {
                case 'A1':
                    return `TRAINING (A1): Place EXACTLY these pairs (coins=${colorCoins}, centre=${colorCenter}).\n` +
                           `Your FIRST AND ONLY line MUST be exactly this, no other pixels, no prose before/after:\n` +
                           `pixels: 0,0:${colorCoins} 19,19:${colorCoins} 0,19:${colorCoins} 19,0:${colorCoins} 9,9:${colorCenter} 10,10:${colorCenter} 10,9:${colorCenter} 9,10:${colorCenter}`;
                case 'A2':
                    return `TRAINING (A2): Place 4 pixels aux coins et 4 au centre (couleurs libres, pas de #000000). Paires imposées: 0,0 19,19 0,19 19,0 9,9 10,10 10,9 9,10. Format: pixels: x,y:#HEX...`;
                case 'A3':
                    return `TRAINING (A3): Coins+centre, x,y libres, couleurs libres. Contraintes: coins {0,1,18,19}, centre {9,10}. Interdits: #000/#000000, doublons.`;
                case 'A4':
                    return `TRAINING (A4): Damier 2 couleurs (20×20). Tu peux sous-échantillonner (1 case sur 2). Format: pixels: x,y:#HEX...`;
                case 'A5':
                    return `TRAINING (A5): Damier complémentaires. Inverse les deux couleurs du damier précédent. Format: pixels: x,y:#HEX...`;
                case 'B6':
                    return `TRAINING (B6): Copie le voisin cardinal le plus dense. ${neighborHint}. Si aucun voisin significatif (≥10px), dessine un motif 10×10 centré inspiré des couleurs dominantes.`;
                case 'B7':
                    return `TRAINING (B7): Copie en miroir vertical un voisin cardinal (x→19−x). ${neighborHint}. Fallbacks identiques à B6.`;
                case 'B8':
                    return `TRAINING (B8): Copie un voisin diagonal et pivote de 90° horaire ((x,y)→(y,19−x)). Fallback: voisin cardinal le plus dense.`;
                case 'C9':
                    return `TRAINING (C9): Dégradé radial centre→bord entre deux couleurs harmonieuses (6 anneaux).`;
                case 'C10':
                    return `TRAINING (C10): Paysage stylisé (3 bandes + 1 élément saillant), ≥120 pixels, pas de noir pur au début.`;
                case 'C11':
                    return `TRAINING (C11): Traits principaux d’un visage sur le paysage (yeux-nez-bouche), 60–150 pixels, sans noir.`;
                case 'D12':
                    return `TRAINING (D12): Compléter un voisin (continuité formes/couleurs). Fallback: renforcer un motif interne (phase C).`;
                case 'D13':
                    return `TRAINING (D13): Crée une passerelle visuelle entre deux voisins (au choix), continuité de teinte et épaisseur régulière. ${neighborHint}`;
                case 'D14':
                    return `TRAINING (D14): Dessin libre (contraintes GP). Créativité totale, pas de duplication ni coordonnées hors bornes, densité > 50.`;
                default:
                    return '';
            }
        } catch (_) {
            return '';
        }
    }

    // Pré-chargement non bloquant du fichier de prompts (cache en mémoire)
    async ensurePromptsLoading() {
        try {
            if (this.promptsContent) return this.promptsContent;
            const resp = await fetch('/llava-prompts.json?v=20251016');
            if (resp.ok) {
                this.promptsContent = await resp.json();
                console.log('🧾 [AI Player] Prompts LLaVA chargés');
                return this.promptsContent;
            }
        } catch (e) {
            console.warn('⚠️ [AI Player] Impossible de charger les prompts LLaVA externes, fallback local', e);
        }
        return null;
    }

    computeNeighborDensities() {
        const dirs = {N:[0,-1], S:[0,1], E:[1,0], W:[-1,0], NE:[1,-1], NW:[-1,-1], SE:[1,1], SW:[-1,1]};
        const result = {N:0,S:0,E:0,W:0,NE:0,NW:0,SE:0,SW:0};
        if (!this.myPosition) return result;
        const [mx,my] = this.myPosition;
        for (const k of Object.keys(this.otherUsers)) {
            const pos = this.otherUsers[k]?.position;
            if (!pos) continue;
            const dx = pos[0]-mx; const dy = pos[1]-my;
            for (const [name,[vx,vy]] of Object.entries(dirs)) {
                if (dx===vx && dy===vy) {
                    const count = Object.keys(this.otherUsers[k]?.pixels||{}).length;
                    result[name] = count;
                }
            }
        }
        return result;
    }

    // Validation stricte de la sortie pour certains exercices
    validateTrainingOutput(parsed) {
        try {
            if (!this.elements.trainingEnabled || !this.elements.trainingEnabled.checked) return true;
            const ex = this.elements.trainingEx?.value;
            if (!ex) return true;
            if (!parsed || !Array.isArray(parsed.pixels)) return false;
            if (ex === 'A1') {
                const expected = this.expectedA1Pixels();
                if (parsed.pixels.length !== expected.length) return false;
                const set = new Set(parsed.pixels.map(p => `${p.x},${p.y}:${p.color.toLowerCase()}`));
                for (const p of expected) {
                    if (!set.has(`${p.x},${p.y}:${p.color.toLowerCase()}`)) return false;
                }
                return true;
            } else if (ex === 'A2') {
                // A2: mêmes 8 coordonnées que A1, couleurs libres (hex valides), pas de #000000
                console.log(`🔍 [DEBUG] Validation A2: parsed.pixels.length=${parsed.pixels.length}`);
                const expectedCoords = new Set([
                    '0,0','19,19','0,19','19,0','9,9','10,10','10,9','9,10'
                ]);
                if (parsed.pixels.length !== expectedCoords.size) {
                    console.log(`🔍 [DEBUG] A2 validation failed: wrong pixel count (${parsed.pixels.length} vs ${expectedCoords.size})`);
                    return false;
                }
                // déduplication par coordonnée, et vérifications
                const seen = new Set();
                for (const p of parsed.pixels) {
                    const key = `${p.x},${p.y}`;
                    if (!expectedCoords.has(key)) {
                        console.log(`🔍 [DEBUG] A2 validation failed: unexpected coordinate ${key}`);
                        return false;
                    }
                    if (seen.has(key)) {
                        console.log(`🔍 [DEBUG] A2 validation failed: duplicate coordinate ${key}`);
                        return false;
                    }
                    seen.add(key);
                    if (typeof p.color !== 'string') {
                        console.log(`🔍 [DEBUG] A2 validation failed: invalid color type for ${key}`);
                        return false;
                    }
                    const c = p.color.trim().toLowerCase();
                    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) {
                        console.log(`🔍 [DEBUG] A2 validation failed: invalid color format ${c} for ${key}`);
                        return false;
                    }
                    if (c === '#000' || c === '#000000') {
                        console.log(`🔍 [DEBUG] A2 validation failed: black color not allowed for ${key}`);
                        return false;
                    }
                }
                // toutes les coordonnées attendues présentes
                if (seen.size !== expectedCoords.size) {
                    console.log(`🔍 [DEBUG] A2 validation failed: missing coordinates (${seen.size} vs ${expectedCoords.size})`);
                    return false;
                }
                console.log(`🔍 [DEBUG] A2 validation SUCCESS!`);
                return true;
            } else if (ex === 'A3') {
                // A3: 8 pixels aux coins/centre mais positions libres contraintes
                if (parsed.pixels.length !== 8) {
                    console.log(`🔍 [DEBUG] A3 validation failed: wrong pixel count (${parsed.pixels.length} vs 8)`);
                    return false;
                }
                const isCorner = (x,y) => (x===0||x===1||x===18||x===19) && (y===0||y===1||y===18||y===19);
                const isCenter = (x,y) => (x===9||x===10) && (y===9||y===10);
                const seen = new Set();
                for (const p of parsed.pixels) {
                    const key = `${p.x},${p.y}`;
                    if (seen.has(key)) {
                        console.log(`🔍 [DEBUG] A3 validation failed: duplicate coordinate ${key}`);
                        return false;
                    }
                    seen.add(key);
                    const c = (p.color||'').toLowerCase();
                    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) {
                        console.log(`🔍 [DEBUG] A3 validation failed: invalid color ${c}`);
                        return false;
                    }
                    if (c === '#000' || c === '#000000') {
                        console.log(`🔍 [DEBUG] A3 validation failed: black color forbidden`);
                        return false;
                    }
                    // Chaque pixel doit être coin-autorisé ou centre-autorisé
                    if (!(isCorner(p.x,p.y) || isCenter(p.x,p.y))) {
                        console.log(`🔍 [DEBUG] A3 validation failed: pixel ${p.x},${p.y} not in allowed zones`);
                        return false;
                    }
                }
                // Compter les pixels par zone
                let countCorner=0, countCenter=0;
                for (const p of parsed.pixels) {
                    if ((p.x===9||p.x===10)&&(p.y===9||p.y===10)) countCenter++; else countCorner++;
                }
                console.log(`🔍 [DEBUG] A3 validation: ${countCorner} corner pixels, ${countCenter} center pixels`);
                // Accepter si au moins 1 pixel dans chaque zone (plus flexible)
                const isValid = countCorner >= 1 && countCenter >= 1;
                console.log(`🔍 [DEBUG] A3 validation ${isValid ? 'SUCCESS' : 'FAILED'}`);
                return isValid;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    expectedA1Pixels() {
        const colorCoins = '#FF5733';
        const colorCenter = '#2ECC71';
        return [
            {x:0,y:0,color:colorCoins}, {x:19,y:19,color:colorCoins}, {x:0,y:19,color:colorCoins}, {x:19,y:0,color:colorCoins},
            {x:9,y:9,color:colorCenter}, {x:10,y:10,color:colorCenter}, {x:10,y:9,color:colorCenter}, {x:9,y:10,color:colorCenter}
        ];
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
        // DEPRECATED: "Last Decision" section removed in tabbed interface
        // This information is now available in the Monitoring tab (Filtered Responses)
        if (!this.elements.decisionBox) return;
        
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

    updateJournalTitle() {
        // Trouver tous les titres de section et identifier celui du Journal
        const allTitles = document.querySelectorAll('.section-title');
        let journalTitle = null;
        
        for (const title of allTitles) {
            if (title.textContent.includes('📜 Journal')) {
                journalTitle = title;
                break;
            }
        }
        
        if (journalTitle && this.myPosition) {
            const [x, y] = this.myPosition;
            journalTitle.textContent = `📜 Journal - AI (${x},${y})`;
        } else if (journalTitle) {
            journalTitle.textContent = '📜 Journal - AI (?,?)';
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
            
            // Afficher les textes LLaVA (global vision, interesting neighbors, my intention)
        // Debug simplifié
        if (parsed.pixels && parsed.pixels.length > 0) {
            console.log('[AI Player] ✅', parsed.pixels.length, 'pixels parsés');
        }
            
            if (parsed.global_vision) {
                this.addJournalEntry(`🌍 Vision globale: ${parsed.global_vision}`, 'info');
            }
            if (parsed.interesting_neighbors) {
                this.addJournalEntry(`👥 Voisins intéressants: ${parsed.interesting_neighbors}`, 'info');
            }
            if (parsed.my_intention) {
                this.addJournalEntry(`🎯 Mon intention: ${parsed.my_intention}`, 'info');
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
        // Tab Switching Logic
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panels
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));
                
                // Add active class to clicked button and corresponding panel
                button.classList.add('active');
                const targetPanel = document.getElementById(`tab-${targetTab}`);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });
        
        // Image Modal Close
        const imageModal = document.getElementById('image-modal');
        const imageModalClose = document.querySelector('.image-modal-close');
        if (imageModal) {
            imageModal.addEventListener('click', () => {
                imageModal.style.display = 'none';
            });
        }
        if (imageModalClose) {
            imageModalClose.addEventListener('click', () => {
                if (imageModal) imageModal.style.display = 'none';
            });
        }
        
        // Expose aiPlayer globally for modal onclick
        window.aiPlayer = this;
        
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
            console.log('[AI Player] 🔘 Bouton Start cliqué, isRunning:', this.isRunning);
            if (!this.isRunning) {
                // Vérifier l'API key sauf pour Ollama/LLaVA (gratuits)
                const name = (this.currentAdapter && this.currentAdapter.name) || '';
                const noKeyRequired = /Ollama|LLaVA/i.test(name);
                if (!noKeyRequired && !this.elements.apiKey.value) {
                    alert('⚠️ Veuillez entrer votre API Key');
                    return;
                }
                this.saveApiKey();
                this.isRunning = true;
                this.isPaused = false;
                this.elements.btnStart.textContent = '■ Stop';
                this.elements.btnPause.disabled = false;
                this.updateStatus('running');
                try {
                    await this.connectWebSocket();
                    this.mainLoop();
                } catch (error) {
                    this.addJournalEntry(`❌ Impossible de se connecter: ${this.stringifyError(error)}`, 'error');
                    this.isRunning = false;
                    this.elements.btnStart.textContent = '▶ Start';
                    this.elements.btnPause.disabled = true;
                }
            } else {
                this.isRunning = false;
                this.isPaused = false;
                this.isFirstLlmRequest = true;
                this.stopHeartbeat(); // Arrêter les heartbeats
                this.cancelPendingPixels(); // Annuler les pixels en attente
                try { if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close(); } catch (_) {}
                this.updateStatus('disconnected');
                this.elements.btnStart.textContent = '▶ Start';
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

        // Bouton Clear API Key (optionnel)
        const btnClearKey = document.getElementById('btn-clear-key');
        if (btnClearKey) btnClearKey.addEventListener('click', () => this.clearApiKey());

        // Bouton Submit Prompt (désactivé si UI commentée)
        const btnSubmitPrompt = document.getElementById('btn-submit-prompt');
        if (btnSubmitPrompt && this.elements.customPrompt) {
            btnSubmitPrompt.addEventListener('click', () => {
                const prompt = this.elements.customPrompt.value.trim();
                if (prompt) {
                    this.addJournalEntry(`📝 Prompt mis à jour: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, 'success');
                } else {
                    this.addJournalEntry(`📝 Prompt réinitialisé (mode libre)`, 'success');
                }
            });
        }

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
            
            // Update header banner model display
            this.updateHeaderModel();
            
            // Recharger le manuel spécifique au nouveau modèle
            this.isFirstLlmRequest = true; // Forcer le rechargement du manuel
            await this.loadManual(selectedModel);
            this.addJournalEntry(`📖 Manuel ${selectedModel.toUpperCase()} chargé`, 'success');
        });

        // Validation manuelle entraînement
        const btnApprove = document.getElementById('btn-training-approve');
        const btnReject = document.getElementById('btn-training-reject');
        if (btnApprove) {
            btnApprove.addEventListener('click', () => {
                const current = this.elements.trainingEx?.value;
                this.showTrainingValidationUI(false);
                if (current) this.advanceToNextTraining(current);
            });
        }
        if (btnReject) {
            btnReject.addEventListener('click', () => {
                this.showTrainingValidationUI(false);
                this.addJournalEntry('↩️ Exercice rejeté. Nouvelle tentative...', 'error');
            });
        }

        // Toggle mode button
        const toggleModeBtn = document.getElementById('toggle-mode-btn');
        if (toggleModeBtn) {
            toggleModeBtn.addEventListener('click', () => {
                const trainingPanel = document.getElementById('training-panel');
                const isTraining = this.elements.trainingEnabled?.checked;
                
                if (isTraining) {
                    // Passer en mode libre
                    this.elements.trainingEnabled.checked = false;
                    trainingPanel.style.display = 'none';
                    toggleModeBtn.textContent = 'Mode training';
                    this.addJournalEntry('🎨 Mode libre collaboratif activé', 'success');
                } else {
                    // Passer en mode training
                    this.elements.trainingEnabled.checked = true;
                    trainingPanel.style.display = 'block';
                    toggleModeBtn.textContent = 'Mode libre collaboratif';
                    this.addJournalEntry('🎓 Mode training activé', 'success');
                }
            });
        }
    }

    // Mettre à jour le placeholder de l'API Key selon le modèle sélectionné
    updateApiKeyPlaceholder(modelName) {
        const placeholders = {
            'anthropic': 'sk-ant-api03-...',
            'openai': 'sk-proj-...',
            'ollama': '(Aucune clé nécessaire - Gratuit)',
            'llava': '(Aucune clé nécessaire - Gratuit)',
            'claude-vision': 'sk-ant-api03-...',
            'dalle': 'sk-proj-...',
            'gemini': 'AIza...'
        };
        
        const placeholder = placeholders[modelName] || 'sk-ant-api03-...';
        this.elements.apiKey.placeholder = placeholder;
        
        // Désactiver le champ API Key pour Ollama et LLaVA (gratuits)
        if (modelName === 'ollama' || modelName === 'llava') {
            this.elements.apiKey.disabled = true;
            this.elements.apiKey.value = modelName === 'llava' ? 'llava-local' : 'ollama-local';
        } else {
            this.elements.apiKey.disabled = false;
            if (this.elements.apiKey.value === 'ollama-local' || this.elements.apiKey.value === 'llava-local') {
                this.elements.apiKey.value = '';
            }
        }
    }

    showTrainingValidationUI(show) {
        const a = document.getElementById('btn-training-approve');
        const r = document.getElementById('btn-training-reject');
        const h = document.getElementById('training-validation-hint');
        const disp = show ? 'inline-flex' : 'none';
        if (a) a.style.display = disp;
        if (r) r.style.display = disp;
        if (h) h.style.display = show ? 'inline' : 'none';
    }

    // Afficher les échantillons d'images envoyées à LLaVA
    displayImageSamples(images) {
        // DEPRECATED: This function is replaced by updateLlavaImages()
        // Left as stub for compatibility, does nothing
        return;
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.aiPlayer = new AIPlayer();
});

// Export pour utilisation dans d'autres modules
export { AIPlayer };