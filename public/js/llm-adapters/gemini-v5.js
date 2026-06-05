export const GeminiV5Adapter = {
  name: 'Gemini V5',
  version: '2025-01-27-v5-33',
  apiKey: null,
  prompts: null,
  strategies: null, // Cache pour strategies-v5.json (compatibilité)
  strategiesCache: null, // Cache séparé par type (safe/advanced)
  // V5.2: Supprimé lastCallTime et minCallInterval - les retries gèrent déjà les rate limits
  // et cela créait une queue globale empêchant le parallélisme entre agents

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

  async loadStrategies(context = null) {
    // Déterminer quel fichier charger selon le contexte
    let strategyFile = 'strategies-v5.json'; // Par défaut
    let cacheKey = 'default';
    
    if (context && context.kind === 'action') {
      // Calculer les valeurs nécessaires (même logique que dans buildSystemPrompt)
      let myRank = 999;
      let myAvgError = 1.0;
      let totalAgents = 0;
      
      if (context?.agent_rankings) {
        const rankings = context.agent_rankings;
        const myAgentId = context?.myAgentId || '';
        const myRanking = rankings[myAgentId] || {rank: 999, avg_error: 1.0, total_iterations: 0, position: [0, 0]};
        myRank = myRanking.rank || 999;
        myAvgError = myRanking.avg_error || 1.0;
        totalAgents = Object.keys(rankings).length;
      }
      
      // Calculer U si pas directement disponible
      const C_w = parseFloat(context.C_w) || 0;
      const C_d = parseFloat(context.C_d) || 0;
      const U = parseFloat(context.U) || (C_w - C_d);
      
      // Vérifier si l'agent est au-dessus ou en dessous des seuils
      
      const uThreshold = this.getStrategyParam('strategy_u_threshold', 70);
      const rankDivisor = this.getStrategyParam('strategy_rank_divisor', 2);
      const errorThreshold = this.getStrategyParam('strategy_error_threshold', 0.5);
      
      // CRITICAL FIX: Utiliser myAvgError au lieu de avgError (variable non définie)
      const isBelowThreshold = U < uThreshold || myRank > (totalAgents / rankDivisor) || myAvgError > errorThreshold;
      
      if (isBelowThreshold) {
        strategyFile = 'strategies-v5-safe.json';
        cacheKey = 'safe';
      } else {
        strategyFile = 'strategies-v5-advanced.json';
        cacheKey = 'advanced';
      }
    }
    
    // Utiliser un cache séparé par type de stratégies
    if (!this.strategiesCache) {
      this.strategiesCache = {};
    }
    
    if (this.strategiesCache[cacheKey]) {
      return this.strategiesCache[cacheKey];
    }
    
    try {
      const res = await fetch(`/${strategyFile}?v=${this.version}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const strategies = await res.json();
      
      // CRITICAL FIX: Vérifier que le fichier contient bien des stratégies
      if (!strategies || !strategies.strategies || !Array.isArray(strategies.strategies) || strategies.strategies.length === 0) {
        console.warn(`[Gemini V5] ⚠️  Fichier ${strategyFile} vide ou invalide, fallback vers strategies-v5.json`);
        // Fallback vers le fichier par défaut si le fichier spécifique est vide
        if (strategyFile !== 'strategies-v5.json') {
          try {
            const fallbackRes = await fetch(`/strategies-v5.json?v=${this.version}`);
            if (fallbackRes.ok) {
              const fallbackStrategies = await fallbackRes.json();
              if (fallbackStrategies && fallbackStrategies.strategies && Array.isArray(fallbackStrategies.strategies) && fallbackStrategies.strategies.length > 0) {
                this.strategiesCache[cacheKey] = fallbackStrategies;
                this.strategies = fallbackStrategies;
                return fallbackStrategies;
              }
            }
          } catch (fallbackError) {
            console.error(`[Gemini V5] ❌ Erreur chargement fallback strategies-v5.json:`, fallbackError);
          }
        }
        // Si même le fallback échoue, retourner un objet vide mais valide
        return { strategies: [] };
      }
      
      this.strategiesCache[cacheKey] = strategies;
      // Pour compatibilité, aussi mettre dans this.strategies
      this.strategies = strategies;
      return strategies;
    } catch (e) {
      console.error(`[Gemini V5] ❌ Erreur chargement ${strategyFile}:`, e);
      
      // CRITICAL FIX: Fallback vers strategies-v5.json si le fichier spécifique n'existe pas
      if (strategyFile !== 'strategies-v5.json') {
        try {
          console.log(`[Gemini V5] 🔄 Tentative fallback vers strategies-v5.json...`);
          const fallbackRes = await fetch(`/strategies-v5.json?v=${this.version}`);
          if (fallbackRes.ok) {
            const fallbackStrategies = await fallbackRes.json();
            if (fallbackStrategies && fallbackStrategies.strategies && Array.isArray(fallbackStrategies.strategies) && fallbackStrategies.strategies.length > 0) {
              console.log(`[Gemini V5] ✅ Fallback réussi: ${fallbackStrategies.strategies.length} stratégies chargées`);
              this.strategiesCache[cacheKey] = fallbackStrategies;
              this.strategies = fallbackStrategies;
              return fallbackStrategies;
            }
          }
        } catch (fallbackError) {
          console.error(`[Gemini V5] ❌ Erreur chargement fallback strategies-v5.json:`, fallbackError);
        }
      }
      
      // Si même le fallback échoue, retourner un objet vide mais valide
      return { strategies: [] };
    }
  },

  formatStrategiesReference() {
    // CRITICAL FIX: Vérifier que les stratégies sont valides avant de les formater
    if (!this.strategies || !this.strategies.strategies || !Array.isArray(this.strategies.strategies) || this.strategies.strategies.length === 0) {
      console.warn(`[Gemini V5] ⚠️  Aucune stratégie disponible (strategies=${!!this.strategies}, strategies.strategies=${!!this.strategies?.strategies}, length=${this.strategies?.strategies?.length || 0})`);
      return 'No strategies available - system error';
    }
    const strategies = this.strategies.strategies;
    // CRITICAL: Format ultra-compact pour réduire tokens
    // ID, nom court, predicted_error, difficulty, deltas (pas de description complète)
    // ⭐ pour marquer les stratégies faciles (error <= 0.1 ET difficulty=easy)
    let text = 'STRATEGIES (id, error, difficulty, ΔC_w, ΔC_d):\n';
    
    strategies.forEach(s => {
      const neighbor = s.neighbor_type === 'immediate' ? 'imm' : s.neighbor_type === 'distant' ? 'dist' : 'any';
      const sources = s.min_sources > 1 ? `[${s.min_sources}+]` : '';
      const difficulty = s.difficulty || 'medium';
      // Marquer visuellement les stratégies faciles avec ⭐
      const isEasy = s.predicted_error <= 0.1 && s.difficulty === 'easy';
      const marker = isEasy ? '⭐ ' : '  ';
      text += `${marker}${s.id}: "${s.name}" (${neighbor}${sources}) error=${s.predicted_error}, diff=${difficulty}, ΔC_w=+${s.delta_C_w_bits}, ΔC_d=${s.delta_C_d_bits}\n`;
    });
    
    return text;
  },

  getApiKey() {
    const k = localStorage.getItem('gemini_api_key');
    return k || this.apiKey || '';
  },

  async callAPI(systemText, images) {
    // V5.2: Supprimé l'espacement global des appels - les retries avec backoff gèrent les rate limits
    // Chaque agent (onglet navigateur) peut appeler en parallèle sans queue globale
    
    const timeout = 420000;
    // V5 (porté OpenRouter) : route via le proxy serveur (clé côté serveur), format OpenAI vision.
    const base = window.location.origin.replace(/:\d+$/, ':8005');
    const model = (this.model || 'google/gemini-3.5-flash');

    console.log(`[Gemini V5→OpenRouter] 📤 ${model} - ${systemText.length} chars, ${images ? (images.globalImageBase64 ? '1 global ' : '') + (images.localImageBase64 ? '1 local' : '') : 'no images'}`);
    const content = [{ type: 'text', text: systemText }];
    const pushImage = (dataUrl) => {
      if (!dataUrl || typeof dataUrl !== 'string') return;
      const url = dataUrl.startsWith('data:') ? dataUrl : `data:image/png;base64,${dataUrl}`;
      content.push({ type: 'image_url', image_url: { url } });
    };
    pushImage(images?.globalImageBase64);
    pushImage(images?.localImageBase64);

    const isSeed = systemText.includes('SEED') || systemText.includes('seed');
    const maxTokens = isSeed ? 24000 : 20000;
    const body = {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: maxTokens,
      temperature: 1.2
    };
    
    // Retry avec backoff exponentiel pour erreurs 503/429 (rate limit)
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeout);
        const r = await fetch(`${base}/api/llm/openrouter`, {
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
        const choice = data?.choices?.[0];
        let text = choice?.message?.content || '';
        if (Array.isArray(text)) text = text.map(p => p?.text || '').join('\n');
        const finishReason = choice?.finish_reason || 'stop';

        // Métriques tokens (usage OpenRouter)
        const usage = data?.usage || {};
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

        if (finishReason === 'length') {
          console.warn(`[Gemini V5→OpenRouter] ⚠️ Réponse TRONQUÉE (length): ${outputTokens} tokens, texte: ${text.substring(0, 200)}...`);
        }

        // Retourner texte + métriques + finishReason (forme inchangée)
        return {
          text: text,
          finishReason: finishReason,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens
          }
        };
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
    // Pour action, passer le contexte avec kind pour charger le bon fichier (safe/advanced)
    if (kind === 'action' || kind === 'observation' || kind === 'narration') {
      const contextWithKind = context ? { ...context, kind } : { kind };
      await this.loadStrategies(contextWithKind);
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
    // CRITICAL: Format ultra-compact pour réduire tokens
    const obs = context?.lastObservation || {};
    
    // Structures: résumé compact au lieu de JSON complet
    // SOLUTION 1: Masquer les positions pour éviter l'alignement direct - seulement type, size, rank
    let structures = '[]';
    if (obs.structures && Array.isArray(obs.structures)) {
      const structs = obs.structures.slice(0, 10); // Max 10 structures
      structures = structs.map(s => {
        // NE PAS inclure les positions - seulement type, size, rank pour éviter l'alignement direct
        return `{type:"${s.type||'N/A'}", size:${s.size_agents||0}, rank:${s.rank_C_d||999}}`;
      }).join(', ');
      structures = `[${structures}]`;
    }
    
    // Formal relations: seulement le summary
    const formal_relations = obs.formal_relations?.summary || 'N/A';
    
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
        
        // CRITICAL: Format ultra-compact - Top 5 pour permettre plus de choix de sources
        const sorted = Object.entries(rankings)
          .sort((a, b) => a[1].rank - b[1].rank)
          .slice(0, 5);
        
        if (sorted.length > 0) {
          rankingText += 'TOP PREDICTORS (best sources for inspiration): ';
          rankingText += sorted.map(([id, data], idx) => {
            const pos = data.position || ['?', '?'];
            return `Rank ${idx + 1}: [${pos[0]},${pos[1]}] err=${data.avg_error.toFixed(2)}`;
          }).join(', ');
          rankingText += '\n';
        }
        
        rankingText += `YOU: Rank ${myRank}/${totalAgents}, err=${myAvgError.toFixed(2)}, iter=${myRanking.total_iterations || 0}\n`;
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
      // Pour action: ne pas injecter structures et formal_relations (trop précis, incite à se focaliser)
      .replaceAll('{{structures}}', kind === 'action' ? 'N/A (not provided to avoid self-focus)' : structures)
      .replaceAll('{{formal_relations}}', kind === 'action' ? 'N/A (not provided to avoid self-focus)' : formal_relations)
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
      .replaceAll('{{total_agents}}', String(totalAgents)) // V5: Nombre total d'agents
      // V5: Paramètres de stratégie configurables (depuis localStorage ou valeurs par défaut)
      .replaceAll('{{strategy_u_threshold}}', String(this.getStrategyParam('strategy_u_threshold', 70)))
      .replaceAll('{{strategy_rank_divisor}}', String(this.getStrategyParam('strategy_rank_divisor', 2)))
      .replaceAll('{{strategy_error_threshold}}', String(this.getStrategyParam('strategy_error_threshold', 0.5)));
    return lines.map(render).join('\n');
  },
  
  getStrategyParam(key, defaultValue) {
    // Récupérer depuis localStorage (mis à jour par ai-metrics.html)
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed)) {
        // CRITICAL FIX: Invalider le cache des stratégies si les paramètres changent
        // Cela force le rechargement des stratégies avec les nouveaux seuils
        const lastParamValue = this._lastStrategyParams?.[key];
        if (lastParamValue !== undefined && lastParamValue !== parsed) {
          console.log(`[Gemini V5] 🔄 Paramètre ${key} changé (${lastParamValue} → ${parsed}), invalidation cache stratégies`);
          // Invalider le cache pour forcer le rechargement avec les nouveaux seuils
          if (this.strategiesCache) {
            delete this.strategiesCache.safe;
            delete this.strategiesCache.advanced;
          }
        }
        // Stocker la valeur actuelle pour détecter les changements futurs
        if (!this._lastStrategyParams) {
          this._lastStrategyParams = {};
        }
        this._lastStrategyParams[key] = parsed;
        return parsed;
      }
    }
    return defaultValue;
  },

  parseJSONResponse(textOrResult) {
    // V5.1: Gérer le nouveau format avec tokens
    let text = textOrResult;
    if (textOrResult && typeof textOrResult === 'object' && textOrResult.text) {
      text = textOrResult.text;
      // Les tokens sont stockés dans textOrResult.tokens, mais on ne les utilise pas ici
      // Ils seront extraits séparément dans ai-player-v5.js
    }
    
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

