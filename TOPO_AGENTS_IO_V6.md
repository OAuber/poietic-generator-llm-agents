# Topologie des Agents IA - Version 6 "Quantique"

## Vue d'ensemble

La V6 "Quantique" introduit une nouvelle terminologie et métaphorique basée sur la physique quantique. Le système est désormais une **Q-machine** (machine quantique) où chaque W-instance est une "fente" dans un appareil de diffraction multi-fentes.

### Cycle Q-machine

```
Ss → O → N → Ws → O → N → Ws → ...
```

- **S-machines** : Générateurs d'états quantiques initiaux (seed)
- **O-machine** : Appareil de mesure quantique (observation)
- **N-machine** : Interprète narratif quantique (narration)
- **W-machines** : Opérateurs d'évolution quantique (action)

### Métriques Quantiques

| Métrique | Description | Plage |
|----------|-------------|-------|
| **φ-coherence** | Alignement de phase entre W-instances | 0.0-1.0 |
| **ξ-correlation** | Longueur de corrélation spatiale | 0.0-∞ (unités grille) |
| **I-visibility** | Visibilité des franges d'interférence | 0.0-1.0 |
| **τ-condensation** | Métrique de condensat Bose-Einstein | 0.0-1.0 |
| **ΔS-entropy** | Production d'entropie von Neumann | -∞ à +∞ |

### Formule de Condensation

```
τ = (φ × ξ) / √n
```

où `n` = nombre d'agents.

---

## Architecture des Serveurs V6

### Ports

| Service | Port | Description |
|---------|------|-------------|
| Serveur Principal | 8000 | Poietic Generator (existant) |
| Serveur O+N Quantique | **8006** | `poietic_ai_server_v6.py` |
| Serveur Métriques | **5006** | `metrics_server_v6.py` |

### Endpoints API (Port 8006)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/q/latest` | GET | Dernier snapshot quantique O+N |
| `/q/latest?agent_id=X` | GET | Snapshot personnalisé pour agent X |
| `/q/coherence` | GET | Observables de cohérence actuels |
| `/q/coherence-history` | GET | Historique des cohérences |
| `/q/image` | POST/GET | Image du canvas global |
| `/q/agents` | POST | Mise à jour du nombre d'agents |
| `/q/w-data` | POST/GET | Données des W-instances |

---

## S-Machine (Seed)

### Rôle
Génère l'état quantique initial (Ψ₀) pour une nouvelle W-instance.

### Fichier Prompt
`public/gemini-prompts-v6-seed.json`

### Variables du Prompt

| Variable | Description |
|----------|-------------|
| `{{iteration}}` | Toujours 0 pour seed |
| `{{total_agents}}` | Nombre total de fentes |
| `{{myX}}, {{myY}}` | Position de la fente |

### Format de Sortie JSON

```json
{
  "seed": {
    "concept": "Phoenix émergent",
    "artistic_reference": "inspiré des mosaïques byzantines",
    "rationale": "Encodage en base 20×20 avec dégradés de feu..."
  },
  "quantum_measures": {
    "psi_distinctiveness": 0.85,
    "eta_potential": 0.70,
    "lambda_coherence": 0.92,
    "justification": "État unique avec capacité d'intrication..."
  },
  "predictions": {
    "individual_after_prediction": "Extension des ailes vers le nord...",
    "collective_after_prediction": "Contribution à Ψ₀ avec interférence constructive..."
  },
  "pixels": ["0,0#FF4400", "1,0#FF5500", ...]
}
```

### Mesures Quantiques Seed

| Mesure | Description | Plage |
|--------|-------------|-------|
| **Ψ-distinctiveness** | Unicité de la contribution | 0.0-1.0 |
| **η-potential** | Potentiel d'intrication | 0.0-1.0 |
| **λ-coherence** | Cohérence interne | 0.0-1.0 |

---

## O-Machine (Observation)

### Rôle
Appareil de mesure quantique qui "collapse" la fonction d'onde Ψ(t) en états propres observables.

### Fichier Prompt
`public/gemini-prompts-v6-observation.json`

### Variables du Prompt

| Variable | Description |
|----------|-------------|
| `{{agents_count}}` | Nombre de fentes |
| `{{agent_positions}}` | Positions de toutes les fentes |
| `{{strategies_reference}}` | Référence des unitaires |

### Entrées

| Entrée | Description |
|--------|-------------|
| **Image raster** | Canvas global (interférence) |
| **Positions agents** | Géométrie multi-fentes |

### Format de Sortie JSON

```json
{
  "structures": [
    {
      "type": "aurore cohérente",
      "size_agents": 3,
      "agent_positions": [[0,0], [1,0], [0,1]],
      "rank_C_d": 1,
      "recognizability": "High",
      "bounding_region": "center",
      "interference_type": "constructive"
    }
  ],
  "formal_relations": {
    "summary": "Relations de phase: symétrie axiale, continuité des gradients..."
  },
  "coherence_observables": {
    "phi_coherence": 0.75,
    "xi_correlation_length": 2.5,
    "I_fringe_visibility": 0.68,
    "justification": "Franges d'interférence visibles entre 3 fentes..."
  },
  "simplicity_assessment": {
    "C_d_current": {
      "value": 45,
      "description": "État propre collapsé: aurore tridimensionnelle..."
    }
  }
}
```

