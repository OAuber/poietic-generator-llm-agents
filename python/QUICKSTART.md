# 🚀 Guide de Démarrage Rapide - IA pour Poietic Generator

Ce guide vous permet de commencer rapidement à intégrer des IA dans Poietic Generator.

## 📋 Prérequis

1. **Serveur Poietic Generator en cours d'exécution**
   ```bash
   # Depuis la racine du projet
   cd /home/oa/poietic-generator-api
   # Lancer le serveur (suivre les instructions du README principal)
   ```

2. **Python 3.8+**
   ```bash
   python3 --version
   ```

3. **Clé API LLM** (optionnel, pour les bots LLM)
   - OpenAI : https://platform.openai.com/api-keys
   - Anthropic : https://console.anthropic.com/

## ⚡ Démarrage en 5 minutes

### Option 1 : Bot Simple (Sans LLM)

```bash
# 1. Installer les dépendances
cd python
pip install -r requirements.txt

# 2. Lancer un bot aléatoire
python examples/random_bot.py

# 3. Ou lancer un bot avec des motifs
python examples/pattern_bot.py
```

### Option 2 : Bot LLM (Direct WebSocket)

```bash
# 1. Installer les dépendances
pip install -r requirements-llm.txt

# 2. Configurer la clé API
export OPENAI_API_KEY="sk-..."
# ou
export ANTHROPIC_API_KEY="sk-ant-..."

# 3. Lancer le bot
python examples/llm_bot.py --provider openai --interval 5
```

### Option 3 : Bot LLM via API REST (Plus Simple)

```bash
# Terminal 1 : Lancer l'API REST
pip install -r requirements-api.txt
python api_server.py

# Terminal 2 : Lancer le bot
export OPENAI_API_KEY="sk-..."
python examples/llm_via_api.py --provider openai
```

## 🎯 Cas d'Usage

### 1. Test Simple - Vérifier que tout fonctionne

```bash
python examples/random_bot.py --interval 0.5
```

Vous devriez voir des pixels colorés apparaître dans votre navigateur sur http://localhost:3001

### 2. Démonstration de Motifs

```bash
python examples/pattern_bot.py
```

Le bot dessinera successivement : grille, diagonale, cercle, spirale, dégradés, damier.

### 3. Créativité IA - Bot OpenAI GPT

```bash
export OPENAI_API_KEY="sk-..."
python examples/llm_bot.py --provider openai --interval 10
```

Le bot utilisera GPT pour décider de manière créative quoi dessiner.

### 4. Créativité IA - Bot Claude

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python examples/llm_bot.py --provider anthropic --interval 10
```

### 5. Expérience Multi-Bots

Lancez plusieurs bots en même temps pour observer les interactions :

```bash
# Terminal 1
python examples/random_bot.py --interval 1

# Terminal 2
python examples/pattern_bot.py

# Terminal 3
python examples/llm_bot.py --provider openai
```

## 🧪 Expérimentations Avancées

### Personnaliser le Comportement du LLM

```bash
python examples/llm_bot.py \
  --provider openai \
  --prompt "Tu es un artiste minimaliste zen qui crée des motifs épurés en noir et blanc" \
  --interval 8
```

### Créer Votre Propre Bot

Créez un fichier `my_bot.py` :

```python
import asyncio
from poietic_client import PoieticClient

async def my_bot():
    client = PoieticClient("ws://localhost:3001/updates")
    await client.connect()
    await asyncio.sleep(1)
    
    # Dessiner une ligne horizontale rouge
    for x in range(20):
        await client.draw(x, 10, "#FF0000")
        await asyncio.sleep(0.1)
    
    await client.run_forever()

asyncio.run(my_bot())
```

Lancez-le :
```bash
python my_bot.py
```

### Utiliser l'API REST pour des Scripts Simples

```python
import requests
import time

# Créer une session
response = requests.post("http://localhost:8000/sessions", json={
    "poietic_url": "ws://localhost:3001/updates"
})
session_id = response.json()["session_id"]

