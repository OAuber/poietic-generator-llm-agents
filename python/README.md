# Poietic Generator - Client Python pour IA

Ce dossier contient un client Python permettant à des agents IA (LLM ou autres) de participer au jeu Poietic Generator de manière autonome.

## 🎯 Objectif

Permettre à des intelligences artificielles de participer à l'expérience de création graphique collective en temps réel, soit sur une plateforme dédiée aux IA, soit en mode mixte humains-IA.

## 📦 Installation

### Prérequis

- Python 3.8+
- Serveur Poietic Generator en cours d'exécution (par défaut sur `localhost:3001`)

### Installation basique

```bash
cd python
pip install -r requirements.txt
```

### Installation avec support LLM

```bash
pip install -r requirements-llm.txt
```

## 🚀 Utilisation

### 1. Client Python de base

Le module `poietic_client.py` fournit une classe `PoieticClient` pour se connecter au serveur via WebSocket.

```python
from poietic_client import PoieticClient
import asyncio

async def main():
    client = PoieticClient("ws://localhost:3001/updates")
    await client.connect()
    
    # Dessiner un pixel rouge
    await client.draw(10, 10, "#FF0000")
    
    # Garder la connexion active
    await client.run_forever()

asyncio.run(main())
```

### 2. Exemples de bots

#### Random Bot (dessin aléatoire)

```bash
python examples/random_bot.py --interval 0.5
```

Dessine continuellement des pixels de couleurs aléatoires.

#### Pattern Bot (motifs géométriques)

```bash
python examples/pattern_bot.py
```

Dessine une série de motifs géométriques : grilles, cercles, spirales, dégradés, damiers, etc.

#### LLM Bot (contrôlé par IA)

Avec OpenAI GPT :

```bash
export OPENAI_API_KEY="sk-..."
python examples/llm_bot.py --provider openai --interval 5
```

Avec Anthropic Claude :

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python examples/llm_bot.py --provider anthropic --interval 5
```

Le LLM Bot analyse l'état de sa cellule et décide de manière créative quoi dessiner ensuite.

## 📖 API du Client

### PoieticClient

#### Constructeur

```python
client = PoieticClient(
    url="ws://localhost:3001/updates",
    user_id=None,  # Optionnel : pour la reconnexion
    on_initial_state=callback,  # Callback lors de l'état initial
    on_cell_update=callback,    # Callback lors d'une mise à jour
    on_new_user=callback,       # Callback nouvel utilisateur
    on_user_left=callback,      # Callback départ utilisateur
    on_zoom_update=callback     # Callback zoom
)
```

#### Méthodes principales

```python
# Connexion / Déconnexion
await client.connect()
await client.disconnect()

# Dessin
await client.draw(x, y, color)  # x, y: 0-19, color: "#RRGGBB"
await client.draw_multiple([(x1, y1, color1), (x2, y2, color2), ...])

# État
my_cell = client.get_my_cell()  # Dict[(x, y)] -> color
other_cell = client.get_user_cell(user_id)
all_users = client.get_all_users()

# Maintenir la connexion
await client.run_forever()
```

#### Propriétés

```python
client.my_user_id       # Mon ID utilisateur
client.grid_size        # Taille de la grille globale
client.user_positions   # Dict[user_id] -> (grid_x, grid_y)
client.my_cell          # Dict[(sub_x, sub_y)] -> color
client.is_connected     # Bool: statut de connexion
```

## 🧠 Utilisation avec des LLM

Le module `llm_bot.py` montre comment intégrer un LLM pour contrôler le bot de manière autonome.

### Principe

1. **Observation** : Le bot analyse l'état actuel de sa cellule
2. **Réflexion** : Le LLM reçoit une description textuelle et décide des prochaines actions
3. **Action** : Le bot exécute les pixels suggérés par le LLM
4. **Répétition** : Le cycle recommence après un intervalle configurable

### Personnalisation

Vous pouvez personnaliser le comportement créatif du LLM :

```bash
python examples/llm_bot.py \
  --prompt "Tu es un artiste minimaliste qui crée des motifs zen et épurés" \
  --interval 10
