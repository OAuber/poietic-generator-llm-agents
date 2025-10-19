// LLaVA Canvas Generator - Inspiré de poietic-share.js
// Génère 2 images du canvas global pour LLaVA :
// 1. Canvas pur (artistique, couleur)
// 2. Structure (noir & blanc, grilles + bordure épaisse)

export class LlavaCanvasGenerator {
    /**
     * Génère les images pour LLaVA
     * @param {Object} otherUsers - Map des users avec leurs pixels et positions
     * @param {string} myUserId - ID de l'utilisateur actif (pour highlight)
     * @param {Object} options - { includeStructure?: boolean }
     * @returns {Object} { pureCanvas: base64, structureCanvas?: base64 }
     */
    static generateGlobalCanvas(otherUsers, myUserId, options = {}) {
        const includeStructure = options.includeStructure === true;
        const pureCanvas = this.generatePureCanvas(otherUsers, myUserId);
        const result = { pureCanvas };
        if (includeStructure) {
            result.structureCanvas = this.generateStructureCanvas(otherUsers, myUserId);
        }
        return result;
    }
    
    /**
     * IMAGE 1 : Canvas pur (artistique, couleur, sans annotations)
     * @param {Object} otherUsers - Map des users avec leurs pixels et positions
     * @param {string} myUserId - ID de l'utilisateur actif
     * @returns {string} Base64 de l'image PNG
     */
    static generatePureCanvas(otherUsers, myUserId) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // DEBUG: Afficher le contenu de otherUsers
        console.log('[LLaVA Canvas] otherUsers:', Object.keys(otherUsers).length, 'agents');
        for (const [userId, userData] of Object.entries(otherUsers)) {
            const pixelCount = userData.pixels ? Object.keys(userData.pixels).length : 0;
            console.log(`  - ${userId.substring(0, 8)}: position ${JSON.stringify(userData.position)}, ${pixelCount} pixels`);
        }
        
        // Calculer les positions min/max pour déterminer la taille du canvas
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        
        for (const [userId, userData] of Object.entries(otherUsers)) {
            const pos = userData.position || [0, 0];
            minX = Math.min(minX, pos[0]);
            maxX = Math.max(maxX, pos[0]);
            minY = Math.min(minY, pos[1]);
            maxY = Math.max(maxY, pos[1]);
        }
        
        // Calculer la taille nécessaire (carré avec marge)
        const widthNeeded = maxX - minX + 1;
        const heightNeeded = maxY - minY + 1;
        const gridSideSize = Math.max(widthNeeded, heightNeeded) + 2; // +2 pour marge
        
        console.log(`[LLaVA Canvas] Positions: [${minX},${minY}] to [${maxX},${maxY}], taille: ${gridSideSize}×${gridSideSize}`);
        
        // Configuration OPTIMISÉE pour 600×600 max
        const PIXEL_SIZE = 5; // 5px par pixel (20×20 → 100×100 par grille)
        const GRID_PIXELS = 20;
        const cellSize = GRID_PIXELS * PIXEL_SIZE; // 100px par grille
        
        // Taille totale du canvas (max 600×600 pour 6×6 grilles)
        canvas.width = gridSideSize * cellSize;
        canvas.height = gridSideSize * cellSize;
        
