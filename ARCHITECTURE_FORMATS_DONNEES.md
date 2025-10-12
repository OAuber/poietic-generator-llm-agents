# Architecture des formats de données - Poietic Generator

## 📊 Vue d'ensemble

Le système utilise **deux formats distincts** pour optimiser la communication réseau (JSON) et la consommation de tokens LLM (format compact).

---

## 🏗️ SCHÉMA DE L'ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NAVIGATEUR (Frontend)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────┐         ┌──────────────────┐                      │
│  │   AI Player      │         │  Human Player    │                      │
│  │  (ai-player.js)  │         │(poietic-client.js)│                     │
│  └────────┬─────────┘         └────────┬─────────┘                      │
│           │                             │                                │
│           │ Format: JSON                │ Format: JSON                   │
│           │ {"type": "cell_update",     │ {"type": "cell_update",        │
│           │  "sub_x": 10,               │  "sub_x": 5,                   │
│           │  "sub_y": 5,                │  "sub_y": 8,                   │
│           │  "color": "#3498DB"}        │  "color": "#E74C3C"}           │
│           │                             │                                │
│           └──────────────┬──────────────┘                                │
│                          │                                                │
│                          │ WebSocket (JSON)                              │
│                          ▼                                                │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                    SERVEUR CRYSTAL (Backend)                             │
│                  (poietic-generator-api.cr)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  WebSocket Handler (/updates)                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 1. Reçoit: JSON individuel                                      │    │
│  │    {"type": "cell_update", "sub_x": 10, "sub_y": 5, ...}       │    │
│  │                                                                  │    │
│  │ 2. Enrichit avec user_id et timestamp                           │    │
│  │                                                                  │    │
│  │ 3. Broadcast: JSON enrichi                                      │    │
│  │    {"type": "cell_update",                                      │    │
│  │     "user_id": "abc123",                                        │    │
│  │     "sub_x": 10,                                                │    │
│  │     "sub_y": 5,                                                 │    │
│  │     "color": "#3498DB",                                         │    │
│  │     "timestamp": 1234567890}                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                          │                                                │
│                          │ Broadcast (JSON) à tous les clients           │
│                          ▼                                                │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                    NAVIGATEUR (Frontend)                                 │
│                   Réception des updates                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  AI Player (ai-player.js)                                        │   │
│  │  handleWebSocketMessage()                                        │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  case 'cell_update':                                             │   │
│  │    ┌───────────────────────────────────────────────────────┐    │   │
│  │    │ Stockage en mémoire (JSON → Objet JS)                │    │   │
│  │    │                                                        │    │   │
│  │    │ this.otherUsers[user_id].recentUpdates.push({        │    │   │
│  │    │   x: message.sub_x,        // 10                     │    │   │
│  │    │   y: message.sub_y,        // 5                      │    │   │
│  │    │   color: message.color,    // "#3498DB"             │    │   │
│  │    │   timestamp: Date.now()                              │    │   │
│  │    │ });                                                   │    │   │
│  │    └───────────────────────────────────────────────────────┘    │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                          │                                                │
│                          │ Quand l'agent doit analyser                   │
│                          ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Spatial Analysis (spatial-analysis.js)                          │   │
│  │  analyzeNeighbors()                                              │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Agrégation pour le LLM (Objet JS → Format compact)             │   │
│  │                                                                   │   │
│  │  neighbors[dir] = {                                              │   │
│  │    pixel_count: 45,                                              │   │
│  │    recent_updates: [                                             │   │
│  │      {x: 10, y: 5, color: "#3498DB"},                           │   │
│  │      {x: 12, y: 8, color: "#E74C3C"}                            │   │
│  │    ],                                                             │   │
│  │    last_strategy: "je dessine un carré"                          │   │
│  │  }                                                                │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                          │                                                │
│                          │                                                │
│                          ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Ollama Adapter (ollama.js)                                      │   │
│  │  buildSystemPrompt()                                             │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Conversion en format compact pour économiser les tokens         │   │
│  │                                                                   │   │
│  │  const updateStr = updates.map(u =>                              │   │
│  │    `${u.x},${u.y}:${u.color}`  // Format compact !              │   │
│  │  ).join(' ');                                                     │   │
│  │                                                                   │   │
│  │  Résultat: "10,5:#3498DB 12,8:#E74C3C"                          │   │
│  │                                                                   │   │
│  │  Prompt envoyé au LLM:                                           │   │
│  │  "N: 45px total | Derniers changements: 10,5:#3498DB 12,8:..."  │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                          │                                                │
│                          │ HTTP POST (JSON)                              │
│                          ▼                                                │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                  SERVEUR PYTHON (AI Server)                              │
│                  (poietic_ai_server.py)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  POST /api/llm/ollama                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Reçoit: JSON avec prompt contenant format compact               │    │
│  │ {                                                                │    │
│  │   "model": "llama3.2:3b",                                        │    │
│  │   "messages": [{                                                 │    │
│  │     "role": "user",                                              │    │
│  │     "content": "VOISINS: N: 45px | 10,5:#3498DB 12,8:#E74C3C"  │    │
│  │   }]                                                             │    │
│  │ }                                                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                          │                                                │
│                          │ HTTP POST (JSON)                              │
│                          ▼                                                │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                    OLLAMA (OVH AI Deploy)                                │
│                    llama3.2:3b                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Le LLM lit le format compact dans le prompt:                            │
│  "10,5:#3498DB 12,8:#E74C3C"                                            │
│                                                                           │
│  Et génère une réponse JSON:                                             │
│  {                                                                        │
│    "strategy": "Je prolonge le motif bleu de mon voisin",               │
│    "pixels": [                                                            │
│      {"x": 10, "y": 6, "color": "#3498DB"},                             │
│      {"x": 11, "y": 6, "color": "#3498DB"}                              │
│    ]                                                                      │
│  }                                                                        │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │ Réponse (JSON)
                           ▼
                    (Remonte la chaîne)
