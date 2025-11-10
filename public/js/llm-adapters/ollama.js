// Ollama Adapter - VERSION MINIMALISTE (Reconstruction autonome)
import { SpatialAnalysis } from '../spatial-analysis.js';

const OllamaAdapter = {
    name: 'Ollama Llama3.2 3B',
    model: 'llama3.2:3b',
    maxTokens: 1000,
    
    config: {
        model: 'llama3.2:3b',
        max_tokens: 1000
    },
    
    // Manuel compact chargé au démarrage
    manualContent: null,
    
    // Charger le manuel compact
    loadManual: async () => {
        if (OllamaAdapter.manualContent) return OllamaAdapter.manualContent;
        
        try {
            const response = await fetch('/MANUEL_OLLAMA_COMPACT.md');
            if (!response.ok) throw new Error('Manuel non trouvé');
            OllamaAdapter.manualContent = await response.text();
            console.log('📖 [Ollama] Manuel compact chargé');
            return OllamaAdapter.manualContent;
        } catch (error) {
            console.error('❌ [Ollama] Erreur chargement manuel:', error);
            OllamaAdapter.manualContent = ''; // Fallback vide
            return '';
        }
    },
    
    // ============================================
    // CONVERSION DE COULEURS (RVB9 ↔ HEX)
    // ============================================
    
    // Convertir #RRGGBB → RVB (ex: #3498DB → 349)
    hexToRGB9: (hex) => {
        if (!hex || hex.length !== 7) return '000';
        const r = Math.round(parseInt(hex.substr(1, 2), 16) / 255 * 9);
        const g = Math.round(parseInt(hex.substr(3, 2), 16) / 255 * 9);
        const b = Math.round(parseInt(hex.substr(5, 2), 16) / 255 * 9);
        return `${r}${g}${b}`;
    },
    
    // Convertir RVB → #RRGGBB (ex: 349 → #3399DD)
    rgb9ToHex: (rgb9) => {
        if (!rgb9 || rgb9.length !== 3) return '#000000';
        const r = Math.round(parseInt(rgb9[0]) / 9 * 255).toString(16).padStart(2, '0');
        const g = Math.round(parseInt(rgb9[1]) / 9 * 255).toString(16).padStart(2, '0');
        const b = Math.round(parseInt(rgb9[2]) / 9 * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
    },
    
    // Convertir une grille 20×20 en format RVB9 tableau compact (pour debug/vérification)
    gridToRGB9Table: (grid) => {
        if (!grid || grid.length !== 20 || grid[0].length !== 20) {
            return Array(20).fill(null).map(() => 
                Array(20).fill('000').join(' ')
            ).join('\n');
        }
        
        const lines = [];
        for (let y = 0; y < 20; y++) {
            const row = [];
            for (let x = 0; x < 20; x++) {
                const hex = grid[y][x] || '#000000';
                row.push(OllamaAdapter.hexToRGB9(hex));
            }
            lines.push(row.join(' '));
        }
        return lines.join('\n');
    },
    
    // ============================================
    // HISTORIQUE DES VOISINS (Reconstruction mentale)
    // ============================================
    
    // Construire l'historique d'updates groupé par itération pour un voisin
    // Analyser les pixels du voisin proches de la frontière commune
    analyzeBorderProximity: (direction, neighborData) => {
        if (!neighborData || !neighborData.recent_updates || neighborData.recent_updates.length === 0) {
            return null;
        }
        
        // Définir quelle bordure observer selon la direction
        // Pour le voisin, on regarde la bordure OPPOSÉE à notre position
        let borderCondition;
        switch(direction) {
            case 'TOP':    // Voisin au-dessus → regarder son bord BAS (y proche de 19)
                borderCondition = (pixel) => pixel.y >= 17;
                break;
            case 'BOTTOM': // Voisin en-dessous → regarder son bord HAUT (y proche de 0)
                borderCondition = (pixel) => pixel.y <= 2;
                break;
            case 'LEFT':   // Voisin à gauche → regarder son bord DROIT (x proche de 19)
                borderCondition = (pixel) => pixel.x >= 17;
                break;
            case 'RIGHT':  // Voisin à droite → regarder son bord GAUCHE (x proche de 0)
                borderCondition = (pixel) => pixel.x <= 2;
                break;
            default:
                return null;
        }
        
        // Filtrer les pixels récents près de la frontière
        const borderPixels = neighborData.recent_updates
            .filter(borderCondition)
            .slice(-5); // Max 5 pixels les plus récents
        
        if (borderPixels.length === 0) {
            return null;
        }
        
        // Extraire les couleurs uniques
        const colors = [...new Set(borderPixels.map(p => OllamaAdapter.hexToRGB9(p.color)))];
        const colorList = colors.slice(0, 3).join(', '); // Max 3 couleurs
        
        return `  → Near border: ${borderPixels.length} pixel${borderPixels.length > 1 ? 's' : ''} (colors: ${colorList})\n`;
    },
    
    buildNeighborHistory: (neighbor, maxIterations = 10) => {
        if (!neighbor || !neighbor.recent_updates || neighbor.recent_updates.length === 0) {
            return null;
        }
        
        const updates = neighbor.recent_updates;
        
        // Si les updates ont un champ `iteration`, l'utiliser, sinon déduire du timestamp
        const hasIterationField = updates.some(u => u.iteration !== undefined && u.iteration !== 0);
        
        if (hasIterationField) {
            // Grouper par iteration explicite
            const updatesByIter = {};
            for (const u of updates) {
                const iter = u.iteration || 0;
                if (!updatesByIter[iter]) updatesByIter[iter] = [];
                updatesByIter[iter].push(u);
            }
            
            // Garder les N dernières itérations
            const iterations = Object.keys(updatesByIter)
                .map(k => parseInt(k))
                .sort((a, b) => a - b)
                .slice(-maxIterations);
            
            // Formater (format différent pour éviter la copie: [x,y]=RVB au lieu de x,y:RVB)
            // Limité à 10 pixels max par itération pour économiser tokens
            const lines = [];
            for (const iter of iterations) {
                const batch = updatesByIter[iter].slice(0, 10);
                const pixelsStr = batch.map(u => `${u.x},${u.y}:${OllamaAdapter.hexToRGB9(u.color)}`).join(' ');
                const suffix = updatesByIter[iter].length > 10 ? ` (+${updatesByIter[iter].length - 10} more)` : '';
                lines.push(`  Iter${iter}: ${pixelsStr}${suffix}`);
            }
            return lines.join('\n');
            
        } else {
            // Déduire les itérations du timestamp (groupe par intervalles de ~30s)
            const sorted = [...updates].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const batches = [];
            let currentBatch = [];
            let lastTime = sorted[0]?.timestamp || 0;
            
            for (const u of sorted) {
                const uTime = u.timestamp || 0;
                // Nouvelle batch si écart > 25 secondes (une itération ~ 20-30s)
                if (uTime - lastTime > 25000 && currentBatch.length > 0) {
                    batches.push(currentBatch);
                    currentBatch = [];
                }
                currentBatch.push(u);
                lastTime = uTime;
            }
            if (currentBatch.length > 0) {
                batches.push(currentBatch);
            }
            
            // Garder les N dernières batches
            const recentBatches = batches.slice(-maxIterations);
            
            // Formater en format standard x,y:RVB (même format que la sortie attendue)
            // Limité à 10 pixels max par itération pour économiser tokens
            const lines = [];
            for (let i = 0; i < recentBatches.length; i++) {
                const batch = recentBatches[i].slice(0, 10);
                const pixelsStr = batch.map(u => `${u.x},${u.y}:${OllamaAdapter.hexToRGB9(u.color)}`).join(' ');
                const suffix = recentBatches[i].length > 10 ? ` (+${recentBatches[i].length - 10} more)` : '';
                lines.push(`  Iter${i}: ${pixelsStr}${suffix}`);
            }
            return lines.join('\n');
        }
    },
    
    // ============================================
    // CONSTRUCTION DU PROMPT (Manuel permanent)
    // ============================================
    
    // Prompt principal avec manuel compact permanent
    buildSystemPrompt: async (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition) => {
        const spatialNeighbors = analysis?.spatialNeighbors || {};
        
        // Charger le manuel compact (toujours présent, pas juste à la 1ère requête)
        const manual = await OllamaAdapter.loadManual();
        console.log(`📖 [Ollama] Manuel chargé: ${manual.length} chars (${Math.ceil(manual.length/4)} tokens approx)`);
        
        // Prompt personnalisé de l'utilisateur
        const userCustomPrompt = customPrompt && customPrompt.trim().length > 0 
            ? `\nUSER INSTRUCTION: ${customPrompt}\n` 
            : '';
        
        if (userCustomPrompt) {
            console.log(`👤 [User Prompt] "${customPrompt}"`);
        }
        
        // Rappel de la stratégie précédente (continuité temporelle)
        const lastStrategyReminder = myLastStrategy && iterationCount > 1
            ? `Previous: "${myLastStrategy}". You can continue it, change it, or start something completely new.\n`
            : '';
        
        if (myLastStrategy && iterationCount > 1) {
            console.log(`🔁 [Continuité] Rappel stratégie précédente: "${myLastStrategy}"`);
        }
        
        // ============================================
        // FEEDBACK VISUEL : Mes propres pixels précédents
        // ============================================
        
        let myOwnGridSection = '';
        if (myRecentUpdates && myRecentUpdates.length > 0 && iterationCount > 1) {
            // Prendre les 50 derniers pixels (environ 2-3 dernières itérations)
            const lastPixels = myRecentUpdates.slice(-50).map(u => 
                `${u.x},${u.y}:${OllamaAdapter.hexToRGB9(u.color)}`
            ).join(' ');
            
            myOwnGridSection = `
YOUR PREVIOUS DRAWING (last ${Math.min(50, myRecentUpdates.length)} pixels you drew):
${lastPixels}

→ Continue this drawing, refine it, or complete it! Don't start from scratch.
`;
            console.log(`🎨 [Own Grid] Showing ${Math.min(50, myRecentUpdates.length)} own pixels for continuity`);
        }
        
        // ============================================
        // SECTION VOISINS (Reconstruction mentale)
        // ============================================
        
        let voisinsSection = '';
        const voisinsList = Object.keys(spatialNeighbors).filter(dir => 
            spatialNeighbors[dir] && spatialNeighbors[dir].pixel_count > 0
        );
        
        if (voisinsList.length > 0) {
            console.log(`[Neighbors] ${voisinsList.length} neighbor(s) detected:`, voisinsList.join(', '));
            
            voisinsSection = '\nYOUR NEIGHBORS ARE DRAWING! Watch what they create, dance with them at the borders!\n';
            
            // Prendre les 2 voisins les plus actifs SEULEMENT (économie tokens)
            const sortedNeighbors = voisinsList
                .map(dir => ({
                    dir,
                    data: spatialNeighbors[dir],
                    updateCount: spatialNeighbors[dir].recent_updates?.length || 0
                }))
                .sort((a, b) => b.updateCount - a.updateCount)
                .slice(0, 2); // Max 2 voisins (au lieu de 4)
            
            for (const { dir, data } of sortedNeighbors) {
                // Stratégie du voisin en premier
                const strategyInfo = data.last_strategy ? ` "${data.last_strategy}"` : '';
                voisinsSection += `\n${dir}${strategyInfo}:`;
                
                // Historique COURT : 2 dernières itérations, 10 pixels max par itération
                const history = OllamaAdapter.buildNeighborHistory(data, 2);
                if (history) {
                    voisinsSection += history + '\n';
                } else {
                    voisinsSection += '  (no updates)\n';
                }
                
                // Analyser les pixels PROCHES de la frontière commune
                const borderPixels = OllamaAdapter.analyzeBorderProximity(dir, data);
                if (borderPixels) {
                    voisinsSection += borderPixels;
                }
            }
        } else {
            console.log('🚫 [Neighbors] No neighbors detected');
        }
        
        // ============================================
        // PROMPT FINAL
        // ============================================
        
        // Instruction sur l'interaction aux frontières (si voisins détectés)
        const borderInteraction = voisinsList.length > 0 ? `
BORDER COLLABORATION:
If your neighbors are drawing near your shared border, notice their colors and patterns.
You can respond by:
- Drawing on YOUR side of the border with matching/complementary colors
- Creating a visual dialogue (e.g., they draw red near border → you answer with orange/yellow)
- Extending their pattern into your grid, or contrasting it
- Your borders: TOP y=0, BOTTOM y=19, LEFT x=0, RIGHT x=19
` : '';
        
        // Rappel d'exemple minimal (sauf 1ère requête qui a déjà l'exemple complet)
        const minimalExample = !isFirstRequest ? `
TECHNICAL NOTES: 
- Draw 50 pixels (each coordinate ONCE only)
- Coordinates 0-19 (NOT 20!)
- You can get inspired by neighbors, adapt their style, or do something completely different
` : '';
        
        // ============================================
        // SÉPARATION SYSTÈME / UTILISATEUR
        // ============================================
        
        // MESSAGE SYSTÈME : Instructions ULTRA-COMPACTES (pour économiser les tokens)
        const systemMessage = `You are a pixel artist on a 20×20 grid (coordinates 0-19).

${manual}

RESPONSE FORMAT (MANDATORY):
my idea: [brief vision]
pixels: x,y:RVB x,y:RVB x,y:RVB ... (50 pixels minimum, RVB = 3 digits 0-9)

Example: my idea: blue circle
pixels: 8,8:003 9,8:003 10,8:003 8,9:003 10,9:003 [... 45 more pixels]`;
        
        // MESSAGE UTILISATEUR : Contexte spécifique (ULTRA-COMPACT aussi)
        const userMessage = `${userCustomPrompt}${lastStrategyReminder}${myOwnGridSection}${voisinsSection}${borderInteraction}

YOUR TURN:
my idea:`;
        
        // DEBUG: Afficher les deux parties du prompt
        console.log(`[DEBUG] System prompt: ${systemMessage.length} chars (${Math.ceil(systemMessage.length/4)} tokens)`);
        console.log(`[DEBUG] User prompt: ${userMessage.length} chars (${Math.ceil(userMessage.length/4)} tokens)`);
        console.log(`[DEBUG] Total: ${systemMessage.length + userMessage.length} chars`);
        
        // Afficher un extrait du manuel pour vérifier son contenu
        if (manual) {
            const manualPreview = manual.substring(0, 200).replace(/\n/g, ' ');
            console.log(`[DEBUG] Manuel dans system (extrait): "${manualPreview}..."`);
        }
        
        // Afficher la structure du prompt
        console.log('[DEBUG] Structure:', {
            system: {
                manuel: manual.length + ' chars',
                formatInstructions: 'oui'
            },
            user: {
                customPrompt: userCustomPrompt.length > 0 ? 'oui' : 'non',
                lastStrategy: !!lastStrategyReminder,
                myOwnGrid: myOwnGridSection.length > 0 ? 'oui' : 'non',
                neighbors: voisinsList.length,
                borderInteraction: borderInteraction.length > 0 ? 'oui' : 'non'
            }
        });
        
        // Retourner les deux parties séparément
        return { systemMessage, userMessage };
    },
    
    // ============================================
    // PARSING DES RÉPONSES
    // ============================================
    
    parseResponse: (responseText) => {
        // Vérifier que responseText est valide
        if (!responseText || typeof responseText !== 'string') {
            console.error('[Ollama] Réponse invalide ou vide:', responseText);
            return OllamaAdapter.generateDefaultPixels();
        }
        
        console.log('[Ollama] Réponse brute (100 premiers chars):', responseText.substring(0, 100));
        
        // Priorité 1: Format compact (my idea: ... \n pixels: ...)
        if (responseText.includes('my idea:') || responseText.includes('strategy:') || responseText.includes('pixels:')) {
            console.log('[Ollama] Format compact détecté');
            const result = OllamaAdapter.parseCompactFormat(responseText);
            if (result) return result;
        }
        
        // Priorité 2: Essayer le format compact sans labels clairs
        console.log('[Ollama] Format indéterminé, essai format compact');
        const compactResult = OllamaAdapter.parseCompactFormat(responseText);
        if (compactResult) return compactResult;
        
        // Priorité 3: Essayer JSON (rétrocompatibilité)
        console.log('[Ollama] Essai final: JSON');
        const jsonResult = OllamaAdapter.parseJSONFormat(responseText);
        if (jsonResult) return jsonResult;
        
        // Fallback: Générer des pixels par défaut
        console.log('[Ollama] Tous les parsers ont échoué, génération par défaut');
        return OllamaAdapter.generateDefaultPixels();
    },
    
    parseCompactFormat: (text) => {
        try {
            // Nettoyer le texte (enlever markdown, etc.)
            let cleanText = text
                .replace(/```[a-z]*\n?/g, '')
                .replace(/\*\*/g, '')
                .trim();
            
            // Extraire la stratégie (première ligne, max 200 chars)
            let strategy = 'dessin';
            const strategyMatch = cleanText.match(/(?:my idea|strategy):\s*(.+?)(?:\n|pixels:|$)/i);
            if (strategyMatch) {
                strategy = strategyMatch[1].trim().substring(0, 200);
            } else {
                // Prendre la première ligne si pas de "my idea:" ou "strategy:"
                const firstLine = cleanText.split('\n')[0];
                if (firstLine && firstLine.length < 200 && !firstLine.includes(':')) {
                    strategy = firstLine.trim();
                }
            }
            
            // Détecter les patterns de refus/bavardage
            const refusPatterns = [
                /puis-je/i, /je ne peux pas/i, /je suis prêt/i, /indiquez-moi/i,
                /s'il vous plaît/i, /pour commencer/i, /comment puis-je/i
            ];
            const isRefus = refusPatterns.some(pattern => pattern.test(strategy));
            
            // Logs de collaboration/continuité
            const optionMatch = strategy.match(/\[(\d+)\]/);
            const collabKeywords = ['miroir', 'translation', 'rotation', 'prolonge', 'symétrie', 'complète', 'bordure', 'continue'];
            const hasCollabKeyword = collabKeywords.some(kw => strategy.toLowerCase().includes(kw));
            const isContinuing = /continu/i.test(strategy) || /suite/i.test(strategy) || /poursui/i.test(strategy);
            
            if (optionMatch) {
                console.log(`✅ [Collaboration] Agent a choisi l'option [${optionMatch[1]}]: ${strategy}`);
            } else if (hasCollabKeyword) {
                console.log(`🎯 [Collaboration] Agent mentionne une transformation: ${strategy}`);
            } else if (isContinuing) {
                console.log(`🔁 [Continuité] Agent continue sa stratégie: ${strategy.substring(0, 60)}`);
            } else {
                console.log(`🎨 [Stratégie] Nouveau dessin: ${strategy.substring(0, 60)}`);
            }
            
            // Extraire les pixels
            let pixelsStr = '';
            const pixelsMatch = cleanText.match(/pixels:\s*(.+)/is);
            if (pixelsMatch) {
                pixelsStr = pixelsMatch[1];
            } else {
                // Pas de "pixels:" trouvé, chercher directement des patterns x,y:color
                console.warn('[Ollama] Pas de "pixels:" trouvé, recherche directe de patterns');
                pixelsStr = cleanText;
            }
            
            // Parser chaque pixel: "x,y:RVB" OU "x,y:#RRGGBB"
            // Pattern tolérant : accepte 1-3 chiffres pour RVB
            const pixelPattern = /(\d+)\s*,\s*(\d+)\s*:\s*([0-9]{1,3}|#[0-9A-Fa-f]{6})/g;
            const pixels = [];
            const seenCoords = new Set(); // Dédoublonner les coordonnées (garder la 1ère occurrence)
            let duplicateCount = 0;
            let match;
            
            while ((match = pixelPattern.exec(pixelsStr)) !== null) {
                const x = parseInt(match[1]);
                const y = parseInt(match[2]);
                let color = match[3];
                
                // Valider les coordonnées (0-19)
                if (x < 0 || x >= 20 || y < 0 || y >= 20) {
                    console.warn(`[Ollama] Pixel ignoré (hors grille): ${x},${y}`);
                    continue;
                }
                
                // Dédoublonner : ignorer les pixels déjà vus
                const key = `${x},${y}`;
                if (seenCoords.has(key)) {
                    duplicateCount++;
                    continue; // Ignorer silencieusement les doublons
                }
                seenCoords.add(key);
                
                // Si format RVB9 (1-3 chiffres), normaliser et convertir en hex
                if (/^\d{1,3}$/.test(color)) {
                    // Normaliser: 1 chiffre → 3 chiffres (8 → 888, 9 → 999)
                    if (color.length === 1) {
                        color = color.repeat(3); // 8 → 888
                    } else if (color.length === 2) {
                        color = color[0] + color[1] + color[0]; // 12 → 121
                    }
                    // Convertir en hex
                    color = OllamaAdapter.rgb9ToHex(color);
                    console.log(`✅ [RVB9] ${match[3]} → ${color}`);
                } else if (color.startsWith('#')) {
                    color = color.toUpperCase();
                    console.warn(`⚠️ [Format] LLM a utilisé #hex au lieu de RVB9: ${color} (accepté pour rétrocompatibilité)`);
                }
                
                pixels.push({ x, y, color });
            }
            
            // Si refus ou aucun pixel, retourner null pour fallback
            if (isRefus || pixels.length === 0) {
                console.warn('[Ollama] Aucun pixel trouvé, retour null pour fallback');
                console.warn('[Ollama] Texte analysé:', cleanText.substring(0, 500));
                return null;
            }
            
            // Log si beaucoup de doublons détectés (signe que le LLM répète)
            if (duplicateCount > 10) {
                console.warn(`⚠️ [Doublons] ${duplicateCount} pixels dupliqués ignorés (LLM répète trop)`);
            }
            
            console.log(`[Ollama] Format compact parsé: ${pixels.length} pixels${duplicateCount > 0 ? ` (${duplicateCount} doublons filtrés)` : ''}, stratégie: "${strategy}"`);
            return { strategy, pixels };
            
        } catch (error) {
            console.error('[Ollama] Erreur parsing format compact:', error);
            return null;
        }
    },
    
    parseJSONFormat: (text) => {
        try {
            // Chercher le JSON (entre { et })
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            
            if (jsonStart === -1 || jsonEnd === -1) {
                return null;
            }
            
            const jsonStr = text.substring(jsonStart, jsonEnd + 1);
            const data = JSON.parse(jsonStr);
            
            if (!data.pixels || !Array.isArray(data.pixels)) {
                return null;
            }
            
            const strategy = data.strategy || data.description || 'dessin';
            const pixels = data.pixels
                .filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20)
                .map(p => ({
                    x: p.x,
                    y: p.y,
                    color: p.color.toUpperCase()
                }));
            
            console.log(`[Ollama] Format JSON parsé: ${pixels.length} pixels`);
            return { strategy, pixels };
            
        } catch (error) {
            console.error('Erreur de parsing JSON:', error);
            console.error('JSON reçu (premiers 1000 chars):', text.substring(0, 1000));
            console.error('JSON reçu (derniers 1000 chars):', text.substring(Math.max(0, text.length - 1000)));
            console.error('Longueur totale:', text.length);
            
            const lines = text.split('\n');
            console.error('Nombre de lignes:', lines.length);
            
            return null;
        }
    },
    
    // Générer des pixels par défaut en cas d'échec total
    generateDefaultPixels: () => {
        console.warn('[Ollama] ⚠️ Fallback: 1 pixel noir (influence minimale)');
        
        // 1 seul pixel noir à position aléatoire - influence minimale
        const x = Math.floor(Math.random() * 20);
        const y = Math.floor(Math.random() * 20);
        
        return {
            strategy: 'silence',
            pixels: [{ x, y, color: '#000000' }]
        };
    },
    
    // ============================================
    // API CALL
    // ============================================
    
    callAPI: async (apiKey, systemPrompt, userPrompt) => {
        try {
            // Si on reçoit un seul argument (ancien format), le traiter comme userPrompt
            if (userPrompt === undefined) {
                userPrompt = systemPrompt;
                systemPrompt = '';
            }
            
            // Log du prompt envoyé (extrait pour vérification)
            console.log('[Ollama] Envoi prompt au serveur Python:', {
                system: systemPrompt.length + ' chars',
                user: userPrompt.length + ' chars',
                total: (systemPrompt.length + userPrompt.length) + ' chars'
            });
            
            const response = await fetch('http://localhost:8003/api/llm/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OllamaAdapter.model,
                    system_prompt: systemPrompt,  // NOUVEAU: message système séparé
                    messages: [{ role: 'user', content: userPrompt }],
                    max_tokens: 450,  // Assez pour strategy + 50 pixels (~420 tokens) avec marge
                    temperature: 0.8, // Créativité modérée
                    stream: false
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
            }
            
            const data = await response.json();
            console.log('[Ollama] Réponse serveur Python:', data);
            
            const result = data.response || data.message || '';
            if (!result) {
                console.error('[Ollama] Aucun texte dans la réponse:', data);
            }
            
            // Format compatible avec ai-player.js (qui attend {content, usage})
            return {
                content: result,
                usage: {
                    input_tokens: 0,  // Ollama ne fournit pas ces stats via l'API
                    output_tokens: 0
                }
            };
            
        } catch (error) {
            console.error('[Ollama] Erreur API:', error);
            throw error;
        }
    }
};

export { OllamaAdapter };

