# Analyse des Métriques Simplicity Theory

## Formules Actuellement Implémentées

### Dans `ai-player.js` (lignes 1250-1259)

```javascript
calculateSimplicityMetrics(description, pixelCount) {
    const alpha = 33; // bits par pixel (2×log₂(20) + log₂(16777216) ≈ 33)
    const C_w = pixelCount * alpha; // Complexité de génération
    const C_d = description.length * 8; // Complexité de description (8 bits par caractère)
    const U = C_w - C_d; // Inattendu
    
    return { C_w, C_d, U };
}
```

### Explication des Paramètres

#### 1. `alpha = 33` (bits par pixel)
- **Calcul théorique** : `2×log₂(20) + log₂(16777216)`
  - `log₂(20) ≈ 4.32` → position X sur une grille 20×20
  - `log₂(20) ≈ 4.32` → position Y sur une grille 20×20
  - `log₂(16777216) ≈ 24` → couleur RGB 24-bit
  - Total : `2×4.32 + 24 ≈ 32.64` → arrondi à **33 bits**

#### 2. `C_w = pixelCount * alpha` (Complexité de génération)
- Mesure la quantité d'information générée
- Exemple : 10 pixels → `C_w = 10 × 33 = 330 bits`

#### 3. `C_d = description.length * 8` (Complexité de description)
- Mesure la quantité d'information utilisée pour décrire l'action
- `8 bits = 1 octet` par caractère ASCII
- Exemple : 50 caractères → `C_d = 50 × 8 = 400 bits`

#### 4. `U = C_w - C_d` (Unexpectedness / Inattendu)
- Mesure l'écart entre génération et description
- **U > 0** : l'agent dessine plus qu'il ne décrit (créativité élevée)
- **U < 0** : l'agent décrit sans dessiner (parasite)
- **U ≈ 0** : équilibre entre génération et description

### Validation des Métriques

```javascript
storeSimplicityMetrics(iteration, C_w, C_d, U, description) {
    // Filtrer les métriques invalides (U négatif = agent a décrit sans dessiner)
    if (C_w === 0 && C_d > 0) {
        console.warn('⚠️ Métriques invalides (U négatif)');
        return false; // Non enregistré
    }
    // ...
}
```

## État Actuel de l'Implémentation

### Adaptateurs Supportés

#### ✅ LLaVA V2 (GRID Format)
- **Adaptateur** : `llava-v2.js`
- **Méthode** : `extractDescriptions(text)` (lignes 335-375)
- **Extraction** : Parse les questions Q3, Q4, Q6 depuis le texte
  - `localDescription` ← Q6 (description locale)
  - `globalDescription` ← Q4 (description globale)
- **État** : ✅ Fonctionne

#### ✅ Gemini V2
- **Adaptateur** : `gemini-v2.js`
- **Méthode** : `extractDescriptions(parsedResponse)` (lignes 503-510)
- **Extraction** : Lit directement depuis JSON structuré
  - `localDescription` ← `descriptions.individual_after`
  - `globalDescription` ← `descriptions.collective_after_prediction`
- **État** : ✅ Méthode présente, ⚠️ **MAIS non appelée dans ai-player.js**

### Problème Identifié

Dans `ai-player.js` (lignes 782-790), les descriptions sont extraites **uniquement si `parsed` contient directement `localDescription` et `globalDescription`** :

```javascript
// Extraire les descriptions (V2 only)
if (parsed && parsed.localDescription !== undefined) {
    this.lastLocalDescription = parsed.localDescription;
}
if (parsed && parsed.globalDescription !== undefined) {
    this.lastGlobalDescription = parsed.globalDescription;
}
```

**Mais** :
1. **Gemini** renvoie un objet `{pixels, descriptions}` où `descriptions` est un sous-objet
2. La méthode `extractDescriptions()` de Gemini n'est **jamais appelée**
3. Donc `parsed.localDescription` est toujours `undefined`

## Solution Proposée

### Option 1 : Ajouter l'appel à `extractDescriptions()` dans `ai-player.js`

```javascript
// Après ligne 790 dans ai-player.js
// Extraire les descriptions (V2 only)
if (this.currentAdapter && this.currentAdapter.extractDescriptions) {
    const extracted = this.currentAdapter.extractDescriptions(parsed);
    if (extracted.localDescription) {
        this.lastLocalDescription = extracted.localDescription;
    }
    if (extracted.globalDescription) {
        this.lastGlobalDescription = extracted.globalDescription;
    }
}
```

### Option 2 : Modifier `gemini-v2.js` pour renvoyer directement les descriptions

```javascript
// Dans gemini-v2.js parseResponse()
return {
    pixels: pixelStrings,
    localDescription: descriptions.individual_after || '',
    globalDescription: descriptions.collective_after_prediction || '',
    descriptions: descriptions // garder pour compatibilité
};
```

## Comparaison des Formules avec la Théorie

### Théorie Simplifiée (Benford, 2012)
- **C_w** : Complexité algorithmique minimale pour générer l'objet
- **C_d** : Complexité de la description la plus concise
- **U = C_w - C_d** : "Unexpectedness" ou créativité

### Notre Implémentation
- **C_w** : Approximation par bits de position + couleur
- **C_d** : Approximation par longueur de description en ASCII
- **U** : Différence directe (pas de normalisation)

### Validité
✅ **C_w** : Approximation raisonnable (33 bits/pixel est cohérent)  
✅ **C_d** : Approximation raisonnable (1 octet/caractère ASCII)  
⚠️ **U** : Non normalisé (devrait être `(C_w - C_d) / C_w` pour un ratio 0-1)

## Recommandations

1. **Appliquer Option 1** : Ajouter l'appel à `extractDescriptions()` pour Gemini
2. **Vérifier alpha = 33** : Confirmer le calcul avec grille 20×20 et RGB 24-bit
3. **Ajouter normalisation** : `U_norm = U / C_w` pour comparaisons inter-agents
4. **Documenter** : Expliquer pourquoi `C_w = 0` avec `C_d > 0` est invalide

## Calcul de `alpha`

### Validation du calcul `alpha = 33`
```
Grille : 20×20 pixels
- Position X : 0 à 19 → log₂(20) ≈ 4.32 bits
- Position Y : 0 à 19 → log₂(20) ≈ 4.32 bits
- Couleur RGB : 24-bit (16,777,216 couleurs possibles)

Total : 4.32 + 4.32 + 24 ≈ 32.64 bits
Arrondi : 33 bits
```

✅ **Le calcul est correct.**

