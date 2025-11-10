# Changelog V5 - Architecture O-N-W

## Version 5.0.0 - 2025-01-24

### 🚀 Nouvelle Architecture O-N-W

La V5 introduit une séparation claire des responsabilités entre trois machines AI :

#### O-machine (Observation)
**Responsabilité** : Observer le canvas global et analyser les structures visuelles

**Sorties** :
- `structures` : Liste des structures identifiées avec positions des agents
- `formal_relations` : Analyse des relations spatiales, couleurs, symétries
- `C_d` (Description Complexity) : Complexité de description basée sur structures

**Modifications** :
- ✅ Retrait du calcul de C_w (délégué à N)
- ✅ Retrait de la narrative (déléguée à N)
- ✅ Ajout de `formal_relations.connections` avec types de liens
- ✅ Ajout de `agent_positions` pour chaque structure

#### N-machine (Narration) 🆕
**Responsabilité** : Évaluer, narrer, et calculer la complexité de génération

**Entrées** :
- Snapshot O (structures + relations formelles + C_d)
- Données W (stratégies, rationales, prédictions de tous les agents)
- Snapshot précédent (pour continuité temporelle)

**Sorties** :
- `narrative` : Histoire plausible synthétisant O et W
- `prediction_errors` : Évaluation de l'erreur de chaque agent (0-1)
- `C_w` (Generation Complexity) : Complexité basée sur sophistication des stratégies W

**Avantages** :
- 🎯 C_w reflète réellement la complexité des stratégies des agents
- 📖 Narrative pondérée par l'exactitude des prédictions des agents
- 📊 Feedback personnalisé pour chaque agent via prediction errors

#### W-machines (World)
**Modifications** :
- ✅ Reçoivent snapshot O+N combiné (structures de O + narrative de N)
- ✅ Reçoivent leur erreur de prédiction personnelle
- ✅ Envoient leurs données (stratégie, rationale, prédictions) à N via `/n/w-data`
- ✅ Ne calculent plus eux-mêmes leur erreur de prédiction

### 📊 Nouvelles Métriques : Prediction Errors

**Graphique** : Affiche 3 courbes sur l'évolution des erreurs de prédiction
- **My Error** (bleu) : Erreur de prédiction de cet agent
- **Mean Error** (vert) : Moyenne des erreurs de tous les agents
- **Std Deviation** (rouge pointillé) : Écart-type des erreurs

**Interprétation** :
- Erreur < 0.2 : Excellente compréhension du système
- Erreur 0.2-0.4 : Bonne compréhension
- Erreur 0.4-0.6 : Compréhension modérée
- Erreur > 0.6 : Faible compréhension

### 🔧 Nouveaux Endpoints

#### `GET /o/latest?agent_id=XXX`
- Retourne snapshot O+N **personnalisé** pour un agent
- Ne contient que l'erreur de prédiction de cet agent dans `prediction_errors`
- Structures, relations, narrative sont partagées (communes)

#### `POST /n/w-data`
- Reçoit les données d'un agent W après action
- Payload : `{agent_id, position, iteration, strategy, rationale, predictions, timestamp}`
- Permet à N d'évaluer les prédictions au cycle suivant

#### `GET /n/w-data` (debug)
- Retourne toutes les données W actuellement stockées

### 📁 Nouveaux Fichiers

#### Serveur
- `python/poietic_ai_server_v5.py` : Serveur O-N (port 8005)
- `python/README_V5_TESTING.md` : Guide de test complet

#### Prompts
- `public/gemini-prompts-v5-observation.json` : Prompt O simplifié
- `public/gemini-prompts-v5-narration.json` : Prompt N (nouveau)
- `public/gemini-prompts-v5-action.json` : Prompt W action adapté
- `public/gemini-prompts-v5-seed.json` : Prompt W seed (copié de V4)

#### Client
- `public/js/ai-player-v5.js` : Client JavaScript V5
- `public/ai-player-v5.html` : Interface HTML V5 avec graphique Prediction Errors

### 🛡️ Robustesse et Optimisations

#### Gestion des Erreurs
- ✅ Retry avec exponential backoff pour erreurs API Gemini (503, 429)
- ✅ Conservation du dernier snapshot valide en cas d'échec
- ✅ Seed fallback côté client si erreur API
- ✅ Nettoyage automatique des agents inactifs (timeout 30s)

