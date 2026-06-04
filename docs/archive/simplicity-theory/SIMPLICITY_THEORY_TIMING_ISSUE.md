# Problème Temporel dans le Calcul de Simplicity Theory

## Formule Correcte

```
U(i) = C_w(i) - C_d(i+1)
```

Où :
- **C_w(i)** : Complexité de génération à l'itération `i` (pixels dessinés)
- **C_d(i+1)** : Complexité de description à l'itération `i+1` (description de l'état AVANT)
- **U(i)** : Inattendu calculé rétrospectivement après l'itération `i+1`

## Problème Identifié

### État Actuel (Incorrect)

```javascript
// Dans ai-player.js ligne 1758
calculateSimplicityMetrics(this.lastLocalDescription, pixelCount);
```

**Utilise** :
- `pixelCount` de l'itération `i` ✅
- `lastLocalDescription` de l'itération `i` ❌

**Devrait utiliser** :
- `pixelCount` de l'itération `i` ✅
- Description **de l'itération i+1** qui décrit l'état **AVANT l'itération i** ❌

### Problème pour Gemini

Gemini génère actuellement :
```json
{
  "descriptions": {
    "collective_before": "...",          // État global AVANT (bon)
    "individual_before": "...",          // État local AVANT (bon) ✅
    "individual_after": "...",           // État local APRÈS (pour prédiction)
    "collective_after_prediction": "..." // État global APRÈS (pour prédiction)
  }
}
```

**MAIS** : La ligne 507-509 de `gemini-v2.js` extrait :
```javascript
localDescription: descriptions.individual_after || ...
globalDescription: descriptions.collective_after_prediction || ...
```

❌ **DEVRAIT** extraire `individual_before` et `collective_before` !

## Solution Proposée

### 1. Corriger l'extraction des descriptions (Gemini)

**Dans `gemini-v2.js` ligne 503-510 :**

```javascript
extractDescriptions(parsedResponse) {
    const descriptions = parsedResponse.descriptions || {};
    
    return {
        // AU LIEU DE "individual_after", utiliser "individual_before"
        localDescription: descriptions.individual_before || 'Description locale non disponible',
        // AU LIEU DE "collective_after_prediction", utiliser "collective_before"
        globalDescription: descriptions.collective_before || 'Description globale non disponible'
    };
},
```

### 2. Stocker les descriptions pour calcul retardé

**Dans `ai-player.js` :**

```javascript
// Stocker les descriptions AVANT de l'itération courante
if (this.currentAdapter && this.currentAdapter.extractDescriptions) {
    const extracted = this.currentAdapter.extractDescriptions(parsed);
    
    // Sauvegarder les descriptions de l'état AVANT
    if (extracted.localDescription) {
        this.lastLocalDescription = extracted.localDescription;
    }
    if (extracted.globalDescription) {
        this.lastGlobalDescription = extracted.globalDescription;
    }
}

// Au début de la prochaine itération (ligne 1758)
// Utiliser les descriptions de l'état AVANT pour calculer U de l'itération précédente
if (this.lastLocalDescription && this.pixelCountPrevious) {
    const metrics = this.calculateSimplicityMetrics(
        this.lastLocalDescription,  // Description de l'état AVANT
        this.pixelCountPrevious     // Nombre de pixels dessinés à l'itération précédente
    );
    this.storeSimplicityMetrics(
        this.iterationCount - 1,    // Itération précédente
        metrics.C_w,
        metrics.C_d,
        metrics.U,
        this.lastLocalDescription
    );
}
```

### 3. Architecture de Mémoire pour Gemini

**Question posée par l'utilisateur** : Gemini garde-t-il la mémoire entre itérations ?

#### Option A : Gemini garde la mémoire
- Les descriptions `individual_after` et `collective_after_prediction` de l'itération `i-1` sont visibles à l'itération `i`
- L'agent peut comparer ses prédictions avec la réalité
- **Pas besoin d'envoyer les prédictions précédentes**

#### Option B : Gemini ne garde pas la mémoire
- L'agent n'a aucune trace des itérations précédentes
- **Nécessité d'envoyer** les prédictions de l'itération `i-1` au prompt de l'itération `i`

### 4. Utilité de `individual_after` et `collective_after_prediction`

Ces descriptions servent à :
1. **Auto-évaluation** : L'agent peut voir si ses prédictions correspondent à la réalité
2. **Ajustement** : L'agent peut ajuster sa stratégie si ses prédictions étaient incorrectes
3. **Apprentissage** : L'agent améliore ses prédictions au fil des itérations

**Proposition** :
- Conserver ces champs dans le prompt
- Les stocker dans `ai-player.js` pour analyse post-traitement
- Comparer `individual_after` prédite vs `individual_before` réelle à l'itération suivante

## Implémentation Correcte

### Variables à stocker

```javascript
constructor() {
    // ... existing code ...
    
    // Simplicity Theory metrics
    this.simplicityMetrics = { /* ... */ };
    
    // NEW: Stockage rétrospectif
    this.pendingMetrics = {
        iteration: null,
        pixelCount: null,
        C_w: null
    };
}

// Dans mainLoop (après dessin des pixels à l'itération i)
if (this.currentAdapter && this.currentAdapter.name.includes('V2')) {
    const pixelCount = /* pixels dessinés à cette itération */;
    
    // Sauvegarder pour calcul futur
    this.pendingMetrics = {
        iteration: this.iterationCount,
        pixelCount: pixelCount,
        C_w: pixelCount * 33
    };
    
    // Extraire les descriptions de l'état AVANT
    if (this.currentAdapter.extractDescriptions) {
        const extracted = this.currentAdapter.extractDescriptions(parsed);
        
        // Calculer U pour l'itération PRÉCÉDENTE
        if (this.pendingMetrics.iteration > 0 && this.lastLocalDescription) {
            const metrics = this.calculateSimplicityMetrics(
                this.lastLocalDescription,  // Description de l'état AVANT
                this.pendingMetrics.pixelCount  // Pixels de l'itération précédente
            );
            
            this.storeSimplicityMetrics(
                this.pendingMetrics.iteration - 1,  // Itération précédente
                metrics.C_w,
                metrics.C_d,
                metrics.U,
                this.lastLocalDescription
            );
        }
        
        // Mettre à jour pour la prochaine itération
        this.lastLocalDescription = extracted.localDescription;
        this.lastGlobalDescription = extracted.globalDescription;
    }
}
```

## Problème de LLaVA V2

LLaVA V2 utilise actuellement :
- `Q6` → `individual_after` (description de ce qu'il vient de dessiner)
- `Q4` → `collective_before` (description globale AVANT)

**LLaVA est donc aussi incorrect** car il utilise `individual_after` au lieu de `individual_before`.

## Conclusion

**Le calcul actuel n'est PAS correct selon la théorie.**

Pour implémenter correctement :
1. ✅ Utiliser `individual_before` au lieu de `individual_after`
2. ✅ Utiliser `collective_before` au lieu de `collective_after_prediction`
3. ✅ Calculer `U(i)` avec les descriptions de l'itération `i+1`
4. ✅ Stocker les métriques avec l'itération `i` mais calculer à l'itération `i+1`

**Utilité de `individual_after` et `collective_after_prediction`** :
- Auto-évaluation de l'agent
- Analyse de prédiction (comparer prédictions vs réalité)
- Stratégie d'ajustement si les prédictions ne correspondent pas

