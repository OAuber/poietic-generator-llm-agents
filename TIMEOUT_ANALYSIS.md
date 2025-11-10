# Analyse du Timeout LLaVA (90 secondes)

**Date**: 2025-01-22
**Problème**: `Timeout: LLaVA V2 n'a pas répondu dans les 90 secondes`

---

## 🔍 Causes Potentielles

### 1. **Timeouts en Cascade**
- **Client JS** (`llava-v2.js`): 90 secondes
- **Serveur Python** (`poietic_ai_server.py`): 120 secondes
- **Ollama**: Pas de timeout configuré (peut prendre 300+ secondes)

→ Le client abandonne avant que le serveur n'ait terminé

### 2. **Taille du Prompt**

#### Iteration 0 (seed_system)
```
seed_system: ~2000 chars
```

#### Iteration ≥1 (BEAUCOUP PLUS LONG!)
```
memory_context: ~1500 chars
  + {{colorPalette}}: 400-4000 chars (selon iter)
  + {{localDescription}}: 50-200 chars
  + {{globalDescription}}: 50-200 chars
global_positioning: ~300 chars
continuation_system: ~2500 chars

TOTAL: 4500-8500 chars = 1100-2100 tokens (texte seul)
```

### 3. **Images Base64**

**2 images** à chaque requête:
- Local canvas: 300x300 PNG → ~30000 chars Base64
- Global canvas: 300x300 à 900x900 PNG → 30000-120000 chars Base64

**TOTAL avec images**: 34500-128500 chars = 8600-32000 tokens

**LLaVA 7B limite**: ~4096 tokens de contexte
→ **DÉPASSEMENT MAJEUR!**

### 4. **Génération Lente**

- `max_tokens: 3000` (réponse attendue)
- LLaVA 7B sur GPU partagé: ~10-20 tokens/seconde
- **Temps de génération**: 3000 / 15 = **200 secondes!**

---

## 💡 Solutions Proposées

### Solution 1: Réduire `max_tokens`
**Avant**: 3000 tokens
**Après**: 1500 tokens

**Justification**:
- Une réponse de 400 pixels = ~800 tokens maximum
- Q1-Q6 descriptions = ~200 tokens
- **Total nécessaire**: ~1000 tokens
- Marge de 500 tokens OK

**Impact**: Génération 2x plus rapide (100s → 50s)

### Solution 2: Réduire taille des images
**Avant**: 300x300 (ou plus pour global)
**Après**: 200x200

**Justification**:
- LLaVA voit quand même la grille
- Réduction de 44% de la taille Base64
- Moins de tokens utilisés

### Solution 3: Augmenter timeout client
**Avant**: 90 secondes
**Après**: 150 secondes

**Justification**:
- Laisse le temps à LLaVA de finir
- Aligné avec le timeout serveur (120s)
- Solution temporaire

### Solution 4: Simplifier continuation_system
**Problème**: Q1-Q6 trop verbeux
**Solution**: Réduire les instructions, garder essentiel

---

## 🎯 Solution Recommandée (Combo)

1. ✅ Réduire `max_tokens` à **1500**
2. ✅ Augmenter timeout client à **150s**
3. ⚠️ Garder colorPalette réduit (déjà fait)
4. ⏳ (Optionnel) Réduire images à 200x200 si encore timeout

**Gain estimé**: 
- Génération: 200s → 100s
- Timeout: 90s → 150s
- **Résultat**: Plus de timeout! ✅

---

## 📝 Logs Diagnostiques Ajoutés

Ligne 107-114 de `llava-v2.js`:
```javascript
console.log('[LLaVA V2] 📏 Prompt size:', {
    systemMessage: X chars,
    userMessage: Y chars,
    totalChars: X+Y,
    estimatedTokens: (X+Y)/4
});
```

**À surveiller**: 
- Si `estimatedTokens > 4000` → Prompt trop long!
- Si `systemMessage > 10000 chars` → Réduire colorPalette

---

## 🚀 Actions Immédiates

1. Réduire `max_tokens` à 1500
2. Augmenter timeout client à 150s
3. Lancer un agent et surveiller les logs
4. Vérifier temps de réponse réel

---

**Status**: En attente de validation pour implémenter les solutions
