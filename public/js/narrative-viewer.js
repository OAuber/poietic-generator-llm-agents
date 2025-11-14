class NarrativeViewer {
  constructor() {
    this.onContentEl = document.getElementById('on-content');
    this.wContentEl = document.getElementById('w-content');
    // Detect O-N server URL (port 8005)
    const loc = window.location;
    this.oApiBase = loc.origin.replace(/:\d+$/, ':8005');
    this.pollInterval = 2000; // 2 secondes
    this.lastOVersion = null;
    this.wDataHistory = []; // Historique des réponses W
    this.onDataHistory = []; // Historique des snapshots O+N
    
    this.replaceComplexityTerms = this.replaceComplexityTerms.bind(this);
    this.startPolling = this.startPolling.bind(this);
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

  formatOText(data) {
    // Extract only the description without title
    const description = data?.simplicity_assessment?.C_d_current?.description || 'N/A';
    return this.replaceComplexityTerms(description);
  }

  formatNText(data) {
    // Extract only the summary without title
    const summary = data?.narrative?.summary || 'N/A';
    return this.replaceComplexityTerms(summary);
  }

  formatWText(data) {
    // Concatenate strategy + rationale + predictions without titles
    const strategy = data?.strategy || '';
    const rationale = data?.rationale || '';
    const individualPred = data?.predictions?.individual_after_prediction || '';
    const collectivePred = data?.predictions?.collective_after_prediction || '';
    
    const parts = [];
    if (strategy) parts.push(strategy);
    if (rationale) parts.push(rationale);
    if (individualPred) parts.push(individualPred);
    if (collectivePred) parts.push(collectivePred);
    
    const text = parts.join('\n\n');
    return this.replaceComplexityTerms(text);
  }

  async fetchONSnapshot() {
    try {
      const response = await fetch(`${this.oApiBase}/o/latest`);
      if (!response.ok) return null;
      const data = await response.json();
      
      // Skip if pending or same version
      if (data._pending || data.version === this.lastOVersion) {
        return null;
      }
      
      this.lastOVersion = data.version;
      return data;
    } catch (error) {
      console.error('[NarrativeViewer] Error fetching O+N snapshot:', error);
      return null;
    }
  }

  async fetchWData() {
    try {
      const response = await fetch(`${this.oApiBase}/n/w-data`);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.agents || {};
    } catch (error) {
      console.error('[NarrativeViewer] Error fetching W data:', error);
      return null;
    }
  }

  addONEntry(data) {
    const oText = this.formatOText(data);
    const nText = this.formatNText(data);
    
    // Skip if both are empty
    if ((!oText || oText.trim() === 'N/A') && (!nText || nText.trim() === 'N/A')) {
      return;
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      oText: oText,
      nText: nText,
      version: data.version
    };
    
    // Add to history (most recent first)
    this.onDataHistory.unshift(entry);
    
    // Keep only last 50 entries
    if (this.onDataHistory.length > 50) {
      this.onDataHistory = this.onDataHistory.slice(0, 50);
    }
    
    this.renderONContent();
  }

  addWEntry(agentId, data) {
    const text = this.formatWText(data);
    
    if (!text || text.trim() === '') {
      return; // Skip empty entries
    }
    
    const entry = {
      timestamp: data.timestamp || new Date().toISOString(),
      text: text,
      agentId: agentId,
      position: data.position || [0, 0],
      iteration: data.iteration || 0
    };
    
    // Add to history (most recent first)
    this.wDataHistory.unshift(entry);
    
    // Keep only last 50 entries
    if (this.wDataHistory.length > 50) {
      this.wDataHistory = this.wDataHistory.slice(0, 50);
    }
    
    this.renderWContent();
  }

  renderONContent() {
    if (this.onDataHistory.length === 0) {
      this.onContentEl.innerHTML = '<div class="loading">No O+N data yet...</div>';
      return;
    }
    
    const html = this.onDataHistory.map(entry => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString();
      const parts = [];
      
      // Add O text if available
      if (entry.oText && entry.oText.trim() !== 'N/A') {
        parts.push(`<div class="text-section"><div class="machine-title">Observation machine: ${timeStr}</div><div class="text">${this.escapeHtml(entry.oText)}</div></div>`);
      }
      
      // Add N text if available
      if (entry.nText && entry.nText.trim() !== 'N/A') {
        parts.push(`<div class="text-section"><div class="machine-title">Narration machine: ${timeStr}</div><div class="text">${this.escapeHtml(entry.nText)}</div></div>`);
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
      const positionStr = `[${entry.position[0]},${entry.position[1]}]`;
      return `
        <div class="text-entry">
          <div class="machine-title">World machine ${positionStr}: ${timeStr}</div>
          <div class="text">${this.escapeHtml(entry.text)}</div>
        </div>
      `;
    }).join('');
    
    this.wContentEl.innerHTML = html;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async updateData() {
    // Fetch O+N snapshot
    const onSnapshot = await this.fetchONSnapshot();
    if (onSnapshot) {
      this.addONEntry(onSnapshot);
    }
    
    // Fetch W data
    const wData = await this.fetchWData();
    if (wData) {
      // Compare with existing history to add only new entries
      const existingIds = new Set(this.wDataHistory.map(e => `${e.agentId}-${e.iteration}`));
      
      for (const [agentId, agentData] of Object.entries(wData)) {
        const entryId = `${agentId}-${agentData.iteration}`;
        if (!existingIds.has(entryId)) {
          this.addWEntry(agentId, agentData);
        }
      }
    }
  }

  startPolling() {
    // Initial load
    this.updateData();
    
    // Poll every interval
    setInterval(() => {
      this.updateData();
    }, this.pollInterval);
  }

  init() {
    this.startPolling();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.narrativeViewer = new NarrativeViewer();
  window.narrativeViewer.init();
});

