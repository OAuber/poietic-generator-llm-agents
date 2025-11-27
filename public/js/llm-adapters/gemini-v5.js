export const GeminiV5Adapter = {
  name: 'Gemini V5',
  version: '2025-01-24-v5-6',
  apiKey: null,
  prompts: null,
  strategies: null, // Cache pour strategies-v5.json
  lastCallTime: 0, // Timestamp du dernier appel API
  minCallInterval: 2000, // Intervalle minimum entre deux appels (2 secondes)

  async loadPromptFile(kind) {
    const map = {
      seed: 'gemini-prompts-v5-seed.json',
      observation: 'gemini-prompts-v5-observation.json',
      action: 'gemini-prompts-v5-action.json'
    };
    const file = map[kind];
    if (!file) throw new Error('Unknown prompt kind: ' + kind);
    const res = await fetch(`/${file}?v=${this.version}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async loadStrategies() {
    if (this.strategies) return this.strategies; // Déjà chargé
    try {
      const res = await fetch(`/strategies-v5.json?v=${this.version}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.strategies = await res.json();
      return this.strategies;
    } catch (e) {
      console.warn('[Gemini V5] Erreur chargement strategies-v5.json:', e);
      return { strategies: [] };
    }
  },

  formatStrategiesReference() {
    if (!this.strategies || !this.strategies.strategies) return 'No strategies available';
    const strategies = this.strategies.strategies;
    let text = 'AVAILABLE UNILATERAL STRATEGIES (ordered from easiest to hardest):\n\n';
    
    // Grouper par catégorie
    const byCategory = {
      'background_immediate': [],
      'background_distant': [],
      'background_any': [],
      'form_immediate': [],
      'form_distant': [],
      'recognition_any': []
    };
    
    strategies.forEach(s => {
      let key = `${s.category}_${s.neighbor_type}`;
      // Si neighbor_type est "any", utiliser une catégorie spéciale
      if (s.neighbor_type === 'any') {
        key = `${s.category}_any`;
      }
      if (byCategory[key]) {
        byCategory[key].push(s);
      } else {
        // Fallback: ajouter à une catégorie générique
        const genericKey = `${s.category}_any`;
        if (byCategory[genericKey]) {
          byCategory[genericKey].push(s);
        }
      }
    });
    
    // A) Background avec voisin immédiat
    if (byCategory.background_immediate.length > 0) {
      text += 'A) BACKGROUND STRATEGIES WITH IMMEDIATE NEIGHBOR:\n';
      byCategory.background_immediate.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
      });
      text += '\n';
    }
    
    // B) Background avec agent éloigné
    if (byCategory.background_distant.length > 0) {
      text += 'B) BACKGROUND STRATEGIES WITH DISTANT AGENT(S):\n';
      byCategory.background_distant.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
        if (s.min_sources > 1) text += `    Requires ${s.min_sources} or more source agents\n`;
      });
      text += '\n';
    }
    
    // B2) Background avec sources multiples (any)
    if (byCategory.background_any.length > 0) {
      text += 'B2) COMPLEX BACKGROUND STRATEGIES (multiple sources, immediate or distant):\n';
      byCategory.background_any.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
        if (s.min_sources > 1) text += `    Requires ${s.min_sources} or more source agents\n`;
      });
      text += '\n';
    }
    
    // C) Forme avec voisin
    if (byCategory.form_immediate.length > 0) {
      text += 'C) FORM STRATEGIES WITH IMMEDIATE NEIGHBOR (requires shared background):\n';
      byCategory.form_immediate.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
      });
      text += '\n';
    }
    
    // D) Forme avec agent éloigné
    if (byCategory.form_distant.length > 0) {
      text += 'D) FORM STRATEGIES WITH DISTANT AGENT(S) (requires shared background):\n';
      byCategory.form_distant.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
      });
      text += '\n';
    }
    
    // E) Recognition strategies (Aha! effect)
    if (byCategory.recognition_any.length > 0) {
      text += 'E) RECOGNITION STRATEGIES (transform amorphous clusters into recognizable forms):\n';
      byCategory.recognition_any.forEach(s => {
        text += `  - "${s.name}" (id: ${s.id}): ${s.description}\n`;
        text += `    Predicted error: ${s.predicted_error}, ΔC_w: +${s.delta_C_w_bits} bits, ΔC_d: ${s.delta_C_d_bits} bits\n`;
        if (s.min_sources > 1) text += `    Requires ${s.min_sources} or more source agents\n`;
      });
      text += '\n';
    }
    
    return text;
  },

  getApiKey() {
    const k = localStorage.getItem('gemini_api_key');
    return k || this.apiKey || '';
  },

  async callAPI(systemText, images) {
    // Espacer les appels API pour éviter les rate limits
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minCallInterval) {
      const waitTime = this.minCallInterval - timeSinceLastCall;
      console.log(`[Gemini V5] ⏳ Espacement des appels: attente ${waitTime}ms avant l'appel API`);
      await new Promise(r => setTimeout(r, waitTime));
    }
    this.lastCallTime = Date.now();
    
    const timeout = 420000;
    const key = this.getApiKey();
    if (!key) throw new Error('Clé API Gemini manquante');
    const model = 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;
    
    console.log(`[Gemini V5] 📤 Appel API Gemini (${model}) - ${systemText.length} chars, ${images ? (images.globalImageBase64 ? '1 global' : '') + (images.localImageBase64 ? '1 local' : '') : 'no images'}`);
    const parts = [{ text: systemText }];
    // Ajouter images (global/local) si fournies
    const maybePushImage = (dataUrl) => {
      if (!dataUrl || typeof dataUrl !== 'string') return;
      let clean = dataUrl;
      if (clean.startsWith('data:image/png;base64,')) clean = clean.replace('data:image/png;base64,', '');
      if (/^[A-Za-z0-9+/=]+$/.test(clean)) {
        parts.push({ inline_data: { mime_type: 'image/png', data: clean }});
      }
    };
    maybePushImage(images?.globalImageBase64);
    maybePushImage(images?.localImageBase64);

    const body = {
      contents: [{ parts }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 16000 }
    };
    
    // Retry avec backoff exponentiel pour erreurs 503/429 (rate limit)
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeout);
        const r = await fetch(apiUrl, { 
          method: 'POST', 
          body: JSON.stringify(body), 
          headers: { 'Content-Type': 'application/json' }, 
          signal: controller.signal 
        });
        
        if (r.status === 503 || r.status === 429) {
          // Rate limit ou service unavailable
          // Lire le message d'erreur pour distinguer quota vs rate limit
          let errorMessage = '';
          try {
            const errorText = await r.text();
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData?.error?.message || errorData?.error?.status || '';
            } catch (e) {
              // Si ce n'est pas du JSON, utiliser le texte brut
              errorMessage = errorText.substring(0, 200);
            }
          } catch (e) {
            // Ignorer si on ne peut pas lire la réponse
            errorMessage = 'Unable to read error message';
          }
          
          const retryAfter = parseInt(r.headers.get('Retry-After') || '0') * 1000;
          
          // "Resource has been exhausted" peut signifier soit un quota épuisé, soit un rate limit temporaire
          // On ne peut pas le distinguer avec certitude, donc on essaie quand même avec des délais plus longs
          const isQuotaMessage = errorMessage.toLowerCase().includes('quota') || 
                                 errorMessage.toLowerCase().includes('resource has been exhausted');
          
          // Backoff exponentiel très agressif pour 429 : délais beaucoup plus longs
          // Pour "Resource has been exhausted", on attend plus longtemps car cela peut être un rate limit sévère
          const baseDelay = r.status === 429 
            ? (isQuotaMessage 
                ? Math.pow(4, attempt) * 10000  // 10s, 40s, 160s pour "resource exhausted" (rate limit sévère)
                : Math.pow(3, attempt) * 5000)  // 5s, 15s, 45s pour rate limit normal
            : Math.pow(2, attempt) * 1000;      // 1s, 2s, 4s pour 503
          const jitter = Math.random() * 15000; // Jitter jusqu'à 15s
          const backoffDelay = retryAfter || (baseDelay + jitter);
          
          if (attempt < maxRetries) {
            const errorType = isQuotaMessage ? 'Rate limit sévère (resource exhausted)' : 'Rate limit';
            console.warn(`[Gemini V5] ${errorType} (${r.status}): ${errorMessage || 'No details'}, retry dans ${Math.round(backoffDelay/1000)}s (tentative ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(r => setTimeout(r, backoffDelay));
            continue; // Réessayer
          } else {
            throw new Error(`HTTP ${r.status} - Rate limit après ${maxRetries + 1} tentatives: ${errorMessage || 'No details'}`);
          }
        }
        
        if (!r.ok) {
          const errorText = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
        return text;
      } catch (error) {
        lastError = error;
        // Si c'est une erreur réseau ou timeout, réessayer avec backoff
        if (attempt < maxRetries && (error.name === 'AbortError' || error.message.includes('fetch'))) {
          const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`[Gemini V5] Erreur réseau, retry dans ${Math.round(backoffDelay/1000)}s (tentative ${attempt + 1}/${maxRetries + 1})`);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }
        // Sinon, propager l'erreur
        throw error;
      }
    }
    throw lastError || new Error('Échec après toutes les tentatives');
  },

  async buildSystemPrompt(kind, context) {
    const tpl = await this.loadPromptFile(kind);
    const lines = tpl.system || [];
    
    // Charger strategies-v5.json si nécessaire (pour action, observation, narration)
    if (kind === 'action' || kind === 'observation' || kind === 'narration') {
      await this.loadStrategies();
    }
    
    // Formater les couleurs des voisins pour injection dans le prompt
    let neighborColorsText = '';
    if (context?.neighborColors && Array.isArray(context.neighborColors) && context.neighborColors.length > 0) {
      neighborColorsText = '\n\n🎨 NEIGHBOR COLORS (for reference - use if coordinating, ignore if not):\n';
      context.neighborColors.forEach(nb => {
        neighborColorsText += `- ${nb.direction} at ${nb.position}: ${nb.colors.join(', ')}\n`;
      });
      neighborColorsText += '\n⚠️ NOTE: These are exact colors from adjacent fragments. Use them ONLY if you decide to coordinate/cooperate with neighbors. Do NOT copy systematically - coordination should be strategic, not automatic.';
    }
    
    // V5: Extraire variables depuis lastObservation (snapshot O+N)
    const obs = context?.lastObservation || {};
    const structures = obs.structures ? JSON.stringify(obs.structures, null, 2) : '[]';
    const formal_relations = obs.formal_relations ? JSON.stringify(obs.formal_relations, null, 2) : '{}';
    const narrative = obs.narrative?.summary || 'N/A';
    const interpretation = obs.simplicity_assessment?.U_current?.interpretation || 'N/A';
    
    // Formater référence aux stratégies
    const strategiesReference = (kind === 'action' || kind === 'observation' || kind === 'narration') 
      ? this.formatStrategiesReference() 
      : '';
    
    // Historique des stratégies (seulement pour action)
    const strategyHistory = (kind === 'action' && context?.strategy_history) 
      ? context.strategy_history 
      : '';
    
    // Formater identité artistique (seulement pour action)
    let artisticIdentityText = '';
    if (kind === 'action' && context?.artistic_identity) {
      const ai = context.artistic_identity;
      if (ai.concept || ai.artistic_reference) {
        artisticIdentityText = `Your artistic identity (from seed): "${ai.concept || 'N/A'}" inspired by ${ai.artistic_reference || 'N/A'}`;
        if (ai.rationale) {
          artisticIdentityText += `. Rationale: ${ai.rationale}`;
        }
      }
    }
    if (!artisticIdentityText && kind === 'action') {
      artisticIdentityText = 'No artistic identity established yet (seed not completed or identity not available).';
    }
    
    // Formater ranking des agents (seulement pour action)
    let rankingText = '';
    let myRank = 999;
    let myAvgError = 1.0;
    let totalAgents = 0;
    
    if (kind === 'action' && context?.agent_rankings) {
      const rankings = context.agent_rankings;
      const myAgentId = context?.myAgentId || '';
      const myRanking = rankings[myAgentId] || {rank: 999, avg_error: 1.0, total_iterations: 0, position: [0, 0]};
      
      myRank = myRanking.rank || 999;
      myAvgError = myRanking.avg_error || 1.0;
      totalAgents = Object.keys(rankings).length;
      
      if (totalAgents > 0) {
        rankingText = '\nAGENT RANKING (Prediction Accuracy Competition):\n';
        rankingText += 'Agents are ranked by their cumulative average prediction error (lower = better rank).\n';
        rankingText += 'Rank 1 = best predictor (lowest error), highest rank = worst predictor.\n\n';
        
        // Top 5
        const sorted = Object.entries(rankings)
          .sort((a, b) => a[1].rank - b[1].rank)
          .slice(0, 5);
        
        if (sorted.length > 0) {
          rankingText += 'TOP PREDICTORS (best anticipation):\n';
          sorted.forEach(([id, data]) => {
            const pos = data.position || ['?', '?'];
            const isMe = id === myAgentId;
            rankingText += `  ${data.rank}. Agent [${pos[0]},${pos[1]}]: avg_error=${data.avg_error.toFixed(3)}, iterations=${data.total_iterations}${isMe ? ' (YOU)' : ''}\n`;
          });
        }
        
        rankingText += '\nYOUR RANKING:\n';
        rankingText += `  Rank: ${myRank} / ${totalAgents}\n`;
        rankingText += `  Average error: ${myAvgError.toFixed(3)}\n`;
        rankingText += `  Total iterations: ${myRanking.total_iterations || 0}\n`;
        
        if (myRank <= 3 && totalAgents >= 3) {
          rankingText += '  EXCELLENT: You are among the top predictors! Your anticipation capability is highly valued.\n';
        } else if (myRank <= Math.floor(totalAgents / 2)) {
          rankingText += '  GOOD: You are above average. Keep improving your predictions.\n';
        } else {
          rankingText += '  NEEDS IMPROVEMENT: Your prediction accuracy is below average. Consider using strategies with lower predicted error (e.g., exact reproduction).\n';
        }
      } else {
        rankingText = '\nAGENT RANKING: No rankings available yet (waiting for first predictions).\n';
      }
    } else if (kind === 'action') {
      rankingText = '\nAGENT RANKING: Rankings not available yet.\n';
    }
    
    const render = (s) => s
      .replaceAll('{{myX}}', context?.myX ?? 0)
      .replaceAll('{{myY}}', context?.myY ?? 0)
      .replaceAll('{{iteration}}', String(context?.iteration ?? 0))
      // V4 compatibilité (pour seed)
      .replaceAll('{{C_w_computed}}', String(context?.C_w ?? ''))
      .replaceAll('{{C_d_computed}}', String(context?.C_d ?? ''))
      .replaceAll('{{U_computed}}', String(context?.U ?? ''))
      .replaceAll('{{last_observation}}', context?.lastObservation ? JSON.stringify(context.lastObservation) : 'null')
      .replaceAll('{{my_previous_predictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{neighbor_colors}}', neighborColorsText)
      .replaceAll('{{colorPalette}}', context?.colorPalette || 'No colors yet')
      // V5: Variables spécifiques O+N snapshot
      .replaceAll('{{structures}}', structures)
      .replaceAll('{{formal_relations}}', formal_relations)
      .replaceAll('{{narrative}}', narrative)
      .replaceAll('{{C_w}}', String(context?.C_w ?? 'N/A'))
      .replaceAll('{{C_d}}', String(context?.C_d ?? 'N/A'))
      .replaceAll('{{U}}', String(context?.U ?? 'N/A'))
      .replaceAll('{{interpretation}}', interpretation)
      .replaceAll('{{prevPredictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{prediction_error}}', String(context?.prediction_error ?? 0)) // V5: Erreur de prédiction personnelle
      .replaceAll('{{strategies_reference}}', strategiesReference) // V5: Référence aux stratégies unilatérales
      .replaceAll('{{strategy_history}}', strategyHistory) // V5: Historique des stratégies utilisées
      .replaceAll('{{artistic_identity}}', artisticIdentityText) // V5: Identité artistique persistante
      .replaceAll('{{agent_rankings}}', rankingText) // V5: Ranking des agents
      .replaceAll('{{my_rank}}', String(myRank)) // V5: Rang personnel
      .replaceAll('{{my_avg_error}}', String(myAvgError.toFixed(3))) // V5: Erreur moyenne personnelle
      .replaceAll('{{total_agents}}', String(totalAgents)); // V5: Nombre total d'agents
    return lines.map(render).join('\n');
  },

  parseJSONResponse(text) {
    // Try direct parse first
    try { return JSON.parse(text); } catch (_) {}

    if (!text || typeof text !== 'string') return {};

    const original = text;

    // 1) Remove JS-style comments and trailing commas, empty lines
    let cleaned = original
      .replace(/\r/g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/^\s*[\n]/gm, '');

    // 2) Try to extract the largest plausible JSON object substring
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(jsonSlice); } catch (_) {}
    }

    // 3) Fallback: extract pixels via regex ("x,y#HEX") from the raw text
    const pixelRegex = /\b(-?\d{1,3}),(-?\d{1,3})#([0-9a-fA-F]{3,6})\b/g;
    const pixels = [];
    let m;
    while ((m = pixelRegex.exec(original)) !== null) {
      const x = parseInt(m[1], 10);
      const y = parseInt(m[2], 10);
      const hex = m[3].length === 3 ? m[3].split('').map(c=>c+c).join('') : m[3];
      pixels.push(`${x},${y}#${hex.toUpperCase()}`);
    }

    if (pixels.length > 0) {
      return { pixels };
    }

    return {};
  }
};

window.GeminiV5Adapter = GeminiV5Adapter;

