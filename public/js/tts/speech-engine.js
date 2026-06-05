/**
 * Tableau parlant — moteur TTS (navigateur | Piper | prebaked) + spatialisation Web Audio.
 */
export class SpeechEngine {
  constructor(options = {}) {
    this.backend = options.backend || 'browser'; // browser | piper | prebaked
    this.piperBaseUrl = options.piperBaseUrl || 'http://localhost:5012';
    this.prebakedBaseUrl = options.prebakedBaseUrl || '';
    this.gridSize = options.gridSize || 5;

    this.masterEnabled = false;
    this.skipToLatest = true;
    this.sourcesEnabled = { W: true, O: true, N: true };
    this.lang = options.lang || 'auto';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.selectedVoiceUri = '';

    this.queue = [];
    this.playing = false;
    this.currentUtterance = null;

    this.audioCtx = null;
    this.activeNodes = new Map();

    this.voiceCatalog = {
      fr: ['fr_FR-siwis-medium', 'fr_FR-upmc-medium'],
      en: ['en_US-lessac-medium', 'en_GB-alba-medium'],
    };

    this._voicesReady = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        this._voicesReady = true;
      };
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices();
    }
  }

  setBackend(backend) {
    this.backend = backend;
  }

  setMasterEnabled(on) {
    this.masterEnabled = on;
    if (!on) this.flush();
  }

  setSourceEnabled(source, on) {
    if (source in this.sourcesEnabled) this.sourcesEnabled[source] = on;
  }

  setSkipToLatest(on) {
    this.skipToLatest = on;
  }

  setLang(lang) {
    this.lang = lang;
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, rate));
  }

  setPitch(pitch) {
    this.pitch = Math.max(0.5, Math.min(2, pitch));
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setVoiceUri(uri) {
    this.selectedVoiceUri = uri || '';
  }

  detectLang(text) {
    if (this.lang === 'fr' || this.lang === 'en') return this.lang;
    const sample = (text || '').slice(0, 400).toLowerCase();
    const frHints = /\b(le|la|les|des|une|dans|pour|avec|est|sont|agent|stratégie|observation)\b/g;
    const enHints = /\b(the|and|with|for|agent|strategy|observation|narrative)\b/g;
    const fr = (sample.match(frHints) || []).length;
    const en = (sample.match(enHints) || []).length;
    return fr >= en ? 'fr' : 'en';
  }

  getBrowserVoices() {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }

  pickBrowserVoice(lang) {
    const voices = this.getBrowserVoices();
    if (this.selectedVoiceUri) {
      const v = voices.find((x) => x.voiceURI === this.selectedVoiceUri);
      if (v) return v;
    }
    const prefix = lang === 'fr' ? 'fr' : 'en';
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix)) ||
      voices[0] ||
      null
    );
  }

  voiceForAgent(source, agentId, position, lang) {
    const catalog = this.voiceCatalog[lang] || this.voiceCatalog.en;
    if (source === 'O') return catalog[0];
    if (source === 'N') return catalog[Math.min(1, catalog.length - 1)];
    const key = agentId || `${position?.[0]}-${position?.[1]}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return catalog[h % catalog.length];
  }

  panFromPosition(position, source) {
    if (source === 'O' || source === 'N') return 0;
    const [x, y] = position || [0, 0];
    const g = Math.max(1, this.gridSize - 1);
    const cx = (x / g) * 2 - 1;
    const cy = (y / g) * 2 - 1;
    return Math.max(-1, Math.min(1, cx * 0.7 + cy * 0.15));
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  flush() {
    this.queue = [];
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.playing = false;
    this.currentUtterance = null;
    for (const [, nodes] of this.activeNodes) {
      try {
        nodes.source?.stop();
      } catch (_) {}
    }
    this.activeNodes.clear();
  }

  enqueue(item) {
    const { text, source = 'W', lang, agentId, position, iteration, timestamp, utteranceId } = item;
    if (!this.masterEnabled || !text?.trim()) return;
    if (!this.sourcesEnabled[source]) return;

    const resolvedLang = lang || this.detectLang(text);
    const entry = {
      text: text.trim(),
      source,
      lang: resolvedLang,
      agentId: agentId || null,
      position: position || [0, 0],
      iteration: iteration ?? 0,
      timestamp: timestamp || new Date().toISOString(),
      utteranceId: utteranceId || null,
    };

    if (this.skipToLatest) {
      this.queue = [entry];
      if (this.backend === 'browser' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else {
      this.queue.push(entry);
    }

    if (!this.playing) this._drainQueue();
  }

  async playOne(item, { spatial = true } = {}) {
    if (this.backend === 'prebaked') return this._playPrebaked(item, spatial);
    if (this.backend === 'piper') return this._playPiper(item, spatial);
    return this._playBrowser(item);
  }

  async _drainQueue() {
    if (this.queue.length === 0) {
      this.playing = false;
      return;
    }
    this.playing = true;
    const item = this.queue.shift();
    try {
      await this.playOne(item, { spatial: true });
    } catch (e) {
      console.warn('[SpeechEngine]', e);
    }
    this._drainQueue();
  }

  _playBrowser(item) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(item.text);
      const voice = this.pickBrowserVoice(item.lang);
      if (voice) u.voice = voice;
      u.lang = item.lang === 'fr' ? 'fr-FR' : 'en-US';
      u.rate = this.rate;
      u.pitch = this.pitch;
      u.volume = this.volume;
      u.onend = () => {
        this.currentUtterance = null;
        resolve();
      };
      u.onerror = () => {
        this.currentUtterance = null;
        resolve();
      };
      this.currentUtterance = u;
      window.speechSynthesis.speak(u);
    });
  }

  async _fetchPiperAudio(item) {
    const voice = this.voiceForAgent(item.source, item.agentId, item.position, item.lang);
    const res = await fetch(`${this.piperBaseUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        voice,
        lang: item.lang,
      }),
    });
    if (!res.ok) throw new Error(`Piper TTS ${res.status}`);
    return res.blob();
  }

  async _playPiper(item, spatial) {
    const blob = await this._fetchPiperAudio(item);
    return this._playBlob(blob, item, spatial);
  }

  async _playPrebaked(item, spatial) {
    const id = item.utteranceId;
    if (!id || !this.prebakedBaseUrl) {
      return this._playBrowser(item);
    }
    const url = `${this.prebakedBaseUrl}/audio/${id}.wav`;
    const res = await fetch(url);
    if (!res.ok) return this._playBrowser(item);
    const blob = await res.blob();
    return this._playBlob(blob, item, spatial);
  }

  _playBlob(blob, item, spatial) {
    return new Promise((resolve, reject) => {
      const ctx = this.ensureAudioContext();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const id = `${item.source}-${item.agentId}-${Date.now()}`;

      if (spatial && ctx) {
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = this.volume;
        const panner = ctx.createStereoPanner();
        panner.pan.value = this.panFromPosition(item.position, item.source);
        source.connect(panner);
        panner.connect(gain);
        gain.connect(ctx.destination);
        this.activeNodes.set(id, { source: audio, panner, gain });
      } else {
        audio.volume = this.volume;
      }

      audio.playbackRate = this.rate;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.activeNodes.delete(id);
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        this.activeNodes.delete(id);
        reject(e);
      };
      audio.play().catch(reject);
    });
  }

  /** Lecture immédiate au survol (mixage simultané). */
  speakNow(item) {
    if (!this.masterEnabled || !item?.text?.trim()) return;
    const source = item.source || 'W';
    if (!this.sourcesEnabled[source]) return;
    const resolved = {
      ...item,
      lang: item.lang || this.detectLang(item.text),
    };
    if (this.backend === 'browser') {
      this._playBrowser(resolved);
      return;
    }
    this._playPiper(resolved, true).catch(() => this._playBrowser(resolved));
  }
}

export function createDefaultEngine(options = {}) {
  return new SpeechEngine(options);
}

export function detectLangSimple(text) {
  const fr = (text || '').match(/\b(le|la|les|des|une|dans|pour|avec)\b/gi);
  const en = (text || '').match(/\b(the|and|with|for|agent)\b/gi);
  return (fr?.length || 0) >= (en?.length || 0) ? 'fr' : 'en';
}
