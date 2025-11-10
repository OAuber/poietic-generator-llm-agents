# 📺 Mémo Viewers - Poietic Generator

## Deux versions du viewer disponibles

### 🎨 `/viewer` - Version classique (avec initial state)
- **Utilisation** : Affichage standard du Poietic Generator
- **Caractéristique** : Chaque agent affiche un motif initial calculé à partir de son UUID via `ColorGenerator`
- **Avantage** : Visualisation immédiate de la présence des agents
- **Fichiers** :
  - `public/viewer.html`
  - `public/js/poietic-viewer.js`
  - `public/js/poietic-color-generator.js`

### ⚫ `/viewer2` - Version fond noir (pour LLMs)
- **Utilisation** : Observation de l'activité des agents LLM
- **Caractéristique** : Tous les pixels commencent en **noir** (#000000)
- **Avantage** : Met en évidence UNIQUEMENT les pixels dessinés par les agents
- **Parfait pour** : Visualiser ce que les LLMs dessinent réellement
- **Fichiers** :
  - `public/viewer2.html`
  - `public/js/poietic-viewer2.js` (sans dépendance à ColorGenerator)

## 🔗 URLs d'accès

```
http://localhost:3001/viewer    → Version classique
http://localhost:3001/viewer2   → Version fond noir (LLM)
```

## 🎯 Quand utiliser chaque version ?

| Situation | Viewer recommandé |
|-----------|-------------------|
| Session avec utilisateurs humains | `/viewer` |
| Tests avec agents LLM (Ollama, Claude, etc.) | `/viewer2` |
| Démonstration publique | `/viewer` |
| Débogage de dessins LLM | `/viewer2` |
| Enregistrement vidéo de l'activité LLM | `/viewer2` |

## 🛠️ Intégration dans ai-player.html

Le panneau de contrôle `ai-player.html` permet de choisir entre les deux viewers via le menu déroulant **"Viewer URL"** :

- Viewer (avec initial state)
- **Viewer2 (fond noir - LLM)** ← Recommandé pour les agents IA
- Local viewer (localhost:3001)
- Local viewer2 (localhost:3001)
- Production (poietic-generator.net)

## 📊 Différences techniques

| Feature | viewer | viewer2 |
|---------|--------|---------|
| ColorGenerator | ✅ Oui | ❌ Non |
| Couleur initiale | Palette UUID | Noir (#000000) |
| Taille fichier JS | ~11 KB | ~9 KB |
| Dépendances | poietic-color-generator.js | Aucune |
| Performance | Standard | Légèrement plus rapide |

## 🚀 Compilation

Après modification, recompiler avec :

```bash
cd ~/poietic-generator-api
./deploy.sh
```

Les deux viewers seront automatiquement inclus dans le binaire compilé.

---

**Créé le** : 2025-10-12  
**Dernière mise à jour** : 2025-10-12

