#!/usr/bin/env python3
"""
Test de génération d'images 20x20 pixel art via Gemini 2.5 Flash Image API
et extraction des 400 codes HEX correspondants.

Usage:
    export GEMINI_API_KEY="your-api-key"
    python python/tests/test_gemini_image_generation.py
"""

import os
import sys
import base64
import json
import asyncio
from typing import Optional, List
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx

try:
    from PIL import Image
    import io
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("⚠️  PIL/Pillow non disponible. Installer avec: pip install Pillow")
    print("   Le script ne pourra pas extraire les codes HEX sans Pillow.")


async def list_available_models(api_key: Optional[str] = None) -> Optional[dict]:
    """
    Liste les modèles Gemini disponibles via l'API.
    
    Returns:
        Dict avec les modèles disponibles ou None en cas d'erreur
    """
    if not api_key:
        api_key = os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        print("❌ GEMINI_API_KEY non définie")
        return None
    
    url = f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
    
    try:
        timeout_obj = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.get(url)
            
            if not resp.is_success:
                error_text = resp.text
                print(f"❌ Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return None
            
            data = resp.json()
            return data
    except Exception as e:
        print(f"❌ Erreur appel API: {e}")
        return None


async def find_image_generation_model(api_key: Optional[str] = None) -> Optional[str]:
    """
    Trouve le nom du modèle capable de générer des images.
    
    Returns:
        Nom du modèle ou None si non trouvé
    """
    models_data = await list_available_models(api_key)
    
    if not models_data:
        return None
    
    print("\n📋 Modèles Gemini disponibles:")
    print("=" * 80)
    
    image_models = []
    
    for model in models_data.get('models', []):
        name = model.get('name', '')
        display_name = model.get('displayName', '')
        supported_methods = model.get('supportedGenerationMethods', [])
        
        # Afficher tous les modèles pour debug
        methods_str = ', '.join(supported_methods) if supported_methods else 'none'
        print(f"  - {name}")
        print(f"    Display: {display_name}")
        print(f"    Methods: {methods_str}")
        
        # Chercher les modèles avec "image" dans le nom ou les méthodes
        if 'image' in name.lower() or 'generateImage' in methods_str or 'imageGeneration' in methods_str:
            image_models.append(name)
            print(f"    ✅ Modèle de génération d'image potentiel!")
    
    print("=" * 80)
    
    if image_models:
        print(f"\n🎯 Modèles de génération d'image trouvés: {image_models}")
        return image_models[0]  # Retourner le premier trouvé
    
    # Si aucun modèle spécifique trouvé, essayer des noms de modèles Imagen
    print("\n⚠️  Aucun modèle spécifique 'image' trouvé. Tentative avec des modèles Imagen...")
    imagen_names = [
        'imagen-3.0-generate-002',
        'imagen-3',
        'imagen-2',
        'imagen',
        'gemini-2.5-flash-image',  # Le modèle "Banana"
        'gemini-2.0-flash-exp'
    ]
    
    # D'abord chercher dans les modèles listés
    for name in imagen_names:
        for model in models_data.get('models', []):
            model_name = model.get('name', '')
            if name in model_name:
                print(f"  ✅ Modèle Imagen trouvé: {model_name}")
                return model_name
    
    # Si aucun modèle Imagen n'est listé, essayer quand même avec imagen-3.0-generate-002
    # (il pourrait ne pas apparaître dans la liste mais être disponible)
    print("  ⚠️  Aucun modèle Imagen dans la liste. Tentative avec imagen-3.0-generate-002...")
    return "imagen-3.0-generate-002"


async def generate_image_via_gemini(prompt: str, api_key: Optional[str] = None, model_name: Optional[str] = None) -> Optional[bytes]:
    """
    Génère une image via Gemini API (détecte automatiquement le modèle approprié).
    
    Args:
        prompt: Description de l'image à générer (ex: "Génère une tête de chat en 20x20 pixels")
        api_key: Clé API Gemini (ou depuis GEMINI_API_KEY env var)
        model_name: Nom du modèle à utiliser (si None, détection automatique)
    
    Returns:
        Bytes de l'image (PNG/JPEG) ou None en cas d'erreur
    """
    if not api_key:
        api_key = os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        print("❌ GEMINI_API_KEY non définie")
        return None
    
    # Si aucun nom de modèle fourni, essayer de le trouver automatiquement
    if not model_name:
        print("🔍 Recherche du modèle de génération d'image...")
        model_name = await find_image_generation_model(api_key)
        if not model_name:
            print("❌ Aucun modèle de génération d'image trouvé dans la liste")
            print("   Tentative avec imagen-3.0-generate-002 (modèle Imagen)...")
            model_name = "imagen-3.0-generate-002"
        else:
            print(f"✅ Utilisation du modèle: {model_name}")
    
    # Construire le prompt pour pixel art 20x20
    full_prompt = f"{prompt}, style pixel art, 20x20 grid, high contrast, recognizable form"
    
    # Extraire juste le nom du modèle (sans le préfixe "models/")
    model_id = model_name.replace('models/', '') if model_name.startswith('models/') else model_name
    
    url = f"https://generativelanguage.googleapis.com/v1/models/{model_id}:generateContent?key={api_key}"
    
    body = {
        'contents': [{
            'parts': [{'text': full_prompt}]
        }],
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 4096
        }
    }
    
    print(f"🖼️  Génération d'image avec prompt: {full_prompt}")
    print(f"📡 Appel API: {url.split('?')[0]}...")
    
    try:
        timeout_obj = httpx.Timeout(60.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout_obj) as client:
            resp = await client.post(url, json=body)
            
            if not resp.is_success:
                error_text = resp.text
                print(f"❌ Erreur HTTP {resp.status_code}: {error_text[:500]}")
                return None
            
            data = resp.json()
            
            # Extraire l'image depuis la réponse
            if not data.get('candidates') or len(data['candidates']) == 0:
                print("❌ Aucun candidat dans la réponse")
                return None
            
            candidate = data['candidates'][0]
            content = candidate.get('content', {})
            
            # Chercher l'image dans les parts
            image_data = None
            mime_type = None
            text_response = ""
            
            for part in content.get('parts', []):
                if 'inline_data' in part:
                    inline_data = part['inline_data']
                    image_data = inline_data.get('data')
                    mime_type = inline_data.get('mime_type', 'image/png')
                    break
                elif 'text' in part:
                    text_response += part.get('text', '')
            
            if not image_data:
                # Afficher la réponse texte complète pour debug
                if text_response:
                    print(f"📝 Réponse texte reçue (premiers 1000 chars):")
                    print(f"   {text_response[:1000]}")
                    if len(text_response) > 1000:
                        print(f"   ... (total: {len(text_response)} chars)")
                else:
                    print("📝 Aucune réponse texte trouvée dans les parts")
                    # Afficher toutes les parts pour debug
                    print(f"   Parts disponibles: {json.dumps(content.get('parts', []), indent=2)[:500]}")
                
                print("\n❌ Aucune image trouvée dans la réponse")
                print(f"   Finish reason: {candidate.get('finishReason', 'unknown')}")
                print(f"   Structure réponse complète: {json.dumps(data, indent=2)[:1000]}")
                print("\n💡 CONCLUSION: Gemini 2.5 Flash ne génère pas d'images directement via l'API v1.")
                print("   Il génère uniquement du texte.")
                print("\n   OPTIONS POSSIBLES:")
                print("   1. Utiliser un autre service de génération d'images (DALL-E, Midjourney, Stable Diffusion)")
                print("   2. Demander à Gemini de générer une description détaillée, puis utiliser cette description")
                print("      avec un autre service pour générer l'image")
                print("   3. Vérifier s'il existe un endpoint spécifique pour la génération d'images (peut-être v1beta?)")
                return None
            
            # Décoder base64
            try:
                image_bytes = base64.b64decode(image_data)
                print(f"✅ Image générée: {len(image_bytes)} bytes, format: {mime_type}")
                return image_bytes
            except Exception as e:
                print(f"❌ Erreur décodage base64: {e}")
                return None
                
    except Exception as e:
        print(f"❌ Erreur appel API: {e}")
        return None