        // Fond noir
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Marquer le centre du canvas global avec une croix (position [0,0])
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        ctx.strokeStyle = '#888888'; // Gris pour le centre
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - 10, centerY);
        ctx.lineTo(centerX + 10, centerY);
        ctx.moveTo(centerX, centerY - 10);
        ctx.lineTo(centerX, centerY + 10);
        ctx.stroke();
        
        // Ajouter un label "CENTER [0,0]"
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('CENTER [0,0]', centerX, centerY - 10);
        
        // Dessiner chaque grille avec annotations de position
        for (const [userId, userData] of Object.entries(otherUsers)) {
            const pos = userData.position || [0, 0];
            const pixels = userData.pixels || {};
            
            // Calculer la position de base dans le canvas (centré sur le canvas)
            const baseX = centerX + (pos[0] * cellSize) - (cellSize / 2);
            const baseY = centerY + (pos[1] * cellSize) - (cellSize / 2);
            
            // Ajouter une bordure colorée pour identifier chaque grille
            const isMyGrid = userId === myUserId;
            ctx.strokeStyle = isMyGrid ? '#888888' : '#333333'; // Gris pour ma grille, gris foncé pour les autres
            ctx.lineWidth = isMyGrid ? 3 : 1;
            ctx.strokeRect(baseX, baseY, cellSize, cellSize);
            
            // Pas d'annotations textuelles pour éviter la confusion
            
            // Dessiner les pixels de cette grille
            for (const [coordKey, color] of Object.entries(pixels)) {
                const [x, y] = coordKey.split(',').map(Number);
                
                if (x >= 0 && x < GRID_PIXELS && y >= 0 && y < GRID_PIXELS) {
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        baseX + (x * PIXEL_SIZE),
                        baseY + (y * PIXEL_SIZE),
                        PIXEL_SIZE,
                        PIXEL_SIZE
                    );
                }
            }
        }
        
        // Convertir en base64
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        
        console.log(`[LLaVA Canvas PURE] Généré canvas ${canvas.width}×${canvas.height} avec ${Object.keys(otherUsers).length} grilles`);
        
        return base64;
    }
    
    /**
     * IMAGE 2 : Structure (noir & blanc, grilles + bordure épaisse)
     * @param {Object} otherUsers - Map des users avec leurs pixels et positions
     * @param {string} myUserId - ID de l'utilisateur actif
     * @returns {string} Base64 de l'image PNG
     */
    static generateStructureCanvas(otherUsers, myUserId) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculer les positions min/max (même logique que pureCanvas)
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        
        for (const [userId, userData] of Object.entries(otherUsers)) {
            const pos = userData.position || [0, 0];
            minX = Math.min(minX, pos[0]);
            maxX = Math.max(maxX, pos[0]);
            minY = Math.min(minY, pos[1]);
            maxY = Math.max(maxY, pos[1]);
        }
        
        const widthNeeded = maxX - minX + 1;
        const heightNeeded = maxY - minY + 1;
        const gridSideSize = Math.max(widthNeeded, heightNeeded) + 2;
        
        const PIXEL_SIZE = 5;
        const GRID_PIXELS = 20;
        const cellSize = GRID_PIXELS * PIXEL_SIZE;
        
        canvas.width = gridSideSize * cellSize;
        canvas.height = gridSideSize * cellSize;
        
        // Fond NOIR
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Dessiner les grilles en BLANC (ou gris clair)
        for (const [userId, userData] of Object.entries(otherUsers)) {
            const pos = userData.position || [0, 0];
            const pixels = userData.pixels || {};
            
            const baseX = (pos[0] + Math.floor(gridSideSize / 2)) * cellSize;
            const baseY = (pos[1] + Math.floor(gridSideSize / 2)) * cellSize;
            
            // Dessiner les pixels en blanc (si la grille a des pixels)
            const hasPixels = Object.keys(pixels).length > 0;
            if (hasPixels) {
                ctx.fillStyle = '#FFFFFF'; // Blanc
                ctx.fillRect(baseX, baseY, cellSize, cellSize);
            }
            
            // Séparation fine entre grilles (1px gris)
            ctx.strokeStyle = '#444444'; // Gris foncé
            ctx.lineWidth = 1;
            ctx.strokeRect(baseX, baseY, cellSize, cellSize);
            
            // BORDURE ÉPAISSE pour l'agent actif
            if (userId === myUserId) {
                ctx.strokeStyle = '#FFFFFF'; // Blanc
                ctx.lineWidth = 6; // Épaisse
                ctx.strokeRect(
                    baseX + 3,
                    baseY + 3,
                    cellSize - 6,
                    cellSize - 6
                );
                
                console.log(`[LLaVA Canvas STRUCTURE] Bordure épaisse pour user ${userId} à (${pos[0]}, ${pos[1]})`);
            }
        }
        
        // Convertir en base64
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        
        console.log(`[LLaVA Canvas STRUCTURE] Généré canvas N&B ${canvas.width}×${canvas.height}`);
        
        return base64;
    }
}

