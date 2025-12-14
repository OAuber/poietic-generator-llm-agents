/**
 * Gemini V6 Adapter - Quantum Architecture
 * 
 * Q-machine paradigm:
 * - S-machines: Seed quantum state generators
 * - W-machines: Quantum evolution operators (slits in multi-slit apparatus)
 * - O-machine: Quantum measurement apparatus
 * - N-machine: Quantum narrative interpreter
 * 
 * Quantum metrics:
 * - φ-coherence: Phase alignment between W-instances
 * - ξ-correlation: Spatial correlation length
 * - τ-condensation: Bose-Einstein condensation metric
 * - I-visibility: Interference fringe visibility
 */
export const GeminiV6Adapter = {
  name: 'Gemini V6 Quantum',
  version: '20250127-v6-02',
  apiKey: null,
  prompts: null,
  strategies: null,
  strategiesCache: null,

  async loadPromptFile(kind) {
    const map = {
      seed: 'gemini-prompts-v6-seed.json',
      observation: 'gemini-prompts-v6-observation.json',
      action: 'gemini-prompts-v6-action.json'
    };
    const file = map[kind];
    if (!file) throw new Error('Unknown prompt kind: ' + kind);
    const res = await fetch(`/${file}?v=${this.version}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async loadStrategies(context = null) {
    // Determine which strategy file based on quantum regime
    let strategyFile = 'strategies-v6-quantum.json';
    let cacheKey = 'quantum';
    
    if (context && context.kind === 'action') {
      const phi = parseFloat(context.phi_coherence) || 0;
      const U = parseFloat(context.U) || 0;
      const myAvgError = parseFloat(context.my_avg_error) || 1.0;
      const myRank = parseInt(context.my_rank) || 999;
      const totalAgents = parseInt(context.total_agents) || 1;
      
      const uThreshold = this.getStrategyParam('strategy_u_threshold', 20);
      const rankDivisor = this.getStrategyParam('strategy_rank_divisor', 2);
      const errorThreshold = this.getStrategyParam('strategy_error_threshold', 0.5);
      
      // DECOHERENCE REGIME: φ < 0.4 OR poor metrics
      const isDecoherence = phi < 0.4 || U < uThreshold || myRank > (totalAgents / rankDivisor) || myAvgError > errorThreshold;
      
      if (isDecoherence) {
        strategyFile = 'strategies-v6-decoherence.json';
        cacheKey = 'decoherence';
      } else {
        strategyFile = 'strategies-v6-coherent.json';
        cacheKey = 'coherent';
      }
    }
    
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
      
      if (!strategies || !strategies.strategies || strategies.strategies.length === 0) {
        console.warn(`[Gemini V6] ⚠️ Empty ${strategyFile}, falling back to quantum.json`);
        const fallbackRes = await fetch(`/strategies-v6-quantum.json?v=${this.version}`);
        if (fallbackRes.ok) {
          const fallback = await fallbackRes.json();
          this.strategiesCache[cacheKey] = fallback;
          this.strategies = fallback;
          return fallback;
        }
        return { strategies: [] };
      }
      
      this.strategiesCache[cacheKey] = strategies;
      this.strategies = strategies;
      return strategies;
    } catch (e) {
      console.error(`[Gemini V6] ❌ Error loading ${strategyFile}:`, e);
      return { strategies: [] };
    }
  },

  formatStrategiesReference() {
    if (!this.strategies || !this.strategies.strategies || this.strategies.strategies.length === 0) {
      return 'No unitaries available - quantum system error';
    }
    const strategies = this.strategies.strategies;
    
    // Ultra-compact format for token efficiency
    let text = 'UNITARIES (id, error, difficulty, ΔC_w, ΔC_d, Δφ):\n';
    
    strategies.forEach(s => {
      const neighbor = s.neighbor_type === 'immediate' ? 'imm' : s.neighbor_type === 'distant' ? 'dist' : 'any';
      const sources = s.min_sources > 1 ? `[${s.min_sources}+]` : '';
      const difficulty = s.difficulty || 'medium';
      const isEasy = s.predicted_error <= 0.1 && s.difficulty === 'easy';
      const marker = isEasy ? '⭐ ' : '  ';
      const deltaPhi = s.delta_phi_coherence !== undefined ? `, Δφ=${s.delta_phi_coherence > 0 ? '+' : ''}${s.delta_phi_coherence}` : '';
      text += `${marker}${s.id}: "${s.name}" (${neighbor}${sources}) error=${s.predicted_error}, diff=${difficulty}, ΔC_w=+${s.delta_C_w_bits}, ΔC_d=${s.delta_C_d_bits}${deltaPhi}\n`;
    });
    
    return text;
  },

  getApiKey() {
    const k = localStorage.getItem('gemini_api_key');
    return k || this.apiKey || '';
  },

  async callAPI(systemText, images) {
    const timeout = 420000;
    const key = this.getApiKey();
    if (!key) throw new Error('Missing Gemini API key');
    
    const model = 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;
    
    console.log(`[Gemini V6] 📤 Quantum API call (${systemText.length} chars)`);
    
    const parts = [{ text: systemText }];
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

    const isSeed = systemText.includes('S-machine') || systemText.includes('SEED');
    const maxOutputTokens = isSeed ? 24000 : 20000;
    const temperature = 1.2;
    
    const body = {
      contents: [{ parts }],
      generationConfig: { temperature, maxOutputTokens }
    };
    
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
          const errorText = await r.text().catch(() => '');
          const retryAfter = parseInt(r.headers.get('Retry-After') || '0') * 1000;
          const baseDelay = r.status === 429 ? Math.pow(3, attempt) * 5000 : Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 15000;
          const backoffDelay = retryAfter || (baseDelay + jitter);
          
          if (attempt < maxRetries) {
            console.warn(`[Gemini V6] Rate limit (${r.status}), retry in ${Math.round(backoffDelay/1000)}s`);
            await new Promise(r => setTimeout(r, backoffDelay));
            continue;
          }
          throw new Error(`HTTP ${r.status} - Rate limit after ${maxRetries + 1} attempts`);
        }
        
        if (!r.ok) {
          const errorText = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await r.json();
        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.map(p => p.text).join('\n') || '';
        const finishReason = candidate?.finishReason || 'UNKNOWN';
        
        const usageMetadata = data?.usageMetadata || {};
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        
        if (finishReason === 'MAX_TOKENS') {
          console.warn(`[Gemini V6] ⚠️ Response TRUNCATED (MAX_TOKENS): ${outputTokens} tokens`);
        }
        
        return {
          text: text,
          finishReason: finishReason,
          tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens }
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && (error.name === 'AbortError' || error.message.includes('fetch'))) {
          const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`[Gemini V6] Network error, retry in ${Math.round(backoffDelay/1000)}s`);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error('Failed after all attempts');
  },

  async buildSystemPrompt(kind, context) {
    const tpl = await this.loadPromptFile(kind);
    const lines = tpl.system || [];
    
    // Calculate myRank and myAvgError BEFORE loadStrategies (CRITICAL FIX)
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
    }
    
    // Enrich context with myRank and myAvgError BEFORE loadStrategies
    const enrichedContext = {
      ...context,
      my_rank: myRank,
      my_avg_error: myAvgError,
      total_agents: totalAgents || context?.total_agents || 0
    };
    
    // Load strategies for action (now with correct context values)
    if (kind === 'action') {
      const contextWithKind = { ...enrichedContext, kind };
      await this.loadStrategies(contextWithKind);
    }
    
    // Format neighbor colors
    let neighborColorsText = '';
    if (context?.neighborColors && Array.isArray(context.neighborColors) && context.neighborColors.length > 0) {
      neighborColorsText = '\n\n🎨 NEIGHBOR AMPLITUDES (use if phase-locking):\n';
      context.neighborColors.forEach(nb => {
        neighborColorsText += `- ${nb.direction} at ${nb.position}: ${nb.colors.join(', ')}\n`;
      });
      neighborColorsText += '\n⚠️ NOTE: Use ONLY for quantum coordination. Do NOT copy systematically.';
    }
    
    // Get quantum observables from lastObservation
    const obs = context?.lastObservation || {};
    const coherence = obs.coherence_observables || {};
    const emergence = obs.emergence_observables || {};
    
    // Extract metrics
    const phi_coherence = coherence.phi_coherence ?? 0;
    const xi_correlation = coherence.xi_correlation_length ?? 0;
    const I_visibility = coherence.I_fringe_visibility ?? 0;
    const tau_condensation = emergence.tau_condensation ?? 0;
    
    const narrative = obs.narrative?.summary || 'N/A';
    const interpretation = obs.simplicity_assessment?.U_current?.interpretation || 'N/A';
    
    // Format strategies reference
    const strategiesReference = (kind === 'action') ? this.formatStrategiesReference() : '';
    
    // Format strategy history
    const strategyHistory = (kind === 'action' && context?.strategy_history) ? context.strategy_history : '';
    
    // Format artistic identity (for action)
    let artisticIdentityText = '';
    if (kind === 'action' && context?.artistic_identity) {
      const ai = context.artistic_identity;
      if (ai.concept || ai.artistic_reference) {
        artisticIdentityText = `Your quantum identity (from seed): "${ai.concept || 'N/A'}" inspired by ${ai.artistic_reference || 'N/A'}`;
      }
    }
    
    // Format rankings
    let rankingText = '';
    
    if (kind === 'action' && context?.agent_rankings && totalAgents > 0) {
      const rankings = context.agent_rankings;
      const myAgentId = context?.myAgentId || '';
      const myRanking = rankings[myAgentId] || {rank: 999, avg_error: 1.0, total_iterations: 0, position: [0, 0]};
      
      rankingText = '\nQUANTUM PREDICTOR RANKING:\n';
      rankingText += 'Agents ranked by prediction accuracy (lower error = better quantum intuition).\n\n';
      
      const sorted = Object.entries(rankings).sort((a, b) => a[1].rank - b[1].rank).slice(0, 5);
      if (sorted.length > 0) {
        rankingText += 'TOP QUANTUM PREDICTORS: ';
        rankingText += sorted.map(([id, data]) => {
          const pos = data.position || ['?', '?'];
          return `Rank ${data.rank}: [${pos[0]},${pos[1]}] err=${data.avg_error.toFixed(2)}`;
        }).join(', ');
        rankingText += '\n';
      }
      
      rankingText += `YOU: Rank ${myRank}/${totalAgents}, err=${myAvgError.toFixed(2)}, iter=${myRanking.total_iterations || 0}\n`;
    }
    
    const render = (s) => s
      .replaceAll('{{myX}}', context?.myX ?? 0)
      .replaceAll('{{myY}}', context?.myY ?? 0)
      .replaceAll('{{iteration}}', String(context?.iteration ?? 0))
      .replaceAll('{{total_agents}}', String(context?.total_agents ?? totalAgents))
      // Simplicity metrics
      .replaceAll('{{C_w}}', String(context?.C_w ?? 'N/A'))
      .replaceAll('{{C_d}}', String(context?.C_d ?? 'N/A'))
      .replaceAll('{{U}}', String(context?.U ?? 'N/A'))
      .replaceAll('{{interpretation}}', interpretation)
      // Quantum coherence observables
      .replaceAll('{{phi_coherence}}', String(phi_coherence.toFixed(2)))
      .replaceAll('{{xi_correlation}}', String(xi_correlation.toFixed(2)))
      .replaceAll('{{I_visibility}}', String(I_visibility.toFixed(2)))
      .replaceAll('{{tau_condensation}}', String(tau_condensation.toFixed(2)))
      // Context
      .replaceAll('{{colorPalette}}', context?.colorPalette || 'No amplitudes yet')
      .replaceAll('{{neighbor_colors}}', neighborColorsText)
      .replaceAll('{{narrative}}', narrative)
      .replaceAll('{{prevPredictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{prediction_error}}', String(context?.prediction_error ?? 0))
      .replaceAll('{{strategies_reference}}', strategiesReference)
      .replaceAll('{{strategy_history}}', strategyHistory)
      .replaceAll('{{artistic_identity}}', artisticIdentityText)
      // Rankings
      .replaceAll('{{agent_rankings}}', rankingText)
      .replaceAll('{{my_rank}}', String(myRank))
      .replaceAll('{{my_avg_error}}', String(myAvgError.toFixed(3)))
      // Strategy thresholds
      .replaceAll('{{strategy_u_threshold}}', String(this.getStrategyParam('strategy_u_threshold', 20)))
      .replaceAll('{{strategy_rank_divisor}}', String(this.getStrategyParam('strategy_rank_divisor', 2)))
      .replaceAll('{{strategy_error_threshold}}', String(this.getStrategyParam('strategy_error_threshold', 0.5)));
    
    return lines.map(render).join('\n');
  },
  
  getStrategyParam(key, defaultValue) {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed)) {
        // Invalidate cache if params changed
        const lastValue = this._lastStrategyParams?.[key];
        if (lastValue !== undefined && lastValue !== parsed) {
          console.log(`[Gemini V6] 🔄 Param ${key} changed, invalidating cache`);
          if (this.strategiesCache) {
            delete this.strategiesCache.decoherence;
            delete this.strategiesCache.coherent;
          }
        }
        if (!this._lastStrategyParams) this._lastStrategyParams = {};
        this._lastStrategyParams[key] = parsed;
        return parsed;
      }
    }
    return defaultValue;
  },

  parseJSONResponse(textOrResult) {
    let text = textOrResult;
    if (textOrResult && typeof textOrResult === 'object' && textOrResult.text) {
      text = textOrResult.text;
    }
    
    try { return JSON.parse(text); } catch (_) {}
    if (!text || typeof text !== 'string') return {};

    const original = text;

    // Clean comments and trailing commas
    let cleaned = original
      .replace(/\r/g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/^\s*[\n]/gm, '');

    // Extract JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(jsonSlice); } catch (_) {}
    }

    // Fallback: extract pixels via regex
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

window.GeminiV6Adapter = GeminiV6Adapter;