# Dessiner un carré
for i in range(10):
    requests.post(f"http://localhost:8000/sessions/{session_id}/draw", json={
        "x": i, "y": 0, "color": "#FF0000"
    })
    requests.post(f"http://localhost:8000/sessions/{session_id}/draw", json={
        "x": i, "y": 9, "color": "#FF0000"
    })
    requests.post(f"http://localhost:8000/sessions/{session_id}/draw", json={
        "x": 0, "y": i, "color": "#FF0000"
    })
    requests.post(f"http://localhost:8000/sessions/{session_id}/draw", json={
        "x": 9, "y": i, "color": "#FF0000"
    })
    time.sleep(0.1)

# Garder la connexion active
time.sleep(3600)
```

## 🔬 Recherche & Observation

### Visualiser les Interactions

Ouvrez plusieurs fenêtres de navigateur :
- http://localhost:3001 - Interface normale (jouez en tant qu'humain)
- http://localhost:3001/viewer - Mode observateur (lecture seule)
- http://localhost:3001/monitoring - Monitoring technique

### Enregistrer une Session

Le serveur Poietic enregistre automatiquement toutes les sessions. Vous pouvez ensuite :
- Analyser les patterns émergents
- Rejouer les sessions
- Étudier les interactions humains-IA

### Identifier les IA vs Humains

Pour distinguer les IA des humains, vous pourriez :
1. Modifier le serveur pour accepter un paramètre `?type=ai` dans l'URL WebSocket
2. Logger différemment les actions des IA
3. Afficher un indicateur visuel dans l'interface

## 📊 Métriques & Analyse

### Obtenir des Statistiques

```bash
# Via API REST (si api_server.py est lancé)
curl http://localhost:8000/sessions

# Via API Recorder du serveur principal
curl http://localhost:3001/api/stats
curl http://localhost:3001/api/sessions
```

### Analyser le Comportement

```python
import requests

# Récupérer l'état de la cellule d'un bot
session_id = "..."
response = requests.get(f"http://localhost:8000/sessions/{session_id}/cell")
cell = response.json()

print(f"Pixels dessinés: {cell['pixel_count']}")
print(f"Couleurs: {len(set(cell['pixels'].values()))}")
```

## 🐛 Dépannage

### Le bot ne se connecte pas

```bash
# Vérifier que le serveur Poietic est accessible
curl http://localhost:3001/

# Tester la connexion WebSocket
python -c "import asyncio; from poietic_client import PoieticClient; asyncio.run(PoieticClient().connect())"
```

### Erreur "websockets module not found"

```bash
pip install websockets
```

### Le LLM ne répond pas

```bash
# Vérifier la clé API
echo $OPENAI_API_KEY

# Tester l'API directement
python -c "import openai; print(openai.OpenAI().models.list())"
```

### L'API REST ne démarre pas

```bash
# Installer fastapi et uvicorn
pip install fastapi uvicorn

# Lancer en mode debug
python api_server.py --host 0.0.0.0 --port 8000
```

## 📚 Ressources

- **Documentation complète** : `README.md`
- **API WebSocket** : Voir les messages dans `src/cli/poietic-generator-api.cr`
- **API REST Documentation** : http://localhost:8000/docs (quand api_server.py est lancé)
- **Exemples de bots** : Dossier `examples/`

## 🎨 Idées d'Expériences

1. **Compétition de styles** : Lancer plusieurs LLM avec des prompts différents et observer les styles émergents

2. **Imitation** : Un bot qui observe et tente d'imiter le style d'un humain

3. **Collaboration** : Plusieurs bots qui communiquent entre eux (via un canal externe) pour créer une œuvre coordonnée

4. **Évolution** : Un bot qui adapte son style en fonction des réactions des humains

5. **Chaîne créative** : Chaque bot ajoute à ce que le précédent a créé

## 💡 Conseils

- **Commencez simple** : Testez d'abord avec random_bot.py
- **Observez** : Utilisez le mode viewer pour observer sans interférer
- **Expérimentez** : Changez les paramètres (interval, prompts, couleurs)
- **Documentez** : Notez vos observations pour la recherche
- **Partagez** : Contribuez vos découvertes au projet

## 🤝 Contribution

Pour partager vos bots ou améliorer l'infrastructure :
1. Créez de nouveaux exemples dans `examples/`
2. Documentez vos expériences
3. Proposez des améliorations au client de base
4. Partagez vos résultats de recherche

---

**Prêt à commencer ?** Lancez `python examples/random_bot.py` et regardez votre premier bot dessiner ! 🎨🤖


