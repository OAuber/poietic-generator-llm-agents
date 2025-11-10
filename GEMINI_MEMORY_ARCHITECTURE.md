# Architecture Mémoire pour Agents Gemini (Stateless)

## Constat Initial

**Gemini est stateless** : Chaque appel API est indépendant, aucune mémoire entre itérations.

**Conséquences** :
- Tous les éléments de contexte doivent être fournis à chaque appel
- Les prédictions de l'itération `i-1` doivent être réinjectées à l'itération `i`
- Les images de l'itération `i-1` doivent être recapturées et envoyées

**⚠️ IMPORTANT** : À l'itération `i`, on envoie uniquement les **images de l'itération i-1**, pas les images actuelles. L'agent décrit l'état précédent (i-1) et prédit l'évolution future (i+1).

## Renommage des Champs

### Ancien Format
```json
{
  "descriptions": {
    "collective_before": "...",
    "individual_before": "...",
    "individual_after": "...",
    "collective_after_prediction": "..."
  }
}
```

### Nouveau Format
```json
{
  "descriptions": {
    "collective_before_description": "...",     // État global AVANT
    "individual_before_description": "...",     // État local AVANT
    "individual_after_prediction": "...",       // Intention d'évolution locale
    "collective_after_prediction": "..."       // Prédiction d'évolution globale
  }
}
```

## Architecture Proposée

### Module 1 : `gemini-context-manager.js`

**Responsabilité** : Gestion de la mémoire de contexte entre appels

#### Classe `GeminiContextManager`

```javascript
class GeminiContextManager {
    constructor() {
        this.memory = {
            iterations: [],
            images: {
                local: [],
                global: []
            }
        };
    }
    
    // Stocker une itération
    storeIteration(iteration, data) {
        this.memory.iterations[iteration] = {
            pixelCount: data.pixelCount,
            localDescription: data.localDescription,
            globalDescription: data.globalDescription,
            images: {
                local: data.localImageBase64,
                global: data.globalImageBase64
            },
            predictions: {
                individual_after: data.individualAfterPrediction,
                collective_after: data.collectiveAfterPrediction
            }
        };
    }
    
    // Récupérer le contexte pour l'itération i
    getContextForIteration(i, maxDepth = 5) {
        const context = {
            previousPredictions: [],
            images: {
                local: [],
                global: []
            }
        };
        
        // Récupérer les prédictions des itérations précédentes (jusqu'à maxDepth)
        for (let j = Math.max(0, i - maxDepth); j < i; j++) {
            if (this.memory.iterations[j]) {
                context.previousPredictions.push({
                    iteration: j,
                    individual_after: this.memory.iterations[j].predictions.individual_after,
                    collective_after: this.memory.iterations[j].predictions.collective_after,
                    localImage: this.memory.iterations[j].images.local,
                    globalImage: this.memory.iterations[j].images.global
                });
            }
        }
        
        // Pour l'itération 0, fournir des valeurs par défaut
        if (i === 0 && this.memory.iterations.length === 0) {
            context.previousPredictions.push({
                iteration: -1,
                individual_after: "black/void - Starting from empty canvas",
                collective_after: "black/void - Starting from empty canvas",
                localImage: null,  // Image noire générée côté client
                globalImage: null  // Image noire générée côté client
            });
        }
        
        return context;
    }
}
```

### Module 2 : `gemini-complexity-calculator.js`

**Responsabilité** : Calcul des métriques Simplicity Theory avec profondeur

#### Classe `GeminiComplexityCalculator`

