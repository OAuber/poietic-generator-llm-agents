/**
 * PopupManager - Gestion des fenêtres flottantes pour visualisations
 * Supporte drag, resize, et différents types de popups
 */

class PopupManager {
    constructor(workspace, dataProvider) {
        this.workspace = workspace;
        this.dataProvider = dataProvider;
        this.popups = new Map();
        this.popupCounter = 0;
        this.zIndexCounter = 100;
        
        // Charger la disposition sauvegardée
        this.loadLayout();
    }
    
    // =========================================================================
    // Popup Creation
    // =========================================================================
    
    createPopup(type, initialData = {}) {
        const id = `popup-${++this.popupCounter}`;
        const config = this.getPopupConfig(type);
        
        // Position initiale (cascade)
        const offset = (this.popups.size % 5) * 30;
        const x = 50 + offset;
        const y = 50 + offset;
        
        // Créer l'élément DOM
        const popup = document.createElement('div');
        popup.className = 'popup';
        popup.id = id;
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        popup.style.width = `${config.defaultWidth}px`;
        popup.style.height = `${config.defaultHeight}px`;
        popup.style.zIndex = ++this.zIndexCounter;
        
        popup.innerHTML = `
            <div class="popup-header">
                <div class="popup-title">
                    <span class="icon">${config.icon}</span>
                    <span class="text">${config.title}</span>
                </div>
                <div class="popup-controls">
                    <button class="popup-control minimize" title="Minimize">−</button>
                    <button class="popup-control close" title="Close">×</button>
                </div>
            </div>
            <div class="popup-content">
                ${this.createPopupContent(type, id)}
            </div>
            <div class="popup-resize"></div>
        `;
        
        this.workspace.appendChild(popup);
        
        // Initialiser les interactions
        this.initDrag(popup);
        this.initResize(popup);
        this.initControls(popup, id);
        
        // Créer l'instance de visualisation
        const instance = this.createVisualization(type, id, initialData);
        
        // Stocker
        this.popups.set(id, {
            element: popup,
            type: type,
            instance: instance,
            config: config
        });
        
        // Focus
        popup.addEventListener('mousedown', () => {
            popup.style.zIndex = ++this.zIndexCounter;
        });
        
        // Sauvegarder la disposition
        this.saveLayout();
        
        return id;
    }
    
    getPopupConfig(type) {
        const configs = {
            simplicity: {
                title: 'Simplicity Metrics',
                icon: '📈',
                defaultWidth: 450,
                defaultHeight: 280
            },
            machine: {
                title: 'Machine Metrics',
                icon: '🤖',
                defaultWidth: 450,
                defaultHeight: 280
            },
            prediction: {
                title: 'Prediction Errors',
                icon: '🎯',
                defaultWidth: 450,
                defaultHeight: 280
            },
            ranking: {
                title: 'Agent Ranking',
                icon: '🏆',
                defaultWidth: 350,
                defaultHeight: 400
            },
            scatter: {
                title: 'Scatter Plot',
                icon: '🔵',
                defaultWidth: 400,
                defaultHeight: 350
            },
            heatmap: {
                title: 'Correlation Heatmap',
                icon: '🟦',
                defaultWidth: 400,
                defaultHeight: 400
            },
            spatial: {
                title: 'Spatial Heatmap',
                icon: '🗺️',
                defaultWidth: 350,
                defaultHeight: 350
            },
            canvas: {
                title: 'Canvas Replay',
                icon: '🖼️',
                defaultWidth: 420,
                defaultHeight: 420
            },
            verbatim: {
                title: 'Verbatim (S+W machines)',
                icon: '💬',
                defaultWidth: 400,
                defaultHeight: 350
            },
            'verbatim-on': {
                title: 'Verbatim (O+N machines)',
                icon: '📝',
                defaultWidth: 400,
                defaultHeight: 350
            },
            viewer: {
                title: 'Real-time Viewer',
                icon: '👁️',
                defaultWidth: 450,
                defaultHeight: 450
            },
            signalling: {
                title: 'Rank vs Signalling Cost',
                icon: '📊',
                defaultWidth: 450,
                defaultHeight: 350
            },
            'quantum-coherence': {
                title: 'Quantum Coherence',
                icon: '⚛️',
                defaultWidth: 450,
                defaultHeight: 300
            },
            'narrative-convergence': {
                title: 'Narrative Convergence',
                icon: '🌀',
                defaultWidth: 450,
                defaultHeight: 300
            },
            'quantum-overview': {
                title: 'Quantum State Overview',
                icon: '✨',
                defaultWidth: 500,
                defaultHeight: 400
            },
            'quantum-verbatim': {
                title: 'O+N Verbatim (Quantum)',
                icon: '📖',
                defaultWidth: 500,
                defaultHeight: 450
            },
        };
        
        return configs[type] || configs.simplicity;
    }
    
    createPopupContent(type, id) {
        switch (type) {
            case 'simplicity':
                return `
                    <div class="metrics-row">
                        <div class="metric-box">
                            <div class="metric-label">C_w</div>
                            <div class="metric-value" id="${id}-cw">0</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">C_d</div>
                            <div class="metric-value" id="${id}-cd">0</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">U</div>
                            <div class="metric-value" id="${id}-u">0</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #4A90E2;"></div>
                            <span>C_w</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #E24A4A;"></div>
                            <span>C_d</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #4AE290;"></div>
                            <span>U</span>
                        </div>
                    </div>
                `;
                
            case 'machine':
                return `
                    <div class="metrics-row">
                        <div class="metric-box">
                            <div class="metric-label">C_w_machine</div>
                            <div class="metric-value" id="${id}-cw-machine">0</div>
                            <div class="metric-subtitle" id="${id}-cw-tokens" style="font-size: 10px; color: var(--text-secondary);">0 tokens</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">C_d_machine</div>
                            <div class="metric-value" id="${id}-cd-machine">0</div>
                            <div class="metric-subtitle" id="${id}-cd-tokens" style="font-size: 10px; color: var(--text-secondary);">0 tokens</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">U_machine</div>
                            <div class="metric-value" id="${id}-u-machine">0</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #8B5CF6;"></div>
                            <span>C_w_machine</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #F59E0B;"></div>
                            <span>C_d_machine</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #10B981;"></div>
                            <span>U_machine</span>
                        </div>
                    </div>
                `;
                
            case 'prediction':
                return `
                    <div class="metrics-row">
                        <div class="metric-box">
                            <div class="metric-label">Current</div>
                            <div class="metric-value" id="${id}-current">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Mean</div>
                            <div class="metric-value" id="${id}-mean">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Std</div>
                            <div class="metric-value" id="${id}-std">0.00</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #28a745;"></div>
                            <span>Mean</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #dc3545; height: 2px; border-style: dashed;"></div>
                            <span>Std</span>
                        </div>
                    </div>
                `;
                
            case 'ranking':
                return `
                    <table class="ranking-table" id="${id}-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Agent</th>
                                <th>Type</th>
                                <th>Avg Error</th>
                                <th>Iterations</th>
                            </tr>
                        </thead>
                        <tbody id="${id}-tbody">
                            <tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No data yet</td></tr>
                        </tbody>
                    </table>
                `;
                
            case 'scatter':
                return `
                    <div style="margin-bottom: 10px; display: flex; gap: 10px; align-items: center;">
                        <select id="${id}-x-axis" class="speed-select" style="flex: 1;">
                            <option value="C_w">C_w</option>
                            <option value="C_d">C_d</option>
                            <option value="U">U</option>
                            <option value="mean_error" selected>Mean Error</option>
                            <option value="std_error">Std Error</option>
                            <option value="avg_signalling_cost">Avg Signalling Cost</option>
                            <option value="phi_coherence">φ (Formal Resonance)</option>
                            <option value="xi_correlation_length">ξ (Collective Extent)</option>
                            <option value="I_fringe_visibility">I (Pareidolic Contrast)</option>
                            <option value="tau_condensation">τ (Narrative Convergence)</option>
                            <option value="delta_S_entropy">ΔS (Complexity Flux)</option>
                        </select>
                        <span>vs</span>
                        <select id="${id}-y-axis" class="speed-select" style="flex: 1;">
                            <option value="C_w">C_w</option>
                            <option value="C_d">C_d</option>
                            <option value="U" selected>U</option>
                            <option value="mean_error">Mean Error</option>
                            <option value="std_error">Std Error</option>
                            <option value="avg_signalling_cost">Avg Signalling Cost</option>
                            <option value="phi_coherence">φ (Formal Resonance)</option>
                            <option value="xi_correlation_length">ξ (Collective Extent)</option>
                            <option value="I_fringe_visibility">I (Pareidolic Contrast)</option>
                            <option value="tau_condensation">τ (Narrative Convergence)</option>
                            <option value="delta_S_entropy">ΔS (Complexity Flux)</option>
                        </select>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                `;
                
            case 'heatmap':
                return `
                    <div class="chart-container">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                `;
                
            case 'spatial':
                return `
                    <div style="margin-bottom: 10px;">
                        <select id="${id}-metric" class="speed-select" style="width: 100%;">
                            <option value="prediction_error" selected>Current Prediction Error</option>
                            <option value="avg_error">Avg Prediction Error</option>
                            <option value="delta_C_w">ΔC_w</option>
                            <option value="delta_C_d">ΔC_d</option>
                            <option value="U_expected">U Expected</option>
                            <option value="avg_signalling_cost">Avg Signalling Cost</option>
                        </select>
                    </div>
                    <div class="chart-container">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                `;
                
            case 'canvas':
                return `
                    <div class="chart-container" style="display: flex; align-items: center; justify-content: center;">
                        <canvas id="${id}-canvas" width="400" height="400" style="border: 1px solid var(--border-color); border-radius: 4px;"></canvas>
                    </div>
                    <div class="replay-controls" id="${id}-controls" style="margin-top: 10px;">
                        <button class="btn" id="${id}-play">▶</button>
                        <div class="timeline" id="${id}-timeline">
                            <div class="timeline-progress" id="${id}-progress" style="width: 0%;"></div>
                        </div>
                        <select class="speed-select" id="${id}-speed">
                            <option value="1">1x</option>
                            <option value="2">2x</option>
                            <option value="5">5x</option>
                            <option value="10">10x</option>
                        </select>
                    </div>
                `;
                
            case 'verbatim':
                return `
                    <div id="${id}-stream" style="height: 100%; overflow-y: auto; font-family: monospace; font-size: 11px; line-height: 1.4;">
                        <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                            Waiting for W machine responses...
                        </div>
                    </div>
                `;
            case 'verbatim-on':
                return `
                    <div id="${id}-stream" style="height: 100%; overflow-y: auto; font-family: monospace; font-size: 11px; line-height: 1.4;">
                        <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                            Waiting for O and N machine responses...
                        </div>
                    </div>
                `;
            
            case 'viewer':
                return `
                    <iframe 
                        id="${id}-iframe"
                        src="viewer2.html" 
                        style="width: 100%; height: 100%; border: none; border-radius: 4px; overflow: hidden;"
                    ></iframe>
                `;
            
            case 'signalling':
                return `
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #58a6ff;"></div>
                            <span>Avg Pixels Change</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #a371f7;"></div>
                            <span>Avg Signalling Tokens</span>
                        </div>
                    </div>
                `;
                
            case 'quantum-coherence':
                return `
                    <div class="metrics-row">
                        <div class="metric-box">
                            <div class="metric-label">φ (Formal Resonance)</div>
                            <div class="metric-value" id="${id}-phi" style="color: #00d4ff;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">ξ (Collective Extent)</div>
                            <div class="metric-value" id="${id}-xi" style="color: #8080ff;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">I (Pareidolic Contrast)</div>
                            <div class="metric-value" id="${id}-I" style="color: #ff80ff;">0.00</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #00d4ff;"></div>
                            <span>φ-coherence</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #8080ff;"></div>
                            <span>ξ/3</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #ff80ff;"></div>
                            <span>I-visibility</span>
                        </div>
                    </div>
                `;
                
            case 'narrative-convergence':
                return `
                    <div class="metrics-row">
                        <div class="metric-box">
                            <div class="metric-label">τ (Narrative Convergence)</div>
                            <div class="metric-value" id="${id}-tau" style="color: #ffcc00;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">ΔS (Complexity Flux)</div>
                            <div class="metric-value" id="${id}-dS" style="color: #ffff80;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Regime</div>
                            <div class="metric-value" id="${id}-regime" style="font-size: 14px;">-</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #ffcc00;"></div>
                            <span>τ-condensation</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #ffff80;"></div>
                            <span>ΔS-entropy</span>
                        </div>
                    </div>
                `;
                
            case 'quantum-overview':
                return `
                    <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Current Regime:</div>
                        <div id="${id}-regime" style="font-size: 14px; font-weight: 600; color: var(--text-primary);">Awaiting data...</div>
                    </div>
                    <div class="metrics-row" style="margin-bottom: 8px;">
                        <div class="metric-box">
                            <div class="metric-label">φ (Formal Resonance)</div>
                            <div class="metric-value" id="${id}-phi" style="color: #00d4ff;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">τ (Narrative Convergence)</div>
                            <div class="metric-value" id="${id}-tau" style="color: #ffcc00;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">U (Emergence)</div>
                            <div class="metric-value" id="${id}-U" style="color: #3fb950;">0</div>
                        </div>
                    </div>
                    <div class="metrics-row" style="margin-bottom: 8px;">
                        <div class="metric-box">
                            <div class="metric-label">ξ (Collective Extent)</div>
                            <div class="metric-value" id="${id}-xi" style="color: #8080ff; font-size: 16px;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">I (Pareidolic Contrast)</div>
                            <div class="metric-value" id="${id}-I" style="color: #ff80ff; font-size: 16px;">0.00</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">ΔS (Complexity Flux)</div>
                            <div class="metric-value" id="${id}-dS" style="color: #ffff80; font-size: 16px;">0.00</div>
                        </div>
                    </div>
                    <div class="chart-container" style="overflow: hidden; flex: 1; min-height: 0;">
                        <canvas id="${id}-chart"></canvas>
                    </div>
                `;
                
            case 'quantum-verbatim':
                return `
                    <div id="${id}-stream" style="height: 100%; overflow-y: auto; font-family: monospace; font-size: 11px; line-height: 1.4;">
                        <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                            Waiting for O+N quantum snapshot...
                        </div>
                    </div>
                `;
                
            case 'quantum-rankings':
                return `
                    <table class="ranking-table" id="${id}-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Position</th>
                                <th>Avg Error</th>
                                <th>Iterations</th>
                            </tr>
                        </thead>
                        <tbody id="${id}-tbody">
                            <tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No data yet</td></tr>
                        </tbody>
                    </table>
                `;
                
            default:
                return '<div class="empty-state"><div class="message">Unknown visualization type</div></div>';
        }
    }
    
