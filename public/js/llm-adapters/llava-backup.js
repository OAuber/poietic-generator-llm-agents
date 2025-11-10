// LLaVA Adapter - VISION MULTIMODALE
import { SpatialAnalysis } from '../spatial-analysis.js';

const LlavaAdapter = {
    name: 'LLaVA 7B (Vision)',
    model: 'llama3.1:8b',
    maxTokens: 1000,
    
    config: {
        model: 'llama3.1:8b',
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
    
    buildSystemPrompt: async (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition) => {
        // Prompt personnalisé de l'utilisateur (optionnel)
        const userCustomPrompt = customPrompt && customPrompt.trim().length > 0 
            ? `${customPrompt}\n\n` 
            : '';
        
        if (userCustomPrompt) {
            console.log(`👤 [LLaVA User Prompt] "${customPrompt}"`);
        }
        
        // Message système différent selon si c'est le premier dessin (SEED) ou la suite (CONTINUATION)
        let systemMessage;
        let userMessage;
        
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

        if (iterationCount <= 1) {
            // SEED PROMPT minimal et strict: la sortie DOIT commencer par "pixels:"
            systemMessage = `
As visual specialist you are intend to guide a bot that can draw on a 20×20 grid among other bots drawing in real-time on a global canvas.
First, coach your bot to signal its presence. Conceive an inspiring avatar bor your bot, something figurative or abstract, such as a toy robot, a dog, a human face, a landscape, an algorithmic shape—whatever you can imagine.
Do not let your bot use BLACK PIXELS #000000 AT THE BEGINNING PLEASE).

SO WHAT TO DO:
1. Send your suggested compositon of pixels to your bot using the exact format: pixels: x,y:#HEX x,y:#HEX ...
2. Add your text descriptions

RULES (strict):
- Each pixel you draw in your grid must have coordinates (x,y) that are integers 0..19. No floats. 
- CRITICAL: x must be 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 (maximum 19)
- CRITICAL: y must be 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 (maximum 19)
                  - The format of the drawing command is a line of successive triplets (maximum 800 triplets) like this: 
  pixels: x,y#HEX x,y#HEX ... (with one space between each triplet x,y#HEX) 
- For example: 
  pixels: 3,2#975DAE 19,7#D7D7D7 ...
- Do not repeat "pixel:" for each pixel you draw. 
- CRITICAL: Use only valid HEX colors: #RGB (3 chars) or #RRGGBB (6 chars). Examples: #FFF, #FF5733
- Do not duplicate coordinates: each (x,y) appears at most once.
- Do not invent a new format. Each triplet MUST be explicit: x,y#HEX. 
- Forbid placeholders like x,y or #HEX alone, and of course something like x,y#975DAE doesn't make sense
- Forbid batching multiple colors after a single coordinate.
- PLEASE no code fences, no markdown, no prose before the pixels line.
- Avoid drawing isolated pixels.
- Arawing shapes by lines or columns like a scanner x=0, 1, 2, ... 19, y=0, 1, 2, ... 19. Prefer drawing like a painter.
- Output at least 10 pixels. 
- CRITICAL: Create recognizable shapes! Draw connected pixels to form faces, animals, objects, or geometric patterns.
- Think like a painter: group pixels together to create meaningful forms, not random scattered dots.
- COLLABORATE: If you see existing recognizable forms (like faces, objects), enhance them or create complementary elements around them.
- Don't ignore what's already there - build upon the existing composition! 

  AFTER writing your drawing command, you MAY add 1 short line, PLEASE USE EXCLUSIVELY THE FOLLOWING FORMAT FOR TEXT OUTPUT:

  my intention: (describe precisely the shape you just conceive for your bot. With which colors? How do think your bot can improve or complete it during the next iteration?)`;

            userMessage = `${cleanedUserCustomPrompt}pixels:`;
            
        } else {
            // CONTINUATION PROMPT minimal et strict (sans mention de bordure/structure)
            systemMessage = `
            
Your bot wants to be original and different from the others, but also to work with them.
Guide it coach it the best you can.

WHAT TO DO:
1. Look at the global canvas image, spot the drawing of your bot and the ones of the others
2. Identify recognizable shapes, patterns, faces, bodies, animals or objects you can see
3. Suggest to your bot to INTERACT with existing forms: complement, enhance, oppose or create harmony with what's already there
4. Help your bot to CREATE, COMPLETE, or ENHANCE recognizable forms (faces, animals, geometric shapes, objects)
5. Add a text descriptions AFTER your bot's drawing command.

You see the global canvas with your bot's grid and the ones of the other bots around. 
Try to spot the drawing of your bot and its neighbors' ones. 
Focus on composition, symmetries, colors, shapes, themes that emerge out of the chaos.
Figure out how your bot contribute to something unexpected!
                Let your bot draw at least 200 and at most 800 pixels of nuanced colors during each iteration.
Comunicate with your bot by using the format and rules below.

FORMAT AND RULES (strict):
- Each pixel must have coordinates (x,y) that are integers 0..19. No floats. 
- CRITICAL: x must be 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 (maximum 19)
- CRITICAL: y must be 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 (maximum 19)
                  - The format of the drawing command is a line of successive triplets (maximum 800 triplets) like this: 
  pixels: x,y#HEX x,y#HEX ... (with one space between each triplet x,y#HEX) 
- For example: 
  pixels: 3,2#975DAE 19,7#D7D7D7 ...
- Do not repeat "pixel:" for each pixel you draw. 
- CRITICAL: Use only valid HEX colors: #RGB (3 chars) or #RRGGBB (6 chars). Examples: #FFF, #FF5733
- Do not duplicate coordinates: each (x,y) appears at most once.
- Do not invent a new format. Each triplet MUST be explicit: x,y#HEX. 
- Forbid placeholders like x,y or #HEX alone, and of course something like x,y#975DAE doesn't make sense
- Forbid batching multiple colors after a single coordinate.
- PLEASE no code fences, no markdown, no prose before the pixels line.
- Arawing shapes by lines or columns like a scanner x=0, 1, 2, ... 19, y=0, 1, 2, ... 19. Prefer drawing like a painter.
- Output at least 10 pixels. 
- CRITICAL: Create recognizable shapes! Avoid drawing isolated pixels. Draw connected pixels to form faces, animals, objects, or geometric patterns.
- Think like a painter: group pixels together to create meaningful forms, not random scattered dots.
- COLLABORATE: If you see existing recognizable forms (like faces, objects), let your botenhance them or create complementary elements around them.
- Don't ignore what's already there. Let your bot build upon the existing composition! 

SEND YOUR DRAWING COMMAND TO YOUR BOT NOW! (pixels: x,y:#HEX x,y:#HEX ... ):

  After your drawing command, you MAY add 3 short lines: 
  
PLEASE USE EXCLUSIVELY THE FOLLOWING FORMAT FOR TEXT OUTPUT:

  global vision: (your shortest possible description of the canvas state. What global pattern, shape or story you see ? Is your vision accurate enough)
  interesting neighbors: (which neighbors' contribution (N, S, E, W, NE, NW, SE, SW) shoud inspire your bot the most and why, maximum 5 words by neighbor)
  my intention: (describe precisely the shape you sent your bot. With which colors? Does it match your intend? How do think your bot can improve or complete it during the next iteration?)`;

            userMessage = `${cleanedUserCustomPrompt}pixels:`;
        }

        // Tenter de remplacer par les prompts externes (si disponibles)
        const externalPrompts = await LlavaAdapter.loadPrompts();
        if (externalPrompts) {
            const normalize = (v) => Array.isArray(v) ? v.join('\n') : (v ?? '');
            
            // MODE TRAINING: Si customPrompt contient "TRAINING", l'utiliser directement
            if (userCustomPrompt && userCustomPrompt.includes('TRAINING')) {
                systemMessage = userCustomPrompt.trim();
                console.log('🧾 [LLaVA] Prompt système (training) utilisé depuis customPrompt');
            } else if (iterationCount <= 1 && externalPrompts.seed_system) {
                systemMessage = normalize(externalPrompts.seed_system);
                console.log('🧾 [LLaVA] Prompt système (seed) chargé depuis fichier externe');
            } else if (iterationCount > 1 && externalPrompts.continuation_system) {
                systemMessage = normalize(externalPrompts.continuation_system);
                console.log('🧾 [LLaVA] Prompt système (continuation) chargé depuis fichier externe');
            }
        }
        
        // Si pas de customPrompt et pas en training, utiliser le prompt de continuation
        if (!userCustomPrompt && iterationCount > 1) {
            // Utiliser le prompt continuation_system avec les questions Q1-Q5
            const continuationPrompt = [
                "BEFORE drawing, answer these questions:",
                "Q1: Did you receive both images? Answer: YES or NO",
                "Q2: Can you locate your bot's grid in the global canvas? If YES, explain where (position, distinctive features). If NO, say 'NOT FOUND'",
                "Q3: Global vision: (very short description of the canvas state. What global pattern, shape or story you see? Is your vision accurate enough?)",
                "Q4: Interesting neighbors: (N,S,E,W,NE,NW,SE,SW; max 5 words each: N: ..., W: ..., etc.)",
                "Q5: My intention: (describe precisely the shape and colors you want to send to your bot (say A vibrant orange sunset with purple mountains) as well as the improvements to be made in the next iteration (say Add golden stars scattered across the sky)",
                "",
                "GENERAL RECOMMENDATIONS:",
                "1. Look at the GLOBAL CANVAS image, locate your YOUR BOT'S GRID and others.",
                "2. Identify recognizable forms, faces, bodies, animals, objects, or geometric patterns.",
                "3. Pursue your intentions and your inspiration so that your robot remains consistent over time.",
                "4. Imagine how your bot could INTERACT with existing forms: complement, enhance, oppose, or harmonize.",
                "5. Help your bot to CREATE, COMPLETE, or ENHANCE recognizable forms.",
                "",
                "FORMAT AND RULES (strict):",
                "- x,y are integers 0..19.",
                "- CRITICAL: x ∈ {0..19}, y ∈ {0..19} (max 19).",
                "- One single line of triplets: pixels: x,y#HEX x,y#HEX ... (max 800 triplets).",
                "- Example: pixels: 3,2#975DAE 19,7#D7D7D7 ...",
                "- Valid HEX only: #RGB or #RRGGBB (e.g. #FFF, #FF5733).",
                "- No duplicate coordinates.",
                "- No code fences, no markdown, no prose before the pixels line.",
                "- Output at least 200 pixels, up to 800 pixels.",
                "- Create recognizable shapes; AVOID scattered dots.",
                "- Prefer CONNECTED components and FILLED areas; use 2–3px thick strokes.",
                "- Favor horizontal/vertical continuity; avoid long thin diagonals.",
                "- Max 8 separate groups; each group should contain ≥ 8 pixels.",
                "- Build upon the existing composition.",
                "",
                "SEND YOUR DRAWING COMMAND NOW (pixels: x,y:#HEX x,y:#HEX ...):"
            ].join('\n');
            
            systemMessage = continuationPrompt;
            console.log('🧾 [LLaVA] Prompt système (continuation avec Q1-Q5) utilisé');
            console.log('🧾 [LLaVA] Prompt Q1-Q5:', continuationPrompt.substring(0, 200) + '...');
        }
        
        console.log(`[LLaVA] System: ${systemMessage.length} chars, User: ${userMessage.length} chars`);
        
        // Pour l'itération 1, ne pas envoyer d'image (éviter l'écran noir perçu)
        if (iterationCount <= 1) {
            return { systemMessage, userMessage, needsImage: false, useGlobalCanvas: false };
        }
        return { systemMessage, userMessage, needsImage: true, useGlobalCanvas: true };
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
            } else if (lower.includes('pixels:')) {
                foundPixelsHeader = true;
                // Gérer les cas: "pixels:" n'importe où dans la ligne (y compris "1. pixels:")
                let after = line.substring(line.toLowerCase().indexOf('pixels:') + 'pixels:'.length).trim();
                let collected = after;
                // Concaténer les lignes suivantes jusqu'à section suivante, ligne vide, ou prochain bloc pixels
                for (let j = i + 1; j < lines.length; j++) {
                    const nxt = lines[j];
                    const nxtLower = nxt.toLowerCase();
                    if (!nxt || nxtLower.startsWith('global vision:') || nxtLower.startsWith('interesting neighbors:') || nxtLower.startsWith('my intention:') || nxtLower.includes('pixels:')) {
                        break;
                    }
                    if (collected) collected += ' ';
                    collected += nxt;
                }
                if (collected) pixelBlocks.push(collected.trim());
            }
        }
        
        // Recherche alternative pour les questions Q1-Q5 si elles n'ont pas été trouvées
        if (!q1ImagesReceived || !q2GridLocation || !q3GlobalVision || !q4InterestingNeighbors || !q5MyIntention) {
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
                    /\*\*Q5:\*\*[^]*?(?=pixels:|$)/i,
                    /Q5:[^]*?(?=pixels:|$)/i,
                    /## Step 5: My intention[^]*?(?=## Step 6:|Step 6:|pixels:|$)/i,
                    /Step 5: My intention[^]*?(?=Step 6:|pixels:|$)/i
                ];
                for (const pattern of q5Patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const content = match[0].replace(/\*\*Q5:\*\*|Q5:|## Step 5: My intention|Step 5: My intention/i, '').trim();
                        // Nettoyer les questions restantes
                        q5MyIntention = content.replace(/My intention: \(describe precisely the shape and colors you want your bot to draw[^]*?\)[\*\*]*/i, '').trim();
                        break;
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
                
                // Recherche plus permissive pour "pixels:" suivi de pixels sur les lignes suivantes
                const pixelsMatch = cleaned.match(/pixels:\s*\n?([^.]*?)(?=Q1:|Q2:|Q3:|Q4:|Q5:|$)/);
                if (pixelsMatch) {
                    // Nettoyer les caractères de continuation de ligne (\)
                    pixelsLine = pixelsMatch[1].replace(/\\\s*\n\s*/g, ' ').trim();
                } else {
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
                            pixelsLine = cleaned;
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
        const pixelPatternHex = /(\d+),\s*(\d+):?\s*#([0-9a-fA-F]{1,8})\b/g;
        while ((match = pixelPatternHex.exec(pixelsLine)) !== null) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            let hex = match[3];
            if (x < 0 || x >= 20 || y < 0 || y >= 20) continue;
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

        // Dédupliquer par coordonnée (dernier gagne)
        if (pixels.length > 1) {
            const coordToPixel = new Map();
            for (const p of pixels) coordToPixel.set(`${p.x},${p.y}`, p);
            const unique = [];
            coordToPixel.forEach(v => unique.push(v));
            pixels.length = 0;
            pixels.push(...unique);
        }
        
        console.log(`[LLaVA] Parsed: ${pixels.length} pixels`);
        console.log(`[LLaVA] Q1 Images received: "${q1ImagesReceived}"`);
        console.log(`[LLaVA] Q2 Grid location: "${q2GridLocation}"`);
        console.log(`[LLaVA] Q3 Global vision: "${q3GlobalVision}"`);
        console.log(`[LLaVA] Q4 Interesting neighbors: "${q4InterestingNeighbors}"`);
        console.log(`[LLaVA] Q5 My intention: "${q5MyIntention}"`);
        
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
            feedback: {
                q3GlobalVision,
                q4InterestingNeighbors,
                q5MyIntention
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
            q5_my_intention: 'Fallback: silence'
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
                    temperature: 0.35,
                    stream: false
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
            }
            
            const data = await response.json();
            console.log('[LLaVA] Réponse serveur:', data);
            
            const result = data.response || data.message || '';
            if (!result) {
                console.error('[LLaVA] Aucun texte dans la réponse:', data);
            } else {
                // LOG COMPLET pour debug des fallback
                console.log('[LLaVA] 📝 Réponse complète de LLaVA:');
                console.log(result);
                console.log('[LLaVA] 📊 Longueur:', result.length, 'caractères');
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

