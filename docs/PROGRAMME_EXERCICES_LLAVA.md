# Programme d’exercices LLaVA pour précision spatiale et coordination

Objectif: entraîner progressivement des agents LLaVA à la précision (coordonnées 0..19), à la composition, puis à la collaboration, malgré la désynchronisation entre agents et la variabilité des voisins.

## Principes clés

- Agents non synchronisés: chaque agent peut être à une phase différente. Les exercices doivent être robustes aux absences de motifs chez les voisins et au décalage temporel.
- Tolérance et fallback: chaque exercice spécifie des stratégies de repli pour garantir une sortie valide `pixels: …`.
- Mesure et persistance: chaque itération collecte des métriques simples (score d’exécution, précision, densité, duplication) pour piloter la progression.

## Métriques minimales par itération

- valid_pixels: nombre de paires (x,y:#HEX) valides (0..19, #RRGGBB/#RGB normalisé)
- duplicates_removed: nombre de doublons filtrés côté client
- density: ratio de cases non noires vs 400
- boundary_errors: coordonnées hors 0..19 détectées côté parseur
- self_eval: autoévaluation 0..10 fournie par l’agent

## Phase A — Dessin avec modèle (guidage fort)

But: ancrer le format, les coordonnées et la couleur. Chaque sous-exercice inclut un fallback si des contraintes échouent.

1) Forme énoncée, valeurs x,y:#HEX imposées
- Consigne: « Dessine 4 pixels de couleur COINS aux 4 coins, et 4 pixels de couleur CENTRE au centre, avec EXACTEMENT les paires suivantes: 0,0:#HEX_COINS 19,19:#HEX_COINS 0,19:#HEX_COINS 19,0:#HEX_COINS 9,9:#HEX_CENTRE 10,10:#HEX_CENTRE 10,9:#HEX_CENTRE 9,10:#HEX_CENTRE »
- Randomisation: choisir COINS et CENTRE dans deux listes distinctes sans collision.
- Fallback: si couleurs invalides, remplacer par #FF5733 (coins) et #2ECC71 (centre).

2) Forme énoncée (coins et centre), x,y imposées, #HEX libres
- Consigne: même positions, couleurs libres mais contrastées (mention explicite « pas de #000000 »).
- Fallback: si l’agent produit < 8 pixels, compléter côté prompt par « complète à 8 ». 

3) Forme énoncée (coins et centre), x,y libres, #HEX libres
- Consigne: placer 8 pixels aux coins et au centre (4+4) mais choisir librement les positions voisines immédiates des coins et du centre.
- Critère: positions dans {0,1,18,19} pour coins; {9,10} pour centre.

4) Damier 2 couleurs, x,y libres, #HEX libres
- Consigne: damier 20×20 à 2 couleurs (alterner par (x+y)%2). Autoriser sous-échantillonnage (1 case sur 2) pour < 400 pixels.

5) Damier 2 couleurs complémentaires aux précédentes
- Consigne: répéter damier en inversant les deux couleurs.

## Phase B — Copie (robuste aux voisins absents)

But: apprendre à prélever l’information visuelle chez un voisin et la transposer.

Préambule d’asynchronie (toujours dans le prompt):
- « Si le voisin requis n’existe pas ou que sa grille est vide (< 10 pixels), applique le fallback indiqué. »

6) Copier un voisin immédiat N, S, W, E
- Consigne: reproduire son motif à l’identique (si présent).
- Fallback 1: si voisin vide/absent, copier le voisin disponible avec la plus haute densité.
- Fallback 2: si aucun voisin significatif, produire un motif 10×10 au centre inspiré d’un patch 10×10 pris dans l’image globale (couleurs dominantes).

7) Copier en miroir vertical un voisin immédiat
- Consigne: idem, avec transformation x → 19−x dans la grille locale.
- Fallbacks identiques.

8) Copier un voisin diagonal (NW, NE, SW, SE) et pivoter de 90° horaire
- Consigne: rotation (x,y) → (y, 19−x) dans le repère local.
- Fallback: si diagonaux vides, revenir au voisin cardinal le plus dense.

## Phase C — Création (guidée)

9) Dégradé radial centre→bordures
- Consigne: choisir 2 couleurs, interpoler en 5–8 anneaux depuis (9.5,9.5).

