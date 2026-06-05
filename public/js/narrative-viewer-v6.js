class NarrativeViewerV6 {
  constructor() {
    this.onContentEl = document.getElementById('on-content');
    this.wContentEl = document.getElementById('w-content');

    const loc = window.location;
    const WS_PROTOCOL = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_HOST = loc.host.replace(/:\d+$/, '');
    // Metrics server V6 (quantum metrics) on port 5006
    this.metricsWsUrl = `${WS_PROTOCOL}//${WS_HOST}:5006/quantum-metrics`;

    this.socket = null;
    this.onDataHistory = []; // O+N narrative history
    this.wDataHistory = [];  // W narrative history
  }

  // --- Filtrage texte: supprimer les métriques et nombres explicites ---

  stripNumericMetrics(text) {
    if (!text) return '';
    let t = text;
    // Supprimer lignes purement numériques ou quasi-numériques
    t = t
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        // Lignes qui ne contiennent que chiffres, signes, % ou lettres isolées de métriques
        if (/^[\d\s.,:%φξIΔSUCdAw+-]+$/.test(trimmed)) return false;
        return true;
      })
      .join('\n');

    // Supprimer motifs de métriques simples inline (approximation)
    t = t
      .replace(/\bC_w\s*=\s*[\d.,]+/g, '')
      .replace(/\bC_d\s*=\s*[\d.,]+/g, '')
      .replace(/\bU\s*=?\s*[\d.,]+/g, '')
      .replace(/φ\s*=\s*[\d.,]+/g, '')
      .replace(/ξ\s*=\s*[\d.,]+/g, '')
      .replace(/I\s*=\s*[\d.,]+/g, '')
      .replace(/τ\s*=\s*[\d.,]+/g, '')
      .replace(/ΔS\s*=\s*[\d.,]+/g, '');

    // Nettoyer doubles sauts de ligne
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Formatage des textes O, N, W (sans métriques explicites) ---

  formatOText(snapshot) {
    const desc = snapshot?.simplicity_assessment?.C_d_current?.description || '';
    return this.stripNumericMetrics(desc);
  }

  formatNText(snapshot) {
    const summary = snapshot?.narrative?.summary || '';
    return this.stripNumericMetrics(summary);
  }

  formatWText(agentData) {
    const strategy = agentData?.strategy || '';
    const rationale = agentData?.rationale || '';
    const individualPred = agentData?.predictions?.individual_after_prediction || '';
    const collectivePred = agentData?.predictions?.collective_after_prediction || '';

    const parts = [];
    if (strategy) parts.push(strategy);
    if (rationale) parts.push(rationale);
    if (individualPred) parts.push(individualPred);
    if (collectivePred) parts.push(collectivePred);

    const text = parts.join('\n\n');
    return this.stripNumericMetrics(text);
  }

  // --- Ajout au flux O+N ---

  addONEntry(snapshot) {
    const oText = this.formatOText(snapshot);
    const nText = this.formatNText(snapshot);

    if (!oText && !nText) return;

    const entry = {
      timestamp: snapshot.timestamp || new Date().toISOString(),
      version: snapshot.version,
      oText,
      nText
    };

    this.onDataHistory.unshift(entry);
    if (this.onDataHistory.length > 100) {
      this.onDataHistory = this.onDataHistory.slice(0, 100);
    }

    this.renderONContent();
  }

  // --- Ajout au flux W ---

  addWEntry(agentData) {
    const text = this.formatWText(agentData);
    if (!text) return;

    const entry = {
      timestamp: agentData.timestamp || new Date().toISOString(),
      text,
      agentId: agentData.id || 'unknown',
      position: agentData.position || [0, 0],
      iteration: agentData.iteration || 0
    };

    // Dédupliquer par agentId-iteration
    const key = `${entry.agentId}-${entry.iteration}`;
    const exists = this.wDataHistory.some(e => `${e.agentId}-${e.iteration}` === key);
    if (exists) return;

    this.wDataHistory.unshift(entry);
    if (this.wDataHistory.length > 100) {
      this.wDataHistory = this.wDataHistory.slice(0, 100);
    }

    this.renderWContent();
  }

  // --- Rendu des panneaux ---

  renderONContent() {
    if (this.onDataHistory.length === 0) {
      this.onContentEl.innerHTML = '<div class="loading">No O+N data yet...</div>';
      return;
    }

    const html = this.onDataHistory.map(entry => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString();
      const parts = [];

      if (entry.oText) {
        parts.push(`
          <div class="text-section">
            <div class="machine-title">Observation (O) – ${timeStr}</div>
            <div class="text">${this.escapeHtml(entry.oText)}</div>
          </div>
        `);
      }

      if (entry.nText) {
        parts.push(`
          <div class="text-section">
            <div class="machine-title">Narration (N) – ${timeStr}</div>
            <div class="text">${this.escapeHtml(entry.nText)}</div>
          </div>
        `);
      }

      if (parts.length === 0) return '';

      return `
        <div class="text-entry">
          ${parts.join('')}
        </div>
      `;
    }).join('');

    this.onContentEl.innerHTML = html;
  }

  renderWContent() {
    if (this.wDataHistory.length === 0) {
      this.wContentEl.innerHTML = '<div class="loading">No W data yet...</div>';
      return;
    }

    const html = this.wDataHistory.map(entry => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString();
      const pos = entry.position || [0, 0];
      const posStr = `[${pos[0]},${pos[1]}]`;
      return `
        <div class="text-entry">
          <div class="machine-title">W-agent ${posStr} – ${timeStr}</div>
          <div class="text">${this.escapeHtml(entry.text)}</div>
        </div>
      `;
    }).join('');

    this.wContentEl.innerHTML = html;
  }

  // --- WebSocket metrics V6 ---

  connectMetrics() {
    try {
      const ws = new WebSocket(this.metricsWsUrl);
      this.socket = ws;

      ws.onopen = () => {
        // Demander l'état initial (quantum history) si besoin
        ws.send(JSON.stringify({ type: 'get_state' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (_) {}
      };

      ws.onclose = () => {
        this.socket = null;
        // Tentative de reconnexion simple
        setTimeout(() => this.connectMetrics(), 5000);
      };
    } catch (e) {
      console.error('[NarrativeViewerV6] WS connect error:', e);
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'quantum_snapshot': {
        const snapshot = msg.snapshot || msg.state || msg;
        if (snapshot && !snapshot._pending) {
          this.addONEntry(snapshot);
        }
        break;
      }
      case 'session_agent_event': {
        const data = msg.data;
        if (!data || data.type && data.type !== 'ai') {
          // dans metrics_server_v6, agent_type est dans data.agent_type
        }
        // On ne garde que les agents AI
        if (data && (data.agent_type === 'ai' || !data.agent_type)) {
          this.addWEntry(data);
        }
        break;
      }
      default:
        // ignorer les autres messages
        break;
    }
  }

  init() {
    this.connectMetrics();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const viewer = new NarrativeViewerV6();
  window.narrativeViewerV6 = viewer;
  viewer.init();
});


