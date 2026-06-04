# Poietic Generator × Agents LLM — Philosophie et versions (V2 → V6)

Ce document fait le point sur la **philosophie** et les **caractéristiques** des différentes
générations d'agents IA développées au-dessus du Poietic Generator. Il peut servir de base
à une section du README.

---

## Cadre général

Le **Poietic Generator** (Olivier Auber, 1986) est un dispositif de **dessin collaboratif en
temps réel** : chaque participant contrôle une cellule de 20×20 pixels sur une grille partagée,
et l'œuvre émerge de l'interaction de tous.

Le fil conducteur de toutes les versions IA est la **Théorie de la Simplicité** (Simplicity
Theory, J.-L. Dessalles), qui formalise l'**émergence** / l'inattendu :

> **U = C_w − C_d**
>
> - **C_w** (*Generation Complexity*) : complexité pour **générer** la situation
>   (longueur du programme de la « machine du monde », W-machine).
> - **C_d** (*Description Complexity*) : complexité de la **description** la plus courte
>   rendant la situation unique (machine d'observation, O-machine).
> - **U** (*Unexpectedness*) : une situation est « inattendue » quand elle est **plus simple
>   à décrire qu'à générer**.

Question directrice du projet : **des agents LLM dotés de vision peuvent-ils produire, sur le
canvas collaboratif, des structures émergentes (U élevé) — et peut-on le mesurer ?**

L'architecture a progressivement séparé les rôles, en écho aux machines de la Théorie de la
Simplicité :

- **W** (*World / Write*) : les agents qui **dessinent** (génération).
- **O** (*Observation*) : la machine qui **observe** le canvas global et **décrit** (C_d).
- **N** (*Narration*) : la machine qui **évalue/raconte** et estime la complexité de génération
  (C_w) à partir des stratégies des agents.

---

## V2 — L'agent de vision autonome

**Philosophie.** Un agent LLM **unique et auto-suffisant** : il **voit** (vision multimodale),
**décide**, **dessine**, et **s'auto-évalue**. On explore la capacité d'un modèle de vision à
dessiner des formes signifiantes et à *décrire* ce qu'il perçoit (questions Q3/Q4/Q6 :
description locale, globale, de l'itération précédente).

**Caractéristiques.**
- Interface à onglets (`ai-player-v2.html`) : Config, Monitoring, Verbatim, **Training**, Debug.
- Modèles : **LLaVA 7B** (GPU OVH) et **Gemini 1.5 Flash**. Adaptateur `gemini-v2.js` (format JSON).
- Mesure **Simplicity Theory côté client** : graphes **LOCAL** (l'agent) et **GLOBAL** (tous).
- **Mode entraînement** : phases A→D et exercices guidés (A1…D14).
- Mémoire de descriptions (local/global) réinjectée d'une itération à l'autre.
- Le rôle d'observation et d'action sont **confondus** dans le même agent.

## V3 — Vision locale consolidée + capture du canvas

**Philosophie.** Fiabiliser la **perception réelle** : l'agent ne raisonne plus seulement sur
des descriptions, il reçoit une **capture fidèle du canvas global** (et local). On consolide la
voie « modèle local » (LLaVA via Ollama/OVH) tout en gardant les API cloud.

**Caractéristiques.**
- `ai-player-v3.js`, `gemini-v3.js`, prompts `gemini-prompts-v3*.json`.
- **Capture canvas** (viewer + générateur de secours `llava-canvas.js`) envoyée au modèle.
- Détection d'environnement (localhost vs `ai.poietic-generator.net`).
- Étape charnière vers la séparation observation / action de la V4.

## V4 — Architecture O-W (l'Observateur dédié)

**Philosophie.** **Séparer la mesure de l'action.** Une **machine O** (serveur) observe l'image
du canvas global et produit une évaluation **objective** de l'émergence ; les **agents W**
(clients) agissent pour **maximiser le U global**, et non leur seule cellule.

**Caractéristiques.**
- Serveur `python/poietic_ai_server_v4.py` (**port 8004**), Gemini **multimodal** sur l'image.
- O (monolithique) renvoie : `structures`, `narrative`, **C_w, C_d, U** + `reasoning`.
- W (`ai-player-v4.js`, `gemini-v4.js`) : boucle **seed → action**, envoie son image à O,
  attend un snapshot O **postérieur** à sa dernière action avant d'agir.
- Contrat de sortie **léger** (stratégie + pixels), robuste et tolérant au parsing.
- Coordination entre voisins (couleurs de bord) pour viser des macro-structures globales.

## V5 — Architecture O-N-W (la triade)

**Philosophie.** Rendre la mesure **plus fidèle** en séparant *décrire* et *générer* : **O**
calcule la complexité de **description** (C_d) à partir de l'image ; **N** calcule la complexité
de **génération** (C_w) à partir des **stratégies réelles** des agents, **raconte**, et **évalue
les prédictions** de chaque agent. Boucle de rétroaction par agent.

**Caractéristiques.**
- Serveurs `poietic_ai_server_v5.py` (**8005**) + serveur de métriques (`metrics_server_v5.py`, **5005**).
- Les agents W **poussent** stratégie / rationale / prédictions à N (`POST /n/w-data`).
- Snapshot O+N **personnalisé** par agent (`GET /o/latest?agent_id=…`).
- Catalogue de **stratégies** (`strategies-v5.json`) avec coûts ΔC_w/ΔC_d estimés.
- Synchronisation fine (warmup, quiescence) — plus riche mais plus sensible à la latence.

### Métriques (Théorie de la Simplicité)

- **C_d — complexité de description** (machine **O**) : longueur de la description la plus courte
  rendant le canvas global **unique** (couleurs, structures, positions). Pénalise les compositions
  fragmentées (« A composition of n structures… » → C_d ≈ 4 + 2n bits minimum).
- **C_w — complexité de génération** (machine **N**) : estimée à partir de la **sophistication des
  stratégies** réellement employées par les agents (coordination, symétrie globale, formes
  reconnaissables…), et non plus « devinée » par O.
- **U = C_w − C_d — inattendu / émergence** (global), **quantifié en niveaux discrets** :
  - `U < 0` : **NO_EMERGENCE** · `0–5` : **WEAK** · `6–10` : **MODERATE** ·
    `11–15` : **STRONG** · `≥ 16` : **EXCEPTIONAL**.
  - Seules les **macro-structures fusionnées** (descriptibles de façon concise mais difficiles à
    générer) atteignent un U élevé ; le chaos ou la simple juxtaposition restent à U faible.
- **Par agent** : `ΔC_w`, `ΔC_d`, `U_after_expected` (contribution anticipée de son action) et
  surtout l'**erreur de prédiction** (0–1) — N compare ce que l'agent **avait prédit** de
  l'évolution collective à ce qui s'est **réellement** produit.
- **Agrégats** : `mean_error`, et l'**écart-type des erreurs = « fragmentation narrative »** —
  écart-type **élevé** = visions **divergentes** des agents sur l'évolution du canvas ;
  écart-type **faible** = **narrative collective cohérente**.
- **Classement des agents** : par **erreur de prédiction moyenne cumulative** (rang 1 = meilleur
  « prédicteur » de la dynamique collective), calculé sur tout l'historique des itérations.

### Rôle du serveur de métriques (port 5005)

Processus **indépendant** (`metrics_server_v5.py`) dédié à l'**agrégation, l'historisation et
l'export** des métriques — découplé de la boucle temps réel O-N-W (qui peut donc rester légère).

- **Entrées** : reçoit en continu les snapshots **O** (C_d, structures, relations formelles) et
  **N** (C_w, narrative, erreurs de prédiction) ainsi que les **actions W**, via
  `ws://localhost:5005/metrics`.
- **`SessionRecorder`** : collecte **complète** d'une session — métriques globales (C_w, C_d, U),
  deltas et erreurs par agent, classements, **captures du canvas (base64)** et événements
  d'itération — pour **export et rejeu analytique** (distinct du recorder de dessin sur 3002).
- **Endpoints HTTP** : `/state` (état courant), `/o-history`, `/n-history`,
  `/api/session/export`, `/api/session/summary`, `/api/session/events`,
  `POST /api/session/clear`, `/health`.
- **Dashboard** : la page **`public/ai-metrics.html`** (« AI Poietic Generator: Metrics ») se
  connecte au serveur de métriques via `ws://<hôte>:5005/metrics` et affiche en temps réel les
  **courbes C_w / C_d / U**, le **graphe des erreurs de prédiction** (moyenne et écart-type) et
  le **classement des agents**, avec export de session.

## V4or — OpenRouter (variante de V4, banc multi-modèles)

> **Note de nommage.** Cette version est une **variante de V4** (« V4 OpenRouter »), pas un
> successeur de V5. Le nom **« V6 » est réservé** à une version **« quantique »** développée hors
> de ce dépôt (voir « Lignée et état »).

**Philosophie.** **Ouvrir à tous les modèles** et **gouverner le coût**. On remplace le « zoo »
d'adaptateurs par modèle par **un seul fournisseur unifié** ([OpenRouter](https://openrouter.ai/)),
où le **modèle devient une simple configuration**. Objectif : **comparer** la capacité
d'émergence collaborative de modèles de vision variés, sur le **même banc**, de façon
**reproductible et économe**.

**Caractéristiques.**
- Serveur `python/poietic_ai_server_v4or.py` (**port 8006**) ; **clé côté serveur**
  (`OPENROUTER_API_KEY`), jamais exposée au navigateur.
- **Provider unique** `openrouter.js` (format OpenAI vision) ; **1 onglet = 1 modèle**
  (`?model=…`), multi-modèles en parallèle.
- **Compteur de coût centralisé** (`cost_tracker_v4or.py`) par session/agent/modèle, basé sur
  `usage.cost` ; endpoints `/api/usage` et `/api/usage/openrouter` (consommation officielle) ;
  **kill-switch budget** `MAX_SESSION_USD` (HTTP 402).
- Reprise de la **boucle O-W distillée de V4** (contrat léger, robuste) ; **coutures pour N**
  (flag `ENABLE_N`, `/v4or/w-data`, `run_analysis_pipeline()`) → évolution prévue vers la triade.
- Maîtrise des coûts intégrée : bridage du **raisonnement**, plafonds `max_tokens`, format delta,
  cadence O modérée. `start-v4or.sh`, `.env.example`.
- Fichiers : `public/js/v4or/ai-player-v4or.js`, `public/ai-player-v4or.html`,
  `public/prompts/v4or-*.json`, `public/js/llm-adapters/openrouter.js`.

---

## Tableau de synthèse

| Version | Philosophie | Rôles | Modèles | Mesure | Serveur (port) |
|--------|-------------|-------|---------|--------|----------------|
| **V2** | Agent vision autonome | observe = agit | LLaVA 7B, Gemini 1.5 | ST côté client (local+global) | — (client) |
| **V3** | Perception réelle (capture canvas) | observe = agit | LLaVA local, Gemini | ST côté client | — (client) |
| **V4** | Séparer mesure / action | **O** + **W** | Gemini multimodal | C_w/C_d/U par O (image) | `v4` (8004) |
| **V4or** | Variante de V4, banc multi-modèles, coût maîtrisé | O + W (N en couture) | **Tous via OpenRouter** | C_d (O) + **coût/qualité** | `v4or` (8006) |
| **V5** | Triade fidèle + feedback | **O** + **N** + **W** | Gemini | C_d (O) + C_w & erreurs (N) | `v5` (8005) + métriques (5005) |
| **V6** | _Réservé_ : version « quantique » (hors dépôt, à intégrer) | — | — | — | — |

---

## Infrastructure transverse

- **Serveur de jeu** Crystal (`3001`) : canvas collaboratif (WebSocket `/updates`), sert les
  fichiers statiques, **enregistre** les sessions (`API.recorder` → `db/recorder.db`).
- **Recorder / Player** (`3002`) : rejeu des sessions sur `http://localhost:3002/player/`
  (en prod, mappé par Caddy `/player/* → 3002`). Option de fond **noir / pseudo-aléatoire**.
- **Modules communs** réutilisés entre versions : `spatial-analysis.js`, `llava-canvas.js`,
  `simplicity-metrics.js`.

## Lignée et état

- **V2 → V3 → V4 → V5** : raffinement progressif (agent unique → séparation O/W → triade O-N-W).
- **V4or** : repart de la robustesse de **V4** comme socle provider-agnostique (variante de V4),
  sans recopier le passé ; **V3/V4/V5 restent intacts** (versions côte à côte).
- **À venir (autre machine)** : une **V5 évoluée** et une **V6 « quantique »** ont été développées
  hors de ce dépôt (non encore committées) et seront **fusionnées ici** ultérieurement. Le nom
  « V6 » est donc **réservé** à cette version quantique.
- **Prochaine étape (vers « C »)** : réactiver la **machine N** sur le socle V4or (les coutures
  existent) pour retrouver erreurs de prédiction et classements, mais multi-modèles.
- **Métrique « quantique »** : expérimentée hors dépôt, destinée à la future **V6** ; à formaliser
  et brancher (idéalement sur le serveur de métriques 5005 / `ai-metrics.html`).

---

*Contributeurs : Olivier Auber (créateur du Poietic Generator) ; assistance IA pour les
implémentations successives. Licence : Free Art License (copyleft).*
