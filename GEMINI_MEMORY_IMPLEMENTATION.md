# Implémentation Mémoire Gemini - État d'Avancement

## ✅ Modules Créés

### 1. `public/js/gemini-context-manager.js`
**Responsabilité** : Gestion de la mémoire de contexte entre appels pour agents Gemini stateless.

**Fonctionnalités** :
- ✅ Stockage des itérations complètes (pixels, images, prédictions, descriptions)
- ✅ Récupération du contexte pour l'itération courante (i-1)
- ✅ Calcul du nombre de pixels sur une profondeur p
- ✅ Gestion de l'itération 0 avec valeurs par défaut ("black/void")
- ✅ Export ES6 modules

**Méthodes principales** :
- `storeIteration(iteration, data)` : Stocker une itération
- `getContextForIteration(currentIteration, maxDepth)` : Récupérer le contexte
- `getPixelCountDepth(currentIteration, depth)` : Calculer pixels sur profondeur

### 2. `public/js/gemini-complexity-calculator.js`
**Responsabilité** : Calcul des métriques Simplicity Theory avec profondeur.

**Fonctionnalités** :
- ✅ Calcul de `C_w(i, p)` : complexité de génération avec profondeur
- ✅ Calcul de `C_d` : complexité de description (longueur × 8)
- ✅ Calcul de `U(i) = C_w(i) - C_d(i+1)` : unexpectedness
- ✅ Calcul de la prévisibilité (0-10) par similarité sémantique
- ✅ Stockage des métriques locales et globales
- ✅ Profondeurs ajustables : `p_individual=5`, `p_collective=3`

**Méthodes principales** :
- `calculateCw(depth, pixelCounts)` : Calculer C_w avec profondeur
- `calculateU(iteration, pixelCounts, description, isCollective)` : Calculer U
- `calculatePredictability(descriptionBefore, predictionAfter)` : Note 0-10
- `storeMetrics(iteration, metrics, isCollective)` : Stocker métriques
- `storePredictability(iteration, predInd, predCol)` : Stocker prévisibilités

### 3. `public/js/gemini-complexity-test.html`
**Responsabilité** : Suite de tests pour valider les modules.

**Tests** :
- ✅ Tests du Context Manager
- ✅ Tests du Complexity Calculator
- ✅ Test d'intégration des deux modules

## 📋 Prochaines Étapes

### Phase 1 : Modification des Adapters et Prompts ⏳

#### 1. Modifier `gemini-prompts-v2-simple.json`
**Changements requis** :

Renommer les champs :
```json
{
  "descriptions": {
    "collective_before_description": "...",  // Au lieu de "collective_before"
    "individual_before_description": "...", // Au lieu de "individual_before"
    "individual_after_prediction": "...",   // Au lieu de "individual_after"
    "collective_after_prediction": "..."   // Inchangé
  }
}
```

Ajouter les champs de prévisibilité :
```json
{
  "descriptions": {
    "predictability_individual": 7,
    "predictability_collective": 8
  }
}
```

Ajouter la section memory context :
```
MEMORY CONTEXT (Iteration i-1):
- Your previous predictions:
  Individual: {{individual_after_prediction_previous}}
  Collective: {{collective_after_prediction_previous}}
- Images of state at iteration (i-1):
  [Local image i-1]
  [Global image i-1]
```

Modifier les instructions pour :
1. D'abord décrire l'état AVANT (individual_before_description, collective_before_description)
2. Comparer avec prédictions i-1 et noter prévisibilité (0-10)
3. Prédire l'évolution (collective_after_prediction, individual_after_prediction)
4. Générer les pixels

#### 2. Modifier `gemini-v2.js`
**Changements requis** :

```javascript
import { GeminiContextManager } from './gemini-context-manager.js';
import { GeminiComplexityCalculator } from './gemini-complexity-calculator.js';

// Dans la classe GeminiV2Adapter
constructor() {
    this.contextManager = new GeminiContextManager();
    this.complexityCalculator = new GeminiComplexityCalculator();
}

// Modifier extractDescriptions()
extractDescriptions(parsedResponse) {
    const descriptions = parsedResponse.descriptions || {};
    
    return {
        individualBeforeDescription: descriptions.individual_before_description,
        collectiveBeforeDescription: descriptions.collective_before_description,
        individualAfterPrediction: descriptions.individual_after_prediction,
        collectiveAfterPrediction: descriptions.collective_after_prediction,
        predictabilityIndividual: descriptions.predictability_individual,
        predictabilityCollective: descriptions.predictability_collective
    };
}

// Modifier buildSystemPrompt() pour injecter memory context
buildSystemPrompt(iteration, myX, myY, memoryContext) {
    // ... existing code ...
    
    // Injecter memory context
    prompt = prompt.replace(/{{individual_after_prediction_previous}}/g, 
                             memoryContext.previousPredictions[0].individual_after);
    prompt = prompt.replace(/{{collective_after_prediction_previous}}/g, 
                             memoryContext.previousPredictions[0].collective_after);
    
    return prompt;
}
```

