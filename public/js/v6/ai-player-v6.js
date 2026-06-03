import { SimplicityMetrics } from '../simplicity-metrics.js';

// AI Player V6 - distille de V4. Provider unique (OpenRouter) injecte,
// modele choisi au lancement, cle cote serveur (proxy :8006), compteur de cout.
class AIPlayerV6 {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.iterationCount = 0;
    this.promptMode = 'seed';
    this.myPosition = [0, 0];
    this.myUserId = null;
    this.socket = null;
    this.pendingPixelTimeouts = [];
    this.myCellState = {};
    this.otherUsers = {};

    this.lastObservation = null;
    this.prevPredictions = null;
    this.Osnapshot = null;
    this.lastOVersionSeen = -1;
    this.lastOVersionAtAction = -1;

    this.oMetrics = { versions: [], C_w: [], C_d: [], U: [] };
    this.wMetrics = { iterations: [], C_w: [], C_d: [], U: [] };

    // Provider unique injecte
    this.provider = window.OpenRouterProvider;

    // URLs
    const loc = window.location;
    const WS_PROTOCOL = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    this.WS_URL = `${WS_PROTOCOL}//${loc.host}/updates?type=bot`;
    this.O_API_BASE = loc.origin.replace(/:\d+$/, ':8006');

    // Session partagee (agregation cout du banc) + modele choisi au lancement
    const params = new URLSearchParams(loc.search);
    this.sessionId = params.get('session') || 'poietic-v6';
    this.model = params.get('model') || this.provider?.models?.[0]?.id || 'google/gemini-3.5-flash';

    this.elements = {
      interval: document.getElementById('interval'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      modeLabel: document.getElementById('v6-mode'),
      journal: document.getElementById('journal'),
      predError: document.getElementById('prediction-error'),
      viewerFrame: document.getElementById('viewer-frame'),
      viewerUrl: document.getElementById('viewer-url'),
      headerPosition: document.getElementById('header-position'),
      headerModel: document.getElementById('header-llm-model'),
      modelSelect: document.getElementById('llm-model-select'),
      userIdDisplay: document.getElementById('user-id-display'),
      statusBadge: document.getElementById('status-badge'),
      llmStatusBadge: document.getElementById('llm-status-badge'),
      costSession: document.getElementById('cost-session'),
      costTotal: document.getElementById('cost-total'),
      budgetBadge: document.getElementById('budget-badge'),
      tokensInLast: document.getElementById('tokens-in-last'),
      tokensOutLast: document.getElementById('tokens-out-last'),
      tokensInTotal: document.getElementById('tokens-in-total'),
      tokensOutTotal: document.getElementById('tokens-out-total'),
      orUsage: document.getElementById('or-usage'),
      orRemaining: document.getElementById('or-remaining'),
    };

    this.populateModels();
    this.bindUI();
    this.updateCostPanel();
  }

