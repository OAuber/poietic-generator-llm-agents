import { SimplicityMetrics } from './simplicity-metrics.js';

class AIPlayerV4 {
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

    this.lastObservation = null; // from O snapshot
    this.prevPredictions = null; // from W memory
    this.Osnapshot = null; // {C_w,C_d,U, narrative, structures}

    // Métriques pour graphiques
    this.oMetrics = { versions: [], C_w: [], C_d: [], U: [] };
    this.wMetrics = { iterations: [], C_w: [], C_d: [], U: [] };

    // URLs
    const loc = window.location;
    const WS_PROTOCOL = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_HOST = loc.host;
    this.WS_URL = `${WS_PROTOCOL}//${WS_HOST}/updates?type=bot`;
    // O-machine server assumed on port 8004 by default
    this.O_API_BASE = loc.origin.replace(/:\d+$/, ':8004');

    this.elements = {
      apiKey: document.getElementById('api-key'),
      interval: document.getElementById('interval'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      modeLabel: document.getElementById('v4-mode'),
      journal: document.getElementById('journal'),
      predError: document.getElementById('prediction-error'),
      viewerFrame: document.getElementById('viewer-frame'),
      viewerUrl: document.getElementById('viewer-url'),
      headerPosition: document.getElementById('header-position'),
      userIdDisplay: document.getElementById('user-id-display'),
      statusBadge: document.getElementById('status-badge'),
      llmStatusBadge: document.getElementById('llm-status-badge')
    };

    this.bindUI();

    // Initialiser la clé API depuis le stockage et synchroniser l'UI
    try {
      const saved = window.GeminiV4Adapter?.getApiKey?.() || '';
      if (this.elements.apiKey && !this.elements.apiKey.value && saved) {
        this.elements.apiKey.value = saved;
      }
      if (window.GeminiV4Adapter) {
        window.GeminiV4Adapter.apiKey = saved;
      }
    } catch (_) {}

    // Synchronisation inter-onglets
    window.addEventListener('storage', (e) => {
      if (e.key === 'gemini_api_key') {
        const v = e.newValue || '';
        if (this.elements.apiKey) this.elements.apiKey.value = v;
        if (window.GeminiV4Adapter) window.GeminiV4Adapter.apiKey = v;
        if (this.elements.llmStatusBadge) {
          this.elements.llmStatusBadge.textContent = v ? 'LLM: Active' : 'LLM: Inactive';
        }
      }
    });
  }

