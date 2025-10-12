// OpenAI Adapter
// Interface similaire à AnthropicAdapter

const OpenAIAdapter = {
  name: 'OpenAI',
  model: 'gpt-4o-mini',
  maxTokens: 8000,

  // Construire le prompt pour l'analyse du manuel (1ère requête uniquement)
  buildManualAnalysisPrompt: (manualContent) => {
    return `You are an AI agent participating in the Poietic Generator, a collaborative drawing system.

Here is the practical manual that will guide you:

═══════════════════════════════════════════════════════════
${manualContent}
═══════════════════════════════════════════════════════════

🎯 TASK: Analyze this manual and evaluate its suitability for your capabilities

Respond in JSON with this structure:

{
  "manual_analysis": {
    "summary": "Summary in 3-5 key points",
    "suitability_score": 0.0-1.0,
    "strengths": ["What is clear and well-adapted", "..."],
    "weaknesses": ["What is difficult or ambiguous", "..."],
    "suggested_adaptations": ["Improvement suggestion 1", "..."],
    "confidence_by_task": {
      "simple_shapes": 0.0-1.0,
      "letters": 0.0-1.0,
      "complex_scenes": 0.0-1.0,
      "color_nuances": 0.0-1.0,
      "coordination": 0.0-1.0
    }
  },
  "strategy": "I will start by drawing...",
  "pixels": [
    {"x": 10, "y": 10, "color": "#FF0000"},
    ...
  ]
}

⚠️ IMPORTANT:
- Be honest about your limitations
- The summary will be displayed in the analytics dashboard
- Still draw some pixels (20-50) to signal your presence
- RESPOND ONLY IN VALID JSON`;
  },

  buildSystemPrompt: (analysis, customPrompt, isFirstRequest, manualContent, iterationCount) => {
    // Réutilise la même construction de prompt que l'adaptateur Anthropic (texte simple user)
    const neighbors = analysis.spatialNeighbors || {};
    const dirOrder = ['W','E','N','S','NW','NE','SW','SE'];
    let neighborsSection = '\n═══ VOISINS ADJACENTS ═══\n';
    if (Object.keys(neighbors).length === 0) {
      neighborsSection += '\n⚠️ AUCUN VOISIN ADJACENT DÉTECTÉ\nTu es seul pour le moment.\n';
    } else {
      for (const dir of dirOrder) {
        const n = neighbors[dir];
        if (!n) continue;
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
          const r = n.border_runs.neighbor[0];
          neighborsSection += `║ Run voisin dominant: ${r.color} [${r.start}-${r.end}] ║\n`;
        }
        if (n.my_edge) {
          neighborsSection += `║ Bord local à utiliser: ${n.my_edge.axis}= ${n.my_edge.value} ║\n`;
        }
        neighborsSection += `╚════════════════════════════════════════════╝\n`;
      }
    }

    const map = analysis.spatialMap || 'Position inconnue';
    const isFirstIteration = analysis.myPixelCount === 0;

    if (isFirstRequest && manualContent) {
      return `${manualContent}

═══════════════════════════════════════════════════════════════
CONTEXTE ACTUEL - Itération ${iterationCount + 1}
═══════════════════════════════════════════════════════════════

${map}

MON ÉTAT: ${analysis.myPixelCount}/400 pixels

${neighborsSection}

${customPrompt ? `🎯 INSTRUCTION UTILISATEUR: ${customPrompt}` : ''}

⚠️ PREMIÈRE ITÉRATION: Utilise FORMAT B (grid 20×20) pour remplir ta zone entière (200-400 pixels).
Crée un motif distinctif. Évite le biais (0,0).

IMPORTANT - INCLURE VOS CALCULS (voir manuel section 2.1) :
Ajoute "hypotheses", "chosen_hypothesis", "reasoning".

RÉPONDS EN JSON: {"strategy": "...", "grid": [[...]], "hypotheses": [...], "chosen_hypothesis": "...", "reasoning": "..."}`;
    }

    return `POIETIC GENERATOR - Itération ${iterationCount + 1}

${map}

MON ÉTAT: ${analysis.myPixelCount}/400 pixels (${(analysis.myPixelCount/400*100).toFixed(1)}%)

${neighborsSection}

${customPrompt ? `🎯 INSTRUCTION: ${customPrompt}` : ''}

// FORMAT A - DELTA (recommandé)
{"strategy": "...", "pixels": [{"x":12,"y":7,"color":"#AABBCC"}]}

// FORMAT B - GRILLE 20×20 (refonte)
{"strategy": "...", "grid": [["#RRGGBB",...], ...]}

RAPPELS :
- ${isFirstIteration ? 'FORMAT B recommandé (première itération)' : 'FORMAT A recommandé (dialogue progressif)'}
- Mentionne voisins dans strategy
- Continuité bordure: utilise my_edge et border_runs
- Évite biais (0,0)

⚠️ INCLURE CALCULS (section 2.1) : hypotheses[], chosen_hypothesis, reasoning
RÉPONDS EN JSON VALIDE.`;
  },

  async callAPI(apiKey, systemPrompt) {
    // Détection automatique de l'environnement
    const AI_SERVER_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:8003'
      : 'https://ai.poietic-generator.net';
    
    const url = `${AI_SERVER_URL}/api/llm/openai`;
    
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
      try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const errorData = await response.json();
          msg = errorData.error?.message || errorData.message || msg;
        } else {
          const text = await response.text();
          msg = text || msg;
        }
      } catch (ex) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};
    return { content: text, usage };
  },

  parseResponse(content) {
    // Même sanitisation que l'adaptateur Anthropic
    const stripCodeFence = (raw) => {
      let text = (raw || '').trim();
      if (text.startsWith('```')) {
        if (text.startsWith('```json')) text = text.slice(7);
        text = text.replace(/^```|```$/g, '').trim();
      }
      return text;
    };

    const expandArrayFillOnce = (str) => {
      try {
        return str.replace(/Array\(\s*(\d+)\s*\)\.fill\(\s*(["'])((?:#)?[0-9A-Fa-f]{6})\2\s*\)/g, (_m, n, _q, val) => {
          const count = Math.max(0, Math.min(1000, parseInt(n, 10) || 0));
          const items = new Array(count).fill(`"${val}"`).join(',');
          return `[${items}]`;
        });
      } catch (_) { return str; }
    };

    let s = stripCodeFence(content);
    let prev;
    do { prev = s; s = expandArrayFillOnce(s); } while (s !== prev);

    const stripLineComments = (x) => x.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
    const closeTrailingCommas = (x) => x.replace(/,\s*(\}|\])/g, '$1');
    const ensureBalanced = (x) => { const i = x.indexOf('{'); const j = x.lastIndexOf('}'); return (i !== -1 && j !== -1 && j > i) ? x.slice(i, j+1) : x; };

    s = stripLineComments(s);
    s = closeTrailingCommas(s);
    s = ensureBalanced(s);
    return JSON.parse(s);
  }
};

export { OpenAIAdapter };
