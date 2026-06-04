# LLaVA V2 - Fix Double Hash `##` (Version 44)

**Date**: 2025-01-23  
**Problème**: LLaVA écrit `##` au lieu de `#` (ex: `4,1##9B8CFF`)

---

## 🔍 **Diagnostic**

### **Observations des Logs**
```
Iteration #4:
4,1##9B8CFF  ← Double hash
2,2##FF000   ← Double hash + couleur tronquée (5 chars au lieu de 6)
10,2##FF8C00 ← Double hash
```

### **Cause Racine**
LLaVA confond le format avec :
1. **Markdown** : `##` = titre niveau 2
2. **CSS** : Confusion avec les sélecteurs
3. **Exemples pas assez explicites** : Le prompt disait "one # followed by 3 or 6 hex chars" mais pas assez clair

---

## ✅ **Solution Appliquée**

### **Avant (Ambigu)**
```json
"- Format: x,y#HEX (one # followed by 3 or 6 hex chars)",
"- Examples: 5,10#{{color4}} or 0,0#{{color5}} or 19,19#{{color6}}"
```

### **Après (Explicite)**
```json
"- Format: x,y#HEX (EXACTLY ONE # followed by 6 hex chars)",
"- CORRECT: 5,10#FF0000 or 0,0#00FF00 or 19,19#0000FF",
"- WRONG: 5,10##FF0000 (two #) or 0,0#F00 (too short)"
```

---

## 📊 **Changements Détaillés**

### **1. seed_system (ligne 31-35)**
```diff
- "- Format: x,y#HEX (one # followed by 3 or 6 hex chars)",
- "- Examples: 5,10#{{color4}} or 0,0#{{color5}} or 19,19#{{color6}}",
+ "- Format: x,y#HEX (EXACTLY ONE # followed by 6 hex chars)",
+ "- CORRECT: 5,10#FF0000 or 0,0#00FF00 or 19,19#0000FF",
+ "- WRONG: 5,10##FF0000 (two #) or 0,0#F00 (too short)",
```

### **2. continuation_system (ligne 89-93)**
```diff
- "- Format: x,y#HEX (one # followed by 3 or 6 hex chars)",
- "- Examples: 5,10#{{color7}} or 0,0#{{color8}} or 19,19#{{color9}}",
+ "- Format: x,y#HEX (EXACTLY ONE # followed by 6 hex chars)",
+ "- CORRECT: 5,10#FF0000 or 0,0#00FF00 or 19,19#0000FF",
+ "- WRONG: 5,10##FF0000 (two #) or 0,0#F00 (too short)",
```

---

## 🎯 **Résultats Attendus**

### **Avant (Bugué)**
```
4,1##9B8CFF   ← Double hash
2,2##FF000    ← Double hash + 5 chars
10,2##FF8C00  ← Double hash
```

### **Après (Attendu)**
```
4,1#9B8CFF   ← Single hash ✅
2,2#FF0000   ← Single hash + 6 chars ✅
10,2#FF8C00  ← Single hash ✅
```

---

## 📝 **Fichiers Modifiés**

1. **`public/llava-prompts-v2.json`**
   - Ligne 31-35 : `seed_system` - Format explicite
   - Ligne 89-93 : `continuation_system` - Format explicite

2. **`public/js/llm-adapters/llava-v2.js`**
   - Cache-busting : `?v=20250123-44`
   - Log : "Explicit single # format"

3. **`public/ai-player-v2.html`**
   - Version : `llava-v2.js?v=44`

---

## 🧪 **Tests à Effectuer**

1. ✅ Recharger `http://localhost:3001/ai-player-v2` (Ctrl+Shift+R)
2. ✅ Vérifier console : `Prompts chargés (v44 - Explicit single # format)`
3. ⏳ Lancer un agent et observer :
   - **Pixels avec un seul `#`** : `4,1#9B8CFF`
   - **Couleurs à 6 caractères** : `#FF0000` (pas `#F00`)
   - **Moins d'erreurs de parsing**

---

## 📌 **Autres Observations**

### **Itération #3 Bizarre**
```
I see: No grid data
[Dessine 8 pixels quand même]
I see: No grid data
```

**Hypothèse** : LLaVA ne voit pas l'image correctement à cette itération
**Action** : Surveiller si ça se reproduit avec le fond noir

---

**Status**: ✅ Prêt à tester  
**Impact**: Devrait réduire drastiquement les `##` ! 🎯
