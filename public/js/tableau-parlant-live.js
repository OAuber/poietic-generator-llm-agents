/**
 * Tableau parlant live — script classique (pas de import statique).
 */
(function () {
  const host = window.location.hostname || 'localhost';
  const proto = window.location.protocol === 'https:' ? 'https' : 'http';
  const UTTERANCES_BASE = `${proto}://${host}:5010`;
  const API_BASE = `${proto}://${host}:5005/narrative`;
  const RECORDER_BASE = `${proto}://${host}:3001`;
  const GRID = 5;

  class TableauParlantLive {
    constructor() {
      this.byPosition = new Map();
      this.seenUtteranceIds = new Set();
      this.logEl = document.getElementById('live-log');
      this.statusEl = document.getElementById('live-status');
      this.gridEl = document.getElementById('agent-grid');
      this.canvasEl = document.getElementById('live-canvas');
      this.engine = null;
      this.currentSessionId = null;
      this.eventSource = null;
    }

    setStatus(msg, isError) {
      if (!this.statusEl) return;
      this.statusEl.textContent = msg;
      this.statusEl.style.color = isError ? '#f88' : '#888';
    }

    buildGrid() {
      this.gridEl.innerHTML = '';
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const cell = document.createElement('div');
          cell.className = 'agent-cell';
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);
          cell.textContent = `[${x},${y}]`;
          cell.addEventListener('mouseenter', () => this.onCellHover(x, y));
          this.gridEl.appendChild(cell);
        }
      }
    }

    onCellHover(x, y) {
      const u = this.byPosition.get(`${x},${y}`);
      if (!u || !this.engine) return;
      this.engine.speakNow({
        text: u.text, source: 'W', lang: u.lang, agentId: u.agentId,
        position: u.position, utteranceId: u.id,
      });
    }

    markCell(x, y) {
      const cell = this.gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (cell) cell.classList.add('has-voice');
    }

    onUtterance(u) {
      if (!u || !u.text) return;
      const uid = u.id || `${u.source}-${u.ts}-${(u.text || '').slice(0, 40)}`;
      if (this.seenUtteranceIds.has(uid)) return;
      this.seenUtteranceIds.add(uid);

      if (u.source === 'W' && u.position?.length >= 2) {
        const k = `${u.position[0]},${u.position[1]}`;
        this.byPosition.set(k, { ...u, id: uid });
        this.markCell(u.position[0], u.position[1]);
      }

      const line = document.createElement('div');
      line.className = `utterance-line source-${u.source}`;
      const pos = u.position ? ` [${u.position[0]},${u.position[1]}]` : '';
      line.textContent = `[${u.source}${pos}] ${u.text.slice(0, 280)}${u.text.length > 280 ? '…' : ''}`;
      if (this.logEl) {
        this.logEl.prepend(line);
        while (this.logEl.children.length > 80) this.logEl.removeChild(this.logEl.lastChild);
      }
    }

    async bootstrapFromApi() {
      try {
        const res = await fetch(`${API_BASE}/o/latest`);
        if (res.ok) {
          const snap = await res.json();
          if (!snap._pending) {
            const oText = snap?.simplicity_assessment?.C_d_current?.description || '';
            const nText = snap?.narrative?.summary || '';
            if (oText && !oText.includes('No analysis yet') && !oText.includes('waiting for first')) {
              this.onUtterance({ id: `api-o-${snap.version}`, source: 'O', text: oText, position: [0, 0] });
            }
            if (nText && nText !== 'N/A' && !nText.includes('Waiting for first')) {
              this.onUtterance({ id: `api-n-${snap.version}`, source: 'N', text: nText, position: [0, 0] });
            }
          }
        }
      } catch (e) {
        this.setStatus(`API O-N : ${e.message}`, true);
      }

      try {
        const wRes = await fetch(`${API_BASE}/n/w-data`);
        if (wRes.ok) {
          const wData = await wRes.json();
          for (const [agentId, agent] of Object.entries(wData.agents || {})) {
            const parts = [agent.strategy, agent.rationale].filter((t) => t && t !== 'N/A');
            const preds = agent.predictions || {};
            if (preds.individual_after_prediction) parts.push(preds.individual_after_prediction);
            if (preds.collective_after_prediction) parts.push(preds.collective_after_prediction);
            const text = parts.join('\n\n');
            if (!text) continue;
            this.onUtterance({
              id: `api-w-${agentId}-${agent.iteration}`,
              source: 'W', text, agentId,
              position: agent.position || [0, 0], iteration: agent.iteration,
            });
          }
        }
      } catch (_) {}

      await this.refreshCanvas();
    }

    async pollUtterances() {
      if (!this.currentSessionId) {
        try {
          const r = await fetch(`${RECORDER_BASE}/api/current-session`);
          if (r.ok) {
            const s = await r.json();
            this.currentSessionId = s.session_id || s.id;
          }
        } catch (_) { return; }
      }
      if (!this.currentSessionId) return;

      try {
        const res = await fetch(`${UTTERANCES_BASE}/api/utterances/${this.currentSessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = data.utterances || [];
        if (list.length > 0) this.setStatus(`Connecté — ${list.length} énoncé(s)`);
        for (const u of list) this.onUtterance(u);
      } catch (_) {}
    }

    async refreshCanvas() {
      if (!this.canvasEl) return;
      try {
        const res = await fetch(`${API_BASE}/o/image`);
        if (!res.ok) return;
        const data = await res.json();
        const b64 = data.image_base64;
        if (b64) {
          this.canvasEl.src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
        }
      } catch (_) {}
    }

    connectSse() {
      try {
        this.eventSource = new EventSource(`${UTTERANCES_BASE}/api/utterances/live/stream`);
        this.eventSource.onopen = () => this.setStatus('Flux live + API actifs');
        this.eventSource.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'utterance' && msg.data) this.onUtterance(msg.data);
          } catch (_) {}
        };
        this.eventSource.onerror = () => this.setStatus('SSE off — polling HTTP actif', true);
      } catch (_) {}
    }

    async initTts() {
      try {
        const { createDefaultEngine } = await import('/js/tts/speech-engine.js');
        const { createSpeechControls } = await import('/js/tts/speech-controls.js');
        this.engine = createDefaultEngine({ gridSize: GRID });
        createSpeechControls(document.getElementById('speech-panel'), this.engine, {
          metricsBase: `${proto}://${host}:5005`,
          utterancesBase: UTTERANCES_BASE,
          recorderBase: RECORDER_BASE,
        });
        this.engine.setMasterEnabled(true);
      } catch (e) {
        console.warn('[Live] TTS off:', e);
      }
    }

    async init() {
      this.buildGrid();
      await this.initTts();
      await this.bootstrapFromApi();
      this.connectSse();
      setInterval(() => this.pollUtterances(), 4000);
      setInterval(() => this.refreshCanvas(), 5000);
      if (this.logEl && this.logEl.children.length === 0) {
        this.setStatus('En attente — lancez ou continuez une session V5');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const app = new TableauParlantLive();
    window.tableauParlantLive = app;
    app.init();
  });
})();