```

### Format de réponse du LLM

Le LLM doit répondre en JSON :

```json
{
  "reasoning": "Je vais créer un dégradé du rouge vers le bleu",
  "actions": [
    {"x": 0, "y": 10, "color": "#FF0000"},
    {"x": 1, "y": 10, "color": "#EE0011"},
    {"x": 2, "y": 10, "color": "#DD0022"}
  ]
}
```

## 🏗️ Architecture

```
Serveur Poietic (Crystal)
    ↕ WebSocket (/updates)
Client Python (poietic_client.py)
    ↕
Bot Logic (random_bot, pattern_bot, llm_bot)
    ↕ (optionnel)
LLM API (OpenAI, Anthropic, etc.)
```

### Messages WebSocket

Le client communique via WebSocket en JSON :

**Envoi (client → serveur)**
```json
{"type": "cell_update", "sub_x": 10, "sub_y": 15, "color": "#FF0000"}
{"type": "heartbeat"}
```

**Réception (serveur → client)**
```json
{"type": "initial_state", "my_user_id": "...", "grid_size": 3, ...}
{"type": "cell_update", "user_id": "...", "sub_x": 5, "sub_y": 5, "color": "#00FF00"}
{"type": "new_user", "user_id": "...", "position": [1, 0]}
{"type": "user_left", "user_id": "..."}
{"type": "zoom_update", "grid_size": 5, ...}
{"type": "pong"}
```

## 🔬 Recherche sur les phénomènes collectifs

Cette infrastructure permet d'étudier :

- **Interactions IA-IA** : Comportements émergents entre agents artificiels
- **Interactions humains-IA** : Comment les humains réagissent à la présence d'IA
- **Créativité computationnelle** : Comment les LLM expriment leur "créativité"
- **Dynamiques de groupe** : Patterns collectifs dans des groupes mixtes

### Suggestions d'expériences

1. **Plateforme IA pure** : Lancer plusieurs bots avec différentes personnalités
2. **Plateforme mixte** : Mélanger humains et IA (identifiés ou anonymes)
3. **Évolution comportementale** : Observer comment les stratégies des IA évoluent
4. **Influence sociale** : Mesurer comment les IA imitent ou influencent les humains

## 🛠️ Extension et personnalisation

### Créer votre propre bot

```python
import asyncio
from poietic_client import PoieticClient

async def my_custom_bot():
    client = PoieticClient("ws://localhost:3001/updates")
    await client.connect()
    await asyncio.sleep(1)  # Attendre l'état initial
    
    # Votre logique ici
    while client.is_connected:
        # Décider quoi faire
        x, y, color = your_decision_logic()
        await client.draw(x, y, color)
        await asyncio.sleep(0.5)
    
    await client.disconnect()

asyncio.run(my_custom_bot())
```

### Intégrer d'autres LLM

Le module `llm_bot.py` peut être étendu pour supporter d'autres providers :

- Modèles locaux (Ollama, LM Studio)
- Autres APIs (Cohere, Google Gemini, etc.)
- Modèles custom fine-tunés

## 📝 Notes techniques

- Chaque utilisateur (IA ou humain) possède une cellule de 20x20 pixels
- Les coordonnées vont de (0, 0) à (19, 19)
- Les couleurs sont au format hexadécimal `#RRGGBB`
- Le serveur envoie des heartbeats toutes les 5 secondes
- Déconnexion automatique après 180 secondes d'inactivité

## 🐛 Dépannage

### Le bot ne se connecte pas

```bash
# Vérifier que le serveur tourne
curl http://localhost:3001/

# Tester la connexion WebSocket
python -c "from poietic_client import PoieticClient; import asyncio; asyncio.run(PoieticClient().connect())"
```

### Le LLM bot échoue

- Vérifier que la clé API est définie : `echo $OPENAI_API_KEY`
- Vérifier les quotas API de votre compte
- Essayer avec un modèle moins cher (gpt-4o-mini)

### "websockets module not found"

```bash
pip install websockets
```

## 📄 Licence

Même licence que le projet Poietic Generator principal.

## 🤝 Contribution

Pour contribuer :
1. Créez de nouveaux exemples de bots dans `examples/`
2. Améliorez le client de base `poietic_client.py`
3. Documentez vos expériences de recherche
4. Partagez vos résultats !

## 📧 Contact

Pour questions et suggestions, consultez le README principal du projet.


