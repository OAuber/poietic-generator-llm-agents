import { ColorGenerator } from './poietic-color-generator.js';

export class PoieticViewer3 {
    constructor(gridId = 'poietic-grid', isObserver = true) {
        const instanceId = `viewer3-${Math.random().toString(36).substr(2, 9)}`;

        if (!window.poieticViewerInstances) {
            window.poieticViewerInstances = {};
        }
        window.poieticViewerInstances[instanceId] = this;

        this.gridId = gridId;
        this.isObserver = isObserver;
        this.instanceId = instanceId;

        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map(); // Stockera les palettes de 400 couleurs initiales par userId
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;
        this.socket = null;
        this.reconnectTimeoutId = null;

        // 🔧 Buffer pour les messages en attente d'agents manquants (DEBUG)
        this.pendingUpdates = new Map(); // userId -> [{subX, subY, color}, ...]
        this.maxPendingUpdates = 100; // Limite par agent

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        console.log(`[Viewer3 DEBUG] Initializing viewer for grid: ${this.gridId}`);
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

        console.log(`Initializing viewer for ${this.gridId}...`);
        this.resetViewerState();
        this.connect();
        this.addResizeListener();
    }

    resetViewerState() {
        console.log('Resetting viewer state');
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.socket = null;

        if (this.grid) {
            this.grid.innerHTML = '';
        }

        this.cells.clear();
        this.userPositions.clear();
        this.userColors.clear();
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
        console.log('Tentative de connexion WebSocket:', wsUrl);

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('WebSocket connection established in viewer mode');
                this.isConnected = true;
                if (this.reconnectTimeoutId) {
                    clearTimeout(this.reconnectTimeoutId);
                    this.reconnectTimeoutId = null;
                }
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket connection closed:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    timestamp: new Date().toISOString()
                });
                this.isConnected = false;
                if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('Attempting to reconnect...');
                        this.connect();
                    }
                }, 3000);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', {
                    error: error,
                    readyState: this.socket.readyState,
                    timestamp: new Date().toISOString()
                });
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Received message:', message.type, message);

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
                            console.log('Unknown message type:', message.type);
                    }
                } catch (e) {
                    console.error('Error processing message:', e, event.data);
                }
            };
        } catch (e) {
            console.error('Error creating WebSocket:', e);
        }
    }

    handleInitialState(message) {
        console.log('Processing initial state');
        this.gridSize = message.grid_size || 1;
        
        this.grid.innerHTML = '';
        this.cells.clear();
        this.userPositions.clear();
        this.userColors.clear();

        if (message.grid_state) {
            const gridState = typeof message.grid_state === 'string' ?
                JSON.parse(message.grid_state) : message.grid_state;

            if (gridState.user_positions) {
                Object.entries(gridState.user_positions).forEach(([userId, positionArray]) => {
                    if (!this.userColors.has(userId)) {
                        // Générer et stocker la palette initiale localement
                        const initialColorsPalette = ColorGenerator.generateInitialColors(userId);
                        this.userColors.set(userId, initialColorsPalette);
                    }
                    this.updateCell(userId, positionArray[0], positionArray[1]);
                    
                    // 🔧 DEBUG: Appliquer les mises à jour en attente pour cet agent
                    if (this.pendingUpdates.has(userId)) {
                        const pending = this.pendingUpdates.get(userId);
                        console.log(`[Viewer3 DEBUG] 🔄 Applying ${pending.length} pending updates for user ${userId}`);
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
        console.log(`[Viewer3 DEBUG] Adding new user ${user_id} at position (${position[0]}, ${position[1]})`);
        if (!this.userColors.has(user_id)) {
            // Générer et stocker la palette initiale localement
            const initialColorsPalette = ColorGenerator.generateInitialColors(user_id);
            this.userColors.set(user_id, initialColorsPalette);
        }
        this.updateCell(user_id, position[0], position[1]);

        // 🔧 DEBUG: Appliquer les mises à jour en attente pour cet agent
        if (this.pendingUpdates.has(user_id)) {
            const pending = this.pendingUpdates.get(user_id);
            console.log(`[Viewer3 DEBUG] 🔄 Applying ${pending.length} pending updates for user ${user_id}`);
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
            
            // 🔧 DEBUG: Si l'agent n'existe pas encore, mettre en buffer
            if (!this.cells.has(message.user_id)) {
                if (!this.pendingUpdates.has(message.user_id)) {
                    this.pendingUpdates.set(message.user_id, []);
                    console.log(`[Viewer3 DEBUG] 🔄 Buffering updates for missing user ${message.user_id}`);
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
                    console.warn(`[Viewer3 DEBUG] ⚠️ Buffer full for user ${message.user_id}, dropping update`);
                }
                return;
            }
            
            this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
        }
    }

    handleUserLeft(message) {
        console.log('[Viewer3 DEBUG] User left:', message.user_id);
        if (message.user_id) {
            this.removeUser(message.user_id);
            
            // 🔧 DEBUG: Nettoyer le buffer de cet agent s'il existe
            if (this.pendingUpdates.has(message.user_id)) {
                console.log(`[Viewer3 DEBUG] 🗑️ Clearing ${this.pendingUpdates.get(message.user_id).length} pending updates for departed user ${message.user_id}`);
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
                    if (!this.userColors.has(userId)) {
                        // Générer et stocker la palette initiale localement si l'utilisateur est nouveau
                        const initialColorsPalette = ColorGenerator.generateInitialColors(userId);
                        this.userColors.set(userId, initialColorsPalette);
                    }
                    this.updateCell(userId, positionArray[0], positionArray[1]);
                });

                this.cells.forEach((_, userId) => {
                    if (!presentUserIds.has(userId)) {
                        this.removeUser(userId);
                    }
                });
            }

            // user_colors n'est plus attendu du serveur.
            // Les sub_cell_states sont appliqués par-dessus les palettes initiales gérées localement.
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
        console.log(`Creating/updating cell for user ${userId} at (${x}, ${y})`);
        let cell = this.cells.get(userId);
        const isNewCell = !cell;

        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }

        // S'assurer que la palette de couleurs existe dans this.userColors
        // Elle devrait avoir été créée par handleInitialState, handleNewUser ou handleZoomUpdate
        const palette = this.userColors.get(userId);
        if (!palette) {
            console.error(`[${this.instanceId}] CRITICAL: Palette for ${userId} is missing in updateCell. This should not happen.`);
            // En fallback extrême, on pourrait la générer ici, mais cela indique un problème en amont.
            // const emergencyPalette = ColorGenerator.generateInitialColors(userId);
            // this.userColors.set(userId, emergencyPalette);
            // palette = emergencyPalette;
            return; // Ou retourner pour éviter d'afficher une cellule mal initialisée
        }
        
        if (isNewCell || cell.children.length !== 400) {
            cell.innerHTML = ''; 
            for (let sub_y = 0; sub_y < 20; sub_y++) {
                for (let sub_x = 0; sub_x < 20; sub_x++) {
                    const subCell = document.createElement('div');
                    subCell.className = 'sub-cell';
                    subCell.dataset.x = sub_x.toString();
                    subCell.dataset.y = sub_y.toString();
                    subCell.style.backgroundColor = palette[sub_y * 20 + sub_x] || '#B0B0B0'; // Fallback gris si une couleur manque dans la palette
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
        console.log(`Updating subcell for user ${userId} at (${subX}, ${subY}) with color ${color}`);
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.querySelector(`[data-x="${subX}"][data-y="${subY}"]`);
            if (subCell) {
                subCell.style.backgroundColor = color;
            } else {
                console.warn(`SubCell not found at ${subX},${subY} for user ${userId}`);
            }
        } else {
            console.warn(`Cell not found for user ${userId}`);
        }
    }

    removeUser(userId) {
        console.log(`Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
            this.userPositions.delete(userId);
            this.userColors.delete(userId);
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