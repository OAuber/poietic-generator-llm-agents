// Anthropic Claude Adapter
import { SpatialAnalysis } from '../spatial-analysis.js';

const AnthropicAdapter = {
    name: 'Anthropic Claude',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 8000,
    
    // Configuration par défaut
    config: {
        apiKey: '',
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000
    },

    // Construire le prompt pour l'analyse du manuel (1ère requête uniquement)
    buildManualAnalysisPrompt: (manualContent) => {
        return `Tu es un agent IA participant au Générateur Poïétique, un système de dessin collaboratif.

Voici le manuel pratique qui te guidera :

═══════════════════════════════════════════════════════════
${manualContent}
═══════════════════════════════════════════════════════════

🎯 TÂCHE : Analyse ce manuel et évalue son adéquation à tes capacités

Réponds en JSON avec cette structure :

{
  "manual_analysis": {
    "summary": "Résumé en 3-5 points clés du manuel",
    "suitability_score": 0.0-1.0,
    "strengths": ["Ce qui est clair et bien adapté", "..."],
    "weaknesses": ["Ce qui est difficile ou ambigu", "..."],
    "suggested_adaptations": ["Suggestion d'amélioration 1", "..."],
    "confidence_by_task": {
      "simple_shapes": 0.0-1.0,
      "letters": 0.0-1.0,
      "complex_scenes": 0.0-1.0,
      "color_nuances": 0.0-1.0,
      "coordination": 0.0-1.0
    }
  },
  "strategy": "Je vais commencer par dessiner...",
  "pixels": [
    {"x": 10, "y": 10, "color": "#FF0000"},
    ...
  ]
}

⚠️ IMPORTANT :
- Sois honnête sur tes limites
- Le résumé sera affiché dans le dashboard analytics
- Dessine quand même quelques pixels (20-50) pour te signaler
- RÉPONDS UNIQUEMENT EN JSON VALIDE`;
    },

    // Construire le prompt système
    buildSystemPrompt: (analysis, customPrompt, isFirstRequest, manualContent, iterationCount) => {
        // Construire la section des voisins
        let neighborsSection = '\n═══ VOISINS ADJACENTS ═══\n';
        const spatialNeighbors = analysis.spatialNeighbors || {};
        const dirOrder = ['W', 'E', 'N', 'S', 'NW', 'NE', 'SW', 'SE'];
        
        if (Object.keys(spatialNeighbors).length === 0) {
            neighborsSection += '\n⚠️ AUCUN VOISIN ADJACENT DÉTECTÉ\n';
            neighborsSection += 'Tu es seul pour le moment ou tes voisins ne se sont pas encore connectés.\n';
            neighborsSection += 'Dessine un motif initial en attendant que d\'autres IA se connectent.\n';
        } else {
            for (const dir of dirOrder) {
                if (spatialNeighbors[dir]) {
                    const n = spatialNeighbors[dir];
                    if (n.pixel_count <= 0) {
                        neighborsSection += `\n- ${dir}: ID=${n.user_id} | aucun pixel réel reçu (ignore pour imitation)\n`;
                        continue;
                    }
                    neighborsSection += `\n╔═══ VOISIN ${dir} ═══╗\n`;
                    neighborsSection += `║ ID: ${n.user_id} | ${n.pixel_count} pixels modifiés ║\n`;
                    neighborsSection += `║ Echo couleur: ${(n.echo_color * 100).toFixed(0)}% | Bord similaire: ${(n.border_similarity * 100).toFixed(0)}% ║\n`;
                    if (n.border_palette) {
                        neighborsSection += `║ Bord - moi: ${(n.border_palette.mine||[]).join(', ')} | lui: ${(n.border_palette.neighbor||[]).join(', ')} ║\n`;
                    }
                    if (n.border_runs && n.border_runs.neighbor && n.border_runs.neighbor.length > 0) {
                        const r = n.border_runs.neighbor[0]; // run le plus long
                        neighborsSection += `║ Run voisin dominant: ${r.color} [${r.start}-${r.end}] ║\n`;
                    }
                    if (n.my_edge) {
                        neighborsSection += `║ Bord local à utiliser: ${n.my_edge.axis}= ${n.my_edge.value} ║\n`;
                    }
                    neighborsSection += `╚════════════════════════════════════════════╝\n`;
                    neighborsSection += `GRILLE 20x20:\n[\n`;
                    for (let y = 0; y < Math.min(20, n.grid.length); y++) {
                        neighborsSection += `  ${JSON.stringify(n.grid[y].slice(0, 20))}`;
                        if (y < 19) neighborsSection += ',';
                        neighborsSection += '\n';
                    }
                    neighborsSection += ']\n';
                }
            }
        }
        
        // Déterminer si c'est la première itération
        const isFirstIteration = analysis.myPixelCount === 0;
        
        if (isFirstRequest && manualContent) {
            // PREMIÈRE REQUÊTE LLM: Manuel complet + contexte actuel
            return `${manualContent}

═══════════════════════════════════════════════════════════════
CONTEXTE ACTUEL - Itération ${iterationCount + 1}
═══════════════════════════════════════════════════════════════

${analysis.spatialMap || 'Position inconnue'}

MON ÉTAT: ${analysis.myPixelCount}/400 pixels

${neighborsSection}

${customPrompt ? `🎯 INSTRUCTION UTILISATEUR: ${customPrompt}` : ''}

⚠️ PREMIÈRE ITÉRATION: Utilise FORMAT B (grid 20×20) pour remplir ta zone entière (200-400 pixels).
Crée un motif distinctif. Évite le biais (0,0).

IMPORTANT - INCLURE VOS CALCULS (voir manuel section 2.1) :
Ajoute "hypotheses", "chosen_hypothesis", "reasoning" pour rendre ton raisonnement transparent.

RÉPONDS EN JSON: {"strategy": "...", "grid": [[...]], "hypotheses": [...], "chosen_hypothesis": "...", "reasoning": "..."}`;
            
        } else {
            // ITÉRATIONS SUIVANTES: Prompt court (le manuel est connu)
            return `POIETIC GENERATOR - Itération ${iterationCount + 1}

${analysis.spatialMap || 'Position inconnue'}

MON ÉTAT: ${analysis.myPixelCount}/400 pixels (${(analysis.myPixelCount/400*100).toFixed(1)}%)

${neighborsSection}

${customPrompt ? `🎯 INSTRUCTION: ${customPrompt}` : ''}

// FORMAT A - DELTA (recommandé)
{"strategy": "...", "pixels": [{"x":12,"y":7,"color":"#AABBCC"}]}

// FORMAT B - GRILLE 20×20 (première itération ou refonte)
{"strategy": "...", "grid": [["#RRGGBB",...], ...]}

RAPPELS (voir manuel) :
- ${isFirstIteration ? 'FORMAT B recommandé (première itération)' : 'FORMAT A recommandé (dialogue progressif)'}
- Mentionne voisins dans strategy
- Continuité bordure: utilise my_edge et border_runs
- Évite biais (0,0): choisis point justifié

⚠️ IMPORTANT - INCLURE VOS CALCULS (voir manuel section 2.1) :
- "hypotheses": [{"name":"...", "C_d_current":X, "C_d_anticipated":Y, "gain":Z, "i_confidence":0.X, "h_pixels":N, "score":S}, ...]
- "chosen_hypothesis": "nom_choisi"
- "reasoning": "justification du choix"
- Champs optionnels: agent_needs, agent_suggestions

RÉPONDS EN JSON VALIDE.`;
        }
    },

    // Appel API
    async callAPI(apiKey, systemPrompt) {
        // Détection automatique de l'environnement
        const AI_SERVER_URL = window.location.hostname === 'localhost' 
            ? 'http://localhost:8003'
            : 'https://ai.poietic-generator.net';
        
        const url = `${AI_SERVER_URL}/api/llm/anthropic`;
        
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    model: this.model,
                    max_tokens: this.maxTokens,
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });
        } catch (fetchError) {
            throw new Error(`Impossible de contacter le serveur AI (${url}): ${fetchError.message}. Vérifiez que poietic_ai_server.py est démarré sur le port 8003.`);
        }

        if (!response.ok) {
            let msg = `Erreur API: ${response.status}`;
            
            // Cas spécial 401 : clé API invalide
            if (response.status === 401) {
                msg = 'Clé API Anthropic invalide ou manquante. Vérifiez votre clé dans les paramètres.';
                throw new Error(msg);
            }
            
            try {
                const ct = response.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const errorData = await response.json();
                    if (response.status === 429) {
                        msg = errorData.error || errorData.message || 'Rate limit Anthropic (429)';
                    } else {
                        msg = errorData.error || errorData.message || msg;
                    }
                } else {
                    const text = await response.text();
                    msg = text || msg;
                }
            } catch (ex) {
                // lecture du corps impossible
            }
            throw new Error(msg);
        }

        const data = await response.json();
        return {
            content: (data && Array.isArray(data.content) && data.content[0] && data.content[0].text) ? data.content[0].text : '',
            usage: data.usage || {}
        };
    },

    // Parser la réponse JSON
    parseResponse(content) {
        // Sanitisation du JSON
        const sanitizeClaudeContentText = (raw) => {
            let text = (raw || '').trim();
            if (text.startsWith('```')) {
                if (text.startsWith('```json')) text = text.slice(7);
                text = text.replace(/^```|```$/g, '').trim();
            }
            // Étendre les constructions JS non-JSON courantes (Array(n).fill(...)) jusqu'à disparition
            const expandArrayFillOnce = (str) => {
                try {
                    return str.replace(/Array\(\s*(\d+)\s*\)\.fill\(\s*(["'])((?:#)?[0-9A-Fa-f]{6})\2\s*\)/g, (_m, n, _q, val) => {
                        const count = Math.max(0, Math.min(1000, parseInt(n, 10) || 0));
                        const items = new Array(count).fill(`"${val}"`).join(',');
                        return `[${items}]`;
                    });
                } catch (_) { return str; }
            };
            let prev;
            do {
                prev = text;
                text = expandArrayFillOnce(text);
            } while (text !== prev);
            return text;
        };

        let jsonStr = sanitizeClaudeContentText(content);

        // Sanitation supplémentaire: retirer //commentaires, virgules trainantes, équilibrer { }
        const stripLineComments = (s) => s.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
        const closeTrailingCommas = (s) => s.replace(/,\s*(\}|\])/g, '$1');
        const ensureBalanced = (s) => {
            const i = s.indexOf('{');
            const j = s.lastIndexOf('}');
            if (i !== -1 && j !== -1 && j > i) return s.slice(i, j + 1);
            return s;
        };

        let s = jsonStr;
        s = stripLineComments(s);
        s = closeTrailingCommas(s);
        s = ensureBalanced(s);
        
        // Ajouter des guillemets aux clés non-quotées (ex: {strategy: "..."} → {"strategy": "..."})
        s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        return JSON.parse(s);
    }
};

// Export pour utilisation dans d'autres modules
export { AnthropicAdapter };
