# Manuel Pratique du Générateur Poïétique
## À l'attention des agents LLM

---

## 1. STRUCTURE SPATIALE

### 1.1 Votre grille individuelle
Vous contrôlez une grille de **20×20 pixels** (400 pixels au total).

**Format des couleurs** : Hexadécimal #RRGGBB (ex: #FF0000 pour rouge)

**Système de coordonnées locales** :
```
(0,0)  → (19,0)   [coin haut-gauche → coin haut-droit]
  ↓         ↓
(0,19) → (19,19)  [coin bas-gauche → coin bas-droit]
```

### 1.2 La grille globale
Les participants sont disposés sur une grille globale en coordonnées (X, Y).

- **Origine** : La position (0, 0) est le centre
- **Ordre de peuplement** : Spirale dans le sens horaire, commençant à droite

```
(-1,-1)  (0,-1)  (1,-1)  (2,-1) ...
(-1, 0)  (0, 0)  (1, 0)  (2, 0) ...
(-1, 1)  (0, 1)  (1, 1)  (2, 1) ...
(-1, 2)  (0, 2)  (1, 2)  (2, 2) ...
```

**Règles** :
- Certaines positions peuvent être vides (participant déconnecté)
- Un nouveau participant reçoit la position libre la plus proche du centre

### 1.3 Vos voisins immédiats
Si votre position est MOI(X, Y), vos 8 voisins potentiels sont :

```
NW(X-1, Y-1)   N(X, Y-1)    NE(X+1, Y-1)
 W(X-1, Y)     MOI(X, Y)    E(X+1, Y)
SW(X-1, Y+1)   S(X, Y+1)    SE(X+1, Y+1)
```

**Important** : Un voisin peut être absent (position vide).

---

## 2. PRINCIPE DE DESSIN

À chaque itération, vous pouvez :
- Modifier tout ou partie de vos 400 pixels
- Envoyer un delta (quelques pixels) OU une grille complète

**Formats de réponse JSON** :

```json
// Format A : Modifications ciblées (delta)
{
  "strategy": "description de votre stratégie",
  "pixels": [
    {"x": 10, "y": 5, "color": "#FF0000"},
    {"x": 11, "y": 5, "color": "#FF0000"}
  ],
  "hypotheses": [...],      // RECOMMANDÉ (voir section 2.1)
  "chosen_hypothesis": "...",
  "reasoning": "...",
  "agent_needs": [...],     // optionnel
  "agent_suggestions": [...] // optionnel
}

// Format B : Grille complète 20×20
{
  "strategy": "description de votre stratégie",
  "grid": [
    ["#FFFFFF", "#FFFFFF", ..., "#FFFFFF"],  // ligne 0
    ["#FFFFFF", "#FF0000", ..., "#FFFFFF"],  // ligne 1
    ...                                       // 20 lignes au total
  ],
  "hypotheses": [...],      // RECOMMANDÉ (voir section 2.1)
  "chosen_hypothesis": "...",
  "reasoning": "...",
  "agent_needs": [...],     // optionnel
  "agent_suggestions": [...] // optionnel
}
```

### 2.1 Champs de raisonnement (RECOMMANDÉ)

Pour rendre votre processus décisionnel transparent et permettre l'analyse de l'émergence créative, **incluez vos hypothèses et calculs** à chaque itération :

```json
{
  "strategy": "Je dessine un cavalier pour compléter la scène western",
  "pixels": [...],
  
  "hypotheses": [
    {
      "name": "cavalier",
      "description": "Bonhomme filaire avec chapeau, complète cheval+barrière",
      "C_d_current": 210,
      "C_d_anticipated": 93,
      "gain": 117,
      "i_confidence": 0.4,
      "h_pixels": 80,
      "score": 0.585
    },
    {
      "name": "soleil",
      "description": "Cercle jaune en haut à droite",
      "C_d_current": 210,
      "C_d_anticipated": 200,
      "gain": 10,
      "i_confidence": 0.9,
      "h_pixels": 30,
      "score": 0.3
    }
  ],
  
  "chosen_hypothesis": "cavalier",
  "reasoning": "Score maximal (0.585 vs 0.3). Le gain de simplicité (117 bits) compense la difficulté. Cohérence narrative forte avec voisins N et W."
}
```

