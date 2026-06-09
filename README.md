# Poietic Generator — application collaborative + agents LLM de vision

Le **Poietic Generator** (Olivier Auber, 1986) est une application de **dessin collaboratif en
temps réel** : chaque participant contrôle une cellule de 20×20 pixels sur une grille partagée,
et l'œuvre émerge de l'interaction de tous. Ce dépôt contient le **serveur** (Crystal) + **client**
(JavaScript), ainsi que plusieurs générations d'**agents LLM dotés de vision** (V2 → V6, dont la
variante **V4or**) qui dessinent aux côtés des humains. Les versions récentes — **V4or, V5 et V6** —
passent toutes par **OpenRouter** (clé serveur, sélecteur de modèle, suivi des coûts).

Fil conducteur : la **Théorie de la Simplicité** (J.-L. Dessalles) — l'émergence est mesurée par
**U = C_w − C_d** (complexité de génération moins complexité de description). Voir
[`VERSIONS.md`](VERSIONS.md) pour la philosophie et le détail des versions.

Résultats préliminaires :

- Video 1 — 9 W-agents with bounded rationality, evidence of emergence (V0): https://youtu.be/4N6eTMmk1L8
- Video 2 — 9 W-agents + 1 O-agent, simplicity metrics (V4): https://youtu.be/KHWO_7AeDJE
- Video 3 — 9 W + 1 O + 1 N-agent, prediction error & signalling cost ranking (V5): https://youtu.be/yh7BwZxoL78


## Objectifs

- Permettre à plusieurs utilisateurs (humains et/ou agents IA) de dessiner simultanément sur une
  grille partagée.
- Offrir une expérience fluide même en cas de coupure réseau, grâce à une gestion avancée de la
  persistance et de la synchronisation.
- Favoriser la créativité collective et l'**observation de dynamiques émergentes**, et permettre
  de **mesurer** cette émergence.

## Architecture (état actuel)

Trois services coopèrent :

- **`3001` — Serveur de jeu** (Crystal/Kemal) : canvas collaboratif (WebSocket `/updates`), sert
  les fichiers statiques, et **enregistre** les sessions (`API.recorder` → `db/recorder.db`).
- **`3002` — Recorder / Player** : **rejeu** des sessions sur `http://localhost:3002/player/`
  (lit la même base).
- **Serveurs IA** (Python/FastAPI), un par version, **tous via OpenRouter** (clé serveur, suivi des
  coûts, garde-fou de budget) :
  - **V4or** : `8007` (variante de V4) ;
  - **V5** : `8005` (triade O‑N‑W) + serveur de métriques `5005` ;
  - **V6** : `8006` (architecture quantique) + serveur de métriques `5006`.

La mesure de l'émergence repose sur la triade **W** (agents qui dessinent) / **O** (observation,
calcul de C_d) / **N** (narration, C_w et erreurs de prédiction) — détaillée dans
[`VERSIONS.md`](VERSIONS.md).

## Démarrage rapide

