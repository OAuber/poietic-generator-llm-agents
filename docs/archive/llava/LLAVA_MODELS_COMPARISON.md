# Comparaison des Modèles Vision pour Poietic Generator

**Date**: 2025-01-23  
**Question**: Peut-on passer à LLaVA 13B ou autre chose ?

---

## 📊 **Modèles Disponibles sur Ollama**

### **LLaVA (Large Language and Vision Assistant)**

| Modèle | Taille | Params | VRAM | Vitesse | Qualité Instructions | Disponible Ollama |
|--------|--------|--------|------|---------|---------------------|-------------------|
| **llava:7b** (actuel) | 4.7 GB | 7B | 8 GB | ⚡⚡⚡ Rapide (100-150s) | ⭐⭐ Moyen | ✅ `ollama run llava:7b` |
| **llava:13b** | 8 GB | 13B | 16 GB | ⚡⚡ Moyen (200-300s) | ⭐⭐⭐ Bon | ✅ `ollama run llava:13b` |
| **llava:34b** | 20 GB | 34B | 32 GB | ⚡ Lent (400-600s) | ⭐⭐⭐⭐ Excellent | ✅ `ollama run llava:34b` |

---

## 🆚 **Alternatives Vision**

### **1. Llama 3.2 Vision (Meta)**
```bash
ollama run llama3.2-vision:11b
ollama run llama3.2-vision:90b
```

| Version | Taille | Params | VRAM | Vitesse | Qualité | Notes |
|---------|--------|--------|------|---------|---------|-------|
| **11b** | 7.9 GB | 11B | 16 GB | ⚡⚡ Moyen | ⭐⭐⭐ Bon | Meilleur que LLaVA 7B |
| **90b** | 55 GB | 90B | 64 GB | 🐌 Très lent | ⭐⭐⭐⭐⭐ Excellent | GPU puissant requis |

**Avantages** :
- ✅ Meilleure compréhension des instructions
- ✅ Moins d'erreurs de format
- ✅ Vision plus précise

**Inconvénients** :
- ❌ VRAM importante requise
- ❌ Plus lent que LLaVA 7B

---

### **2. MiniCPM-V (OpenBMB)**
```bash
ollama run minicpm-v:8b
```

| Version | Taille | Params | VRAM | Vitesse | Qualité | Notes |
|---------|--------|--------|------|---------|---------|-------|
| **8b** | 5.4 GB | 8B | 10 GB | ⚡⚡⚡ Rapide | ⭐⭐⭐ Bon | Compact et efficace |

**Avantages** :
- ✅ Très compact (5.4 GB)
- ✅ Rapide
- ✅ Bonne vision

**Inconvénients** :
- ⚠️ Moins testé que LLaVA
- ⚠️ Documentation limitée

---

### **3. Moondream (vikhyatk)**
```bash
ollama run moondream:latest
```

| Version | Taille | Params | VRAM | Vitesse | Qualité | Notes |
|---------|--------|--------|------|---------|---------|-------|
| **1.8b** | 1.7 GB | 1.8B | 4 GB | ⚡⚡⚡⚡ Très rapide | ⭐⭐ Basique | Ultra léger |

**Avantages** :
- ✅ Extrêmement léger (1.7 GB)
- ✅ Très rapide (30-60s)
- ✅ Faible VRAM

**Inconvénients** :
- ❌ Qualité médiocre pour tâches complexes
- ❌ Pas adapté pour notre usage

---

## 🎯 **Recommandations**

### **Option 1 : LLaVA 13B (Upgrade conservatif)** ⭐ RECOMMANDÉ

**Commande** :
```bash
# Sur le serveur OVH avec Ollama
ollama pull llava:13b
```

**Modification** :
```javascript
// Dans public/js/llm-adapters/llava-v2.js (ligne ~140)
const payload = {
    model: "llava:13b",  // Au lieu de "llava:7b"
    // ...
};
```

**Avantages** :
- ✅ **Meilleure qualité** : Moins d'erreurs de coordonnées, meilleur respect du format
- ✅ **Compatible** : Même API que LLaVA 7B
- ✅ **Raisonnable** : VRAM 16 GB (probablement OK sur OVH)
- ✅ **Vitesse acceptable** : 200-300s (avec timeout 300s, ça passe)

**Inconvénients** :
- ⚠️ Plus lent : 200-300s au lieu de 100-150s
- ⚠️ Plus de VRAM : 16 GB au lieu de 8 GB

