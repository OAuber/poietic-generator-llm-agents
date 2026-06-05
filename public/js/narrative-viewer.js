/**
 * Narrative Viewer V5 — sans import statique (évite échec silencieux du module).
 */
class NarrativeViewer {
  constructor() {
    this.onContentEl = document.getElementById('on-content');
    this.wContentEl = document.getElementById('w-content');
    this.statusEl = document.getElementById('nv-status');
    const host = window.location.hostname || 'localhost';
    const proto = window.location.protocol === 'https:' ? 'https' : 'http';
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // API via serveur métriques (proxy → 8005), même origine CORS fiable
    this.apiBase = `${proto}://${host}:5005/narrative`;
    this.metricsWsUrl = `${wsProto}://${host}:5005/metrics`;
    this.pollInterval = 2000;
    this.lastOVersion = null;
    this.wDataHistory = [];
    this.onDataHistory = [];
    this.metricsSocket = null;
    this.ttsPayload = (item) => encodeURIComponent(JSON.stringify(item));
  }

  setStatus(msg, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.style.color = isError ? '#f88' : '#888';
  }

  replaceComplexityTerms(text) {
    return text
      .replace(/\bC_d\b/g, 'the complexity of description')
      .replace(/\bC_w\b/g, 'the complexity of generation')
      .replace(/\bU'/g, "the unexpectedness'")
      .replace(/\bU(?![a-zA-Z'])/g, 'the unexpectedness');
  }

  formatOText(data) {
    const description = data?.simplicity_assessment?.C_d_current?.description || '';
    if (!description || description.includes('waiting for first') || description.includes('No analysis yet')) {
      return '';
    }
    return this.replaceComplexityTerms(description);
  }

  formatNText(data) {
    const summary = data?.narrative?.summary || '';
    if (!summary || summary === 'N/A' || summary.includes('Waiting for first')) return '';
    return this.replaceComplexityTerms(summary);
  }

  formatWText(data) {
    const strategy = data?.strategy || '';
    const rationale = data?.rationale || '';
    const preds = data?.predictions || {};
    const individualPred = preds.individual_after_prediction || '';
    const collectivePred = preds.collective_after_prediction || '';
    const parts = [];
    if (strategy && strategy !== 'N/A') parts.push(strategy);
    if (rationale) parts.push(rationale);
    if (individualPred) parts.push(individualPred);
    if (collectivePred) parts.push(collectivePred);
    return this.replaceComplexityTerms(parts.join('\n\n'));
  }

  async fetchONSnapshot({ allowSameVersion = false } = {}) {
    try {
      const response = await fetch(`${this.apiBase}/o/latest`);
      if (!response.ok) {
        this.setStatus(`API O-N indisponible (${response.status}) — port 5005/8005 ?`, true);
        return null;
      }
      const data = await response.json();
      if (data._pending) return null;
      if (!allowSameVersion && data.version === this.lastOVersion) return null;
      this.lastOVersion = data.version;
      this.setStatus(`Connecté — snapshot v${data.version}`);
      return data;
    } catch (error) {
      console.error('[NarrativeViewer] fetch O+N:', error);
      this.setStatus(`Erreur API : ${error.message}`, true);
      return null;
    }
  }

  async fetchWData() {
    try {
      const response = await fetch(`${this.apiBase}/n/w-data`);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.agents || {};
    } catch (error) {
      console.error('[NarrativeViewer] fetch W:', error);
      return null;
    }
  }

  addONEntry(data) {
    const oText = this.formatOText(data);
    const nText = this.formatNText(data);
    if (!oText && !nText) return;

    const version = data.version ?? 0;
    if (this.onDataHistory.some((e) => e.version === version)) return;

    const entry = { timestamp: data.timestamp || new Date().toISOString(), oText, nText, version };
    this.onDataHistory.unshift(entry);
    if (this.onDataHistory.length > 50) this.onDataHistory = this.onDataHistory.slice(0, 50);

    if (oText) this.speakUtterance?.({ text: oText, source: 'O', iteration: version });
    if (nText) this.speakUtterance?.({ text: nText, source: 'N', iteration: version });
    this.renderONContent();
  }

  addWEntry(agentId, data) {
    const text = this.formatWText(data);
    if (!text) return;

    const resolvedId = agentId || data.id || data.agent_id || 'unknown';
    const entry = {
      timestamp: data.timestamp || new Date().toISOString(),
      text,
      agentId: resolvedId,
      position: data.position || [0, 0],
      iteration: data.iteration || 0,
    };

    const key = `${entry.agentId}-${entry.iteration}`;
    if (this.wDataHistory.some((e) => `${e.agentId}-${e.iteration}` === key)) return;

    this.wDataHistory.unshift(entry);
    if (this.wDataHistory.length > 50) this.wDataHistory = this.wDataHistory.slice(0, 50);

    this.speakUtterance?.({
      text,
      source: 'W',
      agentId: resolvedId,
      position: entry.position,
      iteration: entry.iteration,
    });
    this.renderWContent();
  }

  renderONContent() {
    if (this.onDataHistory.length === 0) {
      this.onContentEl.innerHTML = '<div class="loading">En attente O+N…</div>';
      return;
    }

    const html = this.onDataHistory.map((entry) => {
      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
      const parts = [];
      if (entry.oText) {
        const p = this.ttsPayload({ text: entry.oText, source: 'O' });
        parts.push(`<div class="text-section" data-tts-hover data-tts-payload="${p}"><div class="machine-title">Observation (O) – ${timeStr}</div><div class="text">${this.escapeHtml(entry.oText)}</div></div>`);
      }
      if (entry.nText) {
        const p = this.ttsPayload({ text: entry.nText, source: 'N' });
        parts.push(`<div class="text-section" data-tts-hover data-tts-payload="${p}"><div class="machine-title">Narration (N) – ${timeStr}</div><div class="text">${this.escapeHtml(entry.nText)}</div></div>`);
      }
      return parts.length ? `<div class="text-entry">${parts.join('')}</div>` : '';
    }).join('');

    this.onContentEl.innerHTML = html;
    this._bindHoverTts?.();
  }

  renderWContent() {
    if (this.wDataHistory.length === 0) {
      this.wContentEl.innerHTML = '<div class="loading">En attente W…</div>';
      return;
    }

    const html = this.wDataHistory.map((entry) => {
      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
      const pos = entry.position || [0, 0];
      const p = this.ttsPayload({
        text: entry.text, source: 'W', agentId: entry.agentId, position: pos, iteration: entry.iteration,
      });
      return `<div class="text-entry" data-tts-hover data-tts-payload="${p}"><div class="machine-title">W [${pos[0]},${pos[1]}] – ${timeStr}</div><div class="text">${this.escapeHtml(entry.text)}</div></div>`;
    }).join('');

    this.wContentEl.innerHTML = html;
    this._bindHoverTts?.();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async updateData() {
    const onSnapshot = await this.fetchONSnapshot();
    if (onSnapshot) this.addONEntry(onSnapshot);
    const wData = await this.fetchWData();
    if (wData) {
      for (const [agentId, agentData] of Object.entries(wData)) {
        this.addWEntry(agentId, agentData);
      }
    }
  }

  connectMetrics() {
    try {
      const ws = new WebSocket(this.metricsWsUrl);
      this.metricsSocket = ws;
      ws.onopen = () => this.setStatus('WebSocket métriques OK');
      ws.onmessage = (event) => {
        try {
          this.handleMetricsMessage(JSON.parse(event.data));
        } catch (_) {}
      };
      ws.onclose = () => {
        this.setStatus('WS métriques déconnecté — polling HTTP actif', true);
        setTimeout(() => this.connectMetrics(), 5000);
      };
      ws.onerror = () => this.setStatus('WS métriques erreur (port 5005)', true);
    } catch (e) {
      this.setStatus(`WS : ${e.message}`, true);
    }
  }

  handleMetricsMessage(msg) {
    if (msg.type === 'n_snapshot_update' && msg.data && !msg.data._pending) {
      this.addONEntry(msg.data);
      if (msg.data.version != null) this.lastOVersion = msg.data.version;
    } else if (msg.type === 'session_agent_event' && msg.data) {
      const d = msg.data;
      if (d.type === 'ai' || !d.type) this.addWEntry(d.id || d.agent_id, d);
    }
  }

  startPolling() {
    this.fetchONSnapshot({ allowSameVersion: true }).then((s) => { if (s) this.addONEntry(s); });
    this.fetchWData().then((w) => {
      if (!w) return;
      for (const [id, d] of Object.entries(w)) this.addWEntry(id, d);
    });
    setInterval(() => this.updateData(), this.pollInterval);
  }

  async initTts() {
    try {
      const m = await import('/js/narrative-viewer-mixin.js');
      m.attachTableauParlant(this, {
        metricsBase: `http://${window.location.hostname || 'localhost'}:5005`,
        utterancesBase: `http://${window.location.hostname || 'localhost'}:5005`,
      });
    } catch (e) {
      console.warn('[NarrativeViewer] TTS off:', e);
      this.setStatus(`Textes OK — TTS off (${e.message})`);
    }
  }

  init() {
    this.connectMetrics();
    this.startPolling();
    this.initTts();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.narrativeViewer = new NarrativeViewer();
  window.narrativeViewer.init();
});
