# Guide de Test - Intégration Gemini Flash

**Date**: 2025-01-23  
**Status**: ✅ Intégration terminée - Prêt pour test

---

## 🎯 **Ce qui a été implémenté**

### **1. Adaptateur Gemini** (`gemini-v2.js`)
- ✅ Communication avec API Google Gemini Flash
- ✅ Schéma JSON structuré pour les réponses
- ✅ Gestion des clés API (localStorage)
- ✅ Parsing des coordonnées et couleurs
- ✅ Extraction des descriptions (a, b, c, d)

### **2. Prompts Optimisés** (`gemini-prompts-v2.json`)
- ✅ `seed_system` : Première itération (fond noir)
- ✅ `continuation_system` : Itérations suivantes
- ✅ `memory_context` : Contexte collaboratif
- ✅ Placeholders de couleurs aléatoires

### **3. Interface V2** (`ai-player-v2.html`)
- ✅ Option "💎 Google Gemini Flash (API)" activée
- ✅ Script Gemini chargé et exposé globalement
- ✅ Compatible avec le système de tabs existant

### **4. Intégration ai-player.js**
- ✅ Détection automatique de `GeminiV2Adapter`
- ✅ Validation de clé API pour Gemini
- ✅ Compatibilité avec le système existant

---

## 🧪 **Tests à Effectuer**

### **Test 1 : Interface de Base**
1. **Ouvrir** : `http://localhost:3001/ai-player-v2`
2. **Vérifier** : Option "💎 Google Gemini Flash (API)" visible
3. **Sélectionner** : Gemini dans le sélecteur LLM
4. **Attendre** : Prompt pour clé API Google

### **Test 2 : Authentification**
1. **Entrer** votre clé API Google Gemini
2. **Vérifier** : Clé stockée dans localStorage
3. **Console** : `✅ [V2] Gemini V2 Adapter (JSON Format) exposed globally`

### **Test 3 : Premier Appel API**
1. **Lancer** l'agent Gemini
2. **Observer** : Console logs Gemini
3. **Vérifier** : Réponse JSON structurée
4. **Attendre** : Génération de pixels

### **Test 4 : Qualité des Réponses**
1. **Vérifier** : Coordonnées dans la plage 0-19
2. **Vérifier** : Couleurs au format #HEX
3. **Vérifier** : Descriptions complètes (a, b, c, d)
4. **Vérifier** : Vitesse (5-15s vs 100-150s LLaVA)

---

## 🔍 **Logs à Surveiller**

### **Console Browser**
```
✅ [V2] Gemini V2 Adapter (JSON Format) exposed globally
🤖 [Gemini V2] Adapter initialisé
📝 [Gemini V2] Prompts chargés: seed_system,continuation_system,memory_context
💎 [V2] Utilisation de GeminiV2Adapter (JSON Format)
🚀 [Gemini V2] Appel API avec Gemini Flash...
📡 [Gemini V2] Réponse HTTP reçue, status: 200
✅ [Gemini V2] Pixels parsés: X
```

### **Erreurs Possibles**
```
❌ [Gemini V2] Clé API Gemini manquante
❌ [Gemini V2] Erreur API: HTTP 400: Bad Request
❌ [Gemini V2] Erreur parsing JSON: Unexpected token
```

---

## 📊 **Comparaison Attendue**

| Critère | LLaVA 7B | **Gemini Flash** |
|---------|----------|------------------|
| **Vitesse** | 100-150s | **5-15s** ⚡ |
| **Qualité** | ⭐⭐ | **⭐⭐⭐⭐** |
| **Coordonnées** | ⚠️ Erreurs fréquentes | **✅ Précises** |
| **Format** | Texte libre | **✅ JSON structuré** |
| **Descriptions** | Partielles | **✅ Complètes (a,b,c,d)** |

---

## 🚨 **Dépannage**

### **Problème : Clé API invalide**
- **Symptôme** : `HTTP 400: Bad Request`
- **Solution** : Vérifier la clé API Google Cloud

### **Problème : Réponse JSON invalide**
- **Symptôme** : `Erreur parsing JSON`
- **Solution** : Vérifier les logs de réponse brute

### **Problème : Coordonnées invalides**
- **Symptôme** : Pixels ignorés
- **Solution** : Vérifier le schéma JSON dans les logs

### **Problème : Pas de pixels générés**
- **Symptôme** : `Pixels parsés: 0`
- **Solution** : Vérifier le prompt et les contraintes

---

## 🎯 **Prochaines Étapes**

1. **Tester** avec votre clé API
2. **Valider** la qualité des réponses
3. **Optimiser** les prompts si nécessaire
4. **Comparer** avec LLaVA 7B
5. **Décider** de l'adoption en production

---

**Prêt pour le test ! 🚀**

**Avez-vous votre clé API Google Gemini ?**