    createVisualization(type, id, data) {
        const instance = { type, id, data: {} };
        
        // Initialiser selon le type
        switch (type) {
            case 'simplicity':
            case 'machine':
            case 'prediction':
                instance.chart = null;
                instance.history = [];
                break;
                
            case 'scatter':
                instance.chart = null;
                // Bind select changes
                setTimeout(() => {
                    const xSelect = document.getElementById(`${id}-x-axis`);
                    const ySelect = document.getElementById(`${id}-y-axis`);
                    if (xSelect && ySelect) {
                        xSelect.addEventListener('change', () => this.updatePopup(id, data));
                        ySelect.addEventListener('change', () => this.updatePopup(id, data));
                    }
                }, 100);
                break;
                
            case 'spatial':
                setTimeout(() => {
                    const select = document.getElementById(`${id}-metric`);
                    if (select) {
                        select.addEventListener('change', () => this.updatePopup(id, data));
                    }
                }, 100);
                break;
                
            case 'canvas':
                instance.isPlaying = false;
                instance.currentFrame = 0;
                setTimeout(() => {
                    const playBtn = document.getElementById(`${id}-play`);
                    if (playBtn) {
                        playBtn.addEventListener('click', () => {
                            instance.isPlaying = !instance.isPlaying;
                            playBtn.textContent = instance.isPlaying ? '⏸' : '▶';
                        });
                    }
                }, 100);
                break;
                
            case 'quantum-coherence':
            case 'narrative-convergence':
            case 'quantum-overview':
                instance.chart = null;
                instance.history = [];
                break;
        }
        
        return instance;
    }
    
    // =========================================================================
    // Drag & Resize
    // =========================================================================
    
