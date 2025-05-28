// Poietic Generator Client - vX.Y.Z - 2024-05-22
// Gestion reconnexion rapide et offline/online robuste

import { ImageImporter } from './poietic-import.js';
import { ShareManager } from './poietic-share.js';
import { ColorGenerator } from './poietic-color-generator.js';
import { generateRandomColor } from './poietic-random-color.js';

const SESSION_KEY = 'poieticClientActive';
const SESSION_TIMEOUT = 20 * 1000; // 20 secondes (verrouillage navigateur)
const INACTIVITY_TIMEOUT = 180 * 1000; // 3 minutes (doit matcher le serveur)
const RECONNECTION_TIMEOUT = 180 * 1000; // 3 minutes (doit matcher le serveur)

function isSessionActive() {
    const lastActive = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
    return (Date.now() - lastActive) < SESSION_TIMEOUT;
}

// Juste après les imports
const now = Date.now();
const lastActive = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);

// Si le verrou est trop vieux (> 20s), on le considère comme expiré
if (lastActive && (now - lastActive) < SESSION_TIMEOUT) {
    document.body.innerHTML = `
        <div style="text-align: center; margin-top: 20%;">
            <h2>A session is already active in this browser.</h2>
        </div>`;
    // === DEV ONLY: Bouton caché pour réinitialiser le localStorage ===
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        const devBtn = document.createElement('button');
        devBtn.textContent = "Reset Poietic Session Lock";
        devBtn.style.position = "fixed";
        devBtn.style.bottom = "10px";
        devBtn.style.right = "10px";
        devBtn.style.zIndex = 9999;
        devBtn.style.opacity = 0.5;
        devBtn.style.padding = "0.5em 1em";
        devBtn.style.background = "#fff";
        devBtn.style.border = "1px solid #888";
        devBtn.style.borderRadius = "6px";
        devBtn.onmouseover = () => devBtn.style.opacity = 1;
        devBtn.onmouseout = () => devBtn.style.opacity = 0.5;
        devBtn.onclick = () => {
            localStorage.removeItem(SESSION_KEY);
            alert("Session lock supprimé !");
        };
        document.body.appendChild(devBtn);
    }

    throw new Error("Session already active in this browser.");
}

// On pose le verrou immédiatement
localStorage.setItem(SESSION_KEY, now.toString());
window.addEventListener('beforeunload', () => {
    localStorage.removeItem(SESSION_KEY);
});
setInterval(() => {
    localStorage.setItem(SESSION_KEY, Date.now().toString());
}, 5000); // toutes les 5 secondes

function isClientConnected() {
    return window.poieticClient && window.poieticClient.isConnected;
}

class PoieticClient {
    constructor() {
        // Singleton classique
        if (PoieticClient.instance) {
            return PoieticClient.instance;
        }
        PoieticClient.instance = this;

        // Initialisation des références DOM
        this.grid = document.getElementById('poietic-grid');
        this.colorPreview = document.getElementById('color-preview');
        this.gradientPalette = document.getElementById('gradient-palette');
        this.userPalette = document.getElementById('user-palette');
        this.activityCursor = document.getElementById('activity-cursor');
        this.reconnectButton = document.getElementById('reconnect-button');
        this.themeButton = document.querySelector('#zone-2c1 .tool-circle');

        // État de l'application
        this.cells = new Map();
        this.userPositions = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.currentColor = null;
        this.lastSelectedColor = null;
        this.isDrawing = false;
        this.myUserId = null;
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        this.initialColors = new Map();
        this.isConnected = false;
        this.cache = new Map();

        // Timers et états de connexion
        this.lastActivity = Date.now();  // Pour avoir le curseur initialisé dès le début
        this.disconnectedAt = null;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;
        this.inactivityTimer = null;
        this.inactivityTimeout = INACTIVITY_TIMEOUT;
        this.reconnectionTimeout = RECONNECTION_TIMEOUT;
        this.isLocalUpdate = false;

        // Propriétés de layout
        this.layoutOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        this.gridScale = 1.0; // Pour le futur zoom        

        // Propriétés de zoom
        this.zoomState = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isZoomed: false,
            isAutoZoom: false,
            lastActivityTime: Date.now()
        };

        // Référence à la zone de dessin
        this.drawingArea = document.getElementById('poietic-grid');
        
        // Initialisation des gestionnaires d'événements de zoom
        this.initZoomHandlers();

        // Initialisation
        this.initialize();

        // Séparer les timers
        this.connectionInactivityTimer = null;
        this.zoomInactivityTimer = null;
        this.connectionInactivityTimeout = 180 * 1000;  // 3 minutes
        this.zoomInactivityTimeout = 4000;  // 4 secondes

        // Constantes pour la gestion des interactions
        this.DRAG_START_DELAY = 100;    // Délai pour détecter un drag
        this.DRAG_MOVE_THRESHOLD = 5;   // Distance minimale pour considérer un mouvement
        this.DRAG_IDLE_TIMEOUT = 250;   // Délai sans mouvement avant arrêt du drag

        // Initialiser l'importateur d'images
        this.imageImporter = new ImageImporter(this);

        this.shareManager = new ShareManager(this);

        this.lastUpdates = new Map();

        // Ajout des références aux éléments de session
        this.sessionElements = {
            startDate: document.getElementById('session-start-date'),
            startTime: document.getElementById('session-start-time'),
            duration: document.getElementById('session-duration')
        };
        
        // Initialisation des variables de session
        this.sessionStartTime = null;
        this.sessionDurationInterval = null;

        // Modification de la référence pour utiliser le nouvel élément
        this.lastActionElement = document.getElementById('last-action-value');

        if (this.sessionTimerInterval) clearInterval(this.sessionTimerInterval);
        this.sessionTimerInterval = setInterval(() => this.updateSessionTimer(), 1000);
        this.updateSessionTimer();