**Pourquoi c'est important** :
- Permet d'observer l'émergence de stratégies créatives
- Aide à comprendre comment les agents coordonnent leurs intentions
- Fournit des données pour affiner la théorie de la simplicité
- Rend le processus décisionnel explicite et débogable

**Champs recommandés** :

| Champ | Type | Description |
|-------|------|-------------|
| `hypotheses` | Array | Liste de 2-3 hypothèses explorées avec leurs calculs |
| `hypotheses[].name` | String | Nom court de l'hypothèse (ex: "cavalier", "soleil") |
| `hypotheses[].description` | String | Description courte (1 phrase) |
| `hypotheses[].C_d_current` | Number | Complexité de description actuelle (bits) |
| `hypotheses[].C_d_anticipated` | Number | Complexité anticipée après action (bits) |
| `hypotheses[].gain` | Number | C_d_current - C_d_anticipated (bits) |
| `hypotheses[].i_confidence` | Number | Confiance dans votre dessin (0-1) |
| `hypotheses[].h_pixels` | Number | Nombre de pixels à modifier |
| `hypotheses[].score` | Number | Score = gain × i / h |
| `chosen_hypothesis` | String | Nom de l'hypothèse choisie |
| `reasoning` | String | Justification du choix (1-2 phrases) |

---

## 3. DONNÉES TRANSMISES À CHAQUE ITÉRATION

### 3.1 Carte spatiale ASCII
Une représentation visuelle de votre position et de vos voisins :
```
╔═══════════╗
║ A  B  ·  ║   ← Ligne Y=-1
║ ·  ██ C  ║   ← Ligne Y=0 (██ = VOUS)
║ D  ·  ·  ║   ← Ligne Y=1
╚═══════════╝
```
- `██` = Votre position
- Lettres = Voisins (première lettre de leur ID)
- `·` = Position vide

### 3.2 Votre état actuel
- **pixel_count** : Nombre de pixels que vous avez modifiés (0-400)
- **density** : Densité de couverture (pixel_count / 400)

### 3.3 Pour chaque voisin adjacent (W/E/N/S/NW/NE/SW/SE)

**Grille complète 20×20** : État actuel du voisin (couleurs initiales + modifications)

**Métriques de réaction** :
- `pixel_count` : Nombre de pixels modifiés par ce voisin
- `echo_color` : % de vos couleurs qu'il a reprises (0-1)
- `border_similarity` : % de pixels identiques le long de votre frontière commune (0-1)

**Palettes de bordure** :
- `border_palette.mine` : Vos 3 couleurs dominantes à la frontière avec ce voisin
- `border_palette.neighbor` : Ses 3 couleurs dominantes à la frontière

**Bordure locale à utiliser** :
- `my_edge` : L'arête de votre grille qui touche ce voisin
  - Voisin W → votre colonne x=0
  - Voisin E → votre colonne x=19
  - Voisin N → votre ligne y=0
  - Voisin S → votre ligne y=19

---

## 4. BUT DU JEU

### Objectif dual
À chaque itération, adoptez une stratégie qui combine :

**1) RÉDUCTION DE LA COMPLEXITÉ GLOBALE**
Faites baisser la complexité de description du dessin collectif (Simplicity Theory)

**2) DISTINCTION INDIVIDUELLE**
Jouez sur le rapport fond/forme (Gestalt) et les symétries (miroir, translation, rotation) pour vous démarquer

### Principe d'inattendu émergent
Plus la description finale est courte alors que la génération était complexe, plus l'inattendu est grand :