---

### **Option 2 : Llama 3.2 Vision 11B (Alternative moderne)**

**Commande** :
```bash
ollama pull llama3.2-vision:11b
```

**Modification** :
```javascript
const payload = {
    model: "llama3.2-vision:11b",
    // ...
};
```

**Avantages** :
- ✅ **Plus récent** : Sorti en 2024, architecture moderne
- ✅ **Meilleure compréhension** : Moins de "hallucinations"
- ✅ **Format multimodal natif** : Conçu pour vision+texte

**Inconvénients** :
- ⚠️ **Adapter l'API** : Format de requête différent
- ⚠️ **Moins testé** : Sur notre use case spécifique

---

### **Option 3 : Garder LLaVA 7B + Améliorer les Prompts** (Safe)

**Avantages** :
- ✅ **Aucun changement serveur**
- ✅ **Pas de risque**
- ✅ **Rapide**

**Inconvénients** :
- ❌ Qualité limitée par le modèle 7B

---

## 🔍 **Vérification GPU OVH**

Avant de changer de modèle, vérifiez la VRAM disponible :

```bash
# Sur le serveur OVH
nvidia-smi
```

**Output attendu** :
```
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 535.86.10    Driver Version: 535.86.10    CUDA Version: 12.2   |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  Tesla T4            Off  | 00000000:00:04.0 Off |                    0 |
| N/A   45C    P8    10W /  70W |   8192MiB / 15360MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
```

**Interprétation** :
- **Tesla T4** : 15 GB VRAM → **LLaVA 13B OK** ✅
- **Tesla V100** : 32 GB VRAM → **LLaVA 34B OK** ✅
- **RTX 4090** : 24 GB VRAM → **Llama 3.2 Vision 11B OK** ✅

---

## 📊 **Tableau de Décision**

| Critère | LLaVA 7B (actuel) | LLaVA 13B | Llama 3.2 Vision 11B |
|---------|-------------------|-----------|----------------------|
| **Qualité instructions** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Vitesse** | ⚡⚡⚡ (100-150s) | ⚡⚡ (200-300s) | ⚡⚡ (200-300s) |
| **VRAM requise** | 8 GB | 16 GB | 16 GB |
| **Facilité migration** | N/A | ✅ Très facile | ⚠️ Adapter API |
| **Risque** | N/A | ⚠️ Faible | ⚠️ Moyen |
| **Recommandé ?** | - | ✅ OUI | ⚠️ Si GPU puissant |

---

## ✅ **Plan d'Action pour LLaVA 13B**

### **1. Vérifier VRAM disponible**
```bash
ssh votre_serveur_ovh
nvidia-smi
```

### **2. Télécharger LLaVA 13B**
```bash
ollama pull llava:13b
# Taille: ~8 GB, prend 5-10 minutes
```

### **3. Modifier le code**
```javascript
// public/js/llm-adapters/llava-v2.js (ligne ~140)
const payload = {
    model: "llava:13b",  // Changer ici
    prompt: systemMessage,
    // ... reste inchangé
};
```

### **4. Tester**
1. Recharger `ai-player-v2.html` (Ctrl+Shift+R)
2. Lancer un agent
3. Observer :
   - **Moins d'erreurs de coordonnées** ✅
   - **Meilleur respect du format** ✅
   - **Temps de réponse : 200-300s** (au lieu de 100-150s)

### **5. Ajuster le timeout (optionnel)**
Si les timeouts persistent :
```javascript
// public/js/llm-adapters/llava-v2.js (ligne ~152)
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 240000); // 240s (4 min)
```

---

## 🎯 **Ma Recommandation Finale**

**Passez à LLaVA 13B** si :
- ✅ VRAM ≥ 16 GB sur le serveur OVH
- ✅ Vous voulez **moins d'erreurs** de format/coordonnées
- ✅ Vous acceptez **+50-100s** de temps de réponse

**Gardez LLaVA 7B** si :
- ✅ VRAM < 16 GB
- ✅ Vitesse > Qualité
- ✅ Les erreurs sont acceptables

**Testez Llama 3.2 Vision 11B** si :
- ✅ VRAM ≥ 16 GB
- ✅ Vous voulez la **meilleure qualité**
- ✅ Vous êtes prêt à adapter l'API

---

**Voulez-vous que je vous aide à migrer vers LLaVA 13B ?** 🚀
