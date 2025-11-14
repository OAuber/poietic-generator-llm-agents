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
      const reasoning = s?.reasoning || '';
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
      if (formal_relations.connections && formal_relations.connections.length > 0) {
        content += `\nConnections:\n`;
        formal_relations.connections.forEach(c => {
          content += `  • Structure ${c.from_structure_idx} → ${c.to_structure_idx}: ${c.type} (strength: ${c.strength})\n`;
        });
      }
      content += `\nC_d (Description Complexity): ${s.C_d_current?.value ?? 'N/A'} bits\n`;
      content += `Description: ${s.C_d_current?.description || 'N/A'}\n`;
      if (reasoning) {
        content += `\nREASONING O\n${reasoning}\n`;
      }
      // Replace complexity terms in content
      content = this.replaceComplexityTerms(content);
    } else if (source === 'N') {
      // V5: Format N-machine output (narrative + C_w + erreurs prédiction)
      const s = data?.simplicity_assessment || {};
      const narrative = data?.narrative || {};
      const prediction_errors = data?.prediction_errors || {};
      const reasoning = s?.reasoning || '';
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
      
      if (reasoning) {
        content += `\nREASONING N\n${reasoning}\n`;
      }
      // Replace complexity terms in all N content (narrative, explanations, reasoning)
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
        const rationale = data?.rationale || '';
        const preds = data?.predictions || {};
        const delta = data?.delta_complexity || {};
        const pixels = data?.pixels || [];
        content =
          `W-MACHINE (Action/Generation)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\nSTRATEGY\n${strategy}\n` +
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
        myY: this.myPosition[1]
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
              this.storeVerbatimResponse('W', {
                seed: { concept: 'Erreur API', rationale: `Erreur: ${error.message}` },
                predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
                pixels: []
              }, this.iterationCount);
              break;
            }
          }
        }
        
        // Fallback seed: si aucun pixel retourné (erreur API ou réponse vide), générer un seed minimal local
        if (pixelsToExecute.length === 0) {
          const center = 10;
          const color = '#F5D142';
          const ring = [
            {x:center, y:center-1}, {x:center, y:center+1},
            {x:center-1, y:center}, {x:center+1, y:center},
            {x:center-1, y:center-1}, {x:center+1, y:center-1},
            {x:center-1, y:center+1}, {x:center+1, y:center+1}
          ];
          pixelsToExecute = ring.map(p => `${p.x},${p.y}${color}`);
          this.storeVerbatimResponse('W', {
            seed: { concept: 'Fallback Seed (ring)', rationale: 'Seed minimal utilisé car 0 pixel retourné' },
            predictions: { individual_after_prediction: 'N/A', collective_after_prediction: 'N/A' },
            pixels: pixelsToExecute
          }, this.iterationCount);
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
        
        // Store predictions pour la prochaine itération (action)
        this.prevPredictions = parsed?.predictions || null;
        
      } else {
        // Mode action (W) : récupérer snapshot O et attendre nouveau snapshot POSTÉRIEUR à la dernière action
        await this.fetchOSnapshot();
        
        // Vérifier si un nouveau snapshot O est disponible POSTÉRIEUR à la dernière action
        const currentOVersion = this.Osnapshot?.version ?? -1;
        
        // Exception : pour la première action (itération 1), accepter le snapshot disponible
        // même si la version n'a pas changé depuis le seed, car O peut ne pas avoir encore
        // généré de nouveau snapshot après le seed du client
        const isFirstAction = this.iterationCount === 1;
        
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
          this.log(`Première action (itération 1) : utilisation snapshot disponible (version ${currentOVersion})`);
        } else {
          this.log(`Nouveau snapshot O détecté (version ${currentOVersion} > ${this.lastOVersionAtAction}), action autorisée`);
        }
        this.lastOVersionSeen = currentOVersion;
        
        // V5: Afficher le snapshot O+N dans Verbatim (séparé O et N)
        // IMPORTANT: Récupérer snapshot complet (sans agent_id) pour avoir toutes les erreurs de prédiction
        if (this.Osnapshot) {
          // Récupérer snapshot complet pour affichage verbatim (toutes les erreurs)
          let fullSnapshot = this.Osnapshot;
          // Si snapshot personnalisé (avec agent_id), récupérer version complète
          if (this.Osnapshot.prediction_errors && Object.keys(this.Osnapshot.prediction_errors).length === 1) {
            try {
              const fullRes = await fetch(`${this.O_API_BASE}/o/latest`);
              if (fullRes.ok) {
                fullSnapshot = await fullRes.json();
              }
            } catch (_) {
              // En cas d'erreur, utiliser snapshot personnalisé
            }
          }
          
          // Extraire et afficher O et N séparément
          const oData = {
            structures: fullSnapshot.structures,
            formal_relations: fullSnapshot.formal_relations,
            simplicity_assessment: {
              C_d_current: fullSnapshot.simplicity_assessment?.C_d_current,
              reasoning: fullSnapshot.simplicity_assessment?.reasoning_o || fullSnapshot.simplicity_assessment?.reasoning
            }
          };
          const nData = {
            narrative: fullSnapshot.narrative,
            prediction_errors: fullSnapshot.prediction_errors || {},
            simplicity_assessment: {
              C_w_current: fullSnapshot.simplicity_assessment?.C_w_current,
              reasoning: fullSnapshot.simplicity_assessment?.reasoning_n
            }
          };
          
          this.storeVerbatimResponse('O', oData, this.iterationCount);
          this.storeVerbatimResponse('N', nData, this.iterationCount);
          
          this.updateOMetrics(this.Osnapshot);
          // V5: Mettre à jour les métriques d'erreur de prédiction
          this.updatePredictionMetrics(this.Osnapshot);
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
        // Mettre à jour le graphique O si snapshot disponible
        if (this.Osnapshot) this.updateOMetrics(this.Osnapshot);

        // Extraire les couleurs des voisins pour faciliter la coordination
        const neighborColors = this.extractNeighborColors();
        ctx.neighborColors = neighborColors;

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
            } else {
              // Réponse invalide (manque strategy/rationale/delta_complexity)
              const hasPixels = Array.isArray(parsed?.pixels) && parsed.pixels.length > 0;
              this.log(`[W Action] Réponse invalide: strategy=${!!parsed?.strategy}, rationale=${!!parsed?.rationale}, delta=${!!parsed?.delta_complexity}, pixels=${hasPixels ? parsed.pixels.length : 0}, keys=${parsed ? Object.keys(parsed).join(',') : 'null'}`);
              if (attempt < maxRetries - 1) {
                const delay = 2 * (attempt + 1); // 2s, 4s, 6s
                this.log(`[W Action] Retry dans ${delay}s... (tentative ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, delay * 1000));
                continue;
              } else {
                // Dernière tentative échouée
                this.log(`[W Action] ⚠️ Réponse invalide après ${maxRetries} tentatives (manque strategy/rationale/delta_complexity)`);
                // Continuer avec parsed (qui a au moins les pixels si disponibles)
                this.storeVerbatimResponse('W', parsed, this.iterationCount);
                pixelsToExecute = Array.isArray(parsed?.pixels) ? parsed.pixels : [];
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

        // V5: Erreur de prédiction vient de N-machine (déjà dans this.myPredictionError)
        if (this.elements.predError) {
          this.elements.predError.textContent = (this.myPredictionError || 0).toFixed(2);
        }

        // V5: Deltas viennent directement de Gemini W (parsed.delta_complexity)
        const deltas = parsed?.delta_complexity || {
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
    if (!snapshot || !snapshot.prediction_errors) return;
    
    const errors = snapshot.prediction_errors || {};
    const errorValues = Object.values(errors).map(e => e.error || 0).filter(v => !isNaN(v));
    
    if (errorValues.length === 0) return;
    
    // Calcul moyenne et écart-type
    const mean = errorValues.reduce((a,b) => a+b, 0) / errorValues.length;
    const variance = errorValues.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / errorValues.length;
    const std = Math.sqrt(variance);
    
    this.predictionMetrics.iterations.push(this.iterationCount);
    this.predictionMetrics.my_error.push(this.myPredictionError || 0);
    this.predictionMetrics.mean_error.push(mean);
    this.predictionMetrics.std_error.push(std);
    
    // Limiter à 50 dernières itérations
    if (this.predictionMetrics.iterations.length > 50) {
      this.predictionMetrics.iterations.shift();
      this.predictionMetrics.my_error.shift();
      this.predictionMetrics.mean_error.shift();
      this.predictionMetrics.std_error.shift();
    }
    
    this.drawPredictionErrorChart();
  }
  
  // === V5: Graphique erreurs prédiction ===
  drawPredictionErrorChart() {
    const canvas = document.getElementById('predictionErrorChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = 40;
    
    ctx.clearRect(0, 0, w, h);
    
    const data = this.predictionMetrics;
    if (data.iterations.length < 2) return;
    
    // Axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
    
    // Labels (typos plus grandes)
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Iteration', w / 2, h - 10);
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Prediction Error (0-1)', 0, 0);
    ctx.restore();
    
    // Échelles
    const minIter = Math.min(...data.iterations);
    const maxIter = Math.max(...data.iterations);
    const maxError = Math.max(1.0, Math.max(...data.my_error, ...data.mean_error, ...data.std_error));
    
    const scaleX = (iter) => pad + ((iter - minIter) / (maxIter - minIter || 1)) * (w - 2 * pad);
    const scaleY = (error) => h - pad - (error / maxError) * (h - 2 * pad);
    
    // Dessiner courbes
    const drawCurve = (values, color, lineWidth = 2, dash = []) => {
      if (values.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(scaleX(data.iterations[0]), scaleY(values[0]));
      for (let i = 1; i < values.length; i++) {
        ctx.lineTo(scaleX(data.iterations[i]), scaleY(values[i]));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    
    // Std (pointillés rouges)
    drawCurve(data.std_error, '#dc3545', 2, [5, 5]);
    // Mean (vert)
    drawCurve(data.mean_error, '#28a745', 2);
    // My error (bleu, plus épais)
    drawCurve(data.my_error, '#007bff', 3);
  }

  async executePixels(pixelList) {
    if (!Array.isArray(pixelList) || pixelList.length === 0) return Promise.resolve(0);
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
      const totalPixels = pixels.length;
      
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
          sentCount++;
          // Quand tous les pixels sont envoyés, résoudre la promesse
          if (sentCount === totalPixels) {
            resolve(totalPixels);
          }
        }, i*delayPerPixel);
        this.pendingPixelTimeouts.push(timeoutId);
      }
      
      // Timeout de sécurité : résoudre même si tous les pixels ne sont pas envoyés
      const maxTime = (pixels.length * delayPerPixel) + 2000; // +2s de marge
      setTimeout(() => {
        if (sentCount < totalPixels) {
          console.warn(`[V4] Timeout executePixels: ${sentCount}/${totalPixels} pixels envoyés`);
          resolve(sentCount);
        }
      }, maxTime);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => new AIPlayerV5());



export { AIPlayerV5 };
