# LLaVA V2 - Fond Noir (Version 43)

**Date**: 2025-01-23  
**Objectif**: Permettre à LLaVA de voir clairement ce qu'il dessine

---

## 🎯 **Changements Appliqués**

### **1. Fond Noir (pas d'initial state coloré)**
**Fichier**: `public/js/ai-player.js` (ligne 628-648)

**Avant** : Grille initialisée avec 400 couleurs aléatoires (ColorGenerator)  
**Après** : Fond noir uniquement

```javascript
// COMMENTÉ: Génération de la grille aléatoire initiale
console.log('[AI Player] Mode V2: Fond noir (pas de grille initiale colorée)');
```

**Résultat** : LLaVA voit ses pixels sur fond noir, pas de confusion avec le chaos coloré

---

### **2. Viewer par Défaut : viewer2**
**Fichier**: `public/ai-player-v2.html`

**Avant** : `/viewer3` (ColorGenerator + buffer)  
**Après** : `/viewer2` (fond noir + buffer)

```html
<iframe id="viewer-frame" src="/viewer2"></iframe>
<option value="/viewer2" selected>Viewer2 (LLM - black bg + buffer)</option>
```

---

### **3. Prompts Adaptés**
**Fichier**: `public/llava-prompts-v2.json`

#### **seed_system**
**Avant** :
```
The grid has been initialized with 400 randomly generated colors
Observe this colorful chaos and propose a SIMPLIFICATION
```

**Après** :
```
The grid is EMPTY (black background).
You will see a black 20x20 grid image.
Draw a simple, recognizable shape on this black background.
```

#### **memory_context**
**Avant** :
```
CURRENT STATE OF YOUR 20x20 GRID:
{{colorPalette}}
```

**Après** :
```
CURRENT STATE OF YOUR 20x20 GRID:
You will see an image showing what you have drawn so far on black background.
Pixels you drew: {{colorPalette}}
```

---

## 🔍 **Analyse des Bugs**

### **Pourquoi LLaVA mélange français/anglais ?**

**Réponse** : Comportement normal des LLMs multilingues
- LLaVA 7B a été entraîné sur du texte multilingue
- Il "switche" parfois de langue spontanément
- **Aucun français dans le prompt** → Le problème vient du modèle lui-même
- **Solution** : Parser robuste qui accepte les deux langues

### **Pourquoi LLaVA écrit ## au lieu de # ?**

**Réponse** : Confusion avec Markdown/CSS
- `##` = Titre niveau 2 en Markdown
- `##` pourrait être une confusion avec les sélecteurs CSS
- **Aucun `##` dans le prompt** → LLaVA invente ça
- **Solution** : Parser accepte `#{1,2}` (regex flexible)

---

## 📊 **Résultats Attendus**

### **Avant (avec ColorGenerator)**
- LLaVA voit : Chaos coloré (400 pixels aléatoires)
- LLaVA dit : "The grid is empty" ou "chaotic multicolor grid"
- **Confusion totale** : Ne distingue pas ses pixels du fond

### **Après (fond noir)**
- LLaVA voit : Fond noir + ses pixels dessinés
- LLaVA dit : "I see: [ce qu'il a dessiné]"
- **Clarté visuelle** : Voit exactement ce qu'il dessine

---

## 🧪 **Tests à Effectuer**

1. ✅ Recharger `http://localhost:3001/ai-player-v2` (Ctrl+Shift+R)
2. ✅ Vérifier console : `Mode V2: Fond noir (pas de grille initiale colorée)`
3. ✅ Vérifier console : `Prompts chargés (v43 - BLACK BG, no initial state)`
4. ⏳ Lancer un agent et observer :
   - Viewer2 (fond noir) chargé par défaut
   - Images envoyées à LLaVA : fond noir + pixels
   - LLaVA décrit ce qu'il voit correctement
   - Moins de réponses "empty grid"

---

## 📝 **Fichiers Modifiés**

1. **`public/js/ai-player.js`**
   - Ligne 628-648 : Commenté génération `initialGeneratedState`
   - Version : `v20250123-131`

2. **`public/llava-prompts-v2.json`**
   - `seed_system` : "EMPTY (black background)"
   - `memory_context` : "what you have drawn so far on black background"

3. **`public/js/llm-adapters/llava-v2.js`**
   - Cache-busting : `?v=20250123-43`
   - Log : "BLACK BG, no initial state"

4. **`public/ai-player-v2.html`**
   - Viewer par défaut : `/viewer2`
   - Version : `llava-v2.js?v=43`, `ai-player.js?v=20250123-131`

---

**Status**: ✅ Prêt à tester  
**Impact**: LLaVA devrait maintenant voir clairement ce qu'il dessine ! 🎨
