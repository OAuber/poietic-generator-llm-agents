// Ollama Adapter (Qwen2 0.5B on OVH AI Deploy)
import { SpatialAnalysis } from '../spatial-analysis.js';

const OllamaAdapter = {
    name: 'Ollama Llama3.2 3B',
    model: 'llama3.2:3b',  // Modèle plus léger et plus rapide
    maxTokens: 1000,  // Limité pour éviter les timeouts (20-25 pixels par itération)
    
    // Configuration par défaut
    config: {
        model: 'llama3.2:3b',
        max_tokens: 1000
    },
    
    // Palette de couleurs unique à cet agent (générée à la première utilisation)
    agentColorPalette: null,
    
    // Générer une palette de 8 couleurs avec technique artistique
    generateColorPalette: () => {
        const techniques = [
            {
                name: 'Monochromatique (ombres/lumières)',
                description: 'Dégradés d\'une couleur: ombres foncées → lumières claires',
                generate: () => {
                    const hue = Math.random() * 360;
                    return [
                        OllamaAdapter.hslToHex(hue, 70, 25),  // Ombre profonde
                        OllamaAdapter.hslToHex(hue, 65, 35),  // Ombre moyenne
                        OllamaAdapter.hslToHex(hue, 60, 45),  // Base
                        OllamaAdapter.hslToHex(hue, 55, 55),  // Lumière moyenne
                        OllamaAdapter.hslToHex(hue, 50, 65),  // Lumière claire
                        OllamaAdapter.hslToHex(hue, 40, 75),  // Highlight
                        OllamaAdapter.hslToHex(hue, 30, 85),  // Highlight fort
                        OllamaAdapter.hslToHex(hue, 20, 95)   // Presque blanc
                    ];
                }
            },
            {
                name: 'Complémentaires (contraste)',
                description: 'Deux couleurs opposées: contrastes forts',
                generate: () => {
                    const hue1 = Math.random() * 360;
                    const hue2 = (hue1 + 180) % 360;  // Opposé sur le cercle
                    return [
                        OllamaAdapter.hslToHex(hue1, 75, 30),  // Couleur 1 foncée
                        OllamaAdapter.hslToHex(hue1, 70, 50),  // Couleur 1 moyenne
                        OllamaAdapter.hslToHex(hue1, 60, 65),  // Couleur 1 claire
                        OllamaAdapter.hslToHex(hue1, 50, 80),  // Couleur 1 très claire
                        OllamaAdapter.hslToHex(hue2, 75, 30),  // Couleur 2 foncée
                        OllamaAdapter.hslToHex(hue2, 70, 50),  // Couleur 2 moyenne
                        OllamaAdapter.hslToHex(hue2, 60, 65),  // Couleur 2 claire
                        OllamaAdapter.hslToHex(hue2, 50, 80)   // Couleur 2 très claire
                    ];
                }
            },
            {
                name: 'Triade (équilibre)',
                description: '3 couleurs espacées: harmonie équilibrée',
                generate: () => {
                    const hue1 = Math.random() * 360;
                    const hue2 = (hue1 + 120) % 360;
                    const hue3 = (hue1 + 240) % 360;
                    return [
                        OllamaAdapter.hslToHex(hue1, 70, 35),
                        OllamaAdapter.hslToHex(hue1, 60, 55),
                        OllamaAdapter.hslToHex(hue1, 50, 75),
                        OllamaAdapter.hslToHex(hue2, 70, 35),
                        OllamaAdapter.hslToHex(hue2, 60, 55),
                        OllamaAdapter.hslToHex(hue3, 70, 35),
                        OllamaAdapter.hslToHex(hue3, 60, 55),
                        OllamaAdapter.hslToHex(hue3, 50, 75)
                    ];
                }
            },
            {
                name: 'Analogues (douceur)',
                description: 'Couleurs voisines: transitions douces',
                generate: () => {
                    const hueBase = Math.random() * 360;
                    return [
                        OllamaAdapter.hslToHex((hueBase - 30) % 360, 65, 40),
                        OllamaAdapter.hslToHex((hueBase - 15) % 360, 60, 50),
                        OllamaAdapter.hslToHex(hueBase, 70, 45),
                        OllamaAdapter.hslToHex(hueBase, 60, 60),
                        OllamaAdapter.hslToHex((hueBase + 15) % 360, 60, 50),
                        OllamaAdapter.hslToHex((hueBase + 30) % 360, 65, 40),
                        OllamaAdapter.hslToHex((hueBase + 45) % 360, 55, 65),
                        OllamaAdapter.hslToHex((hueBase + 60) % 360, 50, 75)
                    ];
                }
            },
            {
                name: 'Chaud→Froid (profondeur)',
                description: 'Chaud (avant) → Froid (arrière-plan)',
                generate: () => {
                    return [
                        OllamaAdapter.hslToHex(15, 80, 35),   // Rouge-orange foncé
                        OllamaAdapter.hslToHex(25, 75, 50),   // Orange
                        OllamaAdapter.hslToHex(40, 70, 60),   // Jaune-orange
                        OllamaAdapter.hslToHex(55, 65, 70),   // Jaune clair
                        OllamaAdapter.hslToHex(180, 50, 60),  // Cyan (transition)
                        OllamaAdapter.hslToHex(210, 60, 50),  // Bleu
                        OllamaAdapter.hslToHex(230, 65, 40),  // Bleu foncé
                        OllamaAdapter.hslToHex(250, 55, 30)   // Bleu-violet profond
                    ];
                }
            }
        ];
        
        // Choisir une technique aléatoire
        const technique = techniques[Math.floor(Math.random() * techniques.length)];
        const palette = technique.generate();
        
        console.log(`🎨 [Palette] Technique: "${technique.name}" - ${technique.description}`);
        
        return { colors: palette, technique: technique };
    },
    
    // Conversion HSL vers Hex (helper simplifié)
    hslToHex: (h, s, l) => {
        const rgb = OllamaAdapter.hslToRgb(h, s, l);
        return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`.toUpperCase();
    },
    
    // Conversion HSL vers RGB
    hslToRgb: (h, s, l) => {
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    },

    // Construire le prompt pour l'analyse du manuel (1ère requête, VERSION ULTRA-SIMPLIFIÉE)
    buildManualAnalysisPrompt: (manualContent) => {
        // Exemples concrets variés (pas de manuel complexe)
        const exemples = [
            {
                forme: "cercle vert",
                pixels: "8,5:#2ECC71 9,5:#2ECC71 7,6:#2ECC71 10,6:#2ECC71 6,7:#2ECC71 11,7:#2ECC71 6,8:#2ECC71 11,8:#2ECC71 7,9:#2ECC71 10,9:#2ECC71 8,10:#2ECC71 9,10:#2ECC71 8,6:#58D68D 9,6:#58D68D 8,7:#58D68D 9,7:#58D68D 8,8:#58D68D 9,8:#58D68D 8,9:#58D68D 9,9:#58D68D"
            },
            {
                forme: "croix rouge",
                pixels: "8,2:#E74C3C 8,3:#E74C3C 8,4:#E74C3C 8,5:#E74C3C 8,6:#E74C3C 2,5:#E74C3C 3,5:#E74C3C 4,5:#E74C3C 5,5:#E74C3C 6,5:#E74C3C 9,5:#E74C3C 10,5:#E74C3C 11,5:#E74C3C 7,5:#C85A3F 9,4:#C85A3F 7,6:#C85A3F 9,6:#C85A3F"
            },
            {
                forme: "lettre H bleue",
                pixels: "5,3:#3498DB 5,4:#3498DB 5,5:#3498DB 5,6:#3498DB 5,7:#3498DB 6,5:#5DADE2 7,5:#5DADE2 8,5:#5DADE2 9,3:#3498DB 9,4:#3498DB 9,5:#3498DB 9,6:#3498DB 9,7:#3498DB 6,6:#5DADE2 7,6:#5DADE2 8,6:#5DADE2"
            },
            {
                forme: "triangle orange",
                pixels: "8,3:#F39C12 7,4:#F39C12 8,4:#F39C12 9,4:#F39C12 6,5:#F39C12 7,5:#F39C12 8,5:#F39C12 9,5:#F39C12 10,5:#F39C12 5,6:#E67E22 6,6:#E67E22 7,6:#E67E22 8,6:#E67E22 9,6:#E67E22 10,6:#E67E22 11,6:#E67E22"
            },
            {
                forme: "damier violet",
                pixels: "5,5:#9B59B6 7,5:#9B59B6 9,5:#9B59B6 11,5:#9B59B6 6,6:#E91E63 8,6:#E91E63 10,6:#E91E63 12,6:#E91E63 5,7:#9B59B6 7,7:#9B59B6 9,7:#9B59B6 11,7:#9B59B6 6,8:#E91E63 8,8:#E91E63 10,8:#E91E63"
            }
        ];
        
        const exemple = exemples[Math.floor(Math.random() * exemples.length)];
        
        return `DESSINE 25 pixels. Format: x,y:#RRGGBB (espaces entre pixels)

EXEMPLE:
strategy: ${exemple.forme}
pixels: ${exemple.pixels}

TOI - COPIE CE FORMAT (pas de texte, juste strategy + pixels):
strategy:`;
    },

    // Calculer des transformations géométriques (miroir, translation, rotation)
    computeTransformations: (pixels, direction) => {
        if (!pixels || pixels.length === 0) return [];
        
        const transformations = [];
        
        // STRATÉGIE POROSITÉ: Prendre seulement 2-4 pixels CLÉS du voisin,
        // pas toute la bordure, pour créer une connexion subtile
        
        // DEBUG: Log les coordonnées des pixels reçus
        const pixelCoords = pixels.map(p => `(${p.x},${p.y})`).slice(0, 5).join(' ');
        
        // Filtrer les pixels qui sont vraiment AUX BORDURES du voisin
        let borderPixels = [];
        
        if (direction === 'W') {
            // Voisin à l'OUEST → prendre ses pixels à x >= 17 (sa bordure droite qui touche ma gauche)
            borderPixels = pixels.filter(p => p.x >= 17);
            console.log(`[Transform] ${direction}: ${pixels.length} pixels → ${borderPixels.length} aux bordures (x>=17). Sample: ${pixelCoords}`);
            if (borderPixels.length > 0) {
                // Prendre 2-3 pixels aléatoires (ou les plus intéressants)
                const sample = borderPixels.slice(0, 3);
                const prolongement = sample.map(p => ({
                    x: p.x - 17,  // x=17→0, x=18→1, x=19→2
                    y: p.y,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Quelques pixels du voisin W', pixels: prolongement });
                }
            }
        } else if (direction === 'E') {
            // Voisin à l'EST → prendre ses pixels à x <= 2 (sa bordure gauche qui touche ma droite)
            borderPixels = pixels.filter(p => p.x <= 2);
            console.log(`[Transform] ${direction}: ${pixels.length} pixels → ${borderPixels.length} aux bordures (x<=2). Sample: ${pixelCoords}`);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 3);
                const prolongement = sample.map(p => ({
                    x: p.x + 17,  // x=0→17, x=1→18, x=2→19
                    y: p.y,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Quelques pixels du voisin E', pixels: prolongement });
                }
            }
        } else if (direction === 'N') {
            // Voisin au NORD → prendre ses pixels à y >= 17 (sa bordure basse qui touche mon haut)
            borderPixels = pixels.filter(p => p.y >= 17);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 3);
                const prolongement = sample.map(p => ({
                    x: p.x,
                    y: p.y - 17,  // y=17→0, y=18→1, y=19→2
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Quelques pixels du voisin N', pixels: prolongement });
                }
            }
        } else if (direction === 'S') {
            // Voisin au SUD → prendre ses pixels à y <= 2 (sa bordure haute qui touche mon bas)
            borderPixels = pixels.filter(p => p.y <= 2);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 3);
                const prolongement = sample.map(p => ({
                    x: p.x,
                    y: p.y + 17,  // y=0→17, y=1→18, y=2→19
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Quelques pixels du voisin S', pixels: prolongement });
                }
            }
        } else if (direction === 'NW') {
            // Voisin NORD-OUEST → prendre coins (x>=17 ET y>=17)
            borderPixels = pixels.filter(p => p.x >= 17 && p.y >= 17);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 2);
                const prolongement = sample.map(p => ({
                    x: p.x - 17,
                    y: p.y - 17,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Coin du voisin NW', pixels: prolongement });
                }
            }
        } else if (direction === 'NE') {
            // Voisin NORD-EST → prendre coins (x<=2 ET y>=17)
            borderPixels = pixels.filter(p => p.x <= 2 && p.y >= 17);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 2);
                const prolongement = sample.map(p => ({
                    x: p.x + 17,
                    y: p.y - 17,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Coin du voisin NE', pixels: prolongement });
                }
            }
        } else if (direction === 'SW') {
            // Voisin SUD-OUEST → prendre coins (x>=17 ET y<=2)
            borderPixels = pixels.filter(p => p.x >= 17 && p.y <= 2);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 2);
                const prolongement = sample.map(p => ({
                    x: p.x - 17,
                    y: p.y + 17,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Coin du voisin SW', pixels: prolongement });
                }
            }
        } else if (direction === 'SE') {
            // Voisin SUD-EST → prendre coins (x<=2 ET y<=2)
            borderPixels = pixels.filter(p => p.x <= 2 && p.y <= 2);
            if (borderPixels.length > 0) {
                const sample = borderPixels.slice(0, 2);
                const prolongement = sample.map(p => ({
                    x: p.x + 17,
                    y: p.y + 17,
                    color: p.color
                })).filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
                
                if (prolongement.length > 0) {
                    transformations.push({ type: 'Coin du voisin SE', pixels: prolongement });
                }
            }
        }
        
        return transformations;
    },

    // Construire le prompt système (VERSION COMPACTE pour Ollama - limite 4096 tokens)
    buildSystemPrompt: (analysis, customPrompt, isFirstRequest, manualContent, iterationCount, myLastStrategy) => {
        // Construire info voisins de manière ultra-compacte avec hints spatiaux
        let voisinsCompact = '';
        const spatialNeighbors = analysis.spatialNeighbors || {};
        
        // Hints de connexion spatiale (où regarder dans ma grille)
        const spatialHints = {
            'N': 'y=0',      // Voisin Nord touche mon y=0
            'S': 'y=19',     // Voisin Sud touche mon y=19
            'E': 'x=19',     // Voisin Est touche mon x=19
            'W': 'x=0',      // Voisin Ouest touche mon x=0
            'NE': 'x=19,y=0',
            'NW': 'x=0,y=0',
            'SE': 'x=19,y=19',
            'SW': 'x=0,y=19'
        };
        
        if (Object.keys(spatialNeighbors).length > 0) {
            const voisinsList = [];
            const suggestions = [];
            
            console.log('[Collaboration] spatialNeighbors:', Object.keys(spatialNeighbors).map(dir => 
                `${dir}: ${spatialNeighbors[dir].pixel_count}px, ${spatialNeighbors[dir].recent_updates?.length || 0} updates`
            ).join(', '));
            
            for (const [dir, n] of Object.entries(spatialNeighbors)) {
                if (n.pixel_count > 0 && n.recent_updates && n.recent_updates.length > 0) {
                    // STRATÉGIE: Prioriser les pixels AUX BORDURES pour la collaboration
                    // 1. Filtrer d'abord pour les bordures selon la direction
                    let borderFilter = (u) => true; // Par défaut, tous les pixels
                    if (dir === 'W') borderFilter = (u) => u.x >= 17;
                    else if (dir === 'E') borderFilter = (u) => u.x <= 2;
                    else if (dir === 'N') borderFilter = (u) => u.y >= 17;
                    else if (dir === 'S') borderFilter = (u) => u.y <= 2;
                    else if (dir === 'NW') borderFilter = (u) => u.x >= 17 && u.y >= 17;
                    else if (dir === 'NE') borderFilter = (u) => u.x <= 2 && u.y >= 17;
                    else if (dir === 'SW') borderFilter = (u) => u.x >= 17 && u.y <= 2;
                    else if (dir === 'SE') borderFilter = (u) => u.x <= 2 && u.y <= 2;
                    
                    // 2. Séparer pixels aux bordures et pixels centraux
                    const borderPixels = [];
                    const centralPixels = [];
                    const seen = new Set();
                    
                    for (const u of n.recent_updates) {
                        const key = `${u.x},${u.y}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            if (borderFilter(u)) {
                                borderPixels.push(u);
                            } else {
                                centralPixels.push(u);
                            }
                        }
                    }
                    
                    // 3. PRIORISER les bordures: prendre 12 bordures + 4 centraux (2 itérations)
                    // Objectif: garder l'historique des 2 dernières itérations (~20 pixels chacune)
                    const updates = [
                        ...borderPixels.slice(0, 12),  // Prioriser bordures
                        ...centralPixels.slice(0, 4)    // Contexte général
                    ].slice(0, 16);  // Max 16 pixels (au lieu de 8)
                    
                    console.log(`[Priorisation] ${dir}: ${borderPixels.length} bordures, ${centralPixels.length} centraux → ${updates.length} envoyés (2 itérations)`);
                    const updateStr = updates.map(u => `${u.x},${u.y}:${u.color}`).join(' ');
                    const hint = spatialHints[dir] || '';
                    
                    // Analyser les couleurs dominantes
                    const colorCounts = {};
                    updates.forEach(u => {
                        colorCounts[u.color] = (colorCounts[u.color] || 0) + 1;
                    });
                    const dominantColor = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a])[0];
                    
                    // Le voisin a des pixels aux bordures si on a trouvé des borderPixels
                    const atBorder = borderPixels.length > 0;
                    const borderHint = atBorder ? ` 🔗BORDURE(${borderPixels.length})` : '';
                    
                    // Info voisin
                    let info = `${dir} (touche ${hint})${borderHint}: ${updateStr}`;
                    if (n.last_strategy) {
                        info += ` → "${n.last_strategy.substring(0, 30)}"`;
                    }
                    voisinsList.push(info);
                    
                    // NOUVEAU: Calculer des transformations géométriques possibles
                    const transformed = OllamaAdapter.computeTransformations(updates, dir);
                    if (transformed.length > 0) {
                        suggestions.push({
                            dir: dir,
                            original: updates,
                            transformed: transformed,
                            atBorder: atBorder  // Marquer si c'est une opportunité de bordure
                        });
                    }
                }
            }
            
            if (voisinsList.length > 0) {
                voisinsCompact = 'Voisins:\n' + voisinsList.slice(0, 3).join('\n');
                
                console.log(`[Collaboration] Itération ${iterationCount} - ${voisinsList.length} voisin(s) détecté(s)`);
                
                // Ajouter des exemples de transformations NUMÉROTÉES (MAX 3 OPTIONS)
                if (suggestions.length > 0) {
                    // PRIORISER les suggestions aux bordures
                    const borderSuggestions = suggestions.filter(s => s.atBorder && s.transformed.length > 0);
                    const otherSuggestions = suggestions.filter(s => !s.atBorder && s.transformed.length > 0);
                    const prioritized = [...borderSuggestions, ...otherSuggestions];
                    
                    if (prioritized.length > 0) {
                        voisinsCompact += '\n\nIdées collaboration (choisis-en UNE ou dessine librement):';
                        let optionNum = 1;
                        
                        // Limiter à 3 options MAXIMUM pour garder de la place aux exemples de formes
                        const maxOptions = 3;
                        for (const sugg of prioritized) {
                            if (optionNum > maxOptions) break;
                            
                            const borderTag = sugg.atBorder ? ' 🔗' : '';
                            // Prendre seulement la PREMIÈRE transformation (la plus pertinente)
                            const ex = sugg.transformed[0];
                            const pixelsStr = ex.pixels.slice(0, 6).map(p => `${p.x},${p.y}:${p.color}`).join(' ');
                            voisinsCompact += `\n[${optionNum}]${borderTag} ${ex.type} du ${sugg.dir}: ${pixelsStr}`;
                            optionNum++;
                        }
                        
                        const borderCount = borderSuggestions.length;
                        console.log(`🤝 [Collaboration] ${optionNum-1} suggestions (${borderCount} aux bordures):`, 
                            prioritized.slice(0, maxOptions).map(s => {
                                const ex = s.transformed[0];
                                const pixels = ex.pixels.map(p => `${p.x},${p.y}`).join(' ');
                                return `${s.dir}${s.atBorder ? '🔗' : ''}: ${ex.type} → ${pixels}`;
                            }).join(' | '));
                    } else {
                        console.log('ℹ️ [Collaboration] Aucune transformation (voisins ne dessinent pas aux bordures communes)');
                    }
                } else {
                    console.log('ℹ️ [Collaboration] Voisins sans updates récents');
                }
            } else {
                console.log('🚫 [Collaboration] Aucun voisin détecté');
            }
        }
        
        // Exemples de formes avec leurs pixels (rotation) - VARIÉTÉ MAXIMALE
        const formeExemples = [
            { nom: "spirale turquoise", pixels: "8,8:#1ABC9C 9,8:#1ABC9C 10,8:#1ABC9C 10,9:#48C9B0 10,10:#48C9B0 9,10:#48C9B0 8,10:#48C9B0 7,10:#17A589 7,9:#17A589 7,8:#17A589 7,7:#17A589 8,7:#1ABC9C 9,7:#1ABC9C 10,7:#1ABC9C 11,7:#1ABC9C 11,8:#48C9B0 11,9:#48C9B0 11,10:#48C9B0" },
            { nom: "vagues bleues", pixels: "3,8:#3498DB 4,7:#5DADE2 5,6:#3498DB 6,7:#5DADE2 7,8:#3498DB 8,7:#5DADE2 9,6:#3498DB 10,7:#5DADE2 11,8:#3498DB 12,7:#5DADE2 13,6:#3498DB 14,7:#5DADE2 15,8:#3498DB 4,9:#2874A6 6,9:#2874A6 8,9:#2874A6 10,9:#2874A6 12,9:#2874A6 14,9:#2874A6" },
            { nom: "étoile jaune", pixels: "8,3:#F39C12 7,4:#E67E22 8,4:#F39C12 9,4:#E67E22 6,5:#D68910 7,5:#E67E22 8,5:#F39C12 9,5:#E67E22 10,5:#D68910 5,6:#E67E22 6,6:#F39C12 7,6:#F39C12 8,6:#F39C12 9,6:#F39C12 10,6:#F39C12 11,6:#E67E22 7,7:#D68910 9,7:#D68910" },
            { nom: "arc-en-ciel", pixels: "5,10:#E74C3C 6,10:#E74C3C 7,10:#F39C12 8,10:#F39C12 9,10:#2ECC71 10,10:#2ECC71 11,10:#3498DB 12,10:#3498DB 13,10:#9B59B6 14,10:#9B59B6 5,11:#C85A3F 6,11:#C85A3F 7,11:#E67E22 8,11:#E67E22 9,11:#58D68D 10,11:#58D68D 11,11:#5DADE2 12,11:#5DADE2 13,11:#AF7AC5 14,11:#AF7AC5" },
            { nom: "zigzag rose", pixels: "3,3:#E91E63 4,4:#F06292 5,5:#E91E63 6,6:#F06292 7,7:#E91E63 8,8:#F06292 9,9:#E91E63 10,10:#F06292 11,11:#E91E63 4,3:#F06292 5,4:#F06292 6,5:#F06292 7,6:#F06292 8,7:#F06292 9,8:#F06292 10,9:#F06292 11,10:#F06292" },
            { nom: "coeur rouge", pixels: "6,5:#E74C3C 7,5:#E74C3C 9,5:#E74C3C 10,5:#E74C3C 5,6:#E74C3C 6,6:#C85A3F 7,6:#C85A3F 8,6:#E74C3C 9,6:#C85A3F 10,6:#C85A3F 11,6:#E74C3C 5,7:#E74C3C 6,7:#C85A3F 7,7:#C85A3F 8,7:#C85A3F 9,7:#C85A3F 10,7:#C85A3F 11,7:#E74C3C 6,8:#E74C3C 7,8:#C85A3F 8,8:#C85A3F 9,8:#C85A3F 10,8:#E74C3C" },
            { nom: "losange vert", pixels: "8,3:#2ECC71 7,4:#2ECC71 8,4:#58D68D 9,4:#2ECC71 6,5:#2ECC71 7,5:#58D68D 8,5:#58D68D 9,5:#58D68D 10,5:#2ECC71 5,6:#2ECC71 6,6:#58D68D 7,6:#58D68D 8,6:#58D68D 9,6:#58D68D 10,6:#58D68D 11,6:#2ECC71 6,7:#2ECC71 7,7:#58D68D 8,7:#58D68D 9,7:#58D68D 10,7:#2ECC71" }
        ];
        
        const exempleIdx = iterationCount % formeExemples.length;
        const exemple = formeExemples[exempleIdx];
        
        // Générer une palette de couleurs unique pour cet agent (à la première utilisation)
        if (!OllamaAdapter.agentColorPalette) {
            OllamaAdapter.agentColorPalette = OllamaAdapter.generateColorPalette();
            console.log('🎨 [Palette] Couleurs:', OllamaAdapter.agentColorPalette.colors.join(', '));
        }
        
        // Adapter le prompt selon la présence de suggestions de collaboration
        const hasCollabIdeas = voisinsCompact && voisinsCompact.includes('Idées collaboration');
        
        // Intégrer le prompt personnalisé de l'utilisateur
        const userCustomPrompt = customPrompt && customPrompt.trim().length > 0 
            ? `\nCONSIGNE UTILISATEUR: ${customPrompt}\n` 
            : '';
        
        if (customPrompt && customPrompt.trim().length > 0) {
            console.log(`📝 [Prompt] Utilisateur: "${customPrompt}"`);
        }
        
        // Suggestion de palette avec instructions artistiques (sauf si voisins copiés)
        const paletteSuggestion = !hasCollabIdeas 
            ? `Colors (${OllamaAdapter.agentColorPalette.technique.name}): ${OllamaAdapter.agentColorPalette.colors.join(' ')}
Use: dark for shadows/depth, light for highlights/foreground.\n`
            : '';
        
        // Rappel de la stratégie précédente pour maintenir la cohérence
        const lastStrategyReminder = myLastStrategy && iterationCount > 1
            ? `Last iteration: "${myLastStrategy}". CONTINUE it OR start new.\n`
            : '';
        
        if (myLastStrategy && iterationCount > 1) {
            console.log(`🔁 [Continuité] Rappel stratégie précédente: "${myLastStrategy}"`);
        }
        
        let prompt;
        if (hasCollabIdeas) {
            // PROMPT COLLABORATIF (avec voisins et suggestions)
            // NOTE: Ultra-strict pour éviter le bavardage
            prompt = `20x20 grid. x,y: 0-19 (NEVER 20). NO EXPLANATION. JUST 2 LINES.
${userCustomPrompt}${lastStrategyReminder}${voisinsCompact}

EXAMPLE:
strategy: ${exemple.nom}
pixels: ${exemple.pixels}

YOU (2 lines ONLY):
strategy:`;
        } else {
            // PROMPT LIBRE (sans voisins)
            prompt = `20x20 grid. Draw 20-25 pixels. x,y: 0-19 (NEVER 20). NO EXPLANATION.
${userCustomPrompt}${lastStrategyReminder}${paletteSuggestion}
EXAMPLE:
strategy: ${exemple.nom}
pixels: ${exemple.pixels}

YOU (2 lines ONLY):
strategy:`;
        }

        // Log le prompt complet si des suggestions de collaboration existent
        if (hasCollabIdeas) {
            console.log('📋 [Collaboration] Prompt envoyé au LLM:', prompt.substring(0, 800) + '...');
        }

        return prompt;
    },

    // Appeler l'API via le proxy
    async callAPI(apiKey, systemPrompt) {
        // Détection automatique de l'environnement
        const AI_SERVER_URL = window.location.hostname === 'localhost' 
            ? 'http://localhost:8003'
            : 'https://ai.poietic-generator.net';
        
        const response = await fetch(`${AI_SERVER_URL}/api/llm/ollama`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: this.maxTokens  // Limite de tokens générés
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        // Convertir au format attendu par ai-player.js (comme Anthropic)
        return {
            content: data.response || '',
            usage: {}
        };
    },

    // Parser le format compact: "strategy: ... \n pixels: x,y:#color x,y:#color"
    parseCompactFormat(text) {
        try {
            // Nettoyer le texte d'abord (enlever markdown, etc.)
            let cleanText = text
                .replace(/\*\*/g, '')  // Enlever **gras**
                .replace(/\*/g, '')    // Enlever *italique*
                .replace(/```.*?\n/g, '') // Enlever ```
                .replace(/^[>\-\*\+]\s+/gm, ''); // Enlever listes markdown
            
            // Extraire la stratégie (chercher n'importe où dans le texte)
            const strategyMatch = cleanText.match(/strategy:\s*(.+?)(?=pixels:|$)/is);
            let strategy = strategyMatch ? strategyMatch[1].trim() : "dessin";
            
            // Nettoyer la stratégie (première ligne seulement, max 200 chars)
            strategy = strategy.split('\n')[0].substring(0, 200).trim();
            
            // Détecter si l'agent mentionne une option de collaboration
            const optionMatch = strategy.match(/\[(\d+)\]/);
            const collabKeywords = ['miroir', 'translation', 'rotation', 'prolonge', 'symétrie', 'complète', 'bordure'];
            const hasCollabKeyword = collabKeywords.some(kw => strategy.toLowerCase().includes(kw));
            
            // Détecter si l'agent continue sa stratégie précédente
            const continueKeywords = ['continue', 'termine', 'finit', 'complète', 'ajoute', 'étend'];
            const isContinuing = continueKeywords.some(kw => strategy.toLowerCase().includes(kw));
            
            if (optionMatch) {
                console.log(`✅ [Collaboration] Agent a choisi l'option [${optionMatch[1]}]: ${strategy}`);
            } else if (hasCollabKeyword) {
                console.log(`🎯 [Collaboration] Agent mentionne une transformation: ${strategy}`);
            } else if (isContinuing) {
                console.log(`🔁 [Continuité] Agent continue sa stratégie: ${strategy.substring(0, 60)}`);
            } else {
                console.log(`🎨 [Stratégie] Nouveau dessin: ${strategy.substring(0, 60)}`);
            }
            
            // Extraire les pixels (chercher n'importe où dans le texte)
            const pixelsMatch = cleanText.match(/pixels:\s*(.+?)$/is);
            
            let pixelsStr = '';
            if (pixelsMatch) {
                pixelsStr = pixelsMatch[1].trim();
            } else {
                // Si pas de "pixels:", chercher directement des patterns x,y:#color dans tout le texte
                console.warn('[Ollama] Pas de "pixels:" trouvé, recherche directe de patterns');
                pixelsStr = cleanText;
            }
            
            // Parser chaque pixel: "x,y:#color"
            // Pattern tolérant : accepte espaces, sauts de ligne, et ignore les chiffres parasites entre : et #
            // Exemples valides: "5,10:#3498DB" ou "5,10: 25,25: #3498DB" (ignore le 25,25)
            const pixelPattern = /(\d+)\s*,\s*(\d+)\s*:[^#]*?(#[0-9A-Fa-f]{6})/g;
            const pixels = [];
            let match;
            
            while ((match = pixelPattern.exec(pixelsStr)) !== null) {
                const x = parseInt(match[1]);
                const y = parseInt(match[2]);
                
                // Valider les coordonnées (0-19)
                if (x >= 0 && x < 20 && y >= 0 && y < 20) {
                    pixels.push({
                        x: x,
                        y: y,
                        color: match[3].toUpperCase()
                    });
                } else {
                    console.warn(`[Ollama] Pixel ignoré (hors grille): ${x},${y}`);
                }
            }
            
            if (pixels.length === 0) {
                console.warn('[Ollama] Aucun pixel trouvé, retour null pour fallback');
                console.warn('[Ollama] Texte analysé:', cleanText.substring(0, 500));
                return null;  // Permettre au fallback de générer des pixels par défaut
            }
            
            console.log(`[Ollama] Format compact parsé: ${pixels.length} pixels, stratégie: "${strategy}"`);
            
            return {
                strategy: strategy,
                pixels: pixels
            };
        } catch (e) {
            console.warn('[Ollama] Erreur de parsing format compact:', e.message);
            console.warn('[Ollama] Texte reçu (500 premiers chars):', text.substring(0, 500));
            return null;  // Permettre au fallback de générer des pixels par défaut
        }
    },

    // Parser la réponse (format compact OU JSON)
    parseResponse(content) {
        // Vérifier que content existe
        if (!content) {
            throw new Error('Réponse vide du serveur Ollama');
        }
        
        // content est maintenant directement le texte de réponse
        const responseText = content.trim();
        
        if (!responseText) {
            throw new Error('Réponse vide d\'Ollama - le modèle est peut-être en cours de chargement');
        }
        
        console.log('[Ollama] Réponse brute (100 premiers chars):', responseText.substring(0, 100));
        
        // Détecter si le LLM pose des questions ou refuse de dessiner
        const refusPatterns = [
            /puis-je/i,
            /pourrais-je/i,
            /comment puis-je/i,
            /je ne peux pas/i,
            /je ne suis pas capable/i,
            /désolé/i,
            /excusez-moi/i,
            /je suis prêt/i,
            /indiquez-moi/i,
            /s'il vous plaît/i,
            /pour commencer/i
        ];
        
        if (refusPatterns.some(pattern => pattern.test(responseText))) {
            console.warn('[Ollama] Le LLM refuse ou pose des questions, génération par défaut');
            // Générer une forme par défaut simple
            return {
                strategy: "forme par défaut",
                pixels: this.generateDefaultPixels()
            };
        }
        
        // PRIORITÉ AU FORMAT COMPACT
        // Chercher "strategy:" ou "pixels:" n'importe où dans la réponse
        if (responseText.includes('strategy:') || responseText.includes('pixels:')) {
            console.log('[Ollama] Format compact détecté');
            const result = this.parseCompactFormat(responseText);
            if (result) return result;
            // Si null, continuer vers le fallback
        }
        
        // Si commence par { ou contient "pixels":[, c'est du JSON
        if (responseText.trim().startsWith('{') || responseText.includes('"pixels":[')) {
            console.log('[Ollama] Format JSON détecté');
            try {
                return this.parseJSONFormat(responseText);
            } catch (e) {
                console.warn('[Ollama] Parsing JSON échoué:', e.message);
            }
        }
        
        // Par défaut, essayer le format compact (plus tolérant)
        console.log('[Ollama] Format indéterminé, essai format compact');
        const compactResult = this.parseCompactFormat(responseText);
        if (compactResult) return compactResult;
        
        // Dernier essai : JSON
        console.warn('[Ollama] Essai final: JSON');
        try {
            return this.parseJSONFormat(responseText);
        } catch (e) {
            console.warn('[Ollama] Tous les parsers ont échoué, génération par défaut');
            return {
                strategy: "forme par défaut (LLM bavard)",
                pixels: this.generateDefaultPixels()
            };
        }
    },
    
    // Générer des pixels par défaut si le parsing échoue
    generateDefaultPixels() {
        const pixels = [];
        const startX = Math.floor(Math.random() * 10) + 3;
        const startY = Math.floor(Math.random() * 10) + 3;
        const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E91E63', '#607D8B'];
        const color1 = colors[Math.floor(Math.random() * colors.length)];
        const color2 = colors[Math.floor(Math.random() * colors.length)];
        
        // Formes variées aléatoires
        const shapeType = Math.floor(Math.random() * 4);
        
        if (shapeType === 0) {
            // Cercle
            for (let angle = 0; angle < 20; angle++) {
                const rad = (angle / 20) * Math.PI * 2;
                const x = Math.round(startX + Math.cos(rad) * 3);
                const y = Math.round(startY + Math.sin(rad) * 3);
                if (x >= 0 && x < 20 && y >= 0 && y < 20) {
                    pixels.push({ x, y, color: angle < 10 ? color1 : color2 });
                }
            }
        } else if (shapeType === 1) {
            // Croix
            for (let i = -3; i <= 3; i++) {
                pixels.push({ x: startX + i, y: startY, color: color1 });
                pixels.push({ x: startX, y: startY + i, color: color2 });
            }
        } else if (shapeType === 2) {
            // Ligne diagonale avec épaisseur
            for (let i = 0; i < 8; i++) {
                pixels.push({ x: startX + i, y: startY + i, color: color1 });
                if (i % 2 === 0) {
                    pixels.push({ x: startX + i + 1, y: startY + i, color: color2 });
                }
            }
        } else {
            // Carré rempli avec dégradé
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 5; x++) {
                    const col = (x + y) % 2 === 0 ? color1 : color2;
                    pixels.push({ x: startX + x, y: startY + y, color: col });
                }
            }
        }
        
        return pixels.filter(p => p.x >= 0 && p.x < 20 && p.y >= 0 && p.y < 20);
    },
    
    // Parser le format JSON (ancien système)
    parseJSONFormat(responseText) {
        let jsonStr = responseText.trim();
        
        // Retirer les fences markdown si présentes
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        
        // NOUVEAU: Chercher agressivement le JSON même s'il y a du texte avant
        // Chercher le premier { qui commence un objet JSON valide
        let startIdx = -1;
        let endIdx = -1;
        
        // Essayer de trouver le début du JSON (chercher "strategy" ou "pixels" comme indicateurs)
        const jsonIndicators = ['"strategy"', '"pixels"', '"reasoning"'];
        for (const indicator of jsonIndicators) {
            const indicatorPos = jsonStr.indexOf(indicator);
            if (indicatorPos !== -1) {
                // Remonter jusqu'au { précédent
                for (let i = indicatorPos; i >= 0; i--) {
                    if (jsonStr[i] === '{') {
                        startIdx = i;
                        break;
                    }
                }
                if (startIdx !== -1) break;
            }
        }
        
        // Si pas trouvé avec les indicateurs, chercher le premier {
        if (startIdx === -1) {
            startIdx = jsonStr.indexOf('{');
        }
        
        // Extraire le bloc JSON complet
        if (startIdx !== -1) {
            let braceCount = 0;
            for (let i = startIdx; i < jsonStr.length; i++) {
                if (jsonStr[i] === '{') braceCount++;
                if (jsonStr[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endIdx = i;
                        break;
                    }
                }
            }
            
            if (endIdx !== -1) {
                jsonStr = jsonStr.substring(startIdx, endIdx + 1);
            }
        }
        
        // CORRECTIONS JSON AGRESSIVES
        
        // 1. Ajouter des guillemets aux clés non-quotées (bug fréquent des LLMs)
        jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        // 2. Corriger les virgules manquantes avant les accolades fermantes
        jsonStr = jsonStr.replace(/}\s*\n\s*{/g, '},\n{');
        jsonStr = jsonStr.replace(/}\s+{/g, '}, {');
        
        // 3. Corriger les virgules manquantes à la fin d'un objet avant ]
        jsonStr = jsonStr.replace(/}(\s*)\]/g, '}$1]');
        
        // 4. NOUVEAU: Corriger les chaînes non terminées (string unterminated)
        // Chercher les chaînes qui ne sont pas fermées correctement
        jsonStr = jsonStr.replace(/"([^"]*?)(?=\s*[,}\]])/g, '"$1"');
        
        // 5. NOUVEAU: Corriger les virgules manquantes après les valeurs
        jsonStr = jsonStr.replace(/"\s*\n\s*"/g, '",\n"');
        jsonStr = jsonStr.replace(/(\d+)\s*\n\s*"/g, '$1,\n"');
        jsonStr = jsonStr.replace(/"\s*\n\s*(\d+)/g, '",\n$1');
        
        // 6. NOUVEAU: Corriger les virgules manquantes avant les accolades fermantes
        jsonStr = jsonStr.replace(/([^,}\]])\s*}/g, '$1}');
        jsonStr = jsonStr.replace(/([^,}\]])\s*]/g, '$1]');
        
        // 7. NOUVEAU: Nettoyer les caractères de contrôle et espaces bizarres
        jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');
        jsonStr = jsonStr.replace(/\s+/g, ' ');
        
        // 8. NOUVEAU: Corriger les guillemets échappés mal formés
        jsonStr = jsonStr.replace(/\\"/g, '"');
        jsonStr = jsonStr.replace(/\\\\/g, '\\');
        
        // 9. NOUVEAU: S'assurer que le JSON commence et finit correctement
        if (!jsonStr.startsWith('{')) {
            const firstBrace = jsonStr.indexOf('{');
            if (firstBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace);
            }
        }
        
        // 10. NOUVEAU: Tronquer si trop long (éviter les réponses infinies)
        if (jsonStr.length > 50000) {
            console.warn('JSON trop long, tronqué à 50000 caractères');
            jsonStr = jsonStr.substring(0, 50000);
            // Essayer de fermer proprement
            const lastBrace = jsonStr.lastIndexOf('}');
            if (lastBrace !== -1) {
                jsonStr = jsonStr.substring(0, lastBrace + 1);
            }
        }
        
        try {
            const result = JSON.parse(jsonStr);
            
            // Validation basique du résultat
            if (!result.strategy || !Array.isArray(result.pixels)) {
                throw new Error('Structure JSON invalide: manque strategy ou pixels');
            }
            
            return result;
        } catch (e) {
            console.error('Erreur de parsing JSON:', e);
            console.error('JSON reçu (premiers 1000 chars):', jsonStr.substring(0, 1000));
            console.error('JSON reçu (derniers 1000 chars):', jsonStr.substring(Math.max(0, jsonStr.length - 1000)));
            console.error('Longueur totale:', jsonStr.length);
            
            // Essayer de trouver où est le problème
            const lines = jsonStr.split('\n');
            console.error(`Nombre de lignes: ${lines.length}`);
            
            // Afficher les lignes autour de l'erreur si possible
            if (e.message.includes('position')) {
                const match = e.message.match(/position (\d+)/);
                if (match) {
                    const pos = parseInt(match[1]);
                    const lineStart = jsonStr.lastIndexOf('\n', pos);
                    const lineEnd = jsonStr.indexOf('\n', pos);
                    const problemLine = jsonStr.substring(lineStart + 1, lineEnd === -1 ? jsonStr.length : lineEnd);
                    console.error('Ligne problématique:', problemLine);
                    console.error('Position dans la ligne:', pos - lineStart - 1);
                }
            }
            
            throw new Error(`JSON invalide: ${e.message}`);
        }
    }
};

export { OllamaAdapter };

