class AIPlayerV5 {
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

    this.lastObservation = null; // from O+N snapshot
    this.prevPredictions = null; // from W memory
    this.Osnapshot = null; // {C_w,C_d,U, narrative, structures, formal_relations, prediction_errors}
    this.lastOVersionSeen = -1; // Dernière version O vue par cet agent W
    this.lastOVersionAtAction = -1; // Version du snapshot O disponible quand cet agent W a fait sa dernière action
    this.myPredictionError = 0; // Erreur de prédiction personnelle (de N)

    // Métriques pour graphiques
    this.oMetrics = { versions: [], C_w: [], C_d: [], U: [] };
    // V5: Métriques erreurs de prédiction (remplace graphique W-machine qui n'a plus de sens avec deltas)
    this.predictionMetrics = { iterations: [], my_error: [], mean_error: [], std_error: [] };
    // V5: Historique des stratégies utilisées (limite 50 itérations, cohérent avec predictionMetrics)
    this.strategyHistory = [];
    // V5: Identité artistique (persistante à travers les itérations)
    this.artisticIdentity = null; // { concept, artistic_reference, rationale }

    // URLs
    const loc = window.location;
    const WS_PROTOCOL = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_HOST = loc.host;
    this.WS_URL = `${WS_PROTOCOL}//${WS_HOST}/updates?type=bot`;
    // V5: O-N-machine server on port 8005
    this.O_API_BASE = loc.origin.replace(/:\d+$/, ':8005');
    // V5: Metrics server on port 5005
    this.METRICS_WS_URL = `${WS_PROTOCOL}//${WS_HOST.replace(/:\d+$/, '')}:5005/metrics`;
    this.metricsSocket = null;

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
      const saved = window.GeminiV5Adapter?.getApiKey?.() || '';
      if (this.elements.apiKey && !this.elements.apiKey.value && saved) {
        this.elements.apiKey.value = saved;
      }
      if (window.GeminiV5Adapter) {
        window.GeminiV5Adapter.apiKey = saved;
      }
    } catch (_) {}

    // Synchronisation inter-onglets
    window.addEventListener('storage', (e) => {
      if (e.key === 'gemini_api_key') {
        const v = e.newValue || '';
        if (this.elements.apiKey) this.elements.apiKey.value = v;
        if (window.GeminiV5Adapter) window.GeminiV5Adapter.apiKey = v;
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

  replaceComplexityTerms(text) {
    // Replace C_d, C_w, and U with their full English equivalents
    // Use word boundaries to avoid replacing in the middle of words
    // For U, handle both "U" and "U'" (as in "U' expected")
    return text
      .replace(/\bC_d\b/g, 'the complexity of description')
      .replace(/\bC_w\b/g, 'the complexity of generation')
      .replace(/\bU'/g, "the unexpectedness'")
      .replace(/\bU(?![a-zA-Z'])/g, 'the unexpectedness');
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
      // V5: Format O-machine output (structures + C_d + relations formelles)
      const s = data?.simplicity_assessment || {};
      const structs = data?.structures || [];
      const formal_relations = data?.formal_relations || {};
      content = 
        `O-MACHINE (Observation)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nSTRUCTURES (${structs.length})\n`;
      structs.forEach((st, i) => {
        const positions = st.agent_positions ? `[${st.agent_positions.map(p => `[${p[0]},${p[1]}]`).join(', ')}]` : 'N/A';
        content += `  ${i+1}. ${st.type} (${st.size_agents} agents at ${positions}, salience: ${st.salience})\n`;
      });
      if (structs.length === 0) content += `  (none detected)\n`;
      content += `\nFORMAL RELATIONS\n${formal_relations.summary || 'N/A'}\n`;
      content += `\nC_d (Description Complexity): ${s.C_d_current?.value ?? 'N/A'} bits\n`;
      content += `Description: ${s.C_d_current?.description || 'N/A'}\n`;
      // Replace complexity terms in content
      content = this.replaceComplexityTerms(content);
    } else if (source === 'N') {
      // V5: Format N-machine output (narrative + C_w + erreurs prédiction)
      const s = data?.simplicity_assessment || {};
      const narrative = data?.narrative || {};
      const prediction_errors = data?.prediction_errors || {};
      content = 
        `N-MACHINE (Narration)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nNARRATIVE\n${narrative.summary || 'N/A'}\n` +
        `\nC_w (Generation Complexity): ${s.C_w_current?.value ?? 'N/A'} bits\n`;
      
      const errorEntries = Object.entries(prediction_errors);
      if (errorEntries.length > 0) {
        content += `\nPREDICTION ERRORS (${errorEntries.length} agents)\n`;
        errorEntries.forEach(([agent_id, err]) => {
          // Récupérer la position de l'agent depuis otherUsers
          let position = 'N/A';
          if (this.otherUsers && this.otherUsers[agent_id]) {
            const pos = this.otherUsers[agent_id].position || [0, 0];
            position = `[${pos[0]},${pos[1]}]`;
          } else if (this.myUserId === agent_id) {
            // C'est cet agent
            position = `[${this.myPosition[0]},${this.myPosition[1]}]`;
          }
          content += `  • Agent ${position}: error=${(err.error || 0).toFixed(2)} — ${err.explanation || 'N/A'}\n`;
        });
      }
      // Replace complexity terms in all N content (narrative, explanations)
      content = this.replaceComplexityTerms(content);
    } else if (source === 'W') {
      // Format W response (seed/action)
      if (iteration === 0) {
        // Seed format
        const seed = data?.seed || {};
        const preds = data?.predictions || {};
        const pixels = data?.pixels || [];
        content =
          `W-MACHINE (Seed Generation)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\nCONCEPT\n${seed.concept || 'N/A'}\n` +
          `\nRATIONALE\n${seed.rationale || 'N/A'}\n` +
          `\nPREDICTIONS\n` +
          `Individual: ${preds.individual_after_prediction || 'N/A'}\n` +
          `Collective: ${preds.collective_after_prediction || 'N/A'}\n` +
          `\nPIXELS: ${pixels.length} generated\n`;
        // Replace complexity terms in seed content
        content = this.replaceComplexityTerms(content);
      } else {
        // Action format
        const strategy = data?.strategy || 'N/A';
        const strategy_id = data?.strategy_id || 'N/A';
        const source_agents = data?.source_agents || [];
        const rationale = data?.rationale || '';
        const preds = data?.predictions || {};
        const delta = data?.delta_complexity || {};
        const pixels = data?.pixels || [];
        const sourceAgentsStr = source_agents.length > 0 
          ? source_agents.map(pos => `[${pos[0]},${pos[1]}]`).join(', ')
          : 'none';
        content =
          `W-MACHINE (Action/Generation)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\nSTRATEGY\n${strategy}\n` +
          `Strategy ID: ${strategy_id}\n` +
          `Source Agents: ${sourceAgentsStr}\n` +
          `\nRATIONALE\n${rationale || 'N/A'}\n` +
          `\nDELTA COMPLEXITY\n` +
          `ΔC_w: ${delta.delta_C_w_bits ?? 'N/A'} bits | ` +
          `ΔC_d: ${delta.delta_C_d_bits ?? 'N/A'} bits | ` +
          `U' expected: ${delta.U_after_expected ?? 'N/A'} bits\n` +
          `\nPREDICTIONS\n` +
          `Individual: ${preds.individual_after_prediction || 'N/A'}\n` +
          `Collective: ${preds.collective_after_prediction || 'N/A'}\n` +
          `\nPIXELS: ${pixels.length} generated\n`;
        // Replace complexity terms in action content
        content = this.replaceComplexityTerms(content);
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
          // V5: Connexion au serveur de métriques
          this.connectMetricsServer();
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
        if (window.GeminiV5Adapter) window.GeminiV5Adapter.apiKey = v;
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
      // V5: Passer agent_id pour récupérer snapshot personnalisé
      const agentId = this.myUserId || '';
      const url = `${this.O_API_BASE}/o/latest${agentId ? '?agent_id=' + encodeURIComponent(agentId) : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        this.Osnapshot = await res.json();
        
        // V5: Extraire erreur de prédiction personnelle (de N)
        if (this.Osnapshot.prediction_errors && agentId && this.Osnapshot.prediction_errors[agentId]) {
          this.myPredictionError = this.Osnapshot.prediction_errors[agentId].error || 0;
        }
        
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
        // Révoquer les data URLs pour libérer la mémoire
        const oldImg = items[i].querySelector('img');
        if (oldImg && oldImg.src && oldImg.src.startsWith('data:')) {
          oldImg.src = '';
        }
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
            console.log(`[V5] 📷 Image capturée depuis viewer: ${canvas.width}×${canvas.height}, ${url.length} chars`);
            this.addDebugImage(label, url);
            return url;
          }
        } catch (e) { 
          console.warn(`[V5] ⚠️  Erreur capture canvas viewer (tentative ${attempt+1}):`, e);
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // 2) Fallback: régénérer via PositionCanvasGenerator
    console.log(`[V5] 📷 Fallback: génération image via PositionCanvasGenerator (${Object.keys(this.otherUsers || {}).length} agents)`);
    try {
      let gen = window.PositionCanvasGenerator;
      if (!gen) {
        const mod = await import('/js/position-canvas.js?v=20250124-053');
        gen = mod?.PositionCanvasGenerator || window.PositionCanvasGenerator;
      }
      if (gen && this.otherUsers) {
        const result = gen.generateGlobalCanvas(this.otherUsers, this.myUserId);
        const dataUrl = result?.pureCanvas ? `data:image/png;base64,${result.pureCanvas}` : null;
        if (dataUrl) {
          console.log(`[V5] 📷 Image générée via PositionCanvasGenerator: ${dataUrl.length} chars`);
          this.addDebugImage(label, dataUrl);
          return dataUrl;
        }
      }
    } catch (e) { 
      console.error(`[V5] ⚠️  Erreur génération PositionCanvasGenerator:`, e);
    }

    console.warn(`[V5] ⚠️  Échec capture image globale pour ${label}`);
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
            // Mettre à jour aussi la position dans l'onglet Metrics
            const agentPositionEl = document.getElementById('agent-position');
            const legendAgentPositionEl = document.getElementById('legend-agent-position');
            if (agentPositionEl) agentPositionEl.textContent = `${this.myPosition[0]},${this.myPosition[1]}`;
            if (legendAgentPositionEl) legendAgentPositionEl.textContent = `${this.myPosition[0]},${this.myPosition[1]}`;
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
    // Délai aléatoire au démarrage pour éviter les pics simultanés avec plusieurs clients
    // (surtout important pour le seed qui se déclenche immédiatement)
    if (this.iterationCount === 0) {
      const randomDelay = Math.random() * 3000; // 0-3s aléatoire
      await new Promise(r => setTimeout(r, randomDelay));
    }
    
    while (this.isRunning) {
      if (this.isPaused) { await new Promise(r => setTimeout(r, 500)); continue; }

      // Determine mode pour agent S→W (Seed → W-machine)
      // Itération 0 : seed (S) - génération initiale, pas besoin de snapshot O
      // Itération 1, 2, 3... : action (W) - attend nouveau snapshot O avant d'agir
      if (this.iterationCount === 0) {
        this.setMode('seed');
      } else {
        // À partir de l'itération 1 : toujours en mode action (W)
        // L'agent O (serveur) s'occupe de l'observation
        this.setMode('action');
      }

      // Build context
      const ctx = {
        myX: this.myPosition[0],
        myY: this.myPosition[1],
        iteration: this.iterationCount
      };

      // Agent S→W : seed (itération 0) ou action (itération 1+)
      // L'agent O (serveur) s'occupe de l'observation périodiquement
      if (this.promptMode === 'seed') {
        // Mode seed (S) : génération initiale, pas besoin de snapshot O
        // Le seed apporte la diversité initiale et ne dépend pas de O
        // On peut récupérer le snapshot O pour info, mais on n'attend pas
        await this.fetchOSnapshot();
        if (this.Osnapshot?.version !== undefined) {
          this.lastOVersionSeen = this.Osnapshot.version;
        }
        
        // Vérifier la présence de la clé API avant appel LLM
        const apiKey = window.GeminiV5Adapter?.getApiKey?.() || '';
        if (!apiKey) {
          this.log('Clé API Gemini manquante — seed ignoré jusqu\'à saisie.');
          if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = 'LLM: Inactive';
          await new Promise(r => setTimeout(r, 1000));
          this.iterationCount++;
          const waitMs = Math.max(0, (parseInt(this.elements.interval.value)||0) * 1000);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        } else {
          if (this.elements.llmStatusBadge) this.elements.llmStatusBadge.textContent = 'LLM: Active';
        }
        
        // Extraire la palette de couleurs locale (même pour seed, peut être utile)
        const colorPalette = this.extractLocalColorPalette();
        ctx.colorPalette = colorPalette;
        
        // Build prompt seed et appel LLM
        // V5: Seed dessine à l'aveugle (pas d'images) pour maximiser la diversité
        const systemText = await window.GeminiV5Adapter.buildSystemPrompt('seed', ctx);
        
        let parsed = null;
        let pixelsToExecute = [];
        const maxRetries = 3;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // V5: Seed sans images (à l'aveugle)
            const raw = await window.GeminiV5Adapter.callAPI(systemText, null);
            parsed = window.GeminiV5Adapter.parseJSONResponse(raw);
            
            // V5: Valider que la réponse seed est complète (a au moins seed.concept ou seed.artistic_reference)
            const isValid = parsed?.seed && (
              parsed.seed.concept || 
              parsed.seed.artistic_reference || 
              parsed.seed.rationale
            );
            
            if (isValid) {
              // Réponse valide
              // V5: Stocker l'identité artistique du seed pour persistance
              if (parsed?.seed) {
                this.artisticIdentity = {
                  concept: parsed.seed.concept || '',
                  artistic_reference: parsed.seed.artistic_reference || '',
                  rationale: parsed.seed.rationale || ''
                };
                this.log(`[V5] 🌱 Identité artistique établie: "${this.artisticIdentity.concept}" (${this.artisticIdentity.artistic_reference})`);
              }
              this.storeVerbatimResponse('W', parsed, this.iterationCount);
              pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
              break; // Sortir de la boucle de retry
            } else {
              // Réponse invalide (manque seed concept/rationale)
              const hasPixels = Array.isArray(parsed?.pixels) && parsed.pixels.length > 0;
              this.log(`[W Seed] Réponse invalide: seed=${!!parsed?.seed}, pixels=${hasPixels ? parsed.pixels.length : 0}, keys=${parsed ? Object.keys(parsed).join(',') : 'null'}`);
              if (attempt < maxRetries - 1) {
                const delay = 2 * (attempt + 1); // 2s, 4s, 6s
                this.log(`[W Seed] Retry dans ${delay}s... (tentative ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, delay * 1000));
                continue;
              } else {
                // Dernière tentative échouée
                this.log(`[W Seed] ⚠️ Réponse invalide après ${maxRetries} tentatives (manque seed concept/rationale)`);
                // Continuer avec parsed (qui a au moins les pixels si disponibles)
                this.storeVerbatimResponse('W', parsed, this.iterationCount);
                pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
              }
            }
          } catch (error) {
            // Erreur API (503, rate limit, etc.)
            if (attempt < maxRetries - 1) {
              const delay = 2 * (attempt + 1);
              this.log(`[W Seed] Erreur API (tentative ${attempt + 1}/${maxRetries}): ${error.message}, retry dans ${delay}s...`);
              await new Promise(r => setTimeout(r, delay * 1000));
              continue;
            } else {
              // Dernière tentative échouée
              this.log(`[W Seed] Erreur API après ${maxRetries} tentatives: ${error.message}`);
              // V5: Stocker une identité artistique minimale en cas d'erreur API
              if (!this.artisticIdentity) {
                this.artisticIdentity = {
                  concept: 'Erreur API',
                  artistic_reference: 'API error - no artistic reference available',
                  rationale: `Erreur: ${error.message}`
                };
              }
              this.storeVerbatimResponse('W', {
                seed: { 
                  concept: this.artisticIdentity.concept,
                  artistic_reference: this.artisticIdentity.artistic_reference,
                  rationale: this.artisticIdentity.rationale
                },
                predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
                pixels: []
              }, this.iterationCount);
              break;
            }
          }
        }
        
        // Fallback seed: si aucun pixel retourné (erreur API ou réponse vide), générer un seed minimal local
        if (pixelsToExecute.length === 0) {
          // V5: Si on a une identité artistique mais pas de pixels, créer un fallback qui préserve l'identité
          if (!this.artisticIdentity) {
            this.artisticIdentity = {
              concept: 'Fallback Seed',
              artistic_reference: 'Minimal geometric pattern',
              rationale: 'Fallback seed used due to API error or empty response'
            };
          }
          const center = 10;
          const color = '#F5D142';
          const ring = [
            {x:center, y:center-1}, {x:center, y:center+1},
            {x:center-1, y:center}, {x:center+1, y:center},
            {x:center-1, y:center-1}, {x:center+1, y:center-1},
            {x:center-1, y:center+1}, {x:center+1, y:center+1}
          ];
          pixelsToExecute = ring.map(p => `${p.x},${p.y}${color}`);
          // V5: S'assurer que l'identité artistique est stockée même pour le fallback
          if (!this.artisticIdentity) {
            this.artisticIdentity = {
              concept: 'Fallback Seed (ring)',
              artistic_reference: 'Minimal geometric pattern',
              rationale: 'Seed minimal utilisé car 0 pixel retourné'
            };
          }
          const fallbackSeed = {
            seed: { 
              concept: this.artisticIdentity.concept,
              artistic_reference: this.artisticIdentity.artistic_reference,
              rationale: this.artisticIdentity.rationale
            },
            predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
            pixels: pixelsToExecute
          };
          this.storeVerbatimResponse('W', fallbackSeed, this.iterationCount);
          // Utiliser fallbackSeed comme parsed pour l'envoi à N
          parsed = fallbackSeed;
        }
        
        // Execute pixels
        await this.executePixels(pixelsToExecute);
        await new Promise(r => setTimeout(r, 2000));
        
        // Capturer et envoyer l'image globale à O
        const globalUrlAfter = await this.captureGlobalSnapshot('W seed — global canvas (after)');
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
        
        // CRITIQUE : Mettre à jour la version du snapshot disponible lors de ce seed
        // Cela permet de s'assurer que la première action attendra un snapshot POSTÉRIEUR au seed
        this.lastOVersionAtAction = this.Osnapshot?.version ?? this.lastOVersionSeen;
        
        // V5: Envoyer données W à N (seed: concept, rationale, predictions)
        // IMPORTANT: Envoyer même pour le seed pour que N puisse évaluer les prédictions
        if (parsed) {
          // Formater les données seed comme une action pour compatibilité avec N
          const seedData = {
            strategy: parsed.seed?.concept || 'Seed generation',
            rationale: parsed.seed?.rationale || '',
            predictions: parsed.predictions || {}
          };
          await this.sendWDataToN(seedData, this.iterationCount);
        }
        
        // Store predictions pour la prochaine itération (action)
        this.prevPredictions = parsed?.predictions || null;
        
      } else {
        // Mode action (W) : récupérer snapshot O et attendre nouveau snapshot POSTÉRIEUR à la dernière action
        await this.fetchOSnapshot();
        
        // Vérifier si un nouveau snapshot O est disponible POSTÉRIEUR à la dernière action
        const currentOVersion = this.Osnapshot?.version ?? -1;
        
        // Exception : pour la première action (itération 1), accepter le snapshot disponible
        // MAIS seulement s'il est valide (non vide, non pending)
        const isFirstAction = this.iterationCount === 1;
        
        // CRITIQUE : Vérifier que le snapshot est valide (non vide, non pending)
        const isSnapshotValid = this.Osnapshot && 
          !this.Osnapshot._pending &&
          this.Osnapshot.structures &&
          Array.isArray(this.Osnapshot.structures) &&
          (this.Osnapshot.structures.length > 0 || 
           (this.Osnapshot.simplicity_assessment?.C_d_current?.description && 
            this.Osnapshot.simplicity_assessment.C_d_current.description !== 'N/A' &&
            this.Osnapshot.simplicity_assessment.C_d_current.description !== 'Waiting for first analysis...'));
        
        if (!isSnapshotValid) {
          // Snapshot invalide (vide, pending, ou N/A) - attendre un snapshot valide
          this.log(`Snapshot invalide (pending=${this.Osnapshot?._pending}, structures=${this.Osnapshot?.structures?.length || 0}, description=${this.Osnapshot?.simplicity_assessment?.C_d_current?.description?.substring(0, 30) || 'N/A'}) - attente snapshot valide...`);
          await new Promise(r => setTimeout(r, 2000)); // Attendre 2s avant de réessayer
          continue; // Passer à l'itération suivante sans appeler Gemini
        }
        
        // CRITIQUE : Vérifier que le snapshot est POSTÉRIEUR à la dernière action
        // (pas juste à la dernière version vue, mais à la version disponible lors de la dernière action)
        // IMPORTANT : Ne JAMAIS exécuter une action W si le snapshot n'a pas changé depuis la dernière action
        if (!isFirstAction && currentOVersion <= this.lastOVersionAtAction) {
          // Pas de nouveau snapshot O postérieur à la dernière action, skip cette itération W
          this.log(`Pas de nouveau snapshot O postérieur à dernière action (version ${currentOVersion} <= ${this.lastOVersionAtAction}), attente nouveau snapshot...`);
          await new Promise(r => setTimeout(r, 2000)); // Attendre 2s avant de réessayer
          // Ne pas incrémenter iterationCount pour rester en mode 'action' et réessayer
          continue; // Passer à l'itération suivante sans appeler Gemini
        }
        
        // Nouveau snapshot détecté OU première action : reset le compteur d'attente
        this._waitAttempts = 0;
        // Mettre à jour la version vue
        if (isFirstAction) {
          this.log(`Première action (itération 1) : snapshot valide détecté (version ${currentOVersion}, ${this.Osnapshot.structures.length} structures)`);
        } else {
          this.log(`Nouveau snapshot O détecté (version ${currentOVersion} > ${this.lastOVersionAtAction}), action autorisée`);
        }
        this.lastOVersionSeen = currentOVersion;
        
        // V5: Afficher le snapshot O+N dans Verbatim (séparé O et N)
        // IMPORTANT: Toujours récupérer snapshot complet (sans agent_id) pour avoir toutes les erreurs de prédiction
        if (this.Osnapshot) {
          // Toujours récupérer snapshot complet pour affichage verbatim (toutes les erreurs)
          // car this.Osnapshot peut être un snapshot personnalisé avec seulement l'erreur de cet agent
          let fullSnapshot = this.Osnapshot;
          const predErrorsCount = this.Osnapshot.prediction_errors ? Object.keys(this.Osnapshot.prediction_errors).length : 0;
          this.log(`[Verbatim] Snapshot actuel: ${predErrorsCount} erreur(s) de prédiction`);
          
          // Toujours récupérer snapshot complet pour avoir toutes les erreurs
          try {
            const fullRes = await fetch(`${this.O_API_BASE}/o/latest`);
            if (fullRes.ok) {
              fullSnapshot = await fullRes.json();
              const fullPredErrorsCount = fullSnapshot.prediction_errors ? Object.keys(fullSnapshot.prediction_errors).length : 0;
              this.log(`[Verbatim] Snapshot complet récupéré: ${fullPredErrorsCount} erreur(s) de prédiction`);
            }
          } catch (e) {
            this.log(`[Verbatim] Erreur récupération snapshot complet: ${e.message}, utilisation snapshot actuel`);
            // En cas d'erreur, utiliser snapshot actuel
          }
          
          // Extraire et afficher O et N séparément
          const oData = {
            structures: fullSnapshot.structures,
            formal_relations: fullSnapshot.formal_relations,
            simplicity_assessment: {
              C_d_current: fullSnapshot.simplicity_assessment?.C_d_current
            }
          };
          const nData = {
            narrative: fullSnapshot.narrative,
            prediction_errors: fullSnapshot.prediction_errors || {},
            simplicity_assessment: {
              C_w_current: fullSnapshot.simplicity_assessment?.C_w_current
            }
          };
          
          // Log pour diagnostiquer
          const nPredErrorsCount = nData.prediction_errors ? Object.keys(nData.prediction_errors).length : 0;
          this.log(`[Verbatim] Affichage N avec ${nPredErrorsCount} erreur(s) de prédiction`);
          
          this.storeVerbatimResponse('O', oData, this.iterationCount);
          this.storeVerbatimResponse('N', nData, this.iterationCount);
          
          this.updateOMetrics(this.Osnapshot);
          // V5: Mettre à jour les métriques d'erreur de prédiction
          this.updatePredictionMetrics(this.Osnapshot);
          // V5: Mettre à jour l'affichage du ranking
          this.updateRankingDisplay(this.Osnapshot);
          // V5: Mettre à jour actual_error dans l'historique des stratégies
          this.updateStrategyHistoryActualError();
        }
        
        // Vérifier la présence de la clé API avant appel LLM
        const apiKey = window.GeminiV5Adapter?.getApiKey?.() || '';
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
        ctx.prediction_error = this.myPredictionError ?? 0; // V5: Erreur de prédiction personnelle (de N)
        // V5: Historique des stratégies pour le prompt
        ctx.strategy_history = this.formatStrategyHistoryText();
        // V5: Identité artistique (persistante depuis le seed)
        ctx.artistic_identity = this.artisticIdentity;
        // V5: Ranking des agents pour compétition
        ctx.myAgentId = this.myUserId;
        ctx.agent_rankings = this.Osnapshot?.agent_rankings || {};
        // Mettre à jour le graphique O si snapshot disponible
        if (this.Osnapshot) this.updateOMetrics(this.Osnapshot);

        // Extraire les couleurs des voisins pour faciliter la coordination
        const neighborColors = this.extractNeighborColors();
        ctx.neighborColors = neighborColors;
        
        // Extraire la palette de couleurs locale
        const colorPalette = this.extractLocalColorPalette();
        ctx.colorPalette = colorPalette;

        // Build prompt action et appel LLM
        const systemText = await window.GeminiV5Adapter.buildSystemPrompt('action', ctx);
        // Debug + images pour Gemini (capture AVANT les pixels - c'est OK pour W qui doit voir l'état actuel)
        const globalUrlBefore = await this.captureGlobalSnapshot('W action — global canvas (before)');
        const localUrl = this.captureLocalCanvasBase64();
        
        let parsed = null;
        let pixelsToExecute = [];
        const maxRetries = 3;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const raw = await window.GeminiV5Adapter.callAPI(systemText, {
              globalImageBase64: globalUrlBefore,
              localImageBase64: localUrl
            });
            if (localUrl && attempt === 0) this.addDebugImage('W input — local 20x20', localUrl);
            parsed = window.GeminiV5Adapter.parseJSONResponse(raw);
            
            // V5: Valider que la réponse action est complète (a au moins strategy ou rationale)
            const hasPixels = Array.isArray(parsed?.pixels) && parsed.pixels.length > 0;
            const isValid = parsed && (
              parsed.strategy || 
              parsed.rationale ||
              (parsed.delta_complexity && (
                parsed.delta_complexity.delta_C_w_bits !== undefined ||
                parsed.delta_complexity.delta_C_d_bits !== undefined
              ))
            );
            
            if (isValid) {
              // Réponse valide
              this.storeVerbatimResponse('W', parsed, this.iterationCount);
              pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
              break; // Sortir de la boucle de retry
            } else if (hasPixels) {
              // Réponse incomplète mais avec pixels : accepter avec valeurs par défaut
              this.log(`[W Action] Réponse incomplète mais avec ${parsed.pixels.length} pixels - utilisation de valeurs par défaut`);
              // Créer un objet complet avec valeurs par défaut
              parsed = {
                strategy: parsed?.strategy || 'Action with incomplete response',
                strategy_id: parsed?.strategy_id || 'custom',
                source_agents: parsed?.source_agents || [],
                rationale: parsed?.rationale || 'Response from LLM was incomplete but pixels were generated',
                delta_complexity: parsed?.delta_complexity || {
                  delta_C_w_bits: 0,
                  delta_C_d_bits: 0,
                  U_after_expected: 0
                },
                predictions: parsed?.predictions || {
                  individual_after_prediction: 'N/A (incomplete response)',
                  collective_after_prediction: 'N/A (incomplete response)'
                },
                pixels: parsed.pixels
              };
              this.storeVerbatimResponse('W', parsed, this.iterationCount);
              pixelsToExecute = parsed.pixels;
              break; // Accepter et continuer avec valeurs par défaut
            } else {
              // Réponse invalide (pas de pixels non plus)
              this.log(`[W Action] Réponse invalide: strategy=${!!parsed?.strategy}, rationale=${!!parsed?.rationale}, delta=${!!parsed?.delta_complexity}, pixels=${hasPixels ? parsed.pixels.length : 0}, keys=${parsed ? Object.keys(parsed).join(',') : 'null'}`);
              if (attempt < maxRetries - 1) {
                const delay = 2 * (attempt + 1); // 2s, 4s, 6s
                this.log(`[W Action] Retry dans ${delay}s... (tentative ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, delay * 1000));
                continue;
              } else {
                // Dernière tentative échouée - créer un objet par défaut pour éviter null
                this.log(`[W Action] ⚠️ Réponse invalide après ${maxRetries} tentatives - création d'objet par défaut`);
                parsed = {
                  strategy: 'Action failed - incomplete response',
                  strategy_id: 'custom',
                  source_agents: [],
                  rationale: 'LLM response was incomplete after all retries',
                  delta_complexity: {
                    delta_C_w_bits: 0,
                    delta_C_d_bits: 0,
                    U_after_expected: 0
                  },
                  predictions: {
                    individual_after_prediction: 'N/A (incomplete response)',
                    collective_after_prediction: 'N/A (incomplete response)'
                  },
                  pixels: Array.isArray(parsed?.pixels) ? parsed.pixels : []
                };
                this.storeVerbatimResponse('W', parsed, this.iterationCount);
                pixelsToExecute = parsed.pixels;
              }
            }
          } catch (error) {
            // Erreur API (503, rate limit, etc.)
            if (attempt < maxRetries - 1) {
              const delay = 2 * (attempt + 1);
              this.log(`[W Action] Erreur API (tentative ${attempt + 1}/${maxRetries}): ${error.message}, retry dans ${delay}s...`);
              await new Promise(r => setTimeout(r, delay * 1000));
              continue;
            } else {
              // Dernière tentative échouée
              this.log(`[W Action] Erreur API après ${maxRetries} tentatives: ${error.message}`);
              this.storeVerbatimResponse('W', {
                strategy: 'ERROR',
                rationale: `Erreur API: ${error.message}`,
                predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
                pixels: []
              }, this.iterationCount);
              break;
            }
          }
        }

        // V5: S'assurer que parsed n'est jamais null après la boucle de retry
        if (!parsed) {
          this.log(`[W Action] ⚠️ parsed est null après tous les retries - création d'objet par défaut`);
          parsed = {
            strategy: 'Action failed - no response',
            strategy_id: 'custom',
            source_agents: [],
            rationale: 'LLM returned no valid response after all retries',
            delta_complexity: {
              delta_C_w_bits: 0,
              delta_C_d_bits: 0,
              U_after_expected: 0
            },
            predictions: {
              individual_after_prediction: 'N/A (no response)',
              collective_after_prediction: 'N/A (no response)'
            },
            pixels: []
          };
        }

        // V5: Erreur de prédiction vient de N-machine (déjà dans this.myPredictionError)
        if (this.elements.predError) {
          this.elements.predError.textContent = (this.myPredictionError || 0).toFixed(2);
        }

        // V5: Deltas viennent directement de Gemini W (parsed.delta_complexity)
        const deltas = parsed.delta_complexity || {
          delta_C_w_bits: 0,
          delta_C_d_bits: 0,
          U_after_expected: 0
        };

        // Execute pixels (la promesse se résout quand tous les pixels sont envoyés)
        await this.executePixels(pixelsToExecute);
        
        // IMPORTANT: Attendre suffisamment pour que le canvas du viewer soit complètement mis à jour
        // avec tous les nouveaux pixels (rendu + propagation WebSocket vers autres clients)
        // Ce délai doit être cohérent avec le délai de stabilisation côté O (3s)
        // On attend 2s après l'envoi de tous les pixels pour laisser le temps au rendu complet
        await new Promise(r => setTimeout(r, 2000)); // 2s pour laisser le temps au rendu complet
        
        // Maintenant capturer l'image globale APRÈS l'exécution des pixels et l'envoyer à O
        const globalUrlAfter = await this.captureGlobalSnapshot('W action — global canvas (after)');
        try {
          if (globalUrlAfter) {
            const agentsCount = Object.keys(this.otherUsers || {}).length;
            console.log(`[V5] 📤 Envoi image globale à O: ${globalUrlAfter.length} chars, ${agentsCount} agents`);
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
        
        // CRITIQUE : Mettre à jour la version du snapshot disponible lors de cette action
        // Cela permet de s'assurer que la prochaine action attendra un snapshot POSTÉRIEUR
        this.lastOVersionAtAction = this.Osnapshot?.version ?? this.lastOVersionSeen;
        
        // V5: Envoyer données W à N (rationale, predictions, strategy)
        await this.sendWDataToN(parsed, this.iterationCount);

        // V5: Mettre à jour l'historique des stratégies (sera complété avec actual_error au snapshot suivant)
        this.updateStrategyHistory(parsed, this.Osnapshot);

        // Store predictions for next time
        this.prevPredictions = parsed?.predictions || null;

        // Log local metrics (W) - V5: Plus de graphique W (remplacé par Prediction Errors)
        const CwBefore = ctx.C_w || 0, CdBefore = ctx.C_d || 0;
        const CwAfter = CwBefore + (deltas.delta_C_w_bits || 0);
        const CdAfter = Math.max(0, CdBefore - (deltas.delta_C_d_bits || 0));
        const UAfter = CwAfter - CdAfter;
        this.log(`W deltas: ΔC_w=${deltas.delta_C_w_bits || 0}, ΔC_d=${deltas.delta_C_d_bits || 0}, U'=${UAfter}`);
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

  // === Extraction palette de couleurs locale ===
  extractLocalColorPalette() {
    if (!this.myCellState || Object.keys(this.myCellState).length === 0) {
      return 'No colors yet (empty grid)';
    }
    
    // Extraire les couleurs uniques (sans compter le noir)
    const colors = new Set();
    Object.values(this.myCellState).forEach(color => {
      if (color && color !== '#000000' && color !== '#000' && color !== 'transparent') {
        colors.add(color.toUpperCase());
      }
    });
    
    if (colors.size === 0) {
      return 'No colors yet (only black pixels)';
    }
    
    // Retourner la liste des couleurs (max 10 pour éviter trop de tokens)
    const colorArray = Array.from(colors).slice(0, 10);
    return colorArray.join(', ');
  }
  
  // === V5: Envoi données W à N ===
  async sendWDataToN(parsed, iteration) {
    const agentId = this.myUserId || 'unknown';
    const wData = {
      agent_id: agentId,
      position: this.myPosition,
      iteration: iteration,
      strategy: parsed?.strategy || 'N/A',
      rationale: parsed?.rationale || '',
      predictions: parsed?.predictions || {},
      timestamp: new Date().toISOString()
    };
    
    try {
      await fetch(`${this.O_API_BASE}/n/w-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wData)
      });
    } catch(e) {
      console.error('[V5] Erreur envoi données W à N:', e);
    }
    
    // V5: Envoyer aussi les deltas au serveur de métriques
    if (this.metricsSocket && this.metricsSocket.readyState === WebSocket.OPEN && parsed?.delta_complexity) {
      try {
        this.metricsSocket.send(JSON.stringify({
          type: 'agent_update',
          user_id: agentId,
          position: this.myPosition,
          delta_C_w: parsed.delta_complexity.delta_C_w_bits || 0,
          delta_C_d: parsed.delta_complexity.delta_C_d_bits || 0,
          U_after_expected: parsed.delta_complexity.U_after_expected || 0,
          prediction_error: this.myPredictionError || 0,
          strategy: parsed?.strategy || 'N/A'
        }));
      } catch(e) {
        console.error('[V5] Erreur envoi métriques:', e);
      }
    }
  }
  
  // === V5: Connexion serveur de métriques ===
  connectMetricsServer() {
    if (this.metricsSocket && this.metricsSocket.readyState === WebSocket.OPEN) {
      return; // Déjà connecté
    }
    
    try {
      this.metricsSocket = new WebSocket(this.METRICS_WS_URL);
      
      this.metricsSocket.onopen = () => {
        console.log('[V5] ✅ Connecté au serveur de métriques');
        // Demander l'état actuel
        this.metricsSocket.send(JSON.stringify({ type: 'get_state' }));
      };
      
      this.metricsSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state_update' && msg.data) {
            // Mettre à jour l'affichage avec les métriques agrégées
            this.updateMetricsDisplay(msg.data);
          } else if (msg.type === 'o_snapshot_update' || msg.type === 'n_snapshot_update') {
            // Snapshots O/N mis à jour (pour info)
            console.log(`[V5] ${msg.type}:`, msg.data);
          }
        } catch(e) {
          console.error('[V5] Erreur parsing métriques:', e);
        }
      };
      
      this.metricsSocket.onerror = (error) => {
        console.warn('[V5] Erreur WebSocket métriques:', error);
      };
      
      this.metricsSocket.onclose = () => {
        console.log('[V5] Déconnecté du serveur de métriques, reconnexion dans 5s...');
        setTimeout(() => this.connectMetricsServer(), 5000);
      };
    } catch(e) {
      console.error('[V5] Erreur connexion métriques:', e);
    }
  }
  
  // === V5: Mise à jour affichage métriques agrégées ===
  updateMetricsDisplay(data) {
    if (!data.averages) return;
    
    const avg = data.averages;
    // Afficher les métriques agrégées dans l'UI (si éléments existent)
    // Pour l'instant, on log juste
    if (avg.std_prediction_error !== undefined) {
      // L'écart-type est déjà calculé côté serveur et inclus dans les métriques
      // On peut l'afficher dans l'UI si nécessaire
    }
  }
  
  // === V5: Mise à jour métriques erreurs prédiction ===
  updatePredictionMetrics(snapshot) {
    if (!snapshot || !snapshot.prediction_errors) {
      console.log(`[V5] updatePredictionMetrics: Pas de snapshot ou pas d'erreurs (snapshot=${!!snapshot}, errors=${!!snapshot?.prediction_errors})`);
      return;
    }
    
    const errors = snapshot.prediction_errors || {};
    const errorValues = Object.values(errors).map(e => {
      const err = e?.error;
      return (typeof err === 'number' && !isNaN(err) && isFinite(err)) ? err : 0;
    }).filter(v => v >= 0 && v <= 1); // Filtrer les valeurs valides entre 0 et 1
    
    if (errorValues.length === 0) {
      console.log(`[V5] updatePredictionMetrics: Aucune valeur d'erreur valide trouvée`);
      return;
    }
    
    // Calcul moyenne et écart-type
    const mean = errorValues.reduce((a,b) => a+b, 0) / errorValues.length;
    const variance = errorValues.length > 1 
      ? errorValues.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / errorValues.length
      : 0;
    const std = Math.sqrt(variance);
    
    // S'assurer que mean et std sont des nombres valides
    const meanValid = (isNaN(mean) || !isFinite(mean)) ? 0 : mean;
    const stdValid = (isNaN(std) || !isFinite(std)) ? 0 : std;
    
    // Ajouter les nouvelles valeurs
    this.predictionMetrics.iterations.push(this.iterationCount);
    this.predictionMetrics.my_error.push(this.myPredictionError || 0);
    this.predictionMetrics.mean_error.push(meanValid);
    this.predictionMetrics.std_error.push(stdValid);
    
    // Limiter à 50 dernières itérations
    if (this.predictionMetrics.iterations.length > 50) {
      this.predictionMetrics.iterations.shift();
      this.predictionMetrics.my_error.shift();
      this.predictionMetrics.mean_error.shift();
      this.predictionMetrics.std_error.shift();
    }
    
    // Debug: afficher les valeurs pour vérifier
    console.log(`[V5] updatePredictionMetrics: iteration=${this.iterationCount}, my_error=${(this.myPredictionError || 0).toFixed(2)}, mean=${meanValid.toFixed(2)}, std=${stdValid.toFixed(2)}, agents=${errorValues.length}`);
    console.log(`[V5] updatePredictionMetrics arrays: iterations=${this.predictionMetrics.iterations.length}, my_error=${this.predictionMetrics.my_error.length}, mean_error=${this.predictionMetrics.mean_error.length}, std_error=${this.predictionMetrics.std_error.length}`);
    
    this.drawPredictionErrorChart();
  }
  
  // === V5: Mise à jour affichage ranking ===
  updateRankingDisplay(snapshot) {
    if (!snapshot || !snapshot.agent_rankings) {
      // Pas de rankings disponibles
      if (document.getElementById('my-rank')) {
        document.getElementById('my-rank').textContent = '-';
        document.getElementById('total-agents').textContent = '-';
        document.getElementById('my-avg-error').textContent = '-';
        document.getElementById('rank-display').textContent = '-';
        document.getElementById('top-predictors').innerHTML = '<div style="color: #888;">No rankings available yet</div>';
      }
      return;
    }
    
    const rankings = snapshot.agent_rankings || {};
    const myAgentId = this.myUserId;
    const myRanking = rankings[myAgentId];
    
    // Calculer moyenne globale pour affichage
    const allAvgErrors = Object.values(rankings).map(r => r.avg_error || 0);
    const globalMeanError = allAvgErrors.length > 0 
      ? (allAvgErrors.reduce((a, b) => a + b, 0) / allAvgErrors.length).toFixed(2)
      : '0.00';
    
    // Mettre à jour mean-error-display
    if (document.getElementById('mean-error-display')) {
      document.getElementById('mean-error-display').textContent = globalMeanError;
    }
    
    // Mettre à jour les informations personnelles
    if (myRanking) {
      const rank = myRanking.rank || 999;
      const avgError = (myRanking.avg_error || 0).toFixed(3);
      
      if (document.getElementById('my-rank')) {
        document.getElementById('my-rank').textContent = rank;
      }
      if (document.getElementById('total-agents')) {
        document.getElementById('total-agents').textContent = Object.keys(rankings).length;
      }
      if (document.getElementById('my-avg-error')) {
        document.getElementById('my-avg-error').textContent = avgError;
      }
      if (document.getElementById('rank-display')) {
        document.getElementById('rank-display').textContent = rank;
      }
    } else {
      if (document.getElementById('my-rank')) {
        document.getElementById('my-rank').textContent = '-';
      }
      if (document.getElementById('total-agents')) {
        document.getElementById('total-agents').textContent = Object.keys(rankings).length || '-';
      }
      if (document.getElementById('my-avg-error')) {
        document.getElementById('my-avg-error').textContent = '-';
      }
      if (document.getElementById('rank-display')) {
        document.getElementById('rank-display').textContent = '-';
      }
    }
    
    // Afficher top 5
    const sorted = Object.entries(rankings)
      .sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999))
      .slice(0, 5);
    
    const topHtml = sorted.map(([id, data]) => {
      const pos = data.position || ['?', '?'];
      const isMe = id === myAgentId;
      const rank = data.rank || 999;
      const avgError = (data.avg_error || 0).toFixed(3);
      return `<div style="${isMe ? 'color: #4AE290; font-weight: bold;' : 'color: #ccc;'}">
        ${rank}. Agent [${pos[0]},${pos[1]}]: error=${avgError}${isMe ? ' (YOU)' : ''}
      </div>`;
    }).join('');
    
    if (document.getElementById('top-predictors')) {
      document.getElementById('top-predictors').innerHTML = topHtml || '<div style="color: #888;">No rankings available</div>';
    }
  }
  
  // === V5: Formatage historique stratégies ===
  formatStrategyHistoryText() {
    if (!this.strategyHistory || this.strategyHistory.length === 0) {
      return 'No previous strategies used.';
    }
    
    let text = 'STRATEGY HISTORY:\n';
    this.strategyHistory.forEach(entry => {
      const coords = entry.source_agents.map(pos => `[${pos[0]}, ${pos[1]}]`).join(', ');
      text += `- It. ${entry.iteration}: "${entry.strategy_name}", ${coords}, (predicted error: ${entry.predicted_error.toFixed(2)}, actual error: ${entry.actual_error.toFixed(2)})\n`;
    });
    
    return text;
  }
  
  // === V5: Mise à jour historique stratégies ===
  updateStrategyHistory(parsed, snapshot) {
    // Extraire strategy_name et source_agents depuis la réponse W
    const strategyName = parsed?.strategy_name || parsed?.strategy || 'Unknown strategy';
    const sourceAgents = parsed?.source_agents || [];
    
    // Extraire actual_error depuis le snapshot O+N actuel (sera mis à jour au prochain snapshot)
    const actualError = this.myPredictionError || 0;
    
    // Extraire predicted_error depuis parsed (si disponible) ou utiliser valeur par défaut
    const predictedError = parsed?.predicted_error || 0.2; // Valeur par défaut si non fournie
    
    // Extraire delta_C_w et delta_C_d depuis parsed
    const deltaCw = parsed?.delta_complexity?.delta_C_w_bits || 0;
    const deltaCd = parsed?.delta_complexity?.delta_C_d_bits || 0;
    
    // Vérifier si une entrée existe déjà pour cette itération (mise à jour)
    const existingIndex = this.strategyHistory.findIndex(e => e.iteration === this.iterationCount);
    
    if (existingIndex >= 0) {
      // Mettre à jour l'entrée existante (actual_error peut être mis à jour)
      this.strategyHistory[existingIndex] = {
        iteration: this.iterationCount,
        strategy_name: strategyName,
        strategy_id: parsed?.strategy_id || null,
        source_agents: sourceAgents, // Tableau de coordonnées [X,Y]
        predicted_error: predictedError,
        actual_error: actualError, // Peut être mis à jour si snapshot suivant disponible
        delta_C_w: deltaCw,
        delta_C_d: deltaCd
      };
    } else {
      // Ajouter nouvelle entrée
      this.strategyHistory.push({
        iteration: this.iterationCount,
        strategy_name: strategyName,
        strategy_id: parsed?.strategy_id || null,
        source_agents: sourceAgents, // Tableau de coordonnées [X,Y]
        predicted_error: predictedError,
        actual_error: actualError,
        delta_C_w: deltaCw,
        delta_C_d: deltaCd
      });
    }
    
    // Limiter à 50 dernières itérations (cohérent avec predictionMetrics)
    if (this.strategyHistory.length > 50) {
      this.strategyHistory.shift();
    }
  }
  
  // === V5: Mise à jour actual_error dans historique après réception snapshot ===
  updateStrategyHistoryActualError() {
    // Mettre à jour l'actual_error de la dernière entrée avec l'erreur actuelle
    if (this.strategyHistory.length > 0) {
      const lastEntry = this.strategyHistory[this.strategyHistory.length - 1];
      if (lastEntry.iteration === this.iterationCount - 1) { // Snapshot correspond à l'itération précédente
        lastEntry.actual_error = this.myPredictionError || 0;
      }
    }
  }
  
  // === V5: Graphique erreurs prédiction ===
  drawPredictionErrorChart() {
    const canvas = document.getElementById('predictionErrorChart');
    if (!canvas) return;
    
    // Ajuster la hauteur du canvas pour correspondre au graphique SIMPLICITY METRICS
    if (!canvas.width || canvas.width === 0) canvas.width = canvas.offsetWidth || 800;
    if (!canvas.height || canvas.height === 0) canvas.height = canvas.offsetHeight || 120;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padLeft = 10; // Espace minimal à gauche (pas d'axe vertical)
    const padTop = 10; // Espace minimal en haut
    const padBottom = 10; // Espace minimal en bas (pas de label X)
    const padRight = 10; // Espace minimal à droite
    
    ctx.clearRect(0, 0, w, h);
    
    const data = this.predictionMetrics;
    if (data.iterations.length < 2) return;
    
    // Axe horizontal seulement (pas d'axe vertical, pas de labels)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();
    
    // Échelles
    const minIter = Math.min(...data.iterations);
    const maxIter = Math.max(...data.iterations);
    
    // Calculer maxError en gérant les cas où les tableaux sont vides
    const allErrors = [
      ...(data.my_error || []),
      ...(data.mean_error || []),
      ...(data.std_error || [])
    ].filter(v => !isNaN(v) && isFinite(v));
    const maxError = allErrors.length > 0 ? Math.max(1.0, ...allErrors) : 1.0;
    
    const scaleX = (iter) => padLeft + ((iter - minIter) / (maxIter - minIter || 1)) * (w - padLeft - padRight);
    const scaleY = (error) => h - padBottom - (error / maxError) * (h - padTop - padBottom);
    
    // Dessiner courbes
    const drawCurve = (values, color, lineWidth = 2, dash = []) => {
      if (!values || values.length < 2) {
        console.log(`[V5] drawCurve: skipping (values=${!!values}, length=${values?.length || 0})`);
        return;
      }
      // Filtrer les valeurs invalides et s'assurer qu'on a des valeurs correspondant aux iterations
      if (values.length !== data.iterations.length) {
        console.warn(`[V5] drawCurve: length mismatch (values=${values.length}, iterations=${data.iterations.length})`);
        return;
      }
      const validPairs = [];
      for (let i = 0; i < values.length; i++) {
        if (!isNaN(values[i]) && isFinite(values[i]) && data.iterations[i] !== undefined) {
          validPairs.push({ iter: data.iterations[i], val: values[i] });
        }
      }
      if (validPairs.length < 2) {
        console.log(`[V5] drawCurve: not enough valid pairs (${validPairs.length})`);
        return;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.beginPath();
      // Dessiner la courbe avec les paires valides
      for (let i = 0; i < validPairs.length; i++) {
        const x = scaleX(validPairs[i].iter);
        const y = scaleY(validPairs[i].val);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    
    // Debug: vérifier les données avant de dessiner
    console.log(`[V5] drawPredictionErrorChart: iterations=${data.iterations.length}, my_error=${data.my_error?.length || 0}, mean_error=${data.mean_error?.length || 0}, std_error=${data.std_error?.length || 0}`);
    if (data.mean_error && data.mean_error.length > 0) {
      console.log(`[V5] mean_error sample: [${data.mean_error.slice(-5).map(v => v.toFixed(2)).join(', ')}]`);
    }
    if (data.std_error && data.std_error.length > 0) {
      console.log(`[V5] std_error sample: [${data.std_error.slice(-5).map(v => v.toFixed(2)).join(', ')}]`);
    }
    
    // Dessiner toutes les courbes (même si certaines sont vides, elles seront ignorées)
    // CRITICAL: S'assurer que les tableaux ont la même longueur que iterations
    const maxLen = data.iterations.length;
    
    // Std (pointillés rouges) - dessiner en premier pour être en arrière-plan
    if (data.std_error && data.std_error.length > 0) {
      // S'assurer que std_error a la même longueur que iterations
      const stdValues = data.std_error.length === maxLen 
        ? data.std_error 
        : [...data.std_error, ...Array(maxLen - data.std_error.length).fill(0)];
      console.log(`[V5] Drawing std_error curve (${stdValues.length} points, max=${maxLen}, sample=[${stdValues.slice(-3).map(v => v.toFixed(3)).join(', ')}])`);
      drawCurve(stdValues, '#dc3545', 2, [5, 5]);
    } else {
      console.log(`[V5] std_error not available or empty (length=${data.std_error?.length || 0}, maxLen=${maxLen})`);
    }
    
    // Mean (vert) - dessiner en deuxième
    if (data.mean_error && data.mean_error.length > 0) {
      // S'assurer que mean_error a la même longueur que iterations
      const meanValues = data.mean_error.length === maxLen 
        ? data.mean_error 
        : [...data.mean_error, ...Array(maxLen - data.mean_error.length).fill(0)];
      console.log(`[V5] Drawing mean_error curve (${meanValues.length} points, max=${maxLen}, sample=[${meanValues.slice(-3).map(v => v.toFixed(3)).join(', ')}])`);
      drawCurve(meanValues, '#28a745', 2);
    } else {
      console.log(`[V5] mean_error not available or empty (length=${data.mean_error?.length || 0}, maxLen=${maxLen})`);
    }
    
    // My error (bleu, plus épais) - dessiner en dernier pour être au premier plan
    if (data.my_error && data.my_error.length > 0) {
      // S'assurer que my_error a la même longueur que iterations
      const myValues = data.my_error.length === maxLen 
        ? data.my_error 
        : [...data.my_error, ...Array(maxLen - data.my_error.length).fill(0)];
      console.log(`[V5] Drawing my_error curve (${myValues.length} points, max=${maxLen})`);
      drawCurve(myValues, '#007bff', 3);
    } else {
      console.log(`[V5] my_error not available or empty (length=${data.my_error?.length || 0}, maxLen=${maxLen})`);
    }
  }

  async executePixels(pixelList) {
    if (!Array.isArray(pixelList) || pixelList.length === 0) {
      return Promise.resolve(0);
    }
    
    // CRITICAL: Attendre que le WebSocket soit prêt avant d'envoyer les pixels
    // Le premier agent (agent [0,0]) peut essayer d'envoyer avant que le WebSocket soit ouvert
    const maxWaitTime = 10000; // 10 secondes max d'attente
    const checkInterval = 100; // Vérifier toutes les 100ms
    let waited = 0;
    while ((!this.socket || this.socket.readyState !== WebSocket.OPEN) && waited < maxWaitTime) {
      await new Promise(r => setTimeout(r, checkInterval));
      waited += checkInterval;
    }
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error(`[V5] ⚠️  WebSocket non prêt après ${waited}ms - pixels non envoyés pour agent [${this.myPosition[0]},${this.myPosition[1]}]`);
      return Promise.resolve(0);
    }
    
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
    
    // Retourner une promesse qui se résout quand tous les pixels sont envoyés
    return new Promise((resolve) => {
      if (pixels.length === 0) {
        resolve(0);
        return;
      }
      
      let sentCount = 0;
      let actuallySentCount = 0; // Compteur des pixels réellement envoyés
      const totalPixels = pixels.length;
      
      for (let i=0;i<pixels.length;i++) {
        const timeoutId = setTimeout(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
              this.socket.send(JSON.stringify({
                type: 'cell_update',
                sub_x: pixels[i].x,
                sub_y: pixels[i].y,
                color: pixels[i].color
              }));
              // Mettre à jour l'état local pour capture
              const key = `${pixels[i].x},${pixels[i].y}`;
              this.myCellState[key] = pixels[i].color;
              actuallySentCount++;
            } catch (e) {
              console.error(`[V5] ⚠️  Erreur envoi pixel ${i+1}/${totalPixels} pour agent [${this.myPosition[0]},${this.myPosition[1]}]:`, e);
            }
            sentCount++;
          } else {
            // WebSocket fermé pendant l'envoi - compter quand même pour éviter blocage
            console.warn(`[V5] ⚠️  WebSocket fermé pendant envoi pixel ${i+1}/${totalPixels} pour agent [${this.myPosition[0]},${this.myPosition[1]}]`);
            sentCount++;
          }
          
          // Quand tous les pixels sont envoyés, résoudre la promesse
          if (sentCount === totalPixels) {
            if (actuallySentCount < totalPixels) {
              console.warn(`[V5] ⚠️  Seulement ${actuallySentCount}/${totalPixels} pixels envoyés pour agent [${this.myPosition[0]},${this.myPosition[1]}]`);
            }
            resolve(actuallySentCount);
          }
        }, i*delayPerPixel);
        this.pendingPixelTimeouts.push(timeoutId);
      }
      
      // Timeout de sécurité : résoudre même si tous les pixels ne sont pas envoyés
      const maxTime = (pixels.length * delayPerPixel) + 2000; // +2s de marge
      setTimeout(() => {
        if (sentCount < totalPixels) {
          console.warn(`[V5] ⚠️  Timeout executePixels: ${sentCount}/${totalPixels} pixels comptés, ${actuallySentCount} réellement envoyés pour agent [${this.myPosition[0]},${this.myPosition[1]}]`);
          resolve(actuallySentCount);
        }
      }, maxTime);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => new AIPlayerV5());



export { AIPlayerV5 };