def extract_20x20_hex_from_image(image_bytes: bytes) -> Optional[List[str]]:
    """
    Extrait les 400 codes HEX depuis une image pixel art haute résolution.
    
    L'image générée par Gemini sera probablement 1024x1024 ou 768x768 pixels,
    mais stylisée pour ressembler à une grille 20x20. Cette fonction divise
    l'image en 20x20 blocs et lit la couleur au centre de chaque bloc.
    
    Args:
        image_bytes: Bytes de l'image (PNG/JPEG)
    
    Returns:
        Liste de 400 codes HEX (format "#RRGGBB") dans l'ordre:
        ligne par ligne, de gauche à droite, de haut en bas
        ou None en cas d'erreur
    """
    if not PIL_AVAILABLE:
        print("❌ PIL/Pillow requis pour extraire les codes HEX")
        return None
    
    try:
        # Charger l'image
        image = Image.open(io.BytesIO(image_bytes))
        width, height = image.size
        
        print(f"📐 Image chargée: {width}x{height} pixels")
        
        # Convertir en RGB si nécessaire
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Calculer la taille de chaque bloc (super-pixel)
        block_width = width / 20
        block_height = height / 20
        
        print(f"📦 Taille de chaque bloc: {block_width:.1f}x{block_height:.1f} pixels")
        
        hex_codes = []
        
        # Parcourir la grille 20x20
        for row in range(20):
            for col in range(20):
                # Calculer le centre du bloc
                center_x = int((col + 0.5) * block_width)
                center_y = int((row + 0.5) * block_height)
                
                # S'assurer que les coordonnées sont dans les limites
                center_x = min(center_x, width - 1)
                center_y = min(center_y, height - 1)
                
                # Lire la couleur au centre
                r, g, b = image.getpixel((center_x, center_y))
                
                # Convertir en HEX
                hex_code = f"#{r:02x}{g:02x}{b:02x}".upper()
                hex_codes.append(hex_code)
        
        print(f"✅ {len(hex_codes)} codes HEX extraits")
        return hex_codes
        
    except Exception as e:
        print(f"❌ Erreur extraction HEX: {e}")
        import traceback
        traceback.print_exc()
        return None


