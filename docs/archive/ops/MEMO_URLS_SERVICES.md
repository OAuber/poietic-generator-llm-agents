# Mémo : URLs et Services du Poietic Generator

## 🌐 Services et Ports

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| **Viewer (dev)** | 3000 | `http://localhost:3000/` | Serveur Crystal de développement (auto-reload) |
| **Viewer (prod)** | 3001 | `http://localhost:3001/` | Serveur Crystal compilé (binaire) |
| **AI Player (dev)** | 3000 | `http://localhost:3000/ai-player.html` | Interface pour lancer des agents IA (dev) |
| **AI Player (prod)** | 3001 | `http://localhost:3001/ai-player.html` | Interface pour lancer des agents IA (prod) |
| **Python AI Server** | 8003 | `http://localhost:8003/` | Serveur FastAPI (proxy Ollama + analytics) |
| **Stats Ollama** | 8003 | `http://localhost:8003/ollama-stats.html` | Dashboard des statistiques Ollama |
| **Analytics Dashboard** | 8003 | `http://localhost:8003/analytics-dashboard.html` | Dashboard général des analytics |
| **API Analytics** | 8003 | `http://localhost:8003/api/analytics/ollama/stats` | Endpoint JSON des stats Ollama |
| **Recorder** | 3002 | `http://localhost:3002/` | Enregistreur de sessions |

---

## 🚀 Lancement des Services

### 1. Serveur Crystal (Viewer + API WebSocket)

**Mode développement** (port 3000, auto-reload) :
```bash
cd /home/oa/poietic-generator-api
crystal run src/poietic-generator-api.cr -- --port=3000
```

**Mode production** (port 3001, binaire compilé) :
```bash
cd /home/oa/poietic-generator-api
./bin/poietic-generator-api --port=3001
```

> ⚠️ **Important** : Après modifications frontend (HTML, CSS, JS), recompiler avec :
> ```bash
> ./deploy.sh
> ```

---

### 2. Serveur Python (FastAPI - Proxy Ollama)

```bash
cd /home/oa/poietic-generator-api/python
python3 poietic_ai_server.py
```

Le serveur démarre automatiquement sur le port **8003** (ou 8000 si disponible).

**Logs affichés** :
- `[PERF]` : Performances Ollama (tokens/sec, temps de réponse)
- `[ERROR]` : Erreurs de connexion Ollama
- `[DEBUG]` : Aperçu des réponses brutes

---

### 3. Recorder (optionnel)

```bash
cd /home/oa/poietic-generator-api
./bin/poietic-recorder --port=3002
```

---

## 🔍 Vérifier les Services en Cours

```bash
# Voir tous les processus Poietic
ps aux | grep -E "(crystal|poietic|python)" | grep -v grep

# Voir les ports ouverts
ss -tlnp | grep -E "(3000|3001|3002|8003)"

# Tester la connexion
curl http://localhost:3001/
curl http://localhost:8003/api/analytics/ollama/stats
```

---

## 📊 URLs Importantes à Retenir

### Pour surveiller les performances :
```
http://localhost:8003/ollama-stats.html
```
→ Dashboard en temps réel des stats Ollama (requêtes/min, tokens, vitesse)

```
http://localhost:8003/analytics-dashboard.html
```
→ Dashboard général des analytics (toutes les métriques)

### Pour lancer des agents :
```
http://localhost:3001/ai-player.html
```
→ Interface pour configurer et démarrer des agents IA (Ollama, Claude, OpenAI)

### Pour voir le dessin collaboratif :
```
http://localhost:3001/
```
→ Viewer en temps réel de la grille collaborative

---

## 🛠️ Workflow de Développement

### Modifications du frontend (JS, HTML, CSS) :
1. Éditer les fichiers dans `/home/oa/poietic-generator-api/public/`
2. Recompiler : `./deploy.sh`
3. Recharger le navigateur avec **cache-busting** : `Ctrl+Shift+R` ou fenêtre privée

### Modifications du backend Crystal :
1. Éditer les fichiers dans `/home/oa/poietic-generator-api/src/`
2. Recompiler : `crystal build src/poietic-generator-api.cr -o bin/poietic-generator-api --release`
3. Redémarrer le serveur

### Modifications du serveur Python :
1. Éditer `/home/oa/poietic-generator-api/python/poietic_ai_server.py`
2. Redémarrer le serveur Python (Ctrl+C puis relancer)

---

## 🎨 Configuration Ollama

### Modèle utilisé :
- **llama3.2:3b** (rapide, GPU OVH gratuit)

### Paramètres actuels :
- `max_tokens` : 1000 (20-25 pixels par itération)
- `temperature` : 0.7 (créativité modérée)
- `repeat_penalty` : 0.9 (encourage les répétitions)

### Serveur Ollama distant (OVH) :
```
https://2d30a9cf-f8ff-4217-9edd-1c44b3f8a857.app.bhs.ai.cloud.ovh.net
```

---

## 🐛 Dépannage

### "Kemal doesn't know this way"
→ Vous essayez d'accéder à une URL servie par Python via le serveur Crystal.
→ Utilisez `http://localhost:8003/` pour les URLs Python.

### "Connection refused on port 8000"
→ Le serveur Python tourne probablement sur le port 8003.
→ Vérifiez avec : `ss -tlnp | grep python`

### "Cannot read properties of undefined"
→ Cache navigateur obsolète.
→ Solution : Ctrl+Shift+R ou fenêtre privée, ou vérifier le cache-busting `?v=...` dans le HTML.

### Agents ne dessinent pas
→ Vérifier les logs du serveur Python : `[ERROR]`, `[PERF]`
→ Vérifier la console navigateur : erreurs JavaScript

---

## 📝 Changements Récents (2025-10-11)

- ✅ Palette de couleurs unique par agent (génération HSL aléatoire)
- ✅ Déduplication des pixels voisins
- ✅ Prompt personnalisé de l'utilisateur intégré
- ✅ Collaboration aux bordures rendue optionnelle (ton neutre)
- ✅ Envoi progressif des pixels (animation fluide)
- ✅ Format compact pour Ollama (pas de JSON)
- ✅ Ollama par défaut dans l'interface
- ✅ Logs de collaboration plus clairs

---

**Date de création** : 2025-10-11  
**Dernière mise à jour** : 2025-10-11

