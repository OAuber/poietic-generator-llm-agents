// OpenRouter Provider (V4or) - provider unique, config-driven.
// Mime l'interface de GeminiV4Adapter (loadPromptFile, buildSystemPrompt,
// parseJSONResponse) mais route TOUT via le proxy serveur :8006 (cle serveur),
// au format OpenAI vision (content[] text + image_url). Le modele est un parametre.

export const OpenRouterProvider = {
  name: 'OpenRouter',
  version: '2026-06-04-v4or',

  // Modeles de VISION proposes par defaut (modifiables dans l'UI).
  // NB: utiliser des slugs multimodaux valides. Qwen3.7-max est text-only ->
  // remplace par la serie Qwen3-VL (vision).
  models: [
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash (cheap, rapide)' },
    { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8 (frontier)' },
    { id: 'openai/gpt-5.5', label: 'GPT-5.5 (frontier)' },
    { id: 'qwen/qwen3-vl-235b-a22b-instruct', label: 'Qwen3-VL 235B (vision)' },
    { id: 'qwen/qwen3-vl-8b-instruct', label: 'Qwen3-VL 8B (vision, cheap)' },
  ],

  // Base du serveur proxy V4or (port 8006), derivee de l'origine courante
  apiBase() {
    return window.location.origin.replace(/:\d+$/, ':8006');
  },

  async loadPromptFile(kind) {
    const map = {
      seed: 'prompts/v4or-seed.json',
      observation: 'prompts/v4or-observation.json',
      action: 'prompts/v4or-action.json',
    };
    const file = map[kind];
    if (!file) throw new Error('Unknown prompt kind: ' + kind);
    const res = await fetch(`/${file}?v=${this.version}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // Identique a GeminiV4Adapter.buildSystemPrompt (contrat de sortie leger conserve)
  async buildSystemPrompt(kind, context) {
    const tpl = await this.loadPromptFile(kind);
    const lines = tpl.system || [];

    let neighborColorsText = '';
    if (context?.neighborColors && Array.isArray(context.neighborColors) && context.neighborColors.length > 0) {
      neighborColorsText = '\n\n🎨 NEIGHBOR COLORS (for reference - use if coordinating, ignore if not):\n';
      context.neighborColors.forEach(nb => {
        neighborColorsText += `- ${nb.direction} at ${nb.position}: ${nb.colors.join(', ')}\n`;
      });
      neighborColorsText += '\n⚠️ NOTE: These are exact colors from adjacent fragments. Use them ONLY if you decide to coordinate.';
    }

    const render = (s) => s
      .replaceAll('{{myX}}', context?.myX ?? 0)
      .replaceAll('{{myY}}', context?.myY ?? 0)
      .replaceAll('{{C_w_computed}}', String(context?.C_w ?? ''))
      .replaceAll('{{C_d_computed}}', String(context?.C_d ?? ''))
      .replaceAll('{{U_computed}}', String(context?.U ?? ''))
      .replaceAll('{{last_observation}}', context?.lastObservation ? JSON.stringify(context.lastObservation) : 'null')
      .replaceAll('{{my_previous_predictions}}', context?.prevPredictions ? JSON.stringify(context.prevPredictions) : 'null')
      .replaceAll('{{neighbor_colors}}', neighborColorsText);
    return lines.map(render).join('\n');
  },

  // Appel via le proxy serveur (cle serveur). Retourne le texte de contenu.
  // images: { globalImageBase64, localImageBase64 } (data URLs ou base64 pur)
  // opts:   { model, sessionId, agentId, maxTokens }
  async callAPI(systemText, images, opts = {}) {
    const model = opts.model || this.models[0].id;

    const content = [{ type: 'text', text: systemText }];
    const pushImage = (val) => {
      if (!val || typeof val !== 'string') return;
      const url = val.startsWith('data:') ? val : `data:image/png;base64,${val}`;
      content.push({ type: 'image_url', image_url: { url } });
    };
    pushImage(images?.globalImageBase64);
    pushImage(images?.localImageBase64);

    const requestBody = {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: opts.maxTokens || 2000,
      session_id: opts.sessionId || 'default',
      agent_id: opts.agentId || 'unknown',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 240000);
    let response;
    try {
      response = await fetch(`${this.apiBase()}/api/llm/openrouter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw new Error('Timeout: OpenRouter n\'a pas repondu (240s)');
      throw new Error(`Impossible de contacter le serveur V4or (${this.apiBase()}): ${e.message}`);
    }
    clearTimeout(timeoutId);

    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (response.status === 402) {
      throw new Error(`Budget depasse: ${data?.message || 'plafond de session atteint'}`);
    }
    if (!response.ok) {
      // OpenRouter renvoie { error: { message, code } } ; extraire le message lisible
      let errMsg = (data && data.error && (data.error.message || data.error)) || data?.message || response.statusText;
      if (typeof errMsg !== 'string') errMsg = JSON.stringify(errMsg);
      throw new Error(`Erreur API ${response.status}: ${errMsg}`);
    }

    // Exposer le cout de session (pour le panneau cout)
    if (typeof data?._session_cost_usd === 'number') {
      this.lastSessionCostUsd = data._session_cost_usd;
    }
    if (data?.usage) {
      this.lastUsage = data.usage;
    }

    // Reponse compatible OpenAI : choices[0].message.content
    const choice = data?.choices?.[0];
    const msg = choice?.message?.content;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.map(p => p?.text || '').join('\n');
    return '';
  },

  // Identique a GeminiV4Adapter.parseJSONResponse
  parseJSONResponse(text) {
    try { return JSON.parse(text); } catch (_) {}
    if (!text || typeof text !== 'string') return {};

    const original = text;
    let cleaned = original
      .replace(/\r/g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/^\s*[\n]/gm, '');

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(jsonSlice); } catch (_) {}
    }

    const pixelRegex = /\b(-?\d{1,3}),(-?\d{1,3})#([0-9a-fA-F]{3,6})\b/g;
    const pixels = [];
    let m;
    while ((m = pixelRegex.exec(original)) !== null) {
      const x = parseInt(m[1], 10);
      const y = parseInt(m[2], 10);
      const hex = m[3].length === 3 ? m[3].split('').map(c => c + c).join('') : m[3];
      pixels.push(`${x},${y}#${hex.toUpperCase()}`);
    }
    if (pixels.length > 0) return { pixels };
    return {};
  },
};

window.OpenRouterProvider = OpenRouterProvider;
