# LLaVA V2 Prompt Simplification - Version 37

**Date**: 2025-01-22  
**Version**: v20250122-37

---

## 🎯 Objectif

Simplifier drastiquement le prompt pour réduire confusion de LLaVA 7B et éliminer tous les exemples de "mauvais formats" qui polluaient les réponses.

---

## ✅ Changements Appliqués

### 1. **Questions Réduites** (Q1, Q2, Q5 supprimées)
- ❌ ~~Q1: IMAGE RECEIPT~~ → Verbeux, pas utile
- ❌ ~~Q2: ROBOT LOCATION~~ → Redondant avec `global_positioning`
- ✅ **Q3: YOUR PREVIOUS DRAWING** → Nécessaire pour C_d local
- ✅ **Q4: GLOBAL CANVAS OBSERVATION** → Nécessaire pour C_d global
- ❌ ~~Q5: NEIGHBOR ANALYSIS~~ → Trop détaillé
- ✅ **Q6: LOCAL DESCRIPTION** → Obligatoire pour C_d

### 2. **Format de Réponse Structuré**
Toutes les questions utilisent maintenant :
```
Answer in this format: I see: [your description]
```

**Parsing facile** : Extraction directe avec regex `I see:\s*(.+?)`

### 3. **Suppression des Exemples "WRONG FORMAT"**
**Avant** (30 lignes polluantes) :
```
❌ WRONG FORMAT (DO NOT USE):
  5,10##FF0000    (double ## is WRONG)
  5,10#FF00       (4 chars is incomplete)
  0,20#FF0000     (y=20 OUT OF BOUNDS, max=19!)
  ...
```

**Après** (3 lignes concises) :
```
CRITICAL CONSTRAINTS:
- Grid: 20x20 pixels (coordinates 0-19, max is 19)
- Format: x,y#HEX (one # followed by 3 or 6 hex chars)
- Examples: 5,10#{{color7}} or 0,0#{{color8}} or 19,19#{{color9}}
```

### 4. **Suppression de "REMEMBER"**
Section redondante supprimée (5 lignes)

### 5. **Tous les Exemples Utilisent des Placeholders**
**Avant** :
```
- Examples: 5,10#FF0000 or 0,0#FFF or 19,19#00FF00
```
→ LLaVA copiait ces couleurs fixes !

**Après** :
```
- Examples: 5,10#{{color7}} or 0,0#{{color8}} or 19,19#{{color9}}
```

**Code mis à jour** :
- `llava-v2.js` génère maintenant **12 couleurs aléatoires** (lignes 52-55 et 88-91)
- Remplace `{{color1}}` à `{{color12}}` dans le prompt

### 6. **Suppression du Français Résiduel**
- `"Je produis les pixels :"` → `"To draw ..., I create the pixels:"`

---

## 📊 Résultat Final

### Longueur du Prompt

| Section | Avant | Après | Réduction |
|---------|-------|-------|-----------|
| `seed_system` | ~50 lignes | ~36 lignes | **-28%** |
| `continuation_system` | ~32 lignes | ~17 lignes | **-47%** |
| **Total** | ~82 lignes | ~53 lignes | **-35%** |

### Tokens Estimés

| Prompt | Avant | Après | Réduction |
|--------|-------|-------|-----------|
| Système (texte seul) | ~2000 chars | ~1200 chars | **-40%** |
| Avec images | 8000-32000 | 5000-25000 | **~25%** |

---

## 🧪 Améliorations Attendues

1. ✅ **Moins de confusion** : Q1, Q2, Q5 supprimées
2. ✅ **Pas de copie de couleurs** : Tous placeholders `{{colorX}}`
3. ✅ **Parsing facile** : Format "I see: ..." structuré
4. ✅ **Pas de "mauvais exemples"** : WRONG FORMAT supprimé
5. ✅ **100% anglais** : "Je produis..." supprimé
6. ✅ **Plus rapide** : -40% de tokens système

---

## 📝 Fichiers Modifiés

1. **`public/llava-prompts-v2.json`**
   - Supprimé Q1, Q2, Q5
   - Ajouté "Answer in this format: I see: ..."
   - Remplacé couleurs fixes par `{{color4}}` à `{{color9}}`
   - Supprimé WRONG FORMAT et REMEMBER

2. **`public/js/llm-adapters/llava-v2.js`**
   - Changé `randomColors.length >= 8` → `>= 12`
   - Changé boucle `for (let i = 0; i < 8; ...)` → `i < 12`
   - Cache-busting: `?v=20250122-37`
   - Ajouté parser pour "I see: ..." (Q3, Q4, Q6)

3. **`public/ai-player-v2.html`**
   - Version: `llava-v2.js?v=37`

---

## 🔍 Tests à Effectuer

1. ✅ Recharger `http://localhost:3001/ai-player-v2` (Ctrl+Shift+R)
2. ✅ Vérifier console : `Prompts chargés (v37 - all colors = placeholders, 12 random colors)`
3. ⏳ Lancer un agent et observer :
   - **Réponses Q3, Q4 au format "I see: ..."**
   - **Pas de Q1, Q2, Q5**
   - **Couleurs variées** (pas toujours #FF0000)
   - **Format "To draw ..., I create the pixels:"** uniquement
   - **Génération > 0 pixels**
   - **Temps de réponse réduit** (~100s au lieu de 150s)

---

**Status**: ✅ Prêt à tester  
**Version précédente**: v36 (format "I see:", mais avec WRONG examples)  
**Version actuelle**: v37 (minimal, placeholders partout)
