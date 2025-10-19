// AI Player - Logique principale
// Version: 2025-10-11-20:15 - Fix recentUpdates not persisting
import { SpatialAnalysis } from './spatial-analysis.js';
import { AnthropicAdapter } from './llm-adapters/anthropic.js';
import { OpenAIAdapter } from './llm-adapters/openai.js';
import { OllamaAdapter } from './llm-adapters/ollama.js';
import { LlavaAdapter } from './llm-adapters/llava.js';
import { LlavaCanvasGenerator } from './llava-canvas.js';

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
            journal: document.getElementById('journal'),
            trainingEnabled: document.getElementById('training-enabled'),
            trainingPhase: document.getElementById('training-phase'),
            trainingEx: document.getElementById('training-ex')
        };

        this.init();
    }

    init() {
        this.loadApiKey();
        this.loadManual();
        this.ensurePromptsLoading();
        this.setupEventListeners();
        // Modèle par défaut: LLaVA (vision)
        if (this.elements.llmModelSelect) {
            try {
                this.elements.llmModelSelect.value = 'llava';
            } catch (_) {}
        }
        this.updateApiKeyPlaceholder('llava');
        // Training panel is hidden by default (free mode is default)
        try {
            if (this.elements.trainingEnabled) {
                this.elements.trainingEnabled.checked = false;
            }
            const panel = document.getElementById('training-panel');
            if (panel) panel.style.display = 'none';
        } catch (_) {}
        this.updateJournalTitle(); // Initialiser le titre du journal
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
                this.addJournalEntry('🔌 Déconnecté du serveur', 'error');
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
                        this.updateJournalTitle();
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
        if (!apiKey && selectedModel !== 'ollama' && selectedModel !== 'llava') {
            throw new Error('API Key manquante');
        }

        // Charger le manuel spécifique au modèle si première requête
        if (this.isFirstLlmRequest) {
            await this.loadManual(selectedModel);
        }

        // S'assurer que les prompts externes sont chargés avant construction du prompt
        await this.ensurePromptsLoading();

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
        
        // Générer les couleurs aléatoires pour tous les prompts
        const randomColors = this.generateRandomColors(8);
        
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
                    systemPrompt = await this.currentAdapter.buildSystemPrompt(
                        analysis, 
                        trainingPrompt,  // Utiliser le prompt training comme customPrompt
                        this.isFirstLlmRequest, 
                        this.manualContent, 
                        this.iterationCount,
                        myLastStrategy,
                        myRecentUpdates,
                        this.myPosition,
                        randomColors
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
                        randomColors
                    );
                    
                    if (systemPrompt && typeof systemPrompt === 'object') {
                        systemPrompt.systemMessage = 'TRAINING MODE: Output ONLY pixels in format x,y:#HEX';
                        systemPrompt.needsImage = false;
                        systemPrompt.useGlobalCanvas = false;
                    }
                }
            } else {
                // Mode libre (pas de training)
                systemPrompt = await this.currentAdapter.buildSystemPrompt(
                    analysis, 
                    customPrompt, 
                    this.isFirstLlmRequest, 
                    this.manualContent, 
                    this.iterationCount,
                    myLastStrategy,
                    myRecentUpdates,
                    this.myPosition,
                    randomColors
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
                    // En mode libre, envoyer les images seulement si ce n'est pas la première itération (seed_system)
                    const isFirstIteration = this.iterationCount <= 1;
                    if (!isFirstIteration) {
                        systemPrompt.needsImage = true;
                        systemPrompt.useGlobalCanvas = true;
                        console.log('[AI Player] Mode libre : envoi images activé (continuation)');
                    } else {
                        systemPrompt.needsImage = false;
                        systemPrompt.useGlobalCanvas = false;
                        console.log('[AI Player] Mode libre : pas d\'images pour seed_system');
                    }
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
                    console.log('[AI Player] Image locale Base64:', this.lastLocalCanvasBase64.substring(0, 50) + '...');
                    console.log('[AI Player] Image locale taille:', this.lastLocalCanvasBase64.length, 'caractères');
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
                    
                    // Générer uniquement le canvas couleur côté client (structure optionnelle désactivée)
                    console.log('[AI Player] 🔍 Debug génération canvas global:');
                    console.log('  - otherUsers keys:', Object.keys(this.otherUsers));
                    console.log('  - myUserId:', this.myUserId);
                    console.log('  - myPosition:', this.myPosition);
                    
                    const canvasImages = LlavaCanvasGenerator.generateGlobalCanvas(
                        this.otherUsers,
                        this.myUserId,
                        { includeStructure: false }
                    );
                    
                    if (canvasImages && canvasImages.pureCanvas && canvasImages.pureCanvas.length > 100) {
                        console.log('[AI Player] Canvas global genere (client):');
                        console.log('  - Pure canvas: ' + canvasImages.pureCanvas.length + ' chars');
                        console.log('[AI Player] Image globale Base64:', canvasImages.pureCanvas.substring(0, 50) + '...');
                        
                        images.push(canvasImages.pureCanvas);
                        console.log('[AI Player] Ajout image globale');
                    } else if (canvasImages && canvasImages.pureCanvas) {
                        console.warn('[AI Player] ⚠️ Canvas global trop petit:', canvasImages.pureCanvas.length, 'caractères');
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
                console.log('[AI Player] 🚀 Appel à callAPI avec LLaVA...');
                console.log('[AI Player] SystemMessage length:', systemPrompt.systemMessage.length);
                console.log('[AI Player] UserMessage length:', systemPrompt.userMessage.length);
                console.log('[AI Player] ImageBase64 length:', imageBase64 ? imageBase64.length : 'null');
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
            // Pour les autres adapters, response est un objet {content: ...}
            const responseContent = typeof response === 'string' ? response : response.content;
            const parsed = this.currentAdapter.parseResponse(responseContent);
            
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
            }
            
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
        // Filtrer les pixels identiques à l’état actuel
        const filtered = [];
        coordToPixel.forEach((p, key) => {
            const existing = this.myCellState[key];
            if (existing && typeof existing === 'string' && existing.toLowerCase() === p.color.toLowerCase()) {
                return; // ignorer duplication exacte
            }
            filtered.push(p);
        });
        pixels = filtered;

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

    // === Memory capture methods ===
    captureLocalCanvas() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // Dessiner la grille 20x20 de l'agent
            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const color = this.myCellState[`${x},${y}`] || '#000000';
                    ctx.fillStyle = color;
                    ctx.fillRect(x * 10, y * 10, 10, 10);
                }
            }
            
            // Extraire seulement les données base64 pures (sans le préfixe data:image/png;base64,)
            const dataURL = canvas.toDataURL('image/png');
            this.lastLocalCanvasBase64 = dataURL.split(',')[1]; // Enlever le préfixe
            console.log('[AI Player] Canvas local capturé');
        } catch (e) {
            console.error('[AI Player] Erreur capture canvas local:', e);
        }
    }

    generateColorPalette() {
        try {
            // Générer le tableau de couleurs au format proposé
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
            
            console.log('[AI Player] Palette de couleurs générée');
            return palette;
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
            // Utiliser directement LlavaCanvasGenerator au lieu de this.currentAdapter
            const result = LlavaCanvasGenerator.generateGlobalCanvas(this.otherUsers, this.myUserId);
            this.lastGlobalCanvasBase64 = result.pureCanvas;
            console.log('[AI Player] Canvas global capturé');
        } catch (e) {
            console.error('[AI Player] Erreur capture canvas global:', e);
        }
    }

    // === Boucle principale ===
    async mainLoop() {
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
                this.elements.btnStart.textContent = '▶ Démarrer';
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
                
                // En mode training, utiliser le prompt training comme customPrompt
                let customPrompt;
                if (this.elements.trainingEnabled && this.elements.trainingEnabled.checked) {
                    customPrompt = this.buildTrainingPrompt();
                } else {
                    customPrompt = this.elements.customPrompt.value.trim();
                }

                console.log('[AI Player] 🚀 Appel à askLLM avec iterationCount:', this.iterationCount);
                const instructions = await this.askLLM(analysis, customPrompt);
                console.log('[AI Player] 📨 Réponse reçue de askLLM:', instructions ? 'OK' : 'NULL');
                if (!instructions) {
                    this.addJournalEntry(`⚠️ Aucune instruction reçue de LLaVA`, 'error');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }

                // Incrémenter le compteur APRÈS avoir reçu la réponse de LLaVA
                this.iterationCount++;
                this.currentDrawingIteration = this.iterationCount;
                this.updateStats();
                this.addJournalEntry(`🤔 Itération ${this.iterationCount}...`);
                
                const pixelCount = await this.executePixels(instructions);

                this.updateDecision(instructions.strategy, pixelCount);
                this.addJournalEntry(`✅ ${pixelCount} pixels dessinés | "${instructions.strategy}"`, 'success');
                
                // Réinitialiser le compteur d'erreurs en cas de succès
                this.consecutiveErrors = 0;
                
                // Stocker ma propre stratégie pour que les voisins la voient
                if (!this.otherUsers[this.myUserId]) {
                    this.otherUsers[this.myUserId] = { 
                        pixels: {}, 
                        recentUpdates: [], 
                        lastStrategy: null,
                        position: this.myPosition || [0, 0]
                    };
                }
                this.otherUsers[this.myUserId].lastStrategy = instructions.strategy;
                
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
                    this.elements.btnStart.textContent = '▶ Démarrer';
                    this.elements.btnPause.disabled = true;
                    this.updateStatus('disconnected');
                    break;
                }
                
                let backoffMs = 0;
                if (/429|Rate limit/i.test(msg)) {
                    this.setLlmStatus('Rate limited', 'paused');
                    backoffMs = Math.max(60000, (parseInt(this.elements.interval.value) || 20) * 1000);
                } else if (/Timeout.*90s/i.test(msg)) {
                    this.setLlmStatus('Timeout', 'error');
                    backoffMs = 30000; // 30s pour les timeouts
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
                return LlavaAdapter;
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
        try {
            const imageContainer = document.getElementById('image-samples');
            if (!imageContainer) {
                console.warn('[AI Player] Conteneur image-samples non trouvé');
                return;
            }

            // Vider le conteneur
            imageContainer.innerHTML = '';

            if (images.length === 0) {
                imageContainer.innerHTML = '<div class="image-sample-placeholder">Aucune image envoyée</div>';
                return;
            }

            // Afficher chaque image
            images.forEach((imgBase64, i) => {
                const imageDiv = document.createElement('div');
                imageDiv.className = 'image-sample-item';

                // Titre de l'image
                const imgTitle = document.createElement('div');
                imgTitle.className = 'image-sample-title';
                imgTitle.textContent = `Image ${i + 1}: ${imgBase64.length} caractères`;
                imageDiv.appendChild(imgTitle);

                // Miniature de l'image
                const img = document.createElement('img');
                img.src = `data:image/png;base64,${imgBase64}`;
                img.className = 'image-sample-thumbnail';
                img.title = `Image ${i + 1} envoyée à LLaVA`;
                img.onclick = () => this.showImageModal(imgBase64, `Image ${i + 1}`);
                imageDiv.appendChild(img);

                // Actions
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'image-sample-actions';

                const viewBtn = document.createElement('button');
                viewBtn.textContent = 'Voir en grand';
                viewBtn.className = 'image-sample-btn';
                viewBtn.onclick = () => this.showImageModal(imgBase64, `Image ${i + 1}`);
                actionsDiv.appendChild(viewBtn);

                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copier Base64';
                copyBtn.className = 'image-sample-btn secondary';
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(imgBase64).then(() => {
                        this.addJournalEntry(`📋 Base64 de l'image ${i + 1} copié`, 'info');
                    });
                };
                actionsDiv.appendChild(copyBtn);

                imageDiv.appendChild(actionsDiv);
                imageContainer.appendChild(imageDiv);
            });

        } catch (e) {
            console.error('[AI Player] Erreur affichage échantillons:', e);
        }
    }

    // Afficher une image en modal
    showImageModal(imgBase64, title) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 20000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const img = document.createElement('img');
        img.src = `data:image/png;base64,${imgBase64}`;
        img.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';
        img.title = title;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Fermer';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        `;
        closeBtn.onclick = () => modal.remove();

        modal.appendChild(img);
        modal.appendChild(closeBtn);
        document.body.appendChild(modal);

        // Fermer en cliquant sur le fond
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.aiPlayer = new AIPlayer();
});

// Export pour utilisation dans d'autres modules
export { AIPlayer };