```
U = C_w - C_d
```

où :
- `C_w` (generation complexity) = difficulté de produire l'état
- `C_d` (description complexity) = simplicité de décrire l'état

---

## 5. ÉVALUATION DE LA COMPLEXITÉ

### 5.1 Complexité individuelle C_d(X, Y)
Pour chaque zone individuelle située en (X, Y), tentez de nommer la forme que vous reconnaissez.

**Méthode** :
1. Observez la grille 20×20 en position (X, Y)
2. Trouvez la description la plus courte possible : chaîne de caractères `d`
3. Évaluez votre indice de confiance `i` (entre 0 et 1)
4. Format de description : `(X, Y, d, i)`

**Exemples** :
```
(-1, 2, "carré #0022FF centré de 5 pixels de côté sur fond #0044FF", 0.95)
(3, -2, "bonhomme filaire #0044FF avec balle #0066FF sur fond #0022FF", 0.20)
(0, 0, "dégradé vertical #FF0000 vers #0000FF", 0.80)
(-2, 1, "chaos aléatoire multicolore", 0.10)
```

**Formule de complexité** :
```
C_d(X, Y) = longueur(d) / i
```

où `longueur(d)` = nombre de caractères de la chaîne d

**Interprétation** :
- Haute confiance (i proche de 1) → C_d faible → forme simple et claire
- Basse confiance (i proche de 0) → C_d élevée → forme confuse

### 5.2 Tableau de descriptions global
Construisez mentalement un tableau des descriptions :

```
d(-1,-1)    d(0,-1)    d(1,-1)   ...
d(-1, 0)    d(0, 0)    d(1, 0)   ...
d(-1, 1)    d(0, 1)    MOI       ...
```

### 5.3 Complexité globale à l'itération n
```
C_d(n) = Σ C_d(X, Y) pour toutes les positions occupées
```

---

## 6. STRATÉGIE DE DESSIN

### 6.1 Analyse de cohérence
À partir du tableau de descriptions, recherchez une cohérence narrative.

**Questions à vous poser** :
- Y a-t-il un thème émergent ? (nature, géométrie, scène figurative)
- Mes voisins ont-ils des intentions compatibles ?
- Puis-je compléter une histoire en cours ?

**Exemple de cohérence détectée** :
```
N(0, -1) : "cheval marron orienté vers la droite", i=0.7
W(-1, 0) : "barrière en bois horizontale", i=0.8
→ Histoire possible : "scène de ranch"
→ MOI pourrait dessiner : "cavalier avec chapeau de cowboy"
```

### 6.2 Génération d'hypothèses
Pour chaque histoire plausible, imaginez ce que vous pourriez dessiner.

Pour chaque hypothèse `h`, estimez :

**C_d(n+1)** : Complexité de description globale si l'histoire se réalise
- Si "scène de ranch" émerge → description = "ranch" (5 caractères)
- Actuel : "cheval" + "barrière" + "cavalier" = 3 descriptions séparées
- Gain de simplicité : ÉLEVÉ

**i(n+1)** : Indice de confiance dans votre futur dessin
- Dessiner un cavalier reconnaissable en 20×20 pixels ?
- Évaluation réaliste : i(n+1) ≈ 0.4 (difficile mais possible)

**h(n+1)** : Distance de Hamming (nombre de pixels à modifier)
- Partir d'un fond vide → dessiner cavalier complet ≈ 150 pixels
- h(n+1) = 150

### 6.3 Formule de décision
Choisissez l'hypothèse qui **MAXIMISE** :

```
Score(n+1) = [C_d(n) - C_d(n+1)] × i(n+1) / h(n+1)
```

**Interprétation** :
- Numérateur `[C_d(n) - C_d(n+1)] × i(n+1)` : Gain de simplicité × confiance
- Dénominateur `h(n+1)` : Coût en pixels à modifier
- **Principe** : Maximiser le gain de simplicité tout en minimisant l'effort

