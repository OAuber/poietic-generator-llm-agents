#!/usr/bin/env python3
"""
Bot final optimisé pour Poietic Generator
"""

import asyncio
import websockets
import json
import logging
import time
import argparse
from typing import Dict, List, Tuple

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger('FinalBot')

class FinalBot:
    def __init__(self, poietic_url="ws://localhost:3001/updates", interval=5):
        self.poietic_url = poietic_url
        self.interval = interval
        self.websocket = None
        self.user_id = None
        self.my_cell_state = {}
        self.other_users = {}
        self.drawing_history = []
        self.iteration = 0
        self.running = True

    async def connect(self):
        """Connexion WebSocket."""
        try:
            print(f"🔌 Connexion à {self.poietic_url}...")
            self.websocket = await websockets.connect(self.poietic_url)
            print("✅ Connecté!")
            return True
        except Exception as e:
            print(f"❌ Erreur connexion: {e}")
            return False

    async def send_message(self, message):
        """Envoie un message via WebSocket."""
        if self.websocket:
            await self.websocket.send(json.dumps(message))

    async def draw_pixel(self, x: int, y: int, color: str):
        """Dessine un pixel."""
        message = {
            "type": "cell_update",
            "sub_x": x,
            "sub_y": y,
            "color": color
        }
        await self.send_message(message)
        coords = f"{x},{y}"
        self.my_cell_state[coords] = color

    async def draw_multiple(self, pixels: List[Tuple[int, int, str]]):
        """Dessine plusieurs pixels."""
        for x, y, color in pixels:
            await self.draw_pixel(x, y, color)
            await asyncio.sleep(0.2)

    def analyze_environment(self) -> Dict:
        """Analyse l'environnement."""
        print("\n" + "="*60)
        print("🔍 ANALYSE DE L'ENVIRONNEMENT")
        print("="*60)
        
        # Analyser ma cellule
        my_pixel_count = len(self.my_cell_state)
        my_colors = {}
        try:
            for coords, color in self.my_cell_state.items():
                if isinstance(color, str):
                    my_colors[color] = my_colors.get(color, 0) + 1
        except Exception as e:
            logger.error(f"❌ Erreur analyse couleurs: {e}")
            my_colors = {}
        
        print(f"📊 MA CELLULE:")
        print(f"   - {my_pixel_count} pixels dessinés sur 400 possibles")
        print(f"   - Densité: {my_pixel_count/400:.1%}")
        
        if my_colors:
            try:
                sorted_colors = sorted(my_colors.items(), key=lambda x: x[1], reverse=True)
                print(f"   - {len(my_colors)} couleurs: {[f'{c}({n})' for c, n in sorted_colors[:3]]}")
            except Exception as e:
                print(f"   - {len(my_colors)} couleurs utilisées")
        
        # Analyser les autres utilisateurs
        print(f"\n👥 AUTRES UTILISATEURS ({len(self.other_users)}):")
        other_users_info = []
        global_colors = my_colors.copy()
        
        try:
            for user_id, user_data in self.other_users.items():
                if isinstance(user_data, dict) and "pixels" in user_data:
                    user_pixels = user_data["pixels"]
                    user_pixel_count = len(user_pixels)
                    
                    user_colors = {}
                    for coords, color in user_pixels.items():
                        if isinstance(color, str):
                            user_colors[color] = user_colors.get(color, 0) + 1
                            global_colors[color] = global_colors.get(color, 0) + 1
                    
                    user_info = {
                        "user_id": user_id[:8] + "...",
                        "pixel_count": user_pixel_count,
                        "colors": list(user_colors.keys())
                    }
                    other_users_info.append(user_info)
                    
                    print(f"   - Utilisateur {user_id[:8]}...: {user_pixel_count} pixels, {len(user_colors)} couleurs")
                    
        except Exception as e:
            logger.error(f"❌ Erreur analyse autres utilisateurs: {e}")
        
        print(f"\n🌍 ENVIRONNEMENT GLOBAL:")
        print(f"   - {len(global_colors)} couleurs différentes utilisées")
        print(f"   - Activité totale: {my_pixel_count} pixels dans ma cellule")
        print(f"   - {sum(user['pixel_count'] for user in other_users_info)} pixels des autres utilisateurs")
        
        return {
            "my_cell": {
                "pixel_count": my_pixel_count,
                "density": my_pixel_count / 400,
                "colors": list(my_colors.keys())
            },
            "other_users": other_users_info,
            "global_environment": {
                "distinct_colors": len(global_colors),
                "total_activity": my_pixel_count + sum(user['pixel_count'] for user in other_users_info),
                "global_colors": global_colors
            }
        }

    def create_prompt_for_claude(self, analysis: Dict) -> str:
        """Crée un prompt pour Claude."""
        my_cell = analysis["my_cell"]
        other_users = analysis["other_users"]
        global_env = analysis["global_environment"]
        
        prompt = f"""
🎨 CLAUDE, JE BESOINE DE TON AIDE POUR DESSINER !

Je participe à une création graphique collaborative en temps réel. Voici la situation :

📊 MA CELLULE (20x20 pixels):
- {my_cell['pixel_count']} pixels dessinés sur 400 possibles
- Densité: {my_cell['density']:.1%}
- Couleurs utilisées: {my_cell['colors']}

👥 AUTRES UTILISATEURS ({len(other_users)}):
"""
        
        for i, user in enumerate(other_users, 1):
            user_colors = user['colors']
            prompt += f"- Utilisateur {i} ({user['user_id']}): {user['pixel_count']} pixels, couleurs: {user_colors}\n"
        
        prompt += f"""
🌍 ENVIRONNEMENT GLOBAL:
- {global_env['distinct_colors']} couleurs différentes dans l'espace
- Activité totale: {global_env['total_activity']} pixels

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
        """Parse la réponse de Claude."""
        try:
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

    async def handle_message(self, message: str):
        """Traite les messages reçus."""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "initial_state":
                self.user_id = data.get("my_user_id")
                print(f"🎨 Mon user_id: {self.user_id}")
                
                # Traiter les positions des utilisateurs
                if "user_positions" in data:
                    user_positions = data["user_positions"]
                    if isinstance(user_positions, dict):
                        for user_id, position in user_positions.items():
                            if user_id != self.user_id:
                                if isinstance(position, dict):
                                    position = [position.get("x", 0), position.get("y", 0)]
                                elif not isinstance(position, list):
                                    position = [0, 0]
                                
                                self.other_users[user_id] = {
                                    "position": position,
                                    "pixels": {}
                                }
                
            elif message_type == "new_user":
                user_id = data.get("user_id")
                position = data.get("position", [0, 0])
                
                if user_id != self.user_id:
                    if not isinstance(user_id, str):
                        user_id = str(user_id)
                    
                    self.other_users[user_id] = {
                        "position": position,
                        "pixels": {}
                    }
                    print(f"👤 Nouvel utilisateur: {user_id[:8]}... à la position {position}")
            
            elif message_type == "user_left":
                user_id = data.get("user_id")
                if user_id in self.other_users:
                    del self.other_users[user_id]
                    print(f"👋 Utilisateur parti: {user_id[:8]}...")
            
            elif message_type == "cell_update":
                user_id = data.get("user_id")
                sub_x = data.get("sub_x")
                sub_y = data.get("sub_y")
                color = data.get("color")
                
                if user_id == self.user_id:
                    coords = f"{sub_x},{sub_y}"
                    self.my_cell_state[coords] = color
                else:
                    if not isinstance(user_id, str):
                        user_id = str(user_id)
                    
                    if user_id not in self.other_users:
                        self.other_users[user_id] = {
                            "position": [0, 0],
                            "pixels": {}
                        }
                        print(f"👤 Nouvel utilisateur détecté via cell_update: {user_id[:8]}...")
                    
                    coords = f"{sub_x},{sub_y}"
                    self.other_users[user_id]["pixels"][coords] = color
                    
        except Exception as e:
            logger.error(f"❌ Erreur traitement message: {e}")

    async def run(self):
        """Boucle principale."""
        print("🚀 Bot Final démarré!")
        
        if not await self.connect():
            return
            
        try:
            # Écouter les messages en arrière-plan
            async def listen_messages():
                try:
                    async for message in self.websocket:
                        await self.handle_message(message)
                except Exception as e:
                    logger.error(f"❌ Erreur écoute messages: {e}")
            
            # Démarrer l'écoute
            listen_task = asyncio.create_task(listen_messages())
            
            # Attendre les messages initiaux
            print("⏳ Attente des messages initiaux...")
            await asyncio.sleep(3)
            
            # Boucle principale
            while self.running:
                self.iteration += 1
                print(f"\n🤔 ITÉRATION {self.iteration}")
                
                # Analyser l'environnement
                try:
                    analysis = self.analyze_environment()
                except Exception as e:
                    logger.error(f"❌ Erreur analyse: {e}")
                    await asyncio.sleep(self.interval)
                    continue
                
                # Vérifier si la cellule est suffisamment remplie (arrêt à 80%)
                if analysis["my_cell"]["density"] >= 0.8:
                    print(f"\n🎯 Cellule suffisamment remplie ({analysis['my_cell']['density']:.1%}) - Arrêt du bot")
                    print("🎨 Merci d'avoir participé à cette création collaborative !")
                    break
                
                # Créer le prompt pour Claude
                prompt = self.create_prompt_for_claude(analysis)
                
                print("\n" + "="*60)
                print("📝 PROMPT POUR CLAUDE:")
                print("="*60)
                print(prompt)
                print("\n" + "="*60)
                print("⏳ EN ATTENTE DE LA RÉPONSE DE CLAUDE...")
                print("="*60)
                
                # Réponse de Claude basée sur l'analyse
                other_users = analysis["other_users"]
                global_env = analysis["global_environment"]
                
                # Analyser les couleurs dominantes des autres utilisateurs
                other_colors = []
                for user in other_users:
                    other_colors.extend(user['colors'])
                
                # Choisir des couleurs en fonction de l'environnement
                if other_colors:
                    dominant_color = max(set(other_colors), key=other_colors.count) if other_colors else "#FF6B6B"
                    complementary_colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#53a7c2", "#FFEAA7", "#96CEB4", "#DDA0DD"]
                    available_colors = [c for c in complementary_colors if c != dominant_color][:4]
                    strategy_desc = f"Créer un dialogue chromatique avec les autres utilisateurs (couleur dominante: {dominant_color})"
                else:
                    available_colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#53a7c2"]
                    strategy_desc = "Créer un motif initial collaboratif qui dialogue avec l'environnement"
                
                if analysis["my_cell"]["pixel_count"] == 0:
                    pixels_json = ',\n        '.join([
                        f'{{"x": {5 + i}, "y": {5 + i}, "color": "{available_colors[i % len(available_colors)]}", "reason": "Point focal initial"}}'
                        for i in range(15)
                    ])
                else:
                    base_x = (self.iteration * 3) % 15
                    base_y = (self.iteration * 2) % 15
                    pixels_json = ',\n        '.join([
                        f'{{"x": {base_x + i}, "y": {base_y + i}, "color": "{available_colors[i % len(available_colors)]}", "reason": "Extension du motif"}}'
                        for i in range(15)
                    ])
                
                claude_response = f"""
{{
    "strategy": "{strategy_desc}",
    "pixels": [
        {pixels_json}
    ]
}}
"""
                
                print(f"\n🤖 RÉPONSE DE CLAUDE:")
                print(claude_response)
                
                # Parser et exécuter
                pixels = self.parse_claude_response(claude_response)
                
                if pixels:
                    print(f"\n✏️  Exécution des instructions de Claude...")
                    await self.draw_multiple(pixels)
                    print(f"✅ {len(pixels)} pixels dessinés avec succès!")
                    print("🎨 Résultat visible sur http://localhost:3001")
                    self.drawing_history.extend(pixels)
                    
                    # Mettre à jour l'état local manuellement
                    for x, y, color in pixels:
                        coords = f"{x},{y}"
                        self.my_cell_state[coords] = color
                else:
                    print("⏸️  Aucun pixel valide à dessiner")
                
                print(f"\n📊 Historique: {len(self.drawing_history)} pixels dessinés au total")
                
                # Attendre avant la prochaine itération
                await asyncio.sleep(self.interval)
                
        except KeyboardInterrupt:
            print("\n👋 Bot arrêté par l'utilisateur.")
        except Exception as e:
            logger.error(f"❌ Erreur critique: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if self.websocket:
                await self.websocket.close()
            print("🔌 Connexion fermée")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bot Final pour Poietic Generator.")
    parser.add_argument("--poietic_url", type=str, default="ws://localhost:3001/updates",
                        help="URL WebSocket Poietic Generator.")
    parser.add_argument("--interval", type=int, default=5,
                        help="Intervalle en secondes entre chaque analyse.")
    args = parser.parse_args()

    bot = FinalBot(poietic_url=args.poietic_url, interval=args.interval)
    asyncio.run(bot.run())
