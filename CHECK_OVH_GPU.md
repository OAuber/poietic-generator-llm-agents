# Vérification GPU OVH pour LLaVA 13B

**Date**: 2025-01-23  
**Question**: Le modèle LLaVA 13B peut-il être installé sur le serveur OVH ?

---

## 🔍 **Vérifications Nécessaires**

### **1. Vérifier la VRAM disponible**
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

### **2. Interprétation des Résultats**

| GPU Type | VRAM Totale | LLaVA 7B | LLaVA 13B | LLaVA 34B |
|----------|-------------|----------|-----------|----------|
| **Tesla T4** | 15 GB | ✅ OK (8 GB) | ✅ OK (16 GB) | ❌ Non (32 GB) |
| **Tesla V100** | 32 GB | ✅ OK (8 GB) | ✅ OK (16 GB) | ✅ OK (32 GB) |
| **RTX 4090** | 24 GB | ✅ OK (8 GB) | ✅ OK (16 GB) | ❌ Non (32 GB) |
| **RTX 3080** | 10 GB | ✅ OK (8 GB) | ❌ Non (16 GB) | ❌ Non (32 GB) |

---

## 📊 **Exigences LLaVA 13B**

### **VRAM Requise**
- **Minimum** : 16 GB VRAM
- **Recommandé** : 20 GB VRAM (marge de sécurité)
- **Taille modèle** : ~8 GB (téléchargement)

### **RAM Système**
- **Minimum** : 32 GB RAM
- **Recommandé** : 64 GB RAM

### **CPU**
- **Minimum** : 8 cœurs
- **Recommandé** : 16+ cœurs

---

## 🧪 **Test d'Installation**

### **Étape 1 : Vérifier Ollama**
```bash
# Sur le serveur OVH
ollama list
```

### **Étape 2 : Tester le téléchargement**
```bash
# Commencer le téléchargement (peut prendre 10-15 minutes)
ollama pull llava:13b
```

### **Étape 3 : Vérifier l'installation**
```bash
# Lister les modèles installés
ollama list

# Tester le modèle
ollama run llava:13b "Hello, can you see this text?"
```

---

## ⚠️ **Risques Potentiels**

### **1. VRAM Insuffisante**
- **Symptôme** : `CUDA out of memory` lors du chargement
- **Solution** : Revenir à LLaVA 7B ou utiliser un GPU plus puissant

### **2. RAM Système Insuffisante**
- **Symptôme** : Processus tué par le système (OOM Killer)
- **Solution** : Augmenter la RAM ou utiliser un modèle plus petit

### **3. Performance Dégradée**
- **Symptôme** : Réponses très lentes (>5 minutes)
- **Solution** : Optimiser les paramètres ou revenir à 7B

---

## 📋 **Checklist de Vérification**

### **Avant Installation**
- [ ] `nvidia-smi` → VRAM ≥ 16 GB
- [ ] `free -h` → RAM ≥ 32 GB
- [ ] `nproc` → CPU ≥ 8 cœurs
- [ ] `df -h` → Espace disque ≥ 20 GB

### **Pendant Installation**
- [ ] `ollama pull llava:13b` → Pas d'erreur
- [ ] Téléchargement complet (~8 GB)
- [ ] Pas de message "out of memory"

### **Après Installation**
- [ ] `ollama list` → `llava:13b` présent
- [ ] `ollama run llava:13b` → Réponse rapide (<30s)
- [ ] Test avec image → Génération correcte

---

## 🎯 **Recommandation**

### **Si VRAM ≥ 16 GB** → **Installer LLaVA 13B** ✅
- Meilleure qualité
- Moins d'erreurs de coordonnées
- Vitesse acceptable (200-300s)

### **Si VRAM < 16 GB** → **Garder LLaVA 7B** ⚠️
- Qualité moyenne mais fonctionnelle
- Rapide (100-150s)
- Stable

---

## 📞 **Actions Immédiates**

1. **Connectez-vous au serveur OVH**
2. **Exécutez** : `nvidia-smi`
3. **Partagez le résultat** pour vérification
4. **Si OK** → `ollama pull llava:13b`
5. **Si erreur** → Garder LLaVA 7B

---

**Pouvez-vous vérifier la VRAM sur votre serveur OVH ?** 🔍