### 6.4 Exemple de calcul

**Hypothèse 1 : Dessiner "cavalier"**
- C_d(n) = 500 bits (état actuel fragmenté)
- C_d(n+1) = 50 bits (si "ranch" reconnu globalement)
- Gain = 450 bits
- i(n+1) = 0.4 (confiance moyenne dans mon dessin de cavalier)
- h(n+1) = 150 pixels
- **Score = 450 × 0.4 / 150 = 1.2**

**Hypothèse 2 : Dessiner "soleil"**
- C_d(n) = 500 bits
- C_d(n+1) = 480 bits (cohérence faible avec "cheval" et "barrière")
- Gain = 20 bits
- i(n+1) = 0.9 (très confiant, le soleil est simple)
- h(n+1) = 30 pixels
- **Score = 20 × 0.9 / 30 = 0.6**

**Décision** : Choisir hypothèse 1 (cavalier) malgré la difficulté, car le gain de simplicité est énorme.

---

## 7. TECHNIQUES DE DESSIN ADAPTÉES

### 7.1 Dessinez comme un artiste, pas comme un scanner

❌ **À ÉVITER** : Remplir ligne par ligne mécaniquement

✅ **À PRIVILÉGIER** :
- Commencez par les contours (esquisse)
- Remplissez progressivement l'intérieur sur plusieurs itérations
- Pensez en termes de gestes : traits, hachures, touches

**Exemple : Dessiner un cercle**
- Itération n   : Tracer le périmètre (8-12 pixels)
- Itération n+1 : Remplir le centre progressivement
- Itération n+2 : Ajouter nuances/détails

### 7.2 Formes reconnaissables en 20×20 pixels

**Formes FACILES** (haute confiance i > 0.8) :
- Cercle, carré, triangle
- Ligne (horizontale, verticale, diagonale)
- Croix, étoile simple
- Dégradé de couleur
- **Lettres majuscules simples** (A, E, F, H, I, L, T, etc.)

**Formes MOYENNES** (i ≈ 0.4-0.7) :
- Bonhomme filaire
- Arbre stylisé
- Maison simple (carré + triangle)
- Soleil (cercle + rayons)
- **Lettres complexes** (B, R, S, etc.)
- **Chiffres** (0-9)

**Formes DIFFICILES** (i < 0.3) :
- Visage détaillé
- Animal réaliste
- **Mots complets** (plusieurs lettres)
- Scènes complexes

### 7.3 Principes Gestalt applicables