    initDrag(popup) {
        const header = popup.querySelector('.popup-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.popup-controls')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = popup.offsetLeft;
            startTop = popup.offsetTop;
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            popup.style.left = `${startLeft + dx}px`;
            popup.style.top = `${startTop + dy}px`;
        };
        
        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.saveLayout();
        };
    }
    
    initResize(popup) {
        const resizer = popup.querySelector('.popup-resize');
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = popup.offsetWidth;
            startHeight = popup.offsetHeight;
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
        
        const onMouseMove = (e) => {
            if (!isResizing) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            const newWidth = Math.max(300, startWidth + dx);
            const newHeight = Math.max(200, startHeight + dy);
            
            popup.style.width = `${newWidth}px`;
            popup.style.height = `${newHeight}px`;
            
            // Redessiner les charts
            const popupData = this.popups.get(popup.id);
            if (popupData && popupData.instance) {
                this.updatePopup(popup.id, window.aiMetrics?.sessionData || {});
            }
        };
        
        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.saveLayout();
        };
    }
    
    initControls(popup, id) {
        const closeBtn = popup.querySelector('.popup-control.close');
        const minimizeBtn = popup.querySelector('.popup-control.minimize');
        
        closeBtn.addEventListener('click', () => {
            this.closePopup(id);
        });
        
        minimizeBtn.addEventListener('click', () => {
            const content = popup.querySelector('.popup-content');
            const resize = popup.querySelector('.popup-resize');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                resize.style.display = 'block';
                minimizeBtn.textContent = '−';
            } else {
                content.style.display = 'none';
                resize.style.display = 'none';
                minimizeBtn.textContent = '+';
            }
        });
    }
    
    // =========================================================================
    // Update Methods
    // =========================================================================
    
    updateAll(data) {
        for (const [id, popup] of this.popups) {
            this.updatePopup(id, data);
        }
    }
    
    updatePopup(id, data) {
        const popup = this.popups.get(id);
        if (!popup) return;
        
        switch (popup.type) {
            case 'simplicity':
                this.updateSimplicityPopup(id, popup, data);
                break;
            case 'machine':
                this.updateMachinePopup(id, popup, data);
                break;
            case 'prediction':
                this.updatePredictionPopup(id, popup, data);
                break;
            case 'ranking':
                this.updateRankingPopup(id, popup, data);
                break;
            case 'scatter':
                this.updateScatterPopup(id, popup, data);
                break;
            case 'heatmap':
                this.updateHeatmapPopup(id, popup, data);
                break;
            case 'spatial':
                this.updateSpatialPopup(id, popup, data);
                break;
            case 'canvas':
                this.updateCanvasPopup(id, popup, data);
                break;
            case 'verbatim':
                this.updateVerbatimWPopup(id, popup, data);
                break;
            case 'verbatim-on':
                this.updateVerbatimONPopup(id, popup, data);
                break;
            case 'signalling':
                this.updateSignallingPopup(id, popup, data);
                break;
            case 'quantum-coherence':
                this.updateQuantumCoherencePopup(id, popup, data);
                break;
            case 'narrative-convergence':
                this.updateNarrativeConvergencePopup(id, popup, data);
                break;
            case 'quantum-overview':
                this.updateQuantumOverviewPopup(id, popup, data);
                break;
            case 'quantum-verbatim':
                this.updateQuantumVerbatimPopup(id, popup, data);
                break;
        }
    }
    
    updateSimplicityPopup(id, popup, data) {
        const metrics = data.globalMetrics || [];
        if (metrics.length === 0) return;
        
        const latest = metrics[metrics.length - 1];
        
        // Mettre à jour les valeurs
        const cwEl = document.getElementById(`${id}-cw`);
        const cdEl = document.getElementById(`${id}-cd`);
        const uEl = document.getElementById(`${id}-u`);
        
        if (cwEl) cwEl.textContent = Math.round(latest.C_w || 0);
        if (cdEl) cdEl.textContent = Math.round(latest.C_d || 0);
        if (uEl) {
            const u = Math.round(latest.U || 0);
            uEl.textContent = u;
            uEl.className = `metric-value ${u >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Dessiner le graphique
        this.drawLineChart(id, metrics, ['C_w', 'C_d', 'U'], ['#4A90E2', '#E24A4A', '#4AE290']);
    }
    
    updateMachinePopup(id, popup, data) {
        // Extraire les métriques machine depuis les événements d'itération
        const events = data.events || [];
        const machineMetrics = [];
        
        // Parcourir les événements d'itération pour extraire machine_metrics
        events.forEach(event => {
            if (event.type === 'iteration' && event.data?.n_snapshot?.machine_metrics) {
                const mm = event.data.n_snapshot.machine_metrics;
                machineMetrics.push({
                    version: event.data.version || machineMetrics.length,
                    C_w_machine: mm.C_w_machine?.value || 0,
                    C_d_machine: mm.C_d_machine?.value || 0,
                    U_machine: mm.U_machine?.value || 0,
                    C_w_machine_tokens: mm.C_w_machine?.tokens || 0,
                    C_d_machine_tokens: mm.C_d_machine?.tokens || 0,
                    timestamp: event.timestamp
                });
            }
        });
        
        // Si pas de données dans les événements, essayer globalMetrics
        if (machineMetrics.length === 0) {
            const metrics = data.globalMetrics || [];
            metrics.forEach((m, idx) => {
                if (m.C_w_machine !== undefined || m.C_d_machine !== undefined) {
                    machineMetrics.push({
                        version: m.version || idx,
                        C_w_machine: m.C_w_machine || 0,
                        C_d_machine: m.C_d_machine || 0,
                        U_machine: m.U_machine || 0,
                        C_w_machine_tokens: m.C_w_machine_tokens || 0,
                        C_d_machine_tokens: m.C_d_machine_tokens || 0,
                        timestamp: m.timestamp
                    });
                }
            });
        }
        
        if (machineMetrics.length === 0) return;
        
        const latest = machineMetrics[machineMetrics.length - 1];
        
        // Mettre à jour les valeurs
        const cwMachineEl = document.getElementById(`${id}-cw-machine`);
        const cdMachineEl = document.getElementById(`${id}-cd-machine`);
        const uMachineEl = document.getElementById(`${id}-u-machine`);
        const cwTokensEl = document.getElementById(`${id}-cw-tokens`);
        const cdTokensEl = document.getElementById(`${id}-cd-tokens`);
        
        if (cwMachineEl) cwMachineEl.textContent = Math.round(latest.C_w_machine || 0);
        if (cdMachineEl) cdMachineEl.textContent = Math.round(latest.C_d_machine || 0);
        if (uMachineEl) {
            const u = Math.round(latest.U_machine || 0);
            uMachineEl.textContent = u;
            uMachineEl.className = `metric-value ${u >= 0 ? 'positive' : 'negative'}`;
        }
        if (cwTokensEl) cwTokensEl.textContent = `${latest.C_w_machine_tokens || 0} tokens`;
        if (cdTokensEl) cdTokensEl.textContent = `${latest.C_d_machine_tokens || 0} tokens`;
        
        // Dessiner le graphique
        this.drawLineChart(id, machineMetrics, ['C_w_machine', 'C_d_machine', 'U_machine'], ['#8B5CF6', '#F59E0B', '#10B981']);
    }
    
    updatePredictionPopup(id, popup, data) {
        const metrics = data.globalMetrics || [];
        if (metrics.length === 0) return;
        
        const latest = metrics[metrics.length - 1];
        
        // Mettre à jour les valeurs
        const currentEl = document.getElementById(`${id}-current`);
        const meanEl = document.getElementById(`${id}-mean`);
        const stdEl = document.getElementById(`${id}-std`);
        
        if (currentEl) currentEl.textContent = (latest.mean_error || 0).toFixed(2);
        if (meanEl) meanEl.textContent = (latest.mean_error || 0).toFixed(2);
        if (stdEl) stdEl.textContent = (latest.std_error || 0).toFixed(2);
        
        // Dessiner le graphique
        this.drawLineChart(id, metrics, ['mean_error', 'std_error'], ['#28a745', '#dc3545'], [false, true]);
    }
    
    updateRankingPopup(id, popup, data) {
        const rankings = data.rankings || {};
        const tbody = document.getElementById(`${id}-tbody`);
        if (!tbody) return;
        
        // Dédupliquer par agent_id (garder la dernière entrée si doublon)
        const uniqueRankings = {};
        for (const [agentId, info] of Object.entries(rankings)) {
            if (info && typeof info === 'object') {
                uniqueRankings[agentId] = info;
            }
        }
        
        const agents = Object.entries(uniqueRankings)
            .sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999));
        
        if (agents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No data yet</td></tr>';
            return;
        }
        
        // Créer un Set pour tracker les positions déjà vues (pour détecter les vrais doublons)
        const seenPositions = new Set();
        const rows = [];
        
        for (const [agentId, info] of agents) {
            const agentData = data.agentMetrics?.[agentId] || {};
            const agentType = agentData.type || 'ai';
            const typeClass = agentType === 'ai' ? 'ai-agent' : 'human-agent';
            const typeIcon = agentType === 'ai' ? '🤖' : '👤';
            
            // Utiliser la position de agentMetrics si disponible, sinon celle de rankings
            const position = agentData.position || info.position || [null, null];
            const posX = position[0] !== null && position[0] !== undefined ? position[0] : '?';
            const posY = position[1] !== null && position[1] !== undefined ? position[1] : '?';
            const posKey = `${posX},${posY}`;
            
            // Si même position mais agent_id différent, c'est probablement un doublon - on garde le premier
            if (posX !== '?' && posY !== '?' && seenPositions.has(posKey)) {
                console.warn(`[PopupManager] Duplicate position [${posX},${posY}] for agent ${agentId}, skipping`);
                continue;
            }
            
            if (posX !== '?' && posY !== '?') {
                seenPositions.add(posKey);
            }
            
            rows.push(`
                <tr>
                    <td class="rank">#${info.rank || '-'}</td>
                    <td>[${posX},${posY}]</td>
                    <td class="${typeClass}">${typeIcon} ${agentType.toUpperCase()}</td>
                    <td>${(info.avg_error || 0).toFixed(3)}</td>
                    <td>${info.total_iterations || 0}</td>
                </tr>
            `);
        }
        
        tbody.innerHTML = rows.join('');
    }
    
    updateScatterPopup(id, popup, data) {
        const metrics = data.globalMetrics || [];
        const events = data.events || [];
        if (metrics.length < 2) return;
        
        // Créer un map des versions -> agents pour accès rapide
        const versionToAgents = new Map();
        events.forEach(e => {
            if (e.type === 'iteration' && e.data?.agents && Array.isArray(e.data.agents)) {
                const version = e.data.version;
                if (version !== undefined) {
                    versionToAgents.set(version, e.data.agents);
                }
            }
        });
        
        // Enrichir les métriques avec avg_signalling_cost et métriques quantiques
        const quantumHistory = data.quantumHistory || {};
        const enrichedMetrics = metrics.map((m, index) => {
            const version = m.version !== undefined ? m.version : index;
            
            // Récupérer les agents pour cette version depuis les événements d'itération
            const agents = versionToAgents.get(version) || [];
            
            // Calculer la moyenne des signalling_tokens pour cette itération
            let avgSignallingCost = 0;
            if (agents.length > 0) {
                const signallingTokens = agents
                    .map(agent => {
                        // Vérifier plusieurs chemins possibles pour signalling_tokens
                        if (agent.signalling_tokens && typeof agent.signalling_tokens === 'object') {
                            return agent.signalling_tokens.signalling;
                        } else if (typeof agent.signalling_tokens === 'number') {
                            return agent.signalling_tokens;
                        }
                        return null;
                    })
                    .filter(v => v !== null && v !== undefined && !isNaN(v));
                
                if (signallingTokens.length > 0) {
                    const sum = signallingTokens.reduce((a, b) => a + b, 0);
                    avgSignallingCost = sum / signallingTokens.length;
                }
            }
            
            // Ajouter les métriques quantiques depuis quantumHistory (index correspond à version)
            const enriched = {
                ...m,
                avg_signalling_cost: avgSignallingCost
            };
            
            // Ajouter métriques quantiques si disponibles (chercher par version dans quantumHistory)
            if (quantumHistory.versions && quantumHistory.phi_coherence) {
                const qIndex = quantumHistory.versions.indexOf(version);
                if (qIndex >= 0) {
                    enriched.phi_coherence = quantumHistory.phi_coherence[qIndex];
                    enriched.xi_correlation_length = quantumHistory.xi_correlation_length?.[qIndex];
                    enriched.I_fringe_visibility = quantumHistory.I_fringe_visibility?.[qIndex];
                    enriched.tau_condensation = quantumHistory.tau_condensation?.[qIndex];
                    enriched.delta_S_entropy = quantumHistory.delta_S_entropy?.[qIndex];
                }
            }
            
            return enriched;
        });
        
        const xAxis = document.getElementById(`${id}-x-axis`)?.value || 'mean_error';
        const yAxis = document.getElementById(`${id}-y-axis`)?.value || 'U';
        
        this.drawScatterChart(id, enrichedMetrics, xAxis, yAxis);
    }
    
    updateHeatmapPopup(id, popup, data) {
        const metrics = data.globalMetrics || [];
        const events = data.events || [];
        if (metrics.length < 5) return;
        
        // Créer un map des versions -> agents pour accès rapide
        const versionToAgents = new Map();
        events.forEach(e => {
            if (e.type === 'iteration' && e.data?.agents && Array.isArray(e.data.agents)) {
                const version = e.data.version;
                if (version !== undefined) {
                    versionToAgents.set(version, e.data.agents);
                }
            }
        });
        
        // Calculer avg_signalling_cost pour chaque itération depuis les événements d'itération
        const enrichedMetrics = metrics.map((m, index) => {
            const version = m.version !== undefined ? m.version : index;
            
            // Récupérer les agents pour cette version depuis les événements d'itération
            const agents = versionToAgents.get(version) || [];
            
            // Calculer la moyenne des signalling_tokens pour cette itération
            let avgSignallingCost = 0;
            if (agents.length > 0) {
                const signallingTokens = agents
                    .map(agent => {
                        // Vérifier plusieurs chemins possibles pour signalling_tokens
                        if (agent.signalling_tokens && typeof agent.signalling_tokens === 'object') {
                            return agent.signalling_tokens.signalling;
                        } else if (typeof agent.signalling_tokens === 'number') {
                            return agent.signalling_tokens;
                        }
                        return null;
                    })
                    .filter(v => v !== null && v !== undefined && !isNaN(v));
                
                if (signallingTokens.length > 0) {
                    const sum = signallingTokens.reduce((a, b) => a + b, 0);
                    avgSignallingCost = sum / signallingTokens.length;
                }
            }
            
            return {
                ...m,
                avg_signalling_cost: avgSignallingCost
            };
        });
        
        this.drawCorrelationHeatmap(id, enrichedMetrics);
    }
    
    updateSpatialPopup(id, popup, data) {
        const agentMetrics = data.agentMetrics || {};
        const rankings = data.rankings || {};
        const events = data.events || [];
        const metricKey = document.getElementById(`${id}-metric`)?.value || 'prediction_error';
        
        // Calculer avg_signalling_cost pour chaque agent depuis les événements d'itération
        // (même méthode que Scatter Plot et Correlation Heatmap)
        const signallingHistory = {}; // agentId -> [tokens, tokens, ...]
        
        // Parcourir tous les événements d'itération pour collecter les signalling_tokens par agent
        events.forEach(e => {
            if (e.type === 'iteration' && e.data?.agents && Array.isArray(e.data.agents)) {
                e.data.agents.forEach(agent => {
                    if (!agent || !agent.id) return;
                    
                    const agentId = agent.id;
                    if (!signallingHistory[agentId]) {
                        signallingHistory[agentId] = [];
                    }
                    
                    // Extraire signalling_tokens (même logique que Scatter Plot)
                    let signallingTokens = null;
                    if (agent.signalling_tokens && typeof agent.signalling_tokens === 'object') {
                        signallingTokens = agent.signalling_tokens.signalling;
                    } else if (typeof agent.signalling_tokens === 'number') {
                        signallingTokens = agent.signalling_tokens;
                    }
                    
                    if (signallingTokens !== null && signallingTokens !== undefined && !isNaN(signallingTokens)) {
                        signallingHistory[agentId].push(signallingTokens);
                    }
                });
            }
        });
        
        // Fusionner les données d'agents avec les rankings pour avoir avg_error et avg_signalling_cost
        const enrichedAgents = {};
        for (const [agentId, agent] of Object.entries(agentMetrics)) {
            // Calculer avg_signalling_cost depuis l'historique collecté
            let avgSignallingCost = 0;
            if (signallingHistory[agentId] && signallingHistory[agentId].length > 0) {
                const sum = signallingHistory[agentId].reduce((a, b) => a + b, 0);
                avgSignallingCost = sum / signallingHistory[agentId].length;
            } else if (agent.signalling_tokens) {
                // Fallback: utiliser la valeur actuelle si pas d'historique
                if (typeof agent.signalling_tokens === 'object') {
                    avgSignallingCost = agent.signalling_tokens.signalling || 0;
                } else if (typeof agent.signalling_tokens === 'number') {
                    avgSignallingCost = agent.signalling_tokens;
                }
            }
            
            enrichedAgents[agentId] = {
                ...agent,
                avg_error: rankings[agentId]?.avg_error || 0,
                avg_signalling_cost: avgSignallingCost
            };
        }
        
        this.drawSpatialHeatmap(id, enrichedAgents, metricKey);
    }
    
    updateCanvasPopup(id, popup, data) {
        const snapshots = data.canvasSnapshots || [];
        if (snapshots.length === 0) return;
        
        const canvas = document.getElementById(`${id}-canvas`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const latest = snapshots[snapshots.length - 1];
        
        if (latest.data) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = latest.data;
        }
        
        // Mettre à jour la timeline
        const progress = document.getElementById(`${id}-progress`);
        if (progress && popup.instance) {
            const pct = (popup.instance.currentFrame / Math.max(1, snapshots.length - 1)) * 100;
            progress.style.width = `${pct}%`;
        }
    }
    
    // Popup pour S et W machines (avec stratégies et itération)
    updateVerbatimWPopup(id, popup, data) {
        const stream = document.getElementById(`${id}-stream`);
        if (!stream) return;
        
        // Collecter les verbatim S et W
        let verbatimEntries = [];
        
        // CRITICAL FIX: Utiliser un Map pour dédupliquer par agentId-iteration (pas version)
        // car un agent peut avoir plusieurs actions dans la même version globale
        const wEntriesMap = new Map(); // Clé: agentId-iteration, Valeur: entrée
        const sEntriesMap = new Map(); // Clé: agentId-iteration, Valeur: entrée
        
        // 1. Verbatim des agents S depuis les événements 'agent' avec iteration === 0
        const allAgentEvents = (data.events || [])
            .filter(e => e.type === 'agent' && e.data);
        
        allAgentEvents.forEach(e => {
            const agent = e.data;
            if (!agent || agent.type !== 'ai' || !agent.id) return;
            
            const agentIteration = agent.iteration !== undefined ? agent.iteration : (agent.version || 0);
            if (agentIteration !== 0) return; // Seulement S (iteration === 0)
            
            const agentId = agent.id;
            const entryKey = `S-${agentId}-${agentIteration}`;
            const timestamp = e.timestamp || agent.timestamp || new Date().toISOString();
            
            // Extraire les informations du seed
            const seed = agent.seed || {};
            const concept = seed.concept || agent.concept || '';
            const reference = seed.reference || agent.reference || '';
            const quantumMeasures = agent.quantum_measures || seed.quantum_measures || {};
            
            let sText = '';
            if (concept) {
                sText = `CONCEPT: ${concept}\n`;
            }
            if (reference) {
                sText += `REFERENCE: ${reference}\n`;
            }
            if (Object.keys(quantumMeasures).length > 0) {
                sText += `\nQUANTUM MEASURES:\n`;
                if (quantumMeasures.psi_distinctiveness !== undefined) {
                    sText += `  Ψ-distinctiveness: ${quantumMeasures.psi_distinctiveness.toFixed(2)}\n`;
                }
                if (quantumMeasures.eta_potential !== undefined) {
                    sText += `  η-potential: ${quantumMeasures.eta_potential.toFixed(2)}\n`;
                }
                if (quantumMeasures.lambda_coherence !== undefined) {
                    sText += `  λ-coherence: ${quantumMeasures.lambda_coherence.toFixed(2)}\n`;
                }
            }
            if (seed.rationale || agent.rationale) {
                sText += `\nRATIONALE: ${seed.rationale || agent.rationale}\n`;
            }
            
            const content = sText.trim();
            if (content) {
                const existing = sEntriesMap.get(entryKey);
                const existingTime = existing ? new Date(existing.timestamp).getTime() : 0;
                const newTime = new Date(timestamp).getTime();
                
                if (!existing || newTime > existingTime) {
                    sEntriesMap.set(entryKey, {
                        type: 'S',
                        id: agentId,
                        position: agent.position || [0, 0],
                        strategy_id: '',
                        strategy_ids: [],
                        iteration: agentIteration,
                        version: agent.version || 0,
                        content: content,
                        timestamp: timestamp
                    });
                }
            }
        });
        
        // 2. Verbatim des agents W depuis les événements d'itération
        const allIterationEvents = (data.events || [])
            .filter(e => e.type === 'iteration');
        
        allIterationEvents.forEach(e => {
            const eventData = e.data || e;
            const version = eventData.version || 0;
            const timestamp = e.timestamp || eventData.timestamp || new Date().toISOString();
            
            // Parcourir les agents de cette itération
            if (eventData.agents && Array.isArray(eventData.agents)) {
                eventData.agents.forEach(agent => {
                    if (!agent || agent.type !== 'ai' || !agent.id) return;
                    
                    const agentId = agent.id;
                    const agentIteration = agent.iteration !== undefined ? agent.iteration : version;
                    
                    // Distinguer S (iteration === 0) de W (iteration > 0)
                    const isSeed = agentIteration === 0;
                    const entryKey = isSeed ? `S-${agentId}-${agentIteration}` : `W-${agentId}-${agentIteration}`;
                    const targetMap = isSeed ? sEntriesMap : wEntriesMap;
                    
                    let content = agent.verbatim_summary || agent.rationale || agent.strategy || '';
                    if (!content) return;
                    
                    // Pour S: extraire les informations du seed
                    if (isSeed) {
                        // Format S: extraire concept, reference, quantum_measures
                        const seed = agent.seed || {};
                        const concept = seed.concept || '';
                        const reference = seed.reference || '';
                        const quantumMeasures = agent.quantum_measures || seed.quantum_measures || {};
                        
                        let sText = '';
                        if (concept) {
                            sText = `CONCEPT: ${concept}\n`;
                        }
                        if (reference) {
                            sText += `REFERENCE: ${reference}\n`;
                        }
                        if (Object.keys(quantumMeasures).length > 0) {
                            sText += `\nQUANTUM MEASURES:\n`;
                            if (quantumMeasures.psi_distinctiveness !== undefined) {
                                sText += `  Ψ-distinctiveness: ${quantumMeasures.psi_distinctiveness.toFixed(2)}\n`;
                            }
                            if (quantumMeasures.eta_potential !== undefined) {
                                sText += `  η-potential: ${quantumMeasures.eta_potential.toFixed(2)}\n`;
                            }
                            if (quantumMeasures.lambda_coherence !== undefined) {
                                sText += `  λ-coherence: ${quantumMeasures.lambda_coherence.toFixed(2)}\n`;
                            }
                        }
                        if (seed.rationale) {
                            sText += `\nRATIONALE: ${seed.rationale}\n`;
                        }
                        
                        content = sText.trim() || content;
                    } else {
                        // Pour W: supprimer la ligne "ΔC_w: ..." si elle existe
                        content = content.replace(/ΔC_w:\s*[\d.-]+\s*\|\s*ΔC_d:\s*[\d.-]+\s*\|\s*Error:\s*[\d.-]+/gi, '').trim();
                        content = content.replace(/ΔC_w:\s*[\d.-]+\s*\|\s*ΔC_d:\s*[\d.-]+\s*\|\s*U.*?expected:\s*[\d.-]+/gi, '').trim();
                    }
                    
                    if (!content) return;
                    
                    // CRITICAL FIX: Stocker aussi strategy_ids si disponible (pour combinaisons)
                    const strategy_ids = agent.strategy_ids || (agent.strategy_id ? [agent.strategy_id] : []);
                    const strategy_id = strategy_ids.length > 1 ? strategy_ids.join(' + ') : (strategy_ids[0] || '');
                    
                    // Toujours mettre à jour si nouvelle entrée ou timestamp plus récent
                    const existing = targetMap.get(entryKey);
                    const existingTime = existing ? new Date(existing.timestamp).getTime() : 0;
                    const newTime = new Date(timestamp).getTime();
                    
                    if (!existing || newTime > existingTime) {
                        targetMap.set(entryKey, {
                            type: isSeed ? 'S' : 'W',
                            id: agentId,
                            position: agent.position,
                            strategy_id: strategy_id,
                            strategy_ids: strategy_ids,
                            iteration: agentIteration,
                            version: version,
                            content: content,
                            timestamp: timestamp
                        });
                    }
                });
            }
        });
        
        // 2. CRITICAL FIX: Compléter avec les dernières données depuis agentMetrics (pour agents qui n'ont pas envoyé de données récentes)
        // Cela permet de récupérer les dernières données même si elles ne sont pas dans les événements d'itération
        const agentMetrics = data.agentMetrics || {};
        Object.values(agentMetrics).forEach(agent => {
            if (!agent || agent.type !== 'ai' || !agent.id) return;
            
            // Vérifier si on a déjà une entrée pour cet agent à cette itération
            const agentIteration = agent.iteration !== undefined ? agent.iteration : (agent.version || 0);
            
            // Distinguer S (iteration === 0) de W (iteration > 0)
            const isSeed = agentIteration === 0;
            const entryKey = isSeed ? `S-${agent.id}-${agentIteration}` : `W-${agent.id}-${agentIteration}`;
            const targetMap = isSeed ? sEntriesMap : wEntriesMap;
            
            // Si pas d'entrée ou si les données de agentMetrics sont plus récentes
            const existing = targetMap.get(entryKey);
            if (!existing || (agent.timestamp && new Date(agent.timestamp) > new Date(existing.timestamp))) {
                let content = agent.verbatim_summary || agent.rationale || agent.strategy || '';
                if (content) {
                    // Pour S: extraire les informations du seed
                    if (isSeed) {
                        const seed = agent.seed || {};
                        const concept = seed.concept || '';
                        const reference = seed.reference || '';
                        const quantumMeasures = agent.quantum_measures || seed.quantum_measures || {};
                        
                        let sText = '';
                        if (concept) {
                            sText = `CONCEPT: ${concept}\n`;
                        }
                        if (reference) {
                            sText += `REFERENCE: ${reference}\n`;
                        }
                        if (Object.keys(quantumMeasures).length > 0) {
                            sText += `\nQUANTUM MEASURES:\n`;
                            if (quantumMeasures.psi_distinctiveness !== undefined) {
                                sText += `  Ψ-distinctiveness: ${quantumMeasures.psi_distinctiveness.toFixed(2)}\n`;
                            }
                            if (quantumMeasures.eta_potential !== undefined) {
                                sText += `  η-potential: ${quantumMeasures.eta_potential.toFixed(2)}\n`;
                            }
                            if (quantumMeasures.lambda_coherence !== undefined) {
                                sText += `  λ-coherence: ${quantumMeasures.lambda_coherence.toFixed(2)}\n`;
                            }
                        }
                        if (seed.rationale) {
                            sText += `\nRATIONALE: ${seed.rationale}\n`;
                        }
                        
                        content = sText.trim() || content;
                    } else {
                        // Pour W: supprimer la ligne "ΔC_w: ..." si elle existe
                        content = content.replace(/ΔC_w:\s*[\d.-]+\s*\|\s*ΔC_d:\s*[\d.-]+\s*\|\s*Error:\s*[\d.-]+/gi, '').trim();
                        content = content.replace(/ΔC_w:\s*[\d.-]+\s*\|\s*ΔC_d:\s*[\d.-]+\s*\|\s*U.*?expected:\s*[\d.-]+/gi, '').trim();
                    }
                    
                    if (content) {
                        const strategy_ids = agent.strategy_ids || (agent.strategy_id ? [agent.strategy_id] : []);
                        const strategy_id = strategy_ids.length > 1 ? strategy_ids.join(' + ') : (strategy_ids[0] || '');
                        
                        targetMap.set(entryKey, {
                            type: isSeed ? 'S' : 'W',
                            id: agent.id,
                            position: agent.position,
                            strategy_id: strategy_id,
                            strategy_ids: strategy_ids,
                            iteration: agentIteration,
                            version: agent.version || 0,
                            content: content,
                            timestamp: agent.timestamp || new Date().toISOString()
                        });
                    }
                }
            }
        });
        
        // Ajouter toutes les entrées S et W dédupliquées
        verbatimEntries.push(...Array.from(sEntriesMap.values()));
        verbatimEntries.push(...Array.from(wEntriesMap.values()));
        
        // Trier par timestamp (plus récent en premier) et garder les 5 derniers
        verbatimEntries = verbatimEntries
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);
        
        if (verbatimEntries.length === 0) {
            stream.innerHTML = `
                <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    Waiting for S and W machine responses...
                </div>
            `;
            return;
        }
        
        stream.innerHTML = verbatimEntries.map(d => {
            const posX = d.position?.[0] !== undefined ? d.position[0] : '?';
            const posY = d.position?.[1] !== undefined ? d.position[1] : '?';
            const strategyId = d.strategy_id || '';
            const iteration = d.iteration !== undefined ? d.iteration : d.version || 'N/A';
            const isSeed = d.type === 'S';
            
            // Extraire le texte du verbatim
            const content = d.content || '';
            const lines = content.split('\n').filter(l => l.trim());
            
            let headerText = '';
            let bodyText = '';
            
            if (lines.length === 0) {
                bodyText = 'N/A';
            } else if (lines.length === 1) {
                bodyText = lines[0];
            } else {
                headerText = lines[0];
                bodyText = lines.slice(1).join('\n');
            }
            
            // Construire le header avec type de machine, position et itération
            const machineType = isSeed ? '🌱 S-Machine (Quantum Seed)' : '🤖 W-Machine (Quantum Evolution)';
            const color = isSeed ? 'var(--accent-orange)' : 'var(--accent-purple)';
            let headerDisplay = `${machineType} [${posX},${posY}] - Iteration ${iteration}`;
            if (strategyId && !isSeed) {
                headerDisplay += ` - Strategy: ${strategyId}`;
            }
            if (headerText) {
                headerDisplay += ` - ${headerText}`;
            }
            
            return `
                <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">
                    <div style="color: ${color}; font-weight: 600; margin-bottom: 4px;">
                        ${headerDisplay}
                    </div>
                    <div style="white-space: pre-wrap; color: var(--text-primary);">${bodyText}</div>
                </div>
            `;
        }).join('');
        
        // Scroll to top to show most recent entries first
        stream.scrollTop = 0;
    }
    
    // CRITICAL FIX: Nouveau popup pour O et N machines uniquement
    updateVerbatimONPopup(id, popup, data) {
        const stream = document.getElementById(`${id}-stream`);
        if (!stream) return;
        
        // Collecter uniquement les verbatim O et N
        let verbatimEntries = [];
        const seenEntries = new Set();
        
        // Parcourir les événements d'itération pour récupérer O et N
        const allIterationEvents = (data.events || [])
            .filter(e => e.type === 'iteration');
        
        allIterationEvents.forEach(e => {
            const eventData = e.data || e;
            const version = eventData.version || 0;
            const timestamp = e.timestamp || eventData.timestamp || new Date().toISOString();
            
            // Verbatim O (structures)
            const oSnapshot = eventData.o_snapshot;
            if (oSnapshot) {
                const structures = oSnapshot.structures || [];
                const formalRelations = oSnapshot.formal_relations || {};
                
                let oText = '';
                if (structures.length > 0) {
                    oText = 'STRUCTURES:\n';
                    structures.forEach((st, i) => {
                        const positions = st.agent_positions ? 
                            `[${st.agent_positions.map(p => `[${p[0]},${p[1]}]`).join(', ')}]` : 'N/A';
                        oText += `  ${i+1}. ${st.type} (${st.size_agents} agents at ${positions})\n`;
                    });
                } else {
                    oText = 'STRUCTURES:\n  (none detected)\n';
                }
                
                if (formalRelations && formalRelations.summary) {
                    oText += `\nFORMAL RELATIONS:\n${formalRelations.summary}\n`;
                } else if (formalRelations && typeof formalRelations === 'object') {
                    const relationsText = JSON.stringify(formalRelations, null, 2);
                    if (relationsText && relationsText !== '{}') {
                        oText += `\nFORMAL RELATIONS:\n${relationsText}\n`;
                    }
                }
                
                if (oText.trim()) {
                    const entryKey = `O-${version}`;
                    if (!seenEntries.has(entryKey)) {
                        seenEntries.add(entryKey);
                        verbatimEntries.push({
                            type: 'O',
                            version: version,
                            content: oText.trim(),
                            timestamp: timestamp
                        });
                    }
                }
            }
            
            // Verbatim N (narrative)
            if (eventData.n_snapshot) {
                const nData = eventData.n_snapshot;
                const narrative = nData.narrative || {};
                const narrativeText = narrative.summary || '';
                
                if (narrativeText.trim()) {
                    const entryKey = `N-${version}`;
                    if (!seenEntries.has(entryKey)) {
                        seenEntries.add(entryKey);
                        verbatimEntries.push({
                            type: 'N',
                            version: version,
                            content: narrativeText.trim(),
                            timestamp: timestamp
                        });
                    }
                }
            }
        });
        
        // Fallback: Utiliser les snapshots O et N stockés si pas dans les événements
        const oSnapshots = data.oSnapshots || [];
        const nSnapshots = data.nSnapshots || [];
        
        oSnapshots.forEach(oSnap => {
            const version = oSnap.version || oSnap.data?.version || 0;
            const entryKey = `O-${version}`;
            if (seenEntries.has(entryKey)) return;
            
            const oData = oSnap.data || oSnap;
            const structures = oData.structures || [];
            const formalRelations = oData.formal_relations || {};
            
            let oText = '';
            if (structures.length > 0) {
                oText = 'STRUCTURES:\n';
                structures.forEach((st, i) => {
                    const positions = st.agent_positions ? 
                        `[${st.agent_positions.map(p => `[${p[0]},${p[1]}]`).join(', ')}]` : 'N/A';
                    oText += `  ${i+1}. ${st.type} (${st.size_agents} agents at ${positions})\n`;
                });
            } else {
                oText = 'STRUCTURES:\n  (none detected)\n';
            }
            
            if (formalRelations && formalRelations.summary) {
                oText += `\nFORMAL RELATIONS:\n${formalRelations.summary}\n`;
            }
            
            if (oText.trim()) {
                seenEntries.add(entryKey);
                verbatimEntries.push({
                    type: 'O',
                    version: version,
                    content: oText.trim(),
                    timestamp: oSnap.timestamp || new Date().toISOString()
                });
            }
        });
        
        // Trier par timestamp (plus récent en premier) et garder les 5 derniers
        verbatimEntries = verbatimEntries
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);
        
        if (verbatimEntries.length === 0) {
            stream.innerHTML = `
                <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    Waiting for O and N machine responses...
                </div>
            `;
            return;
        }
        
        stream.innerHTML = verbatimEntries.map(d => {
            if (d.type === 'O') {
                return `
                    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--accent-blue);">
                        <div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 4px;">
                            🔍 O-Machine (Observation) - Iteration ${d.version || 'N/A'}
                        </div>
                        <div style="white-space: pre-wrap; color: var(--text-primary);">${d.content}</div>
                    </div>
                `;
            } else if (d.type === 'N') {
                return `
                    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--accent-green);">
                        <div style="color: var(--accent-green); font-weight: 600; margin-bottom: 4px;">
                            📖 N-Machine (Narration) - Iteration ${d.version || 'N/A'}
                        </div>
                        <div style="white-space: pre-wrap; color: var(--text-primary);">${d.content}</div>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        // Scroll to top to show most recent entries first
        stream.scrollTop = 0;
    }
    
    updateSignallingPopup(id, popup, data) {
        const rankings = data.rankings || {};
        const agentMetrics = data.agentMetrics || {};
        const events = data.events || [];
        
        if (Object.keys(rankings).length === 0) return;
        
        // V5.1: Filtrer pour ne garder que les agents actuellement actifs
        const activeAgentIds = new Set(Object.keys(agentMetrics));
        
        // V5.1: Collecter l'historique des tokens de signalement et pixels par rank et par itération
        // Structure: { rank: { tokens: [...], pixels: [...] } }
        // Pour chaque événement, on utilise le rank de l'agent à cette itération
        // MAIS seulement pour les agents actuellement actifs
        const historyByRank = {};
        
        // Parcourir tous les événements de type 'agent' pour construire l'historique
        events.forEach(event => {
            if (event.type !== 'agent' || !event.data) return;
            
            const agentData = event.data;
            const agentId = agentData.id;
            if (!agentId) return;
            
            // V5.1: Ne garder que les événements des agents actuellement actifs
            if (!activeAgentIds.has(agentId)) return;
            
            // V5.1: Utiliser le rank de l'agent à cette itération (stocké dans l'événement)
            const rank = agentData.rank || 999;
            
            // Initialiser l'historique pour ce rank si nécessaire
            if (!historyByRank[rank]) {
                historyByRank[rank] = {
                    tokens: [],
                    pixels: []
                };
            }
            
            // Extraire les tokens de signalement
            let signallingTokens = 0;
            if (agentData.signalling_tokens && agentData.signalling_tokens.signalling !== undefined) {
                signallingTokens = agentData.signalling_tokens.signalling;
            } else if (agentData.delta_C_w !== undefined) {
                // Fallback: utiliser ΔC_w en bits comme approximation
                signallingTokens = Math.abs(agentData.delta_C_w) * 10;
            }
            
            // Extraire les pixels
            const pixels = agentData.pixels || [];
            const pixelCount = pixels.length;
            const normalizedPixels = Math.min(pixelCount, 400);
            
            // Stocker les données pour ce rank (on accumule toutes les itérations)
            historyByRank[rank].tokens.push(signallingTokens);
            historyByRank[rank].pixels.push(normalizedPixels);
        });
        
        // V5.1: Filtrer les rankings pour ne garder que les agents actifs
        const activeRankings = {};
        Object.entries(rankings).forEach(([agentId, info]) => {
            if (activeAgentIds.has(agentId) && info && typeof info === 'object') {
                activeRankings[agentId] = info;
            }
        });
        
        // Obtenir tous les ranks uniques et les trier
        const uniqueRanks = Object.keys(historyByRank)
            .map(r => parseInt(r, 10))
            .filter(r => !isNaN(r) && r !== 999) // Exclure le rank par défaut
            .sort((a, b) => a - b);
        
        // Si on n'a pas d'historique, utiliser les rankings actuels comme fallback
        if (uniqueRanks.length === 0) {
            Object.entries(activeRankings).forEach(([agentId, info]) => {
                if (!info || typeof info !== 'object') return;
                const rank = info.rank || 999;
                if (rank === 999) return;
                
                if (!historyByRank[rank]) {
                    historyByRank[rank] = {
                        tokens: [],
                        pixels: []
                    };
                }
                
                // Utiliser les données actuelles de agentMetrics comme fallback
                const agent = agentMetrics[agentId];
                if (agent) {
                    let signallingTokens = 0;
                    if (agent.signalling_tokens && agent.signalling_tokens.signalling !== undefined) {
                        signallingTokens = agent.signalling_tokens.signalling;
                    } else if (agent.delta_C_w !== undefined) {
                        signallingTokens = Math.abs(agent.delta_C_w) * 10;
                    }
                    const pixels = agent.pixels || [];
                    const normalizedPixels = Math.min(pixels.length, 400);
                    
                    historyByRank[rank].tokens.push(signallingTokens);
                    historyByRank[rank].pixels.push(normalizedPixels);
                }
            });
            
            // Recalculer les ranks uniques après le fallback
            const fallbackRanks = Object.keys(historyByRank)
                .map(r => parseInt(r, 10))
                .filter(r => !isNaN(r) && r !== 999)
                .sort((a, b) => a - b);
            uniqueRanks.push(...fallbackRanks);
        }
        
        if (uniqueRanks.length === 0) return;
        
        // Créer un point par rank unique avec les moyennes sur toutes les itérations
        const chartData = [];
        uniqueRanks.forEach((rank, index) => {
            const rankHistory = historyByRank[rank];
            if (!rankHistory) return;
            
            const tokens = rankHistory.tokens || [];
            const pixels = rankHistory.pixels || [];
            
            if (tokens.length === 0 && pixels.length === 0) return;
            
            // Calculer les moyennes sur toutes les itérations pour ce rank
            const avgTokens = tokens.length > 0 
                ? tokens.reduce((sum, val) => sum + val, 0) / tokens.length 
                : 0;
            const avgPixels = pixels.length > 0 
                ? pixels.reduce((sum, val) => sum + val, 0) / pixels.length 
                : 0;
            
            chartData.push({
                xPosition: index + 1,
                rank: rank,
                avgPixels: avgPixels,
                avgSignallingTokens: avgTokens
            });
        });
        
        this.drawSignallingChart(id, chartData);
    }
    
    // =========================================================================
    // V6 Quantum Popups Update Methods
    // =========================================================================
    
    updateQuantumCoherencePopup(id, popup, data) {
        const history = data.quantumHistory || {};
        const latestSnapshot = data.latestQuantumSnapshot || {};
        const co = latestSnapshot.coherence_observables || {};
        
        const phi = co.phi_coherence || co.phi_formal_resonance || 0;
        const xi = co.xi_correlation_length || co.xi_collective_extent || 0;
        const I = co.I_fringe_visibility || co.I_pareidolic_contrast || 0;
        
        // Update metric displays
        const phiEl = document.getElementById(`${id}-phi`);
        const xiEl = document.getElementById(`${id}-xi`);
        const IEl = document.getElementById(`${id}-I`);
        
        if (phiEl) phiEl.textContent = phi.toFixed(2);
        if (xiEl) xiEl.textContent = xi.toFixed(2);
        if (IEl) IEl.textContent = I.toFixed(2);
        
        // Build history arrays (use full key names from ai-metrics-v6.js)
        const phiHistory = history.phi_coherence || [];
        const xiHistory = history.xi_correlation_length || [];
        const IHistory = history.I_fringe_visibility || [];
        
        // Add current values if not already present
        if (phiHistory.length === 0 || phiHistory[phiHistory.length - 1] !== phi) {
            phiHistory.push(phi);
        }
        if (xiHistory.length === 0 || xiHistory[xiHistory.length - 1] !== xi) {
            xiHistory.push(xi);
        }
        if (IHistory.length === 0 || IHistory[IHistory.length - 1] !== I) {
            IHistory.push(I);
        }
        
        // Limit history
        if (phiHistory.length > 100) phiHistory.shift();
        if (xiHistory.length > 100) xiHistory.shift();
        if (IHistory.length > 100) IHistory.shift();
        
        // Draw chart
        const chartData = phiHistory.map((_, i) => ({
            phi: phiHistory[i] || 0,
            xi: (xiHistory[i] || 0) / 3, // Normalize xi
            I: IHistory[i] || 0
        }));
        
        this.drawLineChart(id, chartData, ['phi', 'xi', 'I'], ['#00d4ff', '#8080ff', '#ff80ff']);
    }
    
    updateNarrativeConvergencePopup(id, popup, data) {
        const history = data.quantumHistory || {};
        const latestSnapshot = data.latestQuantumSnapshot || {};
        const eo = latestSnapshot.emergence_observables || {};
        
        const tau = eo.tau_condensation || eo.tau_narrative_convergence || 0;
        const dS = eo.delta_S_entropy || eo.delta_S_complexity_flux || 0;
        
        // Determine regime
        const phi = latestSnapshot.coherence_observables?.phi_coherence || latestSnapshot.coherence_observables?.phi_formal_resonance || 0;
        let regime = 'Awaiting data...';
        let regimeColor = 'var(--text-secondary)';
        if (tau >= 0.8) {
            regime = '✨ BOSE-EINSTEIN CONDENSATE';
            regimeColor = '#ffcc00';
        } else if (phi >= 0.6) {
            regime = '🔮 QUANTUM COHERENT';
            regimeColor = '#3fb950';
        } else if (phi >= 0.4) {
            regime = '⚛️ PARTIAL COHERENCE';
            regimeColor = '#00d4ff';
        } else {
            regime = '🌀 FRAGMENTATION REGIME';
            regimeColor = '#f85149';
        }
        
        // Update metric displays
        const tauEl = document.getElementById(`${id}-tau`);
        const dSEl = document.getElementById(`${id}-dS`);
        const regimeEl = document.getElementById(`${id}-regime`);
        
        if (tauEl) tauEl.textContent = tau.toFixed(2);
        if (dSEl) dSEl.textContent = dS.toFixed(2);
        if (regimeEl) {
            regimeEl.textContent = regime;
            regimeEl.style.color = regimeColor;
        }
        
        // Build history arrays (use full key names from ai-metrics-v6.js)
        const tauHistory = history.tau_condensation || [];
        const dSHistory = history.delta_S_entropy || [];
        
        // Add current values if not already present
        if (tauHistory.length === 0 || tauHistory[tauHistory.length - 1] !== tau) {
            tauHistory.push(tau);
        }
        if (dSHistory.length === 0 || dSHistory[dSHistory.length - 1] !== dS) {
            dSHistory.push(dS);
        }
        
        // Limit history
        if (tauHistory.length > 100) tauHistory.shift();
        if (dSHistory.length > 100) dSHistory.shift();
        
        // Draw chart
        const chartData = tauHistory.map((_, i) => ({
            tau: tauHistory[i] || 0,
            dS: dSHistory[i] || 0
        }));
        
        this.drawLineChart(id, chartData, ['tau', 'dS'], ['#ffcc00', '#ffff80']);
    }
    
    updateQuantumOverviewPopup(id, popup, data) {
        const latestSnapshot = data.latestQuantumSnapshot || {};
        const co = latestSnapshot.coherence_observables || {};
        const eo = latestSnapshot.emergence_observables || {};
        const sa = latestSnapshot.simplicity_assessment || {};
        
        const phi = co.phi_coherence || co.phi_formal_resonance || 0;
        const xi = co.xi_correlation_length || co.xi_collective_extent || 0;
        const I = co.I_fringe_visibility || co.I_pareidolic_contrast || 0;
        const tau = eo.tau_condensation || eo.tau_narrative_convergence || 0;
        const dS = eo.delta_S_entropy || eo.delta_S_complexity_flux || 0;
        const U = sa.U_current?.value || (sa.C_w_current?.value || 0) - (sa.C_d_current?.value || 0);
        
        // Determine regime
        let regime = 'Awaiting data...';
        let regimeColor = 'var(--text-secondary)';
        if (tau >= 0.8) {
            regime = '✨ BOSE-EINSTEIN CONDENSATE';
            regimeColor = '#ffcc00';
        } else if (phi >= 0.6) {
            regime = '🔮 QUANTUM COHERENT';
            regimeColor = '#3fb950';
        } else if (phi >= 0.4) {
            regime = '⚛️ PARTIAL COHERENCE';
            regimeColor = '#00d4ff';
        } else {
            regime = '🌀 FRAGMENTATION REGIME';
            regimeColor = '#f85149';
        }
        
        // Update metric displays
        const phiEl = document.getElementById(`${id}-phi`);
        const tauEl = document.getElementById(`${id}-tau`);
        const UEl = document.getElementById(`${id}-U`);
        const xiEl = document.getElementById(`${id}-xi`);
        const IEl = document.getElementById(`${id}-I`);
        const dSEl = document.getElementById(`${id}-dS`);
        const regimeEl = document.getElementById(`${id}-regime`);
        
        if (phiEl) phiEl.textContent = phi.toFixed(2);
        if (tauEl) tauEl.textContent = tau.toFixed(2);
        if (UEl) {
            UEl.textContent = Math.round(U);
            UEl.className = `metric-value ${U >= 0 ? 'positive' : 'negative'}`;
        }
        if (xiEl) xiEl.textContent = xi.toFixed(2);
        if (IEl) IEl.textContent = I.toFixed(2);
        if (dSEl) dSEl.textContent = dS.toFixed(2);
        if (regimeEl) {
            regimeEl.textContent = regime;
            regimeEl.style.color = regimeColor;
        }
        
        // Build history for chart (use full key names from ai-metrics-v6.js)
        const history = data.quantumHistory || {};
        const phiHistory = history.phi_coherence || [];
        const tauHistory = history.tau_condensation || [];
        const UHistory = history.U || [];
        const xiHistory = history.xi_correlation_length || [];
        const IHistory = history.I_fringe_visibility || [];
        const dSHistory = history.delta_S_entropy || [];
        
        // Add current values
        if (phiHistory.length === 0 || phiHistory[phiHistory.length - 1] !== phi) {
            phiHistory.push(phi);
        }
        if (tauHistory.length === 0 || tauHistory[tauHistory.length - 1] !== tau) {
            tauHistory.push(tau);
        }
        if (UHistory.length === 0 || UHistory[UHistory.length - 1] !== U) {
            UHistory.push(U);
        }
        if (xiHistory.length === 0 || xiHistory[xiHistory.length - 1] !== xi) {
            xiHistory.push(xi);
        }
        if (IHistory.length === 0 || IHistory[IHistory.length - 1] !== I) {
            IHistory.push(I);
        }
        if (dSHistory.length === 0 || dSHistory[dSHistory.length - 1] !== dS) {
            dSHistory.push(dS);
        }
        
        // Limit history
        if (phiHistory.length > 100) phiHistory.shift();
        if (tauHistory.length > 100) tauHistory.shift();
        if (UHistory.length > 100) UHistory.shift();
        if (xiHistory.length > 100) xiHistory.shift();
        if (IHistory.length > 100) IHistory.shift();
        if (dSHistory.length > 100) dSHistory.shift();
        
        // Normalize U for chart (scale to 0-1)
        const maxU = Math.max(...UHistory, 1);
        const normalizedUHistory = UHistory.map(u => u / maxU);
        
        // Normalize xi for chart (scale to 0-1, divide by 3 as mentioned in legend)
        const maxXi = Math.max(...xiHistory.map(x => x / 3), 1);
        const normalizedXiHistory = xiHistory.map(x => (x / 3) / maxXi);
        
        // Normalize dS for chart (scale to 0-1)
        const maxDS = Math.max(...dSHistory.map(Math.abs), 1);
        const normalizedDSHistory = dSHistory.map(d => (d / maxDS + 1) / 2); // Normalize to 0-1 range
        
        // Draw chart with all metrics
        const chartData = phiHistory.map((_, i) => ({
            phi: phiHistory[i] || 0,
            tau: tauHistory[i] || 0,
            U: normalizedUHistory[i] || 0,
            xi: normalizedXiHistory[i] || 0,
            I: IHistory[i] || 0,
            dS: normalizedDSHistory[i] || 0
        }));
        
        this.drawLineChart(id, chartData, ['phi', 'tau', 'U', 'xi', 'I', 'dS'], ['#00d4ff', '#ffcc00', '#3fb950', '#8080ff', '#ff80ff', '#ffff80']);
    }
    
    updateQuantumVerbatimPopup(id, popup, data) {
        const stream = document.getElementById(`${id}-stream`);
        if (!stream) return;
        
        // Like V5: read from quantumSnapshots array (like oSnapshots and nSnapshots in V5)
        const quantumSnapshots = data.quantumSnapshots || [];
        
        if (quantumSnapshots.length === 0) {
            stream.innerHTML = `
                <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    Waiting for O+N quantum snapshot...
                </div>
            `;
            return;
        }
        
        // Collect verbatim entries from all snapshots (like V5 does)
        let verbatimEntries = [];
        const seenEntries = new Set();
        
        quantumSnapshots.forEach(qSnap => {
            const snapshot = qSnap.snapshot || qSnap;
            const version = snapshot.version || qSnap.version || 0;
            const timestamp = qSnap.timestamp || new Date().toISOString();
            
            // O-Machine entry
            const entryKeyO = `Q-O-${version}`;
            if (!seenEntries.has(entryKeyO)) {
                const structures = snapshot.structures || [];
                const formalRelations = snapshot.formal_relations || {};
                const coherence = snapshot.coherence_observables || {};
                const saO = snapshot.simplicity_assessment || {};
                
                let oText = '';
                if (structures.length > 0) {
                    oText = 'STRUCTURES:\n';
                    structures.forEach((st, i) => {
                        const positions = st.agent_positions ? 
                            st.agent_positions.map(p => `[${p[0]},${p[1]}]`).join(', ') : 'N/A';
                        const interference = st.interference_type || st.resonance_type || 'mixed';
                        oText += `  ${i+1}. ${st.type || 'Unknown'} (${st.size_agents || 1} agents, ${st.recognizability || 'Medium'})\n`;
                        oText += `    Positions: ${positions} | Resonance: ${interference}\n`;
                    });
                } else {
                    oText = 'STRUCTURES:\n  (none detected)\n';
                }
                
                if (formalRelations && formalRelations.summary) {
                    oText += `\nFORMAL RELATIONS:\n${formalRelations.summary}\n`;
                }
                
                const phi = coherence.phi_coherence || coherence.phi_formal_resonance || 0;
                const xi = coherence.xi_correlation_length || coherence.xi_collective_extent || 0;
                const I = coherence.I_fringe_visibility || coherence.I_pareidolic_contrast || 0;
                oText += `\nCOHERENCE OBSERVABLES:\n`;
                oText += `  φ (Formal Resonance): ${phi.toFixed(2)} | ξ (Collective Extent): ${xi.toFixed(2)} | I (Pareidolic Contrast): ${I.toFixed(2)}\n`;
                
                const cdValue = saO.C_d_current?.value || 0;
                const cdDesc = saO.C_d_current?.description || '';
                if (cdDesc) {
                    oText += `\nC_d (Descriptive Simplicity): ${cdValue} bits\n${cdDesc}\n`;
                }
                
                if (oText.trim()) {
                    seenEntries.add(entryKeyO);
                    verbatimEntries.push({
                        type: 'Q-O',
                        version: version,
                        content: oText.trim(),
                        timestamp: timestamp
                    });
                }
            }
            
            // N-Machine entry
            const entryKeyN = `Q-N-${version}`;
            if (!seenEntries.has(entryKeyN)) {
                const narrative = snapshot.narrative || {};
                const emergence = snapshot.emergence_observables || {};
                const saN = snapshot.simplicity_assessment || {};
                const errors = snapshot.prediction_errors || {};
                
                let nText = '';
                const narrativeText = narrative.summary || '';
                const cwValue = saN.C_w_current?.value || 0;
                if (narrativeText) {
                    nText = `NARRATIVE PAREIDOLIA:\n`;
                    nText += `C_w = ${cwValue} bits\n${narrativeText}\n`;
                }
                
                const tau = emergence.tau_condensation || emergence.tau_narrative_convergence || 0;
                const dS = emergence.delta_S_entropy || emergence.delta_S_complexity_flux || 0;
                nText += `\nEMERGENCE OBSERVABLES:\n`;
                nText += `  τ (Narrative Convergence): ${tau.toFixed(2)} | ΔS (Complexity Flux): ${dS.toFixed(2)}\n`;
                
                const errorEntries = Object.entries(errors);
                if (errorEntries.length > 0) {
                    nText += `\nPREDICTION ERRORS:\n`;
                    errorEntries.forEach(([agentId, errData]) => {
                        const error = errData.error || 0;
                        const explanation = errData.explanation || '';
                        nText += `  [${agentId.substring(0,8)}]: ${error.toFixed(2)}`;
                        if (explanation) nText += ` - ${explanation}`;
                        nText += '\n';
                    });
                }
                
                if (nText.trim()) {
                    seenEntries.add(entryKeyN);
                    verbatimEntries.push({
                        type: 'Q-N',
                        version: version,
                        content: nText.trim(),
                        timestamp: timestamp
                    });
                }
            }
        });
        
        // Sort by timestamp (most recent first) and keep last 5
        verbatimEntries = verbatimEntries
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);
        
        if (verbatimEntries.length === 0) {
            stream.innerHTML = `
                <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    Waiting for O+N quantum snapshot...
                </div>
            `;
            return;
        }
        
        // Render entries (like V5)
        stream.innerHTML = verbatimEntries.map(d => {
            if (d.type === 'Q-O') {
                return `
                    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--accent-blue);">
                        <div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 4px;">
                            🔬 O | Iter ${d.version || 'N/A'}
                        </div>
                        <div style="white-space: pre-wrap; color: var(--text-primary); font-size: 11px; line-height: 1.4;">${d.content}</div>
                    </div>
                `;
            } else if (d.type === 'Q-N') {
                return `
                    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--accent-green);">
                        <div style="color: var(--accent-green); font-weight: 600; margin-bottom: 4px;">
                            📝 N | Iter ${d.version || 'N/A'}
                        </div>
                        <div style="white-space: pre-wrap; color: var(--text-primary); font-size: 11px; line-height: 1.4;">${d.content}</div>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        // Scroll to top to show most recent entries first
        stream.scrollTop = 0;
    }
    
    updateQuantumRankingsPopup(id, popup, data) {
        const rankings = data.agentRankings || data.rankings || {};
        const tbody = document.getElementById(`${id}-tbody`);
        if (!tbody) return;
        
        const entries = Object.entries(rankings).sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999));
        
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No data yet</td></tr>';
            return;
        }
        
        const rows = entries.map(([agentId, info]) => {
            const rank = info.rank || 999;
            const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
            const pos = info.position || [0, 0];
            const posX = pos[0] !== null && pos[0] !== undefined ? pos[0] : '?';
            const posY = pos[1] !== null && pos[1] !== undefined ? pos[1] : '?';
            
            return `
                <tr>
                    <td><span class="rank-badge ${rankClass}">${rank}</span></td>
                    <td>[${posX},${posY}]</td>
                    <td>${(info.avg_error || 0).toFixed(3)}</td>
                    <td>${info.total_iterations || 0}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rows.join('');
    }
    
    // =========================================================================
    // Chart Drawing
    // =========================================================================
    
    drawLineChart(id, data, keys, colors, dashed = []) {
        const canvas = document.getElementById(`${id}-chart`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height - 10;
        
        const w = canvas.width;
        const h = canvas.height;
        const padding = { top: 10, right: 10, bottom: 20, left: 40 };
        
        ctx.clearRect(0, 0, w, h);
        
        if (data.length < 2) return;
        
        // Calculer les échelles
        let minY = Infinity, maxY = -Infinity;
        keys.forEach(key => {
            data.forEach(d => {
                const v = d[key] || 0;
                minY = Math.min(minY, v);
                maxY = Math.max(maxY, v);
            });
        });
        
        if (minY === maxY) {
            minY -= 1;
            maxY += 1;
        }
        
        const scaleX = (i) => padding.left + (i / (data.length - 1)) * (w - padding.left - padding.right);
        const scaleY = (v) => h - padding.bottom - ((v - minY) / (maxY - minY)) * (h - padding.top - padding.bottom);
        
        // Dessiner les axes
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, h - padding.bottom);
        ctx.lineTo(w - padding.right, h - padding.bottom);
        ctx.stroke();
        
        // Dessiner les courbes
        keys.forEach((key, ki) => {
            ctx.strokeStyle = colors[ki];
            ctx.lineWidth = 2;
            
            if (dashed[ki]) {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = scaleX(i);
                const y = scaleY(d[key] || 0);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });
        
        ctx.setLineDash([]);
    }
    
    drawScatterChart(id, data, xKey, yKey) {
        const canvas = document.getElementById(`${id}-chart`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height - 10;
        
        const w = canvas.width;
        const h = canvas.height;
        const padding = { top: 10, right: 10, bottom: 30, left: 50 };
        
        ctx.clearRect(0, 0, w, h);
        
        if (data.length < 2) return;
        
        // Calculer les échelles
        const xValues = data.map(d => d[xKey] || 0);
        const yValues = data.map(d => d[yKey] || 0);
        
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        
        const scaleX = (v) => padding.left + ((v - minX) / (maxX - minX || 1)) * (w - padding.left - padding.right);
        const scaleY = (v) => h - padding.bottom - ((v - minY) / (maxY - minY || 1)) * (h - padding.top - padding.bottom);
        
        // Dessiner les axes
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, h - padding.bottom);
        ctx.lineTo(w - padding.right, h - padding.bottom);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(xKey, w / 2, h - 5);
        ctx.save();
        ctx.translate(12, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(yKey, 0, 0);
        ctx.restore();
        
        // Dessiner les points
        ctx.fillStyle = '#58a6ff';
        data.forEach((d, i) => {
            const x = scaleX(d[xKey] || 0);
            const y = scaleY(d[yKey] || 0);
            
            // Gradient de couleur selon l'index (plus récent = plus opaque)
            const alpha = 0.3 + (i / data.length) * 0.7;
            ctx.globalAlpha = alpha;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.globalAlpha = 1;
    }
    
    drawCorrelationHeatmap(id, data) {
        const canvas = document.getElementById(`${id}-chart`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height - 10;
        
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        const keys = ['C_w', 'C_d', 'U', 'mean_error', 'std_error', 'avg_signalling_cost'];
        const n = keys.length;
        const cellSize = Math.min((w - 60) / n, (h - 60) / n);
        const offsetX = 60;
        const offsetY = 20;
        
        // Calculer les corrélations
        const correlations = [];
        for (let i = 0; i < n; i++) {
            correlations[i] = [];
            for (let j = 0; j < n; j++) {
                correlations[i][j] = this.calculateCorrelation(
                    data.map(d => d[keys[i]] || 0),
                    data.map(d => d[keys[j]] || 0)
                );
            }
        }
        
        // Dessiner la heatmap
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const corr = correlations[i][j];
                const color = this.correlationColor(corr);
                
                ctx.fillStyle = color;
                ctx.fillRect(offsetX + j * cellSize, offsetY + i * cellSize, cellSize - 1, cellSize - 1);
                
                // Valeur
                ctx.fillStyle = Math.abs(corr) > 0.5 ? '#fff' : '#8b949e';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    corr.toFixed(2),
                    offsetX + j * cellSize + cellSize / 2,
                    offsetY + i * cellSize + cellSize / 2
                );
            }
        }
        
        // Labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '9px sans-serif';
        keys.forEach((key, i) => {
            // Labels gauche
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(key, offsetX - 5, offsetY + i * cellSize + cellSize / 2);
            
            // Labels haut
            ctx.save();
            ctx.translate(offsetX + i * cellSize + cellSize / 2, offsetY - 5);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'left';
            ctx.fillText(key, 0, 0);
            ctx.restore();
        });
    }
    
    drawSpatialHeatmap(id, agentMetrics, metricKey) {
        const canvas = document.getElementById(`${id}-chart`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        
        // Forcer la réinitialisation complète du canvas en changeant sa taille
        // Cela efface automatiquement tout le contenu
        const newWidth = rect.width || canvas.offsetWidth || 400;
        const newHeight = (rect.height || canvas.offsetHeight || 200) - 10;
        
        // Si la taille change, le canvas est automatiquement effacé
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
            canvas.width = newWidth;
            canvas.height = newHeight;
        } else {
            // Si la taille ne change pas, effacer manuellement
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        const w = canvas.width;
        const h = canvas.height;
        
        // Dessiner un fond noir pour s'assurer qu'il n'y a pas de restes
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, w, h);
        
        const agents = Object.values(agentMetrics);
        if (agents.length === 0) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No agents yet', w / 2, h / 2);
            return;
        }
        
        // Trouver les dimensions de la grille (min et max pour centrer correctement)
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        agents.forEach(a => {
            if (a.position && Array.isArray(a.position) && a.position.length >= 2) {
                const x = a.position[0];
                const y = a.position[1];
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        });
        
        // Si aucune position valide, sortir
        if (minX === Infinity || minY === Infinity) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No valid positions', w / 2, h / 2);
            return;
        }
        
        // Calculer la taille de la grille (inclure min et max)
        const gridWidth = maxX - minX + 1;
        const gridHeight = maxY - minY + 1;
        const gridSize = Math.max(gridWidth, gridHeight);
        
        // Calculer la taille des cellules pour tenir dans le canvas avec padding
        const padding = 40;
        const availableWidth = w - padding * 2;
        const availableHeight = h - padding * 2;
        const cellSize = Math.min(availableWidth / gridSize, availableHeight / gridSize);
        
        // Centrer la grille
        const gridPixelWidth = gridWidth * cellSize;
        const gridPixelHeight = gridHeight * cellSize;
        const offsetX = (w - gridPixelWidth) / 2;
        const offsetY = (h - gridPixelHeight) / 2;
        
        // Trouver min/max de la métrique
        const values = agents.map(a => a[metricKey] || 0);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        
        // Dessiner la grille
        agents.forEach(agent => {
            if (!agent.position || !Array.isArray(agent.position) || agent.position.length < 2) return;
            
            const x = agent.position[0];
            const y = agent.position[1];
            const value = agent[metricKey] || 0;
            
            // Convertir les coordonnées absolues en coordonnées relatives à la grille
            const relX = x - minX;
            const relY = y - minY;
            
            // Couleur selon la valeur
            const normalized = maxVal !== minVal ? (value - minVal) / (maxVal - minVal) : 0.5;
            const color = this.valueToColor(normalized);
            
            ctx.fillStyle = color;
            ctx.fillRect(
                offsetX + relX * cellSize + 1,
                offsetY + relY * cellSize + 1,
                cellSize - 2,
                cellSize - 2
            );
            
            // Bordure selon le type
            ctx.strokeStyle = agent.type === 'human' ? '#d29922' : '#a371f7';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                offsetX + relX * cellSize + 1,
                offsetY + relY * cellSize + 1,
                cellSize - 2,
                cellSize - 2
            );
            
            // Valeur (utiliser les coordonnées relatives comme pour le rectangle)
            ctx.fillStyle = Math.abs(value) > (maxVal - minVal) * 0.5 ? '#fff' : '#8b949e';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                value.toFixed(1),
                offsetX + relX * cellSize + cellSize / 2,
                offsetY + relY * cellSize + cellSize / 2
            );
        });
    }
    
    drawSignallingChart(id, agentData) {
        const canvas = document.getElementById(`${id}-chart`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height - 10;
        
        const w = canvas.width;
        const h = canvas.height;
        const padding = { top: 10, right: 10, bottom: 30, left: 50 };
        
        ctx.clearRect(0, 0, w, h);
        
        if (agentData.length === 0) return;
        
        // Calculer les échelles
        const n = agentData.length; // Nombre de ranks uniques (nombre de points sur l'axe X)
        const maxPixels = Math.max(1, Math.max(...agentData.map(d => d.avgPixels)));
        const maxSignallingTokens = Math.max(1, Math.max(...agentData.map(d => d.avgSignallingTokens || 0)));
        
        // L'axe X va de 1 à N (un point par rank unique)
        // Chaque point représente la moyenne des agents ayant ce rank
        const scaleX = (xPosition) => padding.left + ((xPosition - 1) / (n - 1 || 1)) * (w - padding.left - padding.right);
        const scaleYPixels = (val) => h - padding.bottom - (val / maxPixels) * (h - padding.top - padding.bottom);
        const scaleYSignallingTokens = (val) => h - padding.bottom - (val / maxSignallingTokens) * (h - padding.top - padding.bottom);
        
        // Dessiner les axes
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, h - padding.bottom);
        ctx.lineTo(w - padding.right, h - padding.bottom);
        ctx.stroke();
        
        // Labels des axes
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Rank', w / 2, h - 5);
        ctx.save();
        ctx.translate(12, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Signalling Cost', 0, 0);
        ctx.restore();
        
        // Graduations Y (gauche pour pixels, droite pour deltaCw)
        ctx.fillStyle = '#8b949e';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const val = (maxPixels / 4) * i;
            const y = scaleYPixels(val);
            ctx.fillText(Math.round(val).toString(), padding.left - 5, y + 3);
        }
        
        ctx.textAlign = 'left';
        for (let i = 0; i <= 4; i++) {
            const val = (maxSignallingTokens / 4) * i;
            const y = scaleYSignallingTokens(val);
            ctx.fillText(Math.round(val).toString(), w - padding.right + 5, y + 3);
        }
        
        // Dessiner la courbe Avg Pixels Change
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        agentData.forEach((d, i) => {
            const x = scaleX(d.xPosition);
            const y = scaleYPixels(d.avgPixels);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Points pour Avg Pixels
        ctx.fillStyle = '#58a6ff';
        agentData.forEach(d => {
            const x = scaleX(d.xPosition);
            const y = scaleYPixels(d.avgPixels);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Dessiner la courbe Avg Signalling Tokens (V5.1: tokens de signalement réels)
        ctx.strokeStyle = '#a371f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        agentData.forEach((d, i) => {
            const x = scaleX(d.xPosition);
            const y = scaleYSignallingTokens(d.avgSignallingTokens || 0);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Points pour Avg Signalling Tokens
        ctx.fillStyle = '#a371f7';
        agentData.forEach(d => {
            const x = scaleX(d.xPosition);
            const y = scaleYSignallingTokens(d.avgSignallingTokens || 0);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Labels des rangs en X (afficher le rank réel, pas la position X)
        // Le rank peut être 1, 2, 3, ... même si certains ranks n'ont pas d'agents
        ctx.fillStyle = '#8b949e';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        agentData.forEach(d => {
            const x = scaleX(d.xPosition);
            ctx.fillText(d.rank.toString(), x, h - padding.bottom + 15);
        });
    }
    
    // =========================================================================
    // Utilities
    // =========================================================================
    
    calculateCorrelation(x, y) {
        const n = x.length;
        if (n < 2) return 0;
        
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;
        
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }
        
        const den = Math.sqrt(denX * denY);
        return den === 0 ? 0 : num / den;
    }
    
    correlationColor(corr) {
        // Rouge pour négatif, bleu pour positif
        if (corr < 0) {
            const intensity = Math.min(1, Math.abs(corr));
            return `rgba(248, 81, 73, ${0.2 + intensity * 0.8})`;
        } else {
            const intensity = Math.min(1, corr);
            return `rgba(88, 166, 255, ${0.2 + intensity * 0.8})`;
        }
    }
    
    valueToColor(normalized) {
        // Gradient du bleu au rouge
        const r = Math.round(normalized * 255);
        const b = Math.round((1 - normalized) * 255);
        return `rgb(${r}, 50, ${b})`;
    }
    
    // =========================================================================
    // Popup Management
    // =========================================================================
    
    closePopup(id) {
        const popup = this.popups.get(id);
        if (!popup) return;
        
        popup.element.remove();
        this.popups.delete(id);
        
        // Afficher l'état vide si plus de popups
        if (this.popups.size === 0) {
            document.getElementById('empty-state').style.display = 'flex';
        }
        
        this.saveLayout();
    }
    
    closeAll() {
        for (const [id, popup] of this.popups) {
            popup.element.remove();
        }
        this.popups.clear();
    }
    
    // =========================================================================
    // Layout Persistence
    // =========================================================================
    
    saveLayout() {
        const layout = [];
        for (const [id, popup] of this.popups) {
            layout.push({
                type: popup.type,
                x: popup.element.offsetLeft,
                y: popup.element.offsetTop,
                width: popup.element.offsetWidth,
                height: popup.element.offsetHeight
            });
        }
        
        try {
            localStorage.setItem('aiMetricsLayoutV6', JSON.stringify(layout));
        } catch (e) {
            console.warn('[PopupManager V6] Failed to save layout:', e);
        }
    }
    
    loadLayout() {
        try {
            const saved = localStorage.getItem('aiMetricsLayoutV6');
            if (saved) {
                const layout = JSON.parse(saved);
                layout.forEach(item => {
                    const id = this.createPopup(item.type, {});
                    const popup = this.popups.get(id);
                    if (popup) {
                        popup.element.style.left = `${item.x}px`;
                        popup.element.style.top = `${item.y}px`;
                        popup.element.style.width = `${item.width}px`;
                        popup.element.style.height = `${item.height}px`;
                    }
                });
                
                if (layout.length > 0) {
                    document.getElementById('empty-state').style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('[PopupManager] Failed to load layout:', e);
        }
    }
}

