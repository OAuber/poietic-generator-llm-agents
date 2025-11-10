// Viewer2 : Version simplifiée sans ColorGenerator
// Les agents dessinent sur fond noir pour mieux visualiser l'activité des LLMs

export class PoieticViewer2 {
    constructor(gridId = 'poietic-grid', isObserver = true) {
        const instanceId = `viewer2-${Math.random().toString(36).substr(2, 9)}`;

        if (!window.poieticViewerInstances) {
            window.poieticViewerInstances = {};
        }
        window.poieticViewerInstances[instanceId] = this;

        this.gridId = gridId;
        this.isObserver = isObserver;
        this.instanceId = instanceId;

        this.cells = new Map();
        this.userPositions = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;
        this.socket = null;
        this.reconnectTimeoutId = null;

        // 🔧 NOUVEAU: Buffer pour les messages en attente d'agents manquants
        this.pendingUpdates = new Map(); // userId -> [{subX, subY, color}, ...]
        this.maxPendingUpdates = 100; // Limite par agent

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        console.log(`[Viewer2] Initializing viewer for grid: ${this.gridId}`);
        this.grid = document.getElementById(this.gridId);
        if (!this.grid) {
            console.error(`Grid element with id ${this.gridId} not found`);
            return;
        }

        this.overlay = document.getElementById('qr-overlay');
        if (!this.overlay) {
            console.error(`Overlay element not found for ${this.gridId}`);
            return;
        }

        console.log(`[Viewer2] Mode: Fond noir (sans initial state)`);
        this.resetViewerState();
        this.connect();
        this.addResizeListener();
    }

    resetViewerState() {
        console.log('[Viewer2] Resetting viewer state');
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.socket = null;

        if (this.grid) {
            this.grid.innerHTML = '';
        }

        this.cells.clear();
        this.userPositions.clear();
        this.gridSize = 1;
        this.updateGridDisplay();

        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
        this.isConnected = false;
    }

