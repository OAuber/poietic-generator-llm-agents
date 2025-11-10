#!/bin/bash
cd /home/oa/poietic-generator-api
git add public/llava-prompts.json public/ai-player.html public/js/ai-player.js public/js/llm-adapters/llava.js
git commit -m "feat(llava): amelioration parsing multi-lignes et prompts optimises

- Parser collecte toutes les lignes 'pixels:' et les concatene
- Normalisation automatique du format ##HEX -> #HEX
- Ajout d'espaces entre triplets colles
- Fix parsing response: gere string directe de LLaVA
- Prompts simplifies: 200-400 pixels au lieu de 200-800
- Suppression des exemples de couleurs (contre-productif)
- Version HTML: 20250116-67"
git push origin master
echo "Push termine avec succes!"