```javascript
class GeminiComplexityCalculator {
    constructor() {
        this.metrics = {
            iterations: [],
            local: {
                C_w: [],
                C_d: [],
                U: [],
                predictability: []
            },
            global: {
                C_w: [],
                C_d: [],
                U: [],
                predictability: []
            }
        };
        
        // Profondeurs ajustables
        this.p_individual = 5;   // Profondeur individuelle
        this.p_collective = 3;   // Profondeur collective
    }
    
    // Calculer C_w avec profondeur p
    calculateCw(depth, pixelCounts) {
        const alpha = 33; // bits par pixel
        let totalPixels = 0;
        
        // Somme des pixels sur les p dernières itérations
        for (let i = 0; i < depth && i < pixelCounts.length; i++) {
            totalPixels += pixelCounts[pixelCounts.length - 1 - i];
        }
        
        return totalPixels * alpha;
    }
    
    // Calculer U(i) = C_w(i, p) - C_d(i+1)
    calculateU(iteration, pixelCounts, description) {
        // C_w: somme des pixels des p dernières itérations
        const C_w = this.calculateCw(this.p_individual, pixelCounts);
        
        // C_d: longueur de description de l'itération i+1
        const C_d = description.length * 8;
        
        // U
        const U = C_w - C_d;
        
        return { C_w, C_d, U };
    }
    
    // Stocker les métriques
    storeMetrics(iteration, metrics) {
        this.metrics.iterations.push(iteration);
        this.metrics.local.C_w.push(metrics.C_w);
        this.metrics.local.C_d.push(metrics.C_d);
        this.metrics.local.U.push(metrics.U);
    }
    
    // Calculer la prévisibilité (0-10)
    calculatePredictability(descriptionBefore, predictionAfter) {
        // Méthode 1 : Similarité sémantique (simple)
        const similarity = this.semanticSimilarity(descriptionBefore, predictionAfter);
        
        // Convertir en note 0-10 (similarité = prévisibilité)
        const predictability = Math.round(similarity * 10);
        
        return predictability;
    }
    
    // Simple similarity basée sur overlap de mots
    semanticSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }
}
```

## Flux d'Exécution Détaillé

### Itération 0 (Initialisation)

```javascript
// 1. Préparer le contexte
const contextManager = new GeminiContextManager();
const context = contextManager.getContextForIteration(0);

// 2. Contexte pour Gemini
const memoryContext = {
    individual_after_prediction_previous: "black/void - Starting from empty canvas",
    collective_after_prediction_previous: "black/void - Starting from empty canvas",
    local_image_previous: null,  // Image noire générée côté client
    global_image_previous: null  // Image noire générée côté client
};

// 3. Appel Gemini avec contexte + images de l'itération i-1
// Note: Les images i-1 sont envoyées, pas les images actuelles
const prompt = buildPrompt(memoryContext, previousLocalImage, previousGlobalImage);

// 4. Réponse Gemini
const response = await gemini.call(prompt);
// {
//   "descriptions": {
//     "individual_before_description": "...",  // État actuel
//     "collective_before_description": "...", // État global
//     "individual_after_prediction": "...",   // Intention
//     "collective_after_prediction": "...",   // Prédiction globale
//     "predictability_individual": 5,
//     "predictability_collective": 7
//   },
//   "pixels": [...]
// }

// 5. Stocker dans le contexte
contextManager.storeIteration(0, {
    pixelCount: response.pixels.length,
    localImageBase64: currentLocalImage,
    globalImageBase64: currentGlobalImage,
    individualAfterPrediction: response.descriptions.individual_after_prediction,
    collectiveAfterPrediction: response.descriptions.collective_after_prediction
});

// 6. Calculer métriques (rétrospectif)
// Pas de métriques à l'itération 0 car il n'y a pas encore de C_d(i+1)
```

### Itération 1+

```javascript
// 1. Récupérer le contexte
const context = contextManager.getContextForIteration(1);

// 2. Construire le memory context
const memoryContext = {
    individual_after_prediction_previous: context.previousPredictions[0].individual_after,
    collective_after_prediction_previous: context.previousPredictions[0].collective_after,
    local_image_previous: context.previousPredictions[0].localImage,
    global_image_previous: context.previousPredictions[0].globalImage
};

// 3. Appel Gemini avec images de l'itération i-1 (pas les images actuelles)
const prompt = buildPrompt(memoryContext, previousLocalImage, previousGlobalImage);
const response = await gemini.call(prompt);

// 4. ANALYSE DES ÉCARTS (nouvelle étape)
const predictability_individual = response.descriptions.predictability_individual; // 0-10
const predictability_collective = response.descriptions.predictability_collective; // 0-10

// 5. Stocker dans le contexte
contextManager.storeIteration(1, {...});

// 6. CALCULER MÉTRIQUES POUR L'ITÉRATION PRÉCÉDENTE
const complexityCalculator = new GeminiComplexityCalculator();
const metrics = complexityCalculator.calculateU(
    0,  // Itération précédente
    contextManager.memory.iterations.map(i => i.pixelCount),
    response.descriptions.individual_before_description  // Description de l'état AVANT
);

// 7. Stocker les métriques avec prévisibilité
complexityCalculator.storeMetrics(0, metrics);
complexityCalculator.metrics.local.predictability.push(predictability_individual);
complexityCalculator.metrics.global.predictability.push(predictability_collective);
```