        this.lastDisconnectReason = null; // 'inactivity' ou 'network'
        this.isOffline = false; // Mode offline
        this.lastServerMessage = Date.now();
        setInterval(() => {
            // Allonger le délai de tolérance à 20s
            if (this.isConnected && Date.now() - this.lastServerMessage > 20000) {
                this.isConnected = false;
                this.showNetworkIssueOverlay();
                this.startAutoReconnect();
            }
        }, 2000);
        this.wasNetworkIssue = false; // Pour détecter la sortie de NETWORK ISSUE
        this.offlineActions = []; // Pour stocker les actions offline à synchroniser
    }

    initialize() {
        // Afficher l'overlay de bienvenue
        document.body.classList.add('welcoming');
        
        // Le retirer après 3 secondes (3000 ms)
        setTimeout(() => {
            document.body.classList.remove('welcoming');
        }, 3000);

        this.initializeLayout();
        this.initializeColorPalette();
        this.initializeActivityMonitoring();
        this.connect();
        this.addEventListeners();

        // Initialisation du bouton de thème
        this.initializeThemeButton();

        // Initialiser le ShareManager après que tout est prêt
        this.shareManager = new ShareManager(this);

        // Initialiser les dimensions des canvas
        const buttonSize = 160; // Correspond à --main-button-size
        this.gradientPalette.width = buttonSize;
        this.gradientPalette.height = buttonSize;
        this.userPalette.width = buttonSize;
        this.userPalette.height = buttonSize;
    }

    initializeLayout() {
        this.updateLayout();
        window.addEventListener('resize', () => {
            // Détecter le changement d'orientation
            const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
            if (newOrientation !== this.layoutOrientation) {
                this.layoutOrientation = newOrientation;
                this.updateLayout();
            } else {
                // Juste un redimensionnement dans la même orientation
                this.updateLayout();
            }
        });
    }

    updateLayout() {
        if (!this.grid || !this.grid.parentElement) return;
    
        const mainZone = this.grid.parentElement;
        const isLandscape = this.layoutOrientation === 'landscape';
    
        // La taille devrait correspondre à la plus petite dimension
        const availableSpace = Math.min(window.innerHeight, window.innerWidth);
    
        // Appliquer directement à la main-zone
        mainZone.style.width = `${availableSpace}px`;
        mainZone.style.height = `${availableSpace}px`;
    
        // La grille prend la même taille
        const totalGridSize = availableSpace;
        this.grid.style.width = `${totalGridSize}px`;
        this.grid.style.height = `${totalGridSize}px`;
    
        // La taille d'une cellule dépend du nombre de cellules
        this.cellSize = totalGridSize / this.gridSize;
        this.subCellSize = this.cellSize / 20;
    
        // Le reste du code pour les cellules...
        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    updateCellPositions() {
        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    // Préparation pour le futur zoom
    setZoom(scale) {
        this.gridScale = scale;
        this.updateLayout();
    }

    // SECTION: Gestion de la connexion WebSocket
    connect() {
        if (this.isConnected) {
            this.disconnect();
        }
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        // AJOUT : récupération du user_id
        const storedUserId = localStorage.getItem('poieticUserId');
        const url = storedUserId
            ? `${wsProtocol}//${wsHost}/updates?user_id=${storedUserId}`
            : `${wsProtocol}//${wsHost}/updates`;
        this.socket = new WebSocket(url);
        this.socket.onopen = () => {
            this.isConnected = true;
            if (this.disconnectionTimer) clearTimeout(this.disconnectionTimer);
            if (this.autoReconnectInterval) clearInterval(this.autoReconnectInterval);
            document.body.classList.remove('disconnected');
            this.hideNetworkIssueOverlay();
            this.hideDisconnectOverlay();
            const overlay = document.getElementById('disconnect-overlay');
            if (overlay) overlay.style.display = 'none';
            this.startHeartbeat();
            this.startInactivityTimer();
            this.enableDrawingArea();
            this.reconnectAttempt = 0;
            this.maxReconnectAttempts = 10;
            console.log("Tentative de connexion avec user_id =", storedUserId);
        };
        this.socket.onmessage = (event) => {
            // (log supprimé)
            this.lastServerMessage = Date.now();
            try {
            const message = JSON.parse(event.data);
                if (message.type && message.type === "pong") {
                    return;
                }
            this.handleMessage(message);
            } catch (e) {
                // ignore
            }
            this.resetInactivityTimer();
        };
        this.socket.onclose = () => {
            this.isConnected = false;
            this.disconnectedAt = Date.now();
            this.isOffline = true;
            if (this.lastDisconnectReason !== 'inactivity') {
                this.showNetworkIssueOverlay();
                this.startAutoReconnect();
            }
            this.lastDisconnectReason = null;
        };
        this.socket.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
        };
    }

    disconnect() {
        clearInterval(this.heartbeatInterval);
        if (this.socket) {
            this.socket.close(); // S'assurer que la WebSocket est bien fermée
        }
        this.isConnected = false;
        // NE PAS supprimer l'UUID stocké lors d'une simple déconnexion réseau
        // localStorage.removeItem('poieticUserId');
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
        }
        if (this.sessionDurationInterval) {
            clearInterval(this.sessionDurationInterval);
            this.sessionDurationInterval = null;
        }
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
        if (this.disconnectionTimer) {
            clearTimeout(this.disconnectionTimer);
            this.disconnectionTimer = null;
        }
        if (this.autoReconnectInterval) {
            clearInterval(this.autoReconnectInterval);
            this.autoReconnectInterval = null;
        }
        if (this.zoomInactivityTimer) {
            clearTimeout(this.zoomInactivityTimer);
            this.zoomInactivityTimer = null;
        }
        this.lastDisconnectReason = 'inactivity';
        // this.disconnect();   <-- SUPPRIMER CETTE LIGNE !
        this.disableAllCustomOverlays();
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 5000);
    }

    // SECTION: Gestion des messages
    handleMessage(message) {
        this.lastServerMessage = Date.now();
        this.isLocalUpdate = false;
        switch (message.type) {
            case 'initial_state':
                this.handleInitialState(message);
                this.resetInactivityTimer();
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position, message.color);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                this.handlePositionFree(message.position);
                if (message.user_id === this.myUserId) {
                    this.handleInactivityTimeout();
                }
                break;
            case 'cell_update':
                this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color, true);
                // Si l'overlay USERS est ouvert, rafraîchir son contenu
                if (document.getElementById('users-overlay')?.classList.contains('active')) {
                    updateUsersOverlay();
                }
                break;
            case 'zoom_update':
                this.updateZoom(message.grid_size, message.grid_state, message.sub_cell_states);
                break;
            case 'user_disconnected':
                this.handleUserDisconnected(message);
                break;
            default:
                console.warn('Received unknown message type:', message.type);
        }
    }

    // SECTION: Gestion de l'état
    handleInitialState(state) {
        const wasOffline = this.isOffline;

        // Réinitialisation minimale de la grille et des cellules
        if (this.grid) this.grid.innerHTML = '';
        this.cells.clear();
        this.userPositions.clear();
        this.initialColors.clear();

        // Reconstruire la grille à partir de l'état reçu
        this.isOffline = false;
        this.disconnectedAt = null;
        this.gridSize = state.grid_size;
        this.myUserId = state.my_user_id;
        if (this.isConnected) {
            localStorage.setItem('poieticUserId', this.myUserId);
        }

        let palette = ColorGenerator.generateInitialColors(this.myUserId);
        if (!palette || palette.length !== 400) {
            palette = this.initialColors.get(this.myUserId) || [];
        }
        this.initialColors.set(this.myUserId, palette);
        this.currentColor = generateRandomColor();
        this.lastSelectedColor = this.currentColor;
        this.updateColorPreview();
    
        this.updateLayout();
    
        const gridState = JSON.parse(state.grid_state);
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });
        if (state.sub_cell_states) {
            Object.entries(state.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }
        this.sessionStartTime = state.session_start_time;
        this.updateSessionStartDisplay();
        this.startSessionDurationUpdate();
        this.updateUserCount();

        // Affichage des overlays
        this.hideNetworkIssueOverlay();
        this.hideDisconnectOverlay();
        const oldId = localStorage.getItem('poieticUserId');
        // Afficher l'overlay CONNECTED si on sort de NETWORK ISSUE
        if ((wasOffline || this.wasNetworkIssue) && state.my_user_id && oldId && state.my_user_id === oldId) {
            this.showNetworkBackOverlay();
            this.wasNetworkIssue = false;
        }
        // Réinitialiser le timer et le curseur d'activité après reconnexion
        this.updateLastActivity();
        this.resetInactivityTimer();
        this.updateActivityDisplay();
        // Synchroniser les actions offline à la reconnexion (TODO)
        if (this.offlineActions && this.offlineActions.length > 0) {
            this.syncOfflineActions();
        }
    }

    // Ajoute cette méthode si elle n'existe pas déjà
    showNetworkBackOverlay() {
        // Affiche l'overlay dans la zone 3b
        const zone3b = document.getElementById('zone-3b');
        let overlay = document.getElementById('network-back-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'network-back-overlay';
            overlay.className = 'network-back-overlay';
            overlay.innerHTML = `
                <div class="network-back-message">
                    <span class="network-back-title">CONNECTED</span>
                </div>
            `;
            if (zone3b) {
                zone3b.appendChild(overlay);
            } else {
                document.body.appendChild(overlay); // fallback
            }
        }
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 2000);
    }

    updateSessionStartDisplay() {
        if (!this.sessionStartTime) return;

        const startDate = new Date(this.sessionStartTime);
        
        // Format américain pour la date (MM/DD/YYYY)
        const dateStr = startDate.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });

        // Format 12h pour l'heure (hh:mm AM/PM)
        const timeStr = startDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const dateElement = document.getElementById('session-start-date');
        const timeElement = document.getElementById('session-start-time');

        if (dateElement) dateElement.textContent = dateStr;
        if (timeElement) timeElement.textContent = timeStr;
    }

    // SECTION: Gestion des cellules et de la grille
 
    positionCell(cell, x, y) {
        const totalSize = this.grid.offsetWidth; // taille totale de la grille
        const cellSize = totalSize / this.gridSize; // taille d'une cellule
        
        const centerOffset = Math.floor(this.gridSize / 2);
        const relativeX = x + centerOffset;
        const relativeY = y + centerOffset;
        
        const position = {
            left: `${(relativeX * cellSize)}px`,
            top: `${(relativeY * cellSize)}px`,
            width: `${cellSize}px`,
            height: `${cellSize}px`
        };
        
        Object.assign(cell.style, position);
        this.cache.set(`cell_position_${x}_${y}`, position);
    }

    updateCell(userId, x, y) {
        let cell = this.cells.get(userId);
        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }
    
        cell.innerHTML = '';
        if (!this.initialColors.has(userId)) {
            this.initialColors.set(userId, ColorGenerator.generateInitialColors(userId));
        }
        const initialColors = this.initialColors.get(userId);
        for (let i = 0; i < 20; i++) {
            for (let j = 0; j < 20; j++) {
                const subCell = document.createElement('div');
                subCell.className = 'sub-cell';
                subCell.dataset.x = i;
                subCell.dataset.y = j;
                subCell.style.backgroundColor = initialColors[i * 20 + j] || this.getRandomColor();
                cell.appendChild(subCell);
            }
        }
    
        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);
    
        if (userId !== this.myUserId) {
            cell.addEventListener('click', (event) => this.handleColorBorrowing(event, userId));
            cell.addEventListener('touchstart', (event) => this.handleColorBorrowing(event, userId));
        }
    }
    
    updateSubCell(userId, subX, subY, color, isUserAction = false) {
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.children[subY * 20 + subX];
            if (subCell) {
                subCell.style.backgroundColor = color;
            }
        }
    
        if (userId === this.myUserId && this.isLocalUpdate) {
            this.updateLastActivity();
        }

        if (isUserAction) {
            if (!this.lastUpdates) this.lastUpdates = new Map();
            this.lastUpdates.set(userId, Date.now());
        }
    }

    // SECTION: Gestion des couleurs

    updateCurrentColor(color) {
        this.currentColor = color;
        this.lastSelectedColor = color;
        this.updateColorPreview();
        
        if (this.gradientPalette) {
            this.gradientPalette.style.display = 'none';
        }
    }

    initializeColorPalette() {
        if (!this.gradientPalette || !this.colorPreview) return;

        // Initialisation explicite des états
        this.colorPreview.innerHTML = `
            <div class="color-preview-left"></div>
            <div class="color-preview-right"></div>
        `;
        this.setupColorPreviewListeners();
        this.updateColorPreview();
        
        // Forcer les styles initiaux des palettes
        this.gradientPalette.style.cssText = 'display: none;';
        this.userPalette.style.cssText = 'display: none;';
        
        // Vérifier la structure DOM
        this.checkDOMStructure();
    }

    updateColorPreview() {
        if (this.colorPreview && this.currentColor) {
            // Au lieu de réécrire le HTML, on met à jour les styles des divs existants
            const leftPreview = this.colorPreview.querySelector('.color-preview-left');
            const rightPreview = this.colorPreview.querySelector('.color-preview-right');
            
            if (leftPreview && rightPreview) {
                leftPreview.style.backgroundColor = this.currentColor;
                rightPreview.style.backgroundColor = this.currentColor;
            } else {
                // Si les divs n'existent pas encore, on les crée une seule fois
                this.colorPreview.innerHTML = `
                    <div class="color-preview-left"></div>
                    <div class="color-preview-right"></div>
                `;
                // On ajoute les event listeners
                this.setupColorPreviewListeners();
                // On met à jour les couleurs
                this.updateColorPreview();
            }
        }
    }

    setupColorPreviewListeners() {
        const leftPreview = this.colorPreview.querySelector('.color-preview-left');
        const rightPreview = this.colorPreview.querySelector('.color-preview-right');
        const colorPalette = document.getElementById('color-palette');

        // Ajout des gestionnaires de survol
        colorPalette.addEventListener('mouseleave', () => {
            this.gradientPalette.style.display = 'none';
            this.userPalette.style.display = 'none';
        });

        leftPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            this.userPalette.style.display = 'none';
            if (this.gradientPalette.style.display === 'none') {
                this.gradientPalette.style.cssText = `
                    display: block !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: ${this.colorPreview.offsetWidth}px;
                    height: ${this.colorPreview.offsetHeight}px;
                    z-index: 450;
                    background-color: #000000;
                `;
                this.updateGradientPalette();
            } else {
                this.gradientPalette.style.display = 'none';
            }
        });

        rightPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            this.gradientPalette.style.display = 'none';
            if (this.userPalette.style.display === 'none') {
                this.userPalette.style.cssText = `
                    display: block !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: ${this.colorPreview.offsetWidth}px;
                    height: ${this.colorPreview.offsetHeight}px;
                    z-index: 450;
                    background-color: #000000;
                `;
                this.updateUserPalette();
            } else {
                this.userPalette.style.display = 'none';
            }
        });

        this.gradientPalette.addEventListener('click', (e) => {
            const rect = this.gradientPalette.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ctx = this.gradientPalette.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            this.currentColor = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
            
            this.updateColorPreview();
            this.updateUserPalette();
            this.gradientPalette.style.display = 'none';
        });

        this.userPalette.addEventListener('click', (e) => {
            const rect = this.userPalette.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ctx = this.userPalette.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            this.currentColor = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
            
            this.updateColorPreview();
            this.updateUserPalette();
            this.userPalette.style.display = 'none';
        });
    }

    handleColorBorrowing(event, userId) {
        this.resetInactivityTimer();
        const cell = this.cells.get(userId);
        const rect = cell.getBoundingClientRect();
        const x = (event.clientX || event.touches[0].clientX) - rect.left;
        const y = (event.clientY || event.touches[0].clientY) - rect.top;
        const subX = Math.floor(x / (rect.width / 20));
        const subY = Math.floor(y / (rect.height / 20));
        const subCell = cell.children[subY * 20 + subX];
        if (subCell) {
            const computedStyle = window.getComputedStyle(subCell);
            const rgb = computedStyle.backgroundColor.match(/\d+/g);
            if (rgb) {
                const borrowedColor = this.rgbToHex(parseInt(rgb[0]), parseInt(rgb[1]), parseInt(rgb[2]));
                this.updateCurrentColor(borrowedColor);
            }
        }
    }

    getRandomColor() {
        const cacheKey = 'random_colors';
        if (!this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, []);
        }
        const cachedColors = this.cache.get(cacheKey);
        if (cachedColors.length > 0) {
            return cachedColors.pop();
        }
        const newColors = Array(100).fill().map(() => {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        });
        this.cache.set(cacheKey, newColors);
        return newColors.pop();
    }

    // Nouvelle fonction utilitaire pour parser les couleurs hex
    parseHex(color) {
        const hex = color.replace('#', '');
        return [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16)
        ];
    }

    // SECTION: Gestion du dessin
    startDrawing(event) {
        if (!this.isConnected || !this.myUserId) return;
        
        this.isDrawing = true;
        this.resetInactivityTimer();
        
        // Si on commence à dessiner en mode zoom manuel,
        // on arrête immédiatement tout drag en cours
        if (this.zoomState.isZoomed && !this.zoomState.isAutoZoom) {
            this.endDrag();
            this.drawingArea.style.cursor = '';
        }

        // Mise à jour du timestamp d'activité
        if (this.zoomState.isZoomed) {
            this.zoomState.lastActivityTime = Date.now();
        }
        
        this.draw(event);
    }

    draw(event) {
        // Permettre le dessin local si NETWORK ISSUE affiché ou mode offline
        const isNetworkIssue = document.getElementById('network-issue-overlay')?.style.display === 'flex';
        if (this.isOffline || isNetworkIssue) {
            // Dessin local uniquement sur sa propre cellule
            const myCell = this.cells.get(this.myUserId);
            if (!myCell) return;
            const gridRect = this.grid.getBoundingClientRect();
            const myCellRect = myCell.getBoundingClientRect();
            let x, y;
            if (event.type.startsWith('touch')) {
                x = event.touches[0].clientX - gridRect.left;
                y = event.touches[0].clientY - gridRect.top;
            } else {
                x = event.clientX - gridRect.left;
                y = event.clientY - gridRect.top;
            }
            if (x >= myCellRect.left - gridRect.left && x <= myCellRect.right - gridRect.left &&
                y >= myCellRect.top - gridRect.top && y <= myCellRect.bottom - gridRect.top) {
                const subX = Math.floor((x - (myCellRect.left - gridRect.left)) / (myCellRect.width / 20));
                const subY = Math.floor((y - (myCellRect.top - gridRect.top)) / (myCellRect.height / 20));
                this.isLocalUpdate = true;
                this.updateSubCell(this.myUserId, subX, subY, this.currentColor, true);
                this.updateLastActivity();
                // Stocker l'action offline pour synchronisation ultérieure
                this.offlineActions.push({ subX, subY, color: this.currentColor, timestamp: Date.now() });
            }
            this.lastUpdates.set(this.myUserId, Date.now());
            return;
        }
        // ... code existant pour le mode online ...
        if (!this.isConnected) return;
        this.resetInactivityTimer();

        // Mise à jour du timestamp pendant le dessin
        if (this.zoomState.isAutoZoom) {
            this.zoomState.lastActivityTime = Date.now();
        }

        const myCell = this.cells.get(this.myUserId);
        if (!myCell) return;

        const gridRect = this.grid.getBoundingClientRect();
        const myCellRect = myCell.getBoundingClientRect();

        let x, y;
        if (event.type.startsWith('touch')) {
            x = event.touches[0].clientX - gridRect.left;
            y = event.touches[0].clientY - gridRect.top;
        } else {
            x = event.clientX - gridRect.left;
            y = event.clientY - gridRect.top;
        }

        if (x >= myCellRect.left - gridRect.left && x <= myCellRect.right - gridRect.left &&
            y >= myCellRect.top - gridRect.top && y <= myCellRect.bottom - gridRect.top) {

            const subX = Math.floor((x - (myCellRect.left - gridRect.left)) / (myCellRect.width / 20));
            const subY = Math.floor((y - (myCellRect.top - gridRect.top)) / (myCellRect.height / 20));

            this.isLocalUpdate = true;
            this.updateSubCell(this.myUserId, subX, subY, this.currentColor, true);
            this.updateLastActivity();
            this.sendCellUpdate(subX, subY, this.currentColor);
        }

        this.lastUpdates.set(this.myUserId, Date.now());
    }

    stopDrawing() {
        this.isDrawing = false;
        this.resetInactivityTimer();
        // Mise à jour du timestamp à la fin du dessin
        if (this.zoomState.isAutoZoom) {
            this.zoomState.lastActivityTime = Date.now();
            this.startZoomInactivityTimer();
        }
    }

    sendCellUpdate(subX, subY, color) {
        if (!this.isConnected || !this.myUserId) return;

        const message = {
            type: 'cell_update',
            sub_x: subX,
            sub_y: subY,
            color: color
        };

        this.socket.send(JSON.stringify(message));
        this.updateLastActivity(); // Mise à jour du timestamp de dernière action
    }

    // SECTION: Gestion des utilisateurs
    addNewUser(userId, position, color) {
        this.updateCell(userId, position[0], position[1]);
        this.updateUserCount();
    }

    removeUser(userId) {
        const cell = this.cells.get(userId);
        if (cell && cell.parentNode === this.grid) {
            this.grid.removeChild(cell);
        }
        this.cells.delete(userId);
        this.userPositions.delete(userId);
        this.initialColors.delete(userId);
        this.updateUserCount();
    }

    // SECTION: Gestion du zoom et de la mise à jour
    updateZoom(newGridSize, gridState, subCellStates) {
        // Mettre à jour d'abord la taille de la grille
        this.gridSize = newGridSize;
    
        // Récupérer les nouvelles positions
        const parsedGridState = JSON.parse(gridState);
        const userPositions = parsedGridState.user_positions;
    
        // Supprimer d'abord les cellules qui n'existent plus
        this.cells.forEach((cell, userId) => {
            if (!userPositions[userId]) {
                if (cell && cell.parentNode === this.grid) {
                this.grid.removeChild(cell);
                }
                this.cells.delete(userId);
                this.userPositions.delete(userId);
            }
        });
    
        // Mettre à jour toutes les cellules avec leurs nouvelles positions
        Object.entries(userPositions).forEach(([userId, position]) => {
            // Mettre à jour ou créer la cellule
            this.updateCell(userId, position[0], position[1]);
            
            // Mise à jour des positions stockées
            this.userPositions.set(userId, {
                x: position[0],
                y: position[1]
            });
        });
    
        // Mettre à jour les sous-cellules après le repositionnement
        if (subCellStates) {
            Object.entries(subCellStates).forEach(([userId, subCells]) => {
                if (this.cells.has(userId)) {
                    Object.entries(subCells).forEach(([coords, color]) => {
                        const [subX, subY] = coords.split(',').map(Number);
                        this.updateSubCell(userId, subX, subY, color);
                    });
                }
            });
        }
    
        // Recalculer les dimensions de la grille
        this.updateLayout();
    }

    // SECTION: Gestion de l'activité et de l'inactivité
    initializeActivityMonitoring() {
        if (!this.activityCursor) return;

        // Intervalle existant pour l'activité
        setInterval(() => {
            this.updateActivityDisplay();
        }, 1000);

        // Nouvel intervalle pour la dernière action
        setInterval(() => {
            this.updateLastActionDisplay();
        }, 1000);

        if (this.reconnectButton) {
            this.reconnectButton.addEventListener('click', () => this.reconnect());
        }

        this.startInactivityTimer();
    }

    updateActivityDisplay() {
        if (!this.activityCursor) return;

        // Ne rien afficher si pas encore d'activité
        if (!this.lastActivity && !this.disconnectedAt) {
            this.activityCursor.style.height = '100%';
            const remainingTimeDisplay = document.getElementById('remaining-time');
            if (remainingTimeDisplay) {
                remainingTimeDisplay.textContent = '180 sec';
            }
            return;
        }

        // Si déconnecté, ne plus mettre à jour
        if (this.disconnectedAt) {
            this.activityCursor.style.height = '0%';
            const remainingTimeDisplay = document.getElementById('remaining-time');
            if (remainingTimeDisplay) {
                remainingTimeDisplay.textContent = '0 sec';
            }
            return;
        }

        const activityTime = this.lastActivity;
        const elapsedTime = Math.min((Date.now() - activityTime) / 1000, 180);
        const remainingTime = Math.max(180 - elapsedTime, 0);
        const heightPercentage = (remainingTime / 180) * 100;
        const elapsedPercentage = (elapsedTime / 180) * 100;

        // Curseur animé (ligne)
        this.activityCursor.style.height = `${heightPercentage}%`;

        // Fond gris (partie écoulée)
        const bg = document.getElementById('activity-cursor-bg');
        if (bg) {
            bg.style.height = `${elapsedPercentage}%`;
        }

        // Si le timeout est atteint, forcer la barre à 0% et le compteur à 0
        if (remainingTime === 0) {
            this.activityCursor.style.height = '0%';
            const remainingTimeDisplay = document.getElementById('remaining-time');
            if (remainingTimeDisplay) {
                remainingTimeDisplay.textContent = '0 sec';
            }
            if (this.isConnected) {
                this.handleInactivityTimeout();
            }
            return;
        }

        // Mise à jour du temps restant sous la lettre T
        const remainingTimeDisplay = document.getElementById('remaining-time');
        if (remainingTimeDisplay) {
            remainingTimeDisplay.textContent = Math.floor(remainingTime);
        }
    }

    updateLastActivity() {
        this.lastActivity = Date.now();
        this.updateLastActionDisplay();
    }

    startInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            this.handleInactivityTimeout();
        }, this.inactivityTimeout);
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        this.startInactivityTimer();
    }

    handleInactivityTimeout() {
        console.log('Timer d\'inactivité expiré, déconnexion !');
        this.lastDisconnectReason = 'inactivity';
        // Retirer explicitement la cellule de l'utilisateur courant
        if (this.myUserId) {
            this.removeUser(this.myUserId);
        }
        // Supprimer l'UUID stocké lors du timeout d'inactivité
        localStorage.removeItem('poieticUserId'); // <-- OK ici
        this.disableAllCustomOverlays();
        // Afficher l'overlay de déconnexion AVANT la déconnexion
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) {
            overlay.style.display = 'block';
            overlay.offsetHeight;
            document.body.classList.add('disconnected');
        }
        this.disconnect();
        // Fermer la WebSocket proprement
        if (this.socket) this.socket.close();
        // Stopper toute reconnexion automatique
        if (this.autoReconnectInterval) {
            clearInterval(this.autoReconnectInterval);
            this.autoReconnectInterval = null;
        }
        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'none';
        }
    }

    startDisconnectionTimer() {
        if (this.disconnectionTimer) clearTimeout(this.disconnectionTimer);
        this.disconnectionTimer = setTimeout(() => {
            if (!document.body.classList.contains('disconnected')) {
                this.disableAllCustomOverlays();
                // Stopper toute reconnexion automatique
                if (this.autoReconnectInterval) {
                    clearInterval(this.autoReconnectInterval);
                    this.autoReconnectInterval = null;
                }
            }
        }, this.disconnectionTimeout);
    }

    startAutoReconnect() {
        if (this.autoReconnectInterval) clearInterval(this.autoReconnectInterval);
        let startTime = Date.now();
        // Ajoute un délai avant la première tentative
        setTimeout(() => {
            this.autoReconnectInterval = setInterval(() => {
                if (document.body.classList.contains('disconnected')) {
                    clearInterval(this.autoReconnectInterval);
                    this.autoReconnectInterval = null;
                    this.hideNetworkIssueOverlay();
                    return;
                }
                if (!this.isConnected) {
                    // Arrêter la reconnexion si le délai de reconnexion rapide est dépassé
                    if (Date.now() - this.disconnectedAt > this.reconnectionTimeout) {
                        clearInterval(this.autoReconnectInterval);
                        this.autoReconnectInterval = null;
                        this.showDisconnectOverlay();
                        return;
                    }
                    this.reconnectAttempt = (this.reconnectAttempt || 0) + 1;
                    this.showNetworkIssueOverlay();
                    this.connect();
                    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
                        clearInterval(this.autoReconnectInterval);
                        this.autoReconnectInterval = null;
                    }
                }
            }, 5000); // toutes les 5 secondes
        }, 1000); // 1 seconde de délai
    }

    // SECTION: Gestion de l'interface graphique
    showReconnectButton() {
        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'block';
            // Force un reflow pour que la transition fonctionne
            this.reconnectButton.offsetHeight;
            this.reconnectButton.style.opacity = '1';
        }
    }

    addOverlay() {
        let overlay = document.getElementById('disconnect-overlay');
        const mainZone = document.querySelector('.main-zone');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'disconnect-overlay';
            // Ajout de l'overlay directement sur la zone principale
            mainZone.appendChild(overlay);
        }
        overlay.style.display = 'block';
    }

    // SECTION: Gestion des événements
    addEventListeners() {
        if (this.grid) {
            this.grid.addEventListener('mouseenter', () => this.handleGridEnter());
            this.grid.addEventListener('mouseleave', () => this.handleGridLeave());
            this.grid.addEventListener('mousemove', (e) => {
                this.handleGridMove(e);
                // Ajouter l'appel à draw pendant le mouvement de la souris
                if (this.isDrawing) {
                    this.draw(e);
                }
            });
            this.grid.addEventListener('mousedown', (e) => this.startDrawing(e));
            this.grid.addEventListener('mouseup', () => this.stopDrawing());
            this.grid.addEventListener('mouseleave', () => this.stopDrawing());

            this.grid.addEventListener('touchstart', (e) => this.startDrawing(e));
            this.grid.addEventListener('touchmove', (e) => this.draw(e));
            this.grid.addEventListener('touchend', () => this.stopDrawing());
        }

        // Ajouter l'écouteur pour le bouton zoom
        const zoomButton = document.getElementById('zone-2a1');
        if (zoomButton) {
            zoomButton.addEventListener('click', () => this.toggleZoom());
        }

        document.querySelectorAll('.stat-overlay').forEach(overlay => {
            overlay.addEventListener('click', function(e) {
                const zone = this.closest('.stat-zone');
                if (zone.classList.contains('show-content')) {
                    zone.classList.remove('show-content');
                } else {
                    // Fermer les autres overlays ouverts
                    document.querySelectorAll('.stat-zone.show-content').forEach(z => z.classList.remove('show-content'));
                    zone.classList.add('show-content');
                }
                e.stopPropagation();
            });
        });

        // Fermer le contenu si on clique ailleurs
        document.addEventListener('click', function(e) {
            document.querySelectorAll('.stat-zone.show-content').forEach(zone => {
                if (!zone.contains(e.target)) {
                    zone.classList.remove('show-content');
                }
            });
        });

        const z3a1circle = document.querySelector('#zone-3a1 .tool-circle');
        if (z3a1circle) z3a1circle.addEventListener('click', () => {
            if (!isClientConnected()) {
                document.getElementById('disconnect-overlay').classList.add('active');
                return;
            }
            showCustomOverlay('session-overlay', updateSessionOverlay, [this.sessionStartTime]);
        });

        const z3a2circle = document.querySelector('#zone-3a2 .tool-circle');
        if (z3a2circle) z3a2circle.addEventListener('click', () => {
            if (!isClientConnected()) {
                document.getElementById('disconnect-overlay').classList.add('active');
                return;
            }
            showCustomOverlay('users-overlay', updateUsersOverlay);
        });

        const z3c1circle = document.querySelector('#zone-3c1 .tool-circle');
        if (z3c1circle) z3c1circle.addEventListener('click', () => {
            if (!isClientConnected()) {
                document.getElementById('disconnect-overlay').classList.add('active');
                return;
            }
            showCustomOverlay('time-out-overlay', updateTimeoutOverlay);
        });

        const z3c2circle = document.querySelector('#zone-3c2 .tool-circle');
        if (z3c2circle) z3c2circle.addEventListener('click', () => {
            if (!isClientConnected()) {
                document.getElementById('disconnect-overlay').classList.add('active');
                return;
            }
            showCustomOverlay('stats-overlay');
        });
    }

    handleGridEnter() {
        this.isOverGrid = true;
        if (this.zoomState.isAutoZoom && !this.isOverOwnCell) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                myCell.classList.add('highlighted');
            }
        }
        this.updateHighlight();
    }

    handleGridLeave() {
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        if (this.zoomState.isAutoZoom) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                myCell.classList.remove('highlighted');
            }
        }
        this.updateHighlight();
    }

    handleGridMove(event) {
        const targetCell = event.target.closest('.user-cell');
        if (targetCell) {
            const userId = [...this.cells.entries()].find(([_, cell]) => cell === targetCell)?.[0];
            this.isOverOwnCell = userId === this.myUserId;
        } else {
            this.isOverOwnCell = false;
        }
        
        // Mise à jour de la surbrillance en fonction du mode zoom et de la position
        if (this.zoomState.isAutoZoom) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                if (this.isOverOwnCell) {
                    myCell.classList.remove('highlighted');
                } else if (this.isOverGrid) {
                    myCell.classList.add('highlighted');
                }
            }
        } else {
            this.updateHighlight();
        }
    }

    updateHighlight() {
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            if (this.isOverGrid && !this.isOverOwnCell && !this.zoomState.isAutoZoom) {
                myCell.classList.add('highlighted');
            } else {
                myCell.classList.remove('highlighted');
            }
        }
    }

    // SECTION: Utilitaires
    reconnect() {
        // console.log('Tentative de reconnexion...');
        
        // Retirer l'overlay sans transition
        document.body.classList.remove('disconnected');
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }

        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'none';
        }

        this.resetClientState();
        this.connect();
    }

    resetClientState() {
        this.cells.clear();
        this.userPositions.clear();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.currentColor = null;
        this.lastSelectedColor = null;
        this.isDrawing = false;
        this.myUserId = null;
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        this.initialColors.clear();
        this.isConnected = false;
        this.cache.clear();
        // Supprimer l'UUID stocké lors de la réinitialisation
        localStorage.removeItem('poieticUserId');

        if (this.grid) {
            this.grid.innerHTML = '';
        }

        clearInterval(this.heartbeatInterval);
        clearTimeout(this.inactivityTimer);
        this.lastActivity = Date.now();
        this.disconnectedAt = null;
    }

    handleUserDisconnected(message) {
        if (message.user_id === this.myUserId) {
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        }
    }

    handlePositionFree(position) {
        // console.log('Position libre:', position);
    }

    toggleZoom() {
        const zoomButton = document.getElementById('zone-2a1');
        zoomButton.classList.toggle('zoomed');
        // console.log('Zoom toggled'); // Pour débugger
    }

    initializeThemeButton() {
        const themeButton = document.querySelector('#zone-2c1 .tool-circle');
        if (themeButton) {
            themeButton.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');
            });
        }
    }

    initZoomHandlers() {
        // Conserver les gestionnaires existants pour le zoom automatique
        const zoomButton = document.querySelector('#zone-2a1 .tool-circle');
        zoomButton.addEventListener('mouseenter', () => this.highlightUserCell(true));
        zoomButton.addEventListener('mouseleave', () => {
            if (!this.zoomState.isAutoZoom) this.highlightUserCell(false);
        });
        zoomButton.addEventListener('click', () => this.toggleAutoZoom());

        // Zoom manuel (molette)
        this.drawingArea.addEventListener('wheel', (e) => {
            if (!this.zoomState.isAutoZoom) this.handleManualZoom(e);
        });

        // Nouveaux gestionnaires pour le drag and drop
        this.drawingArea.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.drawingArea.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.drawingArea.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.drawingArea.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // Empêcher le drag and drop par défaut
        this.drawingArea.addEventListener('dragstart', (e) => e.preventDefault());
    }

    toggleAutoZoom() {
        if (this.zoomState.isAutoZoom) {
            // Désactiver le zoom auto
            this.resetZoom();
            // Garder la surbrillance pendant 1 seconde après la fin du zoom
            setTimeout(() => {
                this.highlightUserCell(false);
            }, 1000);
        } else {
            // Activer le zoom auto et la surbrillance
            this.zoomState.isAutoZoom = true;
            this.highlightUserCell(true);
            this.zoomToUserAndNeighbors();
        }
        this.updateZoomVisuals();
    }

    zoomToUserAndNeighbors() {
        if (!this.myUserId || !this.userPositions.has(this.myUserId)) return;

        const rect = this.drawingArea.getBoundingClientRect();
        const myPosition = this.userPositions.get(this.myUserId);

        // Calculer l'échelle pour voir la cellule utilisateur et la moitié des voisins
        const targetScale = rect.width / (this.cellSize * 2); // 2 au lieu de 3 pour voir la moitié des voisins
        const newScale = Math.min(targetScale, this.getMaxZoom());

        // Position du centre de la viewport
        const viewportCenterX = rect.width / 2;
        const viewportCenterY = rect.height / 2;

        // Position de la cellule de l'utilisateur dans l'espace non zoomé
        const userX = (myPosition.x + this.gridSize/2) * this.cellSize;
        const userY = (myPosition.y + this.gridSize/2) * this.cellSize;

        // Calculer les offsets pour centrer la cellule de l'utilisateur
        this.zoomState.offsetX = viewportCenterX - (userX * newScale);
        this.zoomState.offsetY = viewportCenterY - (userY * newScale);
        this.zoomState.scale = newScale;
        this.zoomState.isZoomed = true;
        this.zoomState.isAutoZoom = true;

        this.updateZoomVisuals();
        this.startZoomInactivityTimer();
    }

    resetZoom(animate = true) {
        const duration = animate ? 500 : 0;
        
        this.zoomState.isAutoZoom = false;
        this.zoomState.scale = 1;
        this.zoomState.offsetX = 0;
        this.zoomState.offsetY = 0;
        this.zoomState.isZoomed = false;

        if (animate) {
            this.drawingArea.style.transition = `transform ${duration}ms ease-out`;
            requestAnimationFrame(() => {
                this.updateZoomVisuals();
                setTimeout(() => {
                    this.drawingArea.style.transition = '';
                }, duration);
            });
        } else {
            this.updateZoomVisuals();
        }
    }

    // Mise à jour de updateZoomVisuals pour gérer correctement l'état du bouton SVG
    updateZoomVisuals() {
        const transform = `scale(${this.zoomState.scale}) translate(${this.zoomState.offsetX / this.zoomState.scale}px, ${this.zoomState.offsetY / this.zoomState.scale}px)`;
        this.drawingArea.style.transformOrigin = '0 0';
        this.drawingArea.style.transform = transform;

        // Mise à jour de l'état visuel du bouton
        const zoomButton = document.querySelector('#zone-2a1');
        if (zoomButton) {
            if (this.zoomState.isAutoZoom || this.zoomState.isZoomed) {
                zoomButton.setAttribute('data-state', 'zoomed');
            } else {
                zoomButton.setAttribute('data-state', 'normal');
            }
        }
    }

    handleManualZoom(e) {
        e.preventDefault();
        
        // Mise à jour du timestamp d'activité
        this.zoomState.lastActivityTime = Date.now();

        // Calcul du facteur de zoom basé sur la molette
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(this.zoomState.scale * zoomFactor, 1), this.getMaxZoom());

        if (newScale !== this.zoomState.scale) {
            const rect = this.drawingArea.getBoundingClientRect();
            
            // Position de la souris dans l'espace transformé actuel
            const transformedX = (e.clientX - rect.left) / this.zoomState.scale;
            const transformedY = (e.clientY - rect.top) / this.zoomState.scale;

            // Calcul des nouveaux offsets
            const dx = transformedX * (newScale - this.zoomState.scale);
            const dy = transformedY * (newScale - this.zoomState.scale);

            this.zoomState.offsetX -= dx;
            this.zoomState.offsetY -= dy;
            this.zoomState.scale = newScale;
            this.zoomState.isZoomed = newScale > 1;
            
            this.updateZoomVisuals();
            this.startZoomInactivityTimer();
        }
    }

    handleMouseDown(e) {
        const initialX = e.clientX;
        const initialY = e.clientY;

        if (this.isOverOwnCell) {
            this.isDrawing = true;
            this.draw(e);
            this.zoomState.lastActivityTime = Date.now();
            return;
        }

        if (!this.zoomState.isZoomed || this.zoomState.isAutoZoom) return;

        this.dragState = {
            isPending: true,
            startX: initialX,
            startY: initialY,
            lastX: initialX,
            lastY: initialY,
            hasStartedDragging: false
        };
        
        e.preventDefault();
    }

    handleMouseMove(e) {
        this.zoomState.lastActivityTime = Date.now();

        if (this.isOverOwnCell && this.isDrawing) {
            this.draw(e);
            return;
        }

        if (this.dragState && e.buttons === 1) {
            const deltaX = Math.abs(e.clientX - this.dragState.startX);
            const deltaY = Math.abs(e.clientY - this.dragState.startY);
            
            if (deltaX > this.DRAG_MOVE_THRESHOLD || deltaY > this.DRAG_MOVE_THRESHOLD) {
                // Ajouter le bloqueur seulement quand on commence à drag
                if (!this.clickBlocker) {
                    this.clickBlocker = document.createElement('div');
                    this.clickBlocker.style.position = 'absolute';
                    this.clickBlocker.style.top = '0';
                    this.clickBlocker.style.left = '0';
                    this.clickBlocker.style.width = '100%';
                    this.clickBlocker.style.height = '100%';
                    this.clickBlocker.style.zIndex = '1000';
                    this.drawingArea.appendChild(this.clickBlocker);
                }
                
                this.dragState.isPending = false;
                this.dragState.hasStartedDragging = true;
                this.drawingArea.style.cursor = 'grabbing';
                
                const moveDeltaX = e.clientX - this.dragState.lastX;
                const moveDeltaY = e.clientY - this.dragState.lastY;
                
                this.zoomState.offsetX += moveDeltaX;
                this.zoomState.offsetY += moveDeltaY;
                
                this.dragState.lastX = e.clientX;
                this.dragState.lastY = e.clientY;
                
                this.updateZoomVisuals();
            }
        } else if (!e.buttons) {
            if (this.clickBlocker) {
                this.clickBlocker.remove();
                this.clickBlocker = null;
            }
            this.dragState = null;
            this.drawingArea.style.cursor = '';
        }
    }

    handleMouseUp(e) {
        if (this.isOverOwnCell) {
            this.isDrawing = false;
            return;
        }

        // Sélection de couleur uniquement si on n'a pas fait de drag
        if (!this.dragState?.hasStartedDragging) {
            const targetCell = e.target.closest('.user-cell');
            if (targetCell) {
                const userId = [...this.cells.entries()].find(([_, cell]) => cell === targetCell)?.[0];
                if (userId && userId !== this.myUserId) {
                    this.handleColorBorrowing(e, userId);
                }
            }
        }
        
        // Nettoyage
        if (this.clickBlocker) {
            this.clickBlocker.remove();
            this.clickBlocker = null;
        }
        this.dragState = null;
        this.drawingArea.style.cursor = '';
    }

    startZoomInactivityTimer() {
        if (this.zoomInactivityTimer) {
            clearTimeout(this.zoomInactivityTimer);
        }

        this.zoomInactivityTimer = setTimeout(() => {
            if (this.zoomState.isAutoZoom || this.zoomState.isZoomed) {
                const inactivityDuration = Date.now() - this.zoomState.lastActivityTime;
                if (inactivityDuration >= this.zoomInactivityTimeout) {
                    this.resetZoom();
                } else {
                    this.startZoomInactivityTimer();
                }
            }
        }, this.zoomInactivityTimeout);
    }

    getMaxZoom() {
        const gridSize = this.gridSize;
        const cellSize = this.drawingArea.clientWidth / gridSize;
        return this.drawingArea.clientWidth / cellSize;
    }

    highlightUserCell(highlight) {
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            if (highlight) {
                myCell.classList.add('highlighted');
            } else {
                if (!this.zoomState.isAutoZoom) {
                    myCell.classList.remove('highlighted');
                }
            }
        }
    }

    updateLocalCell(x, y, colorIndex) {
        if (!this.myUserId || !this.cells.has(this.myUserId)) return;
        
        const cell = this.cells.get(this.myUserId);
        const subCell = cell.children[y * 20 + x];
        if (subCell) {
            subCell.style.backgroundColor = this.palette[colorIndex];
        }
    }

    sendGridUpdate(updates) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'batch_update',
                updates: updates
            }));
        }
    }

    initializeWebSocket() {
        this.connect();
        // Initialiser le ShareManager après la connexion
        this.shareManager = new ShareManager(this);
    }

    // Ajoutons une méthode pour vérifier la structure DOM
    checkDOMStructure() {
        // console.log('Structure DOM du color-palette:');
        const colorPalette = document.getElementById('color-palette');
        // console.log(colorPalette.innerHTML);
        
        // console.log('Dimensions du color-palette:');
        const rect = colorPalette.getBoundingClientRect();
        // console.log({
        //     width: rect.width,
        //     height: rect.height,
        //     top: rect.top,
        //     left: rect.left
        // });
        
        // console.log('Styles calculés du gradient-palette:');
        // console.log(window.getComputedStyle(this.gradientPalette));
        
        // console.log('Styles calculés du user-palette:');
        // console.log(window.getComputedStyle(this.userPalette));
    }

    updateGradientPalette() {
        const ctx = this.gradientPalette.getContext('2d');
        if (!ctx) return;

        const rect = this.gradientPalette.getBoundingClientRect();
        this.gradientPalette.width = rect.width;
        this.gradientPalette.height = rect.height;

        ctx.clearRect(0, 0, rect.width, rect.height);

        try {
            // 1. Dégradé horizontal (couleurs)
            const gradientH = ctx.createLinearGradient(0, 0, rect.width, 0);
            gradientH.addColorStop(0, "#FF0000");
            gradientH.addColorStop(0.17, "#FFFF00");
            gradientH.addColorStop(0.33, "#00FF00");
            gradientH.addColorStop(0.5, "#00FFFF");
            gradientH.addColorStop(0.67, "#0000FF");
            gradientH.addColorStop(0.83, "#FF00FF");
            gradientH.addColorStop(1, "#FF0000");

            ctx.fillStyle = gradientH;
            ctx.fillRect(0, 0, rect.width, rect.height);

            // 2. Dégradé blanc vers transparent
            const gradientWhite = ctx.createLinearGradient(0, 0, 0, rect.height/2);
            gradientWhite.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradientWhite.addColorStop(1, "rgba(255, 255, 255, 0)");
            
            ctx.fillStyle = gradientWhite;
            ctx.fillRect(0, 0, rect.width, rect.height/2);

            // 3. Dégradé transparent vers noir
            const gradientBlack = ctx.createLinearGradient(0, rect.height/2, 0, rect.height);
            gradientBlack.addColorStop(0, "rgba(0, 0, 0, 0)");
            gradientBlack.addColorStop(1, "rgba(0, 0, 0, 1)");
            
            ctx.fillStyle = gradientBlack;
            ctx.fillRect(0, rect.height/2, rect.width, rect.height/2);

        } catch (error) {
            console.error('Erreur lors du dessin du gradient:', error);
        }
    }

    // Modifier rgbToHsl pour accepter une couleur hex
    hexToHsl(hexColor) {
        const [r, g, b] = this.parseHex(hexColor);
        return this.rgbToHsl(r, g, b);
    }

    // Nouvelle fonction utilitaire pour convertir RGB en HSL
    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatique
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h * 360, s * 100, l * 100];
    }

    // Fonction pour extraire les valeurs RGB d'une chaîne de couleur
    parseRgb(color) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return [
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3])
            ];
        }
        return [0, 0, 0];
    }

    updateUserPalette() {
        const ctx = this.userPalette.getContext('2d');
        if (!ctx) return;

        const width = this.colorPreview.offsetWidth;
        const height = this.colorPreview.offsetHeight;
        
        this.userPalette.width = width;
        this.userPalette.height = height;
        ctx.clearRect(0, 0, width, height);

        // Collecter les couleurs
        const colors = new Set();
        const myCell = this.cells.get(this.myUserId);
        
        // Initialiser ou récupérer l'historique des couleurs
        if (!this.colorHistory) {
            this.colorHistory = new Set();
        }
        
        // Ajouter la couleur courante à l'historique
        if (this.currentColor && this.currentColor !== 'transparent') {
            this.colorHistory.add(this.currentColor);
        }
        
        if (myCell) {
            // Collecter toutes les couleurs actives du dessin
            Array.from(myCell.children).forEach(subCell => {
                const color = subCell.style.backgroundColor;
                if (color && color !== 'transparent') {
                    // Vérifier luminosité et saturation avant d'ajouter la couleur
                    const [r, g, b] = this.parseRgb(color);
                    const [h, s, l] = this.rgbToHsl(r, g, b);
                    
                    // Critères de filtrage légèrement assouplis
                    if (l < 95 && l > 5 && s < 95 && s > 5) {
                        colors.add(color);
                    }
                }
            });
        }

        // Ajouter les couleurs de l'historique qui sont encore dans le dessin
        this.colorHistory.forEach(color => {
            if (colors.has(color) || color === this.currentColor) {
                colors.add(color);
            }
        });

        // Convertir les couleurs en tableau et trier
        const colorArray = Array.from(colors).sort((a, b) => {
            const [r1, g1, b1] = this.parseRgb(a);
            const [r2, g2, b2] = this.parseRgb(b);
            
            const [h1, s1, l1] = this.rgbToHsl(r1, g1, b1);
            const [h2, s2, l2] = this.rgbToHsl(r2, g2, b2);
            
            // Trier par teinte
            if (h1 !== h2) return h1 - h2;
            // Puis par luminosité
            if (l1 !== l2) return l2 - l1;
            // Enfin par saturation
            return s2 - s1;
        });

        // Afficher les couleurs triées XX
        const gridSize = Math.ceil(Math.sqrt(colorArray.length));
        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;

        colorArray.forEach((color, index) => {
            const x = (index % gridSize) * cellWidth;
            const y = Math.floor(index / gridSize) * cellHeight;
            
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth, cellHeight);
            
            ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        });
    }

    handleDrawing(event) {
        if (!this.isDrawing || !this.isOverGrid || !this.currentColor) return;

        const cell = event.target;
        if (cell.style.backgroundColor !== this.currentColor) {
            cell.style.backgroundColor = this.currentColor;
            this.sendUpdate(cell);
            this.updateUserPalette();
        }
    }

    // Nouvelle fonction utilitaire pour convertir RGB en HEX
    rgbToHex(r, g, b) {
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    updateSessionDisplay() {
        if (this.sessionStartTime) {
            // Mise à jour de la date
            this.sessionElements.startDate.textContent = 
                this.sessionStartTime.toISOString().slice(0,10).replace(/-/g,'/');
            
            // Mise à jour de l'heure
            this.sessionElements.startTime.textContent = 
                this.sessionStartTime.toTimeString().slice(0,8);
        }
    }

    startSessionDurationUpdate() {
        // Nettoyer l'intervalle existant si présent
        if (this.sessionDurationInterval) {
            clearInterval(this.sessionDurationInterval);
        }

        // Mettre à jour la durée toutes les secondes
        this.sessionDurationInterval = setInterval(() => {
            if (!this.sessionStartTime) return;

            const now = Date.now();
            const duration = now - this.sessionStartTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            
            if (this.sessionElements.duration) {
                this.sessionElements.duration.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    updateLastActionDisplay() {
        if (!this.lastActionElement || !this.lastActivity) return;

        const now = Date.now();
        const timeSinceLastAction = Math.floor((now - this.lastActivity) / 1000); // Conversion en secondes
        
        this.lastActionElement.textContent = timeSinceLastAction;
    }

    updateUserCount() {
        const userCountSpan = document.getElementById('user-count-value');
        if (userCountSpan) {
            userCountSpan.textContent = this.cells.size;
        }
    }

    updateSessionTimer() {
        if (!this.sessionStartTime) return;
        const now = Date.now();
        const elapsed = Math.floor((now - this.sessionStartTime) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        const timerSpan = document.getElementById('session-timer');
        if (timerSpan) timerSpan.textContent = `${minutes}:${seconds}`;
    }

    getUserStats() {
        // n = total users
        const n = this.cells.size;
        // n2 = users ayant dessiné au moins une fois
        let n2 = 0;
        this.cells.forEach((_, userId) => {
            // Vérifiez si l'utilisateur a dessiné (présence dans lastUpdates ou autre critère)
            if (this.lastUpdates && this.lastUpdates.has(userId)) {
                n2++;
            }
        });
        // n1 = n - n2
        const n1 = n - n2;
        return { n, n1, n2 };
    }

    showNetworkIssueOverlay() {
        const overlay = document.getElementById('network-issue-overlay');
        if (overlay) overlay.style.display = 'flex';
        const disconnectOverlay = document.getElementById('disconnect-overlay');
        if (disconnectOverlay) disconnectOverlay.style.display = 'none';
        this.wasNetworkIssue = true;
    }
    hideNetworkIssueOverlay() {
        const overlay = document.getElementById('network-issue-overlay');
        if (overlay) overlay.style.display = 'none';
    }
    showDisconnectOverlay() {
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) {
            overlay.style.display = 'block';
        }
        const networkOverlay = document.getElementById('network-issue-overlay');
        if (networkOverlay) networkOverlay.style.display = 'none';
    }
    hideDisconnectOverlay() {
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    disableDrawingArea() {
        if (this.grid) {
            this.grid.style.pointerEvents = 'none';
            this.grid.style.opacity = '0.5'; // Optionnel : effet visuel
        }
    }
    enableDrawingArea() {
        if (this.grid) {
            this.grid.style.pointerEvents = 'auto';
            this.grid.style.opacity = '1';
        }
    }

    disableAllCustomOverlays() {
        document.querySelectorAll('.custom-overlay').forEach(ov => ov.classList.remove('active'));
        // Désactive aussi les overlays techniques
        document.getElementById('network-issue-overlay')?.classList.remove('active');
    }

    syncOfflineActions() {
        if (!this.isConnected || !this.offlineActions || this.offlineActions.length === 0) return;
        // On envoie chaque action dans l'ordre
        for (const action of this.offlineActions) {
            const message = {
                type: 'cell_update',
                sub_x: action.subX,
                sub_y: action.subY,
                color: action.color
            };
            this.socket.send(JSON.stringify(message));
        }
        // On vide la file après envoi
        this.offlineActions = [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.poieticClient = new PoieticClient();
});

function updateSessionDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('session-date-value').textContent = `${day}/${month}`;
}

document.addEventListener('DOMContentLoaded', function() {
    const daySpan = document.getElementById('session-day-value');
    const monthSpan = document.getElementById('session-month-value');
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    if (daySpan) daySpan.textContent = day;
    if (monthSpan) monthSpan.textContent = month;
});

function showCustomOverlay(id, updateFn, updateArgs = [], timeout = 5000) {
    // Empêcher l'ouverture si déconnecté
    if (document.body.classList.contains('disconnected')) return;

    // Masquer tous les overlays personnalisés
    document.querySelectorAll('.custom-overlay').forEach(ov => ov.classList.remove('active'));
    // Mettre à jour les valeurs si besoin
    if (typeof updateFn === 'function') updateFn(...updateArgs);

    // Afficher l'overlay demandé
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('active');

    // Masquer après timeout, sauf si l'utilisateur agit dessus
    let hideTimeout = setTimeout(() => {
        overlay.classList.remove('active');
    }, timeout);

    // Si l'utilisateur clique ou touche l'overlay, on annule le timeout
    overlay.addEventListener('pointerdown', () => {
        clearTimeout(hideTimeout);
    }, { once: true });
}

// === OVERLAYS DYNAMIQUES ===

// Utilitaire pour formater les dates et durées
function pad2(n) { return n.toString().padStart(2, '0'); }

// Met à jour l'overlay SESSION
function updateSessionOverlay(sessionStartTime) {
    if (!sessionStartTime) return;
    const start = new Date(sessionStartTime);
    document.getElementById('session-date').textContent =
        `${start.getFullYear()}:${pad2(start.getMonth() + 1)}:${pad2(start.getDate())}`;
    document.getElementById('session-time').textContent =
        `${pad2(start.getHours())}:${pad2(start.getMinutes())}:${pad2(start.getSeconds())}`;
    // Durée écoulée
    const now = Date.now();
    const elapsed = Math.floor((now - sessionStartTime) / 1000);
    const min = pad2(Math.floor(elapsed / 60));
    const sec = pad2(elapsed % 60);
    document.getElementById('session-duration').textContent = `${min}:${sec}`;
}

// Met à jour l'overlay USERS
function updateUsersOverlay() {
    const stats = window.poieticClient.getUserStats();
    document.getElementById('users-n').textContent = stats.n;
    document.getElementById('users-n1').textContent = stats.n1;
    document.getElementById('users-n2').textContent = stats.n2;
}

// Met à jour l'overlay TIME OUT
function updateTimeoutOverlay() {
    // Temps restant avant déconnexion
    const s1 = parseInt(document.getElementById('remaining-time')?.textContent) || 0;

    // Temps depuis la dernière action de l'utilisateur courant
    let s2 = 0;
    if (window.poieticClient && window.poieticClient.lastActivity) {
        s2 = Math.floor((Date.now() - window.poieticClient.lastActivity) / 1000);
    }

    document.getElementById('timeout-s1').textContent = s1;
    document.getElementById('timeout-s2').textContent = s2;
}

// Intégration listeners après chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    // Variables dynamiques à adapter selon votre logique
    let sessionStartTime = window.poieticClient?.sessionStartTime || Date.now();
    let userCount = window.poieticClient?.userColors?.size || 2;
    let userCountUndefined = 1; // À calculer selon votre logique
    let userCountHumans = 1;    // À calculer selon votre logique
    let timeoutRemaining = parseInt(document.getElementById('remaining-time')?.textContent) || 120;
    let timeSinceLastAction = 10; // À calculer selon votre logique

    // Ajout des listeners sur les zones
    const z3a1 = document.getElementById('zone-3a1');
    const z3a2 = document.getElementById('zone-3a2');
    const z3c1 = document.getElementById('zone-3c1');
    const z3c2 = document.getElementById('zone-3c2');

    if (z3a1) z3a1.addEventListener('click', () => {
        if (!isClientConnected()) {
            document.getElementById('disconnect-overlay').classList.add('active');
            return;
        }
        showCustomOverlay('session-overlay', updateSessionOverlay, [sessionStartTime]);
    });
    if (z3a2) z3a2.addEventListener('click', () => {
        if (!isClientConnected()) {
            document.getElementById('disconnect-overlay').classList.add('active');
            return;
        }
        showCustomOverlay('users-overlay', updateUsersOverlay);
    });
    if (z3c1) z3c1.addEventListener('click', () => {
        if (!isClientConnected()) {
            document.getElementById('disconnect-overlay').classList.add('active');
            return;
        }
        showCustomOverlay('time-out-overlay', updateTimeoutOverlay);
    });
    if (z3c2) z3c2.addEventListener('click', () => {
        if (!isClientConnected()) {
            document.getElementById('disconnect-overlay').classList.add('active');
            return;
        }
        showCustomOverlay('stats-overlay');
    });

    // Mise à jour automatique de la durée de session et du timeout
    setInterval(() => {
        sessionStartTime = window.poieticClient?.sessionStartTime || sessionStartTime;
        userCount = window.poieticClient?.userColors?.size || userCount;
        // userCountUndefined et userCountHumans : à calculer selon votre logique
        timeoutRemaining = parseInt(document.getElementById('remaining-time')?.textContent) || timeoutRemaining;
        // timeSinceLastAction : à calculer selon votre logique

        if (document.getElementById('session-overlay').classList.contains('active')) {
            updateSessionOverlay(sessionStartTime);
        }
        if (document.getElementById('users-overlay').classList.contains('active')) {
            updateUsersOverlay();
        }
        if (document.getElementById('time-out-overlay').classList.contains('active')) {
            updateTimeoutOverlay();
        }
    }, 1000);

});