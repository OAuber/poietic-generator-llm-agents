# Prochaines Étapes - Intégration Mémoire Gemini

## ✅ Ce Qui Est Fait

1. ✅ `gemini-context-manager.js` - Gestion mémoire
2. ✅ `gemini-complexity-calculator.js` - Calcul métriques
3. ✅ `gemini-complexity-test.html` - Tests
4. ✅ `gemini-prompts-v2-memory.json` - Nouveau prompt
5. ✅ Import des modules dans `gemini-v2.js`
6. ✅ Modification de `extractDescriptions()` pour nouveaux champs

## 📋 Ce Qui Reste À Faire

### 1. Modifier `ai-player.js` pour intégrer la mémoire

#### A. Ajouter les imports

```javascript
// En haut de ai-player.js, après les autres imports
import { GeminiContextManager } from './gemini-context-manager.js';
import { GeminiComplexityCalculator } from './gemini-complexity-calculator.js';
```

#### B. Dans le constructor, initialiser les managers

```javascript
constructor() {
    // ... existing code ...
    
    // Simplicity Theory - NEW for Gemini memory
    this.geminiContextManager = null;
    this.geminiComplexityCalculator = null;
}
```

#### C. Dans `init()`, initialiser Gemini managers

```javascript
async init() {
    // ... existing code ...
    
    // Initialize Gemini memory managers if Gemini is selected
    const selectedModel = this.elements.llmModelSelect.value;
    if (selectedModel === 'gemini') {
        this.geminiContextManager = new GeminiContextManager();
        this.geminiComplexityCalculator = new GeminiComplexityCalculator();
        console.log('[AI Player] 📊 Gemini memory managers initialized');
    }
}
```

#### D. Dans `askLLM()`, récupérer le contexte avant l'appel

```javascript
// AVANT l'appel à callAPI
if (this.currentAdapter.name === 'Gemini V2' && this.geminiContextManager) {
    // Get context for current iteration
    const context = this.geminiContextManager.getContextForIteration(this.iterationCount);
    
    // Store context for injection into prompt
    // Note: Les images actuelles (i) sont envoyées normalement
    // Le contexte mémoire (prédictions i-1) sera injecté dans le prompt
    this.currentMemoryContext = context;
}

// Appel à Gemini (inchangé) - Les images actuelles sont envoyées comme d'habitude
const response = await this.currentAdapter.callAPI(...);
```

#### E. Après `askLLM()`, stocker l'itération et calculer métriques

```javascript
// Après avoir dessiné les pixels de l'itération i
if (this.currentAdapter.name === 'Gemini V2' && this.geminiContextManager) {
    // Les images sont déjà capturées (localImageBase64, globalImageBase64)
    // Extraire descriptions
    const extracted = this.currentAdapter.extractDescriptions(parsed);
    
    // Stocker itération i complète (SANS images - pas besoin!)
    this.geminiContextManager.storeIteration(this.iterationCount, {
        pixelCount: pixelCount,
        localImageBase64: null,  // Pas stockées - économie mémoire
        globalImageBase64: null, // Pas stockées - économie mémoire
        individualAfterPrediction: extracted.individualAfterPrediction,
        collectiveAfterPrediction: extracted.collectiveAfterPrediction,
        individualBeforeDescription: extracted.individualBeforeDescription,
        collectiveBeforeDescription: extracted.collectiveBeforeDescription,
        predictabilityIndividual: extracted.predictabilityIndividual,
        predictabilityCollective: extracted.predictabilityCollective
    });
    
    // Si ce n'est pas la première itération, calculer U pour l'itération précédente
    if (this.iterationCount > 0 && extracted.individualBeforeDescription) {
        const pixelCounts = [];
        for (let i = 0; i < this.iterationCount; i++) {
            const stored = this.geminiContextManager.getIterationMetrics(i);
            if (stored) pixelCounts.push(stored.pixelCount);
        }
        pixelCounts.push(pixelCount); // Current iteration
        
        const metrics = this.geminiComplexityCalculator.calculateU(
            this.iterationCount - 1,
            pixelCounts,
            extracted.individualBeforeDescription,
            false
        );
        
        this.geminiComplexityCalculator.storeMetrics(this.iterationCount - 1, metrics, false);
        this.geminiComplexityCalculator.storePredictability(
            this.iterationCount - 1,
            extracted.predictabilityIndividual,
            extracted.predictabilityCollective
        );
    }
}
```

### 2. ✅ Pas besoin de stocker les images

**Simplification** : Puisqu'on envoie les images de l'itération i (comme actuellement), **pas besoin de stocker les images** dans le contexte manager. On stocke uniquement :
- Nombre de pixels
- Prédictions (individual_after, collective_after)
- Descriptions (individual_before, collective_before)
- Prévisibilités (predictability_individual, predictability_collective)

Les images sont toujours capturées à la volée comme d'habitude.

### 3. Modifier `buildSystemPrompt()` dans gemini-v2.js

Ajouter l'injection du memory context dans le prompt :

```javascript
buildSystemPrompt(iterationCount, myX, myY, contextManager) {
    // ... existing code ...
    
    if (contextManager) {
        const context = contextManager.getContextForIteration(iterationCount);
        
        // Inject previous predictions
        prompt = prompt.replace(/{{individual_after_prediction_previous}}/g, 
            context.previousPredictions[0]?.individual_after || 'N/A');
        prompt = prompt.replace(/{{collective_after_prediction_previous}}/g, 
            context.previousPredictions[0]?.collective_after || 'N/A');
    }
    
    return prompt;
}
```

## ⚠️ Points Critiques

1. ✅ **Images actuelles** : Les images envoyées à Gemini sont celles de l'itération i (comme actuellement)
2. **Calcul rétrospectif** : U(i) est calculé à l'itération i+1 avec C_d(i+1)
3. **Stateless** : Tout contexte (prédictions i-1) doit être réinjecté explicitement dans le prompt
4. **Première itération** : Prédictions "black/void" par défaut dans le contexte
5. ✅ **Économie mémoire** : Pas de stockage d'images Base64

## 🧪 Tests À Faire

1. ✅ Pas besoin de vérifier capture images i-1 (images actuelles utilisées)
2. Vérifier que les descriptions de l'état AVANT sont correctement extraites
3. Vérifier que U(i) est calculé avec les bonnes descriptions
4. Vérifier que les courbes de prévisibilité s'affichent correctement

## 📝 Notes

Simplification majeure : **Plus besoin de stocker les images** !

Les modifications dans `ai-player.js` sont simplifiées car :
- ✅ Pas besoin de capturer/stocker les images i-1
- ✅ Les images actuelles sont envoyées comme d'habitude
- ✅ Seules les métadonnées sont stockées (pixels, descriptions, prévisibilités)
- ✅ Économie mémoire importante

Il faut faire attention à :
- Ne pas casser les adapters existants (LLaVA, etc.)
- Gérer les cas d'erreur (descriptions vides)
- Injecter correctement le memory context dans le prompt