## Modification du Prompt Gemini

### Structure du Prompt (Itération i)

```
MEMORY CONTEXT (Iteration i-1):
- Your previous predictions:
  Individual: {{individual_after_prediction_previous}}
  Collective: {{collective_after_prediction_previous}}
- Images of state at iteration (i-1):
  [Local image i-1]
  [Global image i-1]

NOTE: These images show the canvas state BEFORE your actions at iteration i. Use them to:
1. Compare your predictions with the actual resulting state
2. Understand what happened at iteration i-1
3. Make informed decisions for iteration i

YOUR TASKS (in order):

1. Describe the INDIVIDUAL state shown in the images (Grid [{{myX}},{{myY}}] at i-1)
   → "individual_before_description"

2. Describe the COLLECTIVE state shown in the images (full canvas at i-1)
   → "collective_before_description"

3. Analyze predictability by comparing:
   - "individual_before_description" (what actually happened) vs "individual_after_prediction (i-1)" (what you predicted)
   - "collective_before_description" (what actually happened) vs "collective_after_prediction (i-1)" (what you predicted)
   - Rate predictability on scale 0-10:
     → "predictability_individual": [0-10] (10 = perfect prediction, 0 = no resemblance)
     → "predictability_collective": [0-10]

4. Predict COLLECTIVE evolution:
   - How will the global canvas evolve?
   - What shapes might emerge?
   - How will they interact?
   → "collective_after_prediction"

5. Plan INDIVIDUAL action to influence collective:
   - How will your grid evolve?
   - How will this contribute to collective_after_prediction?
   → "individual_after_prediction"

6. Generate pixels:
   → "pixels": [{"x": ..., "y": ..., "hex_color": ...}]

RESPONSE FORMAT:
{
  "descriptions": {
    "individual_before_description": "...",
    "collective_before_description": "...",
    "predictability_individual": 7,
    "predictability_collective": 8,
    "collective_after_prediction": "...",
    "individual_after_prediction": "..."
  },
  "pixels": [...]
}
```

## Implémentation Progressive

### Phase 1 : Infrastructure
1. Créer `gemini-context-manager.js`
2. Créer `gemini-complexity-calculator.js`
3. Tester avec des valeurs mock

### Phase 2 : Modification Prompt
1. Renommer les champs dans `gemini-prompts-v2-simple.json`
2. Ajouter sections memory context et predictability
3. Tester avec un agent

### Phase 3 : Intégration ai-player.js
1. Instancier les managers
2. Appeler `getContextForIteration(i)` avant chaque call Gemini
3. Injecter memory context dans le prompt
4. Stocker résultats dans `storeIteration(i, ...)`
5. Calculer métriques après stockage

### Phase 4 : Visualisation
1. Afficher courbe U locale
2. Afficher courbe U globale
3. Afficher courbe predictability (hauteur 0-10)
4. Superposer les courbes

## Questions Ouvertes

1. **Profondeur optimale** : Commencer avec `p_individual=5` et `p_collective=3` ?
2. **Similarité sémantique** : Utiliser une librairie (ex: sentence-transformers) ou simple overlap ?
3. **Prédictions stockées** : Conserver toutes les images ou uniquement les plus récentes ?
4. **Performance** : Impact sur le temps de réponse si on envoie plusieurs images ?

## Avantages de Cette Architecture

✅ **Stateless garanti** : Tout contexte est réinjecté explicitement  
✅ **Calcul correct** : U(i) calculé avec C_d(i+1)  
✅ **Prévisibilité mesurable** : Notes 0-10 exploitables  
✅ **Profondeur ajustable** : Adaptation selon tests  
✅ **Modularité** : Deux modules indépendants, facilement testables  
✅ **Évolutif** : Prêt pour autres LLMs stateless (GPT, Claude, etc.)

