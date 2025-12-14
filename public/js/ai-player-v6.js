/**
 * AI Player V6 - Quantum Architecture
 * 
 * Q-machine cycle: Ss → O → N → Ws → O → N → Ws → ...
 * Each W-instance is a "slit" in the multi-slit quantum apparatus.
 */
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
    this.heartbeatInterval = null;
    this.snapshotPollingInterval = null;
    this.wHeartbeatInterval = null;

    // Quantum state
    this.lastObservation = null;
    this.prevPredictions = null;
    this.quantumSnapshot = null;
    this.lastQVersionSeen = -1;
    this.lastQVersionAtAction = -1;
    this.myPredictionError = 0;

    // Quantum metrics for charts
    this.quantumMetrics = { 
      versions: [], 
      phi: [], 
      xi: [],
      I: [],
      tau: [], 
      dS: [],
      U: [],
      C_w: [],
      C_d: []
    };
    
    // Simplicity metrics for charts (like V5)
    this.oMetrics = { versions: [], C_w: [], C_d: [], U: [] };
    
    // Prediction error metrics (like V5)
    this.predictionMetrics = { iterations: [], my_error: [], mean_error: [], std_error: [] };
    this.strategyHistory = [];
    this.artisticIdentity = null;

    // URLs
    const loc = window.location;
    const WS_PROTOCOL = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_HOST = loc.host;
    // Main poietic server is on port 3001 - use that for WebSocket
    const POIETIC_PORT = '3001';
    const wsHost = WS_HOST.replace(/:\d+$/, `:${POIETIC_PORT}`);
    this.WS_URL = `${WS_PROTOCOL}//${wsHost}/updates?type=bot`;
    // V6: Quantum server on port 8006
    this.Q_API_BASE = loc.origin.replace(/:\d+$/, ':8006');
    // V6: Quantum metrics server on port 5006
    this.METRICS_WS_URL = `${WS_PROTOCOL}//${WS_HOST.replace(/:\d+$/, '')}:5006/quantum-metrics`;
    this.metricsSocket = null;

    this.elements = {
      apiKey: document.getElementById('api-key'),
      interval: document.getElementById('interval'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      modeLabel: document.getElementById('v6-mode'),
      journal: document.getElementById('journal'),
      viewerFrame: document.getElementById('viewer-frame'),
      viewerUrl: document.getElementById('viewer-url'),
      headerPosition: document.getElementById('header-position'),
      userIdDisplay: document.getElementById('user-id-display'),
      statusBadge: document.getElementById('status-badge'),
      metricPhi: document.getElementById('metric-phi'),
      metricXi: document.getElementById('metric-xi'),
      metricI: document.getElementById('metric-I'),
      metricTau: document.getElementById('metric-tau'),
      metricDS: document.getElementById('metric-dS'),
      metricU: document.getElementById('metric-u'),
      metricRank: document.getElementById('metric-rank'),
      quantumVersion: document.getElementById('quantum-version')
    };

    this.bindUI();
    this.initApiKey();
    // Connect to metrics server
    this.connectMetricsServer();
  }

  initApiKey() {
    try {
      const saved = window.GeminiV6Adapter?.getApiKey?.() || localStorage.getItem('gemini_api_key') || '';
      if (this.elements.apiKey && !this.elements.apiKey.value && saved) {
        this.elements.apiKey.value = saved;
      }
      if (window.GeminiV6Adapter) {
        window.GeminiV6Adapter.apiKey = saved;
      }
    } catch (_) {}

    window.addEventListener('storage', (e) => {
      if (e.key === 'gemini_api_key') {
        const v = e.newValue || '';
        if (this.elements.apiKey) this.elements.apiKey.value = v;
        if (window.GeminiV6Adapter) window.GeminiV6Adapter.apiKey = v;
      }
    });
  }

  log(...args) {
    if (this.elements.journal) {
      const timestamp = new Date().toLocaleTimeString();
      this.elements.journal.textContent += `[${timestamp}] ${args.join(' ')}\n`;
      this.elements.journal.scrollTop = this.elements.journal.scrollHeight;
    }
    console.log('[V6-Q]', ...args);
  }

  setMode(mode) {
    this.promptMode = mode;
    if (this.elements.modeLabel) {
      // Mode label is no longer displayed in header banner (removed per user request)
      // Keep for internal tracking only
      this.promptMode = mode;
    }
  }

  updateStatusBadge(status) {
    if (!this.elements.statusBadge) return;
    const badge = this.elements.statusBadge;
    badge.className = `status-badge ${status}`;
    const statusText = {
      'quantum': 'Quantum Active',
      'coherent': 'Coherent (φ > 0.6)',
      'decoherent': 'Decoherent (φ < 0.4)',
      'condensate': 'Bose-Einstein (τ > 0.8)'
    };
    // Check if span exists before setting textContent
    const span = badge.querySelector('span:last-child');
    if (span) {
      span.textContent = statusText[status] || status;
    } else {
      // If no span, set textContent directly on badge
      badge.textContent = statusText[status] || status;
    }
  }

  updateQuantumDisplay(snapshot) {
    if (!snapshot) {
      console.warn('[V6-Q] [updateQuantumDisplay] No snapshot provided');
      return;
    }
    
    const coherence = snapshot.coherence_observables || {};
    const emergence = snapshot.emergence_observables || {};
    const sa = snapshot.simplicity_assessment || {};
    
    const phi = coherence.phi_coherence || coherence.phi_formal_resonance || 0;
    const xi = coherence.xi_correlation_length || coherence.xi_collective_extent || 0;
    const I = coherence.I_fringe_visibility || coherence.I_pareidolic_contrast || 0;
    const tau = emergence.tau_condensation || emergence.tau_narrative_convergence || 0;
    const dS = emergence.delta_S_entropy || emergence.delta_S_complexity_flux || 0;
    const U = sa.U_current?.value || 0;
    const version = snapshot.version || 0;
    
    // Debug: log extracted values
    if (version > 0 && (phi > 0 || tau > 0 || I > 0)) {
      console.log(`[V6-Q] [updateQuantumDisplay] v${version}: φ=${phi.toFixed(2)}, τ=${tau.toFixed(2)}, I=${I.toFixed(2)}, U=${U}`);
    }
    
    // Update metric displays (check if elements exist to avoid null errors)
    if (this.elements.metricPhi) this.elements.metricPhi.textContent = phi.toFixed(2);
    if (this.elements.metricXi) this.elements.metricXi.textContent = xi.toFixed(2);
    if (this.elements.metricI) this.elements.metricI.textContent = I.toFixed(2);
    if (this.elements.metricTau) this.elements.metricTau.textContent = tau.toFixed(2);
    if (this.elements.metricDS) this.elements.metricDS.textContent = dS.toFixed(2);
    if (this.elements.metricU) this.elements.metricU.textContent = Math.round(U);
    if (this.elements.quantumVersion) this.elements.quantumVersion.textContent = version;
    
    // Also update O+N metrics in Metrics tab (like V5) - check if elements exist
    try {
      const oVersion = document.getElementById('o-version');
      const oCw = document.getElementById('o-cw');
      const oCd = document.getElementById('o-cd');
      const oU = document.getElementById('o-u');
      if (oVersion) oVersion.textContent = version;
      if (oCw) oCw.textContent = Math.round(sa.C_w_current?.value || 0);
      if (oCd) oCd.textContent = Math.round(sa.C_d_current?.value || 0);
      if (oU) oU.textContent = Math.round(U);
      
      // Update O metrics history and draw chart (like V5)
      this.updateOMetrics(snapshot);
    } catch (e) {
      // Elements may not exist if Metrics tab is not active, ignore
    }
    
    // Update prediction error metrics (like V5)
    // Extract my prediction error from snapshot
    const predictionErrors = snapshot.prediction_errors || {};
    if (this.myUserId && predictionErrors[this.myUserId]) {
      const errorVal = predictionErrors[this.myUserId].error;
      this.myPredictionError = typeof errorVal === 'number' ? errorVal : (typeof errorVal === 'string' && !isNaN(parseFloat(errorVal))) ? parseFloat(errorVal) : 0;
    }
    this.updatePredictionMetrics(snapshot);
    
    // Update rank if available
    const rankings = snapshot.agent_rankings || {};
    if (this.myUserId && rankings[this.myUserId]) {
      const rank = rankings[this.myUserId].rank || '-';
      if (this.elements.metricRank) this.elements.metricRank.textContent = rank;
    }
    
    // Update status based on quantum regime
    if (tau >= 0.8) {
      this.updateStatusBadge('condensate');
    } else if (phi >= 0.6) {
      this.updateStatusBadge('coherent');
    } else if (phi < 0.4) {
      this.updateStatusBadge('decoherent');
    } else {
      this.updateStatusBadge('quantum');
    }
    
    // Update metrics history
    this.quantumMetrics.versions.push(version);
    this.quantumMetrics.phi.push(phi);
    this.quantumMetrics.xi.push(xi);
    this.quantumMetrics.I.push(I);
    this.quantumMetrics.tau.push(tau);
    this.quantumMetrics.dS.push(dS);
    this.quantumMetrics.U.push(U);
    this.quantumMetrics.C_w.push(sa.C_w_current?.value || 0);
    this.quantumMetrics.C_d.push(sa.C_d_current?.value || 0);
    
    // Limit history
    const maxHistory = 100;
    for (const key of Object.keys(this.quantumMetrics)) {
      if (this.quantumMetrics[key].length > maxHistory) {
        this.quantumMetrics[key] = this.quantumMetrics[key].slice(-maxHistory);
      }
    }
    
    this.drawQuantumChart();
    
    // Note: Verbatim O+N is now stored in executeAction() when snapshot is received,
    // not here in updateQuantumDisplay() to match V5 behavior
  }

  drawQuantumChart() {
    const canvas = document.getElementById('quantum-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth || 800;
    const height = canvas.offsetHeight || 120;
    canvas.width = width;
    canvas.height = height;
    
    ctx.clearRect(0, 0, width, height);
    
    const data = this.quantumMetrics;
    if (!data.versions || data.versions.length === 0) return;
    
    const n = data.versions.length;
    if (n < 2) return;
    
    const xScale = width / Math.max(n - 1, 1);
    const padding = 5;
    const graphHeight = height - padding * 2;
    
    // Draw grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (graphHeight * i / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw φ (Formal Resonance) - cyan #00d4ff
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * xScale;
      const y = padding + graphHeight - (data.phi[i] * graphHeight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw ξ/3 (Collective Extent) - violet #8080ff
    ctx.strokeStyle = '#8080ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * xScale;
      const normalizedXi = Math.min((data.xi[i] || 0) / 3, 1);
      const y = padding + graphHeight - (normalizedXi * graphHeight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw I (Pareidolic Contrast) - magenta #ff80ff
    ctx.strokeStyle = '#ff80ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * xScale;
      const y = padding + graphHeight - ((data.I[i] || 0) * graphHeight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw τ (Narrative Convergence) - yellow #ffcc00
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * xScale;
      const y = padding + graphHeight - ((data.tau[i] || 0) * graphHeight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw ΔS (Complexity Flux) - yellow light #ffff80
    // Note: ΔS can be negative, so we need to handle that
    if (data.dS && data.dS.length > 0) {
      ctx.strokeStyle = '#ffff80';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); // Dashed line for ΔS
      ctx.beginPath();
      const dSValues = data.dS.filter(v => v != null);
      if (dSValues.length > 0) {
        const minDS = Math.min(...dSValues);
        const maxDS = Math.max(...dSValues);
        const rangeDS = maxDS - minDS || 1; // Avoid division by zero
        for (let i = 0; i < n; i++) {
          const x = i * xScale;
          const dSValue = data.dS[i] || 0;
          const normalizedDS = (dSValue - minDS) / rangeDS;
          const y = padding + graphHeight - (normalizedDS * graphHeight);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash
    }
  }

  storeVerbatimResponse(source, data, iteration) {
    const container = document.getElementById('verbatim-responses');
    if (!container) {
      console.warn('[V6-Q] verbatim-responses container not found');
      return;
    }

    // Remove placeholder (can be .image-placeholder or .response-item with "Awaiting" or "No responses")
    const placeholder = container.querySelector('.image-placeholder') || 
                       container.querySelector('.response-item');
    if (placeholder && (placeholder.textContent.includes('Awaiting') || 
                       placeholder.textContent.includes('No responses'))) {
      placeholder.remove();
    }

    const item = document.createElement('div');
    item.className = 'response-item';
    const timestamp = new Date().toLocaleTimeString();

    let content = '';
    if (source === 'Q-O') {
      const s = data?.simplicity_assessment || {};
      const coherence = data?.coherence_observables || {};
      const structs = data?.structures || [];
      content = 
        `Q-O MACHINE (Quantum Measurement)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nEIGENSTATES (${structs.length})\n`;
      structs.forEach((st, i) => {
        const positions = st.agent_positions ? `[${st.agent_positions.map(p => `[${p[0]},${p[1]}]`).join(', ')}]` : 'N/A';
        content += `  ${i+1}. ${st.type} (${st.size_agents} slits at ${positions}, ${st.interference_type || 'mixed'})\n`;
      });
      content += `\nCOHERENCE OBSERVABLES\n`;
      content += `φ-coherence: ${coherence.phi_coherence?.toFixed(2) || 'N/A'}\n`;
      content += `ξ-correlation: ${coherence.xi_correlation_length?.toFixed(2) || 'N/A'}\n`;
      content += `I-visibility: ${coherence.I_fringe_visibility?.toFixed(2) || 'N/A'}\n`;
      content += `\nC_d: ${s.C_d_current?.value ?? 'N/A'} bits\n`;
    } else if (source === 'Q-N') {
      const s = data?.simplicity_assessment || {};
      const emergence = data?.emergence_observables || {};
      const narrative = data?.narrative || {};
      content = 
        `Q-N MACHINE (Quantum Interpretation)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nNARRATIVE\n${narrative.summary || 'N/A'}\n` +
        `\nEMERGENCE OBSERVABLES\n` +
        `τ-condensation: ${emergence.tau_condensation?.toFixed(2) || 'N/A'}\n` +
        `ΔS-entropy: ${emergence.delta_S_entropy?.toFixed(2) || 'N/A'}\n` +
        `\nC_w: ${s.C_w_current?.value ?? 'N/A'} bits\n`;
    } else if (source === 'S') {
      const seed = data?.seed || {};
      // Try both quantum_measures and creative_measures
      const qm = data?.quantum_measures || data?.creative_measures || {};
      const preds = data?.predictions || {};
      const pixels = data?.pixels || [];
      // Map field names if needed
      const psi = qm.psi_distinctiveness ?? qm.psi_originality;
      const eta = qm.eta_potential ?? qm.eta_dialogue_aptitude;
      const lambda = qm.lambda_coherence ?? qm.lambda_internal_coherence;
      content =
        `S-MACHINE (Quantum Seed)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nCONCEPT: ${seed.concept || 'N/A'}\n` +
        `REFERENCE: ${seed.artistic_reference || 'N/A'}\n` +
        `\nQUANTUM MEASURES\n` +
        `Ψ-distinctiveness: ${psi !== undefined ? psi.toFixed(2) : 'N/A'}\n` +
        `η-potential: ${eta !== undefined ? eta.toFixed(2) : 'N/A'}\n` +
        `λ-coherence: ${lambda !== undefined ? lambda.toFixed(2) : 'N/A'}\n` +
        `\nPIXELS: ${pixels.length} quantum amplitudes\n`;
    } else if (source === 'W') {
      const strategy = data?.strategy || 'N/A';
      const strategy_ids = data?.strategy_ids || (data?.strategy_id ? [data.strategy_id] : ['N/A']);
      const delta = data?.delta_complexity || {};
      const preds = data?.predictions || {};
      const pixels = data?.pixels || [];
      content =
        `W-MACHINE (Quantum Evolution)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\nUNITARY: ${strategy}\n` +
        `Strategy IDs: ${strategy_ids.join(', ')}\n` +
        `\nDELTA COMPLEXITY\n` +
        `ΔC_w: ${delta.delta_C_w_bits ?? 'N/A'} bits | ` +
        `ΔC_d: ${delta.delta_C_d_bits ?? 'N/A'} bits\n` +
        `Δφ: ${delta.delta_phi_coherence ?? 'N/A'} | ` +
        `Δτ: ${delta.delta_tau_condensation ?? 'N/A'}\n` +
        `U' expected: ${delta.U_after_expected ?? 'N/A'} bits\n` +
        `\nPIXELS: ${pixels.length} evolved\n`;
    }

    // Renommer Q-O et Q-N en O et N
    const displaySource = source === 'Q-O' ? 'O' : source === 'Q-N' ? 'N' : source;
    
    item.innerHTML = `
      <div class="response-header">
        <span class="response-timestamp" style="font-size: 10px;">${timestamp}</span>
        <span class="response-iteration" style="font-size: 10px;">${displaySource} | Iter ${iteration}</span>
      </div>
      <div class="response-content" style="margin-top: 4px; margin-bottom: 4px; overflow-x: auto;">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; line-height: 1.3; margin: 0; word-wrap: break-word;">${this.escapeHtml(content)}</pre>
      </div>
    `;

    container.insertBefore(item, container.firstChild);
    while (container.children.length > 10) {
      container.removeChild(container.lastChild);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  bindUI() {
    if (!this.elements.btnStart) {
      console.error('[V6-Q] btn-start element not found');
      return;
    }
    
    this.elements.btnStart.addEventListener('click', async () => {
      if (!this.isRunning) {
        this.isRunning = true;
        this.elements.btnStart.textContent = '■ Stop';
        try {
          await this.connectWebSocket();
          this.connectMetricsServer();
        } catch (e) {
          this.log('WS error:', e?.message || e);
          this.isRunning = false;
          this.elements.btnStart.textContent = '▶ Start';
          return;
        }
        if (this.elements.viewerFrame) {
          const selected = this.elements.viewerUrl?.value || '/viewer2';
          this.elements.viewerFrame.src = selected;
        }
        this.mainLoop();
      } else {
        this.isRunning = false;
        this.elements.btnStart.textContent = '▶ Start';
        this.cancelPendingPixels();
        this.stopHeartbeat();
        this.stopSnapshotPolling();
        this.stopWHeartbeat();
        try { this.socket?.close(); } catch(_) {}
      }
    });

    if (this.elements.btnPause) {
      this.elements.btnPause.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        this.elements.btnPause.textContent = this.isPaused ? '▶ Resume' : '⏸ Pause';
      });
    }

    if (this.elements.apiKey) {
      const persist = () => {
        const v = this.elements.apiKey.value || '';
        try { localStorage.setItem('gemini_api_key', v); } catch(_) {}
        if (window.GeminiV6Adapter) window.GeminiV6Adapter.apiKey = v;
      };
      this.elements.apiKey.addEventListener('change', persist);
      this.elements.apiKey.addEventListener('blur', persist);
    }

    if (this.elements.viewerUrl) {
      this.elements.viewerUrl.addEventListener('change', () => {
        if (this.elements.viewerFrame) {
          this.elements.viewerFrame.src = this.elements.viewerUrl.value;
        }
      });
    }

    // Clear API key button
    const btnClearKey = document.getElementById('btn-clear-key');
    if (btnClearKey) {
      btnClearKey.addEventListener('click', () => {
        if (this.elements.apiKey) {
          this.elements.apiKey.value = '';
          try { localStorage.removeItem('gemini_api_key'); } catch(_) {}
          if (window.GeminiV6Adapter) window.GeminiV6Adapter.apiKey = '';
        }
      });
    }

    // Locate button
    const btnLocate = document.getElementById('btn-locate');
    if (btnLocate) {
      btnLocate.addEventListener('click', () => {
        if (this.myPosition && this.myPosition[0] !== 0 && this.myPosition[1] !== 0) {
          this.log(`Agent position: [${this.myPosition[0]}, ${this.myPosition[1]}]`);
          // Scroll viewer to position if possible
          if (this.elements.viewerFrame && this.elements.viewerFrame.contentWindow) {
            try {
              this.elements.viewerFrame.contentWindow.postMessage({
                type: 'scroll_to',
                x: this.myPosition[0],
                y: this.myPosition[1]
              }, '*');
            } catch(_) {}
          }
        } else {
          this.log('Position not yet initialized');
        }
      });
    }
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.log(`Connecting to ${this.WS_URL}`);
      this.socket = new WebSocket(this.WS_URL);
      this.socket.onopen = () => {
        this.log('✅ WebSocket connected');
        this.startHeartbeat();
        this.startSnapshotPolling();
        this.startWHeartbeat();
        resolve();
      };
      this.socket.onerror = (e) => {
        this.log('WebSocket error');
        reject(e);
      };
      this.socket.onclose = () => {
        this.log('WebSocket closed');
        this.stopHeartbeat();
        this.stopSnapshotPolling();
        this.stopWHeartbeat();
      };
      this.socket.onmessage = (e) => this.handleWSMessage(e);
    });
  }

  handleWSMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'initial_state') {
        this.myUserId = data.my_user_id;
        if (this.elements.userIdDisplay) {
          this.elements.userIdDisplay.textContent = this.myUserId?.substring(0, 8) || '-';
        }
        
        // CRITICAL: grid_state may be a JSON string that needs parsing (like V5)
        const gridState = typeof data.grid_state === 'string' 
          ? JSON.parse(data.grid_state) 
          : data.grid_state;
        
        const positions = gridState?.user_positions || {};
        const pos = positions[this.myUserId];
        if (Array.isArray(pos) && pos.length === 2) {
          this.myPosition = [parseInt(pos[0]), parseInt(pos[1])];
          if (this.elements.headerPosition) {
            this.elements.headerPosition.textContent = `[${this.myPosition[0]},${this.myPosition[1]}]`;
          }
          console.log(`[V6-Q] Position received: [${this.myPosition[0]},${this.myPosition[1]}]`);
        } else {
          console.warn(`[V6-Q] No position found for user ${this.myUserId} in initial_state`);
        }
        
        // Store other users with their positions
        for (const [uid, userPos] of Object.entries(positions)) {
          if (uid !== this.myUserId) {
            const parsedPos = Array.isArray(userPos) ? [parseInt(userPos[0]), parseInt(userPos[1])] : [0, 0];
            this.otherUsers[uid] = { position: parsedPos, pixels: {} };
          }
        }
        
        // Store initial cell states
        const subCellStates = data.sub_cell_states || {};
        if (subCellStates[this.myUserId]) {
          this.myCellState = subCellStates[this.myUserId];
        }
        for (const [uid, pixels] of Object.entries(subCellStates)) {
          if (uid !== this.myUserId) {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { position: [0, 0], pixels: {} };
            this.otherUsers[uid].pixels = pixels;
          }
        }
      }
      
      if (data.type === 'new_user') {
        // New user joined - store their position
        const uid = data.user_id;
        const pos = data.position;
        if (uid && pos) {
          const parsedPos = Array.isArray(pos) ? [parseInt(pos[0]), parseInt(pos[1])] : [0, 0];
          if (uid === this.myUserId) {
            // This is our own position being confirmed
            this.myPosition = parsedPos;
            if (this.elements.headerPosition) {
              this.elements.headerPosition.textContent = `[${this.myPosition[0]},${this.myPosition[1]}]`;
            }
            console.log(`[V6-Q] Own position confirmed: [${this.myPosition[0]},${this.myPosition[1]}]`);
          } else {
            if (!this.otherUsers[uid]) this.otherUsers[uid] = { pixels: {} };
            this.otherUsers[uid].position = parsedPos;
            this.log(`New user ${uid.substring(0, 8)} at [${parsedPos[0]},${parsedPos[1]}]`);
          }
        }
      }

      if (data.type === 'cell_update') {
        // Single cell update (from other players)
        const uid = data.user_id;
        if (uid && uid !== this.myUserId) {
          if (!this.otherUsers[uid]) this.otherUsers[uid] = {};
          if (!this.otherUsers[uid].pixels) this.otherUsers[uid].pixels = {};
          const key = `${data.sub_x},${data.sub_y}`;
          this.otherUsers[uid].pixels[key] = data.color;
        }
      }

      if (data.type === 'state_update') {
        if (data.user_id && data.pixels) {
          if (data.user_id === this.myUserId) {
            Object.assign(this.myCellState, data.pixels);
          } else {
            if (!this.otherUsers[data.user_id]) this.otherUsers[data.user_id] = {};
            if (!this.otherUsers[data.user_id].pixels) this.otherUsers[data.user_id].pixels = {};
            Object.assign(this.otherUsers[data.user_id].pixels, data.pixels);
          }
        }
      }
      
      if (data.type === 'user_position_update') {
        if (data.user_id === this.myUserId) {
          this.myPosition = [data.x, data.y];
          if (this.elements.headerPosition) {
            this.elements.headerPosition.textContent = `[${this.myPosition[0]},${this.myPosition[1]}]`;
          }
        } else {
          if (!this.otherUsers[data.user_id]) this.otherUsers[data.user_id] = {};
          this.otherUsers[data.user_id].position = [data.x, data.y];
        }
      }
      
    } catch (e) {
      console.error('[V6-Q] WS message error:', e);
    }
  }

  connectMetricsServer() {
    try {
      this.metricsSocket = new WebSocket(this.METRICS_WS_URL);
      this.metricsSocket.onopen = () => {
        this.log('Quantum metrics connected');
      };
      this.metricsSocket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'quantum_snapshot' && data.snapshot) {
            this.updateQuantumDisplay(data.snapshot);
          }
        } catch (_) {}
      };
      this.metricsSocket.onerror = () => {};
      this.metricsSocket.onclose = () => {
        this.log('Quantum metrics disconnected');
      };
    } catch (e) {
      this.log('Metrics connection failed:', e.message);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  startSnapshotPolling() {
    this.stopSnapshotPolling();
    this.snapshotPollingInterval = setInterval(() => this.pollQuantumSnapshot(), 5000);
  }

  stopSnapshotPolling() {
    if (this.snapshotPollingInterval) {
      clearInterval(this.snapshotPollingInterval);
      this.snapshotPollingInterval = null;
    }
  }

  startWHeartbeat() {
    this.stopWHeartbeat();
    this.wHeartbeatInterval = setInterval(() => this.sendWHeartbeat(), 30000);
  }

  stopWHeartbeat() {
    if (this.wHeartbeatInterval) {
      clearInterval(this.wHeartbeatInterval);
      this.wHeartbeatInterval = null;
    }
  }

  async sendWHeartbeat() {
    if (!this.myUserId) return;
    // Don't send heartbeat with [0,0] position - wait for real position
    if (this.myPosition[0] === 0 && this.myPosition[1] === 0) {
      console.log('[V6-Q] Skipping W heartbeat - position not yet received');
      return;
    }
    try {
      await fetch(`${this.Q_API_BASE}/q/w-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: this.myUserId,
          position: this.myPosition,
          iteration: this.iterationCount,
          is_heartbeat: true,
          timestamp: new Date().toISOString()
        })
      });
    } catch (_) {}
  }

  async pollQuantumSnapshot() {
    try {
      const url = this.myUserId 
        ? `${this.Q_API_BASE}/q/latest?agent_id=${this.myUserId}`
        : `${this.Q_API_BASE}/q/latest`;
      const resp = await fetch(url);
      if (resp.ok) {
        const snapshot = await resp.json();
        if (snapshot && !snapshot._pending) {
          const oldVersion = this.quantumSnapshot?.version;
          this.quantumSnapshot = snapshot;
          this.lastObservation = snapshot;
          
          // Update lastQVersionSeen
          if (snapshot.version !== undefined && snapshot.version > this.lastQVersionSeen) {
            this.lastQVersionSeen = snapshot.version;
            if (oldVersion !== snapshot.version) {
              this.log(`[Polling] New quantum snapshot v${snapshot.version} received (was v${oldVersion || 'none'})`);
            }
          }
          
          // Update display
          try {
            this.updateQuantumDisplay(snapshot);
          } catch (e) {
            console.error('[V6-Q] [Polling] Error in updateQuantumDisplay:', e);
          }
          
          // Update rank display
          if (snapshot.agent_rankings && this.myUserId) {
            const myRanking = snapshot.agent_rankings[this.myUserId];
            if (myRanking && this.elements.metricRank) {
              const total = Object.keys(snapshot.agent_rankings).length;
              this.elements.metricRank.textContent = `${myRanking.rank}/${total}`;
            }
          }
          
          // Update prediction error
          if (snapshot.prediction_errors && this.myUserId) {
            const myError = snapshot.prediction_errors[this.myUserId];
            if (myError) {
              this.myPredictionError = myError.error || 0;
            }
          }
        } else if (snapshot?._pending) {
          // Snapshot is pending, will be available soon
          this.log(`[Polling] Snapshot pending, waiting...`);
        }
      } else {
        this.log(`[Polling] Failed to fetch snapshot: ${resp.status}`);
      }
    } catch (e) {
      this.log(`[Polling] Error fetching snapshot: ${e.message}`);
    }
  }

  cancelPendingPixels() {
    this.pendingPixelTimeouts.forEach(t => clearTimeout(t));
    this.pendingPixelTimeouts = [];
  }

  async mainLoop() {
    // Random delay at start
    if (this.iterationCount === 0) {
      const randomDelay = Math.random() * 3000;
      this.log(`Initial delay: ${Math.round(randomDelay/1000)}s`);
      await new Promise(r => setTimeout(r, randomDelay));
    }
    
    while (this.isRunning) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Determine mode
      if (this.iterationCount === 0) {
        this.setMode('seed');
      } else {
        this.setMode('action');
      }

      // Build context
      const ctx = {
        myX: this.myPosition[0],
        myY: this.myPosition[1],
        iteration: this.iterationCount,
        total_agents: Object.keys(this.otherUsers).length + 1
      };

      try {
        if (this.iterationCount === 0) {
          // S-Machine (Seed)
          await this.executeSeed(ctx);
        } else {
          // W-Machine (Action)
          await this.executeAction(ctx);
        }
      } catch (e) {
        this.log(`Error: ${e.message}`);
      }

      this.iterationCount++;
      
      // Wait for next iteration
      const interval = parseInt(this.elements.interval?.value) || 30000;
      await new Promise(r => setTimeout(r, interval));
    }
  }

  async executeSeed(ctx) {
    this.log(`[Seed] Generating quantum seed...`);
    
    const adapter = window.GeminiV6Adapter;
    if (!adapter) {
      this.log('GeminiV6Adapter not available');
      return;
    }

    const systemPrompt = await adapter.buildSystemPrompt('seed', ctx);
    const result = await adapter.callAPI(systemPrompt, null);
    const parsed = adapter.parseJSONResponse(result);

    if (!parsed || !parsed.pixels || parsed.pixels.length === 0) {
      this.log('[Seed] No pixels in response');
      return;
    }

    // Store artistic identity
    if (parsed.seed) {
      this.artisticIdentity = {
        concept: parsed.seed.concept,
        artistic_reference: parsed.seed.artistic_reference,
        rationale: parsed.seed.rationale
      };
    }

    // Store predictions
    this.prevPredictions = parsed.predictions || {};

    // Store quantum measures (can be in quantum_measures or creative_measures)
    const quantumMeasures = parsed.quantum_measures || parsed.creative_measures || {};
    console.log('[V6-Q] [Seed] Raw quantum measures:', quantumMeasures);
    // Map field names if needed
    if (quantumMeasures.psi_originality !== undefined) {
      quantumMeasures.psi_distinctiveness = quantumMeasures.psi_originality;
    }
    if (quantumMeasures.eta_dialogue_aptitude !== undefined) {
      quantumMeasures.eta_potential = quantumMeasures.eta_dialogue_aptitude;
    }
    if (quantumMeasures.lambda_internal_coherence !== undefined) {
      quantumMeasures.lambda_coherence = quantumMeasures.lambda_internal_coherence;
    }
    console.log('[V6-Q] [Seed] Mapped quantum measures:', quantumMeasures);

    // Display response - pass quantumMeasures with mapped names
    const verbatimData = {
      ...parsed,
      quantum_measures: quantumMeasures
    };
    this.storeVerbatimResponse('S', verbatimData, this.iterationCount);
    this.log(`[Seed] Generated ${parsed.pixels.length} quantum amplitudes`);

    // Send pixels
    await this.sendPixels(parsed.pixels);

    // Send W-data to quantum server
    await this.sendWData({
      strategy: 'Quantum seed generation',
      rationale: parsed.seed?.rationale || '',
      predictions: this.prevPredictions,
      quantum_measures: quantumMeasures,
      pixels: parsed.pixels
    });

    // Send image to quantum server
    await this.sendImageToQuantumServer();
  }

  async executeAction(ctx) {
    // V6: Wait for new quantum snapshot (like V5 waits for O+N snapshot)
    // Force fetch snapshot first
    await this.pollQuantumSnapshot();
    
    // Check if we need to wait for a new snapshot
    const isFirstAction = this.iterationCount === 1;
    const currentQVersion = this.quantumSnapshot?.version ?? -1;
    
    // For first action, accept available snapshot if valid
    // For subsequent actions, wait for snapshot POSTERIOR to last action
    if (!isFirstAction && currentQVersion <= this.lastQVersionAtAction) {
      this.log(`[Action] Waiting for new quantum snapshot (current: ${currentQVersion}, last at action: ${this.lastQVersionAtAction})...`);
      
      const maxWait = 60000; // 60s max
      const startWait = Date.now();
      let waitAttempts = 0;
      const maxWaitAttempts = 20; // 20 attempts × 3s = 60s
      
      while (Date.now() - startWait < maxWait && waitAttempts < maxWaitAttempts) {
        await this.pollQuantumSnapshot();
        const newVersion = this.quantumSnapshot?.version ?? -1;
        
        // Check if snapshot is valid (like V5)
        const hasStructures = this.quantumSnapshot?.structures && 
          Array.isArray(this.quantumSnapshot.structures) && 
          this.quantumSnapshot.structures.length > 0;
        const hasValidDescription = this.quantumSnapshot?.simplicity_assessment?.C_d_current?.description && 
          this.quantumSnapshot.simplicity_assessment.C_d_current.description !== 'N/A' &&
          this.quantumSnapshot.simplicity_assessment.C_d_current.description !== 'Waiting for first analysis...';
        const isSnapshotValid = this.quantumSnapshot && 
          !this.quantumSnapshot._pending &&
          (hasStructures || hasValidDescription);
        
        if (isSnapshotValid && newVersion > this.lastQVersionAtAction) {
          this.log(`[Action] New snapshot v${newVersion} received`);
          break;
        }
        
        waitAttempts++;
        if (waitAttempts < maxWaitAttempts) {
          await new Promise(r => setTimeout(r, 3000)); // Wait 3s before retry
        }
      }
      
      if (!this.quantumSnapshot || this.quantumSnapshot.version <= this.lastQVersionAtAction) {
        this.log('[Action] Timeout waiting for snapshot, proceeding anyway');
      }
    }
    
    // Update lastQVersionSeen if we have a newer snapshot
    if (this.quantumSnapshot?.version !== undefined) {
      if (this.quantumSnapshot.version > this.lastQVersionSeen) {
        this.lastQVersionSeen = this.quantumSnapshot.version;
      }
    }
    
    this.lastQVersionAtAction = this.quantumSnapshot?.version ?? this.lastQVersionSeen;
    
    // Store verbatim O+N responses (like V5 does in executeAction)
    if (this.quantumSnapshot) {
      const coherence = this.quantumSnapshot.coherence_observables || {};
      const emergence = this.quantumSnapshot.emergence_observables || {};
      const sa = this.quantumSnapshot.simplicity_assessment || {};
      
      const oData = {
        structures: this.quantumSnapshot.structures || [],
        coherence_observables: coherence,
        simplicity_assessment: {
          C_d_current: sa.C_d_current
        }
      };
      const nData = {
        narrative: this.quantumSnapshot.narrative || {},
        emergence_observables: emergence,
        simplicity_assessment: {
          C_w_current: sa.C_w_current
        }
      };
      
      // Use iterationCount (agent's iteration) not snapshot version (global version)
      // Like V5, the verbatim should show the agent's iteration, not the global snapshot version
      const iteration = this.iterationCount;
      console.log('[V6-Q] [executeAction] Storing verbatim O+N', {
        iteration,
        snapshotVersion: this.quantumSnapshot.version,
        oStructures: oData.structures.length,
        nNarrative: !!nData.narrative.summary,
        snapshot: !!this.quantumSnapshot
      });
      
      this.storeVerbatimResponse('Q-O', oData, iteration);
      this.storeVerbatimResponse('Q-N', nData, iteration);
    } else {
      console.warn('[V6-Q] [executeAction] No quantumSnapshot available for verbatim');
    }

    // Build rich context
    const coherence = this.quantumSnapshot?.coherence_observables || {};
    const emergence = this.quantumSnapshot?.emergence_observables || {};
    const sa = this.quantumSnapshot?.simplicity_assessment || {};

    const richCtx = {
      ...ctx,
      lastObservation: this.quantumSnapshot,
      prevPredictions: this.prevPredictions,
      prediction_error: this.myPredictionError,
      strategy_history: this.strategyHistory.slice(-10).join(', '),
      artistic_identity: this.artisticIdentity,
      agent_rankings: this.quantumSnapshot?.agent_rankings || {},
      myAgentId: this.myUserId,
      // Quantum observables
      phi_coherence: coherence.phi_coherence || 0,
      xi_correlation: coherence.xi_correlation_length || 0,
      I_visibility: coherence.I_fringe_visibility || 0,
      tau_condensation: emergence.tau_condensation || 0,
      // Simplicity metrics
      C_w: sa.C_w_current?.value || 0,
      C_d: sa.C_d_current?.value || 0,
      U: sa.U_current?.value || 0,
      // Color palette
      colorPalette: this.formatColorPalette(),
      neighborColors: this.getNeighborColors()
    };

    this.log(`[Action] φ=${richCtx.phi_coherence.toFixed(2)}, τ=${richCtx.tau_condensation.toFixed(2)}, U=${richCtx.U}`);

    const adapter = window.GeminiV6Adapter;
    if (!adapter) {
      this.log('GeminiV6Adapter not available');
      return;
    }

    // Get images
    const images = await this.captureImages();

    const systemPrompt = await adapter.buildSystemPrompt('action', richCtx);
    const result = await adapter.callAPI(systemPrompt, images);
    const parsed = adapter.parseJSONResponse(result);

    if (!parsed || !parsed.pixels || parsed.pixels.length === 0) {
      this.log('[Action] No pixels in response');
      return;
    }

    // Store strategy history
    const strategyId = parsed.strategy_id || parsed.strategy_ids?.join('+') || 'custom';
    this.strategyHistory.push(strategyId);
    if (this.strategyHistory.length > 50) {
      this.strategyHistory = this.strategyHistory.slice(-50);
    }

    // Store predictions
    this.prevPredictions = parsed.predictions || {};

    // Display response
    this.storeVerbatimResponse('W', parsed, this.iterationCount);
    this.log(`[Action] Strategy: ${parsed.strategy || 'N/A'}, ${parsed.pixels.length} pixels`);

    // Send pixels
    await this.sendPixels(parsed.pixels);

    // Calculate signalling tokens (like V5)
    let signallingTokens = null;
    if (result && result.tokens && result.tokens.output) {
      signallingTokens = this.calculateSignallingTokens(result.tokens.output, parsed);
    }

    // Send W-data to quantum server
    await this.sendWData({
      strategy: parsed.strategy || 'N/A',
      strategy_id: parsed.strategy_id,
      strategy_ids: parsed.strategy_ids,
      source_agents: parsed.source_agents,
      rationale: parsed.rationale || '',
      predictions: this.prevPredictions,
      delta_complexity: parsed.delta_complexity || {},
      pixels: parsed.pixels
    });

    // Send W-data to metrics server (like V5)
    await this.sendWDataToMetrics(parsed, this.iterationCount, result?.tokens, signallingTokens);

    // Send image to quantum server
    await this.sendImageToQuantumServer();
  }

  formatColorPalette() {
    const entries = Object.entries(this.myCellState);
    if (entries.length === 0) return 'No amplitudes yet';
    return entries.slice(0, 50).map(([coord, color]) => `${coord}#${color.replace('#', '')}`).join(', ');
  }

  getNeighborColors() {
    const neighbors = [];
    const directions = {
      'NORTH': [0, -1], 'SOUTH': [0, 1], 'EAST': [1, 0], 'WEST': [-1, 0]
    };

    for (const [dir, [dx, dy]] of Object.entries(directions)) {
      const nx = this.myPosition[0] + dx;
      const ny = this.myPosition[1] + dy;

      for (const [uid, userData] of Object.entries(this.otherUsers)) {
        const pos = userData.position;
        if (pos && pos[0] === nx && pos[1] === ny) {
          const pixels = userData.pixels || {};
          const colors = [...new Set(Object.values(pixels))].slice(0, 5);
          if (colors.length > 0) {
            neighbors.push({
              direction: dir,
              position: `[${nx},${ny}]`,
              colors: colors
            });
          }
          break;
        }
      }
    }

    return neighbors;
  }

  // === V6: Add Debug Image (like V5) ===
  addDebugImage(label, dataUrl) {
    try {
      const container = document.getElementById('llm-images');
      if (!container || !dataUrl) return;
      // Remove placeholder if present
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
      // Limit number of images to avoid memory saturation
      const MAX_IMAGES = 6;
      const items = container.querySelectorAll('.image-item');
      for (let i = MAX_IMAGES; i < items.length; i++) {
        // Revoke data URLs to free memory
        const oldImg = items[i].querySelector('img');
        if (oldImg && oldImg.src && oldImg.src.startsWith('data:')) {
          oldImg.src = '';
        }
        items[i].remove();
      }
    } catch (_) {}
  }

  async sendPixels(pixels) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log(`⚠️ WebSocket not connected (state: ${this.socket?.readyState})`);
      return;
    }

    let sentCount = 0;
    let skippedCount = 0;
    
    // Prepare all valid pixels first
    const validPixels = [];
    for (const pixel of pixels) {
      const match = pixel.match(/^(-?\d+),(-?\d+)#([0-9A-Fa-f]{6})$/);
      if (!match) {
        skippedCount++;
        continue;
      }
      
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      const color = `#${match[3].toUpperCase()}`;
      
      if (x < 0 || x > 19 || y < 0 || y > 19) {
        skippedCount++;
        continue;
      }
      
      validPixels.push({ x, y, color });
    }

    // BURST MODE: Send all pixels immediately without delays
    // This prevents browser throttling issues when tab is in background
    // WebSocket buffering handles the actual transmission
    for (const { x, y, color } of validPixels) {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'cell_update',
          sub_x: x,
          sub_y: y,
          color: color
        }));
        sentCount++;
        
        // Update local state
        this.myCellState[`${x},${y}`] = color;
      }
    }

    this.log(`📤 Burst sent ${sentCount} pixels (skipped ${skippedCount})`);
  }

  async sendWData(data) {
    if (!this.myUserId) {
      this.log(`⚠️ Cannot send W-data: no userId`);
      return;
    }
    
    // Warn if position is [0,0] - it might be wrong
    if (this.myPosition[0] === 0 && this.myPosition[1] === 0) {
      console.warn('[V6-Q] ⚠️ Sending W-data with position [0,0] - may be incorrect!');
    }
    
    try {
      const resp = await fetch(`${this.Q_API_BASE}/q/w-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: this.myUserId,
          position: this.myPosition,
          iteration: this.iterationCount,
          timestamp: new Date().toISOString(),
          ...data
        })
      });
      if (resp.ok) {
        this.log(`📡 W-data sent [${this.myPosition[0]},${this.myPosition[1]}]`);
      } else {
        this.log(`⚠️ W-data error: ${resp.status}`);
      }
    } catch (e) {
      this.log(`❌ W-data send error: ${e.message} (is server running on port 8006?)`);
    }
  }

  // === V6: Calculate Signalling Tokens (like V5) ===
  calculateSignallingTokens(outputTokens, parsed) {
    if (!outputTokens || outputTokens === 0) return null;
    
    // Estimation des tokens "mécaniques" (incompressibles) :
    // - Structure JSON de base (~50 tokens)
    // - Noms de champs (strategy, rationale, pixels, delta_complexity, etc.) (~30 tokens)
    // - Formatage des pixels (x,y#HEX) : ~3 tokens par pixel pour le formatage
    // - Structure des deltas (~20 tokens)
    
    const baseStructureTokens = 50; // Structure JSON de base
    const fieldNamesTokens = 30; // Noms des champs JSON
    const deltaStructureTokens = 20; // Structure delta_complexity
    
    // Tokens pour le formatage des pixels (x,y#HEX)
    // Chaque pixel nécessite ~3 tokens pour le formatage (virgule, #, guillemets)
    const pixelCount = Array.isArray(parsed?.pixels) ? parsed.pixels.length : 0;
    const pixelFormattingTokens = pixelCount * 3;
    
    // Tokens pour les valeurs numériques des deltas (très compressibles)
    // On estime ~2 tokens par valeur numérique (formatage + nombre)
    const deltaValueTokens = 6; // 3 valeurs (delta_C_w, delta_C_d, U_after) × 2
    
    // Total tokens mécaniques
    const mechanicalTokens = baseStructureTokens + fieldNamesTokens + 
                            deltaStructureTokens + pixelFormattingTokens + 
                            deltaValueTokens;
    
    // Tokens de signalement réels = tokens totaux - tokens mécaniques
    const signallingTokens = Math.max(0, outputTokens - mechanicalTokens);
    
    return {
      total: outputTokens,
      mechanical: mechanicalTokens,
      signalling: signallingTokens
    };
  }

  // === V6: Send W-data to Metrics Server (like V5) ===
  async sendWDataToMetrics(parsed, iteration, tokens = null, signallingTokens = null) {
    if (!this.metricsSocket || this.metricsSocket.readyState !== WebSocket.OPEN) {
      // Try to connect if not connected
      this.connectMetricsServer();
      // Wait a bit for connection
      await new Promise(r => setTimeout(r, 500));
      if (!this.metricsSocket || this.metricsSocket.readyState !== WebSocket.OPEN) {
        return; // Still not connected, skip
      }
    }

    const agentId = this.myUserId || 'unknown';
    const strategy_ids = parsed?.strategy_ids || (parsed?.strategy_id ? [parsed.strategy_id] : []);
    const strategy_id = strategy_ids.length > 1 ? strategy_ids.join('+') : (strategy_ids[0] || '');

    try {
      const metricsData = {
        type: 'agent_update',
        user_id: agentId,
        position: this.myPosition,
        delta_C_w: parsed.delta_complexity?.delta_C_w_bits || 0,
        delta_C_d: parsed.delta_complexity?.delta_C_d_bits || 0,
        U_after_expected: parsed.delta_complexity?.U_after_expected || 0,
        prediction_error: this.myPredictionError || 0,
        strategy: parsed?.strategy || 'N/A',
        strategy_id: strategy_id,
        strategy_ids: strategy_ids,
        iteration: iteration,
        pixels: parsed.pixels || [],
        agent_type: 'ai'
      };
      
      // Add tokens if available
      if (tokens) {
        metricsData.tokens = {
          input: tokens.input || 0,
          output: tokens.output || 0,
          total: tokens.total || 0
        };
      }
      
      // Add signalling tokens if available
      if (signallingTokens) {
        metricsData.signalling_tokens = {
          total: signallingTokens.total,
          mechanical: signallingTokens.mechanical,
          signalling: signallingTokens.signalling
        };
      }
      
      this.metricsSocket.send(JSON.stringify(metricsData));
    } catch(e) {
      console.error('[V6-Q] Error sending metrics:', e);
    }
  }

  // === V6: Connect to Metrics Server (like V5) ===
  connectMetricsServer() {
    if (this.metricsSocket && this.metricsSocket.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    
    try {
      this.metricsSocket = new WebSocket(this.METRICS_WS_URL);
      
      this.metricsSocket.onopen = () => {
        this.log('Quantum metrics connected');
        // Request current state
        this.metricsSocket.send(JSON.stringify({ type: 'get_state' }));
      };
      
      this.metricsSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Metrics server messages are handled by ai-metrics-v6.html
          // We just need to keep the connection alive
        } catch (e) {
          // Ignore parse errors
        }
      };
      
      this.metricsSocket.onerror = (error) => {
        console.error('[V6-Q] Metrics WebSocket error:', error);
      };
      
      this.metricsSocket.onclose = () => {
        // Try to reconnect after 5 seconds
        setTimeout(() => this.connectMetricsServer(), 5000);
      };
    } catch (e) {
      console.error('[V6-Q] Error connecting to metrics server:', e);
    }
  }

  // === Image Capture (like V5) ===

  getViewerCanvas() {
    try {
      const doc = this.elements.viewerFrame?.contentWindow?.document;
      if (!doc) return null;
      const canvas = doc.querySelector('canvas');
      return canvas || null;
    } catch (e) {
      return null;
    }
  }

  async captureGlobalImage() {
    // Method 1: Try viewer canvas first
    for (let attempt = 0; attempt < 3; attempt++) {
      const canvas = this.getViewerCanvas();
      if (canvas && canvas.width && canvas.height) {
        try {
          const url = canvas.toDataURL('image/png');
          if (url && url.length > 100) {
            this.log(`📷 Global image from viewer: ${canvas.width}×${canvas.height}`);
            return url;
          }
        } catch (e) {
          // Cross-origin, try fallback
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Method 2: Generate using PositionCanvasGenerator (like V5)
    // Include our own pixels in otherUsers
    if (this.myUserId) {
      if (!this.otherUsers[this.myUserId]) {
        this.otherUsers[this.myUserId] = {};
      }
      this.otherUsers[this.myUserId].pixels = { ...this.myCellState };
      this.otherUsers[this.myUserId].position = this.myPosition;
    }

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
          this.log(`📷 Global image generated: ${dataUrl.length} chars`);
          return dataUrl;
        }
      }
    } catch (e) {
      this.log(`⚠️ PositionCanvasGenerator error: ${e.message}`);
    }

    this.log(`⚠️ Could not capture global image`);
    return null;
  }

  captureLocalImage() {
    // Generate local 200×200 image with grid overlay (like V5)
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      
      // Draw pixels (10px each for 20×20 grid)
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const color = this.myCellState[`${x},${y}`] || '#000000';
          ctx.fillStyle = color;
          ctx.fillRect(x * 10, y * 10, 10, 10);
        }
      }
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 20; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 10, 0);
        ctx.lineTo(i * 10, 200);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 10);
        ctx.lineTo(200, i * 10);
        ctx.stroke();
      }
      
      return canvas.toDataURL('image/png');
    } catch (e) {
      this.log(`⚠️ Local image capture error: ${e.message}`);
      return null;
    }
  }

  async captureImages() {
    const globalImageBase64 = await this.captureGlobalImage();
    const localImageBase64 = this.captureLocalImage();
    
    // Add debug images (like V5)
    if (globalImageBase64) {
      this.addDebugImage('Global Image', globalImageBase64);
    }
    if (localImageBase64) {
      this.addDebugImage('Local Image', localImageBase64);
    }
    
    return { globalImageBase64, localImageBase64 };
  }

  async sendImageToQuantumServer() {
    try {
      const imageBase64 = await this.captureGlobalImage();
      if (!imageBase64) {
        return;
      }

      // Count agents: exclude myUserId from otherUsers if it was added for image generation
      const otherUsersKeys = Object.keys(this.otherUsers).filter(uid => uid !== this.myUserId);
      const agentsCount = otherUsersKeys.length + 1; // +1 for self

      const resp = await fetch(`${this.Q_API_BASE}/q/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          agents_count: agentsCount
        })
      });
      if (resp.ok) {
        this.log(`🖼️ Image sent to O+N server (${agentsCount} agents)`);
      } else {
        this.log(`⚠️ Image send error: ${resp.status}`);
      }
    } catch (e) {
      this.log(`❌ Image send error: ${e.message}`);
    }
  }
}

window.AIPlayerV6 = AIPlayerV6;

// Auto-instantiate when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  if (!window.aiPlayerV6) {
    window.aiPlayerV6 = new AIPlayerV6();
    console.log('✅ [V6] AIPlayerV6 auto-initialized');
  }
});

