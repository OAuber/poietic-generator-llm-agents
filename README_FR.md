# 🤖 Poietic Generator - Agents LLM

**Agents autonomes basés sur l'IA pour le Générateur Poïétique**

> 🌍 **Documentation principale en anglais** : voir [README.md](README.md)

---

## ⚡ Démarrage rapide

### Installation (5 minutes)

1. **Installer Ollama** (gratuit, local)
   ```bash
   curl -fsSL https://ollama.ai/install.sh | sh
   ollama pull llama3.2:3b
   ```

2. **Démarrer le Générateur Poïétique**
   ```bash
   cd ~/poietic-generator2-documentation
   ./bin/poietic-generator-api --port=3001
   ```

3. **Démarrer le serveur proxy IA**
   ```bash
   cd ~/projects/poietic-generator-llm-agents/python
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python poietic_ai_server.py
   ```

4. **Lancer un agent**
   ```bash
   firefox http://localhost:3001/ai-player.html
   # Sélectionner "Ollama", cliquer "Démarrer"
   ```

5. **Voir le dessin collectif**
   ```bash
   firefox http://localhost:3001
   ```

---

## 📚 Documentation complète

- **Guide complet** : [README.md](README.md) (anglais)
- **Installation détaillée** : [INSTALL.md](INSTALL.md)
- **Démarrage rapide** : [QUICKSTART.md](QUICKSTART.md)
- **Contribuer** : [CONTRIBUTING.md](CONTRIBUTING.md)
- **Publication GitHub** : [GITHUB_SETUP.md](GITHUB_SETUP.md)

---

## 🎯 Fonctionnalités principales

✅ **Support multi-LLM** : Ollama (local), Claude, GPT, Mistral  
✅ **Collaboration temps réel** : Détection de 8 voisins  
✅ **5 palettes artistiques** : Profondeur, ombres, contraste  
✅ **Continuité temporelle** : Les agents terminent leurs dessins  
✅ **Fallback robuste** : Génération automatique si erreur  
✅ **Dessin progressif** : Animations fluides  
✅ **Analytics de performance** : Monitoring en temps réel  

---

## 🛠️ Utilitaires

### Lancer plusieurs agents

```bash
cd ~/projects/poietic-generator-llm-agents
./examples/launch_agents.sh 5  # Lance 5 agents
```

### Voir les statistiques Ollama

```
http://localhost:8003/ollama-stats.html
```

### Voir le dashboard analytics

```
http://localhost:8003/analytics-dashboard.html
```

---

## 📦 Structure du package

```
poietic-generator-llm-agents/
├── README.md                   # Documentation (EN)
├── README_FR.md                # Ce fichier (FR)
├── QUICKSTART.md               # Guide 5 minutes
├── public/                     # Frontend JavaScript
│   ├── ai-player.html
│   └── js/
│       ├── ai-player.js
│       ├── spatial-analysis.js
│       └── llm-adapters/
├── python/                     # Serveur proxy FastAPI
│   ├── poietic_ai_server.py
│   └── requirements.txt
├── docs/                       # Manuels d'instructions (FR)
│   ├── MANUEL_OLLAMA.md
│   ├── MANUEL_ANTHROPIC.md
│   └── MANUEL_OPENAI.md
└── examples/                   # Scripts utilitaires
    └── launch_agents.sh
```

---

## 🚀 Publication sur GitHub

1. **Créer le dépôt sur GitHub**
   - Aller sur : https://github.com/new
   - Nom : `poietic-generator-llm-agents`
   - Description : `🤖 AI-powered autonomous drawing agents for the Poietic Generator`
   - Visibilité : Public
   - Ne PAS initialiser avec README

2. **Initialiser Git et pousser**
   ```bash
   cd ~/projects/poietic-generator-llm-agents
   ./.git-init-commands.sh
   
   # Puis suivre les instructions affichées
   ```

3. **Voir le guide complet**
   Consultez [GITHUB_SETUP.md](GITHUB_SETUP.md) pour un guide détaillé.

---

## 🔗 Liens importants

- **Projet principal** : https://github.com/OAuber/poietic-generator2-documentation
- **Ce package** : https://github.com/OAuber/poietic-generator-llm-agents (à créer)
- **Site web** : http://poietic-generator.net/

---

## 📄 Licence

MIT License - Voir [LICENSE](LICENSE)

---

## 👤 Auteur

**Olivier Auber** - Créateur du Générateur Poïétique (1986-2025)

---

## 🎨 Dernières améliorations (v1.0.0)

### Palettes artistiques avancées

5 techniques pour créer de la profondeur et de l'harmonie :

1. **Monochromatique** : 8 nuances d'une couleur (ombres → lumières)
2. **Complémentaire** : 2 couleurs opposées (fort contraste)
3. **Triade** : 3 couleurs espacées (équilibre)
4. **Analogue** : Couleurs voisines (transitions douces)
5. **Chaud→Froid** : Rouge/orange → Bleu/violet (perspective atmosphérique)

### Continuité temporelle

Les agents se souviennent de leur stratégie précédente :
```
Itération 1: "étoile jaune"
Itération 2: "continue étoile jaune"
Itération 3: "termine étoile avec reflets"
→ Résultat : Dessins complets au lieu de fragments abandonnés !
```

### Fallback automatique

Plus d'interruptions ! Si le LLM génère du texte incorrect, l'agent dessine automatiquement une forme par défaut (cercle, croix, carré).

---

**Fait avec ❤️ pour la créativité collective IA** 🎨🤖

*"Qu'est-ce qui émerge quand (humains et) IA dessinent ensemble ?"*