### Types d'Interférence

| Type | Description | Impact |
|------|-------------|--------|
| `constructive` | Franges brillantes | φ > 0.6 |
| `destructive` | Franges sombres | φ < 0.3 |
| `mixed` | Mélange | 0.3 ≤ φ ≤ 0.6 |

---

## N-Machine (Narration)

### Rôle
Interprète les mesures de O et les intentions de W pour produire un récit quantique.

### Fichier Prompt
`public/gemini-prompts-v6-narration.json`

### Variables du Prompt

| Variable | Description |
|----------|-------------|
| `{{o_snapshot}}` | Résultat O (états propres, φ, ξ, I, C_d) |
| `{{w_agents_data}}` | Données W (stratégies, prédictions) |
| `{{previous_snapshot}}` | Historique quantique |
| `{{strategies_reference}}` | Référence des unitaires |

### Format de Sortie JSON

```json
{
  "prediction_errors": {
    "agent_id_1": {
      "error": 0.25,
      "explanation": "Prédit ΔU=+12, mesuré ΔU=+8..."
    }
  },
  "narrative": {
    "summary": "L'aurore centrale condense les contributions de trois fentes..."
  },
  "simplicity_assessment": {
    "C_w_current": {
      "value": 42
    }
  },
  "emergence_observables": {
    "tau_condensation": 0.68,
    "delta_S_entropy": -3.2,
    "justification": "Régime quasi-BEC avec verrouillage de phase..."
  }
}
```

### Échelle d'Erreur de Prédiction

| Plage | Interprétation |
|-------|----------------|
| 0.0-0.2 | Excellente (intuition quantique) |
| 0.2-0.4 | Bonne |
| 0.4-0.6 | Modérée |
| 0.6-0.8 | Mauvaise |
| 0.8-1.0 | Échec (pensée classique) |

---

## W-Machine (Action)

### Rôle
Opérateur d'évolution quantique (unitaire) qui fait évoluer la fonction d'onde.

### Fichier Prompt
`public/gemini-prompts-v6-action.json`

### Variables du Prompt

| Variable | Description |
|----------|-------------|
| `{{iteration}}` | Numéro d'itération (> 0) |
| `{{myX}}, {{myY}}` | Position de la fente |
| `{{total_agents}}` | Nombre de fentes |
| `{{colorPalette}}` | Amplitudes actuelles |
| `{{neighbor_colors}}` | Amplitudes voisines |
| `{{narrative}}` | Récit N actuel |
| `{{phi_coherence}}` | Cohérence de phase |
| `{{xi_correlation}}` | Corrélation spatiale |
| `{{I_visibility}}` | Visibilité franges |
| `{{tau_condensation}}` | Métrique BEC |
| `{{C_w}}, {{C_d}}, {{U}}` | Métriques de simplicité |
| `{{prevPredictions}}` | Prédictions précédentes |
| `{{prediction_error}}` | Erreur dernière prédiction |
| `{{agent_rankings}}` | Classement des prédicteurs |
| `{{my_rank}}, {{my_avg_error}}` | Mon rang et erreur moyenne |
| `{{strategies_reference}}` | Unitaires disponibles |
| `{{strategy_history}}` | Historique de mes stratégies |

### Détection du Régime Quantique

```javascript
if (phi < 0.4 || U < threshold || rank > total/2 || avg_error > 0.5) {
  // RÉGIME DÉCOHÉRENT → Unitaires safe
} else {
  // RÉGIME QUANTIQUE → Unitaires cohérents
}
```

### Format de Sortie JSON

```json
{
  "strategy": "Multi-slit interference avec [0,0] et [1,0]",
  "strategy_id": "multi_slit_interference",
  "strategy_ids": ["multi_slit_interference"],
  "source_agents": [[0,0], [1,0]],
  "rationale": "Superposition des amplitudes pour franges constructives...",
  "delta_complexity": {
    "delta_C_w_bits": 10,
    "delta_C_d_bits": -7,
    "U_after_expected": 25,
    "delta_phi_coherence": 0.22,
    "delta_tau_condensation": 0.15
  },
  "predictions": {
    "individual_after_prediction": "Configuration d'amplitude à coordonnées [5,5]...",
    "collective_after_prediction": "φ augmente de +0.22, U passe à 25..."
  },
  "pixels": ["0,0#FF0000", "5,10#00FF00", ...]
}
```

---

## Stratégies Quantiques

### Fichiers de Stratégies

| Fichier | Usage |
|---------|-------|
| `strategies-v6-quantum.json` | Ensemble complet |
| `strategies-v6-decoherence.json` | Régime décohérent (φ < 0.4) |
| `strategies-v6-coherent.json` | Régime cohérent (φ ≥ 0.4) |

### Stratégies Safe (Régime Décohérent)