```

---

## 📋 TABLEAU RÉCAPITULATIF DES FORMATS

| Étape | Composant | Format | Exemple | Raison |
|-------|-----------|--------|---------|--------|
| **1. Émission** | `ai-player.js` → Serveur Crystal | **JSON** | `{"type": "cell_update", "sub_x": 10, "sub_y": 5, "color": "#3498DB"}` | Standard WebSocket, interopérabilité |
| **2. Broadcast** | Serveur Crystal → Tous les clients | **JSON enrichi** | `{"type": "cell_update", "user_id": "abc123", "sub_x": 10, "sub_y": 5, "color": "#3498DB", "timestamp": 1234567890}` | Ajout métadonnées, traçabilité |
| **3. Stockage local** | `ai-player.js` (mémoire) | **Objet JS** | `{x: 10, y: 5, color: "#3498DB", timestamp: 1697123456}` | Structure native JavaScript |
| **4. Agrégation** | `spatial-analysis.js` | **Objet JS** | `{pixel_count: 45, recent_updates: [{x: 10, y: 5, color: "#3498DB"}], ...}` | Analyse spatiale |
| **5. Prompt LLM** | `ollama.js` → Prompt | **Format compact** | `"N: 45px \| 10,5:#3498DB 12,8:#E74C3C"` | **Économie de tokens** |
| **6. Requête API** | Frontend → AI Server | **JSON** | `{"model": "llama3.2:3b", "messages": [...]}` | Standard HTTP/REST |
| **7. Réponse LLM** | Ollama → AI Server | **JSON** | `{"strategy": "...", "pixels": [...]}` | Format structuré, parsable |

---

## 🔍 COMPARAISON DES FORMATS

### Format JSON (WebSocket)
```json
{
  "type": "cell_update",
  "user_id": "abc123",
  "sub_x": 10,
  "sub_y": 5,
  "color": "#3498DB",
  "timestamp": 1234567890
}
```
**Taille** : ~120 caractères  
**Usage** : Communication réseau, débogage, traçabilité  
**Avantages** : Structuré, typé, extensible, standard

### Format compact (Prompt LLM)
```
10,5:#3498DB
```
**Taille** : ~13 caractères  
**Usage** : Prompt LLM uniquement  
**Avantages** : **90% plus compact**, lisible par humain et LLM

### Économie de tokens
- **JSON** : `{"x": 10, "y": 5, "color": "#3498DB"}` = ~35 caractères
- **Compact** : `10,5:#3498DB` = ~13 caractères
- **Gain** : ~62% de réduction par pixel
- **Pour 20 updates × 8 voisins** : ~3500 caractères économisés par requête !

---

## 🎯 POINTS CLÉS

1. **Séparation des préoccupations** :
   - JSON pour la communication réseau (fiabilité, standard)
   - Format compact pour les prompts LLM (économie de tokens)

2. **Conversion unique** :
   - La conversion JSON → compact se fait **une seule fois** dans `ollama.js`
   - Pas de conversion inverse nécessaire (lecture seule par le LLM)

3. **Pas de perte d'information** :
   - Le format compact contient toutes les données nécessaires (x, y, color)
   - Le LLM n'a pas besoin des métadonnées (user_id, timestamp)

4. **Optimisation ciblée** :
   - Seul Ollama utilise le format compact (contexte limité à 8192 tokens)
   - Anthropic et OpenAI pourraient utiliser le JSON complet (contexte 200k+)

---

## 📊 FLUX DE DONNÉES SIMPLIFIÉ

```
Agent A dessine → JSON → Serveur → JSON → Agent B reçoit
                                              ↓
                                         Stocke en mémoire
                                              ↓
                                    Agrège pour analyse
                                              ↓
                                    Convertit en compact
                                              ↓
                                    Envoie au LLM
                                              ↓
                                    LLM lit et répond
                                              ↓
                                    Agent B dessine → JSON → ...
```

---

**Version** : 1.0  
**Date** : 2025-10-10  
**Auteur** : Olivier Auber & Claude Sonnet 4.5

