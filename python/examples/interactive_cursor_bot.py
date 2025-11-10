#!/usr/bin/env python3
"""
Bot AI interactif qui communique avec Claude via le chat Cursor.
Version interactive qui attend les réponses de l'utilisateur.
"""

import requests
import json
import time
import random
import argparse
import logging
from typing import Dict, List, Tuple
import math

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger("InteractiveCursorBot")

class InteractiveCursorBot:
    def __init__(self, api_url="http://localhost:8000"):
        self.api_url = api_url
        self.session_id = None
        self.poietic_user_id = None
        self.my_cell_state = {}
        self.cell_width = 20
        self.cell_height = 20
        self.iteration = 0
        self.drawing_history = []

    def connect(self) -> bool:
        """Se connecte à l'API REST."""
        try:
            # Créer la session
            response = requests.post(f'{self.api_url}/sessions', json={
                'poietic_url': 'ws://localhost:3001/updates',
                'name': 'Interactive-Cursor-Bot'
            })
            response.raise_for_status()
            session_data = response.json()
            self.session_id = session_data['session_id']
            
            # Récupérer les infos complètes de la session pour obtenir le poietic_user_id
            response = requests.get(f'{self.api_url}/sessions/{self.session_id}')
            response.raise_for_status()
            session_info = response.json()
            self.poietic_user_id = session_info['poietic_user_id']
            
            logger.info(f"🤖 Bot interactif connecté: {self.session_id}")
            logger.info(f"🎨 Poietic user ID: {self.poietic_user_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Erreur connexion: {e}")
            logger.error(f"📋 Réponse API: {response.text if 'response' in locals() else 'N/A'}")
            return False

    def get_my_cell(self) -> Dict:
        """Récupère l'état de ma cellule."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/cell")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"❌ Erreur récupération cellule: {e}")
            return {"pixels": {}, "pixel_count": 0}

    def get_all_users(self) -> List[Dict]:
        """Récupère la liste de tous les utilisateurs connectés."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/users")
            response.raise_for_status()
            return response.json().get("users", [])
        except Exception as e:
            logger.error(f"❌ Erreur récupération utilisateurs: {e}")
            return []

    def get_user_cell(self, user_id: str) -> Dict:
        """Récupère l'état de la cellule d'un autre utilisateur."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/users/{user_id}/cell")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"❌ Erreur récupération cellule utilisateur {user_id}: {e}")
            return {"pixels": {}, "pixel_count": 0}

    def draw_multiple(self, pixels: List[Tuple[int, int, str]]) -> bool:
        """Dessine plusieurs pixels."""
        try:
            pixel_data = [{"sub_x": x, "sub_y": y, "color": color} for x, y, color in pixels]
            response = requests.post(f"{self.api_url}/sessions/{self.session_id}/draw/multiple", 
                                  json={"pixels": pixel_data})
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"❌ Erreur dessin multiple: {e}")
            return False

    def analyze_environment(self) -> Dict:
        """Analyse l'environnement complet."""
        print("\n" + "="*80)
        print("🔍 ANALYSE DE L'ENVIRONNEMENT")
        print("="*80)
        
        # Analyser ma cellule
        my_cell = self.get_my_cell()
        my_pixels = my_cell.get("pixels", {})
        my_pixel_count = my_cell.get("pixel_count", 0)
        
        print(f"📊 MA CELLULE:")
        print(f"   - {my_pixel_count} pixels dessinés sur 400 possibles")
        print(f"   - Densité: {my_pixel_count/400:.1%}")
        
        # Analyser les couleurs de ma cellule
        my_colors = {}
        for coords, color in my_pixels.items():
            my_colors[color] = my_colors.get(color, 0) + 1
        
        if my_colors:
            sorted_colors = sorted(my_colors.items(), key=lambda x: x[1], reverse=True)
            print(f"   - {len(my_colors)} couleurs: {[f'{c}({n})' for c, n in sorted_colors[:3]]}")
        
        # Analyser les autres utilisateurs
        users = self.get_all_users()
        session_info = requests.get(f"{self.api_url}/sessions/{self.session_id}").json()
        my_user_id = session_info.get("poietic_user_id")
        
        print(f"\n👥 AUTRES UTILISATEURS ({len(users)-1}):")
        global_colors = {}
        other_users_info = []
        
        for user in users:
            user_id = user["user_id"]
            if user_id == my_user_id:
                continue
                
            position = user.get("position", [0, 0])
            user_cell = self.get_user_cell(user_id)
            user_pixels = user_cell.get("pixels", {})
            user_pixel_count = user_cell.get("pixel_count", 0)
            
            print(f"   - Utilisateur {user_id[:8]}... à la position {position}: {user_pixel_count} pixels")
            
            # Analyser les couleurs de cet utilisateur
            user_colors = {}
            for coords, color in user_pixels.items():
                user_colors[color] = user_colors.get(color, 0) + 1
                global_colors[color] = global_colors.get(color, 0) + 1
            
            if user_colors:
                top_color = max(user_colors.items(), key=lambda x: x[1])
                print(f"     Couleur dominante: {top_color[0]} ({top_color[1]} pixels)")
            
            other_users_info.append({
                "user_id": user_id,
                "position": position,
                "pixel_count": user_pixel_count,
                "colors": user_colors
            })
        
        print(f"\n🌍 ENVIRONNEMENT GLOBAL:")
        print(f"   - {len(global_colors)} couleurs différentes utilisées")
        print(f"   - Activité totale: {sum(user['pixel_count'] for user in other_users_info)} pixels")
        
        return {
            "my_cell": {
                "pixel_count": my_pixel_count,
                "density": my_pixel_count / 400,
                "colors": my_colors,
                "pixels": my_pixels
            },
            "other_users": other_users_info,
            "global_colors": global_colors,
            "total_activity": sum(user['pixel_count'] for user in other_users_info)
        }

    def create_prompt_for_claude(self, analysis: Dict) -> str:
        """Crée un prompt détaillé pour Claude."""
        my_cell = analysis["my_cell"]
        other_users = analysis["other_users"]
        global_colors = analysis["global_colors"]
        
        prompt = f"""
🎨 CLAUDE, JE BESOINE DE TON AIDE POUR DESSINER !

Je participe à une création graphique collaborative en temps réel. Voici la situation :

📊 MA CELLULE (20x20 pixels):
- {my_cell['pixel_count']} pixels dessinés sur 400 possibles
- Densité: {my_cell['density']:.1%}
- Couleurs utilisées: {list(my_cell['colors'].keys())}

👥 AUTRES UTILISATEURS ({len(other_users)}):
"""
        
        for i, user in enumerate(other_users, 1):
            user_colors = list(user['colors'].keys())
            prompt += f"- Utilisateur {i}: {user['pixel_count']} pixels, couleurs: {user_colors}\n"
        
        prompt += f"""
🌍 ENVIRONNEMENT GLOBAL:
- {len(global_colors)} couleurs différentes dans l'espace
- Activité totale: {analysis['total_activity']} pixels

🎯 TON MISSION:
Donne-moi des instructions précises pour dessiner 5-15 pixels dans ma cellule. 
Sois créatif et collaboratif ! Réponds UNIQUEMENT au format JSON suivant :

{{
    "strategy": "description de ta stratégie artistique",
    "pixels": [
        {{"x": 5, "y": 7, "color": "#FF6B6B", "reason": "créer un point focal"}},
        {{"x": 6, "y": 7, "color": "#4ECDC4", "reason": "compléter le motif"}}
    ]
}}

Règles:
- x et y entre 0 et 19
- Couleurs en format hex (#RRGGBB)
- Maximum 15 pixels
- Sois créatif et réactif à l'environnement !
"""
        
        return prompt

    def parse_claude_response(self, response: str) -> List[Tuple[int, int, str]]:
        """Parse la réponse de Claude et extrait les pixels à dessiner."""
        try:
            # Nettoyer la réponse (enlever le markdown si présent)
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]
            
            data = json.loads(response.strip())
            
            pixels = []
            for pixel in data.get("pixels", []):
                x = int(pixel["x"])
                y = int(pixel["y"])
                color = pixel["color"]
                
                if 0 <= x < 20 and 0 <= y < 20:
                    pixels.append((x, y, color))
            
            return pixels
            
        except Exception as e:
            logger.error(f"❌ Erreur parsing réponse Claude: {e}")
            return []

    def interactive_session(self):
        """Session interactive avec Claude."""
        if not self.connect():
            return

        print("🎨 Bot Interactif Cursor démarré!")
        print("💭 Je vais analyser l'environnement et te demander des conseils")
        print("🛑 Tape 'quit' pour arrêter")
        
        try:
            while True:
                self.iteration += 1
                print(f"\n🤔 ITÉRATION {self.iteration}")
                
                # Analyser l'environnement
                analysis = self.analyze_environment()
                
                # Créer le prompt pour Claude
                prompt = self.create_prompt_for_claude(analysis)
                
                print("\n" + "="*80)
                print("📝 PROMPT POUR CLAUDE:")
                print("="*80)
                print(prompt)
                print("\n" + "="*80)
                
                # Attendre la réponse de l'utilisateur
                print("\n💬 Claude, peux-tu répondre avec tes instructions de dessin ?")
                print("📋 Copie-colle ta réponse JSON ici...")
                
                user_input = input("\n🎨 Ta réponse (ou 'quit' pour arrêter): ").strip()
                
                if user_input.lower() == 'quit':
                    break
                
                if not user_input:
                    print("⏸️  Aucune réponse, passage à l'itération suivante...")
                    continue
                
                print(f"\n🤖 RÉPONSE REÇUE:")
                print(user_input)
                
                # Parser et exécuter
                pixels = self.parse_claude_response(user_input)
                
                if pixels:
                    print(f"\n✏️  Exécution des instructions...")
                    success = self.draw_multiple(pixels)
                    if success:
                        print(f"✅ {len(pixels)} pixels dessinés avec succès!")
                        print("🎨 Résultat visible sur http://localhost:3001")
                        self.drawing_history.extend(pixels)
                    else:
                        print("❌ Erreur lors du dessin")
                else:
                    print("⏸️  Aucun pixel valide à dessiner")
                
                print(f"\n📊 Historique: {len(self.drawing_history)} pixels dessinés au total")
                
        except KeyboardInterrupt:
            print("\n👋 Bot arrêté par l'utilisateur.")
        except Exception as e:
            logger.error(f"❌ Erreur critique: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bot Interactif Cursor pour Poietic Generator.")
    parser.add_argument("--api_url", type=str, default="http://localhost:8000",
                        help="URL de l'API REST Poietic Bot.")
    args = parser.parse_args()

    bot = InteractiveCursorBot(api_url=args.api_url)
    bot.interactive_session()
