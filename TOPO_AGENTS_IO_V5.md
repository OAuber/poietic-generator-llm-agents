# TOPO COMPLET : Architecture des Agents IA - Entrées & Sorties (V5)

> **Date** : 10 décembre 2025  
> **Version** : 5.0  
> **Architecture** : O-N-W (Observation - Narration - World)

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [O-Machine (Observation)](#2-o-machine-observation)
3. [N-Machine (Narration)](#3-n-machine-narration)
4. [W-Machine (World/Action)](#4-w-machine-worldaction)
   - [Mode SEED](#4a-w-machine---mode-seed-itération-0)
   - [Mode ACTION](#4b-w-machine---mode-action-itérations-1)
5. [Stratégies Disponibles](#5-stratégies-disponibles-w-machine-action)
6. [Flux de Données Global](#6-flux-de-données-global)
7. [Système de Coordonnées](#7-système-de-coordonnées)
8. [Métriques de Simplicité](#8-métriques-de-simplicité)
9. [Endpoints API](#9-endpoints-api)
10. [Fichiers Sources](#10-fichiers-sources)

---

## 1. Vue d'ensemble

Le système Poietic Generator V5 utilise une architecture **O-N-W** basée sur la **théorie de la simplicité**, où trois types de machines IA collaborent autour du concept de **paréidolie** :

| Machine | Rôle | Type de Paréidolie | Localisation |
|---------|------|-------------------|--------------|
| **O-machine** | Observation | Paréidolies observationnelles | Serveur Python |
| **N-machine** | Narration | Paréidolies narratives | Serveur Python |
| **W-machine** | World/Action | Paréidolies actives | Client Browser |

### Concept Clé : La Paréidolie

> **Paréidolie** : Interprétation subjective de patterns visuels. Toutes les observations (O), narrations (N), et actions (W) sont des paréidolies - des interprétations subjectives, pas des vérités objectives.

### Métrique Centrale : U (Unexpectedness)

```
U = C_w - C_d
```

- **C_w** = Complexité de génération (bits) - difficulté pour produire la situation
- **C_d** = Complexité de description (bits) - longueur minimale pour décrire la scène
- **U** = Émergence - haut U signifie "complexe à générer mais simple à décrire"

---

## 2. O-Machine (Observation)

### 2.1 Localisation

| Élément | Chemin |
|---------|--------|
| Serveur | `python/poietic_ai_server_v5.py` (fonction `call_gemini_o`) |
| Prompt | `public/gemini-prompts-v5-observation.json` |

### 2.2 ENTRÉES

| Entrée | Type | Source | Description |
|--------|------|--------|-------------|
| `image_base64` | String (PNG base64) | POST `/o/image` | Image globale du canvas (tous les grids assemblés) |
| `agents_count` | Integer | POST `/o/agents` | Nombre d'agents actifs |
| `agent_positions` | Array `[[X,Y], ...]` | W-data store | Positions de tous les agents sur la grille globale |
| `previous_snapshot` | Object | Store interne | Snapshot précédent pour continuité |

#### Variables de Template Injectées

```
{{agents_count}}        → Nombre d'agents (ex: 9)
{{agent_positions}}     → Positions avec mapping visuel
{{strategies_reference}} → Référence aux stratégies formatée
```

#### Exemple de `{{agent_positions}}` (< 25 agents)

```
[0,0], [-1,0], [1,0], [0,-1], [0,1]
VISUAL MAPPING:
- CENTER: [0,0]
- TOP-LEFT (Y<0, X<0): [-1,-1]
- TOP-RIGHT (Y<0, X>=0): [0,-1], [1,-1]
- BOTTOM-LEFT (Y>=0, X<0): [-1,0], [-1,1]
- BOTTOM-RIGHT (Y>=0, X>=0): [0,0], [1,0], [0,1], [1,1]
```

#### Exemple de `{{agent_positions}}` (≥ 25 agents)

```
[0,0], [-1,0], [1,0], [-2,0], [2,0], ...
GRID SPAN: X=[-2 to 2], Y=[-2 to 2]. [0,0] is CENTER.
Find each position visually: X<0=left, X>0=right, Y<0=top, Y>0=bottom relative to center.
```

### 2.3 SORTIES

```json
{
  "structures": [
    {
      "type": "geometric pattern | ambiguous face/mask | aurora | ...",
      "size_agents": 2,
      "agent_positions": [[0,0], [1,0]],
      "rank_C_d": 1,
      "recognizability": "High | Medium | Low",
      "bounding_region": "center | top-left | ..."
    }
  ],
  "formal_relations": {
    "summary": "Analyse concise des relations entre structures (symétries, continuités, unités)"
  },
  "simplicity_assessment": {
    "C_d_current": {
      "value": 50,
      "description": "Description la plus courte rendant la scène unique (1-4 phrases)"
    }
  }
}
```

### 2.4 Règles de Validation O

| Règle | Description |
|-------|-------------|
| Positions valides uniquement | Seules les positions de `{{agent_positions}}` sont autorisées |
| Pas de chevauchement | Un agent ne peut appartenir qu'à UNE structure primaire |
| Structure vs Macro-structure | Structure = 1-2 agents, Macro-structure = 3+ agents |
| Vraie paréidolie | Requiert des RELATIONS entre structures (pas juste des formes isolées) |

### 2.5 Barèmes C_d

| Complexité | Range (bits) | Description |
|------------|--------------|-------------|
| Très simple | 30-50 | 1-2 formes isolées, pas de relations |
| Simple | 50-70 | 2-3 formes, relations minimales |
| Modéré | 70-110 | 3-5 formes, quelques relations |
| Complexe | 110-170 | 5-8 formes, relations multiples |
| Très complexe | 170-240 | 8+ formes, nombreuses relations, mosaïque |

---

## 3. N-Machine (Narration)

### 3.1 Localisation

| Élément | Chemin |
|---------|--------|
| Serveur | `python/poietic_ai_server_v5.py` (fonction `call_gemini_n`) |
| Prompt | `public/gemini-prompts-v5-narration.json` |

### 3.2 ENTRÉES

| Entrée | Type | Source | Description |
|--------|------|--------|-------------|
| `o_snapshot` | Object | Résultat O | Structures, formal_relations, C_d |
| `w_agents_data` | Object | Store W | Données de TOUS les agents W |
| `previous_snapshot` | Object | Store interne | Snapshot combiné précédent |

#### Structure des Données W par Agent

```json
{
  "agent_id": {
    "agent_id": "uuid-xxx",
    "position": [0, 0],
    "iteration": 3,
    "previous_iteration": 2,
    "strategy": "Form reproduction with neighbor",
    "rationale": "Copying neighbor's pattern to reduce C_d...",
    "predictions": {
      "individual_after_prediction": "Draw mirrored flower at coords...",
      "collective_after_prediction": "U should increase by +5 bits..."
    },
    "previous_predictions": {
      "individual_after_prediction": "Previous prediction...",
      "collective_after_prediction": "Previous collective pred..."
    },
    "pixels": ["0,0#FF0000", "1,1#00FF00", ...],
    "timestamp": "2025-12-10T12:34:56Z"
  }
}
```

#### Variables de Template Injectées

```
{{o_snapshot}}          → JSON du snapshot O complet
{{w_agents_data}}       → JSON des données W de tous les agents
{{previous_snapshot}}   → Snapshot précédent ou "null"
{{strategies_reference}} → Référence aux stratégies
```

### 3.3 SORTIES

```json
{
  "prediction_errors": {
    "agent_id_1": {
      "error": 0.3,
      "explanation": "Predicted local reinforcement but actually contributed to macro-structure"
    },
    "agent_id_2": {
      "error": 0.0,
      "explanation": "Accurately predicted U increase through form reproduction"
    }
  },
  "narrative": {
    "summary": "Récit narratif basé sur les paréidolies de O et les intentions des W"
  },
  "simplicity_assessment": {
    "C_w_current": {
      "value": 38
    }
  }
}
```

### 3.4 Échelle des Erreurs de Prédiction

| Plage | Interprétation |
|-------|----------------|
| 0.0 - 0.2 | Excellente prédiction |
| 0.2 - 0.4 | Bonne prédiction |
| 0.4 - 0.6 | Prédiction modérée |
| 0.6 - 0.8 | Mauvaise prédiction |
| 0.8 - 1.0 | Échec de prédiction |

### 3.5 Barèmes C_w

| Type | Bits | Description |
|------|------|-------------|
| Baseline | 20-25 | Point de départ |
| Structure simple | +15-20 | Par structure simple |
| Structure coordonnée | +20-30 | Par structure avec coordination inter-agents |
| Confrontation d'identités | +20-30 | Styles hybrides |
| Checkerboards | -10-15 | Pénalité pour motifs simples répétitifs |
| **Typique** | 25-45 | Plage normale |
| **Maximum** | ~60 | Complexité exceptionnelle |

---

## 4. W-Machine (World/Action)

### 4.1 Localisation

| Élément | Chemin |
|---------|--------|
| Client JS | `public/js/ai-player-v5.js` |
| Adapter LLM | `public/js/llm-adapters/gemini-v5.js` |
| Prompt Seed | `public/gemini-prompts-v5-seed.json` |
| Prompt Action | `public/gemini-prompts-v5-action.json` |

---

### 4a. W-Machine - Mode SEED (itération 0)

**But** : Planter une graine visuelle distinctive qui maximise C_w tout en gardant C_d bas.

#### ENTRÉES (Seed)

| Entrée | Type | Description |
|--------|------|-------------|
| `iteration` | Integer | Toujours `0` |
| (aucune image) | - | Le seed est **aveugle** - pas de contexte visuel |

#### Variables de Template (Seed)

```
{{iteration}} → 0
```

#### SORTIES (Seed)

```json
{
  "seed": {
    "concept": "portrait | animal | flower | geometric pattern | ...",
    "artistic_reference": "inspired by Byzantine mosaics | reminiscent of Japanese ukiyo-e | after Art Nouveau motifs | ...",
    "rationale": "Comment la technique de pixelisation traduit l'inspiration (max 15 mots)"
  },
  "predictions": {
    "individual_after_prediction": "Stratégie pour obtenir la forme, coordonnées/couleurs clés (max 30 mots)",
    "collective_after_prediction": "Comment le canvas global pourrait évoluer (max 15 mots)"
  },
  "pixels": ["0,0#FF0000", "0,1#FF1100", ..., "19,19#0000FF"]
}
```

#### Contraintes Seed

| Contrainte | Description |
|------------|-------------|
| **400 pixels** | Remplir TOUTE la grille 20×20 |
| **8-12 couleurs** | 2-3 familles avec 3-5 nuances chacune |
| **Éviter bicolore** | Pas de patterns noir/blanc simples |
| **Haute C_w** | Formes complexes à générer (proportions, patterns reconnaissables) |
| **Basse C_d** | Simple à décrire (concept nommable) |

---

### 4b. W-Machine - Mode ACTION (itérations 1+)

**But** : Agir sur le canvas pour maximiser U (= C_w - C_d) avec une prédiction précise de l'impact.

#### ENTRÉES (Action)

##### Images

| Entrée | Type | Description |
|--------|------|-------------|
| `globalImageBase64` | PNG base64 | Image globale du canvas entier |
| `localImageBase64` | PNG base64 | Image locale de la grille 20×20 avec overlay |

##### Contexte O+N Snapshot

| Entrée | Type | Description |
|--------|------|-------------|
| `narrative` | String | Narrative de N |
| `C_w` | Number | Complexité de génération actuelle |
| `C_d` | Number | Complexité de description actuelle |
| `U` | Number | Unexpectedness (C_w - C_d) |
| `interpretation` | String | WEAK/MODERATE/STRONG/EXCEPTIONAL_EMERGENCE |

##### Personnel

| Entrée | Type | Description |
|--------|------|-------------|
| `myX`, `myY` | Integer | Position de l'agent sur la grille globale |
| `colorPalette` | String | Pixels actuels de l'agent |
| `neighbor_colors` | Array | Couleurs des voisins immédiats |
| `prevPredictions` | Object | Prédictions de l'itération précédente |
| `prediction_error` | Number | Erreur de prédiction personnelle (de N) |
| `strategy_history` | Array | Historique des 50 dernières stratégies |
| `artistic_identity` | Object | Identité artistique établie au seed |

##### Rankings

| Entrée | Type | Description |
|--------|------|-------------|
| `agent_rankings` | Object | Classement de tous les agents |
| `my_rank` | Integer | Rang personnel (1 = meilleur) |
| `my_avg_error` | Number | Erreur moyenne cumulative |
| `total_agents` | Integer | Nombre total d'agents |

##### Paramètres de Stratégie

| Entrée | Type | Défaut | Description |
|--------|------|--------|-------------|
| `strategy_u_threshold` | Number | 70 | Seuil U pour stratégies avancées |
| `strategy_rank_divisor` | Number | 2 | Diviseur rang (rank > total/divisor = safe) |
| `strategy_error_threshold` | Number | 0.5 | Seuil erreur pour stratégies safe |

#### Variables de Template (Action)

```
{{myX}}, {{myY}}                     // Position de l'agent [0,0]
{{iteration}}                         // Numéro d'itération (1, 2, 3...)
{{colorPalette}}                      // "0,0#FF0000, 1,0#FF1100, ..."
{{neighbor_colors}}                   // Couleurs des voisins formatées
{{narrative}}                         // "A luminous aurora connects..."
{{C_w}}, {{C_d}}, {{U}}              // Métriques (38, 25, 13)
{{interpretation}}                    // "STRONG_EMERGENCE"
{{prevPredictions}}                   // JSON des prédictions précédentes
{{prediction_error}}                  // 0.15
{{strategies_reference}}              // Liste des stratégies formatée
{{strategy_history}}                  // "iter1: bg_share, iter2: form_copy"
{{artistic_identity}}                 // Identité du seed
{{agent_rankings}}                    // Top 5 + position personnelle
{{my_rank}}, {{my_avg_error}}, {{total_agents}}
{{strategy_u_threshold}}              // 70
{{strategy_rank_divisor}}             // 2
{{strategy_error_threshold}}          // 0.5
```

#### Exemple de `{{neighbor_colors}}`

```
🎨 NEIGHBOR COLORS (for reference - use if coordinating):
- NORTH at [-1,0]: #1E3A8A, #3B82F6, #60A5FA
- EAST at [0,1]: #4ADE80, #22C55E, #166534
- SOUTH at [1,0]: #F97316, #EA580C, #C2410C

⚠️ NOTE: Use ONLY if strategic coordination. Do NOT copy systematically.
```

#### Exemple de `{{agent_rankings}}`

```
AGENT RANKING (Prediction Accuracy Competition):
Agents ranked by cumulative average prediction error (lower = better).

TOP PREDICTORS (best sources for inspiration):
Rank 1: [0,1] err=0.05, Rank 2: [-1,0] err=0.12, Rank 3: [1,1] err=0.18

YOU: Rank 4/9, err=0.23, iter=5
```

#### SORTIES (Action)

```json
{
  "strategy": "Extend neighbor's background with smooth gradient (max 15 mots)",
  "strategy_id": "bg_immediate_extend",
  "strategy_ids": ["bg_immediate_share", "form_copy_reproduction"],
  "source_agents": [[0,1], [-1,0]],
  "rationale": "Copying top predictor's background to create macro-structure (max 25 mots)",
  "delta_complexity": {
    "delta_C_w_bits": 6,
    "delta_C_d_bits": -5,
    "U_after_expected": 24
  },
  "predictions": {
    "individual_after_prediction": "Draw gradient from #1E3A8A (top) to #3B82F6 (bottom), preserve central flower motif (max 30 mots)",
    "collective_after_prediction": "U increase +11 bits through macro-structure formation (max 25 mots)"
  },
  "pixels": ["0,0#1E3A8A", "0,1#2044A0", ..., "19,19#60A5FA"]
}
```

---

## 5. Stratégies Disponibles (W-Machine Action)

Les stratégies sont chargées dynamiquement selon le contexte :
- **Safe** (`strategies-v5-safe.json`) : Si U < seuil OU rang mauvais OU erreur haute
- **Advanced** (`strategies-v5-advanced.json`) : Sinon

### 5.1 Stratégies FACILES ⭐ (Prioritaires pour améliorer le ranking)

| ID | Nom | Erreur | Difficulté | ΔC_w | ΔC_d | ΔU |
|----|-----|--------|------------|------|------|-----|
| `form_copy_reproduction` | Reproduction exacte (translation/miroir) | 0.0 | easy | +2 | -8 | +10 |
| `bg_immediate_share` | Partage background voisin immédiat | 0.1 | easy | +4 | -5 | +9 |
| `bg_immediate_extend` | Extension background avec nuances | 0.1 | easy | +6 | -5 | +11 |
| `disappear` | Fusion dans le fond unifié des voisins | 0.1 | easy | +1 | -5 | +6 |

### 5.2 Stratégies MOYENNES

| ID | Nom | Erreur | Difficulté | ΔC_w | ΔC_d | ΔU |
|----|-----|--------|------------|------|------|-----|
| `pareidolia_alignment` | Alignement avec VRAIES paréidolies O/N | 0.12 | medium | +9 | -7 | +16 |
| `bg_multi_fusion` | Fusion multi-sources | 0.15 | hard | +10 | -7 | +17 |
| `bg_distant_share` | Partage avec agent distant | 0.15 | medium | +5 | -4 | +9 |
| `bg_distant_multi` | Partage multi-agents distants | 0.15 | medium | +8 | -6 | +14 |

### 5.3 Stratégies DIFFICILES

| ID | Nom | Erreur | Difficulté | ΔC_w | ΔC_d | ΔU |
|----|-----|--------|------------|------|------|-----|
| `identity_confrontation` | Confrontation/fusion d'identités | 0.2 | very_hard | +15 | -6 | +21 |
| `form_immediate_imitate` | Imitation forme voisin | 0.2 | medium | +7 | -4 | +11 |
| `form_immediate_bridge` | Pont avec voisin (tête→cou, etc.) | 0.2 | hard | +8 | -5 | +13 |
| `form_immediate_complement` | Complément (chat→souris, etc.) | 0.25 | hard | +10 | -5 | +15 |
| `form_distant_imitate` | Imitation forme agent distant | 0.25 | hard | +8 | -4 | +12 |

### 5.4 Stratégies TRÈS DIFFICILES

| ID | Nom | Erreur | Difficulté | ΔC_w | ΔC_d | ΔU |
|----|-----|--------|------------|------|------|-----|
| `aha_effect` | Effet Aha! (pixels précis → reconnaissance) | 0.3 | very_hard | +15 | -12 | +27 |
| `form_distant_complement` | Complément avec agent distant | 0.3 | hard | +12 | -5 | +17 |
| `pareidolia_contestation` | Contester O/N (proposer alternative) | 0.4 | very_hard | +12 | -8 | +20 |

### 5.5 Combinaisons de Stratégies

Les agents peuvent combiner des stratégies compatibles :

```json
{
  "strategy_ids": ["bg_immediate_share", "form_copy_reproduction"],
  "delta_complexity": {
    "delta_C_w_bits": 6,
    "delta_C_d_bits": -13,
    "U_after_expected": 32
  }
}
```

---

## 6. Flux de Données Global

```
                              ┌─────────────────┐
                              │  CANVAS GLOBAL  │
                              │ (image PNG)     │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
     ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
     │   W-Machine 1  │      │   W-Machine 2  │      │   W-Machine N  │
     │   (Browser)    │      │   (Browser)    │      │   (Browser)    │
     └───────┬────────┘      └───────┬────────┘      └───────┬────────┘
             │                       │                       │
             │  POST /n/w-data       │                       │
             │  {strategy, pixels,   │                       │
             │   predictions}        │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   SERVEUR PYTHON      │
                         │   port 8005           │
                         │                       │
                         │  ┌─────────────────┐  │
    POST /o/image ──────▶│  │   O-Machine     │  │
    {image, agents_count}│  │                 │  │
                         │  │ → structures    │  │
                         │  │ → C_d           │  │
                         │  │ → relations     │  │
                         │  └────────┬────────┘  │
                         │           │           │
                         │           ▼           │
                         │  ┌─────────────────┐  │
                         │  │   N-Machine     │  │
                         │  │                 │  │
                         │  │ → narrative     │  │
                         │  │ → C_w           │  │
                         │  │ → pred_errors   │  │
                         │  │ → rankings      │  │
                         │  └────────┬────────┘  │
                         └───────────┼───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │  SNAPSHOT O+N COMBINÉ │
                         │                       │
                         │  • structures         │
                         │  • formal_relations   │
                         │  • narrative          │
                         │  • C_w, C_d, U        │
                         │  • prediction_errors  │
                         │  • agent_rankings     │
                         │  • machine_metrics    │
                         └───────────┬───────────┘
                                     │
                                     │ GET /o/latest?agent_id=xxx
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
     ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
     │   W-Machine 1  │     │   W-Machine 2  │     │   W-Machine N  │
     │   (action)     │     │   (action)     │     │   (action)     │
     │                │     │                │     │                │
     │ → new pixels   │     │ → new pixels   │     │ → new pixels   │
     │ → WebSocket    │     │ → WebSocket    │     │ → WebSocket    │
     └────────────────┘     └────────────────┘     └────────────────┘
```

### Cycle Temporel

1. **Seed** (iter 0) : Chaque W génère 400 pixels aveuglement
2. **Warmup** : Serveur attend 75% des agents (max 60s)
3. **O-Analysis** : Image → structures + C_d
4. **N-Analysis** : O + W-data → narrative + C_w + errors + rankings
5. **Snapshot** : Combinaison O+N disponible via `/o/latest`
6. **Action** (iter 1+) : W récupère snapshot → génère nouveaux pixels
7. **Quiescence** : Serveur attend stabilisation (5-6s sans update)
8. **Retour à étape 3**

---

## 7. Système de Coordonnées

### 7.1 Coordonnées Globales (pour O et N)

```
                    Y négatif (haut)
                         ↑
                         │
         [-1,-1]   [0,-1]   [1,-1]
                         │
    X    [-1,0] ── [0,0] ── [1,0]    X
  négatif         (CENTRE)         positif
  (gauche)               │          (droite)
         [-1,1]    [0,1]    [1,1]
                         │
                         ↓
                    Y positif (bas)
```

- `[0,0]` = **CENTRE** du canvas
- `X < 0` = gauche, `X > 0` = droite
- `Y < 0` = haut, `Y > 0` = bas
- Chaque position = grille 20×20 pixels (100×100px visuel avec zoom)

### 7.2 Coordonnées Locales (pour W)

```
     0   1   2   ...  19
   ┌───┬───┬───┬───┬───┐
 0 │0,0│1,0│2,0│...│19,0│
   ├───┼───┼───┼───┼───┤
 1 │0,1│1,1│2,1│...│19,1│
   ├───┼───┼───┼───┼───┤
 : │ : │ : │ : │   │ : │
   ├───┼───┼───┼───┼───┤
19 │0,19│1,19│...│...│19,19│
   └───┴───┴───┴───┴───┘
```

- `(0,0)` = coin **haut-gauche**
- `(19,19)` = coin **bas-droit**
- Format pixel : `"x,y#RRGGBB"` (ex: `"5,10#FF0000"`)

---

## 8. Métriques de Simplicité

### 8.1 Formules

| Métrique | Calculé par | Formule | Description |
|----------|-------------|---------|-------------|
| **C_d** | O-machine | Estimation LLM | Longueur minimale de description (bits) |
| **C_w** | N-machine | Estimation LLM | Paramètres pour générer la situation (bits) |
| **U** | Serveur | C_w - C_d | Unexpectedness / Émergence (bits) |

### 8.2 Interprétation de U

| Plage | Interprétation | Description |
|-------|----------------|-------------|
| U < 0 | NO_EMERGENCE | Plus simple à générer qu'à décrire |
| 0 ≤ U < 6 | WEAK_EMERGENCE | Faible émergence |
| 6 ≤ U < 11 | MODERATE_EMERGENCE | Émergence modérée |
| 11 ≤ U < 16 | STRONG_EMERGENCE | Forte émergence |
| U ≥ 16 | EXCEPTIONAL_EMERGENCE | Émergence exceptionnelle |

### 8.3 Machine Metrics (Token-based)

Le serveur calcule aussi des métriques basées sur les tokens :

```json
{
  "machine_metrics": {
    "C_d_machine": {
      "value": 120.0,
      "tokens": 30,
      "factor": 4.0
    },
    "C_w_machine": {
      "value": 200.0,
      "tokens": 50,
      "factor": 4.0
    },
    "U_machine": {
      "value": 80.0
    }
  }
}
```

---

## 9. Endpoints API

### 9.1 Serveur Python (port 8005)

| Endpoint | Méthode | Description | Payload/Params |
|----------|---------|-------------|----------------|
| `/o/latest` | GET | Snapshot O+N combiné | `?agent_id=xxx` (optionnel) |
| `/o/image` | POST | Envoyer image canvas | `{image_base64, agents_count}` |
| `/o/image` | GET | Récupérer dernière image | - |
| `/o/agents` | POST | Mettre à jour agents | `{count}` |
| `/n/w-data` | POST | Envoyer données W | `{agent_id, position, strategy, ...}` |
| `/n/w-data` | GET | Récupérer W-data (debug) | - |

### 9.2 Serveur de Métriques (port 5005)

WebSocket `/metrics` pour streaming des snapshots O/N en temps réel.

---

## 10. Fichiers Sources

### Prompts

| Fichier | Machine | Mode |
|---------|---------|------|
| `public/gemini-prompts-v5-seed.json` | W | Seed (iter 0) |
| `public/gemini-prompts-v5-action.json` | W | Action (iter 1+) |
| `public/gemini-prompts-v5-observation.json` | O | Observation |
| `public/gemini-prompts-v5-narration.json` | N | Narration |

### Stratégies

| Fichier | Description |
|---------|-------------|
| `public/strategies-v5.json` | Toutes les stratégies (référence) |
| `public/strategies-v5-safe.json` | Stratégies faciles (erreur ≤ 0.1) |
| `public/strategies-v5-advanced.json` | Stratégies avancées (erreur > 0.1) |

### Code

| Fichier | Description |
|---------|-------------|
| `python/poietic_ai_server_v5.py` | Serveur O+N (FastAPI) |
| `python/metrics_server_v5.py` | Serveur métriques (WebSocket) |
| `public/js/ai-player-v5.js` | Client W-machine |
| `public/js/llm-adapters/gemini-v5.js` | Adapter Gemini pour W |

---

## Annexe : Exemple Complet de Snapshot O+N

```json
{
  "version": 42,
  "timestamp": "2025-12-10T14:30:00Z",
  "structures": [
    {
      "type": "luminous aurora",
      "size_agents": 3,
      "agent_positions": [[0,0], [1,0], [0,1]],
      "rank_C_d": 1,
      "recognizability": "High",
      "bounding_region": "center-right"
    },
    {
      "type": "geometric flower",
      "size_agents": 2,
      "agent_positions": [[-1,0], [-1,1]],
      "rank_C_d": 2,
      "recognizability": "Medium",
      "bounding_region": "left"
    }
  ],
  "formal_relations": {
    "summary": "Aurora and flower share gradient continuity, creating east-west visual flow"
  },
  "narrative": {
    "summary": "A luminous aurora emerges from the collaboration of three central agents, while a geometric flower blooms in the west, both connected by subtle gradient transitions."
  },
  "prediction_errors": {
    "agent-uuid-1": {"error": 0.05, "explanation": "Accurate U prediction through form reproduction"},
    "agent-uuid-2": {"error": 0.23, "explanation": "Overestimated C_d reduction"},
    "agent-uuid-3": {"error": 0.0, "explanation": "Perfect prediction with bg_share"}
  },
  "agent_rankings": {
    "agent-uuid-1": {"rank": 2, "avg_error": 0.08, "total_iterations": 5, "position": [0,0]},
    "agent-uuid-2": {"rank": 3, "avg_error": 0.18, "total_iterations": 5, "position": [1,0]},
    "agent-uuid-3": {"rank": 1, "avg_error": 0.02, "total_iterations": 5, "position": [0,1]}
  },
  "simplicity_assessment": {
    "C_w_current": {"value": 45},
    "C_d_current": {"value": 32, "description": "Luminous aurora connecting three grids with geometric flower in the west"},
    "U_current": {"value": 13, "interpretation": "STRONG_EMERGENCE"}
  },
  "agents_count": 9,
  "machine_metrics": {
    "C_d_machine": {"value": 128.0, "tokens": 32, "factor": 4.0},
    "C_w_machine": {"value": 180.0, "tokens": 45, "factor": 4.0},
    "U_machine": {"value": 52.0}
  }
}
```

---

> **Note** : Ce document décrit l'architecture V5 au 10 décembre 2025. Les fichiers de référence sont dans le dépôt `poietic-generator-api`.

