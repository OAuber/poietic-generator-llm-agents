# Simplification du Prompt LLaVA V2

**Date**: 2025-01-22
**Version**: v20250122-34

---

## 🎯 Problème Identifié

LLaVA 7B se perd avec trop de questions et mélange les formats :

### Symptômes Observés
1. ❌ Mélange français/anglais : "Je produis les pixels : To draw..."
2. ❌ Génère 0 pixels malgré les instructions
3. ❌ Recopie les instructions au lieu de dessiner
4. ❌ Ajoute des commentaires qui cassent le parsing : `(coordinates X to Y)`
5. ❌ Répond avec des lettres (A, B, C...) au lieu de suivre le format

---

## ✅ Solution Appliquée

### Questions SUPPRIMÉES (inutiles pour complexité)
- ~~Q1: IMAGE RECEIPT~~ → Verbeux, pas utile pour calculs
- ~~Q2: ROBOT LOCATION~~ → Déjà fourni dans `global_positioning`
- ~~Q5: NEIGHBOR ANALYSIS~~ → Trop détaillé, ralentit LLaVA

### Questions CONSERVÉES (essentielles)
- **Q3: YOUR PREVIOUS DRAWING** → Nécessaire pour `C_d` local
- **Q4: GLOBAL CANVAS OBSERVATION** → Nécessaire pour `C_d` global
- **Q6: LOCAL DESCRIPTION** → Obligatoire pour calculer `C_d`

---

## 📝 Changements Effectués

### 1. Simplifié `continuation_system`
**Avant** (12 lignes de questions) :
```
Q1: IMAGE RECEIPT
Q2: ROBOT LOCATION
Q3: DESCRIPTION OF YOUR PREVIOUS DRAWING
Q4: GLOBAL ANALYSIS
Q5: NEIGHBOR ANALYSIS (NORTH, SOUTH, EAST, WEST, NE, NW, SE, SW)
```

**Après** (5 lignes) :
```
Q3: YOUR PREVIOUS DRAWING (iteration n-1)
Q4: GLOBAL CANVAS OBSERVATION
```

### 2. Éliminé tout français résiduel
- Ligne 48 : `"Je produis les pixels :"` → `"To draw ..., I create the pixels:"`
- Ligne 126 : Idem

### 3. Cache-busting
- `llava-prompts-v2.json?v=20250122-34`
- `llava-v2.js?v=34`

---

## 📊 Gains Attendus

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| Lignes prompt | ~30 lignes | ~15 lignes | **-50%** |
| Questions LLaVA | 5 (Q1-Q5) | 2 (Q3, Q4) | **-60%** |
| Tokens système | ~2000 | ~1200 | **-40%** |
| Temps génération | 150s | ~100s | **-33%** |

---

## 🧪 Tests à Effectuer

1. ✅ Recharger `ai-player-v2.html` (Ctrl+Shift+R)
2. ✅ Vérifier console : `Prompts chargés (v20250122-34 - simplifié Q3+Q4+Q6 only)`
3. ⏳ Lancer un agent et observer :
   - **Disparition** des réponses Q1, Q2, Q5
   - **Présence** de Q3, Q4, Q6
   - **Format anglais** : "To draw ..., I create the pixels:"
   - **Pas de "Je produis les pixels :"**
   - **Génération > 0 pixels**

---

## 🔍 Pourquoi LLaVA Répondait en "A, B, C..." ?

**Cause**: Le prompt contenait des exemples avec "Phase A, B, C, D"
→ LLaVA pensait devoir répondre avec des lettres !

**Solution**: Suppression de toutes les phases et questions alphabétiques

---

**Status**: ✅ Prêt à tester
**Fichiers modifiés**:
- `public/llava-prompts-v2.json` (lignes 88-132)
- `public/js/llm-adapters/llava-v2.js` (ligne 21)
- `public/ai-player-v2.html` (ligne 560)