  log(...args) {
    if (this.elements.journal) {
      this.elements.journal.textContent += args.join(' ') + '\n';
      this.elements.journal.scrollTop = this.elements.journal.scrollHeight;
    }
    console.log('[V6]', ...args);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  populateModels() {
    const sel = this.elements.modelSelect;
    if (!sel || !this.provider?.models) return;
    sel.innerHTML = '';
    this.provider.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === this.model) opt.selected = true;
      sel.appendChild(opt);
    });
    if (this.elements.headerModel) this.elements.headerModel.textContent = this.model;
  }

  storeVerbatimResponse(source, data, iteration) {
    const container = document.getElementById('verbatim-responses');
    if (!container) return;
    const placeholder = container.querySelector('.image-placeholder');
    if (placeholder) placeholder.remove();

    const item = document.createElement('div');
    item.className = 'response-item';
    const timestamp = new Date().toLocaleTimeString();

    let content = '';
    if (source === 'O') {
      const s = data?.simplicity_assessment || {};
      const structs = data?.structures || [];
      const narr = data?.narrative?.summary || '';
      const reasoning = s?.reasoning || '';
      content =
        `O-MACHINE (Observation/Narration)\n` +
        `----------------------------------------\n` +
        `C_w: ${s.C_w_current?.value ?? 'N/A'} | C_d: ${s.C_d_current?.value ?? 'N/A'} | U: ${s.U_current?.value ?? 'N/A'}\n` +
        `Interpretation: ${s.U_current?.interpretation || 'N/A'}\n` +
        `STRUCTURES (${structs.length})\n`;
      structs.forEach((st, i) => {
        content += `  ${i + 1}. ${st.type} (${st.size_agents} agents, salience ${st.salience})\n`;
      });
      content += `\nNARRATIVE\n${narr || '(none)'}\n`;
      if (reasoning) content += `\nREASONING\n${reasoning}\n`;
    } else if (source === 'W') {
      if (iteration === 0) {
        const seed = data?.seed || {};
        const pixels = data?.pixels || [];
        content =
          `W-MACHINE (Seed)\n----------------------------------------\n` +
          `CONCEPT: ${seed.concept || 'N/A'}\nRATIONALE: ${seed.rationale || 'N/A'}\n` +
          `PIXELS: ${pixels.length}\n`;
      } else {
        const strategy = data?.strategy || 'N/A';
        const rationale = data?.rationale || '';
        const pixels = data?.pixels || [];
        content =
          `W-MACHINE (Action) [${this.model}]\n----------------------------------------\n` +
          `STRATEGY: ${strategy}\nRATIONALE: ${rationale || 'N/A'}\nPIXELS: ${pixels.length}\n`;
      }
    }

    item.innerHTML = `
      <div class="response-header">
        <span class="response-timestamp">${timestamp}</span>
        <span class="response-iteration">${source} | Iter ${iteration}</span>
      </div>
      <div class="response-content">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; line-height: 1.4;">${this.escapeHtml(content)}</pre>
      </div>`;
    container.insertBefore(item, container.firstChild);
    while (container.children.length > 10) container.removeChild(container.lastChild);
  }

  // === Metriques (identiques V4) ===
  updateOMetrics(snapshot) {
    if (!snapshot || !snapshot.simplicity_assessment) return;
    const s = snapshot.simplicity_assessment;
    this.oMetrics.versions.push(snapshot.version || 0);
    this.oMetrics.C_w.push(s.C_w_current?.value || 0);
    this.oMetrics.C_d.push(s.C_d_current?.value || 0);
    this.oMetrics.U.push(s.U_current?.value || 0);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('o-version', snapshot.version || 0);
    set('o-cw', Math.round(s.C_w_current?.value || 0));
    set('o-cd', Math.round(s.C_d_current?.value || 0));
    set('o-u', Math.round(s.U_current?.value || 0));
    this.drawChart('simplicity-chart-o', this.oMetrics, 'versions');
  }

  updateWMetrics(C_w, C_d, U) {
    this.wMetrics.iterations.push(this.iterationCount);
    this.wMetrics.C_w.push(C_w);
    this.wMetrics.C_d.push(C_d);
    this.wMetrics.U.push(U);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('w-iteration', this.iterationCount);
    set('w-cw', Math.round(C_w));
    set('w-cd', Math.round(C_d));
    set('w-u', Math.round(U));
    this.drawChart('simplicity-chart-w', this.wMetrics, 'iterations');
  }

  drawChart(canvasId, data, xKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!canvas.width) canvas.width = canvas.offsetWidth || 400;
    if (!canvas.height) canvas.height = canvas.offsetHeight || 120;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!data[xKey] || data[xKey].length === 0) return;
    const allValues = [...data.C_w, ...data.C_d, ...data.U.map(u => Math.abs(u))];
    const maxY = Math.max(...allValues, 1);
    if (maxY === 0) return;
    const numPoints = data[xKey].length;
    const scaleX = numPoints > 1 ? width / (numPoints - 1) : width;
    const scaleY = (height - 20) / maxY;
    this.drawCurve(ctx, data.C_w, scaleX, scaleY, height, '#4A90E2');
    this.drawCurve(ctx, data.C_d, scaleX, scaleY, height, '#E24A4A');
    this.drawCurve(ctx, data.U, scaleX, scaleY, height, '#4AE290');
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 10);
    ctx.lineTo(width, height - 10);
    ctx.stroke();
  }

  drawCurve(ctx, values, scaleX, scaleY, height, color) {
    if (values.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = i * scaleX;
      const y = height - 10 - (values[i] * scaleY);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // === Panneau cout ===
  async updateCostPanel() {
    try {
      const res = await fetch(`${this.O_API_BASE}/api/usage?session_id=${encodeURIComponent(this.sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const session = data?.sessions?.[this.sessionId];
      const total = session?.total || {};
      const agent = this.myUserId ? session?.agents?.[this.myUserId]?.total : null;

      if (this.elements.costSession) {
        this.elements.costSession.textContent = `$${(total.cost_usd || 0).toFixed(4)}`;
      }
      if (this.elements.costTotal) {
        this.elements.costTotal.textContent = `$${(data?.grand_total?.cost_usd || 0).toFixed(4)}`;
      }
      if (agent) {
        if (this.elements.tokensInTotal) this.elements.tokensInTotal.textContent = agent.prompt_tokens || 0;
        if (this.elements.tokensOutTotal) this.elements.tokensOutTotal.textContent = agent.completion_tokens || 0;
      }
    } catch (_) {}
    this.updateOpenRouterUsage();
  }

  // Consommation officielle du compte OpenRouter (autoritative, cumulee)
  async updateOpenRouterUsage() {
    try {
      const res = await fetch(`${this.O_API_BASE}/api/usage/openrouter`);
      if (!res.ok) return;
      const data = await res.json();
      const fmt = (v) => (typeof v === 'number' ? `$${v.toFixed(4)}` : '-');
      if (this.elements.orUsage) this.elements.orUsage.textContent = fmt(data?.total_usage);
      if (this.elements.orRemaining) this.elements.orRemaining.textContent = fmt(data?.remaining);
    } catch (_) {}
  }

  updateLastTokens() {
    const u = this.provider?.lastUsage;
    if (!u) return;
    if (this.elements.tokensInLast) this.elements.tokensInLast.textContent = u.prompt_tokens || 0;
    if (this.elements.tokensOutLast) this.elements.tokensOutLast.textContent = u.completion_tokens || 0;
  }

  setBudgetBadge(exceeded) {
    const badge = this.elements.budgetBadge;
    if (!badge) return;
    badge.textContent = exceeded ? 'Budget: EXCEEDED' : 'Budget: OK';
    badge.className = 'status-badge ' + (exceeded ? 'disconnected' : 'connected');
  }

  bindUI() {
    this.elements.btnStart.addEventListener('click', async () => {
      if (!this.isRunning) {
        this.isRunning = true;
        this.elements.btnStart.textContent = 'Stop';
        try {
          await this.connectWebSocket();
        } catch (e) {
          this.log('WS error:', e?.message || e);
          this.isRunning = false;
          this.elements.btnStart.textContent = 'Start';
          return;
        }
        if (this.elements.viewerFrame) {
          this.elements.viewerFrame.src = this.elements.viewerUrl?.value || '/viewer2';
        }
        if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = 'LLM: Active (server key)';
        this.mainLoop();
      } else {
        this.isRunning = false;
        this.elements.btnStart.textContent = 'Start';
        this.cancelPendingPixels();
        try { this.socket?.close(); } catch (_) {}
      }
    });

    this.elements.btnPause?.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      this.elements.btnPause.textContent = this.isPaused ? 'Reprendre' : 'Pause';
    });

    // Choix du modele au lancement (verrouille pendant l'execution)
    this.elements.modelSelect?.addEventListener('change', () => {
      if (this.isRunning) {
        this.elements.modelSelect.value = this.model;
        this.log('Modele verrouille pendant l\'execution. Stop puis change.');
        return;
      }
      this.model = this.elements.modelSelect.value;
      if (this.elements.headerModel) this.elements.headerModel.textContent = this.model;
      this.log('Modele selectionne:', this.model);
    });

    // Onglets
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach(p => p.classList.remove('active'));
        document.getElementById(`tab-${target}`)?.classList.add('active');
      });
    });
  }

  cancelPendingPixels() {
    this.pendingPixelTimeouts.forEach(id => clearTimeout(id));
    this.pendingPixelTimeouts = [];
  }

  setMode(m) {
    this.promptMode = m;
    if (this.elements.modeLabel) this.elements.modeLabel.textContent = m;
  }

  async fetchOSnapshot() {
    try {
      const res = await fetch(`${this.O_API_BASE}/o/latest?agent_id=${encodeURIComponent(this.myUserId || '')}`);
      if (res.ok) { this.Osnapshot = await res.json(); return this.Osnapshot; }
    } catch (_) {}
    return null;
  }

  // === Capture images (identique V4) ===
  getViewerCanvas() {
    try {
      const doc = this.elements.viewerFrame?.contentWindow?.document;
      if (!doc) return null;
      return doc.querySelector('canvas') || null;
    } catch (_) { return null; }
  }

  addDebugImage(label, dataUrl) {
    try {
      const container = document.getElementById('llm-images');
      if (!container || !dataUrl) return;
      const placeholder = container.querySelector('.image-placeholder');
      if (placeholder) placeholder.remove();
      const item = document.createElement('div');
      item.className = 'image-item';
      const title = document.createElement('div');
      title.className = 'image-label';
      title.textContent = label;
      const img = document.createElement('img');
      img.className = 'image-thumbnail';
      img.src = dataUrl;
      item.appendChild(title);
      item.appendChild(img);
      container.prepend(item);
      const items = container.querySelectorAll('.image-item');
      for (let i = 6; i < items.length; i++) {
        const oldImg = items[i].querySelector('img');
        if (oldImg && oldImg.src && oldImg.src.startsWith('data:')) oldImg.src = '';
        items[i].remove();
      }
    } catch (_) {}
  }

  async captureGlobalSnapshot(label) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = this.getViewerCanvas();
      if (canvas && canvas.width && canvas.height) {
        try {
          const url = canvas.toDataURL('image/png');
          if (url) { this.addDebugImage(label, url); return url; }
        } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 200));
    }
    try {
      let gen = window.LlavaCanvasGenerator;
      if (!gen) {
        const mod = await import('/js/llava-canvas.js?v=20250124-053');
        gen = mod?.LlavaCanvasGenerator || window.LlavaCanvasGenerator;
      }
      if (gen && this.otherUsers) {
        const result = gen.generateGlobalCanvas(this.otherUsers, this.myUserId);
        const dataUrl = result?.pureCanvas ? `data:image/png;base64,${result.pureCanvas}` : null;
        if (dataUrl) { this.addDebugImage(label, dataUrl); return dataUrl; }
      }
    } catch (_) {}
    return null;
  }

  captureLocalCanvasBase64() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      const ctx = canvas.getContext('2d');
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          ctx.fillStyle = this.myCellState[`${x},${y}`] || '#000000';
          ctx.fillRect(x * 10, y * 10, 10, 10);
        }
      }
      return canvas.toDataURL('image/png');
    } catch (_) { return null; }
  }

  // === WebSocket (identique V4) ===
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.WS_URL);
      let lastMessageAt = Date.now();
      const watchdog = setInterval(() => {
        const idle = Date.now() - lastMessageAt;
        if (this.socket && this.socket.readyState === WebSocket.OPEN && idle < 40000) {
          if (this.elements.statusBadge) this.elements.statusBadge.textContent = 'Connected';
        }
      }, 3000);

      this.socket.onopen = () => {
        this.log('Connecte au Poietic Generator (V6)');
        if (this.elements.statusBadge) this.elements.statusBadge.textContent = 'Connected';
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        lastMessageAt = Date.now();
        const message = JSON.parse(event.data);
        if (message.type === 'initial_state' && !this.myUserId) {
          if (message.my_user_id) {
            this.myUserId = message.my_user_id;
            if (this.elements.userIdDisplay) this.elements.userIdDisplay.textContent = this.myUserId.substring(0, 8) + '...';
          }
          const gridState = typeof message.grid_state === 'string' ? JSON.parse(message.grid_state) : message.grid_state;
          const pos = gridState?.user_positions?.[this.myUserId];
          if (Array.isArray(pos) && pos.length === 2) {
            this.myPosition = [parseInt(pos[0]), parseInt(pos[1])];
            if (this.elements.headerPosition) this.elements.headerPosition.textContent = `[${this.myPosition[0]}, ${this.myPosition[1]}]`;
          }
          resolve();
        }
        if (message.type === 'initial_state') {
          const gridState = typeof message.grid_state === 'string' ? JSON.parse(message.grid_state) : message.grid_state;
          const userPositions = gridState?.user_positions || {};
          Object.keys(userPositions).forEach(uid => {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: userPositions[uid] };
          });
          const subs = message.sub_cell_states || {};
          Object.entries(subs).forEach(([uid, pixels]) => {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: userPositions[uid] || [0, 0] };
            const map = {};
            Object.entries(pixels).forEach(([k, color]) => { map[k] = color; });
            this.otherUsers[uid].pixels = map;
          });
          if (this.myUserId) {
            if (!this.otherUsers[this.myUserId]) this.otherUsers[this.myUserId] = { pixels: {}, position: this.myPosition };
            this.otherUsers[this.myUserId].pixels = { ...this.otherUsers[this.myUserId].pixels, ...this.myCellState };
          }
        } else if (message.type === 'cell_update') {
          const uid = message.user_id;
          if (uid) {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: [0, 0] };
            const key = `${message.sub_x},${message.sub_y}`;
            this.otherUsers[uid].pixels[key] = message.color;
            if (uid === this.myUserId) this.myCellState[key] = message.color;
          }
        } else if (message.type === 'new_user') {
          const uid = message.user_id;
          if (uid && !this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: message.position || [0, 0] };
        }
      };

      this.socket.onerror = (err) => { clearInterval(watchdog); this.stopHeartbeat(); reject(err); };
      this.socket.onclose = () => {
        clearInterval(watchdog); this.stopHeartbeat();
        if (this.elements.statusBadge) this.elements.statusBadge.textContent = 'Disconnected';
      };
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
  }

  // Appel provider commun (seed/action), avec parametres cout
  // maxTokens : le seed remplit toute la grille (plus de pixels) -> budget plus
  // large pour eviter la troncature avant le champ "pixels".
  async callProvider(systemText, images, maxTokens = 3000) {
    return this.provider.callAPI(systemText, images, {
      model: this.model,
      sessionId: this.sessionId,
      agentId: this.myUserId || 'unknown',
      maxTokens,
    });
  }

  async pushImageAndAgents(globalUrl) {
    try {
      if (!globalUrl) return;
      const agentsCount = Object.keys(this.otherUsers || {}).length;
      await fetch(`${this.O_API_BASE}/o/image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: globalUrl, agents_count: agentsCount }),
      });
      await fetch(`${this.O_API_BASE}/o/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: agentsCount }),
      });
    } catch (_) {}
  }

  async mainLoop() {
    if (this.iterationCount === 0) {
      await new Promise(r => setTimeout(r, Math.random() * 3000));
    }

    while (this.isRunning) {
      if (this.isPaused) { await new Promise(r => setTimeout(r, 500)); continue; }

      this.setMode(this.iterationCount === 0 ? 'seed' : 'action');
      const ctx = { myX: this.myPosition[0], myY: this.myPosition[1] };

      if (this.promptMode === 'seed') {
        await this.fetchOSnapshot();
        if (this.Osnapshot?.version !== undefined) this.lastOVersionSeen = this.Osnapshot.version;

        const systemText = await this.provider.buildSystemPrompt('seed', ctx);
        const globalUrlBefore = await this.captureGlobalSnapshot('W seed - global (before)');
        const localUrl = this.captureLocalCanvasBase64();

        let parsed = null, pixelsToExecute = [];
        try {
          // Seed : budget tokens plus large (grille complete + raisonnement)
          const raw = await this.callProvider(systemText, { globalImageBase64: globalUrlBefore, localImageBase64: localUrl }, 4000);
          if (localUrl) this.addDebugImage('W input - local 20x20', localUrl);
          if (!raw || raw.trim().length === 0) this.log('Seed: reponse vide du modele (raisonnement a peut-etre consomme le budget).');
          parsed = this.provider.parseJSONResponse(raw);
          this.storeVerbatimResponse('W', parsed, this.iterationCount);
          pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
          if (pixelsToExecute.length === 0) this.log('Seed: 0 pixel parse -> fallback (verifier troncature/format).');
          this.updateLastTokens();
          this.setBudgetBadge(false);
        } catch (error) {
          this.log(`Erreur seed: ${error.message}`);
          if (/budget/i.test(error.message)) { this.setBudgetBadge(true); this.isPaused = true; }
          this.storeVerbatimResponse('W', { seed: { concept: 'Erreur API', rationale: error.message }, pixels: [] }, this.iterationCount);
        }

        if (pixelsToExecute.length === 0) {
          const c = 10, color = '#F5D142';
          pixelsToExecute = [
            { x: c, y: c - 1 }, { x: c, y: c + 1 }, { x: c - 1, y: c }, { x: c + 1, y: c },
            { x: c - 1, y: c - 1 }, { x: c + 1, y: c - 1 }, { x: c - 1, y: c + 1 }, { x: c + 1, y: c + 1 },
          ].map(p => `${p.x},${p.y}${color}`);
        }

        await this.executePixels(pixelsToExecute);
        await new Promise(r => setTimeout(r, 2000));
        const globalUrlAfter = await this.captureGlobalSnapshot('W seed - global (after)');
        await this.pushImageAndAgents(globalUrlAfter);

        this.lastOVersionAtAction = this.Osnapshot?.version ?? this.lastOVersionSeen;
        this.prevPredictions = parsed?.predictions || null;

      } else {
        await this.fetchOSnapshot();
        const currentOVersion = this.Osnapshot?.version ?? -1;
        const isFirstAction = this.iterationCount === 1;

        if (!isFirstAction && currentOVersion <= this.lastOVersionAtAction) {
          const maxWaitAttempts = 15;
          let waitAttempts = (this._waitAttempts || 0) + 1;
          this._waitAttempts = waitAttempts;
          if (waitAttempts >= maxWaitAttempts) {
            this.log(`Timeout attente snapshot O (${waitAttempts}), utilisation snapshot v${currentOVersion}`);
            this._waitAttempts = 0;
          } else {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
        } else {
          this._waitAttempts = 0;
          this.lastOVersionSeen = currentOVersion;
        }

        if (this.Osnapshot) {
          this.storeVerbatimResponse('O', this.Osnapshot, this.iterationCount);
          this.updateOMetrics(this.Osnapshot);
        }

        ctx.C_w = this.Osnapshot?.simplicity_assessment?.C_w_current?.value ?? null;
        ctx.C_d = this.Osnapshot?.simplicity_assessment?.C_d_current?.value ?? null;
        ctx.U = this.Osnapshot?.simplicity_assessment?.U_current?.value ?? null;
        ctx.lastObservation = this.Osnapshot || null;
        ctx.prevPredictions = this.prevPredictions || null;
        ctx.neighborColors = this.extractNeighborColors();

        const systemText = await this.provider.buildSystemPrompt('action', ctx);
        const globalUrlBefore = await this.captureGlobalSnapshot('W action - global (before)');
        const localUrl = this.captureLocalCanvasBase64();

        let parsed = null, pixelsToExecute = [];
        try {
          const raw = await this.callProvider(systemText, { globalImageBase64: globalUrlBefore, localImageBase64: localUrl });
          if (localUrl) this.addDebugImage('W input - local 20x20', localUrl);
          parsed = this.provider.parseJSONResponse(raw);
          this.storeVerbatimResponse('W', parsed, this.iterationCount);
          pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
          this.updateLastTokens();
          this.setBudgetBadge(false);
        } catch (error) {
          this.log(`Erreur action: ${error.message}`);
          if (/budget/i.test(error.message)) { this.setBudgetBadge(true); this.isPaused = true; }
          this.storeVerbatimResponse('W', { strategy: 'ERROR', rationale: error.message, pixels: [] }, this.iterationCount);
        }

        const prevPred = this.prevPredictions?.collective_after_prediction || '';
        const narrativeNow = this.Osnapshot?.narrative?.summary || '';
        const err = SimplicityMetrics.predictionError(prevPred, narrativeNow);
        if (this.elements.predError) this.elements.predError.textContent = err.toFixed(2);

        const deltas = SimplicityMetrics.estimateDeltaBits({
          strategy: parsed?.strategy, inStructure: true, colorCohesion: true, symmetry: false, anchors: 1,
        });

        await this.executePixels(pixelsToExecute);
        await new Promise(r => setTimeout(r, 2000));
        const globalUrlAfter = await this.captureGlobalSnapshot('W action - global (after)');
        await this.pushImageAndAgents(globalUrlAfter);

        this.lastOVersionAtAction = this.Osnapshot?.version ?? this.lastOVersionSeen;
        this.prevPredictions = parsed?.predictions || null;

        const CwBefore = ctx.C_w || 0, CdBefore = ctx.C_d || 0;
        const CwAfter = CwBefore + (deltas.deltaCwBits || 0);
        const CdAfter = Math.max(0, CdBefore - (deltas.deltaCdBits || 0));
        this.updateWMetrics(CwAfter, CdAfter, CwAfter - CdAfter);
      }

      this.updateCostPanel();
      this.iterationCount++;
      const waitMs = Math.max(0, (parseInt(this.elements.interval.value) || 0) * 1000);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  extractNeighborColors() {
    if (!this.otherUsers || !this.myPosition) return null;
    const [myX, myY] = this.myPosition;
    const neighbors = [
      { pos: [myX - 1, myY], name: 'left (W)' }, { pos: [myX + 1, myY], name: 'right (E)' },
      { pos: [myX, myY - 1], name: 'above (N)' }, { pos: [myX, myY + 1], name: 'below (S)' },
      { pos: [myX - 1, myY - 1], name: 'top-left (NW)' }, { pos: [myX + 1, myY - 1], name: 'top-right (NE)' },
      { pos: [myX - 1, myY + 1], name: 'bottom-left (SW)' }, { pos: [myX + 1, myY + 1], name: 'bottom-right (SE)' },
    ];
    const info = [];
    for (const nb of neighbors) {
      const [nbX, nbY] = nb.pos;
      const agent = Object.values(this.otherUsers).find(u => {
        const [ax, ay] = u.position || [0, 0];
        return ax === nbX && ay === nbY;
      });
      if (agent && agent.pixels && Object.keys(agent.pixels).length > 0) {
        const colors = new Set();
        Object.values(agent.pixels).forEach(color => {
          if (color && color !== '#000000' && color !== '#000' && color !== 'transparent') colors.add(color.toUpperCase());
        });
        if (colors.size > 0) {
          info.push({ position: `[${nbX},${nbY}]`, direction: nb.name, colors: Array.from(colors).slice(0, 5) });
        }
      }
    }
    return info.length > 0 ? info : null;
  }

  async executePixels(pixelList) {
    if (!Array.isArray(pixelList) || pixelList.length === 0) return Promise.resolve(0);
    const pixels = pixelList.map(p => {
      if (typeof p === 'string' && p.includes('#') && p.includes(',')) {
        const [coords, color] = p.split('#');
        const [x, y] = coords.split(',');
        return { x: parseInt(x, 10), y: parseInt(y, 10), color: '#' + color };
      }
      return p;
    }).filter(p => Number.isInteger(p.x) && Number.isInteger(p.y) && typeof p.color === 'string');

    for (const px of pixels) {
      px.x = Math.max(0, Math.min(19, px.x));
      px.y = Math.max(0, Math.min(19, px.y));
    }

    const delayPerPixel = Math.max(30, Math.floor(10000 / Math.max(1, pixels.length)));
    this.cancelPendingPixels();

    return new Promise((resolve) => {
      if (pixels.length === 0) { resolve(0); return; }
      let sentCount = 0;
      const total = pixels.length;
      for (let i = 0; i < pixels.length; i++) {
        const timeoutId = setTimeout(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'cell_update', sub_x: pixels[i].x, sub_y: pixels[i].y, color: pixels[i].color }));
            this.myCellState[`${pixels[i].x},${pixels[i].y}`] = pixels[i].color;
          }
          if (++sentCount === total) resolve(total);
        }, i * delayPerPixel);
        this.pendingPixelTimeouts.push(timeoutId);
      }
      setTimeout(() => { if (sentCount < total) resolve(sentCount); }, (pixels.length * delayPerPixel) + 2000);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => new AIPlayerV6());
