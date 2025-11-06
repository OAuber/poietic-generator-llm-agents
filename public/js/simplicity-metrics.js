export const SimplicityMetrics = {
  // Estimate delta bits from an action strategy context
  estimateDeltaBits(context) {
    // context: { strategy, inStructure, colorCohesion, symmetry, anchors }
    const s = context || {};
    let deltaCw = 0;
    let deltaCd = 0;

    // Heuristics (conservatives)
    if (s.strategy === 'CREATE_NARRATIVE_SCENE') {
      deltaCd += 3; // narration compresse description
      deltaCw += 2; // coordination modérée
    } else if (s.strategy === 'EXTEND_BACKGROUND') {
      deltaCd += 2; // figure/ground
      deltaCw += 1; // faible coordination
    } else if (s.strategy === 'COMPLETE_MACRO_STRUCTURE') {
      deltaCd += 2;
      deltaCw += 2; // coordination multi-agents
    } else if (s.strategy === 'SIMPLIFY') {
      deltaCd += 1;
    } else if (s.strategy === 'COMPLEXIFY') {
      deltaCw += 2;
    }

    if (s.inStructure) {
      deltaCw += 1; // alignement structure
    }

    if (s.colorCohesion) {
      deltaCd += 1; // ton-sur-ton
    }

    if (s.symmetry) {
      deltaCw += 1;
    }

    if (s.anchors) {
      deltaCw += Math.min(2, s.anchors);
    }

    return { deltaCwBits: deltaCw, deltaCdBits: deltaCd };
  },

  // Simple semantic/geometric proxy for prediction error [0..1]
  predictionError(prevPrediction, currentNarrative) {
    const a = (prevPrediction || '').toLowerCase();
    const b = (currentNarrative || '').toLowerCase();
    if (!a && !b) return 0;
    if (!a || !b) return 1;
    // Jaccard on words
    const sa = new Set(a.split(/\W+/).filter(Boolean));
    const sb = new Set(b.split(/\W+/).filter(Boolean));
    const inter = [...sa].filter(x => sb.has(x)).length;
    const union = new Set([...sa, ...sb]).size;
    const jaccard = union ? inter / union : 0;
    return 1 - jaccard; // 1=erreur forte
  }
};