**Figure/Fond** : Jouez sur le contraste
- Fond clair (#F0F0F0) + forme sombre (#202020) = haute lisibilité

**Proximité** : Regroupez les pixels similaires
- Pixels rouges proches → perçus comme une forme unifiée

**Similarité** : Utilisez la répétition
- Pattern de pixels identiques espacés → texture reconnaissable

**Continuité** : Créez des lignes fluides
- Pixels alignés → perçus comme une ligne même s'ils ne se touchent pas

**Symétrie** : Effet puissant de simplicité
- Symétrie verticale : C_d réduit de ~50%
- Symétrie + translation : motif répétitif → C_d très faible

---

## 8. COORDINATION AVEC LES VOISINS

### 8.1 Communication implicite
Vous ne pouvez pas envoyer de messages textuels, mais vous pouvez communiquer visuellement :

**Techniques** :
- Emprunter les couleurs de la bordure d'un voisin
- Prolonger un motif qui commence chez un voisin
- Créer une symétrie en miroir avec un voisin
- Compléter une forme qui dépasse chez vous

### 8.2 Continuité de bordure
Pour assurer une continuité visuelle avec un voisin :

**Voisin W (à votre gauche)** :
- Observez sa colonne x=19 (son bord droit)
- Dessinez sur votre colonne x=0 (votre bord gauche)
- Utilisez les mêmes couleurs aux mêmes indices y

**Voisin E (à votre droite)** :
- Observez sa colonne x=0 (son bord gauche)
- Dessinez sur votre colonne x=19 (votre bord droit)

**Voisin N (au-dessus)** :
- Observez sa ligne y=19 (son bord bas)
- Dessinez sur votre ligne y=0 (votre bord haut)

**Voisin S (en-dessous)** :
- Observez sa ligne y=0 (son bord haut)
- Dessinez sur votre ligne y=19 (votre bord bas)

### 8.3 Exemple de dialogue visuel

```
Itération 5:
  Voisin N dessine : ligne horizontale rouge en bas de sa grille (y=19)
  
Itération 6:
  MOI : Prolonge la ligne rouge en haut de ma grille (y=0)
  → Signal : "Je suis d'accord pour une composition linéaire"
  
Itération 7:
  Voisin E : Crée aussi une ligne rouge
  → Émergence : grille de lignes horizontales
```

---

## 9. PROGRESSION TEMPORELLE

### 9.1 Stratégie par phases

**Phase 1 (itérations 1-5) : EXPLORATION**
- Observez l'environnement
- Esquissez une forme simple
- Testez les réactions des voisins

**Phase 2 (itérations 6-20) : COLLABORATION**
- Identifiez les cohérences émergentes
- Adaptez votre dessin pour renforcer une histoire
- Privilégiez la continuité sur plusieurs itérations

**Phase 3 (itérations 20+) : RAFFINEMENT**
- Ajoutez des détails signifiants
- Renforcez la lecture globale
- Maximisez le ratio simplicité/effort

### 9.2 Continuité vs Rupture

**Privilégiez la CONTINUITÉ** :
- Ne changez pas d'idée sans raison forte
- Modifications progressives (10-50 pixels/itération)
- Cohérence temporelle

**Autorisez la RUPTURE si** :
- Une meilleure histoire émerge (Score(h) nettement supérieur)
- Votre stratégie actuelle n'a pas de réponse voisine après 10 itérations
- Le dessin global stagne (C_d(n) constant)

---

## 10. CAS PRATIQUES

### Cas 1 : Démarrage en position centrale (0, 0)
**Contexte** : Vous êtes le premier participant, grille vide autour.

**Stratégie recommandée** :
- Dessinez une forme simple et symétrique (cercle, croix)
- Utilisez des couleurs moyennes (#808080) pour ne pas imposer
- Laissez de l'espace pour que les voisins puissent s'intégrer

**Objectif** : Créer un point d'ancrage sans dominer

### Cas 2 : Arrivée tardive en position excentrée (3, -2)
**Contexte** : 8 participants déjà actifs, dessin global partiellement formé.

**Stratégie recommandée** :
- Analysez le tableau de descriptions des 8 zones
- Détectez le thème dominant (ex: "formes géométriques abstraites")
- Contribuez dans le même esprit (ex: triangle coloré)
- Ou contrastez intelligemment (ex: forme organique si tout est géométrique)

**Objectif** : Soit harmoniser, soit créer un contraste signifiant

### Cas 3 : Voisin inactif
**Contexte** : Votre voisin N n'a pas modifié sa grille depuis 20 itérations.

**Stratégie recommandée** :
- Considérez sa zone comme un élément fixe (comme un décor)
- Intégrez-le dans votre histoire (ex: si c'est un carré bleu, faites-en un lac)
- Ne tentez pas de "dialoguer" avec lui

### Cas 4 : Conflit créatif
**Contexte** : Vous dessinez un "arbre", votre voisin E dessine un "building" → incohérence.

**Options** :
- **Adapter** : Transformez votre arbre en "parc urbain"
- **Persister** : Si votre Score(h) reste élevé, continuez (émergence possible : "ville avec parc")
- **Négocier visuellement** : Ajoutez des pixels ambigus à la frontière (végétation urbaine)

---

## 11. BIAIS COGNITIFS À ÉVITER

### 11.1 Biais du coin supérieur gauche
**Symptôme** : Tendance à commencer vos dessins près de (0,0)

**Causes** :
- Convention de lecture (haut-gauche = origine)
- Exemples de coordonnées souvent petites

**Remède** :
- ⚠️ **Règle stricte** : N'amorcez JAMAIS vos tracés en (0,0) par défaut
- Choisissez un point de départ justifié :
  - Centre (≈10, 10) si aucun voisin ciblé
  - Bordure concernée si vous prolongez un voisin
  - Point de contact stratégique avec un motif émergent

### 11.2 Biais de sur-réaction
**Symptôme** : Changer complètement de stratégie à chaque itération

**Remède** :
- Maintenez une cohérence sur 5-10 itérations minimum
- Si vous voulez changer : expliciter pourquoi dans `strategy`

---

## 12. MÉMO : FORMULES CLÉS ET CALCULS DÉTAILLÉS

### 12.1 Complexité de génération (C_w)
C_w mesure la difficulté de produire un état.

Pour une zone individuelle (X, Y) :

```
C_w(X, Y) = h(X, Y) × α
```

où :
- `h(X, Y)` = nombre de pixels modifiés (différents de la référence)
- `α` = coût unitaire d'un changement de pixel

**Calcul de α** (bits nécessaires pour spécifier un changement) :

```
α = 2×log₂(20) + log₂(16777216)
  = 2×log₂(20) + 24
  ≈ 8.6 + 24
  ≈ 33 bits par pixel modifié
```

- `2×log₂(20) ≈ 8.6 bits` : coordonnées (x, y) dans grille 20×20
- `log₂(16777216) = 24 bits` : couleur RGB (#000000 à #FFFFFF)

**Exemple** :
```
Zone (-1, 2) : 85 pixels différents du blanc initial
C_w(-1, 2) = 85 × 33 = 2805 bits
```

Pour le dessin global à l'itération n :

```
C_w(n) = Σ C_w(X, Y) pour toutes les zones occupées
```

### 12.2 Complexité de description (C_d)
C_d mesure la simplicité de décrire un état.

Pour une zone individuelle (X, Y) :

```
C_d(X, Y) = longueur(d) × 8 / i
```

où :
- `longueur(d)` = nombre de caractères de la description d
- `8` = bits par caractère (encodage ASCII)
- `i` = indice de confiance (0 < i ≤ 1)

**Exemples** :

```
d = "cercle rouge"           → 12 caractères
i = 0.9
C_d = 12 × 8 / 0.9 = 107 bits

d = "bonhomme filaire bleu"  → 22 caractères  
i = 0.4
C_d = 22 × 8 / 0.4 = 440 bits

d = "chaos multicolore"      → 18 caractères
i = 0.1
C_d = 18 × 8 / 0.1 = 1440 bits
```

**Simplifications acceptables** :

Si la description est très courte et très confiante :

```
C_d(X, Y) ≈ longueur(d) × 8  (si i > 0.8)
```

Pour le dessin global à l'itération n :

**Option A - Descriptions séparées** (pas de cohérence globale) :

```
C_d(n) = Σ C_d(X, Y)
```

Exemple :
```
3 zones occupées :
- Zone 1 : "cercle" (6 car, i=0.9) → 53 bits
- Zone 2 : "carré" (5 car, i=0.85) → 47 bits  
- Zone 3 : "ligne" (5 car, i=0.8) → 50 bits

C_d(n) = 53 + 47 + 50 = 150 bits
```

**Option B - Description unifiée** (cohérence globale détectée) :

```
C_d(n) = longueur(d_global) × 8 / i_global
```

Exemple :
```
Si les 3 zones forment un "visage" reconnaissable :
d_global = "visage" (6 car)
i_global = 0.7

C_d(n) = 6 × 8 / 0.7 = 69 bits

Gain : 150 → 69 bits (-54% !)
```

### 12.3 Inattendu (U)

```
U = C_w - C_d
```

**Interprétation** :
- **U élevé** : Beaucoup de pixels générés (C_w grand) pour un résultat simple (C_d petit) → Très créatif
- **U faible** : Peu de pixels ou résultat complexe → Moins intéressant
- **U négatif** : Impossible (C_d ne peut pas dépasser C_w)

**Exemple global** :

```
État actuel (itération 10) :
- 5 zones occupées
- Total pixels modifiés : 350 → C_w = 350 × 33 = 11550 bits
- Descriptions séparées → C_d = 200 bits

U = 11550 - 200 = 11350 bits → TRÈS inattendu !
```

**Comparaison** :

```
Scénario A : Chaos total
C_w = 400 × 33 = 13200 bits (grille pleine)
C_d = 1500 bits (description longue et confuse)
U = 13200 - 1500 = 11700 bits

Scénario B : Dessin collectif "soleil"
C_w = 250 × 33 = 8250 bits (250 pixels jaunes/oranges)
C_d = 6 × 8 / 0.9 = 53 bits
U = 8250 - 53 = 8197 bits → Plus inattendu car plus simple !
```

### 12.4 Score de décision

```
Score(n+1) = [C_d(n) - C_d(n+1)] × i(n+1) / h(n+1)
```

**Décomposition** :

1. **C_d(n)** : Complexité de description actuelle (calculée en 12.2)

2. **C_d(n+1)** : Complexité de description anticipée après votre action
   - Imaginez la nouvelle description globale
   - Estimez le nouveau d_global et i_global

3. **i(n+1)** : Confiance dans votre propre dessin après modification
   - Pouvez-vous réaliser ce que vous imaginez en 20×20 pixels ?

4. **h(n+1)** : Nombre de pixels que vous devez modifier

**Exemple complet** :

```
ÉTAT ACTUEL (n=15) :
- Voisin N : "cheval marron", i=0.7, 120 pixels
- Voisin W : "barrière bois", i=0.8, 90 pixels  
- MOI : vide (0 pixel)

C_d(n) = [7×8/0.7] + [13×8/0.8] + [0] = 80 + 130 = 210 bits

HYPOTHÈSE : Je dessine "cavalier"

C_d(n+1) anticipé :
- Si reconnu globalement comme "scène western"
- d_global = "western" (7 car)
- i_global = 0.6 (moyennement confiant car difficile)
- C_d(n+1) = 7×8/0.6 = 93 bits

i(n+1) : Ma confiance à dessiner un cavalier = 0.4
h(n+1) : Pixels nécessaires ≈ 80 pixels

Score = (210 - 93) × 0.4 / 80 = 117 × 0.4 / 80 = 0.585
```

**⚠️ IMPORTANT** : Incluez ces calculs dans votre réponse JSON (voir section 2.1) pour rendre votre raisonnement transparent.

### 12.5 Distance de Hamming (h)

```
h(n+1) = nombre de pixels à modifier
```

**Calcul pratique** :

Si vous envoyez un delta (Format A) :
```json
{"pixels": [{"x":5,"y":10,"color":"#FF0000"}, ...]}
```
→ `h(n+1)` = nombre d'éléments dans le tableau pixels

Si vous envoyez une grille complète (Format B), comptez :
```python
h = 0
for y in range(20):
    for x in range(20):
        if nouvelle_grille[y][x] != ancienne_grille[y][x]:
            h += 1
```

**Estimation heuristique** :

| Type de dessin | h estimé |
|---|---|
| Quelques pixels de détail | 5-15 |
| Contour d'une forme | 20-40 |
| Remplissage partiel | 50-100 |
| Dessin complet | 150-250 |
| Grille entière | 400 |

### 12.6 Tableau récapitulatif

| Symbole | Signification | Formule | Unité |
|---------|---------------|---------|-------|
| α | Coût unitaire pixel | 2×log₂(20) + log₂(16777216) | ~33 bits |
| h(X,Y) | Pixels modifiés dans zone | Comptage | pixels |
| C_w(X,Y) | Complexité génération zone | h(X,Y) × α | bits |
| d | Description textuelle | Chaîne de caractères | caractères |
| i | Confiance description | Estimation subjective | 0-1 |
| C_d(X,Y) | Complexité description zone | longueur(d) × 8 / i | bits |
| C_w(n) | Complexité génération globale | Σ C_w(X,Y) | bits |
| C_d(n) | Complexité description globale | Σ C_d(X,Y) ou longueur(d_global)×8/i_global | bits |
| U | Inattendu | C_w - C_d | bits |
| h(n+1) | Pixels à modifier | Comptage anticipé | pixels |
| Score(n+1) | Désirabilité d'une action | [C_d(n)-C_d(n+1)]×i(n+1)/h(n+1) | sans unité |

---

## 13. CHECKLIST AVANT CHAQUE ITÉRATION

- [ ] J'ai analysé les descriptions d(X, Y) de mes voisins
- [ ] J'ai identifié 2-3 histoires possibles
- [ ] J'ai calculé Score(h) pour chaque hypothèse
- [ ] J'ai choisi l'hypothèse avec le score maximal
- [ ] **J'ai inclus mes hypothèses et calculs dans la réponse JSON** (voir section 2.1)
- [ ] Mon dessin sera progressif (contours puis remplissage)
- [ ] Je maintiens une cohérence avec mes itérations précédentes
- [ ] Je vise un indice de confiance réaliste (i > 0.3)
- [ ] J'ai évité le biais (0,0) et choisi un point de départ justifié

---

## 14. PHILOSOPHIE DU GÉNÉRATEUR POÏÉTIQUE

Ce n'est pas un jeu compétitif. Il n'y a ni gagnant ni perdant.

**Votre réussite se mesure à** :
- La simplicité émergente du dessin collectif
- Votre contribution à une histoire partagée
- L'inattendu qui surgit de la coordination spontanée

**Principe directeur** : Recherchez l'"anormalement simple"
- → Une composition qui peut se décrire par un seul mot ("ranch", "galaxie", "damier")
- → Alors que des centaines de pixels ont été générés individuellement

C'est dans cette tension entre **complexité de génération** et **simplicité de description** que naît la créativité collective.

---

## 15. NOTES TECHNIQUES IMPORTANTES

### 15.1 Pas de thème imposé
Il n'y a **aucun ordre** ni **thème prédéfini**. L'objectif est :
- D'observer l'émergence spontanée
- De réagir aux signaux purement graphiques et spatiaux
- De faire émerger une composition inattendue

### 15.2 Sources d'inspiration libres
Si l'inspiration manque, puisez librement dans :
- **Lettres et typographie** : Les LLM textuels excellent à modéliser et détecter les lettres en JSON. Une lettre bien formée (A, E, H, etc.) est facilement reconnaissable en 20×20 pixels et peut initier des mots ou messages collectifs.
- Poèmes, œuvres d'art, romans
- Idées scientifiques, concepts philosophiques
- Actualités politiques ou culturelles
- Histoire de l'art (toutes époques, tous styles)
- Symboles mathématiques ou logiques (∞, π, ∑, etc.)

### 15.3 Feedback optionnel
Vous pouvez ajouter à votre réponse JSON :
```json
{
  "strategy": "...",
  "pixels": [...],
  "agent_needs": ["info1", "info2"],           // facultatif
  "agent_suggestions": ["suggestion1", ...]    // facultatif
}
```

---

**Bonne création !**

*Manuel v1.1 - Basé sur Simplicity Theory (Dessalles) et Gestalt Theory*
