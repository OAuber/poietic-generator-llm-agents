#!/usr/bin/env python3
"""
LLM Bot via API REST
===================

Exemple d'utilisation de l'API REST pour contrôler un bot avec un LLM.
Cette approche est plus simple que l'utilisation directe des WebSockets.

Nécessite:
    - Le serveur API REST doit être en cours d'exécution:
      python api_server.py
    - Une clé API pour OpenAI ou Anthropic
"""

import requests
import json
import time
import os
import sys


class PoieticAPIClient:
    """Client simple pour l'API REST Poietic."""
    
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url
        self.session_id = None
        
    def create_session(self, poietic_url: str = "ws://localhost:3001/updates", name: str = None):
        """Crée une nouvelle session."""
        response = requests.post(
            f"{self.api_url}/sessions",
            json={"poietic_url": poietic_url, "name": name}
        )
        response.raise_for_status()
        data = response.json()
        self.session_id = data["session_id"]
        print(f"✅ Session créée: {self.session_id}")
        return self.session_id
        
    def get_my_cell(self):
        """Récupère l'état de ma cellule."""
        response = requests.get(f"{self.api_url}/sessions/{self.session_id}/cell")
        response.raise_for_status()
        return response.json()
        
    def draw(self, x: int, y: int, color: str):
        """Dessine un pixel."""
        response = requests.post(
            f"{self.api_url}/sessions/{self.session_id}/draw",
            json={"x": x, "y": y, "color": color}
        )
        response.raise_for_status()
        return response.json()
        
    def draw_multiple(self, pixels: list):
        """Dessine plusieurs pixels."""
        response = requests.post(
            f"{self.api_url}/sessions/{self.session_id}/draw/multiple",
            json={"pixels": pixels}
        )
        response.raise_for_status()
        return response.json()
        
    def get_session_info(self):
        """Récupère les infos de la session."""
        response = requests.get(f"{self.api_url}/sessions/{self.session_id}")
        response.raise_for_status()
        return response.json()
        
    def close_session(self):
        """Ferme la session."""
        if self.session_id:
            response = requests.delete(f"{self.api_url}/sessions/{self.session_id}")
            response.raise_for_status()
            print("🛑 Session fermée")


def cell_to_description(cell_data: dict) -> str:
    """Convertit l'état de la cellule en description textuelle."""
    pixels = cell_data.get("pixels", {})
    pixel_count = cell_data.get("pixel_count", 0)
    
    if pixel_count == 0:
        return "Cellule vide (20x20 pixels, tous blancs)"
        
    # Compter les couleurs
    colors = {}
    for coords, color in pixels.items():
        colors[color] = colors.get(color, 0) + 1
        
    description = f"Cellule avec {pixel_count} pixels colorés sur 400 possibles.\n"
    description += f"Couleurs utilisées: {len(colors)}\n"
    
    if colors:
        sorted_colors = sorted(colors.items(), key=lambda x: x[1], reverse=True)
        top_colors = sorted_colors[:5]
        description += "Top 5 couleurs:\n"
        for color, count in top_colors:
            description += f"  - {color}: {count} pixels\n"
            
    return description


def ask_openai(prompt: str, api_key: str, model: str = "gpt-4o-mini") -> str:
    """Interroge OpenAI GPT."""
    import openai
    client = openai.OpenAI(api_key=api_key)
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "Tu es un artiste numérique créatif qui dessine dans une grille de pixels."
            },
            {"role": "user", "content": prompt}
        ],
        temperature=0.9,
        max_tokens=500
    )
    
    return response.choices[0].message.content


