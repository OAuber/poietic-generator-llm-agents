# Tableau parlant (P0–P3)

Synthèse vocale des énoncés W/O/N pour les narrative viewers et la diffusion live.

## URLs

| Service | Port | URL |
|---------|------|-----|
| Narrative viewer V5 | 3001 | `/narrative-viewer.html` |
| Narrative viewer V6 | 3001 | `/narrative-viewer-v6.html` |
| Tableau parlant live | 3001 | `/tableau-parlant-live.html` |
| Énoncés / export | 5010 | `/api/utterances/{session_id}` |
| Piper TTS | 5012 | `POST /tts` |

## Phases

- **P0** : `speechSynthesis` dans le navigateur, panneau de contrôle, survol pour réécouter.
- **P1** : sidecar `db/utterances/<session_id>.jsonl`, rejeu par session.
- **P2** : Piper local + spatialisation Web Audio.
- **P3** : export ZIP interactif, page live SSE.

## Dépannage

- **Aucun texte dans narrative-viewer** : vérifier la barre d’état en haut du panneau gauche ; recharger avec Ctrl+Shift+R ; confirmer que le serveur O-N tourne sur le port 8005 et les métriques sur 5005.
- **Page live vide** : le port 5010 doit être actif (démarré avec `metrics_server_v5.py`) ; la page charge aussi les données depuis 8005 au démarrage.
- **Modules JS** : les imports utilisent des chemins absolus `/js/tts/...` ; en cas d’erreur 404, lancer `shards build` pour la route Kemal `/js/tts/:file`.

## Piper (optionnel)

Placez les modèles `.onnx` dans `voices/` ou définissez `PIPER_VOICES_DIR`. Sans Piper, le serveur renvoie un WAV silencieux minimal (développement).

```bash
# Exemple voix FR
# https://github.com/rhasspy/piper/releases
piper --model voices/fr_FR-siwis-medium.onnx --output_file test.wav
```

## Données

Chaque ligne JSONL :

```json
{"id":"…","ts":"…","iteration":3,"source":"W","agentId":"…","position":[1,2],"lang":"fr","text":"…","session_id":"…"}
```
