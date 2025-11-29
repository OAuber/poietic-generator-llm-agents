/**
 * ReplayEngine - Moteur de replay pour les sessions exportées
 * Permet de rejouer les événements d'une session à vitesse variable
 */

class ReplayEngine {
    constructor(onEvent) {
        this.onEvent = onEvent;
        this.events = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.speed = 1;
        this.intervalId = null;
        this.sessionData = null;
        
        // Temps de base entre les événements (ms)
        this.baseInterval = 1000;
    }
    
    /**
     * Charge une session exportée pour le replay
     * @param {Object} sessionData - Données de session exportées
     */
    load(sessionData) {
        this.sessionData = sessionData;
        this.events = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Extraire les événements selon le format
        if (sessionData.events && Array.isArray(sessionData.events)) {
            // Format d'export serveur
            this.events = sessionData.events.map((event, index) => ({
                index,
                timestamp: event.timestamp,
                type: event.type,
                data: event
            }));
        } else if (sessionData.globalMetrics && Array.isArray(sessionData.globalMetrics)) {
            // Format local
            this.events = sessionData.globalMetrics.map((metric, index) => ({
                index,
                timestamp: metric.timestamp,
                type: 'iteration',
                data: {
                    type: 'iteration',
                    version: metric.version || index,
                    global: metric,
                    timestamp: metric.timestamp
                }
            }));
        }
        
        console.log(`[ReplayEngine] Loaded ${this.events.length} events`);
        
        // Notifier du chargement
        this.updateUI();
    }
    
    /**
     * Démarre ou reprend le replay
     */
    play() {
        if (this.events.length === 0) return;
        
        this.isPlaying = true;
        this.updateUI();
        
        const interval = this.baseInterval / this.speed;
        
        this.intervalId = setInterval(() => {
            if (this.currentIndex >= this.events.length) {
                this.pause();
                return;
            }
            
            const event = this.events[this.currentIndex];
            this.emitEvent(event);
            this.currentIndex++;
            this.updateUI();
            
        }, interval);
    }
    
    /**
     * Met en pause le replay
     */
    pause() {
        this.isPlaying = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.updateUI();
    }
    
    /**
     * Bascule entre play et pause
     */
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    /**
     * Arrête le replay et revient au début
     */
    stop() {
        this.pause();
        this.currentIndex = 0;
        this.updateUI();
    }
    
    /**
     * Va à un index spécifique
     * @param {number} index - Index de l'événement
     */
    seek(index) {
        const wasPlaying = this.isPlaying;
        this.pause();
        
        this.currentIndex = Math.max(0, Math.min(index, this.events.length - 1));
        
        // Émettre tous les événements jusqu'à cet index pour reconstruire l'état
        for (let i = 0; i <= this.currentIndex; i++) {
            this.emitEvent(this.events[i], true);
        }
        
        this.updateUI();
        
        if (wasPlaying) {
            this.play();
        }
    }
    
    /**
     * Va à un pourcentage de la timeline
     * @param {number} percent - Pourcentage (0-100)
     */
    seekPercent(percent) {
        const index = Math.floor((percent / 100) * (this.events.length - 1));
        this.seek(index);
    }
    
    /**
     * Change la vitesse de replay
     * @param {number} speed - Multiplicateur de vitesse (1, 2, 5, 10)
     */
    setSpeed(speed) {
        this.speed = speed;
        
        // Si en cours de lecture, redémarrer avec la nouvelle vitesse
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }
    
    /**
     * Avance d'un événement
     */
    stepForward() {
        if (this.currentIndex < this.events.length - 1) {
            this.currentIndex++;
            this.emitEvent(this.events[this.currentIndex]);
            this.updateUI();
        }
    }
    