    connect() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        
        const wsUrl = `${wsProtocol}//${wsHost}/updates?mode=full&type=observer`;
        console.log('[Viewer2] Tentative de connexion WebSocket:', wsUrl);

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('[Viewer2] WebSocket connection established');
                this.isConnected = true;
                if (this.reconnectTimeoutId) {
                    clearTimeout(this.reconnectTimeoutId);
                    this.reconnectTimeoutId = null;
                }
            };

            this.socket.onclose = (event) => {
                console.log('[Viewer2] WebSocket connection closed:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    timestamp: new Date().toISOString()
                });
                this.isConnected = false;
                if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('[Viewer2] Attempting to reconnect...');
                        this.connect();
                    }
                }, 3000);
            };

            this.socket.onerror = (error) => {
                console.error('[Viewer2] WebSocket error:', {
                    error: error,
                    readyState: this.socket.readyState,
                    timestamp: new Date().toISOString()
                });
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('[Viewer2] Received message:', message.type);

                    switch (message.type) {
                        case 'initial_state':
                            this.handleInitialState(message);
                            break;
                        case 'new_user':
                            this.handleNewUser(message);
                            break;
                        case 'cell_update':
                            this.handleCellUpdate(message);
                            break;
                        case 'user_left':
                            this.handleUserLeft(message);
                            break;
                        case 'zoom_update':
                            this.handleZoomUpdate(message);
                            break;
                        default:
                            console.log('[Viewer2] Unknown message type:', message.type);
                    }
                } catch (e) {
                    console.error('[Viewer2] Error processing message:', e, event.data);
                }
            };
        } catch (e) {
            console.error('[Viewer2] Error creating WebSocket:', e);
        }
    }

    handleInitialState(message) {
        console.log('[Viewer2] Processing initial state');
        this.gridSize = message.grid_size || 1;
        
        this.grid.innerHTML = '';
        this.cells.clear();
        this.userPositions.clear();

        if (message.grid_state) {
            const gridState = typeof message.grid_state === 'string' ?
                JSON.parse(message.grid_state) : message.grid_state;

            if (gridState.user_positions) {
                Object.entries(gridState.user_positions).forEach(([userId, positionArray]) => {
                    this.updateCell(userId, positionArray[0], positionArray[1]);
                    
                    // 🔧 NOUVEAU: Appliquer les mises à jour en attente pour cet agent
                    if (this.pendingUpdates.has(userId)) {
                        const pending = this.pendingUpdates.get(userId);
                        console.log(`[Viewer2] 🔄 Applying ${pending.length} pending updates for user ${userId}`);
                        pending.forEach(update => {
                            this.updateSubCell(userId, update.subX, update.subY, update.color);
                        });
                        this.pendingUpdates.delete(userId);
                    }
                });
            }
        }

        if (message.sub_cell_states) {
            Object.entries(message.sub_cell_states).forEach(([userId, subCells]) => {
                if (this.cells.has(userId)) {
                    Object.entries(subCells).forEach(([coords, color]) => {
                        const [subX, subY] = coords.split(',').map(Number);
                        this.updateSubCell(userId, subX, subY, color);
                    });
                }
            });
        }
        this.updateGridDisplay();
    }

    handleNewUser(message) {
        const { user_id, position } = message;
        console.log(`[Viewer2] Adding new user ${user_id} at position (${position[0]}, ${position[1]})`);
        this.updateCell(user_id, position[0], position[1]);

        // 🔧 NOUVEAU: Appliquer les mises à jour en attente pour cet agent
        if (this.pendingUpdates.has(user_id)) {
            const pending = this.pendingUpdates.get(user_id);
            console.log(`[Viewer2] 🔄 Applying ${pending.length} pending updates for user ${user_id}`);
            pending.forEach(update => {
                this.updateSubCell(user_id, update.subX, update.subY, update.color);
            });
            this.pendingUpdates.delete(user_id);
        }

        if (this.overlay && this.cells.size > 0) {
            this.overlay.classList.remove('visible');
        }
    }

    handleCellUpdate(message) {
        if (message.user_id && typeof message.sub_x === 'number' &&
            typeof message.sub_y === 'number' && message.color) {
            
            // 🔧 NOUVEAU: Si l'agent n'existe pas encore, mettre en buffer
            if (!this.cells.has(message.user_id)) {
                if (!this.pendingUpdates.has(message.user_id)) {
                    this.pendingUpdates.set(message.user_id, []);
                    console.log(`[Viewer2] 🔄 Buffering updates for missing user ${message.user_id}`);
                }
                
                const pending = this.pendingUpdates.get(message.user_id);
                
                // Limiter la taille du buffer
                if (pending.length < this.maxPendingUpdates) {
                    pending.push({
                        subX: message.sub_x,
                        subY: message.sub_y,
                        color: message.color
                    });
                } else {
                    console.warn(`[Viewer2] ⚠️ Buffer full for user ${message.user_id}, dropping update`);
                }
                return;
            }
            
            this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
        }
    }

    handleUserLeft(message) {
        console.log('[Viewer2] User left:', message.user_id);
        if (message.user_id) {
            this.removeUser(message.user_id);
            
            // 🔧 NOUVEAU: Nettoyer le buffer de cet agent s'il existe
            if (this.pendingUpdates.has(message.user_id)) {
                console.log(`[Viewer2] 🗑️ Clearing ${this.pendingUpdates.get(message.user_id).length} pending updates for departed user ${message.user_id}`);
                this.pendingUpdates.delete(message.user_id);
            }
        }
    }

    handleZoomUpdate(message) {
        if (typeof message.grid_size === 'number') {
            this.gridSize = message.grid_size;
            
            const gridState = typeof message.grid_state === 'string' ? 
                JSON.parse(message.grid_state) : message.grid_state;

            if (gridState.user_positions) {
                const presentUserIds = new Set();
                Object.entries(gridState.user_positions).forEach(([userId, positionArray]) => {
                    presentUserIds.add(userId);
                    this.updateCell(userId, positionArray[0], positionArray[1]);
                });

                this.cells.forEach((_, userId) => {
                    if (!presentUserIds.has(userId)) {
                        this.removeUser(userId);
                    }
                });
            }

            if (message.sub_cell_states) {
                Object.entries(message.sub_cell_states).forEach(([userId, subCells]) => {
                    if (this.cells.has(userId)) {
                        Object.entries(subCells).forEach(([coords, color]) => {
                            const [subX, subY] = coords.split(',').map(Number);
                            this.updateSubCell(userId, subX, subY, color);
                        });
                    }
                });
            }
            this.updateGridDisplay();
        }
    }

    updateCell(userId, x, y) {
        console.log(`[Viewer2] Creating/updating cell for user ${userId} at (${x}, ${y})`);
        let cell = this.cells.get(userId);
        const isNewCell = !cell;

        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }

        // PAS de palette ColorGenerator : tous les pixels commencent en NOIR
        if (isNewCell || cell.children.length !== 400) {
            cell.innerHTML = ''; 
            for (let sub_y = 0; sub_y < 20; sub_y++) {
                for (let sub_x = 0; sub_x < 20; sub_x++) {
                    const subCell = document.createElement('div');
                    subCell.className = 'sub-cell';
                    subCell.dataset.x = sub_x.toString();
                    subCell.dataset.y = sub_y.toString();
                    subCell.style.backgroundColor = '#000000'; // FOND NOIR
                    cell.appendChild(subCell);
                }
            }
        }

        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);

        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
    }

    positionCell(cell, x, y) {
        const offset = Math.floor(this.gridSize / 2);
        const pixelX = (x + offset) * this.cellSize;
        const pixelY = (y + offset) * this.cellSize;
        cell.style.left = `${pixelX}px`;
        cell.style.top = `${pixelY}px`;
        cell.style.width = `${this.cellSize}px`;
        cell.style.height = `${this.cellSize}px`;
    }

    updateSubCell(userId, subX, subY, color) {
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.querySelector(`[data-x="${subX}"][data-y="${subY}"]`);
            if (subCell) {
                subCell.style.backgroundColor = color;
            } else {
                console.warn(`[Viewer2] SubCell not found at ${subX},${subY} for user ${userId}`);
            }
        } else {
            console.warn(`[Viewer2] Cell not found for user ${userId}`);
        }
    }

    removeUser(userId) {
        console.log(`[Viewer2] Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
            this.userPositions.delete(userId);
        }

        if (this.cells.size === 0 && this.overlay) {
            this.overlay.classList.add('visible');
        }
    }

    updateGridDisplay() {
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        this.cellSize = this.gridSize > 0 ? screenSize / this.gridSize : screenSize;
        this.subCellSize = this.cellSize / 20;

        this.grid.style.width = `${screenSize}px`;
        this.grid.style.height = `${screenSize}px`;

        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            this.updateGridDisplay();
        });
    }
}

