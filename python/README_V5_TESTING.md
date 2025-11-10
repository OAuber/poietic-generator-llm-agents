# Guide de Test V5 - Architecture O-N-W

## Vue d'ensemble

La V5 introduit une nouvelle architecture à 3 machines :

- **O-machine** (Observation): Identifie structures, relations formelles, calcule C_d
- **N-machine** (Narration): Synthétise narrative, évalue erreurs prédiction, calcule C_w
- **W-machines** (World): Génèrent pixels basés sur O+N snapshot

## Démarrage V5

### 1. Démarrer le serveur O-N (Python)

```bash
cd /home/oa/poietic-generator-api
export GEMINI_API_KEY='votre_clef_api_gemini'
python3 python/poietic_ai_server_v5.py
```

Le serveur démarre sur **port 8005** (différent de V4 qui utilise 8004).

### 2. Démarrer le serveur Poietic Generator (Node.js)

```bash
cd /home/oa/poietic-generator-api
node api.js
```

Le serveur WebSocket démarre sur **port 3000**.

### 3. Ouvrir le client V5

Ouvrir dans le navigateur :

```
http://localhost:3000/ai-player-v5.html
```

Configurer la clé API Gemini dans l'interface (Config -> API Key).

## Scénarios de test

### Test 1 : Un seul agent (validation flux O→N→W)

**Objectif**: Vérifier que le flux complet O→N→W fonctionne.

**Étapes**:
1. Ouvrir un client V5
2. Entrer la clé API Gemini
3. Cliquer "Start"
4. Observer l'onglet **Verbatim**:
   - Iter 0 (Seed): W génère un seed artistique
   - Iter 1+: O identifie structures, N génère narrative et C_w, W reçoit O+N
5. Observer l'onglet **Metrics**:
   - Graphique O: C_w (de N), C_d (de O), U
   - Graphique W: évolution locale
   - Graphique Prediction Errors: my_error, mean_error, std_error

**Validation**:
- ✅ O identifie correctement le nombre d'agents (1)
- ✅ O identifie des structures (au moins 1 après seed)
- ✅ N génère une narrative cohérente
- ✅ N calcule C_w basé sur sophistication de la stratégie W
- ✅ W reçoit snapshot O+N personnalisé
- ✅ Graphique Prediction Errors affiche my_error (0 au début car pas de prédiction précédente)

**Logs serveur attendus**:
```
[ON] Analyse avec Gemini (1 agents, image: XXX bytes)...
[O] Prompt chargé avec 1 agents injectés
[O] JSON réparé avec succès
[N] JSON réparé avec succès
[ON] Snapshot O+N combiné (version X, Y structures, U=Z)
```

### Test 2 : Deux agents (validation erreurs prédiction)

**Objectif**: Vérifier l'évaluation des erreurs de prédiction par N.

**Étapes**:
1. Ouvrir **2 clients V5** simultanément (2 onglets)
2. Configurer clés API dans les deux clients
3. Cliquer "Start" dans les deux clients
4. Attendre au moins 3 itérations (seed + 2 actions)
5. Observer l'onglet **Metrics → Prediction Errors** dans chaque client

**Validation**:
- ✅ Chaque agent reçoit son erreur personnelle (prediction_errors[agent_id])
- ✅ Le graphique affiche:
  - **My Error** (bleu): Erreur de cet agent
  - **Mean Error** (vert): Moyenne des erreurs de tous les agents
  - **Std Deviation** (rouge pointillé): Écart-type des erreurs
- ✅ Les erreurs évoluent au fil des itérations
- ✅ Un agent avec de bonnes prédictions a une erreur faible (< 0.3)
- ✅ La narrative de N reflète mieux les contributions des agents avec faible erreur

**Logs serveur attendus**:
```
[W] Agent XXXX supprimé (inactif > 30s)  // Si un agent se déconnecte
```

