/**
 * Panneau de contrôle TTS partagé (narrative viewers + live).
 */
import { SpeechEngine } from '/js/tts/speech-engine.js';

export function createSpeechControls(container, engine, options = {}) {
  const metricsBase = options.metricsBase || 'http://localhost:5005';
  const recorderBase = options.recorderBase || window.location.origin.replace(/:\d+$/, ':3001');

  container.className = 'speech-controls';
  container.innerHTML = `
    <div class="speech-controls-inner">
      <label class="sc-row"><input type="checkbox" id="sc-master" /> Voix active</label>
      <label class="sc-row"><input type="checkbox" id="sc-skip" checked /> Dernier seulement</label>
      <div class="sc-row sc-toggles">
        <label><input type="checkbox" id="sc-w" checked /> W</label>
        <label><input type="checkbox" id="sc-o" checked /> O</label>
        <label><input type="checkbox" id="sc-n" checked /> N</label>
      </div>
      <label class="sc-row">Backend
        <select id="sc-backend">
          <option value="browser">Navigateur</option>
          <option value="piper">Piper (local)</option>
        </select>
      </label>
      <label class="sc-row">Langue
        <select id="sc-lang">
          <option value="auto">Auto</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <label class="sc-row">Voix <select id="sc-voice"></select></label>
      <label class="sc-row">Débit <input type="range" id="sc-rate" min="0.5" max="2" step="0.05" value="1" /></label>
      <label class="sc-row">Hauteur <input type="range" id="sc-pitch" min="0.5" max="2" step="0.05" value="1" /></label>
      <label class="sc-row">Volume <input type="range" id="sc-volume" min="0" max="1" step="0.05" value="1" /></label>
      <button type="button" id="sc-read-latest" class="sc-btn">Lire le dernier</button>
      <hr class="sc-hr" />
      <label class="sc-row">Rejeu session
        <select id="sc-session"><option value="">— live —</option></select>
      </label>
      <button type="button" id="sc-replay" class="sc-btn">Rejouer énoncés</button>
      <button type="button" id="sc-export" class="sc-btn">Exporter tableau parlant</button>
    </div>
  `;

  const el = (id) => container.querySelector(id);
  const master = el('#sc-master');
  const skip = el('#sc-skip');
  const backendSel = el('#sc-backend');
  const langSel = el('#sc-lang');
  const voiceSel = el('#sc-voice');
  const sessionSel = el('#sc-session');

  function refreshVoices() {
    const voices = engine.getBrowserVoices();
    const lang = langSel.value;
    const filtered =
      lang === 'fr'
        ? voices.filter((v) => v.lang?.toLowerCase().startsWith('fr'))
        : lang === 'en'
          ? voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
          : voices;
    voiceSel.innerHTML = '<option value="">(défaut)</option>';
    (filtered.length ? filtered : voices).forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSel.appendChild(opt);
    });
  }

  master.addEventListener('change', () => engine.setMasterEnabled(master.checked));
  skip.addEventListener('change', () => engine.setSkipToLatest(skip.checked));
  el('#sc-w').addEventListener('change', (e) => engine.setSourceEnabled('W', e.target.checked));
  el('#sc-o').addEventListener('change', (e) => engine.setSourceEnabled('O', e.target.checked));
  el('#sc-n').addEventListener('change', (e) => engine.setSourceEnabled('N', e.target.checked));
  backendSel.addEventListener('change', () => engine.setBackend(backendSel.value));
  langSel.addEventListener('change', () => {
    engine.setLang(langSel.value);
    refreshVoices();
  });
  voiceSel.addEventListener('change', () => engine.setVoiceUri(voiceSel.value));
  el('#sc-rate').addEventListener('input', (e) => engine.setRate(parseFloat(e.target.value)));
  el('#sc-pitch').addEventListener('input', (e) => engine.setPitch(parseFloat(e.target.value)));
  el('#sc-volume').addEventListener('input', (e) => engine.setVolume(parseFloat(e.target.value)));

  el('#sc-read-latest').addEventListener('click', () => {
    if (options.onReadLatest) options.onReadLatest();
  });

  async function loadSessions() {
    try {
      const res = await fetch(`${recorderBase}/api/sessions`);
      if (!res.ok) return;
      const sessions = await res.json();
      sessionSel.innerHTML = '<option value="">— live —</option>';
      (sessions || []).slice(0, 30).forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id || s['id'];
        const t = s.start_time ? new Date(s.start_time).toLocaleString() : s.id;
        opt.textContent = `${t} (${s.event_count || 0} evt)`;
        sessionSel.appendChild(opt);
      });
    } catch (_) {}
  }

  el('#sc-replay').addEventListener('click', async () => {
    const sid = sessionSel.value;
    if (!sid) return;
    try {
      const res = await fetch(`${metricsBase}/api/utterances/${sid}`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const list = data.utterances || [];
      engine.setSkipToLatest(false);
      engine.flush();
      for (const u of list) {
        engine.enqueue({
          text: u.text,
          source: u.source,
          lang: u.lang,
          agentId: u.agentId,
          position: u.position,
          iteration: u.iteration,
          timestamp: u.ts,
          utteranceId: u.id,
        });
        await new Promise((r) => setTimeout(r, 80));
      }
    } catch (e) {
      console.error('[SpeechControls] replay', e);
    }
  });

  el('#sc-export').addEventListener('click', async () => {
    const sid = sessionSel.value;
    if (!sid) {
      alert('Choisissez une session enregistrée.');
      return;
    }
    try {
      const res = await fetch(`${metricsBase}/api/utterances/${sid}/export`);
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tableau-parlant-${sid}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('[SpeechControls] export', e);
      alert('Export impossible : ' + e.message);
    }
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
  refreshVoices();
  loadSessions();

  return { refreshVoices, loadSessions };
}
