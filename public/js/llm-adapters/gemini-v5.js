export const GeminiV5Adapter = {
  name: 'Gemini V5',
  version: '2025-01-24-v5',
  apiKey: null,
  prompts: null,

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

  getApiKey() {
    const k = localStorage.getItem('gemini_api_key');
    return k || this.apiKey || '';
  },

  async callAPI(systemText, images) {
    const timeout = 420000;
    const key = this.getApiKey();
    if (!key) throw new Error('Clé API Gemini manquante');
    const model = 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;
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
          const retryAfter = parseInt(r.headers.get('Retry-After') || '0') * 1000;
          const backoffDelay = retryAfter || (Math.pow(2, attempt) * 1000 + Math.random() * 2000); // Backoff exponentiel + jitter
          
          if (attempt < maxRetries) {
            console.warn(`[Gemini V5] Rate limit (${r.status}), retry dans ${Math.round(backoffDelay/1000)}s (tentative ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(r => setTimeout(r, backoffDelay));
            continue; // Réessayer
          } else {
            throw new Error(`HTTP ${r.status} - Rate limit après ${maxRetries + 1} tentatives`);
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
    
    const render = (s) => s
      .replaceAll('{{myX}}', context?.myX ?? 0)
      .replaceAll('{{myY}}', context?.myY ?? 0)
      // V4 compatibilité (pour seed)
      .replaceAll('{{C_w_computed}}', String(context?.C_w ?? ''))
      .replaceAll('{{C_d_computed}}', String(context?.C_d ?? ''))
      .replaceAll('{{U_computed}}', String(context?.U ?? ''))
      .replaceAll('{{last_observation}}', context?.lastObservation ? JSON.stringify(context.lastObservation) : 'null')
      .replaceAll('{{my_previous_predictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{neighbor_colors}}', neighborColorsText)
      // V5: Variables spécifiques O+N snapshot
      .replaceAll('{{structures}}', structures)
      .replaceAll('{{formal_relations}}', formal_relations)
      .replaceAll('{{narrative}}', narrative)
      .replaceAll('{{C_w}}', String(context?.C_w ?? 'N/A'))
      .replaceAll('{{C_d}}', String(context?.C_d ?? 'N/A'))
      .replaceAll('{{U}}', String(context?.U ?? 'N/A'))
      .replaceAll('{{interpretation}}', interpretation)
      .replaceAll('{{prevPredictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{prediction_error}}', String(context?.prediction_error ?? 0)); // V5: Erreur de prédiction personnelle
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

