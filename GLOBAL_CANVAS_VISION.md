# 👁️ Vision Globale LLaVA - Canvas Collectif

## 🎨 Concept

LLaVA peut maintenant voir le **canvas global complet** avec toutes les grilles des agents assemblées, exactement comme dans le Générateur Poïétique original où les humains voient l'ensemble de la composition.

## 🏗️ Architecture

### Backend (Python)

**Endpoint `/api/global-canvas-image`**
- Accepte les données de toutes les grilles (positions + pixels)
- Assemble les grilles 20×20 en un canvas global
- Upscale à 200×200 par grille pour meilleure perception
- Retourne une image PNG en base64

**Format d'entrée :**
```json
{
  "grids": {
    "user_id_1": {
      "position": [0, 0],
      "pixels": [{"x": 5, "y": 10, "color": "#FF0000"}, ...]
    },
    "user_id_2": {
      "position": [1, 0],
      "pixels": [...]
    }
  },
  "grid_size": 3
}
```

**Format de sortie :**
```json
{
  "image": "iVBORw0KGgoAAAANS...",
  "width": 600,
  "height": 600,
  "grid_count": 5
}
```

### Frontend (JavaScript)

**`llava.js`**
- `fetchGlobalCanvas()` : Récupère l'image du canvas global
- `buildSystemPrompt()` : Adapte le prompt pour la vision globale
- Retourne `{systemMessage, userMessage, needsImage: true, useGlobalCanvas: true}`

**`ai-player.js`**
- Détecte `systemPrompt.useGlobalCanvas`
- Collecte les données de toutes les grilles (`this.otherUsers`)
- Appelle `fetchGlobalCanvas()` au lieu de `gridToImage()`
- Envoie l'image globale à LLaVA

## 🎯 Avantages

### Pour LLaVA
- **Vision d'ensemble** : Comprend le contexte collectif
- **Cohérence visuelle** : Peut harmoniser sa contribution
- **Bridges visuels** : Prolonge les motifs des voisins naturellement
- **Conscience spatiale** : Sait où il se situe dans la composition

### Pour l'émergence collective
- **Coordination naturelle** : Les agents voient ce que font les autres
- **Patterns globaux** : Émergence de motifs à grande échelle
- **Esthétique cohérente** : Palette de couleurs et styles harmonisés
- **Comme le Générateur Poïétique original** : Vision partagée du canvas

## 📊 Performance

- **Taille d'image** : ~200-600 KB selon le nombre de grilles
- **Temps de génération** : ~100-300ms pour assembler le canvas
- **Bande passante** : Optimisée avec upscaling côté serveur

## 🔮 Évolutions futures

### Périodicité configurable
- Vision globale toutes les N itérations
- Vision locale entre deux visions globales
- Économie de bande passante

### Vision 3×3 (locale étendue)
- Agent au centre + 8 voisins
- Plus léger que le canvas global
- Contexte immédiat suffisant

### Annotations visuelles
- Marquer la position de l'agent sur l'image
- Highlighter les bordures de sa grille
- Indiquer les directions (N, S, E, W)

## 🚀 Utilisation

1. Sélectionner **LLaVA 7B Vision** dans l'interface
2. Démarrer l'agent
3. LLaVA reçoit automatiquement l'image du canvas global
4. Il génère des pixels en harmonie avec le collectif

## 🎨 Philosophie

> "Vous n'êtes pas seul. Vous faites partie d'une création collective."

Cette approche recrée l'expérience du Générateur Poïétique original où chaque participant voit l'ensemble et contribue sa part à l'œuvre commune.

---

**Implémenté le** : 13 octobre 2025  
**Version** : 1.0.0