def ask_anthropic(prompt: str, api_key: str, model: str = "claude-3-5-sonnet-20241022") -> str:
    """Interroge Anthropic Claude."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    
    response = client.messages.create(
        model=model,
        max_tokens=500,
        temperature=0.9,
        system="Tu es un artiste numérique créatif qui dessine dans une grille de pixels.",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )
    
    return response.content[0].text


def main():
    """Fonction principale."""
    import argparse
    
    parser = argparse.ArgumentParser(description="LLM Bot via API REST")
    parser.add_argument("--api-url", default="http://localhost:8000", help="URL de l'API REST")
    parser.add_argument("--poietic-url", default="ws://localhost:3001/updates", help="URL Poietic")
    parser.add_argument("--provider", choices=["openai", "anthropic"], default="openai")
    parser.add_argument("--interval", type=float, default=5.0, help="Intervalle entre décisions (s)")
    parser.add_argument("--iterations", type=int, default=10, help="Nombre d'itérations (-1 = infini)")
    
    args = parser.parse_args()
    
    # Vérifier la clé API
    if args.provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("❌ OPENAI_API_KEY non définie")
            sys.exit(1)
        ask_llm = lambda p: ask_openai(p, api_key)
    else:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            print("❌ ANTHROPIC_API_KEY non définie")
            sys.exit(1)
        ask_llm = lambda p: ask_anthropic(p, api_key)
    
    print("🤖 LLM Bot via API REST")
    print(f"🔗 API: {args.api_url}")
    print(f"🧠 Provider: {args.provider.upper()}")
    print()
    
    # Créer le client API
    client = PoieticAPIClient(args.api_url)
    
    try:
        # Créer une session
        client.create_session(args.poietic_url, name=f"LLM Bot ({args.provider})")
        time.sleep(1)
        
        # Afficher les infos
        info = client.get_session_info()
        print(f"👤 User ID: {info['poietic_user_id']}")
        print(f"📐 Grid size: {info['grid_size']}")
        print(f"👥 Users: {info['user_count']}")
        print()
        
        # Boucle de décision
        iteration = 0
        while args.iterations < 0 or iteration < args.iterations:
            iteration += 1
            print(f"🤔 Itération {iteration}: Le LLM réfléchit...")
            
            # Récupérer l'état
            cell = client.get_my_cell()
            cell_desc = cell_to_description(cell)
            
            # Construire le prompt
            prompt = f"""Tu contrôles un bot qui dessine dans une grille de 20x20 pixels.

État actuel de ta cellule:
{cell_desc}

Propose 10 pixels à dessiner pour créer ou continuer un motif intéressant.
Réponds UNIQUEMENT au format JSON suivant (sans markdown):

{{
  "reasoning": "brève explication de ton intention artistique",
  "actions": [
    {{"x": 0, "y": 0, "color": "#FF0000"}},
    {{"x": 1, "y": 1, "color": "#00FF00"}}
  ]
}}

Contraintes:
- x et y doivent être entre 0 et 19
- Les couleurs sont au format hexadécimal (#RRGGBB)
- Sois créatif mais cohérent avec ce qui existe déjà
"""

            try:
                # Demander au LLM
                response = ask_llm(prompt)
                
                # Parser la réponse
                response = response.strip()
                if response.startswith("```"):
                    lines = response.split("\n")
                    response = "\n".join(lines[1:-1])
                if response.startswith("json"):
                    response = response[4:].strip()
                    
                data = json.loads(response)
                
                print(f"💭 Reasoning: {data.get('reasoning', 'N/A')}")
                
                # Dessiner
                actions = data.get("actions", [])
                valid_actions = []
                for action in actions:
                    x = action.get("x")
                    y = action.get("y")
                    color = action.get("color")
                    if x is not None and y is not None and color:
                        if 0 <= x < 20 and 0 <= y < 20:
                            valid_actions.append([x, y, color])
                            
                if valid_actions:
                    client.draw_multiple(valid_actions)
                    print(f"✅ {len(valid_actions)} pixels dessinés")
                else:
                    print("⚠️  Aucune action valide")
                    
            except Exception as e:
                print(f"❌ Erreur: {e}")
                
            print(f"⏸️  Pause de {args.interval}s...")
            time.sleep(args.interval)
            
        print("\n✅ Terminé!")
        
    except KeyboardInterrupt:
        print("\n🛑 Interruption...")
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
    finally:
        client.close_session()


if __name__ == "__main__":
    main()