#### 3. Modifier `ai-player.js`
**Changements requis** :

```javascript
// Import en haut du fichier
import { GeminiContextManager } from './gemini-context-manager.js';
import { GeminiComplexityCalculator } from './gemini-complexity-calculator.js';

// Dans constructor()
if (this.currentAdapter.name === 'Gemini V2') {
    this.geminiContextManager = new GeminiContextManager();
    this.geminiComplexityCalculator = new GeminiComplexityCalculator();
}

// Dans mainLoop(), avant l'appel à askLLM()
if (this.currentAdapter.name === 'Gemini V2') {
    // Récupérer le contexte pour l'itération courante
    const context = this.geminiContextManager.getContextForIteration(this.iterationCount);
    
    // Capturer les images de l'itération i-1
    const previousLocalImage = await this.captureLocalCanvas();  // À ajuster
    const previousGlobalImage = await this.captureGlobalCanvas(); // À ajuster
    
    // Stocker les images dans le contexte
    context.previousPredictions[0].images.local = previousLocalImage;
    context.previousPredictions[0].images.global = previousGlobalImage;
}

// Dans mainLoop(), après l'appel à askLLM() et le dessin des pixels
if (this.currentAdapter.name === 'Gemini V2') {
    // Capturer les images de l'itération i (après dessin)
    const currentLocalImage = await this.captureLocalCanvas();
    const currentGlobalImage = await this.captureGlobalCanvas();
    
    // Stocker l'itération i complète
    this.geminiContextManager.storeIteration(this.iterationCount, {
        pixelCount: pixelCount,
        localImageBase64: currentLocalImage,
        globalImageBase64: currentGlobalImage,
        individualAfterPrediction: parsed.descriptions.individual_after_prediction,
        collectiveAfterPrediction: parsed.descriptions.collective_after_prediction,
        individualBeforeDescription: parsed.descriptions.individual_before_description,
        collectiveBeforeDescription: parsed.descriptions.collective_before_description,
        predictabilityIndividual: parsed.descriptions.predictability_individual,
        predictabilityCollective: parsed.descriptions.predictability_collective
    });
    
    // Si ce n'est pas la première itération, calculer U pour l'itération précédente
    if (this.iterationCount > 0) {
        const pixelCounts = this.geminiContextManager.memory.iterations.map(i => i.pixelCount);
        const description = parsed.descriptions.individual_before_description;
        
        const metrics = this.geminiComplexityCalculator.calculateU(
            this.iterationCount - 1,
            pixelCounts,
            description,
            false
        );
        
        this.geminiComplexityCalculator.storeMetrics(
            this.iterationCount - 1,
            metrics,
            false
        );
        
        // Stocker la prévisibilité
        this.geminiComplexityCalculator.storePredictability(
            this.iterationCount - 1,
            parsed.descriptions.predictability_individual,
            parsed.descriptions.predictability_collective
        );
    }
}
```

### Phase 2 : Tests et Ajustements ⏳

#### 1. Tests Unitaires
- [ ] Lancer `gemini-complexity-test.html` dans navigateur
- [ ] Vérifier que tous les tests passent
- [ ] Tester avec données réelles

#### 2. Tests Intégration
- [ ] Tester avec un agent Gemini réel
- [ ] Vérifier que les images i-1 sont correctement capturées
- [ ] Vérifier que les descriptions sont extraites correctement
- [ ] Vérifier que les métriques sont calculées et stockées

#### 3. Ajustements
- [ ] Ajuster profondeurs `p_individual` et `p_collective` selon résultats
- [ ] Ajuster algorithme de similarité sémantique si nécessaire
- [ ] Optimiser taille des images stockées

## 🎯 Objectifs

✅ **Modules JavaScript créés**  
⏳ **Intégration dans adapters** (en cours)  
⏳ **Tests avec agent réel**  
⏳ **Ajustement profondeurs**  
⏳ **Visualisation métriques**

## 📝 Notes Importantes

1. **Retard d'une itération** : Les images i-1 sont envoyées à l'itération i
2. **Calcul rétrospectif** : U(i) est calculé à l'itération i+1
3. **Stateless garanti** : Tout contexte est réinjecté explicitement
4. **Profondeurs ajustables** : Permet d'expérimenter avec différents p

