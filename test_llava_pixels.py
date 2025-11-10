#!/usr/bin/env python3
"""
Test si LLaVA peut générer des pixels au format x,y:RVB
"""

import httpx
import json
from PIL import Image
import io
import base64

# URL de votre instance Ollama OVH
OLLAMA_URL = "https://2d30a9cf-f8ff-4217-9edd-1c44b3f8a857.app.bhs.ai.cloud.ovh.net"

def create_test_image():
    """Créer une image de test : diagonale bleue sur fond noir"""
    img = Image.new('RGB', (20, 20), color=(0, 0, 0))
    pixels = img.load()
    
    # Diagonale bleue
    for i in range(20):
        pixels[i, i] = (0, 0, 100)  # Bleu foncé
    
    # Upscale à 200×200 pour que LLaVA voit mieux
    img = img.resize((200, 200), Image.NEAREST)
    
    # Convertir en base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Sauvegarder pour vérification visuelle
    img.save('test_diagonal.png')
    print("✅ Image de test créée : test_diagonal.png")
    
    return img_base64

def test_llava_with_image(image_base64):
    """Tester LLaVA avec l'image"""
    
    prompt = """You are a pixel artist. Look at this 20×20 pixel grid and continue the drawing.

STRICT FORMAT (exactly 2 lines):
Line 1: my idea: [your vision in 3-5 words]
Line 2: pixels: x,y:RVB x,y:RVB x,y:RVB ... [EXACTLY 50 pixels, space-separated]

COORDINATES: x and y from 0 to 19
COLORS: RVB = 3 digits (R/G/B each 0-9)
Example: 003=blue, 900=red, 090=green, 555=gray

CRITICAL: Generate EXACTLY 50 pixels in one continuous line!

EXAMPLE with 50 pixels:
my idea: blue circle
pixels: 8,8:003 9,8:003 10,8:003 8,9:003 10,9:003 8,10:003 9,10:003 10,10:003 7,7:003 11,7:003 7,11:003 11,11:003 6,8:003 12,8:003 6,9:003 12,9:003 6,10:003 12,10:003 8,6:003 9,6:003 10,6:003 8,12:003 9,12:003 10,12:003 7,8:004 11,8:004 7,9:004 11,9:004 7,10:004 11,10:004 8,7:004 9,7:004 10,7:004 8,11:004 9,11:004 10,11:004 9,9:005 8,13:003 9,13:003 10,13:003 7,13:003 11,13:003 13,8:003 13,9:003 13,10:003 5,8:003 5,9:003 5,10:003 9,5:003 10,5:003

Now YOUR turn - look at the image and generate EXACTLY 50 pixels:
my idea:"""

    print("\n📤 Envoi du prompt à LLaVA...")
    print(f"Prompt : {prompt[:200]}...")
    
    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llava:7b",
                    "prompt": prompt,
                    "images": [image_base64],
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 1000  # Augmenté pour permettre 50 pixels
                    }
                }
            )
            
            if response.status_code != 200:
                print(f"❌ Erreur HTTP {response.status_code}: {response.text}")
                return None
                
            result = response.json()
            llava_response = result.get("response", "")
            
            print("\n✅ Réponse de LLaVA :")
            print("="*60)
            print(llava_response)
            print("="*60)
            
            return llava_response
            
    except Exception as e:
        print(f"❌ Erreur lors de l'appel à LLaVA: {e}")
        return None

