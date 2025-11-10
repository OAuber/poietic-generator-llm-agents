/**
 * Gemini Context Manager
 * Gestion de la mémoire de contexte entre appels pour agents Gemini stateless
 */

class GeminiContextManager {
    constructor() {
        this.memory = {
            iterations: [], // Stockage des itérations
            maxDepth: 10 // Profondeur maximale de mémoire
        };
    }
    
    /**
     * Stocker une itération complète
     * @param {number} iteration - Numéro d'itération
     * @param {Object} data - Données de l'itération
     * @param {number} data.pixelCount - Nombre de pixels dessinés
     * @param {string} data.localImageBase64 - Image locale encodée en base64
     * @param {string} data.globalImageBase64 - Image globale encodée en base64
     * @param {string} data.individualAfterPrediction - Prédiction individuelle
     * @param {string} data.collectiveAfterPrediction - Prédiction collective
     */
    storeIteration(iteration, data) {
        this.memory.iterations[iteration] = {
            pixelCount: data.pixelCount,
            images: {
                local: data.localImageBase64,
                global: data.globalImageBase64
            },
            predictions: {
                individual_after: data.individualAfterPrediction,
                collective_after: data.collectiveAfterPrediction
            },
            descriptions: {
                individual_before: data.individualBeforeDescription,
                collective_before: data.collectiveBeforeDescription,
                predictability_individual: data.predictabilityIndividual,
                predictability_collective: data.predictabilityCollective
            }
        };
        
        console.log(`[Context Manager] ✅ Itération ${iteration} stockée`);
    }
    
    /**
     * Récupérer le contexte pour l'itération courante
     * @param {number} currentIteration - Numéro de l'itération courante
     * @param {number} maxDepth - Profondeur maximale à récupérer (défaut: 5)
     * @returns {Object} Contexte formaté pour le prompt Gemini
     */
    getContextForIteration(currentIteration, maxDepth = 5) {
        const context = {
            previousPredictions: [],
            images: {
                local: null,
                global: null
            }
        };
        
        // Cas spécial : itération 0 (première itération)
        if (currentIteration === 0 && this.memory.iterations.length === 0) {
            console.log('[Context Manager] 🌱 Première itération - contexte initial');
            context.previousPredictions.push({
                iteration: -1,
                individual_after: 'black/void - Starting from empty canvas',
                collective_after: 'black/void - Starting from empty canvas',
                images: {
                    local: null,  // Seront remplacées par des images noires générées côté client
                    global: null
                }
            });
            return context;
        }
        
        // Récupérer l'itération précédente (i-1)
        const previousIteration = currentIteration - 1;
        
        if (this.memory.iterations[previousIteration]) {
            const prev = this.memory.iterations[previousIteration];
            
            context.previousPredictions.push({
                iteration: previousIteration,
                individual_after: prev.predictions.individual_after || 'No prediction',
                collective_after: prev.predictions.collective_after || 'No prediction',
                images: {
                    local: prev.images.local,
                    global: prev.images.global
                }
            });
            
            console.log(`[Context Manager] 📦 Contexte récupéré pour itération ${currentIteration} (basé sur i-1=${previousIteration})`);
        } else {
            console.warn(`[Context Manager] ⚠️ Aucune itération ${previousIteration} trouvée`);
            // Fallback pour première itération
            context.previousPredictions.push({
                iteration: previousIteration,
                individual_after: 'black/void - Starting from empty canvas',
                collective_after: 'black/void - Starting from empty canvas',
                images: {
                    local: null,
                    global: null
                }
            });
        }
        
        // Optionnel : récupérer plusieurs itérations précédentes pour profondeur
        // (actuellement non utilisé mais préparé pour futur)
        for (let i = Math.max(0, currentIteration - maxDepth); i < previousIteration; i++) {
            if (this.memory.iterations[i]) {
                const hist = this.memory.iterations[i];
                context.previousPredictions.unshift({
                    iteration: i,
                    individual_after: hist.predictions.individual_after,
                    collective_after: hist.predictions.collective_after,
                    images: {
                        local: hist.images.local,
                        global: hist.images.global
                    }
                });
            }
        }
        
        return context;
    }
    
    /**
     * Obtenir le nombre de pixels cumulés sur les p dernières itérations
     * @param {number} currentIteration - Itération courante
     * @param {number} depth - Profondeur (nombre d'itérations à regarder en arrière)
     * @returns {number} Nombre total de pixels
     */
    getPixelCountDepth(currentIteration, depth) {
        let totalPixels = 0;
        const startIteration = Math.max(0, currentIteration - depth);
        
        for (let i = startIteration; i < currentIteration; i++) {
            if (this.memory.iterations[i]) {
                totalPixels += this.memory.iterations[i].pixelCount || 0;
            }
        }
        
        return totalPixels;
    }
    
    /**
     * Obtenir les métriques d'une itération spécifique
     * @param {number} iteration - Numéro d'itération
     * @returns {Object|null} Métriques de l'itération
     */
    getIterationMetrics(iteration) {
        return this.memory.iterations[iteration] || null;
    }
    
    /**
     * Récupérer toutes les descriptions individuelles pour analyse de tendance
     * @param {number} maxIterations - Nombre max d'itérations à récupérer
     * @returns {Array} Liste des descriptions
     */
    getAllDescriptions(maxIterations = 10) {
        const descriptions = [];
        const startIdx = Math.max(0, this.memory.iterations.length - maxIterations);
        
        for (let i = startIdx; i < this.memory.iterations.length; i++) {
            if (this.memory.iterations[i]) {
                descriptions.push({
                    iteration: i,
                    individual_before: this.memory.iterations[i].descriptions?.individual_before,
                    collective_before: this.memory.iterations[i].descriptions?.collective_before,
                    individual_after: this.memory.iterations[i].predictions?.individual_after,
                    collective_after: this.memory.iterations[i].predictions?.collective_after
                });
            }
        }
        
        return descriptions;
    }
    
    /**
     * Vider la mémoire (utile pour tests ou reset)
     */
    clearMemory() {
        this.memory.iterations = [];
        console.log('[Context Manager] 🗑️ Mémoire vidée');
    }
    
    /**
     * Obtenir le nombre d'itérations stockées
     * @returns {number} Nombre d'itérations
     */
    getIterationCount() {
        return this.memory.iterations.length;
    }
}

// Export pour ES6 modules
export { GeminiContextManager };

