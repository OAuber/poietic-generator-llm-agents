/**
 * Mixin TTS pour narrative viewers (base + V6).
 */
import { createDefaultEngine } from '/js/tts/speech-engine.js';
import { createSpeechControls } from '/js/tts/speech-controls.js';

export function attachTableauParlant(viewer, options = {}) {
  const metricsBase = options.metricsBase || 'http://localhost:5005';
  const panel = document.getElementById('speech-panel');
  if (!panel) return null;

  const engine = createDefaultEngine({
    piperBaseUrl: options.piperBaseUrl || 'http://localhost:5012',
    gridSize: options.gridSize || 5,
  });

  const controls = createSpeechControls(panel, engine, {
    metricsBase: options.utterancesBase || metricsBase,
    recorderBase: options.recorderBase,
    onReadLatest: () => viewer.speakLatest?.(),
  });

  viewer.speechEngine = engine;
  viewer.speakUtterance = (item) => {
    if (!engine.masterEnabled) return;
    engine.enqueue(item);
  };

  viewer.speakLatest = () => {
    const items = [];
    if (viewer.onDataHistory?.[0]) {
      const e = viewer.onDataHistory[0];
      if (e.oText) items.push({ text: e.oText, source: 'O' });
      if (e.nText) items.push({ text: e.nText, source: 'N' });
    }
    if (viewer.wDataHistory?.[0]) {
      const w = viewer.wDataHistory[0];
      items.push({
        text: w.text,
        source: 'W',
        agentId: w.agentId,
        position: w.position,
        iteration: w.iteration,
      });
    }
    const last = items[items.length - 1];
    if (last) engine.enqueue(last);
  };

  viewer._bindHoverTts = () => {
    document.querySelectorAll('[data-tts-hover]').forEach((el) => {
      if (el.dataset.ttsBound) return;
      el.dataset.ttsBound = '1';
      el.addEventListener('mouseenter', () => {
        const payload = el.dataset.ttsPayload;
        if (!payload) return;
        try {
          const item = JSON.parse(decodeURIComponent(payload));
          engine.speakNow(item);
        } catch (_) {}
      });
    });
  };

  return { engine, controls };
}

export function ttsPayload(item) {
  return encodeURIComponent(JSON.stringify(item));
}