### Test 3 : N agents (validation stabilité et métriques)

**Objectif**: Vérifier la stabilité avec plusieurs agents et l'évolution des métriques.

**Étapes**:
1. Ouvrir **3-5 clients V5** simultanément
2. Configurer clés API
3. Démarrer tous les clients avec un délai aléatoire (0-3s, intégré dans le code)
4. Observer pendant au moins 5 itérations (seed + 4 actions)

**Validation**:
- ✅ O identifie correctement le nombre d'agents
- ✅ O détecte des structures multi-agents (macro-structures)
- ✅ N génère une narrative cohérente intégrant tous les agents
- ✅ N calcule C_w global basé sur toutes les stratégies
- ✅ Les erreurs de prédiction convergent pour les agents qui coordonnent bien
- ✅ Les graphiques restent lisibles et stables
- ✅ Pas de 503 errors de Gemini (grâce au retry avec backoff)
- ✅ Pas d'agents bloqués en attente de snapshot

**Logs serveur attendus**:
```
[ON] Analyse avec Gemini (5 agents, image: XXX bytes)...
[ON] Snapshot O+N combiné (version X, Y structures, U=Z)
[W] Agent YYY supprimé (inactif > 30s)  // Si un agent se déconnecte
```

### Test 4 : Erreurs API et fallbacks

**Objectif**: Vérifier la robustesse face aux erreurs Gemini.

**Étapes**:
1. Simuler une erreur API (par exemple, clé API invalide ou rate limit)
2. Observer le comportement du serveur et des clients

**Validation**:
- ✅ Serveur conserve le dernier snapshot valide O+N
- ✅ Clients ne sont pas bloqués
- ✅ Seed fallback (8-pixel ring) est activé côté client si nécessaire
- ✅ Logs explicites des erreurs

## Vérification des endpoints V5

### Endpoint `/o/latest?agent_id=XXX`

**Test**:
```bash
curl "http://localhost:8005/o/latest?agent_id=test_agent_id"
```

**Réponse attendue**:
```json
{
  "version": 3,
  "timestamp": "2025-...",
  "structures": [...],
  "formal_relations": {"summary": "...", "connections": [...]},
  "narrative": {"summary": "..."},
  "prediction_errors": {
    "test_agent_id": {"error": 0.25, "explanation": "..."}
  },
  "simplicity_assessment": {
    "C_w_current": {"value": 28, "rationale": "..."},
    "C_d_current": {"value": 18, "description": "..."},
    "U_current": {"value": 10, "interpretation": "MODERATE_EMERGENCE"},
    "reasoning_o": "...",
    "reasoning_n": "..."
  },
  "agents_count": 2
}
```

**Validation**:
- ✅ Snapshot personnalisé ne contient que l'erreur de l'agent demandé
- ✅ Structures, relations, narrative sont partagées (communes à tous)

### Endpoint `/n/w-data`

**Test**:
```bash
curl -X POST "http://localhost:8005/n/w-data" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test_agent",
    "position": [0, 0],
    "iteration": 2,
    "strategy": "COMPLETE_MACRO_STRUCTURE",
    "rationale": "Test rationale",
    "predictions": {"collective_after_prediction": "Test prediction"},
    "timestamp": "2025-01-01T12:00:00Z"
  }'
```

**Réponse attendue**:
```json
{
  "ok": true,
  "agent_id": "test_agent",
  "timestamp": "2025-..."
}
```

**Validation**:
- ✅ Données W stockées dans `w_store`
- ✅ N utilisera ces données pour le prochain cycle d'analyse

### Endpoint `/n/w-data` (récupération pour debug)

**Test**:
```bash
curl "http://localhost:8005/n/w-data"
```

**Réponse attendue**:
```json
{
  "agents": {
    "agent_id_1": {"agent_id": "...", "position": [...], "strategy": "...", ...},
    "agent_id_2": {...}
  },
  "timestamp": "2025-..."
}
```

