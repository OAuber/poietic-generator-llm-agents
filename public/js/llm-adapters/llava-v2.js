// LLaVA V2 Adapter - Format Grid/Table au lieu de liste de pixels
import { SpatialAnalysis } from '../spatial-analysis.js';

const LlavaV2Adapter = {
    name: 'LLaVA V2 (Grid Format)',
    model: 'llava:7b',
    maxTokens: 4000,
    
    config: {
        model: 'llava:7b',
        max_tokens: 4000
    },
    
    promptsContent: null,
    
    // Charger les prompts V2
    loadPrompts: async () => {
        if (LlavaV2Adapter.promptsContent) return LlavaV2Adapter.promptsContent;
        try {
            // Cache busting: ajouter timestamp pour forcer rechargement
            const response = await fetch('/llava-prompts-v2.json?v=20250123-44');
            if (!response.ok) throw new Error('Prompts V2 non trouvés');
            LlavaV2Adapter.promptsContent = await response.json();
            console.log('🧾 [LLaVA V2] Prompts chargés (v44 - Explicit single # format)');
            return LlavaV2Adapter.promptsContent;
        } catch (error) {
            console.warn('⚠️ [LLaVA V2] Impossible de charger les prompts V2:', error);
            return null;
        }
    },
    
    buildSystemPrompt: async (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition, randomColors = null, localDescription = '', globalDescription = '') => {
        // console.log('🔧 [LLaVA V2] Construction du prompt système...');
        
        const externalPrompts = await LlavaV2Adapter.loadPrompts();
        
        let fullPrompt = '';
        let needsImage = false;
        let useGlobalCanvas = false;
        
        const normalize = (prompt) => Array.isArray(prompt) ? prompt.join('\n') : (prompt || '');
        
        if (iterationCount <= 1) {
            // Seed system
            if (externalPrompts && externalPrompts.seed_system) {
                fullPrompt = normalize(externalPrompts.seed_system);
                
                // Remplacer {{colorPalette}} avec les données de la grille initiale
                fullPrompt = fullPrompt.replaceAll('{{colorPalette}}', analysis.colorPalette || 'No grid data');
                
                // Remplacer les placeholders de couleurs aléatoires
                if (randomColors && randomColors.length >= 12) {
                    for (let i = 0; i < 12; i++) {
                        fullPrompt = fullPrompt.replaceAll(`{{color${i + 1}}}`, randomColors[i]);
                    }
                }
                
                // console.log('🧾 [LLaVA V2] Prompt seed_system chargé');
                needsImage = true; // Pour voir l'image de la grille initiale
            }
        } else {
            // Continuation
            if (externalPrompts && externalPrompts.memory_context) {
                let memoryPrompt = normalize(externalPrompts.memory_context);
                memoryPrompt = memoryPrompt
                    .replaceAll('{{localDescription}}', localDescription || 'No previous local description')
                    .replaceAll('{{globalDescription}}', globalDescription || 'No previous global description')
                    .replaceAll('{{colorPalette}}', analysis.colorPalette || 'No grid data');
                fullPrompt += memoryPrompt;
            }
            
            if (externalPrompts && externalPrompts.global_positioning) {
                let positioningPrompt = normalize(externalPrompts.global_positioning);
                const myX = myPosition ? myPosition[0] : 0;
                const myY = myPosition ? myPosition[1] : 0;
                const positionDescription = LlavaV2Adapter.getPositionDescription(myX, myY);
                positioningPrompt = positioningPrompt
                    .replaceAll('{{myX}}', myX)
                    .replaceAll('{{myY}}', myY)
                    .replaceAll('{{positionDescription}}', positionDescription);
                fullPrompt += positioningPrompt;
            }
            
            if (externalPrompts && externalPrompts.continuation_system) {
                let continuationPrompt = normalize(externalPrompts.continuation_system);
                
                // Remplacer les placeholders de couleurs aléatoires
                if (randomColors && randomColors.length >= 12) {
                    for (let i = 0; i < 12; i++) {
                        continuationPrompt = continuationPrompt.replaceAll(`{{color${i + 1}}}`, randomColors[i]);
                    }
                }
                
                fullPrompt += continuationPrompt;
            }
            
            needsImage = true;
            useGlobalCanvas = true;
        }
        
        if (needsImage) {
            fullPrompt += '\n\n[img]: Global canvas showing all bots (your bot has a GRAY BORDER)';
        }
        
        const systemMessage = fullPrompt.trim();
        const userMessage = customPrompt || 'Please provide your grid recommendation';
        
        console.log('[LLaVA V2] 📏 Prompt size:', {
            systemMessage: systemMessage.length + ' chars',
            userMessage: userMessage.length + ' chars',
            totalChars: systemMessage.length + userMessage.length,
            estimatedTokens: Math.ceil((systemMessage.length + userMessage.length) / 4),
            needsImage,
            useGlobalCanvas
        });
        
        return {
            systemMessage,
            userMessage,
            needsImage,
            useGlobalCanvas
        };
    },
    
    getPositionDescription: (x, y) => {
        if (x === 0 && y === 0) return 'CENTER';
        if (x === 0 && y === -1) return 'NORTH';
        if (x === 0 && y === 1) return 'SOUTH';
        if (x === -1 && y === 0) return 'WEST';
        if (x === 1 && y === 0) return 'EAST';
        if (x === -1 && y === -1) return 'NORTH-WEST';
        if (x === 1 && y === -1) return 'NORTH-EAST';
        if (x === -1 && y === 1) return 'SOUTH-WEST';
        if (x === 1 && y === 1) return 'SOUTH-EAST';
        return `POSITION [${x},${y}]`;
    },
    
    callAPI: async (apiKey, systemMessage, userMessage, imageBase64) => {
        console.log('🚀 [LLaVA V2] Appel API avec:', {
            systemPromptLength: systemMessage.length,
            userMessageLength: userMessage.length,
            hasImage: !!imageBase64,
            imageLength: imageBase64 ? imageBase64.length : 0
        });
        
        // Format compatible avec le serveur Python
        const requestBody = {
            model: 'llava:7b',
            system_prompt: systemMessage,  // Utiliser system_prompt au lieu de messages[0]
            messages: [
                { role: 'user', content: userMessage }
            ],
            max_tokens: 3000,  // Augmenté pour éviter les troncatures
            temperature: 0.7,   // Réduit de 1.0 à 0.7 (plus rapide, moins aléatoire)
            stream: false
        };
        
        if (imageBase64) {
            requestBody.messages[0].images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
            // console.log('[LLaVA V2] 📸 Images ajoutées:', requestBody.messages[0].images.length);
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 150000);
            
            const response = await fetch('http://localhost:8003/api/llm/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const result = data.response || data.message || '';
            
            console.log('[LLaVA V2] 📊 Réponse reçue:', result.length, 'caractères');
            console.log('[LLaVA V2] 📝 Réponse complète:', result);
            
            return result;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Timeout: LLaVA V2 n\'a pas répondu dans les 150 secondes');
            }
            console.error('❌ [LLaVA V2] Erreur API:', error);
            throw error;
        }
    },
    
    parseResponse: (response) => {
        // console.log('🔍 [LLaVA V2] Parsing de la réponse...');
        
        if (!response || typeof response !== 'string') {
            console.warn('⚠️ [LLaVA V2] Réponse vide ou invalide');
            return { pixels: [], localDescription: '', globalDescription: '' };
        }
        
        const result = LlavaV2Adapter.parseMultiLineFormat(response);
        const descriptions = LlavaV2Adapter.extractDescriptions(response);
        
        return {
            pixels: result.pixels,
            localDescription: descriptions.localDescription,
            globalDescription: descriptions.globalDescription
        };
    },
    
    parseMultiLineFormat: (text) => {
        console.log('🔍 [LLaVA V2] Parsing format multi-lignes...');
        
        const pixels = [];
        
        // NOUVELLE STRATÉGIE: Parser TOUS les pixels x,y#HEX dans TOUT le texte
        // Peu importe le format ou la structure
        console.log(`[LLaVA V2] 🔍 Recherche de tous les pixels dans ${text.length} caractères`);
        
        const pixelPattern = /(\d+),(\d+)#{1,2}([0-9A-Fa-f]{3,8})\b/g;
        let match;
        let rejectedCount = 0;
        let totalFound = 0;
        
        while ((match = pixelPattern.exec(text)) !== null) {
            totalFound++;
            let x = parseInt(match[1]);
            let y = parseInt(match[2]);
            let colorHex = match[3];
            
            // CLAMP coordinates to valid range (0-19)
            const origX = x, origY = y;
            x = Math.max(0, Math.min(19, x));
            y = Math.max(0, Math.min(19, y));
            if (origX !== x || origY !== y) {
                console.warn(`[LLaVA V2] 🔧 Coordonnées corrigées: ${origX},${origY} → ${x},${y}`);
            }
            
            // Normalize short colors (#FFF → #FFFFFF)
            if (colorHex.length === 3) {
                colorHex = colorHex[0] + colorHex[0] + colorHex[1] + colorHex[1] + colorHex[2] + colorHex[2];
            }
            
            // Normalize long colors (8 chars → 6 chars, remove alpha)
            if (colorHex.length > 6) {
                const original = colorHex;
                colorHex = colorHex.substring(0, 6);
                console.warn(`[LLaVA V2] 🔧 Couleur tronquée: ${original} → ${colorHex}`);
            }
            
            // Validate and add (accept all valid colors including black)
            if (colorHex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(colorHex)) {
                pixels.push({
                    x: x,
                    y: y,
                    color: '#' + colorHex.toUpperCase()
                });
            } else {
                console.warn(`[LLaVA V2] ❌ Couleur invalide: ${colorHex}`);
                rejectedCount++;
            }
        }
        
        console.log(`[LLaVA V2] 📊 Pixels trouvés: ${totalFound}, acceptés: ${pixels.length}, rejetés: ${rejectedCount}`);
        
        return { pixels };
    },
    
    // ANCIEN CODE SUPPRIMÉ - Nouvelle stratégie: parser tous les pixels globalement
    /* ANCIEN parseMultiLineFormat:
        const linePattern = /Je produis les pixels\s*:\s*([^\n]+?)(?:\s+pour réaliser\s*:|$)/gi;
        const lines = text.match(linePattern);
        
        if (lines) {
            lines.forEach((line, idx) => {
                const pixelMatch = line.match(/(?:Je produis les pixels\s*:\s*|.*I create the pixels:\s*)(.+?)(?:\s+pour réaliser|Q\d|$)/i);
                if (pixelMatch) {
                    const pixelContent = pixelMatch[1].trim();
                    const pixelPattern = /(\d+),(\d+)#{1,2}([0-9A-Fa-f]{3,8})\b/g;
                    let match;
                    
                    while ((match = pixelPattern.exec(pixelContent)) !== null) {
                        let x = parseInt(match[1]);
                        let y = parseInt(match[2]);
                        let colorHex = match[3];
                        
                        // CLAMP coordinates to valid range (0-19)
                        const origX = x, origY = y;
                        x = Math.max(0, Math.min(19, x));
                        y = Math.max(0, Math.min(19, y));
                        if (origX !== x || origY !== y) {
                            console.warn(`[LLaVA V2] 🔧 Coordonnées corrigées: ${origX},${origY} → ${x},${y}`);
                        }
                        
                        // Normalize short colors (#FFF → #FFFFFF)
                        if (colorHex.length === 3) {
                            colorHex = colorHex[0] + colorHex[0] + colorHex[1] + colorHex[1] + colorHex[2] + colorHex[2];
                        }
                        
                        // Normalize long colors (8 chars → 6 chars, remove alpha)
                        if (colorHex.length > 6) {
                            const original = colorHex;
                            colorHex = colorHex.substring(0, 6);
                            console.warn(`[LLaVA V2] 🔧 Couleur tronquée: ${original} → ${colorHex}`);
                        }
                        
                        // Validate and add (accept all valid colors including black)
                        if (colorHex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(colorHex)) {
                            pixels.push({
                                x: x,
                                y: y,
                                color: '#' + colorHex.toUpperCase()
                            });
                        } else {
                            console.warn(`[LLaVA V2] ❌ Couleur invalide: ${colorHex}`);
                            rejectedCount++;
                        }
                    }
                    
                    if (rejectedCount > 0) {
                        console.warn(`[LLaVA V2] ⚠️ ${rejectedCount} pixel(s) rejeté(s) dans cette ligne`);
                    }
                }
            });
        } else {
            // console.warn('[LLaVA V2] Aucune ligne "Je produis les pixels" trouvée');
        }
        
    */
    
    extractDescriptions: (text) => {
        // Extraire Q3 : Description de l'itération précédente
        let previousDescription = '';
        const q3Match = text.match(/Q3[:\s]+.*?I see:\s*(.+?)(?=\n\n|Q\d|$)/is);
        if (q3Match) {
            previousDescription = q3Match[1].trim();
        }
        
        // Extraire Q4 : Description globale (vue d'ensemble du canvas)
        let globalDescription = '';
        const q4Match = text.match(/Q4[:\s]+.*?I see:\s*(.+?)(?=\n\n|Q\d|---|$)/is);
        if (q4Match) {
            globalDescription = q4Match[1].trim();
        }
        
        // Extraire Q6 : Description locale (ce que l'agent vient de dessiner)
        let localDescription = '';
        
        // Essayer d'abord avec "Q6:" + "I see:"
        let q6Match = text.match(/Q6[:\s]+.*?I see:\s*(.+?)(?=\n\n|$)/is);
        
        // Sinon chercher dans le nouveau format "To draw X, I create..." (fallback)
        if (!q6Match) {
            const drawMatches = text.match(/To draw ([^,]+),\s*I create the pixels:/gi);
            if (drawMatches && drawMatches.length > 0) {
                const descriptions = drawMatches.map(m => {
                    const match = m.match(/To draw ([^,]+),/i);
                    return match ? match[1].trim() : '';
                }).filter(d => d);
                if (descriptions.length > 0) {
                    localDescription = descriptions.join(', ');
                }
            }
        }
        
        if (!localDescription && q6Match) {
            localDescription = q6Match[1].trim();
        }
        
        return { localDescription, globalDescription, previousDescription };
    }
};

// Export aussi sous le nom "LlavaAdapter" pour compatibilité
export { LlavaV2Adapter, LlavaV2Adapter as LlavaAdapter };