Prérequis : [Crystal](https://crystal-lang.org/install/), Python 3 (FastAPI/httpx), un compilateur
C et les libs système (voir messages de `start-v4or.sh`).

```sh
# 1. Dépendances + compilation Crystal
shards install && shards build

# 2. Configuration (clé OpenRouter pour les agents V4or)
cp .env.example .env        # puis renseigner OPENROUTER_API_KEY

# 3. Lancer une version (jeu 3001 + player 3002 + son serveur IA)
./start-v4or.sh   # V4or (8007)  —  ou ./start-v5.sh (8005)  —  ou ./start-v6.sh (8006, quantique)
```

Accès :
- Jeu : `http://localhost:3001/`
- Agents de vision : `ai-player-v4or.html` · `ai-player-v5.html` · `ai-player-v6.html`
  (un onglet = un modèle, ex. `?model=anthropic/claude-opus-4.8` ; sélecteur de modèle + panneau coût)
- Rejeu des sessions : `http://localhost:3002/player/`
- Dashboards métriques : `ai-metrics.html` (V5) · `ai-metrics-v6.html` (V6, observables quantiques)
- API / coûts : `/docs` et `/api/usage` du serveur de la version (8007 / 8005 / 8006)

## Agents LLM de vision (V4or — OpenRouter, variante de V4)

- **Fournisseur unique** via [OpenRouter](https://openrouter.ai/) : le **modèle est une simple
  configuration** (plus d'adaptateur par fournisseur). Clé **côté serveur** (`OPENROUTER_API_KEY`).
- **Multi-modèles en parallèle** (1 agent = 1 modèle) pour comparer la capacité d'émergence.
- **Compteur de coût centralisé** + **kill-switch** `MAX_SESSION_USD` (HTTP 402 au dépassement).
- Fichiers clés : `python/poietic_ai_server_v4or.py`, `python/cost_tracker_v4or.py`,
  `public/js/llm-adapters/openrouter.js`, `public/js/v4or/ai-player-v4or.js`, `public/prompts/v4or-*.json`.

**V5** (triade O‑N‑W) et **V6** (architecture quantique) sont aussi présentes et **portées sur
OpenRouter** — sélecteur de modèle et panneau coût dans leurs UI, lancement via `start-v5.sh` /
`start-v6.sh`. Les versions historiques V2/V3/V4 restent côte à côte. Voir [`VERSIONS.md`](VERSIONS.md).

## Rejeu des sessions (Player)

Le recorder enregistre chaque session ; le **player** (port 3002) permet de les **rejouer** :
sélection par date/durée/nombre d'utilisateurs, contrôles de lecture, et option de **fond**
(noir / pseudo-aléatoire). En production, Caddy mappe `/player/* → 3002`.

## Métriques (V5)

La V5 mesure l'émergence en continu : C_w, C_d, U, erreurs de prédiction par agent (moyenne,
écart-type = « fragmentation narrative ») et classement des agents. Le serveur de métriques
(`python/metrics_server_v5.py`, port **5005**) agrège ces données ; le dashboard
**`public/ai-metrics.html`** les affiche en temps réel. La **V6** a son propre serveur de métriques
(`metrics_server_v6.py`, **5006**), son dashboard **`ai-metrics-v6.html`** (observables quantiques)
et un **narrative viewer** `narrative-viewer-v6.html`. Détails dans [`VERSIONS.md`](VERSIONS.md).

## Versions (résumé)

| Version | En un mot |
|--------|-----------|
| **V2** | Agent de vision autonome (observe = agit), LLaVA 7B / Gemini, métriques côté client |
| **V3** | Perception réelle : capture du canvas, vision locale consolidée |
| **V4** | Architecture **O-W** : un observateur dédié mesure l'émergence (port 8004) |
| **V4or** | Variante de V4 sur **OpenRouter** : provider unique, multi-modèles, coût maîtrisé (8007) |
| **V5** | Triade **O-N-W** sur **OpenRouter** : narration, erreurs de prédiction, classements (8005 + métriques 5005) |
| **V6** | Architecture **quantique** (Q-machine) sur **OpenRouter** : stratégies coherent/decoherence/quantum, narrative viewer (8006 + métriques 5006) |

➡️ Philosophie et caractéristiques détaillées : **[`VERSIONS.md`](VERSIONS.md)**.

## Reconnexion rapide & mode offline

- **Reconnexion rapide** : après une coupure, un client peut se reconnecter avec le même `user_id`
  dans un délai de 3 minutes (par défaut) ; son état (cellule, dessin) est restauré.
- **Mode offline** : le client peut continuer à dessiner localement ; les actions sont
  synchronisées à la reconnexion.
- **Robustesse** : reconnexion gérée même si l'ancienne WebSocket n'est pas encore fermée
  (coupure brutale, mode avion…).

Détails techniques : `docs/030-protocols/`.

## Développement

```sh
crystal spec        # tests unitaires
crystal spec tests/ # tests d'intégration
```

## Documentation

- `docs/010-usage/` — utilisation
- `docs/020-contributing/` — contribution
- `docs/030-protocols/` — protocoles d'API
- **`docs/archive/`** — documentation **historique** (notes de conception et expérimentations
  V2→V5 : LLaVA, Gemini, prompts, théorie de la simplicité, architecture, ops). Voir
  [`docs/archive/README.md`](docs/archive/README.md).

Documentation en ligne : https://poietic-generator.github.io/poietic-generator-documentation/

## Contributing

1. Forkez le dépôt.
2. Créez votre branche (`git checkout -b ma-fonctionnalite`).
3. Commitez (`git commit -am "Ajout d'une fonctionnalité"`).
4. Poussez (`git push origin ma-fonctionnalite`) et ouvrez une Pull Request.

## Contributors

- [Olivier Auber](https://github.com/OAuber) — créateur et mainteneur
- [Glenn Rolland](https://github.com/glenux) — expert

## Licence

Free Art License (copyleft).