## Métriques à surveiller

### Côté serveur

- **RPM (Requests Per Minute)**: Ne pas dépasser 10 (limite Gemini free tier)
- **TPM (Tokens Per Minute)**: Ne pas dépasser 250K
- **Latence O-N**: < 15s par cycle (O + N + combinaison)
- **Taux d'échec JSON**: < 5%

### Côté client

- **Erreur de prédiction moyenne**: Doit converger vers 0.2-0.4 pour agents coordonnés
- **U (Unexpectedness)**: Doit augmenter progressivement avec coordination
- **Temps de cycle W**: Seed ~20s, Action ~15s

## Comparaison V4 vs V5

| Aspect | V4 | V5 |
|--------|----|----|
| Architecture | O+W (O fait tout) | O-N-W (séparation observation/narration) |
| Port serveur | 8004 | 8005 |
| Calcul C_w | Par O (mélangé avec observation) | Par N (basé sur stratégies W) |
| Narrative | Par O (mélangé avec structures) | Par N (dédié, pondéré par erreurs) |
| Erreurs prédiction | Calculées par W (localement) | Évaluées par N (globalement) |
| Graphique | 2 graphiques (O, W) | 3 graphiques (O, W, Prediction Errors) |
| Snapshot personnalisé | Non | Oui (par agent_id) |
| Endpoint W→N | N/A | POST /n/w-data |

## Résolution de problèmes

### Problème : Agents ne reçoivent pas de snapshot O+N

**Symptômes**:
- Logs client: `Waiting for first successful O+N analysis...`
- Agents bloqués après seed

**Solutions**:
1. Vérifier que `GEMINI_API_KEY` est définie
2. Vérifier que l'image est bien envoyée à O (logs serveur)
3. Vérifier les logs serveur pour erreurs Gemini
4. Augmenter le timeout warmup si seed trop lent

### Problème : Erreurs JSON parsing côté serveur

**Symptômes**:
- Logs serveur: `[O] Échec parsing: ...` ou `[N] Échec parsing: ...`

**Solutions**:
1. Vérifier les prompts O et N (format JSON valide dans les exemples)
2. Réessayer (mécanisme de retry intégré)
3. Consulter les logs pour voir le texte reçu de Gemini

### Problème : Graphique Prediction Errors ne s'affiche pas

**Symptômes**:
- Canvas vide dans onglet Metrics

**Solutions**:
1. Attendre au moins 2 itérations (seed + 1 action)
2. Vérifier console navigateur pour erreurs JavaScript
3. Vérifier que `prediction_errors` est présent dans snapshot O+N

## Fichiers V5 créés/modifiés

### Nouveaux fichiers (V5 uniquement)

- `python/poietic_ai_server_v5.py`: Serveur O-N
- `public/gemini-prompts-v5-observation.json`: Prompt O (simplifié)
- `public/gemini-prompts-v5-narration.json`: Prompt N (nouveau)
- `public/gemini-prompts-v5-action.json`: Prompt W action (adapté)
- `public/gemini-prompts-v5-seed.json`: Prompt W seed (copié de V4)
- `public/js/ai-player-v5.js`: Client JavaScript V5
- `public/ai-player-v5.html`: Interface HTML V5

### Fichiers V4 conservés (intacts)

- `python/poietic_ai_server_v4.py`
- `public/gemini-prompts-v4-*.json`
- `public/js/ai-player-v4.js`
- `public/ai-player-v4.html`

## Prochaines étapes

1. **Tests unitaires**: Ajouter des tests pour les fonctions de parsing JSON
2. **Tests d'intégration**: Automatiser les scénarios de test
3. **Monitoring**: Ajouter des métriques Prometheus/Grafana
4. **Optimisation**: Réduire la latence O-N en parallélisant si possible
5. **Documentation**: Ajouter des exemples de sessions réussies avec screenshots