def format_hex_as_pixels(hex_codes: List[str]) -> List[str]:
    """
    Formate les codes HEX au format pixels attendu par Poietic Generator.
    
    Format: ["0,0#HEX1", "0,1#HEX2", ..., "19,19#HEX400"]
    
    Args:
        hex_codes: Liste de 400 codes HEX
    
    Returns:
        Liste de strings au format "x,y#HEX"
    """
    pixels = []
    for row in range(20):
        for col in range(20):
            idx = row * 20 + col
            if idx < len(hex_codes):
                pixels.append(f"{col},{row}#{hex_codes[idx]}")
    return pixels


async def test_seed_generation():
    """
    Teste la génération d'images seed avec plusieurs prompts.
    """
    print("=" * 80)
    print("TEST: Génération d'images seed via Gemini API")
    print("=" * 80)
    print()
    
    # Créer le dossier de sortie
    output_dir = Path(__file__).parent / "test_output_images"
    output_dir.mkdir(exist_ok=True)
    print(f"📁 Images de test sauvegardées dans: {output_dir}")
    print()
    
    # Détecter le modèle une seule fois au début
    print("🔍 Détection du modèle de génération d'image...")
    model_name = await find_image_generation_model()
    if not model_name:
        print("\n❌ Aucun modèle de génération d'image trouvé.")
        print("   Le script va quand même essayer avec les modèles standards...")
        model_name = None
    else:
        print(f"\n✅ Modèle sélectionné: {model_name}\n")
    
    # Prompts de test
    test_prompts = [
        "Génère une tête de chat",
        "Génère un œil stylisé",
        "Génère une fleur simple",
        "Génère un symbole géométrique"
    ]
    
    results = []
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n{'='*80}")
        print(f"TEST {i}/{len(test_prompts)}: {prompt}")
        print(f"{'='*80}\n")
        
        # Générer l'image (réutiliser le modèle détecté)
        image_bytes = await generate_image_via_gemini(prompt, model_name=model_name)
        
        if not image_bytes:
            print(f"❌ Échec génération pour: {prompt}")
            results.append({
                'prompt': prompt,
                'success': False,
                'error': 'Génération échouée'
            })
            continue
        
        # Sauvegarder l'image pour inspection
        output_path = output_dir / f"test_{i:02d}_{prompt.replace(' ', '_')[:20]}.png"
        with open(output_path, 'wb') as f:
            f.write(image_bytes)
        print(f"💾 Image sauvegardée: {output_path}")
        
        # Extraire les codes HEX
        hex_codes = extract_20x20_hex_from_image(image_bytes)
        
        if not hex_codes or len(hex_codes) != 400:
            print(f"❌ Échec extraction HEX (obtenu: {len(hex_codes) if hex_codes else 0} au lieu de 400)")
            results.append({
                'prompt': prompt,
                'success': False,
                'error': f'Extraction échouée ({len(hex_codes) if hex_codes else 0} codes)',
                'image_path': str(output_path)
            })
            continue
        
        # Formater en pixels
        pixels = format_hex_as_pixels(hex_codes)
        
        # Afficher un échantillon
        print(f"\n📊 Échantillon des codes HEX (premiers 10):")
        for j in range(min(10, len(hex_codes))):
            row = j // 20
            col = j % 20
            print(f"   [{col:2d},{row:2d}]: {hex_codes[j]}")
        
        print(f"\n📊 Échantillon des pixels formatés (premiers 10):")
        for j in range(min(10, len(pixels))):
            print(f"   {pixels[j]}")
        
        # Sauvegarder les résultats JSON
        result_data = {
            'prompt': prompt,
            'hex_codes': hex_codes,
            'pixels': pixels,
            'image_path': str(output_path)
        }
        
        result_json_path = output_dir / f"test_{i:02d}_result.json"
        with open(result_json_path, 'w') as f:
            json.dump(result_data, f, indent=2)
        print(f"💾 Résultats JSON sauvegardés: {result_json_path}")
        
        results.append({
            'prompt': prompt,
            'success': True,
            'hex_count': len(hex_codes),
            'pixels_count': len(pixels),
            'image_path': str(output_path),
            'result_json_path': str(result_json_path)
        })
        
        print(f"\n✅ Test {i} réussi!")
    
    # Résumé final
    print(f"\n{'='*80}")
    print("RÉSUMÉ DES TESTS")
    print(f"{'='*80}\n")
    
    successful = sum(1 for r in results if r.get('success'))
    total = len(results)
    
    print(f"Tests réussis: {successful}/{total}")
    print()
    
    for i, result in enumerate(results, 1):
        status = "✅" if result.get('success') else "❌"
        print(f"{status} Test {i}: {result['prompt']}")
        if result.get('success'):
            print(f"   - {result.get('hex_count')} codes HEX extraits")
            print(f"   - {result.get('pixels_count')} pixels formatés")
            print(f"   - Image: {result.get('image_path')}")
        else:
            print(f"   - Erreur: {result.get('error')}")
        print()
    
    return results


if __name__ == "__main__":
    # Vérifier que PIL est disponible
    if not PIL_AVAILABLE:
        print("❌ PIL/Pillow est requis pour ce script.")
        print("   Installer avec: pip install Pillow")
        sys.exit(1)
    
    # Vérifier la clé API
    if not os.getenv('GEMINI_API_KEY'):
        print("❌ GEMINI_API_KEY non définie")
        print("   Définir avec: export GEMINI_API_KEY='your-api-key'")
        sys.exit(1)
    
    # Lancer les tests
    asyncio.run(test_seed_generation())