#### Synchronisation
- ✅ Warmup period : O attend 2 updates + 5s avant première analyse
- ✅ Stabilization period : O attend 3s de calme avant analyse
- ✅ W attend snapshot O postérieur à sa dernière action
- ✅ Délai aléatoire (0-3s) au démarrage de chaque client (évite congestion)

#### Performance
- ✅ Parsing JSON robuste avec nettoyage et fallback
- ✅ Limitation historique métriques (50 dernières itérations)
- ✅ Libération mémoire images debug (revoke data URLs)

### 🎨 Améliorations UI

#### Onglet Metrics
- ✅ Nouveau graphique "Prediction Errors (V5: N-machine Evaluation)"
- ✅ Légende claire avec codes couleur
- ✅ Axes et labels précis

#### Onglet Verbatim
- ✅ Affichage structuré des snapshots O+N
- ✅ Distinction claire entre contributions O et N
- ✅ Affichage du reasoning de O et N

### 📈 Comparaison V4 vs V5

| Aspect | V4 | V5 |
|--------|----|----|
| **Architecture** | O+W (O monolithique) | O-N-W (séparation concerns) |
| **Port serveur** | 8004 | 8005 |
| **Calcul C_w** | Par O (approximatif) | Par N (basé stratégies W) |
| **Narrative** | Par O (mélangé structures) | Par N (dédié, pondéré) |
| **Erreurs prédiction** | Par W (local) | Par N (global) |
| **Graphiques** | 2 (O, W) | 3 (O, W, Errors) |
| **Snapshot** | Unique | Personnalisé par agent |
| **Endpoint W→N** | N/A | POST /n/w-data |
| **Relations structures** | N/A | formal_relations |

### 🔬 Validations

#### Tests Unitaires
- ✅ Parsing JSON robuste (O et N)
- ✅ Personnalisation snapshot par agent_id
- ✅ Calcul métriques erreur prédiction

#### Tests Intégration
- ✅ Flux O→N→W complet (1 agent)
- ✅ Évaluation erreurs prédiction (2 agents)
- ✅ Stabilité multi-agents (3-5 agents)
- ✅ Gestion erreurs API et fallbacks

### 🚧 Limitations Connues

- **Rate Limits Gemini** : Free tier limité à 10 RPM, 250K TPM
  - Mitigation : Retry avec backoff, délai aléatoire startup
- **Latence O-N** : ~15s par cycle (O + N séquentiel)
  - Amélioration future : Paralléliser O et N si possible
- **Taille prompts** : Prompts N peuvent devenir longs avec N agents
  - Amélioration future : Summarization ou filtrage données W

### 📚 Documentation

- ✅ `README_V5_TESTING.md` : Guide de test complet avec scénarios
- ✅ `training-image-memory.plan.md` : Plan détaillé V5
- ✅ `CHANGELOG_V5.md` : Ce fichier

### 🎯 Prochaines Étapes (V6?)

1. **Parallélisation O-N** : Appeler O et traiter données W en parallèle
2. **Cache prompts** : Réduire tokens en cachant parties statiques
3. **Tests automatisés** : Suite de tests end-to-end
4. **Monitoring** : Métriques Prometheus/Grafana
5. **UI avancée** : Visualisation interactive des relations structures
6. **Historique sessions** : Persistence et replay de sessions

### 👥 Contributeurs

- Assistant AI (Claude Sonnet 4.5) : Implémentation complète V5
- Utilisateur : Vision, design, feedback, validation

### 📝 Notes de Migration V4→V5

Pour migrer une session V4 vers V5 :

1. **Serveur** :
   - Arrêter serveur V4 (`python3 python/poietic_ai_server_v4.py`)
   - Démarrer serveur V5 (`python3 python/poietic_ai_server_v5.py`)
   - Port change de 8004 à 8005

2. **Client** :
   - Remplacer `ai-player-v4.html` par `ai-player-v5.html` dans l'URL
   - Reconfigurer clé API Gemini dans l'interface
   - Tous les fichiers V4 restent intacts

3. **Compatibilité** :
   - ❌ Snapshots V4 non compatibles avec V5 (format différent)
   - ✅ Poietic Generator server (Node.js) : aucun changement
   - ✅ WebSocket : aucun changement
   - ✅ Gemini API adapter : aucun changement

---

## Historique

- **2025-01-24** : V5.0.0 - Architecture O-N-W complète
- **2025-01-23** : V4.0.0 - Architecture O-W avec Gemini multimodal
- **2025-01-22** : V3.0.0 - LLaVA local avec canvas capture

