# Tests de génération d'images Gemini

## Test: Génération d'images seed via Gemini 2.5 Flash Image

Ce script teste la génération d'images pixel art 20x20 via l'API Gemini et l'extraction des 400 codes HEX correspondants.

## Installation des dépendances

Un environnement virtuel dédié aux tests a été créé dans `python/test_venv/`.

Si vous devez recréer l'environnement ou installer les dépendances:

```bash
cd python
python3 -m venv test_venv
test_venv/bin/pip install Pillow httpx
```

## Utilisation

1. Définir la clé API Gemini:
```bash
export GEMINI_API_KEY="your-api-key"
```

2. Lancer le test avec l'environnement virtuel:
```bash
cd python
test_venv/bin/python tests/test_gemini_image_generation.py
```

Ou depuis la racine du projet:
```bash
python/test_venv/bin/python python/tests/test_gemini_image_generation.py
```

## Résultats

Les résultats sont sauvegardés dans `python/tests/test_output_images/`:
- Images PNG générées (pour inspection visuelle)
- Fichiers JSON avec les codes HEX et pixels formatés

## Format des résultats

Chaque test génère:
- Une image PNG (probablement 1024x1024 ou 768x768 pixels)
- Un fichier JSON contenant:
  - `hex_codes`: Liste de 400 codes HEX (format "#RRGGBB")
  - `pixels`: Liste de 400 pixels au format "x,y#HEX" pour Poietic Generator

## Notes

- L'image générée par Gemini sera en haute résolution mais stylisée pour ressembler à du pixel art 20x20
- Le script divise l'image en 20x20 blocs et lit la couleur au centre de chaque bloc
- Chaque bloc correspond à un "super-pixel" dans l'image haute résolution