  log(...args) {
    if (this.elements.journal) {
      this.elements.journal.textContent += args.join(' ') + '\n';
      this.elements.journal.scrollTop = this.elements.journal.scrollHeight;
    }
    console.log('[V4]', ...args);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
      // Format O snapshot (structures, narrative, simplicity)
      const s = data?.simplicity_assessment || {};
      const structs = data?.structures || [];
      const narr = data?.narrative?.summary || '';
      const reasoning = s?.reasoning || '';
      content = 
        `🔍 O-MACHINE (Observation/Narration)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\n📊 SIMPLICITY ASSESSMENT\n` +
        `C_w: ${s.C_w_current?.value ?? 'N/A'} bits | ` +
        `C_d: ${s.C_d_current?.value ?? 'N/A'} bits | ` +
        `U: ${s.U_current?.value ?? 'N/A'} bits\n` +
        `Interpretation: ${s.U_current?.interpretation || 'N/A'}\n` +
        `\n📐 STRUCTURES (${structs.length})\n`;
      structs.forEach((st, i) => {
        content += `  ${i+1}. ${st.type} (${st.size_agents} agents, salience: ${st.salience}, Cd rank: ${st.rank_Cd}, Cw rank: ${st.rank_Cw})\n`;
      });
      if (structs.length === 0) content += `  (none detected)\n`;
      content += `\n📖 NARRATIVE\n${narr || '(none)'}\n`;
      if (reasoning) {
        content += `\n🧠 REASONING (Step-by-step calculation)\n${reasoning}\n`;
      }
    } else if (source === 'W') {
      // Format W response (seed/action)
      if (iteration === 0) {
        // Seed format
        const seed = data?.seed || {};
        const preds = data?.predictions || {};
        const pixels = data?.pixels || [];
        content =
          `🌱 W-MACHINE (Seed Generation)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\n💡 CONCEPT\n${seed.concept || 'N/A'}\n` +
          `\n💭 RATIONALE\n${seed.rationale || 'N/A'}\n` +
          `\n🔮 PREDICTIONS\n` +
          `Individual: ${preds.individual_after_prediction || 'N/A'}\n` +
          `Collective: ${preds.collective_after_prediction || 'N/A'}\n` +
          `\n📊 PIXELS: ${pixels.length} generated\n`;
      } else {
        // Action format
        const strategy = data?.strategy || 'N/A';
        const rationale = data?.rationale || '';
        const preds = data?.predictions || {};
        const delta = data?.delta_complexity || {};
        const pixels = data?.pixels || [];
        content =
          `⚡ W-MACHINE (Action/Generation)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\n🎯 STRATEGY\n${strategy}\n` +
          `\n💭 RATIONALE\n${rationale || 'N/A'}\n` +
          `\n📈 DELTA COMPLEXITY\n` +
          `ΔC_w: ${delta.delta_C_w_bits ?? 'N/A'} bits | ` +
          `ΔC_d: ${delta.delta_C_d_bits ?? 'N/A'} bits | ` +
          `U' expected: ${delta.U_after_expected ?? 'N/A'} bits\n` +
          `\n🔮 PREDICTIONS\n` +
          `Individual: ${preds.individual_after_prediction || 'N/A'}\n` +
          `Collective: ${preds.collective_after_prediction || 'N/A'}\n` +
          `\n📊 PIXELS: ${pixels.length} generated\n`;
      }
    }

    item.innerHTML = `
      <div class="response-header">
        <span class="response-timestamp">${timestamp}</span>
        <span class="response-iteration">${source} | Iter ${iteration}</span>
      </div>
      <div class="response-content">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; line-height: 1.4;">${this.escapeHtml(content)}</pre>
      </div>
    `;

