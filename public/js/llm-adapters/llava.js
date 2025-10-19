// LLaVA Adapter - VISION MULTIMODALE
import { SpatialAnalysis } from '../spatial-analysis.js';

const LlavaAdapter = {
    name: 'LLaVA 7B (Vision)',
    model: 'llava:7b',  // Modèle vision correct
    maxTokens: 1000,
    
    config: {
        model: 'llava:7b',  // Modèle vision correct
        max_tokens: 1000
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
            const response = await fetch('/llava-prompts.json?v=20251016');
            if (!response.ok) throw new Error('Prompts non trouvés');
            LlavaAdapter.promptsContent = await response.json();
            console.log('🧾 [LLaVA] Prompts chargés');
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
        return `${r}${g}${b}`;
    },
    
    rgb9ToHex: (rgb9) => {
        if (!rgb9 || rgb9.length !== 3) return '#000000';
        const r = Math.round(parseInt(rgb9[0]) / 9 * 255).toString(16).padStart(2, '0');
        const g = Math.round(parseInt(rgb9[1]) / 9 * 255).toString(16).padStart(2, '0');
        const b = Math.round(parseInt(rgb9[2]) / 9 * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    },
    
    // ============================================
    // CONVERSION GRILLE → IMAGE PNG
    // ============================================
    
    gridToImage: async (pixels) => {
        try {
            const response = await fetch('http://localhost:8003/api/grid-to-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pixels })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur conversion: ${response.status}`);
            }
            
            const data = await response.json();
            return data.image; // Base64 de l'image PNG
        } catch (error) {
            console.error('[LLaVA] Erreur conversion grille→image:', error);
            return null;
        }
    },
    
    // ============================================
    // CANVAS GLOBAL → IMAGE PNG
    // ============================================
    
    fetchGlobalCanvas: async (allGrids, gridSize, myPosition, myUserId) => {
        try {
            console.log(`[LLaVA] Génération canvas global: ${Object.keys(allGrids).length} grilles, taille ${gridSize}×${gridSize}, myUserId: ${myUserId}`);
            
            const response = await fetch('http://localhost:8003/api/global-canvas-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    grids: allGrids,
                    grid_size: gridSize,
                    my_user_id: myUserId  // Pour highlighter la grille de l'agent
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur génération canvas: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`[LLaVA] Canvas global généré: ${data.width}×${data.height}, ${data.grid_count} grilles (highlighted: ${myUserId})`);
            return {
                image: data.image,
                width: data.width,
                height: data.height,
                myPosition: myPosition
            };
        } catch (error) {
            console.error('[LLaVA] Erreur génération canvas global:', error);
            return null;
        }
    },
    
    // ============================================
    // CONSTRUCTION DU PROMPT (avec image)
    // ============================================
    
    buildSystemPrompt: async (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition, randomColors = null) => {
        // Prompt personnalisé de l'utilisateur (optionnel)
        const userCustomPrompt = customPrompt && customPrompt.trim().length > 0 
            ? `${customPrompt}\n\n` 
            : '';
        
        if (userCustomPrompt) {
            console.log(`👤 [LLaVA User Prompt] "${customPrompt}"`);
        }
        
        // Message système différent selon si c'est le premier dessin (SEED) ou la suite (CONTINUATION)
        let systemMessage;
        let userMessage = userCustomPrompt || 'pixels:'; // Initialiser userMessage avec userCustomPrompt ou valeur par défaut
        
        // Nettoyage d'un éventuel préambule parasite venant d'entrées utilisateur/logs (e.g. "NOW YOUR TURN...", "RVB:", "Coordinates:", balises <<...>>)
        const sanitizeUserCustom = (txt) => {
            if (!txt) return '';
            let out = String(txt);
            // Supprime blocs "NOW YOUR TURN ..." sur une ou plusieurs lignes
            out = out.replace(/NOW YOUR TURN[\s\S]*?(?:\n|$)/gi, '');
            // Supprime lignes d'explication RVB / Coordinates
            out = out.replace(/^\s*RVB:[^\n]*\n?/gim, '');
            out = out.replace(/^\s*Coordinates:[^\n]*\n?/gim, '');
            // Supprime balises de type <<INSTRUCTIONS>>, <<CONTEXT>>…
            out = out.replace(/<<\/?[A-Z]+>>/g, '');
            return out.trim() ? out + (out.endsWith('\n') ? '' : '\n') : '';
        };

        const cleanedUserCustomPrompt = sanitizeUserCustom(userCustomPrompt);

        // Les prompts sont maintenant exclusivement chargés depuis llava-prompts.json
        // pour éviter la duplication et garantir la cohérence du narratif

        // Tenter de remplacer par les prompts externes (si disponibles)
        const externalPrompts = await LlavaAdapter.loadPrompts();
        if (externalPrompts) {
            const normalize = (v) => Array.isArray(v) ? v.join('\n') : (v ?? '');
            
            // MODE TRAINING: Si customPrompt contient "TRAINING", l'utiliser directement
            if (userCustomPrompt && userCustomPrompt.includes('TRAINING')) {
                systemMessage = userCustomPrompt.trim();
                console.log('🧾 [LLaVA] Prompt système (training) utilisé depuis customPrompt');
            } else if (iterationCount <= 1) {
                // PREMIÈRE ITÉRATION : seed_system seulement (iterationCount = 0 ou 1)
                if (externalPrompts.seed_system) {
                    systemMessage = normalize(externalPrompts.seed_system);
                    console.log('🧾 [LLaVA] Prompt seed_system chargé (première itération)');
                    console.log('🧾 [LLaVA] Contenu seed_system:', systemMessage.substring(0, 200) + '...');
                } else {
                    console.error('❌ [LLaVA] seed_system non trouvé dans les prompts externes!');
                }
                console.log('🧾 [LLaVA] Fin du chargement seed_system, systemMessage length:', systemMessage.length);
                console.log('🧾 [LLaVA] userMessage avant vérification:', userMessage);
            } else if (iterationCount > 1) {
                // ITÉRATIONS SUIVANTES : CONCATÉNER les 3 prompts dans l'ordre correct
                let fullPrompt = '';
                
                // 1. memory_context
                if (externalPrompts.memory_context) {
                    fullPrompt += normalize(externalPrompts.memory_context) + '\n\n';
                    console.log('🧾 [LLaVA] Prompt memory_context ajouté');
                }
                
                // 2. global_positioning  
                if (externalPrompts.global_positioning) {
                    fullPrompt += normalize(externalPrompts.global_positioning) + '\n\n';
                    console.log('🧾 [LLaVA] Prompt global_positioning ajouté');
                }
                
                // 3. continuation_system
                if (externalPrompts.continuation_system) {
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
                
                systemMessage = fullPrompt;
                console.log('🧾 [LLaVA] Prompt système complet (memory + global + continuation) chargé');
            }
        }
        
        // Note: Les prompts sont maintenant exclusivement chargés depuis llava-prompts.json
        // pour éviter la duplication et garantir la cohérence du narratif
        
        console.log('🧾 [LLaVA] Arrivée aux vérifications de débogage');
        console.log(`[LLaVA] System: ${systemMessage.length} chars, User: ${userMessage.length} chars`);
        console.log(`[LLaVA] SystemMessage vide?`, systemMessage.length === 0);
        console.log(`[LLaVA] UserMessage vide?`, userMessage.length === 0);
        
        if (systemMessage.length === 0) {
            console.error('❌ [LLaVA] SystemMessage est vide!');
        }
        
        // Définir les besoins d'images selon l'itération
        if (iterationCount <= 1) {
            // Itération 1 (seed_system) : pas d'images
            console.log('🧾 [LLaVA] Retour buildSystemPrompt pour iterationCount <= 1');
            return { systemMessage, userMessage, needsImage: false, useGlobalCanvas: false };
        } else {
            // Itérations suivantes (memory_context + global_positioning + continuation_system) : 
            // BESOIN des deux images (locale + globale) pour memory_context
            console.log('🧾 [LLaVA] Retour buildSystemPrompt pour iterationCount > 1');
            return { systemMessage, userMessage, needsImage: true, useGlobalCanvas: true };
        }
    },
    
    // ============================================
    // PARSING DES RÉPONSES
    // ============================================
    
    parseCompactFormat: (text) => {
        if (!text || typeof text !== 'string') return null;
        // Pré-nettoyage: enlever fences/code/échappements et normaliser espaces
        const cleaned = text
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`+/g, '')
            .replace(/\\/g, '')
            .replace(/[\u00A0\s]+/g, ' ');

        const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);
        
        let q1ImagesReceived = '';
        let q2GridLocation = '';
        let q3GlobalVision = '';
        let q4InterestingNeighbors = '';
        let q5MyIntention = '';
        let q6TechnicalIssues = '';
        let pixelsLine = '';
        let foundPixelsHeader = false;
        const pixelBlocks = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lower = line.toLowerCase();
            
            // Parser Q1-Q5 avec recherche plus flexible (insensible à la casse)
            if ((lower.startsWith('q1:') || lower.includes('**q1:**') || line.includes('**Q1:**')) && !q1ImagesReceived) {
                // Chercher la réponse sur la même ligne ou les lignes suivantes
                let answer = '';
                if (lower.includes('yes') || lower.includes('no')) {
                    answer = lower.includes('yes') ? 'YES' : 'NO';
                } else {
                    // Chercher sur les lignes suivantes
                    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                        const nextLine = lines[j].toLowerCase();
                        if (nextLine.includes('yes') || nextLine.includes('no')) {
                            answer = nextLine.includes('yes') ? 'YES' : 'NO';
                            break;
                        }
                    }
                }
                q1ImagesReceived = answer;
            } else if ((lower.startsWith('q2:') || lower.includes('**q2:**') || line.includes('**Q2:**')) && !q2GridLocation) {
                // Chercher la réponse sur les lignes suivantes
                let answer = '';
                for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() && !nextLine.toLowerCase().startsWith('q')) {
                        answer += nextLine.trim() + ' ';
                    }
                }
                q2GridLocation = answer.trim();
            } else if ((lower.startsWith('q3:') || lower.includes('**q3:**') || line.includes('**Q3:**')) && !q3GlobalVision) {
                // Chercher la réponse sur les lignes suivantes
                let answer = '';
                for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() && !nextLine.toLowerCase().startsWith('q')) {
                        answer += nextLine.trim() + ' ';
                    }
                }
                q3GlobalVision = answer.trim();
            } else if ((lower.startsWith('q4:') || lower.includes('**q4:**') || line.includes('**Q4:**')) && !q4InterestingNeighbors) {
                // Chercher la réponse sur les lignes suivantes
                let answer = '';
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() && !nextLine.toLowerCase().startsWith('q')) {
                        answer += nextLine.trim() + ' ';
                    }
                }
                q4InterestingNeighbors = answer.trim();
            } else if ((lower.startsWith('q5:') || lower.includes('**q5:**') || line.includes('**Q5:**')) && !q5MyIntention) {
                // Chercher la réponse sur les lignes suivantes
                let answer = '';
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() && !nextLine.toLowerCase().startsWith('q') && !nextLine.toLowerCase().includes('pixels:')) {
                        answer += nextLine.trim() + ' ';
                    }
                }
                q5MyIntention = answer.trim();
            } else if ((lower.startsWith('q6:') || lower.includes('**q6:**') || line.includes('**Q6:**')) && !q6TechnicalIssues) {
                // Chercher la réponse sur les lignes suivantes
                let answer = '';
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() && !nextLine.toLowerCase().startsWith('q')) {
                        answer += nextLine.trim() + ' ';
                    }
                }
                q6TechnicalIssues = answer.trim();
            } else if (lower.includes('pixels:')) {
                foundPixelsHeader = true;
                // Gérer les cas: "pixels:" n'importe où dans la ligne (y compris "1. pixels:")
                let after = line.substring(line.toLowerCase().indexOf('pixels:') + 'pixels:'.length).trim();
                let collected = after;
                // Concaténer les lignes suivantes jusqu'à section suivante, ligne vide, ou prochain bloc pixels
                for (let j = i + 1; j < lines.length; j++) {
                    const nxt = lines[j];
                    const nxtLower = nxt.toLowerCase();
                    if (!nxt || nxtLower.startsWith('global vision:') || nxtLower.startsWith('interesting neighbors:') || nxtLower.startsWith('my intention:') || nxtLower.startsWith('description:') || nxtLower.includes('pixels:')) {
                        break;
                    }
                    if (collected) collected += ' ';
                    collected += nxt;
                }
                if (collected) pixelBlocks.push(collected.trim());
            }
        }
        
        // Recherche alternative pour les questions Q1-Q6 si elles n'ont pas été trouvées
        if (!q1ImagesReceived || !q2GridLocation || !q3GlobalVision || !q4InterestingNeighbors || !q5MyIntention || !q6TechnicalIssues) {
            if (!q1ImagesReceived) {
                // Recherche plus flexible pour Q1
                const q1Patterns = [
                    /\*\*Q1:\*\*[^]*?Answer:\s*(YES|NO)/i,
                    /Q1:[^]*?Answer:\s*(YES|NO)/i,
                    /Q1:[^]*?(YES|NO)/i,
                    /\*\*Q1:\*\*[^]*?(YES|NO)/i,
                    /## Step 1: Answer Q1[^]*?(YES|NO)/i,
                    /Step 1: Answer Q1[^]*?(YES|NO)/i
                ];
                for (const pattern of q1Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        q1ImagesReceived = match[1];
                        break;
                    }
                }
            }
            
            if (!q2GridLocation) {
                const q2Patterns = [
                    /\*\*Q2:\*\*[^]*?(?=\*\*Q3:|Q3:|$)/i,
                    /Q2:[^]*?(?=Q3:|$)/i,
                    /## Step 2: Locate[^]*?(?=## Step 3:|Step 3:|$)/i,
                    /Step 2: Locate[^]*?(?=Step 3:|$)/i
                ];
                for (const pattern of q2Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q2:\*\*|Q2:|## Step 2: Locate|Step 2: Locate/i, '').trim();
                        // Nettoyer les questions restantes
                        q2GridLocation = content.replace(/Can you locate your bot's grid in the global canvas\? If YES, explain where \(position, distinctive features\)\. If NO, say 'NOT FOUND'[\*\*]*/i, '').trim();
                        break;
                    }
                }
            }
            
            if (!q3GlobalVision) {
                const q3Patterns = [
                    /\*\*Q3:\*\*[^]*?(?=\*\*Q4:|Q4:|$)/i,
                    /Q3:[^]*?(?=Q4:|$)/i,
                    /## Step 3: Global vision[^]*?(?=## Step 4:|Step 4:|$)/i,
                    /Step 3: Global vision[^]*?(?=Step 4:|$)/i
                ];
                for (const pattern of q3Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q3:\*\*|Q3:|## Step 3: Global vision|Step 3: Global vision/i, '').trim();
                        // Nettoyer les questions restantes
                        q3GlobalVision = content.replace(/Global vision: \(very short description of the canvas state\. What global pattern, shape or story you see\? Is your vision accurate enough\?\)[\*\*]*/i, '').trim();
                        break;
                    }
                }
            }
            
            if (!q4InterestingNeighbors) {
                const q4Patterns = [
                    /\*\*Q4:\*\*[^]*?(?=\*\*Q5:|Q5:|$)/i,
                    /Q4:[^]*?(?=Q5:|$)/i,
                    /## Step 4: Interesting neighbors[^]*?(?=## Step 5:|Step 5:|$)/i,
                    /Step 4: Interesting neighbors[^]*?(?=Step 5:|$)/i
                ];
                for (const pattern of q4Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q4:\*\*|Q4:|## Step 4: Interesting neighbors|Step 4: Interesting neighbors/i, '').trim();
                        // Nettoyer les questions restantes
                        q4InterestingNeighbors = content.replace(/Interesting neighbors: \(N,S,E,W,NE,NW,SE,SW; max 5 words each: N: \.\.\., W: \.\.\., etc\.\)[\*\*]*/i, '').trim();
                        break;
                    }
                }
            }
            
            if (!q5MyIntention) {
                const q5Patterns = [
                    /\*\*Q5:\*\*[^]*?(?=pixels:|Q6:|$)/i,
                    /Q5:[^]*?(?=pixels:|Q6:|$)/i,
                    /## Step 5: (?:My intention|Description)[^]*?(?=## Step 6:|Step 6:|pixels:|$)/i,
                    /Step 5: (?:My intention|Description)[^]*?(?=Step 6:|pixels:|$)/i
                ];
                for (const pattern of q5Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q5:\*\*|Q5:|## Step 5: (?:My intention|Description)|Step 5: (?:My intention|Description)/i, '').trim();
                        // Nettoyer les questions restantes
                        q5MyIntention = content.replace(/(?:My intention|Description): \(describe precisely the shape and colors you want your bot to draw[^]*?\)[\*\*]*/i, '').trim();
                        break;
                    }
                }
            }
            
            if (!q6TechnicalIssues) {
                const q6Patterns = [
                    /\*\*Q6:\*\*[^]*?(?=$)/i,
                    /Q6:[^]*?(?=$)/i,
                    /Technical issues:[^]*?(?=$)/i,
                    /## Step 6: Technical[^]*?(?=$)/i,
                    /Step 6: Technical[^]*?(?=$)/i
                ];
                for (const pattern of q6Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q6:\*\*|Q6:|Technical issues:|## Step 6: Technical|Step 6: Technical/i, '').trim();
                        q6TechnicalIssues = content.trim();
                        break;
                    }
                }
                
                // Recherche alternative pour des phrases techniques
                if (!q6TechnicalIssues) {
                    const technicalPhrases = [
                        /I only generated \d+ pixels because/i,
                        /I generated \d+ pixels/i,
                        /None reported/i,
                        /No issues/i,
                        /insufficient/i,
                        /too few pixels/i,
                        /only \d+ pixels/i,
                        /at least \d+ pixels/i
                    ];
                    
                    for (const phrase of technicalPhrases) {
                        const match = text.match(phrase);
                        if (match) {
                            q6TechnicalIssues = `Technical feedback detected: ${match[0]}`;
                            break;
                        }
                    }
                }
            }
        }
        
        // Si pas de ligne "pixels:", chercher les pixels directement dans tout le texte
        if (pixelBlocks.length > 0) {
            pixelsLine = pixelBlocks.join(' ');
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
            } else {
                pixelsLine = cleaned;
            }
        }

        // Si toujours pas de pixels trouvés, vérifier si LLaVA a expliqué son intention
        if (!pixelsLine || pixelsLine.trim() === '') {
            console.warn('[LLaVA] Aucun pixel trouvé, vérification si intention expliquée...');
            
            // Chercher des patterns d'intention sans pixels
            const intentionPatterns = [
                /I want to draw/i,
                /My intention/i,
                /Description:/i,
                /I will draw/i,
                /I plan to/i,
                /I would like to/i
            ];
            
            const hasIntention = intentionPatterns.some(pattern => pattern.test(text));
            if (hasIntention) {
                console.warn('[LLaVA] ⚠️ LLaVA a expliqué son intention mais n\'a pas généré de pixels!');
                console.warn('[LLaVA] Réponse complète:', text);
                
                // Retourner un objet spécial pour indiquer le problème
                return {
                    pixels: [],
                    q1_images_received: q1ImagesReceived,
                    q2_grid_location: q2GridLocation,
                    q3_global_vision: q3GlobalVision,
                    q4_interesting_neighbors: q4InterestingNeighbors,
                    q5_my_intention: q5MyIntention,
                    feedback: { q3GlobalVision, q4InterestingNeighbors, q5MyIntention },
                    error: 'NO_PIXELS_GENERATED',
                    hasIntention: true,
                    fullResponse: text
                };
            }
        }
        
        // Parser les pixels (RVB9 avec ou sans espaces: "5,5:900" ou "5,5: 900")
        const pixelPatternRvb9 = /(\d+),\s*(\d+):\s*(\d{3})/g;
        const pixels = [];
        let match;
        
        while ((match = pixelPatternRvb9.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            const rgb9 = match[3];
            if (x >= 0 && x < 20 && y >= 0 && y < 20) {
                pixels.push({ x, y, color: LlavaAdapter.rgb9ToHex(rgb9) });
            }
        }

        // Parser le format avec virgules ET espaces: "10,5#0000FF, 11,5#0000FF, 12,5#0000FF"
        const commaSpacePixelPattern = /(\d+),(\d+)#([0-9a-fA-F]{1,8}),\s*/g;
        while ((match = commaSpacePixelPattern.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            let hex = match[3];
            if (x < 0 || x >= 20 || y < 0 || y >= 20) continue;
            
            // Normaliser hex vers #RRGGBB
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 4) hex = hex.substring(0, 3).split('').map(c => c + c).join('');
            if (hex.length === 5) hex = hex.substring(0, 3).split('').map(c => c + c).join('');
            if (hex.length === 7) hex = hex.substring(0, 6);
            if (hex.length === 8) hex = hex.substring(0, 6);
            
            pixels.push({ x, y, color: `#${hex}` });
        }
        
        // Parser le format avec virgules: "100,50#0000FF,100,100#0000FF"
        const commaPixelPattern = /(\d+),(\d+)#([0-9a-fA-F]{1,8})/g;
        while ((match = commaPixelPattern.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            let hex = match[3];
            if (x < 0 || x >= 20 || y < 0 || y >= 20) continue;
            
            // Normaliser hex vers #RRGGBB
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 4) hex = hex.substring(0, 3).split('').map(c => c + c).join('');
            if (hex.length === 5) hex = hex.substring(0, 3).split('').map(c => c + c).join('');
            if (hex.length === 7) hex = hex.substring(0, 6);
            if (hex.length === 8) hex = hex.substring(0, 6);
            
            pixels.push({ x, y, color: `#${hex}` });
        }
        
        // Parser aussi le format hexadécimal que LLaVA peut produire (tolérant)
        // Cas valides classiques: #RGB / #RRGGBB / #RRGGBBAA (alpha ignoré)
        // Cas tolérés (mal-formés observés): #XXXX (4), #XXXXX (5), #XXXXXXX (7) → normalisés vers #RRGGBB
        // Supporte x,y:#HEX ET x,y#HEX (avec ou sans les deux points) - format simplifié préféré
        // Supporte aussi le format avec virgules: "100,50#0000FF,100,100#0000FF"
        // Supporte les placeholders: x,y#{{colorX}} → remplacés par des couleurs aléatoires
        const pixelPatternHex = /(\d+),\s*(\d+):?\s*#{1,2}([0-9a-fA-F]{1,8}|\{\{color\d+\}\})\b/g;
        while ((match = pixelPatternHex.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            let hex = match[3];
            if (x < 0 || x >= 20 || y < 0 || y >= 20) continue;
            
            // Gérer les placeholders {{colorX}}
            if (hex.startsWith('{{color') && hex.endsWith('}}')) {
                // Générer une couleur aléatoire pour remplacer le placeholder
                const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                hex = randomHex;
                console.log(`[LLaVA] Placeholder ${match[3]} remplacé par #${hex}`);
            } else {
                // Normaliser différentes longueurs vers #RRGGBB
                if (hex.length === 3) {
                    // #RGB → #RRGGBB
                    hex = hex.split('').map(c => c + c).join('');
                } else if (hex.length === 6) {
                    // déjà correct
                } else if (hex.length === 8) {
                    // #RRGGBBAA → ignorer alpha
                    hex = hex.slice(0, 6);
                } else if (hex.length >= 1 && hex.length <= 5) {
                    // Longueurs non standard (#X, #XX, #XXXX, #XXXXX) → pad à droite en répétant le dernier char jusqu'à 6
                    const last = hex[hex.length - 1];
                    while (hex.length < 6) hex += last;
                } else if (hex.length === 7) {
                    // #XXXXXXX → tronquer à 6
                    hex = hex.slice(0, 6);
                } else if (hex.length === 8) {
                    // #XXXXXXXX → tronquer à 6 (ignorer alpha)
                    hex = hex.slice(0, 6);
                } else {
                    // Si quelque chose d'encore plus étrange arrive, ignorer ce pixel
                    console.warn(`[LLaVA] Couleur hex invalide ignorée: #${hex} (${hex.length} caractères)`);
                    continue;
                }
            }
            const color = `#${hex.toLowerCase()}`;
            pixels.push({ x, y, color });
        }

        // Parser le format r,g,b (0-255): "x,y: 255, 128, 0"
        const pixelPatternRGB = /(\d+),\s*(\d+):\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\b/g;
        while ((match = pixelPatternRGB.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            let r = Math.min(255, Math.max(0, parseInt(match[3])));
            let g = Math.min(255, Math.max(0, parseInt(match[4])));
            let b = Math.min(255, Math.max(0, parseInt(match[5])));
            if (x < 0 || x >= 20 || y < 0 || y >= 20) continue;
            const toHex = (n) => n.toString(16).padStart(2, '0');
            const color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            pixels.push({ x, y, color });
        }

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

        // Détecter et corriger les couleurs avec double ##
        const doubleHashMatch = text.match(/\d+,\d+##[A-Fa-f0-9]+/g);
        if (doubleHashMatch) {
            console.warn(`[LLaVA] ⚠️ Couleurs avec double ## détectées: ${doubleHashMatch.join(', ')}`);
            q6TechnicalIssues = `Couleurs invalides avec double ##: ${doubleHashMatch.join(', ')}`;

            // Corriger les couleurs avec double ##
            let correctedText = text;
            doubleHashMatch.forEach(match => {
                const corrected = match.replace(/##/, '#');
                correctedText = correctedText.replace(match, corrected);
                console.log(`[LLaVA] 🔄 Corrigé ${match} → ${corrected}`);
            });

            // Re-parser avec le texte corrigé
            const correctedMatches = correctedText.match(pixelPatternHex);
            if (correctedMatches) {
                console.log(`[LLaVA] ✅ ${correctedMatches.length} pixels trouvés après correction des double ##`);
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

        // Filtrer les coordonnées invalides et dédupliquer
        const validPixels = [];
        let invalidCount = 0;
        
        for (const p of pixels) {
            if (p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20) {
                validPixels.push(p);
            } else {
                invalidCount++;
            }
        }
        
        if (invalidCount > 0) {
            console.warn(`[LLaVA] ⚠️ LLaVA a généré ${invalidCount} coordonnées invalides! (filtrées)`);
        }
        
        // Dédupliquer par coordonnée (dernier gagne)
        if (validPixels.length > 1) {
            const coordToPixel = new Map();
            for (const p of validPixels) coordToPixel.set(`${p.x},${p.y}`, p);
            const unique = [];
            coordToPixel.forEach(v => unique.push(v));
            pixels.length = 0;
            pixels.push(...unique);
        } else {
            pixels.length = 0;
            pixels.push(...validPixels);
        }
        
        console.log(`[LLaVA] ✅ ${pixels.length} pixels parsés`);
        
        // Nettoyer les champs texte des markdown et caractères parasites
        if (q3GlobalVision) {
            q3GlobalVision = q3GlobalVision.replace(/\*\*/g, '').replace(/^\s*-\s*/, '').trim();
        }
        if (q4InterestingNeighbors) {
            q4InterestingNeighbors = q4InterestingNeighbors.replace(/\*\*/g, '').replace(/^\s*-\s*/, '').trim();
        }
        if (q5MyIntention) {
            q5MyIntention = q5MyIntention.replace(/\*\*/g, '').replace(/^\s*-\s*/, '').trim();
        }
        
        return pixels.length > 0 ? { 
            pixels,
            q1_images_received: q1ImagesReceived,
            q2_grid_location: q2GridLocation,
            q3_global_vision: q3GlobalVision,
            q4_interesting_neighbors: q4InterestingNeighbors,
            q5_my_intention: q5MyIntention,
            q6_technical_issues: q6TechnicalIssues,
            feedback: {
                q3GlobalVision,
                q4InterestingNeighbors,
                q5MyIntention,
                q6TechnicalIssues
            }
        } : null;
    },
    
    parseResponse: (text) => {
        if (!text || typeof text !== 'string') {
            console.error('[LLaVA] Réponse invalide:', text);
            return { 
                pixels: [],
                q1_images_received: '',
                q2_grid_location: '',
                q3_global_vision: '',
                q4_interesting_neighbors: '',
                q5_my_intention: 'Erreur: réponse invalide'
            };
        }
        
        const parsed = LlavaAdapter.parseCompactFormat(text);
        
        if (parsed && parsed.pixels.length > 0) {
            return parsed;
        }
        
        // Fallback: 1 pixel noir
        console.warn('[LLaVA] ⚠️ Fallback: 1 pixel noir');
        const x = Math.floor(Math.random() * 20);
        const y = Math.floor(Math.random() * 20);
        return {
            pixels: [{ x, y, color: '#000000' }],
            q1_images_received: '',
            q2_grid_location: '',
            q3_global_vision: '',
            q4_interesting_neighbors: '',
            q5_my_intention: 'Fallback: silence',
            q6_technical_issues: 'Fallback: no technical feedback'
        };
    },
    
    // ============================================
    // API CALL (avec vision)
    // ============================================
    
    callAPI: async (apiKey, systemPrompt, userPrompt, imageBase64) => {
        try {
            // Si on reçoit un seul argument (ancien format)
            if (userPrompt === undefined) {
                userPrompt = systemPrompt;
                systemPrompt = '';
            }
            
            // Gérer les images (support multi-images)
            let images = [];
            if (imageBase64) {
                if (Array.isArray(imageBase64)) {
                    // Tableau d'images (nouveau format multi-images)
                    images = imageBase64;
                    console.log('[LLaVA] Envoi prompt avec', images.length, 'images:', {
                        system: systemPrompt.length + ' chars',
                        user: userPrompt.length + ' chars',
                        images: images.map(img => img.length + ' chars')
                    });
                } else if (typeof imageBase64 === 'object' && imageBase64.pureCanvas) {
                    // Prendre UNIQUEMENT l'image couleur (pure canvas)
                    images = [imageBase64.pureCanvas];
                    console.log('[LLaVA] Envoi prompt avec 1 image (pure canvas):', {
                        system: systemPrompt.length + ' chars',
                        user: userPrompt.length + ' chars',
                        image_pure: imageBase64.pureCanvas.length + ' chars'
                    });
                } else {
                    // 1 seule image (ancien format)
                    images = [imageBase64];
                    console.log('[LLaVA] Envoi prompt avec 1 image:', {
                        system: systemPrompt.length + ' chars',
                        user: userPrompt.length + ' chars',
                        image: imageBase64.length + ' chars'
                    });
                }
            }
            
            // Construction du prompt complet (simple, 1 image)
            const fullPrompt = systemPrompt 
                ? `<<INSTRUCTIONS>>\n${systemPrompt}\n<</INSTRUCTIONS>>\n\n<<CONTEXT>>\n${userPrompt}\n<</CONTEXT>>`
                : userPrompt;
            
            console.log('[LLaVA] Prompt complet construit:', fullPrompt.substring(0, 200) + '...');
            console.log('[LLaVA] Longueur prompt complet:', fullPrompt.length, 'chars');
            
            console.log('[LLaVA] 🚀 Envoi requête vers Ollama...');
            console.log('[LLaVA] URL:', 'http://localhost:8003/api/llm/ollama');
            console.log('[LLaVA] Modèle:', LlavaAdapter.model);
            
            const response = await fetch('http://localhost:8003/api/llm/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: LlavaAdapter.model,
                    messages: [{ 
                        role: 'user', 
                        content: fullPrompt,
                        images: images // Tableau d'images au lieu d'une seule
                    }],
                    max_tokens: 4000,  // Augmenté pour supporter jusqu'à 800 pixels
                    temperature: 0.8,   // Plus élevée pour plus de créativité et de pixels
                    top_p: 0.9,        // Diversité dans la génération
                    repeat_penalty: 1.1, // Éviter la répétition
                    stream: false
                })
            });
            
            console.log('[LLaVA] 📡 Réponse reçue, status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('[LLaVA] ❌ Erreur HTTP:', response.status, errorData);
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            const result = data.response || data.message || '';
            if (!result) {
                console.error('[LLaVA] Aucun texte dans la réponse:', data);
            } else {
                console.log('[LLaVA] 📊 Réponse reçue:', result.length, 'caractères');
                console.log('[LLaVA] 📝 Réponse complète:', result);
            }
            
            return {
                content: result,
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };
            
        } catch (error) {
            console.error('[LLaVA] Erreur API:', error);
            throw error;
        }
    },
    
    // ============================================
    // GÉNÉRATION DE PIXELS PAR DÉFAUT
    // ============================================
    
    generateDefaultPixels: () => {
        console.warn('[LLaVA] ⚠️ Fallback: 1 pixel noir (influence minimale)');
        const x = Math.floor(Math.random() * 20);
        const y = Math.floor(Math.random() * 20);
        return {
            strategy: 'silence',
            pixels: [{ x, y, color: '#000000' }]
        };
    }
};

export { LlavaAdapter };