10) Paysage stylisé
- Consigne: 3 bandes (ciel/ligne d’horizon/sol) + 1 élément saillant (astre, montagne, arbre). Au moins 120 pixels.

11) Traits principaux d’un visage superposés au paysage
- Consigne: esquisse yeux–nez–bouche alignée verticalement, couleurs non noires, 60–150 pixels.

## Phase D — Création en interaction (collaborative)

12) Compléter un voisin
- Consigne: repérer un motif reconnaissable chez un voisin et l’étendre dans sa propre grille (continuité de formes/couleurs).
- Fallback: si aucun motif, renforcer un motif interne créé en phase C.

13) Établir une passerelle entre deux voisins
- Consigne: tracer une liaison colorée ou texturée reliant deux motifs externes (choisir direction et épaisseur).

14) Dessin libre (règles GP)
- Consigne: créativité totale, sans duplication ni coordonnées hors bornes, densité > 50.

## Gestion de la désynchronisation

- Chaque prompt inclut « Si la donnée voisine est indisponible, applique Fallback X ». 
- Heuristique de disponibilité: un voisin est « significatif » si ≥ 10 pixels valides.
- Sélection automatique: côté client, fournir au prompt un petit récap (densité N/S/E/W/NW/NE/SW/SE) pour guider l’agent.

## Schéma d’itérations

### Itération 1
- Message d’introduction: objectifs généraux et phases.
- Prompt exercice A(1) 
- Sortie attendue: `pixels: …` (≥ 8), autoévaluation 0..10 (brève justification).

### Itération n (n>1)
- Entrée: image globale de n−1 + rappel du prompt n−1 (1 ligne).
- Autoévaluation n−1 (0..10) + justification ≤ 20 mots.
- Prompt exercice courant (en fonction de la progression locale de l’agent).
- Sortie: `pixels: …` + 1 à 3 lignes de commentaire (vision / voisins / intention) optionnelles.

## Templates de prompt (extraits)

```text
FORMAT SORTIE (strict):
pixels: x,y:#HEX x,y:#HEX ...
(pas de markdown, pas de prose avant la ligne pixels)

RÈGLES (strict):
- x,y entiers 0..19
- #HEX au format #RRGGBB (préféré) ou #RGB (toléré, sera étendu)
- pas de doublons (x,y)
```

### A(1) — Coins et centre imposés
```text
TÂCHE: Place 4 pixels COINS aux coins et 4 pixels CENTRE au centre avec EXACTEMENT ces paires:
pixels: 0,0:COINS 19,19:COINS 0,19:COINS 19,0:COINS 9,9:CENTRE 10,10:CENTRE 10,9:CENTRE 9,10:CENTRE
```

### B(6) — Copier un voisin cardinal
```text
TÂCHE: Reproduis à l’identique le motif du voisin {N|S|E|W}. 
Si indisponible ou <10 pixels: copie le voisin le plus dense, sinon applique un motif 10×10 inspiré des couleurs dominantes de l’image globale.
```

### C(9) — Dégradé centre→bordures
```text
TÂCHE: Dégradé radial du centre vers les bordures entre COLOR_A et COLOR_B en 6 anneaux.
```

### D(13) — Passerelle entre deux voisins
```text
TÂCHE: Crée une passerelle visuelle entre les motifs de deux voisins (choisis) avec continuité de teinte et d’épaisseur régulière.
```

## Progression et persistance

- Avancement local par agent (indépendant): passage à l’exercice suivant si self_eval ≥ 7/10 ET boundary_errors = 0 pendant 2 itérations consécutives.
- Révisions périodiques: toutes les 6 itérations, rejouer un exercice de Phase A ou B pour renforcer précision et copie.
- Journalisation: consigner métriques et autoévaluations pour suivi global.

## Notes de robustesse

- Normalisation couleurs: #RGB → #RRGGBB, #RRGGBBAA → #RRGGBB, longueurs 1..5 → padding, 7/8 → troncature à 6.
- Parsing pixels multi-lignes, blocs ```pixels: …```, tolérance `x,y#HEX` et `x,y:#HEX`.
- Déduplication coordonnées côté client, clamp 0..19, filtrage des redessins identiques.

---

Ce programme peut être injecté dans le manuel/prompt système initial et piloté par un paramètre « phase/exercice » par agent. Les fallbacks garantissent une production utile même en forte désynchronisation.


