/**
 * Gemini Complexity Calculator
 * Calcul des métriques Simplicity Theory avec profondeur pour agents Gemini
 */

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
        this.p_individual = 5;   // Profondeur individuelle (pixels sur 5 itérations)
        this.p_collective = 3;   // Profondeur collective (pixels sur 3 itérations)
        
        console.log('[Complexity Calculator] ✅ Initialisé avec p_individual=5, p_collective=3');
    }
    
    /**
     * Calculer C_w avec profondeur p
     * C_w = somme des pixels sur les p dernières itérations × alpha
     * @param {number} depth - Profondeur (p)
     * @param {Array} pixelCounts - Tableau des nombres de pixels par itération
     * @returns {number} Complexité de génération en bits
     */
    calculateCw(depth, pixelCounts) {
        const alpha = 33; // bits par pixel (2×log₂(20) + log₂(16777216) ≈ 33)
        let totalPixels = 0;
        
        // Somme des pixels sur les p dernières itérations
        const startIdx = Math.max(0, pixelCounts.length - depth);
        
        for (let i = startIdx; i < pixelCounts.length; i++) {
            if (pixelCounts[i] && pixelCounts[i] > 0) {
                totalPixels += pixelCounts[i];
            }
        }
        
        const C_w = totalPixels * alpha;
        
        console.log(`[Complexity Calculator] C_w calculé: ${totalPixels} pixels × ${alpha} = ${C_w} bits (depth=${depth})`);
        
        return C_w;
    }
    
    /**
     * Calculer U(i) = C_w(i, p) - C_d(i+1)
     * @param {number} iteration - Numéro de l'itération courante
     * @param {Array} pixelCounts - Tableau des nombres de pixels par itération
     * @param {string} description - Description de l'état AVANT (de l'itération i+1)
     * @param {boolean} isCollective - True pour calcul collectif, false pour individuel
     * @returns {Object} {C_w, C_d, U}
     */
    calculateU(iteration, pixelCounts, description, isCollective = false) {
        // Choisir la profondeur appropriée
        const depth = isCollective ? this.p_collective : this.p_individual;
        
        // C_w: somme des pixels des p dernières itérations
        const C_w = this.calculateCw(depth, pixelCounts);
        
        // C_d: longueur de description de l'itération i+1
        const C_d = description.length * 8; // 8 bits par caractère ASCII
        
        // U
        const U = C_w - C_d;
        
        console.log(`[Complexity Calculator] U(${iteration}) = ${C_w} - ${C_d} = ${U} bits`);
        
        return { C_w, C_d, U };
    }
    
    /**
     * Stocker les métriques calculées
     * @param {number} iteration - Numéro d'itération
     * @param {Object} metrics - Métriques {C_w, C_d, U}
     * @param {boolean} isCollective - True pour métriques collectives
     */
    storeMetrics(iteration, metrics, isCollective = false) {
        const target = isCollective ? this.metrics.global : this.metrics.local;
        
        if (!target.iterations.includes(iteration)) {
            target.iterations.push(iteration);
            target.C_w.push(metrics.C_w);
            target.C_d.push(metrics.C_d);
            target.U.push(metrics.U);
        } else {
            // Mise à jour si l'itération existe déjà
            const idx = target.iterations.indexOf(iteration);
            target.C_w[idx] = metrics.C_w;
            target.C_d[idx] = metrics.C_d;
            target.U[idx] = metrics.U;
        }
        
        console.log(`[Complexity Calculator] ✅ Métriques ${isCollective ? 'collectives' : 'locales'} stockées pour itération ${iteration}`);
    }
    
    /**
     * Stocker la prévisibilité (0-10)
     * @param {number} iteration - Numéro d'itération
     * @param {number} predictabilityIndividual - Note 0-10
     * @param {number} predictabilityCollective - Note 0-10
     */
    storePredictability(iteration, predictabilityIndividual, predictabilityCollective) {
        // Pad arrays si nécessaire
        while (this.metrics.local.predictability.length < iteration) {
            this.metrics.local.predictability.push(0);
            this.metrics.global.predictability.push(0);
        }
        
        this.metrics.local.predictability[iteration] = predictabilityIndividual;
        this.metrics.global.predictability[iteration] = predictabilityCollective;
        
        console.log(`[Complexity Calculator] ✅ Prévisibilités stockées: individual=${predictabilityIndividual}/10, collective=${predictabilityCollective}/10`);
    }
    
    /**
     * Calculer la prévisibilité (0-10) par comparaison sémantique
     * @param {string} descriptionBefore - Description de ce qui s'est réellement passé
     * @param {string} predictionAfter - Description de ce qui était prédit
     * @returns {number} Note de prévisibilité entre 0 et 10
     */
    calculatePredictability(descriptionBefore, predictionAfter) {
        if (!descriptionBefore || !predictionAfter) {
            return 0;
        }
        
        // Simple similarity basée sur overlap de mots
        const similarity = this.semanticSimilarity(descriptionBefore, predictionAfter);
        
        // Convertir en note 0-10
        const predictability = Math.round(similarity * 10);
        
        console.log(`[Complexity Calculator] Prévisibilité calculée: ${predictability}/10 (similarity=${similarity.toFixed(2)})`);
        
        return predictability;
    }
    
    /**
     * Simple similarity basée sur overlap de mots
     * @param {string} text1 - Texte 1
     * @param {string} text2 - Texte 2
     * @returns {number} Score de similarité entre 0 et 1
     */
    semanticSimilarity(text1, text2) {
        // Nettoyer les textes
        const clean1 = text1.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
        const clean2 = text2.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
        
        // Extraire les mots uniques
        const words1 = new Set(clean1.split(/\s+/).filter(w => w.length > 0));
        const words2 = new Set(clean2.split(/\s+/).filter(w => w.length > 0));
        
        // Intersection
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        
        // Union
        const union = new Set([...words1, ...words2]);
        
        // Jaccard similarity
        const jaccard = intersection.size / union.size;
        
        // Bonus pour les mots importants (couleurs, formes, positions)
        const importantWords = ['purple', 'pink', 'blue', 'green', 'yellow', 'magenta', 'cyan',
                                'vertical', 'horizontal', 'diagonal', 'cross', 'orb', 'totem',
                                'center', 'corner', 'border', 'radiating', 'converging'];
        
        let matchBonus = 0;
        importantWords.forEach(word => {
            if (words1.has(word) && words2.has(word)) {
                matchBonus += 0.05;
            }
        });
        
        const finalScore = Math.min(1, jaccard + matchBonus);
        
        return finalScore;
    }
    
    /**
     * Obtenir les métriques d'une itération spécifique
     * @param {number} iteration - Numéro d'itération
     * @param {boolean} isCollective - True pour métriques collectives
     * @returns {Object|null} Métriques
     */
    getMetrics(iteration, isCollective = false) {
        const target = isCollective ? this.metrics.global : this.metrics.local;
        const idx = target.iterations.indexOf(iteration);
        
        if (idx === -1) return null;
        
        return {
            iteration: iteration,
            C_w: target.C_w[idx],
            C_d: target.C_d[idx],
            U: target.U[idx],
            predictability: target.predictability[idx] || 0
        };
    }
    
    /**
     * Obtenir toutes les métriques
     * @returns {Object} Objet contenant local et global
     */
    getAllMetrics() {
        return this.metrics;
    }
    
    /**
     * Ajuster les profondeurs
     * @param {number} pIndividual - Nouvelle profondeur individuelle
     * @param {number} pCollective - Nouvelle profondeur collective
     */
    setDepth(pIndividual, pCollective) {
        this.p_individual = pIndividual;
        this.p_collective = pCollective;
        console.log(`[Complexity Calculator] Profondeurs ajustées: p_individual=${pIndividual}, p_collective=${pCollective}`);
    }
    
    /**
     * Vider les métriques (utile pour tests ou reset)
     */
    clearMetrics() {
        this.metrics = {
            iterations: [],
            local: { C_w: [], C_d: [], U: [], predictability: [] },
            global: { C_w: [], C_d: [], U: [], predictability: [] }
        };
        console.log('[Complexity Calculator] 🗑️ Métriques vidées');
    }
    
    /**
     * Obtenir le nombre d'itérations de métriques stockées
     * @returns {number} Nombre d'itérations
     */
    getMetricCount() {
        return this.metrics.local.iterations.length;
    }
}

// Export pour ES6 modules
export { GeminiComplexityCalculator };