    /**
     * Recule d'un événement
     */
    stepBackward() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            // Reconstruire l'état jusqu'à cet index
            this.seek(this.currentIndex);
        }
    }
    
    /**
     * Émet un événement vers le callback
     * @param {Object} event - Événement à émettre
     * @param {boolean} silent - Si true, ne pas notifier l'UI
     */
    emitEvent(event, silent = false) {
        if (this.onEvent && event && event.data) {
            this.onEvent(event.data);
        }
    }
    
    /**
     * Met à jour l'interface utilisateur
     */
    updateUI() {
        // Mettre à jour les contrôles de replay si présents
        const playBtn = document.querySelector('.replay-play-btn');
        if (playBtn) {
            playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        }
        
        const progress = document.querySelector('.replay-progress');
        if (progress && this.events.length > 0) {
            const percent = (this.currentIndex / (this.events.length - 1)) * 100;
            progress.style.width = `${percent}%`;
        }
        
        const counter = document.querySelector('.replay-counter');
        if (counter) {
            counter.textContent = `${this.currentIndex + 1} / ${this.events.length}`;
        }
    }
    
    /**
     * Retourne l'état actuel du replay
     */
    getState() {
        return {
            isLoaded: this.events.length > 0,
            isPlaying: this.isPlaying,
            currentIndex: this.currentIndex,
            totalEvents: this.events.length,
            speed: this.speed,
            progress: this.events.length > 0 
                ? (this.currentIndex / (this.events.length - 1)) * 100 
                : 0
        };
    }
    
    /**
     * Retourne l'événement actuel
     */
    getCurrentEvent() {
        return this.events[this.currentIndex] || null;
    }
    
    /**
     * Retourne les données de session
     */
    getSessionData() {
        return this.sessionData;
    }
    
    /**
     * Exporte les données de session reconstruites à partir du replay
     */
    exportReconstructedData() {
        if (!this.sessionData) return null;
        
        return {
            session_id: this.sessionData.session_id || 'replay',
            metadata: {
                ...this.sessionData.metadata,
                replay_export_time: new Date().toISOString(),
                replayed_to_index: this.currentIndex
            },
            events: this.events.slice(0, this.currentIndex + 1).map(e => e.data)
        };
    }
}

// Classe utilitaire pour créer des contrôles de replay dans un popup
class ReplayControls {
    constructor(containerId, replayEngine) {
        this.container = document.getElementById(containerId);
        this.engine = replayEngine;
        
        if (this.container) {
            this.render();
            this.bindEvents();
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="replay-controls" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
                <button class="btn replay-play-btn" style="width: 32px; height: 32px; padding: 0;">▶</button>
                <button class="btn replay-step-back" style="width: 32px; height: 32px; padding: 0;">⏮</button>
                <button class="btn replay-step-forward" style="width: 32px; height: 32px; padding: 0;">⏭</button>
                <div class="replay-timeline" style="flex: 1; height: 6px; background: var(--border-color); border-radius: 3px; cursor: pointer; position: relative;">
                    <div class="replay-progress" style="position: absolute; left: 0; top: 0; height: 100%; background: var(--accent-blue); border-radius: 3px; width: 0%;"></div>
                </div>
                <span class="replay-counter" style="font-size: 11px; color: var(--text-secondary); min-width: 60px; text-align: center;">0 / 0</span>
                <select class="replay-speed speed-select" style="width: 50px;">
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                </select>
            </div>
        `;
    }
    
    bindEvents() {
        const playBtn = this.container.querySelector('.replay-play-btn');
        const stepBack = this.container.querySelector('.replay-step-back');
        const stepForward = this.container.querySelector('.replay-step-forward');
        const timeline = this.container.querySelector('.replay-timeline');
        const speedSelect = this.container.querySelector('.replay-speed');
        
        playBtn?.addEventListener('click', () => {
            this.engine.toggle();
            playBtn.textContent = this.engine.isPlaying ? '⏸' : '▶';
        });
        
        stepBack?.addEventListener('click', () => this.engine.stepBackward());
        stepForward?.addEventListener('click', () => this.engine.stepForward());
        
        timeline?.addEventListener('click', (e) => {
            const rect = timeline.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            this.engine.seekPercent(percent);
        });
        
        speedSelect?.addEventListener('change', (e) => {
            this.engine.setSpeed(parseFloat(e.target.value));
        });
    }
    
    update() {
        const state = this.engine.getState();
        
        const playBtn = this.container.querySelector('.replay-play-btn');
        if (playBtn) {
            playBtn.textContent = state.isPlaying ? '⏸' : '▶';
        }
        
        const progress = this.container.querySelector('.replay-progress');
        if (progress) {
            progress.style.width = `${state.progress}%`;
        }
        
        const counter = this.container.querySelector('.replay-counter');
        if (counter) {
            counter.textContent = `${state.currentIndex + 1} / ${state.totalEvents}`;
        }
    }
}