| ID | Nom | Δφ | Erreur |
|----|-----|-----|--------|
| `amplitude_clone` | Clonage d'amplitude | +0.15 | 0.0 |
| `phase_lock_neighbor` | Verrouillage de phase voisin | +0.20 | 0.1 |
| `phase_gradient_extend` | Extension gradient de phase | +0.18 | 0.1 |
| `ground_state_merge` | Fusion état fondamental | +0.10 | 0.1 |

### Stratégies Cohérentes (Régime Quantique)

| ID | Nom | Δφ | Erreur |
|----|-----|-----|--------|
| `eigenstate_alignment` | Alignement états propres | +0.25 | 0.12 |
| `multi_slit_interference` | Interférence multi-fentes | +0.22 | 0.15 |
| `distant_phase_lock` | Verrouillage phase distant | +0.12 | 0.15 |
| `wavefunction_collapse_revival` | Collapse et revival | +0.08 | 0.2 |

### Stratégies Avancées

| ID | Nom | Δφ | Erreur |
|----|-----|-----|--------|
| `quantum_tunneling_recognition` | Effet tunnel (Aha!) | +0.05 | 0.3 |
| `superposition_proposal` | Proposition superposition | +0.20 | 0.4 |

---

## Flux de Données Complet

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Q-MACHINE CYCLE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   S-MACHINES (Iteration 0)                                               │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Quantum Seed Generation                       │   │
│   │  Input: Position [X,Y]                                           │   │
│   │  Output: pixels[], quantum_measures{ψ,η,λ}, predictions{}        │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     O-MACHINE (Measurement)                      │   │
│   │  Input: Raster image (global interference)                       │   │
│   │  Output: structures[], coherence_observables{φ,ξ,I}, C_d         │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    N-MACHINE (Interpretation)                    │   │
│   │  Input: O-snapshot, W-data, previous_snapshot                    │   │
│   │  Output: prediction_errors{}, narrative, C_w, emergence{τ,ΔS}   │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │               COMBINED QUANTUM SNAPSHOT                          │   │
│   │  {structures, coherence_observables, narrative,                  │   │
│   │   prediction_errors, agent_rankings, emergence_observables,      │   │
│   │   simplicity_assessment{C_w,C_d,U}}                              │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│   W-MACHINES (Iteration > 0)                                             │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                 Quantum Evolution Operators                      │   │
│   │  Input: Snapshot, images, context{φ,τ,U,rankings}               │   │
│   │  Output: strategy, delta_complexity{Δφ,Δτ}, pixels[]            │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│                         (Cycle repeats O → N → Ws → ...)                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Régimes Quantiques

### Indicateurs de Régime

| Régime | φ | τ | Interprétation |
|--------|---|---|----------------|
| **DECOHERENCE** | < 0.3 | < 0.2 | Classique, pas d'interférence |
| **PARTIAL_COHERENCE** | 0.3-0.6 | 0.2-0.4 | Interférence partielle |
| **QUANTUM_COHERENT** | 0.6-0.8 | 0.4-0.6 | Cohérence forte |
| **BOSE_EINSTEIN_CONDENSATE** | > 0.8 | > 0.8 | Tous Ws en état fondamental commun |

### Objectif Ultime

Atteindre le régime **Bose-Einstein** où toutes les W-instances partagent le même état quantique fondamental (τ ≈ 1.0), maximisant U tout en maintenant φ ≈ 1.0.

---

## Fichiers V6

### Prompts
- `public/gemini-prompts-v6-seed.json`
- `public/gemini-prompts-v6-observation.json`
- `public/gemini-prompts-v6-narration.json`
- `public/gemini-prompts-v6-action.json`

### Stratégies
- `public/strategies-v6-quantum.json`
- `public/strategies-v6-decoherence.json`
- `public/strategies-v6-coherent.json`

### Serveurs Python
- `python/poietic_ai_server_v6.py` (port 8006)
- `python/metrics_server_v6.py` (port 5006)

### Client JavaScript
- `public/js/llm-adapters/gemini-v6.js`
- `public/js/ai-player-v6.js`

### Interfaces HTML
- `public/ai-player-v6.html`
- `public/ai-metrics-v6.html`

---

## Démarrage V6

```bash
# Terminal 1: Serveur principal
python -m poietic_generator_server

# Terminal 2: Serveur O+N quantique
python python/poietic_ai_server_v6.py

# Terminal 3: Serveur métriques quantique
python python/metrics_server_v6.py

# Accès web
# Player: http://localhost:8000/ai-player-v6.html
# Metrics: http://localhost:8000/ai-metrics-v6.html
```

---

## Différences V5 vs V6

| Aspect | V5 | V6 |
|--------|----|----|
| **Terminologie** | Pareidolia | Quantique |
| **Métriques clés** | C_w, C_d, U | φ, ξ, τ, I + C_w, C_d, U |
| **Objectif** | Maximiser U | Atteindre condensat BEC |
| **Stratégies** | Pareidolia alignment | Eigenstate alignment |
| **Port O+N** | 8005 | 8006 |
| **Port Metrics** | 5005 | 5006 |
| **Régimes** | Simple/Complex | Decoherence/Coherent/BEC |

