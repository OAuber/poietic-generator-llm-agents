//console.log("[Player DEBUG] poietic-player.js SCRIPT EXECUTION STARTED");

import { PlayerShareManager } from './poietic-player-share.js';
import { ColorGenerator } from './poietic-color-generator.js';

class PoieticPlayer {
    constructor() {
        //console.log("[Player DEBUG] PoieticPlayer CONSTRUCTOR CALLED");
        // État du player
        this.state = {
            events: [],
            currentEventIndex: 0,
            isPlaying: false,
            playbackSpeed: 1,
            currentSession: null,
            gridSize: 1,
            cells: new Map(),
            userPositions: new Map(),
            userColors: new Map(),
            playStartTime: null,      // Temps réel de début de lecture
            sessionDuration: 0,       // Durée totale de la session
            elapsedTime: 0,          // Temps écoulé dans la lecture
            sessionsData: null,       // Stocker toutes les données de la réponse (sessions, total, page, limit)
            currentPage: 1,           // Page courante
            itemsPerPage: 20,         // Nombre d'éléments par page
            allSubCellStates: new Map()
        };

        // Éléments DOM
        this.elements = {
            sessionListUL: document.getElementById('session-list-ul'),
            totalSessionsDisplay: document.getElementById('total-sessions-display'),
            prevPageButton: document.getElementById('prev-page'),
            nextPageButton: document.getElementById('next-page'),
            pageInfoDisplay: document.getElementById('page-info'),
            playButton: document.getElementById('btn-play'),
            pauseButton: document.getElementById('btn-pause'),
            resetButton: document.getElementById('btn-reset'),
            progressBar: document.getElementById('progress-bar'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            speedSelect: document.getElementById('playback-speed'),
            gridContainer: document.getElementById('poietic-grid'),
            gridDisplay: document.getElementById('poietic-grid'),
            playerStartOverlay: document.getElementById('player-overlay'),
            overlayPlayButton: document.querySelector('#player-overlay #play-button'),
            overlaySelectSessionButton: document.getElementById('btn-select-session-overlay')
        };
        //console.log("[Player DEBUG] Constructor: playerStartOverlay element:", this.elements.playerStartOverlay);

        this.initializeGrid();
        this.bindEvents();
        this.lastTimestamp = null;
        this.animationFrameId = null;
        this.eventLoop = null;

        this.shareManager = new PlayerShareManager(this);

        // Appelle showOverlay après un court délai
        setTimeout(() => {
            //console.log("[Player DEBUG] Calling showOverlay via setTimeout from constructor");
            if (this.elements.playerStartOverlay) { // Vérifie avant d'appeler
                this.showOverlay();
            } else {
                //console.error("[Player DEBUG] playerStartOverlay is null IN setTimeout, cannot call showOverlay effectively.");
            }
        }, 100); 
    }

    initializeGrid() {
        const container = this.elements.gridContainer;
        
        // Créer un div pour la grille comme dans le viewer
        this.grid = document.createElement('div');
        this.grid.style.width = '100%';
        this.grid.style.height = '100%';
        this.grid.style.position = 'relative';
        this.grid.style.maxWidth = '100vmin';
        this.grid.style.maxHeight = '100vmin';
        
        if (container) container.appendChild(this.grid);
        this.updateGridSize();
    }

    createUserCell(userId) {
        //console.log(`[Player DEBUG] createUserCell for user: ${userId}`);
        const cell = document.createElement('div');
        cell.className = 'user-cell';
        
        const initialColorsPalette = this.state.userColors.get(userId);
        //console.log(`[Player DEBUG] Palette in createUserCell for ${userId}:`, initialColorsPalette ? initialColorsPalette.slice(0,5) : 'null/undefined');

        if (!initialColorsPalette) {
            //console.warn(`No initial colors palette found for user ${userId} in createUserCell - applying fallback`);
            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const subCell = document.createElement('div');
                    subCell.className = 'sub-cell';
                    subCell.dataset.x = x.toString();
                    subCell.dataset.y = y.toString();
                    subCell.style.backgroundColor = '#1a1a1a'; // Fallback un peu visible
                    cell.appendChild(subCell);
                }
            }
        } else {
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                const subCell = document.createElement('div');
                subCell.className = 'sub-cell';
                subCell.dataset.x = x.toString();
                subCell.dataset.y = y.toString();
                    subCell.style.backgroundColor = initialColorsPalette[y * 20 + x] || '#FFFFFF';
                cell.appendChild(subCell);
                }
            }
        }
        
        //console.log("[Player DEBUG] About to append cell. this.grid in document?", document.body.contains(this.grid));
        this.grid.appendChild(cell);
        //console.log(`[Player DEBUG] Cell for ${userId} appended. this.grid.childElementCount: ${this.grid.childElementCount}`);
        this.state.cells.set(userId, cell);
        return cell;
    }

    updateGridSize() {
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        this.cellSize = screenSize / this.state.gridSize;
        this.subCellSize = this.cellSize / 20;

        if (this.grid) {
        this.grid.style.width = `${screenSize}px`;
        this.grid.style.height = `${screenSize}px`;

        // Mettre à jour la position de toutes les cellules
        this.state.cells.forEach((cell, userId) => {
            const position = this.state.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
        }
    }

    positionCell(cell, x, y) {
        const offset = Math.floor(this.state.gridSize / 2);
        const pixelX = (x + offset) * this.cellSize;
        const pixelY = (y + offset) * this.cellSize;
        
        cell.style.left = `${pixelX}px`;
        cell.style.top = `${pixelY}px`;
        cell.style.width = `${this.cellSize}px`;
        cell.style.height = `${this.cellSize}px`;
    }

    bindEvents() {
        if(this.elements.playButton) this.elements.playButton.addEventListener('click', () => this.play());
        if(this.elements.pauseButton) this.elements.pauseButton.addEventListener('click', () => this.pause());
        if(this.elements.resetButton) this.elements.resetButton.addEventListener('click', () => this.reset());
        if(this.elements.progressBar) this.elements.progressBar.addEventListener('input', () => this.seekTo(this.elements.progressBar.value));
        if(this.elements.speedSelect) this.elements.speedSelect.addEventListener('change', () => this.updatePlaybackSpeed());

        if (this.elements.prevPageButton) {
            this.elements.prevPageButton.addEventListener('click', () => {
                if (this.state.currentPage > 1) {
                    this.loadSessions(this.state.currentPage - 1, this.state.itemsPerPage);
                }
            });
        }
        if (this.elements.nextPageButton) {
            this.elements.nextPageButton.addEventListener('click', () => {
                if (this.state.sessionsData && this.state.currentPage < Math.ceil(this.state.sessionsData.total_sessions / this.state.itemsPerPage)) {
                    this.loadSessions(this.state.currentPage + 1, this.state.itemsPerPage);
                }
            });
        }

        const changeSessionBtnPanel = document.getElementById('btn-change-session');
        if (changeSessionBtnPanel) {
            changeSessionBtnPanel.addEventListener('click', () => this.showSessionSelection());
        }

        if (this.elements.overlaySelectSessionButton) {
            this.elements.overlaySelectSessionButton.addEventListener('click', () => this.showSessionSelection());
        }
        
        if (this.elements.overlayPlayButton) {
            this.elements.overlayPlayButton.addEventListener('click', () => {
                if (this.state.currentSession) {
                    this.play(); 
                } else {
                    alert("Please select a session from the list first, or click 'REPLAY / SELECT'.");
                }
            });
        }
    }

    async loadSessions(page = 1, limit = 20) {
        //console.log(`[Player DEBUG] loadSessions called for page: ${page}, limit: ${limit}`);
        try {
            this.state.currentPage = page;
            this.state.itemsPerPage = limit;

            const response = await fetch(`/api/player/sessions?page=${page}&limit=${limit}`);
            //console.log("[Player DEBUG] loadSessions - fetch response status:", response.status);
            if (!response.ok) {
                //console.error("[Player DEBUG] loadSessions - Network response was not ok. Status:", response.status);
                const errorText = await response.text(); // Essayer de lire le corps de l'erreur
                //console.error("[Player DEBUG] loadSessions - Error body:", errorText);
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }
            const data = await response.json();
            //console.log("[Player DEBUG] loadSessions - data received:", data);
            
            this.state.sessionsData = data;
            const sessions = data.sessions;
            const totalSessions = data.total_sessions;

            if (this.elements.totalSessionsDisplay) {
                this.elements.totalSessionsDisplay.textContent = totalSessions;
            }

            const sessionListUL = this.elements.sessionListUL;
            if (!sessionListUL) {
                //console.error("[Player DEBUG] sessionListUL not found in loadSessions when trying to populate");
                return;
            }
            sessionListUL.innerHTML = '';

            if (sessions && sessions.length > 0) {
                //console.log(`[Player DEBUG] loadSessions - ${sessions.length} sessions to display.`);
                sessions.forEach(session => {
                    const listItem = document.createElement('li');
                const startTime = new Date(session.start_time);
                    const endTime = session.end_time ? new Date(session.end_time) : null;
                    const duration = endTime ? (endTime - startTime) : (Date.now() - startTime);
                
                const dateStr = startTime.toISOString().slice(0,10).replace(/-/g,'/');
                const timeStr = startTime.toTimeString().slice(0,8);
                const durationStr = new Date(duration).toISOString().slice(11,19);
                    const displayId = session.id.replace(/^session_/, '');

                    listItem.innerHTML = `<strong>Session:</strong> ${displayId} | <strong>Start:</strong> ${dateStr}-${timeStr} | <strong>Duration:</strong> ${durationStr} | <strong>Events:</strong> ${session.event_count} | <strong>Users:</strong> ${session.user_count}`;
                    
                    listItem.dataset.sessionId = session.id;
                    listItem.addEventListener('click', () => {
                        //console.log("[DEBUG Player] ListItem clicked, ID:", session.id);
                        this.showReplayMode(session.id); 
                        sessionListUL.querySelectorAll('li').forEach(li => li.classList.remove('selected'));
                        listItem.classList.add('selected');
                    });
                    sessionListUL.appendChild(listItem);
                });
                this.updatePaginationControls(totalSessions, page, limit);
            } else {
                //console.log("[Player DEBUG] loadSessions - No sessions found in data.");
                sessionListUL.innerHTML = '<li>No sessions found.</li>';
                this.updatePaginationControls(0, 1, limit);
            }
        } catch (error) {
            //console.error('[Player DEBUG] Catch block in loadSessions - Erreur lors du chargement des sessions:', error);
            if (this.elements.sessionListUL) this.elements.sessionListUL.innerHTML = '<li>Error loading sessions.</li>';
            this.updatePaginationControls(0, 1, this.state.itemsPerPage || 20);
        }
    }

    updatePaginationControls(totalItems, currentPage, itemsPerPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (this.elements.pageInfoDisplay) {
            this.elements.pageInfoDisplay.textContent = `Page ${currentPage} / ${totalPages || 1}`;
        }
        if (this.elements.prevPageButton) {
            this.elements.prevPageButton.disabled = currentPage <= 1;
        }
        if (this.elements.nextPageButton) {
            this.elements.nextPageButton.disabled = currentPage >= totalPages;
        }
    }

    loadSession(sessionId) {
        fetch(`/api/player/sessions/${sessionId}/events`)
            .then(response => response.json())
            .then(events => {
                this.state.events = events;
                this.state.currentEventIndex = 0;
                this.state.elapsedTime = 0;
                this.state.currentSession = sessionId;
                this.initializeFromEvents();
            });
    }

    initializeFromEvents() {
        this.clearGridAndState();
        const initialEvent = this.state.events.find(e => e.type === 'initial_state');
        //console.log("[Player DEBUG] initialEvent found:", JSON.stringify(initialEvent, null, 2));
        if (initialEvent) {
            this.applyInitialState(initialEvent);
        }
        
        const firstEvent = this.state.events[0];
        const lastEvent = this.state.events[this.state.events.length - 1];
        if (firstEvent && lastEvent) {
        this.state.sessionDuration = lastEvent.timestamp - firstEvent.timestamp;
        } else {
            this.state.sessionDuration = 0;
        }
        
        this.updateTimeDisplay();
    }

    clearGridAndState() {
        //console.log("[Player DEBUG] clearGridAndState called");
        if (this.grid) {
            //console.log(`[Player DEBUG] Before clear: ${this.grid.childElementCount} children in grid.`);
            this.grid.innerHTML = ''; // Vide le conteneur de la grille
            //console.log(`[Player DEBUG] After clear: ${this.grid.childElementCount} children in grid.`);
        } else {
            //console.warn("[Player DEBUG] Grid element not found in clearGridAndState");
        }
        this.state.cells.clear();
        this.state.userPositions.clear();
        //console.log("[Player DEBUG] Grid cleared and maps reset. Cells map size:", this.state.cells.size);
    }

    play() {
        if (!this.state.currentSession) return;
        if (this.elements.gridDisplay && this.elements.gridDisplay.style.display === 'none') {
            this.showReplayMode(this.state.currentSession);
        } else if (this.elements.playerStartOverlay && this.elements.playerStartOverlay.classList.contains('visible')) {
            if (this.elements.playerStartOverlay) this.elements.playerStartOverlay.classList.remove('visible');
            if (this.elements.gridDisplay) this.elements.gridDisplay.style.display = 'block';
        }

        if (this.state.currentEventIndex >= this.state.events.length && this.state.elapsedTime >= this.state.sessionDuration) {
            this.reset();
        }
        this.state.isPlaying = true;
        this.state.playStartTime = Date.now() - (this.state.elapsedTime / this.state.playbackSpeed);
        if(this.elements.playButton) this.elements.playButton.disabled = true;
        if(this.elements.pauseButton) this.elements.pauseButton.disabled = false;
        this.startTimeLoop();
        this.startEventLoop();
    }

    startTimeLoop() {
        if (this.timeLoop) cancelAnimationFrame(this.timeLoop);
        const updateTime = () => {
            if (!this.state.isPlaying) return;
            const now = Date.now();
            this.state.elapsedTime = (now - this.state.playStartTime) * this.state.playbackSpeed;
            if (this.state.elapsedTime >= this.state.sessionDuration) {
                //console.log(`[Player DEBUG] startTimeLoop: Time elapsed (elapsed: ${this.state.elapsedTime}, duration: ${this.state.sessionDuration}). Calling pause and showOverlay.`);
                this.pause();
                this.state.elapsedTime = this.state.sessionDuration;
                this.showOverlay();
            }
            this.updateTimeDisplay();
            this.updateProgressBar();
            this.timeLoop = requestAnimationFrame(updateTime);
        };
        this.timeLoop = requestAnimationFrame(updateTime);
    }

    startEventLoop() {
        if (this.eventLoop) clearInterval(this.eventLoop);
        let firstEventTime = this.state.events[0]?.timestamp || Date.now();

        this.eventLoop = setInterval(() => {
            if (!this.state.isPlaying) return;
            const sessionElapsed = this.state.elapsedTime;
            let eventsProcessedInCycle = 0;
            const maxEventsToProcess = Math.max(1, Math.ceil(this.state.playbackSpeed * 2));
            
            while (this.state.currentEventIndex < this.state.events.length && eventsProcessedInCycle < maxEventsToProcess) {
                const currentEvent = this.state.events[this.state.currentEventIndex];
                const eventTimeInSession = currentEvent.timestamp - firstEventTime;
                
                if (sessionElapsed >= eventTimeInSession) {
                    this.applyEvent(currentEvent);
                    this.state.currentEventIndex++;
                    eventsProcessedInCycle++;
                } else {
                    break;
                }
            }
            if (this.state.currentEventIndex >= this.state.events.length && this.state.elapsedTime >= this.state.sessionDuration) {
                //console.log(`[Player DEBUG] startEventLoop: All events played (idx: ${this.state.currentEventIndex}/${this.state.events.length}) AND time elapsed (elapsed: ${this.state.elapsedTime}, duration: ${this.state.sessionDuration}). Calling pause and showOverlay.`);
                this.pause();
                this.showOverlay();
            }
        }, 16);
    }

    applyEvent(event) {
        switch (event.type) {
            case 'initial_state': this.applyInitialState(event); break;
            case 'new_user': this.applyNewUser(event); break;
            case 'user_update': this.applyUserUpdate(event); break;
            case 'cell_update': this.applyCellUpdate(event); break;
            case 'user_left': this.applyUserLeft(event); break;
            case 'zoom_update': this.applyZoomUpdate(event); break;
            case 'session_end': this.pause(); break;
        }
    }

    pause() {
        this.state.isPlaying = false;
        if (this.eventLoop) clearInterval(this.eventLoop);
        if (this.timeLoop) cancelAnimationFrame(this.timeLoop);
        if(this.elements.playButton) this.elements.playButton.disabled = false;
        if(this.elements.pauseButton) this.elements.pauseButton.disabled = true;
    }

    reset() {
        this.pause();
        this.state.currentEventIndex = 0;
        this.state.elapsedTime = 0;
        this.clearGridAndState();
        const initialEvent = this.state.events.find(e => e.type === 'initial_state');
        if (initialEvent) this.applyInitialState(initialEvent);
        this.updateTimeDisplay();
        this.updateProgressBar(); 
        this.showOverlay();
    }

    updatePlaybackSpeed() {
        const oldSpeed = this.state.playbackSpeed;
        const newSpeed = parseFloat(this.elements.speedSelect.value);
        if (this.state.isPlaying) {
            this.state.playStartTime = Date.now() - (this.state.elapsedTime / newSpeed);
        }
        this.state.playbackSpeed = newSpeed;
    }

    updateProgressBar() {
        if (!this.elements.progressBar || this.state.sessionDuration === 0) return;
        const progress = (this.state.elapsedTime / this.state.sessionDuration) * 100;
        this.elements.progressBar.value = Math.min(Math.max(progress, 0), 100);
    }

    updateTimeDisplay() {
        const formatTime = (ms) => {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const remainingSeconds = totalSeconds % 60;
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        if(this.elements.currentTime) this.elements.currentTime.textContent = formatTime(this.state.elapsedTime);
        if(this.elements.totalTime) this.elements.totalTime.textContent = formatTime(this.state.sessionDuration);
    }

    clearGrid() {
        if (!this.ctx) return;
        //console.log('Effacement de la grille');
        
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const gridCells = 20;
        const cellSize = Math.floor(this.canvas.width / gridCells);
        
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i <= gridCells; i++) {
            const pos = i * cellSize;
            
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
    }

    redrawGrid() {
        // À implémenter : redessiner la grille complète
    }

    applyInitialState(initialEvent) {
        if (!this.grid) {
            //console.error("[Player DEBUG] Grid element not found at start of applyInitialState");
            return;
        }   
        //console.log("[Player DEBUG] applyInitialState called with event:", JSON.parse(JSON.stringify(initialEvent)));

        this.clearGridAndState(); // Nettoyage initial
        this.state.gridSize = initialEvent.grid_size || 1;
        //console.log(`[Player DEBUG] applyInitialState: gridSize set to ${this.state.gridSize}`);

        // Mettre à jour la taille de la grille et des cellules AVANT de positionner
        this.updateGridSize(); 

        if (initialEvent.user_positions) {
            const newUserPositions = new Map();
            Object.entries(initialEvent.user_positions).forEach(([uid, posArray]) => {
                if (Array.isArray(posArray) && posArray.length === 2) {
                    newUserPositions.set(uid, { x: posArray[0], y: posArray[1] });
                } else {
                    //console.warn(`[Player DEBUG] Invalid position format for user ${uid}:`, posArray);
                }
            });
            this.state.userPositions = newUserPositions;
            //console.log("[Player DEBUG] applyInitialState: userPositions processed:", this.state.userPositions);
        } else {
            this.state.userPositions.clear();
        }

        this.state.userPositions.forEach((_position, userId) => {
            if (!this.state.userColors.has(userId)) {
                const initialColorPalette = ColorGenerator.generateInitialColors(userId);
                this.state.userColors.set(userId, initialColorPalette);
            }
        });

        this.state.userPositions.forEach((position, userId) => {
            //console.log(`[Player DEBUG] applyInitialState: Loop for creating cell for user ${userId} with position:`, position, `at gridSize ${this.state.gridSize}`);
            this.createUserCell(userId);
        });

        //console.log("[Player DEBUG] applyInitialState: Repositioning cells...");
        this.state.cells.forEach((cell, userId) => {
            const userPos = this.state.userPositions.get(userId);
            if (userPos && cell) { 
                //console.log(`[Player DEBUG] Positioning cell for ${userId} with userPos:`, userPos, `(x: ${userPos.x}, y: ${userPos.y}) at grid_size ${this.state.gridSize}`);
                this.positionCell(cell, userPos.x, userPos.y);
            } else {
                //console.warn(`[Player DEBUG] Missing position or cell for user ${userId} during repositioning.`);
            }
        });

        if (initialEvent.sub_cell_states) {
            // console.log("[Player DEBUG] Updating allSubCellStates from initialEvent:", initialEvent.sub_cell_states);
            Object.entries(initialEvent.sub_cell_states).forEach(([userId, updates]) => {
                this.state.allSubCellStates.set(userId, updates);
            });
        }

        //console.log("[Player DEBUG] applyInitialState: Reapplying ALL stored sub_cell_states...");
        this.state.userPositions.forEach((position, userId) => {
            if (this.state.cells.has(userId)) {
                const userDrawingState = this.state.allSubCellStates.get(userId);
                if (userDrawingState) {
                    //console.log(`[Player DEBUG] Reapplying full drawing for user ${userId} in applyInitialState`);
                    this.applySubCellUpdates(userId, userDrawingState);
                }
            }
        });
    }

    updateSubCell(userId, x, y, color) {
        const cell = this.state.cells.get(userId);
        if (cell) {
            const subCell = cell.querySelector(`[data-x="${x}"][data-y="${y}"]`);
            if (subCell) subCell.style.backgroundColor = color;
        }

        if (!this.state.allSubCellStates.has(userId)) {
            this.state.allSubCellStates.set(userId, {});
        }
        const userStoredUpdates = this.state.allSubCellStates.get(userId);
        userStoredUpdates[`${x},${y}`] = color;
    }

    applySubCellUpdates(userId, updates) {
        //console.log(`[Player DEBUG] applySubCellUpdates for user ${userId} with updates:`, updates);
        if (!updates) return;
        Object.entries(updates).forEach(([coords, color]) => {
            const [xStr, yStr] = coords.split(',');
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);
            if (!isNaN(x) && !isNaN(y)) {
                this.updateSubCell(userId, x, y, color);
            }
        });
    }

    applyNewUser(event) {
        const initialColorsPalette = ColorGenerator.generateInitialColors(event.user_id);
        this.state.userColors.set(event.user_id, initialColorsPalette);
        this.state.userPositions.set(event.user_id, {x: event.position[0], y: event.position[1]});
        this.createUserCell(event.user_id);
        const cell = this.state.cells.get(event.user_id);
        if (cell) this.positionCell(cell, event.position[0], event.position[1]);

        if (this.overlay && this.state.cells.size > 0) {
            this.overlay.classList.remove('visible');
        }
        this.updateGridSize();
    }

    applyUserLeft(event) {
        const userId = event.user_id;
        const cell = this.state.cells.get(userId);
        if (cell && this.grid) this.grid.removeChild(cell);
            this.state.cells.delete(userId);
            this.state.userPositions.delete(userId);
            this.state.userColors.delete(userId);
        if (this.state.cells.size === 0 && this.overlay) {
            this.overlay.classList.add('visible');
        }
                this.updateGridSize();
    }

    applyZoomUpdate(event) {
        //console.log(`[Player DEBUG] applyZoomUpdate called with event:`, event);
        if (!this.grid) {
            //console.error("[Player DEBUG] Grid element not found in applyZoomUpdate");
            return;
        }

        this.state.gridSize = event.grid_size;
        console.log(`[Player DEBUG] applyZoomUpdate: gridSize updated to ${this.state.gridSize}`);

        // 1. Mettre à jour la taille de la grille et cellSize AVANT de faire quoi que ce soit d'autre
        // this.updateGridSize(); // Ce sera fait après le clearGridAndState

        // 2. Nettoyer l'état des couleurs et des positions pour reconstruire
        this.state.userColors.clear(); 
        this.clearGridAndState(); // S'assure que la grille est vide et les maps aussi
        // Redéfinir gridSize après clearGridAndState car la méthode d'origine de clearGridAndState (non montrée ici) pourrait la réinitialiser
        this.state.gridSize = event.grid_size; 
        this.updateGridSize(); // Recalculer cellSize avec la nouvelle gridSize après le clear

        if (event.grid_state) {
            const gridState = typeof event.grid_state === 'string' ? JSON.parse(event.grid_state) : event.grid_state;
            if (gridState.user_positions) {
                // Mettre à jour les positions connues
                this.state.userPositions = new Map(Object.entries(gridState.user_positions));
                //console.log(`[Player DEBUG] applyZoomUpdate: userPositions updated:`, this.state.userPositions);

                Object.entries(gridState.user_positions).forEach(([userId, positionArray]) => {
                    // Générer les couleurs initiales si elles n'existent pas
                    if (!this.state.userColors.has(userId)) {
                        const initialColorsPalette = ColorGenerator.generateInitialColors(userId);
                        this.state.userColors.set(userId, initialColorsPalette);
                    }
                    
                    // Créer la cellule (elle sera ajoutée à this.grid et this.state.cells)
                    let cell = this.createUserCell(userId);
                    // Positionner la cellule avec les nouvelles coordonnées et la nouvelle cellSize
                    if (cell) this.positionCell(cell, positionArray[0], positionArray[1]);
                });
            }
        }

        if (event.sub_cell_states) {
            //console.log("[Player DEBUG] Updating allSubCellStates from zoom event:", event.sub_cell_states);
            Object.entries(event.sub_cell_states).forEach(([userId, updates]) => {
                this.state.allSubCellStates.set(userId, updates);
            });
        }

        //console.log("[Player DEBUG] applyZoomUpdate: Reapplying ALL stored sub_cell_states...");
        this.state.userPositions.forEach((position, userId) => {
            if (this.state.cells.has(userId)) {
                const userDrawingState = this.state.allSubCellStates.get(userId);
                if (userDrawingState) {
                    console.log(`[Player DEBUG] Reapplying full drawing for user ${userId} in applyZoomUpdate`);
                    this.applySubCellUpdates(userId, userDrawingState);
                }
            }
        });

        //console.log("[Player DEBUG] applyZoomUpdate finished. Cells map size:", this.state.cells.size, "Grid children:", this.grid.childElementCount);
    }

    seekTo(percentage) {
        const targetTime = (percentage / 100) * this.state.sessionDuration;
        this.state.elapsedTime = targetTime;
        this.state.playStartTime = Date.now() - (targetTime / this.state.playbackSpeed);
        
        const firstEventTime = this.state.events[0].timestamp;
        const targetTimestamp = firstEventTime + targetTime;
        
        this.state.currentEventIndex = this.state.events.findIndex(e => 
            e.timestamp > targetTimestamp);
        
        if (this.state.currentEventIndex === -1) {
            this.state.currentEventIndex = this.state.events.length - 1;
        }
        
        this.updateTimeDisplay();
    }

    showOverlay() {
        //console.log("[Player DEBUG] showOverlay CALLED (Start/End Overlay)");
        
        if (this.elements.playerStartOverlay) {
            this.elements.playerStartOverlay.style.display = 'block'; // Rendre visible
            this.elements.playerStartOverlay.classList.add('visible'); // Pour la transition d'opacité CSS
            //console.log("[Player DEBUG] playerStartOverlay forced to display:block and class 'visible' added.");
        } else {
            //console.error("[Player DEBUG] CRITICAL: playerStartOverlay element NOT FOUND!");
        }

        // S'assurer de masquer les autres conteneurs principaux
        if (this.elements.sessionListUL) {
            this.elements.sessionListUL.classList.remove('visible');
            this.elements.sessionListUL.style.display = 'none';
        }
        if (this.elements.gridDisplay) {
            this.elements.gridDisplay.style.display = 'none';
        }
    }

    connect() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        
        //console.log('Tentative de connexion WebSocket:', `${wsProtocol}//${wsHost}/updates`);
        this.socket = new WebSocket(`${wsProtocol}//${wsHost}/updates`);
    }

    showSessionSelection() {
        //console.log("[Player DEBUG] showSessionSelection called");
        if (this.elements.playerStartOverlay) {
            this.elements.playerStartOverlay.classList.remove('visible');
            this.elements.playerStartOverlay.style.display = 'none'; // Explicitement cacher
            //console.log("[Player DEBUG] playerStartOverlay visibility removed and set to display:none.");
        }
        if (this.elements.sessionListUL) {
            this.elements.sessionListUL.classList.add('visible');
            this.elements.sessionListUL.style.display = 'block'; // Rendre visible
            //console.log("[Player DEBUG] sessionListUL set to display:block and class 'visible' added.");
        } else {
            //console.error("[Player DEBUG] sessionListUL NOT FOUND in showSessionSelection!");
        }
        if (this.elements.gridDisplay) {
            this.elements.gridDisplay.style.display = 'none';
            //console.log("[Player DEBUG] gridDisplay set to none.");
        }
        this.loadSessions(this.state.currentPage, this.state.itemsPerPage);
    }

    showReplayMode(sessionId) {
        //console.log(`[Player DEBUG] showReplayMode called for session: ${sessionId}`);
        if (this.elements.playerStartOverlay) {
            this.elements.playerStartOverlay.classList.remove('visible');
            this.elements.playerStartOverlay.style.display = 'none'; // Explicitement cacher
        }
        if (this.elements.sessionListUL) {
            this.elements.sessionListUL.classList.remove('visible');
            this.elements.sessionListUL.style.display = 'none'; // Explicitement cacher
        }
        if (this.elements.gridDisplay) {
            this.elements.gridDisplay.style.display = 'block';
            //console.log("[Player DEBUG] gridDisplay forced to display:block.");
        }
        this.loadSession(sessionId);
    }

    applyCellUpdate(message) {
        if (message.user_id && typeof message.sub_x === 'number' &&
            typeof message.sub_y === 'number' && message.color) {
            this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
            if (!this.state.allSubCellStates.has(message.user_id)) {
                this.state.allSubCellStates.set(message.user_id, {});
            }
            const userStoredUpdates = this.state.allSubCellStates.get(message.user_id);
            userStoredUpdates[`${message.sub_x},${message.sub_y}`] = message.color;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    //console.log("[Player DEBUG] DOMContentLoaded event fired. Attempting to create PoieticPlayer instance...");
    try {
        window.poieticPlayer = new PoieticPlayer();
        //console.log("[Player DEBUG] PoieticPlayer instance CREATED and assigned to window.");
    } catch (e) {
        //console.error("[Player DEBUG] ERROR during PoieticPlayer instantiation:", e, e.stack);
    }
});

//console.log("[Player DEBUG] poietic-player.js SCRIPT EXECUTION FINISHED");