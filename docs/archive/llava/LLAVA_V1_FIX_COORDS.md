# Fix LLaVA V1 - Coordonnées Invalides (20, 30, 40...)

**Date**: 2025-01-23  
**Problème**: `ai-player.html` génère des coordonnées invalides (x=20, 30, 40...) au lieu de 0-19

---

## 🔍 **Diagnostic**

### **Fichiers de Prompts**
```
ai-player.html     → llava.js     → llava-prompts.json     (V1 original)
ai-player-v2.html  → llava-v2.js  → llava-prompts-v2.json  (V2 nouveau)
```

### **Logs Montrant le Problème**
```javascript
llava.js:539 [LLaVA] Coordonnées invalides ignorées: 20,0
llava.js:539 [LLaVA] Coordonnées invalides ignorées: 30,0
llava.js:539 [LLaVA] Coordonnées invalides ignorées: 40,0
llava.js:539 [LLaVA] Coordonnées invalides ignorées: 50,0
```

### **Réponse de LLaVA**
```
pixels: 0,0#FFF 10,0#FFF 20,0#FFF 30,0#FFF 40,0#FFF 50,0#FFF ...
```

**LLaVA pense en pixels absolus (0, 10, 20, 30...) au lieu de coordonnées de grille (0-19)** 😱

---

## ✅ **Solution Appliquée**

Ajout d'exemples **EXPLICITES** avec format CORRECT/WRONG :

### **Avant (Ambigu)**
```json
"- Each coordinate x,y must be an integer from 0 to 19.",
"- CRITICAL: x ∈ {0..19} and y ∈ {0..19}.",
"- NEVER use coordinates outside 0-19 range (like 20, 21, etc.)"
```

### **Après (Explicite)**
```json
"- Each coordinate x,y must be an integer from 0 to 19.",
"- CRITICAL: x ∈ {0..19} and y ∈ {0..19}.",
"- NEVER use coordinates outside 0-19 range (like 20, 21, etc.)",
"- CORRECT EXAMPLES: 0,0#FFF 10,5#F00 19,19#00F",
"- WRONG EXAMPLES: 20,0#FFF (x=20 is OUT OF BOUNDS!) 30,0#F00 (x=30 is OUT OF BOUNDS!)"
```

---

## 📊 **Changements Détaillés**

### **1. `llava-prompts.json` - seed_system (ligne 13-20)**
```diff
  "COMMAND FORMAT AND GUIDELINES:",
  "- The command format is: pixels: x,y#HEX x,y#HEX ...",
  "- Example: pixels: 3,2#{{color1}} 19,7#{{color2}} ...",
  "- Each coordinate x,y must be an integer from 0 to 19.",
  "- CRITICAL: x ∈ {0..19} and y ∈ {0..19}.",
  "- NEVER use coordinates outside 0-19 range (like 20, 21, etc.)",
+ "- CORRECT EXAMPLES: 0,0#FFF 10,5#F00 19,19#00F",
+ "- WRONG EXAMPLES: 20,0#FFF (x=20 is OUT OF BOUNDS!) 30,0#F00 (x=30 is OUT OF BOUNDS!)",
```

### **2. `llava-prompts.json` - continuation_system (ligne 87-93)**
```diff
  "COMMAND FORMAT:",
  "- Format: pixels: x,y#HEX x,y#HEX ...",
  "- Example: pixels: 3,2#{{color1}} 19,7#{{color2}} ...",
  "- Coordinates: x,y must be integers from 0 to 19",
+ "- CORRECT EXAMPLES: 0,0#FFF 10,5#F00 19,19#00F",
+ "- WRONG EXAMPLES: 20,0#FFF (x=20 is OUT OF BOUNDS!) 30,0#F00 (x=30 is OUT OF BOUNDS!)",
  "- Colors: Use valid HEX format (#RGB or #RRGGBB)",
```

### **3. `llava.js` - Cache-busting**
```diff
- const response = await fetch('/llava-prompts.json?v=20250116');
+ const response = await fetch('/llava-prompts.json?v=20250123-fix-coords');
- console.log('🧾 [LLaVA] Prompts chargés');
+ console.log('🧾 [LLaVA] Prompts chargés (v20250123 - Fix coordinates 0-19)');
```

### **4. `ai-player.html` - Version script**
```diff
- <script type="module" src="js/llm-adapters/llava.js?v=20250116-71"></script>
+ <script type="module" src="js/llm-adapters/llava.js?v=20250123-72"></script>
```

---

## 🎯 **Résultats Attendus**

### **Avant (Bugué)**
```
pixels: 0,0#FFF 10,0#FFF 20,0#FFF 30,0#FFF 40,0#FFF ...
         ✅       ✅       ❌ OUT   ❌ OUT   ❌ OUT
```

### **Après (Attendu)**
```
pixels: 0,0#FFF 10,0#FFF 19,0#FFF 15,5#F00 5,10#00F ...
         ✅       ✅       ✅       ✅       ✅
```

---

## 🧪 **Tests à Effectuer**

1. ✅ Recharger `http://localhost:3001/ai-player` (Ctrl+Shift+R)
2. ✅ Vérifier console : `Prompts chargés (v20250123 - Fix coordinates 0-19)`
3. ⏳ Lancer un agent et observer :
   - **Coordonnées valides** : x ∈ [0, 19], y ∈ [0, 19]
   - **Moins d'avertissements** : "Coordonnées invalides ignorées"
   - **Pixels visibles** dans le viewer

---

## 📝 **Fichiers Modifiés**

1. **`public/llava-prompts.json`**
   - Ligne 19-20 : Exemples CORRECT/WRONG dans `seed_system`
   - Ligne 91-92 : Exemples CORRECT/WRONG dans `continuation_system`

2. **`public/js/llm-adapters/llava.js`**
   - Cache-busting : `?v=20250123-fix-coords`
   - Log : "Fix coordinates 0-19"

3. **`public/ai-player.html`**
   - Version : `llava.js?v=20250123-72`

---

## 📌 **Notes Importantes**

### **Architecture des Fichiers**
```
ai-player.html     → llava.js     → llava-prompts.json     (V1 - pour humains)
ai-player-v2.html  → llava-v2.js  → llava-prompts-v2.json  (V2 - expérimental)
```

**Ne pas toucher à `ai-player.html` et `llava-prompts.json`** sauf pour des bugs critiques comme celui-ci.

---

**Status**: ✅ Prêt à tester  
**Impact**: Devrait éliminer les coordonnées invalides (x=20, 30, 40...) ! 🎯
