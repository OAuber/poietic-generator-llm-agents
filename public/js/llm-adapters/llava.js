// LLaVA Adapter - VISION MULTIMODALE
import { SpatialAnalysis } from '../spatial-analysis.js';

const LlavaAdapter = {
    name: 'LLaVA 7B (Vision)',
    model: 'llava:7b',  // Modèle vision correct
    maxTokens: 4000,
    
    config: {
        model: 'llava:7b',  // Modèle vision correct
        max_tokens: 4000
    },
    
    // Manuel pour LLaVA (vision-based)
    manualContent: null,
    promptsContent: null,
    
    // Charger le manuel LLaVA
    loadManual: async () => {
        if (LlavaAdapter.manualContent) return LlavaAdapter.manualContent;
        
        try {
            const response = await fetch('/MANUEL_LLAVA.md');
            if (!response.ok) throw new Error('Manuel non trouvé');
            LlavaAdapter.manualContent = await response.text();
            console.log('📖 [LLaVA] Manuel chargé');
            return LlavaAdapter.manualContent;
        } catch (error) {
            console.error('❌ [LLaVA] Erreur chargement manuel:', error);
            LlavaAdapter.manualContent = ''; // Fallback vide
            return '';
        }
    },
    
    // Charger les prompts LLaVA (seed/continuation, etc.)
    loadPrompts: async () => {
        if (LlavaAdapter.promptsContent) return LlavaAdapter.promptsContent;
        try {
            const response = await fetch('/llava-prompts.json?v=20250123-fix-coords');
            if (!response.ok) throw new Error('Prompts non trouvés');
            LlavaAdapter.promptsContent = await response.json();
            console.log('🧾 [LLaVA] Prompts chargés (v20250123 - Fix coordinates 0-19)');
            return LlavaAdapter.promptsContent;
        } catch (error) {
            console.warn('⚠️ [LLaVA] Impossible de charger les prompts externes, utilisation des prompts intégrés:', error);
            LlavaAdapter.promptsContent = null; // Pas de cache invalide
            return null;
        }
    },
    
    // ============================================
    // CONVERSION DE COULEURS (RVB9 ↔ HEX)
    // ============================================
    
    hexToRGB9: (hex) => {
        if (!hex || hex.length !== 7) return '000';
        const r = Math.round(parseInt(hex.substr(1, 2), 16) / 255 * 9);
        const g = Math.round(parseInt(hex.substr(3, 2), 16) / 255 * 9);
        const b = Math.round(parseInt(hex.substr(5, 2), 16) / 255 * 9);
        return r.toString() + g.toString() + b.toString();
    },
    
    rgb9ToHex: (rgb9) => {
        if (!rgb9 || rgb9.length !== 3) return '#000000';
        const r = Math.round(parseInt(rgb9[0]) / 9 * 255);
        const g = Math.round(parseInt(rgb9[1]) / 9 * 255);
        const b = Math.round(parseInt(rgb9[2]) / 9 * 255);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    },
    
    // ============================================
    // CONSTRUCTION DU PROMPT SYSTÈME
    // ============================================
    
    buildSystemPrompt: async (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition, randomColors = null) => {
        console.log('🔧 [LLaVA] Construction du prompt système...');
        
        // Charger les prompts externes
        const externalPrompts = await LlavaAdapter.loadPrompts();
        
        let fullPrompt = '';
        let needsImage = false;
        let useGlobalCanvas = false;
        
        // Normaliser les prompts (array → string)
        const normalize = (prompt) => {
            if (Array.isArray(prompt)) {
                return prompt.join('\n');
            }
            return prompt || '';
        };
        
        if (iterationCount <= 1) {
            // 1. seed_system (première itération)
            if (externalPrompts && externalPrompts.seed_system) {
                let seedPrompt = normalize(externalPrompts.seed_system);
                
                // Remplacer les couleurs si disponibles
                if (randomColors && randomColors.length >= 8) {
                    seedPrompt = seedPrompt
                        .replaceAll('{{color1}}', randomColors[0])
                        .replaceAll('{{color2}}', randomColors[1])
                        .replaceAll('{{color3}}', randomColors[2])
                        .replaceAll('{{color4}}', randomColors[3])
                        .replaceAll('{{color5}}', randomColors[4])
                        .replaceAll('{{color6}}', randomColors[5])
                        .replaceAll('{{color7}}', randomColors[6])
                        .replaceAll('{{color8}}', randomColors[7]);
                    console.log('🎨 [LLaVA] Couleurs remplacées dans seed_system');
                }
                
                fullPrompt = seedPrompt;
                console.log('🧾 [LLaVA] Prompt seed_system chargé');
            } else {
                console.warn('⚠️ [LLaVA] seed_system non trouvé, utilisation du prompt par défaut');
                fullPrompt = "You are an AI art consultant helping a human operator manage drawing robots. Generate pixels in format: pixels: x,y#HEX x,y#HEX ...";
            }
        } else {
            // 2. memory_context
            if (externalPrompts && externalPrompts.memory_context) {
                let memoryPrompt = normalize(externalPrompts.memory_context);
                
                // Remplacer les variables dynamiques
                memoryPrompt = memoryPrompt
                    .replaceAll('{{lastDescription}}', myLastStrategy || 'No previous description')
                    .replaceAll('{{colorPalette}}', analysis.colorPalette || 'No color palette available');
                
                fullPrompt += memoryPrompt;
                console.log('🧾 [LLaVA] Prompt memory_context ajouté');
            }
            
            // 3. global_positioning
            if (externalPrompts && externalPrompts.global_positioning) {
                let positioningPrompt = normalize(externalPrompts.global_positioning);
                
                // Remplacer les variables dynamiques
                const myX = myPosition ? myPosition[0] : 0;
                const myY = myPosition ? myPosition[1] : 0;
                const positionDescription = LlavaAdapter.getPositionDescription(myX, myY);
                
                positioningPrompt = positioningPrompt
                    .replaceAll('{{myX}}', myX)
                    .replaceAll('{{myY}}', myY)
                    .replaceAll('{{positionDescription}}', positionDescription);
                
                fullPrompt += positioningPrompt;
                console.log('🧾 [LLaVA] Prompt global_positioning ajouté');
            }
            
            // 4. continuation_system
            if (externalPrompts && externalPrompts.continuation_system) {
                let continuationPrompt = normalize(externalPrompts.continuation_system);
                
                // Remplacer les couleurs si disponibles
                if (randomColors && randomColors.length >= 8) {
                    continuationPrompt = continuationPrompt
                        .replaceAll('{{color1}}', randomColors[0])
                        .replaceAll('{{color2}}', randomColors[1])
                        .replaceAll('{{color3}}', randomColors[2])
                        .replaceAll('{{color4}}', randomColors[3])
                        .replaceAll('{{color5}}', randomColors[4])
                        .replaceAll('{{color6}}', randomColors[5])
                        .replaceAll('{{color7}}', randomColors[6])
                        .replaceAll('{{color8}}', randomColors[7]);
                    console.log('🎨 [LLaVA] Couleurs remplacées dans continuation_system');
                }
                
                fullPrompt += continuationPrompt;
                console.log('🧾 [LLaVA] Prompt continuation_system ajouté');
            }
            
            needsImage = true;
            useGlobalCanvas = true;
        }
        
        // Ajouter les références d'images explicites
        if (needsImage) {
            fullPrompt += '\n\n[img]: Global canvas showing all bots (your bot has a GRAY BORDER)';
        }
        
        const systemMessage = fullPrompt.trim();
        const userMessage = customPrompt || 'pixels:';
        
        console.log('🔧 [LLaVA] SystemMessage length:', systemMessage.length);
        console.log('🔧 [LLaVA] UserMessage length:', userMessage.length);
        
        return {
            systemMessage,
            userMessage,
            needsImage,
            useGlobalCanvas
        };
    },
    
    // ============================================
    // DESCRIPTION DE POSITION
    // ============================================
    
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
    
    // ============================================
    // APPEL API LLAVA
    // ============================================
    
    callAPI: async (apiKey, systemMessage, userMessage, imageBase64) => {
        console.log('🚀 [LLaVA] Appel API avec LLaVA...');
        console.log('📝 [LLaVA] SystemMessage length:', systemMessage.length);
        console.log('📝 [LLaVA] UserMessage length:', userMessage.length);
        console.log('🖼️ [LLaVA] ImageBase64 length:', imageBase64 ? imageBase64.length : 'null');
        
        const requestBody = {
            model: 'llava:7b',
            messages: [
                {
                    role: 'system',
                    content: systemMessage
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            stream: false,
            options: {
                temperature: 1.0,
                top_p: 0.9,
                repeat_penalty: 1.1
            }
        };
        
        // Ajouter l'image si disponible
        if (imageBase64) {
            // Si imageBase64 est déjà un tableau, l'utiliser directement
            // Sinon, le mettre dans un tableau
            requestBody.messages[1].images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
            console.log('🖼️ [LLaVA] Nombre d\'images envoyées:', requestBody.messages[1].images.length);
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 secondes
            
            const response = await fetch('http://localhost:8003/api/llm/ollama', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log('[LLaVA] 📡 Réponse HTTP reçue, status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('[LLaVA] 📦 Données JSON parsées, clés:', Object.keys(data));
            
            const result = data.response || data.message || '';
            
            if (!result) {
                console.error('[LLaVA] ❌ Aucun texte dans la réponse:', data);
            } else {
                console.log('[LLaVA] 📊 Réponse reçue:', result.length, 'caractères');
                console.log('[LLaVA] 📝 Réponse complète:', result);
            }
            
            return result;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Timeout: LLaVA n\'a pas répondu dans les 90 secondes');
            }
            console.error('❌ [LLaVA] Erreur API:', error);
            throw error;
        }
    },
    
    // ============================================
    // PARSING DE LA RÉPONSE LLAVA
    // ============================================
    
    parseResponse: (response) => {
        console.log('🔍 [LLaVA] Parsing de la réponse...');
        
        if (!response || typeof response !== 'string') {
            console.warn('⚠️ [LLaVA] Réponse vide ou invalide');
            return {
                pixels: [],
                q1ImageReceipt: '',
                q2RobotLocation: '',
                q3GlobalAnalysis: '',
                q4NeighborAnalysis: '',
                q5StrategicRecommendation: '',
                q6TechnicalIssues: ''
            };
        }
        
        return LlavaAdapter.parseCompactFormat(response);
    },
    
    parseCompactFormat: (text) => {
        console.log('🔍 [LLaVA] Parsing format compact...');
        console.log('🔍 [LLaVA] Texte reçu (premiers 500 chars):', text.substring(0, 500));
        
        const pixels = [];
        let q1ImageReceipt = '';
        let q2RobotLocation = '';
        let q3GlobalAnalysis = '';
        let q4NeighborAnalysis = '';
        let q5StrategicRecommendation = '';
        let q6TechnicalIssues = '';
        
        // Nettoyer le texte
        const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Recherche des questions Q1-Q6
        const q1Match = cleaned.match(/(?:Q1|q1)[:\s]*(.*?)(?=\n|Q2|q2|$)/i);
        if (q1Match) {
            q1ImageReceipt = q1Match[1].trim().replace(/^(Q1|q1)[:\s]*/i, '');
        }
        
        const q2Match = cleaned.match(/(?:Q2|q2)[:\s]*(.*?)(?=\n|Q3|q3|$)/i);
        if (q2Match) {
            q2RobotLocation = q2Match[1].trim().replace(/^(Q2|q2)[:\s]*/i, '');
        }
        
        const q3Match = cleaned.match(/(?:Q3|q3)[:\s]*(.*?)(?=\n|Q4|q4|$)/i);
        if (q3Match) {
            q3GlobalAnalysis = q3Match[1].trim().replace(/^(Q3|q3)[:\s]*/i, '');
        }
        
        const q4Match = cleaned.match(/(?:Q4|q4)[:\s]*(.*?)(?=\n|Q5|q5|$)/i);
        if (q4Match) {
            q4NeighborAnalysis = q4Match[1].trim().replace(/^(Q4|q4)[:\s]*/i, '');
        }
        
        const q5Match = cleaned.match(/(?:Q5|q5)[:\s]*(.*?)(?=\n|Q6|q6|pixels:|$)/i);
        if (q5Match) {
            q5StrategicRecommendation = q5Match[1].trim().replace(/^(Q5|q5)[:\s]*/i, '');
        }
        
        const q6Match = cleaned.match(/(?:Q6|q6)[:\s]*(.*?)(?=\n|$)/i);
        if (q6Match) {
            q6TechnicalIssues = q6Match[1].trim().replace(/^(Q6|q6)[:\s]*/i, '');
        }
        
        // Recherche de la ligne pixels
        let pixelsLine = '';
        let foundPixelsHeader = false;
        
        // Recherche directe de "pixels:" (peut être précédé de "1. DRAWING COMMAND:" ou similaire)
        // Collecter TOUTES les lignes contenant "pixels:" (LLaVA génère parfois plusieurs lignes)
        const lines = cleaned.split('\n');
        const pixelLines = [];
        for (const line of lines) {
            const lowerLine = line.trim().toLowerCase();
            if (lowerLine.includes('pixels:')) {
                // Extraire la partie après "pixels:"
                const pixelsIndex = lowerLine.indexOf('pixels:');
                const extracted = line.trim().substring(pixelsIndex + 7); // +7 pour sauter "pixels:"
                pixelLines.push(extracted);
                foundPixelsHeader = true;
            }
        }
        
        if (pixelLines.length > 0) {
            // Concaténer toutes les lignes pixels avec des espaces
            pixelsLine = 'pixels: ' + pixelLines.join(' ');
            console.log('[LLaVA] ' + pixelLines.length + ' ligne(s) pixels trouvée(s), concaténées');
            console.log('[LLaVA] Ligne pixels finale:', pixelsLine.substring(0, 150) + '...');
        }
        
        if (!pixelsLine) {
            if (!foundPixelsHeader) {
                console.warn('[LLaVA] Aucune ligne "pixels:" trouvée, recherche dans tout le texte...');
                
                // Recherche dans les blocs de code ```pixels: ... ```
                const codeBlockMatch = cleaned.match(/```pixels:\s*\n?([^`]*?)```/);
                if (codeBlockMatch) {
                    pixelsLine = codeBlockMatch[1].trim();
                    console.log('[LLaVA] Pixels trouvés dans bloc de code:', pixelsLine);
                } else {
                    // Recherche pour ```pixels: sans fermeture ```
                    const codeBlockMatchOpen = cleaned.match(/```pixels:\s*\n?([^`]+)/);
                    if (codeBlockMatchOpen) {
                        pixelsLine = codeBlockMatchOpen[1].trim();
                        console.log('[LLaVA] Pixels trouvés dans bloc de code ouvert:', pixelsLine);
                    } else {
                        // Recherche alternative dans le texte original pour les blocs de code
                        const originalCodeBlockMatch = text.match(/```pixels:\s*\n?([^`]*?)```/);
                        if (originalCodeBlockMatch) {
                            pixelsLine = originalCodeBlockMatch[1].trim();
                            console.log('[LLaVA] Pixels trouvés dans bloc de code original:', pixelsLine);
                        } else {
                            // Recherche pour pixels: dans un code block (```...pixels:...```)
                            const codeBlockMatch2 = cleaned.match(/```[^`]*?pixels:\s*([^`]*?)```/i);
                            if (codeBlockMatch2) {
                                pixelsLine = codeBlockMatch2[1].replace(/\n/g, ' ').trim();
                                console.log('[LLaVA] Pixels trouvés dans code block (format 2):', pixelsLine);
                            } else {
                                // Recherche pour pixels: suivi de pixels sur plusieurs lignes
                                const multiLineMatch = cleaned.match(/pixels:\s*([^.]*?)(?=Q1:|Q2:|Q3:|Q4:|Q5:|I generated|Description:|After your prompt|\n\n|$)/s);
                                if (multiLineMatch) {
                                    pixelsLine = multiLineMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                    console.log('[LLaVA] Pixels trouvés sur plusieurs lignes:', pixelsLine);
                                } else {
                                    // Recherche spécifique pour le format LLaVA: pixels: suivi de lignes de pixels
                                    const llavaFormatMatch = cleaned.match(/pixels:\s*\n?([0-9,]+#[A-Fa-f0-9]+\s*\n?[0-9,]+#[A-Fa-f0-9]+(?:\s*\n?[0-9,]+#[A-Fa-f0-9]+)*)/);
                                    if (llavaFormatMatch) {
                                        pixelsLine = llavaFormatMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                        console.log('[LLaVA] Pixels trouvés avec format LLaVA:', pixelsLine);
                                    } else {
                                        // Recherche pour le format multi-ligne cassé avec ```pixels: suivi de lignes
                                        const multiLineCodeMatch = text.match(/```\s*pixels:\s*\n([^`]+)```/);
                                        if (multiLineCodeMatch) {
                                            pixelsLine = multiLineCodeMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                            console.log('[LLaVA] Pixels trouvés dans code block multi-ligne:', pixelsLine);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Si toujours pas de pixels trouvés, vérifier si LLaVA a expliqué son intention
        if (!pixelsLine || pixelsLine.trim() === '') {
            console.warn('[LLaVA] Aucun pixel trouvé, vérification si intention expliquée...');
            
            // Vérifier si LLaVA a expliqué son intention sans générer de pixels
            const intentionMatch = cleaned.match(/(?:My intention|Description|I want to|I will|I should)/i);
            if (intentionMatch) {
                console.log('[LLaVA] Intention détectée mais pas de pixels générés');
                q6TechnicalIssues = 'LLaVA a expliqué son intention mais n\'a pas généré de pixels. Problème de format ou de compréhension.';
            }
            
            return {
                pixels: [],
                q1ImageReceipt: q1ImageReceipt,
                q2RobotLocation: q2RobotLocation,
                q3GlobalAnalysis: q3GlobalAnalysis,
                q4NeighborAnalysis: q4NeighborAnalysis,
                q5StrategicRecommendation: q5StrategicRecommendation,
                q6TechnicalIssues: q6TechnicalIssues
            };
        }
        
        // Normaliser la ligne pixels
        // 1. Remplacer ## par # (double hash)
        pixelsLine = pixelsLine.replace(/##/g, '#');
        
        // 2. Supprimer les virgules entre triplets (format incorrect de LLaVA)
        // "10,10#FFF, 19,7#FFF" → "10,10#FFF 19,7#FFF"
        pixelsLine = pixelsLine.replace(/([0-9a-fA-F]{3,8}),\s*/g, '$1 ');
        
        // 3. Ajouter des espaces entre les triplets collés (si absents)
        // Format incorrect: "0,0#FFF0,1#AAA" → Format correct: "0,0#FFF 0,1#AAA"
        pixelsLine = pixelsLine.replace(/([0-9a-fA-F]{3,8})(\d+),/g, '$1 $2,');
        
        console.log('[LLaVA] 📝 Ligne normalisée:', pixelsLine.substring(0, 150) + '...');
        
        // Définir le pattern de parsing des pixels (utilisé plusieurs fois)
        const pixelPatternHex = /(\d+),\s*(\d+):?\s*#([0-9a-fA-F]{1,8}|\{\{color\d+\}\})\b/g;
        
        // Détecter et remplacer les placeholders {{colorX}} par des couleurs aléatoires
        const placeholderMatch = text.match(/#\{\{color\d+\}\}/g);
        if (placeholderMatch) {
            console.warn(`[LLaVA] ⚠️ Placeholders détectés: ${placeholderMatch.join(', ')}`);
            q6TechnicalIssues = `Placeholders non remplacés: ${placeholderMatch.join(', ')}`;
            
            // Remplacer les placeholders par des couleurs aléatoires
            let replacedText = text;
            placeholderMatch.forEach(placeholder => {
                const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                replacedText = replacedText.replace(placeholder, randomColor);
                console.log(`[LLaVA] 🔄 Remplacé ${placeholder} par ${randomColor}`);
            });
            
            // Re-parser avec le texte corrigé
            const correctedMatches = replacedText.match(pixelPatternHex);
            if (correctedMatches) {
                console.log(`[LLaVA] ✅ ${correctedMatches.length} pixels trouvés après correction des placeholders`);
                correctedMatches.forEach(match => {
                    const parts = match.split('#');
                    if (parts.length === 2) {
                        const coords = parts[0].split(',');
                        if (coords.length === 2) {
                            const x = parseInt(coords[0]);
                            const y = parseInt(coords[1]);
                            const hex = '#' + parts[1];
                            if (!isNaN(x) && !isNaN(y) && x >= 0 && x < 20 && y >= 0 && y < 20) {
                                pixels.push({ x, y, color: hex });
                            }
                        }
                    }
                });
            }
        }
        
        // Parser les pixels avec le pattern hex (déjà défini plus haut)
        pixelPatternHex.lastIndex = 0; // Reset regex
        const matches = pixelsLine.match(pixelPatternHex);
        
        if (matches) {
            console.log(`[LLaVA] ${matches.length} pixels trouvés avec pattern hex`);
            console.log('[LLaVA] Premiers matches:', matches.slice(0, 5).join(', '));
            
            matches.forEach(match => {
                const parts = match.split('#');
                if (parts.length === 2) {
                    const coords = parts[0].split(',');
                    if (coords.length === 2) {
                        const x = parseInt(coords[0]);
                        const y = parseInt(coords[1]);
                        const hex = '#' + parts[1];
                        
                        // Vérifier les coordonnées valides
                        if (!isNaN(x) && !isNaN(y) && x >= 0 && x < 20 && y >= 0 && y < 20) {
                            pixels.push({ x, y, color: hex });
                        } else {
                            console.warn(`[LLaVA] Coordonnées invalides ignorées: ${x},${y}`);
                        }
                    }
                }
            });
        }
        
        // Filtrer les coordonnées invalides
        const validPixels = pixels.filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
        const invalidCount = pixels.length - validPixels.length;
        
        if (invalidCount > 0) {
            q6TechnicalIssues += ` ${invalidCount} coordonnées invalides filtrées.`;
        }
        
        // Détection spéciale pour les problèmes techniques
        if (pixels.length === 0) {
            if (placeholderMatch && placeholderMatch.length > 0) {
                q6TechnicalIssues = `Placeholders non remplacés: ${placeholderMatch.join(', ')}`;
            } else if (q6TechnicalIssues === '') {
                q6TechnicalIssues = 'Aucun pixel généré. Vérifier le format de sortie.';
            }
        } else if (pixels.length < 200) {
            if (q6TechnicalIssues === '') {
                q6TechnicalIssues = `Seulement ${pixels.length} pixels générés (minimum recommandé: 200).`;
            }
        }
        
        // Détection des hallucinations de comptage
        const countClaimMatch = text.match(/at least (\d+) pixels|(\d+) pixels generated|generated (\d+) pixels/i);
        if (countClaimMatch) {
            const claimedCount = parseInt(countClaimMatch[1] || countClaimMatch[2] || countClaimMatch[3]);
            if (claimedCount > pixels.length) {
                q6TechnicalIssues += ` Hallucination de comptage: prétend ${claimedCount} pixels mais n'en génère que ${pixels.length}.`;
            }
        }
        
        console.log(`[LLaVA] ✅ ${pixels.length} pixels parsés (${validPixels.length} valides après filtrage)`);
        
        if (pixels.length === 0) {
            console.warn('[LLaVA] ⚠️ Aucun pixel parsé! pixelsLine était:', pixelsLine ? pixelsLine.substring(0, 200) : 'vide');
        }
        
        return {
            pixels: validPixels,
            q1ImageReceipt: q1ImageReceipt,
            q2RobotLocation: q2RobotLocation,
            q3GlobalAnalysis: q3GlobalAnalysis,
            q4NeighborAnalysis: q4NeighborAnalysis,
            q5StrategicRecommendation: q5StrategicRecommendation,
            q6TechnicalIssues: q6TechnicalIssues
        };
    }
};

export { LlavaAdapter };