def analyze_response(response):
    """Analyser la réponse de LLaVA"""
    if not response:
        return
    
    print("\n🔍 ANALYSE DE LA RÉPONSE :")
    print("-"*60)
    
    # Vérifier le format
    has_my_idea = "my idea:" in response.lower()
    has_pixels = "pixels:" in response.lower()
    
    print(f"✅ Contient 'my idea:' : {has_my_idea}")
    print(f"✅ Contient 'pixels:' : {has_pixels}")
    
    if has_pixels:
        # Extraire les pixels
        lines = response.split('\n')
        pixel_line = None
        for line in lines:
            if 'pixels:' in line.lower():
                pixel_line = line
                break
        
        if pixel_line:
            # Compter les pixels (format x,y:RVB)
            import re
            # Pattern pour x,y:RVB (où x,y sont 0-19 et RVB sont 3 chiffres)
            pattern = r'\d+,\d+:\d{3}'
            pixels = re.findall(pattern, pixel_line)
            
            print(f"✅ Pixels trouvés : {len(pixels)}")
            print(f"   Exemples : {pixels[:5] if pixels else 'aucun'}")
            
            # Vérifier le format
            valid_pixels = []
            invalid_pixels = []
            for pixel in pixels[:10]:  # Vérifier les 10 premiers
                parts = pixel.split(':')
                if len(parts) == 2:
                    coords = parts[0].split(',')
                    if len(coords) == 2:
                        x, y = int(coords[0]), int(coords[1])
                        rgb = parts[1]
                        if 0 <= x < 20 and 0 <= y < 20 and len(rgb) == 3:
                            valid_pixels.append(pixel)
                        else:
                            invalid_pixels.append(pixel)
                    else:
                        invalid_pixels.append(pixel)
                else:
                    invalid_pixels.append(pixel)
            
            print(f"✅ Pixels valides : {len(valid_pixels)}/10 testés")
            if invalid_pixels:
                print(f"⚠️  Pixels invalides : {invalid_pixels}")
    
    print("-"*60)
    
    # Verdict final
    print("\n🎯 VERDICT :")
    if has_my_idea and has_pixels and len(pixels) >= 45:
        print("✅✅✅ LLaVA GÉNÈRE 50 PIXELS AU BON FORMAT !")
        print("   → Option LLaVA Full est TOTALEMENT VIABLE")
        print("   → LLaVA peut REMPLACER Ollama complètement")
        print(f"   → {len(pixels)} pixels générés (objectif: 50)")
    elif has_my_idea and has_pixels and len(pixels) >= 20:
        print("✅ LLaVA génère le format avec un bon nombre de pixels")
        print(f"   → {len(pixels)} pixels générés (objectif: 50)")
        print("   → Option LLaVA Full est VIABLE avec ajustements")
    elif has_my_idea and has_pixels:
        print("⚠️  LLaVA génère le format mais pas assez de pixels")
        print(f"   → Seulement {len(pixels)} pixels (objectif: 50)")
        print("   → Ajuster max_tokens ou le prompt")
    else:
        print("❌ LLaVA ne respecte PAS le format attendu")
        print("   → Option LLaVA Full NON viable")
        print("   → Rester avec Ollama + feedback textuel minimal")

def main():
    print("🧪 TEST LLAVA - GÉNÉRATION DE PIXELS")
    print("="*60)
    
    # Vérifier si LLaVA est disponible
    print("\n1️⃣  Vérification de LLaVA...")
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(f"{OLLAMA_URL}/api/tags")
            models = response.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            
            if any("llava" in name for name in model_names):
                print("✅ LLaVA est installé !")
                llava_models = [name for name in model_names if "llava" in name]
                print(f"   Modèles disponibles : {llava_models}")
            else:
                print("❌ LLaVA n'est PAS installé")
                print(f"   Modèles disponibles : {model_names}")
                print("\n💡 Pour installer LLaVA :")
                print(f"   curl -X POST {OLLAMA_URL}/api/pull -d '{{\"name\": \"llava:7b\"}}'")
                return
    except Exception as e:
        print(f"❌ Impossible de vérifier les modèles : {e}")
        print("\n💡 Continuons quand même le test...")
    
    # Créer l'image de test
    print("\n2️⃣  Création de l'image de test...")
    image_base64 = create_test_image()
    
    # Tester LLaVA
    print("\n3️⃣  Test de génération de pixels avec LLaVA...")
    response = test_llava_with_image(image_base64)
    
    # Analyser la réponse
    if response:
        print("\n4️⃣  Analyse de la réponse...")
        analyze_response(response)
    
    print("\n" + "="*60)
    print("Test terminé !")

if __name__ == "__main__":
    main()