    container.insertBefore(item, container.firstChild);
    // Garder seulement les 10 dernières réponses
    while (container.children.length > 10) {
      container.removeChild(container.lastChild);
    }
  }

  // === Graphiques de métriques ===
  updateOMetrics(snapshot) {
    if (!snapshot || !snapshot.simplicity_assessment) return;
    const s = snapshot.simplicity_assessment;
    const version = snapshot.version || 0;
    const C_w = s.C_w_current?.value || 0;
    const C_d = s.C_d_current?.value || 0;
    const U = s.U_current?.value || 0;

    this.oMetrics.versions.push(version);
    this.oMetrics.C_w.push(C_w);
    this.oMetrics.C_d.push(C_d);
    this.oMetrics.U.push(U);

    // Mettre à jour l'affichage texte
    const oVersion = document.getElementById('o-version');
    const oCw = document.getElementById('o-cw');
    const oCd = document.getElementById('o-cd');
    const oU = document.getElementById('o-u');
    if (oVersion) oVersion.textContent = version;
    if (oCw) oCw.textContent = Math.round(C_w);
    if (oCd) oCd.textContent = Math.round(C_d);
    if (oU) oU.textContent = Math.round(U);

    this.drawOChart();
  }

  updateWMetrics(C_w, C_d, U) {
    const iter = this.iterationCount;
    this.wMetrics.iterations.push(iter);
    this.wMetrics.C_w.push(C_w);
    this.wMetrics.C_d.push(C_d);
    this.wMetrics.U.push(U);

    // Mettre à jour l'affichage texte
    const wIter = document.getElementById('w-iteration');
    const wCw = document.getElementById('w-cw');
    const wCd = document.getElementById('w-cd');
    const wU = document.getElementById('w-u');
    if (wIter) wIter.textContent = iter;
    if (wCw) wCw.textContent = Math.round(C_w);
    if (wCd) wCd.textContent = Math.round(C_d);
    if (wU) wU.textContent = Math.round(U);

    this.drawWChart();
  }

  drawOChart() {
    const canvas = document.getElementById('simplicity-chart-o');
    if (!canvas) return;
    if (!canvas.width || canvas.width === 0) canvas.width = canvas.offsetWidth || 400;
    if (!canvas.height || canvas.height === 0) canvas.height = canvas.offsetHeight || 120;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const data = this.oMetrics;
    if (!data.versions || data.versions.length === 0) return;

    const allValues = [...data.C_w, ...data.C_d, ...data.U.map(u => Math.abs(u))];
    const maxY = Math.max(...allValues, 1);
    if (maxY === 0) return;

    const numPoints = data.versions.length;
    const scaleX = numPoints > 1 ? width / (numPoints - 1) : width;
    const scaleY = (height - 20) / maxY;

    this.drawCurve(ctx, data.versions, data.C_w, scaleX, scaleY, height, '#4A90E2');
    this.drawCurve(ctx, data.versions, data.C_d, scaleX, scaleY, height, '#E24A4A');
    this.drawCurve(ctx, data.versions, data.U, scaleX, scaleY, height, '#4AE290');

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 10);
    ctx.lineTo(width, height - 10);
    ctx.stroke();
  }

  drawWChart() {
    const canvas = document.getElementById('simplicity-chart-w');
    if (!canvas) return;
    if (!canvas.width || canvas.width === 0) canvas.width = canvas.offsetWidth || 400;
    if (!canvas.height || canvas.height === 0) canvas.height = canvas.offsetHeight || 120;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const data = this.wMetrics;
    if (!data.iterations || data.iterations.length === 0) return;

    const allValues = [...data.C_w, ...data.C_d, ...data.U.map(u => Math.abs(u))];
    const maxY = Math.max(...allValues, 1);
    if (maxY === 0) return;

    const numPoints = data.iterations.length;
    const scaleX = numPoints > 1 ? width / (numPoints - 1) : width;
    const scaleY = (height - 20) / maxY;

    this.drawCurve(ctx, data.iterations, data.C_w, scaleX, scaleY, height, '#4A90E2');
    this.drawCurve(ctx, data.iterations, data.C_d, scaleX, scaleY, height, '#E24A4A');
    this.drawCurve(ctx, data.iterations, data.U, scaleX, scaleY, height, '#4AE290');

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 10);
    ctx.lineTo(width, height - 10);
    ctx.stroke();
  }

  drawCurve(ctx, indices, values, scaleX, scaleY, height, color) {
    if (values.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = i * scaleX;
      const y = height - 10 - (values[i] * scaleY);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  bindUI() {
    this.elements.btnStart.addEventListener('click', async () => {
      if (!this.isRunning) {
        this.isRunning = true;
        this.elements.btnStart.textContent = '■ Stop';
        try {
          await this.connectWebSocket();
        } catch (e) {
          this.log('WS error:', e?.message || e);
          this.isRunning = false;
          this.elements.btnStart.textContent = '▶ Start';
          return;
        }
        // Ensure viewer switches from QR (no session) to session view
        if (this.elements.viewerFrame) {
          const selected = this.elements.viewerUrl?.value || '/viewer2';
          this.elements.viewerFrame.src = selected;
        }
        this.mainLoop();
      } else {
        this.isRunning = false;
        this.elements.btnStart.textContent = '▶ Start';
        this.cancelPendingPixels();
        try { this.socket?.close(); } catch(_) {}
      }
    });

    this.elements.btnPause.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      this.elements.btnPause.textContent = this.isPaused ? '▶ Reprendre' : '⏸ Pause';
    });

    // Sauvegarde de la clé API (partagée entre onglets via localStorage)
    if (this.elements.apiKey) {
      const persist = () => {
        const v = this.elements.apiKey.value || '';
        try { localStorage.setItem('gemini_api_key', v); } catch(_) {}
        if (window.GeminiV4Adapter) window.GeminiV4Adapter.apiKey = v;
        if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = v ? 'LLM: Active' : 'LLM: Inactive';
      };
      this.elements.apiKey.addEventListener('change', persist);
      this.elements.apiKey.addEventListener('blur', persist);
    }

    // Activer la navigation par onglets (comme V3)
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach(panel => {
          panel.classList.remove('active');
        });
        const panel = document.getElementById(`tab-${target}`);
        if (panel) panel.classList.add('active');
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
      const res = await fetch(`${this.O_API_BASE}/o/latest`);
      if (res.ok) {
        this.Osnapshot = await res.json();
        return this.Osnapshot;
      }
    } catch (_) {}
    return null;
  }

  // === Debug images helpers ===
  getViewerCanvas() {
    try {
      const doc = this.elements.viewerFrame?.contentWindow?.document;
      if (!doc) return null;
      // Try to grab the main canvas of viewer2
      const canvas = doc.querySelector('canvas');
      return canvas || null;
    } catch (_) { return null; }
  }

  addDebugImage(label, dataUrl) {
    try {
      const container = document.getElementById('llm-images');
      if (!container || !dataUrl) return;
      // Retirer le placeholder si présent
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
      // Limiter le nombre d'images conservées pour éviter la saturation mémoire
      const MAX_IMAGES = 6;
      const items = container.querySelectorAll('.image-item');
      for (let i = MAX_IMAGES; i < items.length; i++) {
        items[i].remove();
      }
    } catch (_) {}
  }

  async captureGlobalSnapshot(label) {
    // 1) Essayer plusieurs fois de capturer le canvas du viewer
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = this.getViewerCanvas();
      if (canvas && canvas.width && canvas.height) {
        try {
          const url = canvas.toDataURL('image/png');
          if (url) {
            this.addDebugImage(label, url);
            return url;
          }
        } catch (_) { /* continue to retry */ }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // 2) Fallback: régénérer via LlavaCanvasGenerator (comme V3)
    try {
      let gen = window.LlavaCanvasGenerator;
      if (!gen) {
        const mod = await import('/js/llava-canvas.js?v=20250124-053');
        gen = mod?.LlavaCanvasGenerator || window.LlavaCanvasGenerator;
      }
      if (gen && this.otherUsers) {
        const result = gen.generateGlobalCanvas(this.otherUsers, this.myUserId);
        const dataUrl = result?.pureCanvas ? `data:image/png;base64,${result.pureCanvas}` : null;
        if (dataUrl) {
          this.addDebugImage(label, dataUrl);
          return dataUrl;
        }
      }
    } catch (_) { /* ignore */ }

    return null;
  }

  captureLocalCanvasBase64() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const color = this.myCellState[`${x},${y}`] || '#000000';
          ctx.fillStyle = color;
          ctx.fillRect(x * 10, y * 10, 10, 10);
        }
      }
      return canvas.toDataURL('image/png');
    } catch (_) { return null; }
  }

  // === WebSocket (session + viewer sync) ===
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
        this.log('✅ Connecté au Poietic Generator (V4)');
        if (this.elements.statusBadge) this.elements.statusBadge.textContent = 'Connected';
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        lastMessageAt = Date.now();
        const message = JSON.parse(event.data);
        if (message.type === 'initial_state' && !this.myUserId) {
          if (message.my_user_id) {
            this.myUserId = message.my_user_id;
            if (this.elements.userIdDisplay) this.elements.userIdDisplay.textContent = this.myUserId.substring(0,8) + '…';
          }
          // positions
          const gridState = typeof message.grid_state === 'string' ? JSON.parse(message.grid_state) : message.grid_state;
          const pos = gridState?.user_positions?.[this.myUserId];
          if (Array.isArray(pos) && pos.length === 2) {
            this.myPosition = [parseInt(pos[0]), parseInt(pos[1])];
            if (this.elements.headerPosition) this.elements.headerPosition.textContent = `[${this.myPosition[0]}, ${this.myPosition[1]}]`;
          }
          resolve();
        }

        // Peupler otherUsers et états pour génération d'image globale
        if (message.type === 'initial_state') {
          // user_positions (optionnel)
          const gridState = typeof message.grid_state === 'string' ? JSON.parse(message.grid_state) : message.grid_state;
          const userPositions = gridState?.user_positions || {};
          Object.keys(userPositions).forEach(uid => {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: userPositions[uid] };
          });
          // sub_cell_states
          const subs = message.sub_cell_states || {};
          Object.entries(subs).forEach(([uid, pixels]) => {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: userPositions[uid] || [0,0] };
            const map = {};
            Object.entries(pixels).forEach(([k, color]) => { map[k] = color; });
            this.otherUsers[uid].pixels = map;
          });
          // Inclure nos pixels si connus
          if (this.myUserId) {
            if (!this.otherUsers[this.myUserId]) this.otherUsers[this.myUserId] = { pixels: {}, position: this.myPosition };
            this.otherUsers[this.myUserId].pixels = { ...this.otherUsers[this.myUserId].pixels, ...this.myCellState };
          }
        } else if (message.type === 'cell_update') {
          const uid = message.user_id;
          if (uid) {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: [0,0] };
            const key = `${message.sub_x},${message.sub_y}`;
            this.otherUsers[uid].pixels[key] = message.color;
            if (uid === this.myUserId) this.myCellState[key] = message.color;
          }
        } else if (message.type === 'new_user') {
          const uid = message.user_id;
          if (uid) {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {}, position: message.position || [0,0] };
          }
        }
      };

      this.socket.onerror = (err) => {
        clearInterval(watchdog);
        this.stopHeartbeat();
        reject(err);
      };

      this.socket.onclose = () => {
        clearInterval(watchdog);
        this.stopHeartbeat();
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
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async mainLoop() {
    while (this.isRunning) {
      if (this.isPaused) { await new Promise(r => setTimeout(r, 500)); continue; }

      // Determine mode
      if (this.iterationCount === 0) this.setMode('seed');
      else this.setMode((this.iterationCount % 2 === 1) ? 'observation' : 'action');

      // Build context
      const ctx = {
        myX: this.myPosition[0],
        myY: this.myPosition[1]
      };

      if (this.promptMode === 'observation') {
        // Server-side O will run periodically; here we just wait for fresh snapshot
        await this.fetchOSnapshot();
        this.lastObservation = this.Osnapshot || null;
        this.log('Obs snapshot:', JSON.stringify(this.Osnapshot)?.slice(0, 200));
        // Afficher dans Verbatim
        if (this.Osnapshot) {
          this.storeVerbatimResponse('O', this.Osnapshot, this.iterationCount);
          // Mettre à jour le graphique O
          this.updateOMetrics(this.Osnapshot);
        }
        // Debug: montrer l'image globale observée
        const oGlobal = await this.captureGlobalSnapshot('O input — global canvas');
        // Publier aussi au serveur O pour mise à jour de l'image globale
        try {
          if (oGlobal) {
            const agentsCount = Object.keys(this.otherUsers || {}).length;
            await fetch(`${this.O_API_BASE}/o/image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_base64: oGlobal, agents_count: agentsCount })
            });
            await fetch(`${this.O_API_BASE}/o/agents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ count: agentsCount })
            });
          }
        } catch (_) {}
      } else {
        // action: fetch latest O first
        await this.fetchOSnapshot();
        // Vérifier la présence de la clé API avant appel LLM
        const apiKey = window.GeminiV4Adapter?.getApiKey?.() || '';
        if (!apiKey) {
          this.log('Clé API Gemini manquante — action ignorée jusqu\'à saisie.');
          if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = 'LLM: Inactive';
          // Attendre un court délai et passer à l\'itération suivante (sans erreur)
          await new Promise(r => setTimeout(r, 1000));
          this.iterationCount++;
          const waitMs = Math.max(0, (parseInt(this.elements.interval.value)||0) * 1000);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        } else {
          if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = 'LLM: Active';
        }
        ctx.C_w = this.Osnapshot?.simplicity_assessment?.C_w_current?.value ?? null;
        ctx.C_d = this.Osnapshot?.simplicity_assessment?.C_d_current?.value ?? null;
        ctx.U   = this.Osnapshot?.simplicity_assessment?.U_current?.value ?? null;
        ctx.lastObservation = this.Osnapshot || null;
        ctx.prevPredictions = this.prevPredictions || null;
        // Mettre à jour le graphique O si snapshot disponible
        if (this.Osnapshot) this.updateOMetrics(this.Osnapshot);

        // Extraire les couleurs des voisins pour faciliter la coordination
        const neighborColors = this.extractNeighborColors();
        ctx.neighborColors = neighborColors;

        // Build prompt via adapter and call API
        const systemText = await window.GeminiV4Adapter.buildSystemPrompt(
          this.iterationCount === 0 ? 'seed' : 'action', ctx
        );
        // Debug + images pour Gemini (capture AVANT les pixels - c'est OK pour W qui doit voir l'état actuel)
        const globalUrlBefore = await this.captureGlobalSnapshot(this.iterationCount === 0 ? 'W seed — global canvas (before)' : 'W action — global canvas (before)');
        const localUrl = this.captureLocalCanvasBase64();
        const raw = await window.GeminiV4Adapter.callAPI(systemText, {
          globalImageBase64: globalUrlBefore,
          localImageBase64: localUrl
        });
        if (localUrl) this.addDebugImage('W input — local 20x20', localUrl);
        const parsed = window.GeminiV4Adapter.parseJSONResponse(raw);
        // Afficher dans Verbatim
        this.storeVerbatimResponse('W', parsed, this.iterationCount);

        // Fallback seed: si itération 0 et aucun pixel retourné, générer un seed minimal local
        let pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
        if (this.iterationCount === 0 && pixelsToExecute.length === 0) {
          // Petit motif circulaire (8 px) au centre de la grille 20x20
          const center = 10;
          const color = '#F5D142';
          const ring = [
            {x:center, y:center-1}, {x:center, y:center+1},
            {x:center-1, y:center}, {x:center+1, y:center},
            {x:center-1, y:center-1}, {x:center+1, y:center-1},
            {x:center-1, y:center+1}, {x:center+1, y:center+1}
          ];
          pixelsToExecute = ring.map(p => `${p.x},${p.y}${color}`);
          // Journal/verbatim spécifique fallback
          this.storeVerbatimResponse('W', {
            seed: { concept: 'Fallback Seed (ring)', rationale: 'Seed minimal utilisé car 0 pixel retourné' },
            predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
            pixels: pixelsToExecute
          }, this.iterationCount);
        }

        // Prediction error (if observation narrative exists)
        const prevPred = this.prevPredictions?.collective_after_prediction || '';
        const narrativeNow = this.Osnapshot?.narrative?.summary || '';
        const err = SimplicityMetrics.predictionError(prevPred, narrativeNow);
        if (this.elements.predError) this.elements.predError.textContent = err.toFixed(2);

        // Estimate deltas
        const deltas = SimplicityMetrics.estimateDeltaBits({
          strategy: parsed?.strategy,
          inStructure: true, // placeholder, à améliorer avec structures O
          colorCohesion: true,
          symmetry: false,
          anchors: 1
        });

        // Execute pixels
        await this.executePixels(pixelsToExecute);
        
        // IMPORTANT: Attendre un peu pour que le canvas du viewer soit mis à jour avec les nouveaux pixels
        await new Promise(r => setTimeout(r, 500));
        
        // Maintenant capturer l'image globale APRÈS l'exécution des pixels et l'envoyer à O
        const globalUrlAfter = await this.captureGlobalSnapshot(this.iterationCount === 0 ? 'W seed — global canvas (after)' : 'W action — global canvas (after)');
        try {
          if (globalUrlAfter) {
            const agentsCount = Object.keys(this.otherUsers || {}).length;
            await fetch(`${this.O_API_BASE}/o/image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_base64: globalUrlAfter, agents_count: agentsCount })
            });
            await fetch(`${this.O_API_BASE}/o/agents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ count: agentsCount })
            });
          }
        } catch(_) {}

        // Store predictions for next time
        this.prevPredictions = parsed?.predictions || null;

        // Log local metrics (W)
        const CwBefore = ctx.C_w || 0, CdBefore = ctx.C_d || 0;
        const CwAfter = CwBefore + (deltas.deltaCwBits || 0);
        const CdAfter = Math.max(0, CdBefore - (deltas.deltaCdBits || 0));
        const UAfter = CwAfter - CdAfter;
        this.log(`W metrics: before U=${(CwBefore-CdBefore)} after U'=${UAfter}`);
        // Mettre à jour le graphique W
        this.updateWMetrics(CwAfter, CdAfter, UAfter);
      }

      this.iterationCount++;
      const waitMs = Math.max(0, (parseInt(this.elements.interval.value)||0) * 1000);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // === Extraction des couleurs des voisins ===
  extractNeighborColors() {
    if (!this.otherUsers || !this.myPosition) return null;
    const [myX, myY] = this.myPosition;
    const neighbors = [
      { pos: [myX - 1, myY], name: 'left (W)' },
      { pos: [myX + 1, myY], name: 'right (E)' },
      { pos: [myX, myY - 1], name: 'above (N)' },
      { pos: [myX, myY + 1], name: 'below (S)' },
      { pos: [myX - 1, myY - 1], name: 'top-left (NW)' },
      { pos: [myX + 1, myY - 1], name: 'top-right (NE)' },
      { pos: [myX - 1, myY + 1], name: 'bottom-left (SW)' },
      { pos: [myX + 1, myY + 1], name: 'bottom-right (SE)' }
    ];

    const neighborInfo = [];
    for (const nb of neighbors) {
      const [nbX, nbY] = nb.pos;
      // Trouver l'agent à cette position
      const agent = Object.values(this.otherUsers).find(u => {
        const [ax, ay] = u.position || [0, 0];
        return ax === nbX && ay === nbY;
      });
      
      if (agent && agent.pixels && Object.keys(agent.pixels).length > 0) {
        // Extraire les couleurs uniques (sans compter le noir/transparent)
        const colors = new Set();
        Object.values(agent.pixels).forEach(color => {
          if (color && color !== '#000000' && color !== '#000' && color !== 'transparent') {
            colors.add(color.toUpperCase());
          }
        });
        
        if (colors.size > 0) {
          const colorArray = Array.from(colors).slice(0, 5); // Max 5 couleurs par voisin
          neighborInfo.push({
            position: `[${nbX},${nbY}]`,
            direction: nb.name,
            colors: colorArray
          });
        }
      }
    }

    return neighborInfo.length > 0 ? neighborInfo : null;
  }

  async executePixels(pixelList) {
    if (!Array.isArray(pixelList) || pixelList.length === 0) return 0;
    // Normalize strings "x,y#HEX" into {x,y,color}
    const pixels = pixelList.map(p => {
      if (typeof p === 'string' && p.includes('#') && p.includes(',')) {
        const [coords, color] = p.split('#');
        const [x, y] = coords.split(',');
        return { x: parseInt(x,10), y: parseInt(y,10), color: '#'+color };
      }
      return p;
    }).filter(p => Number.isInteger(p.x) && Number.isInteger(p.y) && typeof p.color === 'string');

    // Borne les coordonnées au fragment 20x20
    for (const px of pixels) {
      px.x = Math.max(0, Math.min(19, px.x));
      px.y = Math.max(0, Math.min(19, px.y));
    }

    const delayPerPixel = Math.max(30, Math.floor(10000 / Math.max(1, pixels.length)));
    this.cancelPendingPixels();
    for (let i=0;i<pixels.length;i++) {
      const timeoutId = setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: 'cell_update',
            sub_x: pixels[i].x,
            sub_y: pixels[i].y,
            color: pixels[i].color
          }));
          // Mettre à jour l'état local pour capture
          const key = `${pixels[i].x},${pixels[i].y}`;
          this.myCellState[key] = pixels[i].color;
        }
      }, i*delayPerPixel);
      this.pendingPixelTimeouts.push(timeoutId);
    }
    return pixels.length;
  }
}

window.addEventListener('DOMContentLoaded', () => new AIPlayerV4());


