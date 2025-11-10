#!/usr/bin/env python3
"""
Bot de debug simplifié pour identifier les problèmes
"""

import asyncio
import websockets
import json
import logging
import time

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger('DebugBot')

class DebugBot:
    def __init__(self, poietic_url="ws://localhost:3001/updates"):
        self.poietic_url = poietic_url
        self.websocket = None
        self.user_id = None
        self.my_cell_state = {}
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

    async def draw_pixel(self, x, y, color):
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
        print(f"  ✏️ Pixel ({x},{y}) = {color}")

    async def handle_message(self, message):
        """Traite les messages reçus."""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "initial_state":
                self.user_id = data.get("my_user_id")
                print(f"🎨 Mon user_id: {self.user_id}")
                
            elif message_type == "cell_update":
                user_id = data.get("user_id")
                sub_x = data.get("sub_x")
                sub_y = data.get("sub_y")
                color = data.get("color")
                
                if user_id == self.user_id:
                    coords = f"{sub_x},{sub_y}"
                    self.my_cell_state[coords] = color
                    print(f"  📝 Mon pixel: ({sub_x},{sub_y}) = {color}")
                else:
                    print(f"  👤 Autre utilisateur: {user_id[:8]}... à ({sub_x},{sub_y})")
                    
        except Exception as e:
            print(f"❌ Erreur message: {e}")

    async def run(self):
        """Boucle principale."""
        print("🚀 Démarrage du bot de debug...")
        
        if not await self.connect():
            print("❌ Impossible de se connecter, arrêt du bot")
            return
            
        try:
            print("⏳ Attente des messages initiaux...")
            
            # Écouter les messages en arrière-plan
            async def listen_messages():
                try:
                    async for message in self.websocket:
                        await self.handle_message(message)
                except Exception as e:
                    print(f"❌ Erreur écoute messages: {e}")
            
            # Démarrer l'écoute des messages
            listen_task = asyncio.create_task(listen_messages())
            
            # Attendre un peu pour recevoir les messages initiaux
            await asyncio.sleep(3)
            
            # Boucle principale
            while self.running and self.iteration < 5:  # Limite à 5 itérations pour le debug
                self.iteration += 1
                print(f"\n🤔 ITÉRATION {self.iteration}")
                
                # Analyser l'état actuel
                pixel_count = len(self.my_cell_state)
                print(f"📊 Ma cellule: {pixel_count} pixels")
                
                # Dessiner quelques pixels simples
                print("🎨 Dessin de pixels...")
                for i in range(3):
                    x = (self.iteration * 2 + i) % 20
                    y = (self.iteration * 3 + i) % 20
                    color = ["#FF6B6B", "#4ECDC4", "#45B7D1"][i]
                    await self.draw_pixel(x, y, color)
                    await asyncio.sleep(0.5)
                
                print(f"✅ Itération {self.iteration} terminée")
                await asyncio.sleep(3)
                
        except KeyboardInterrupt:
            print("\n👋 Arrêt demandé")
        except Exception as e:
            print(f"❌ Erreur critique: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if self.websocket:
                await self.websocket.close()
            print("🔌 Connexion fermée")

if __name__ == "__main__":
    bot = DebugBot()
    asyncio.run(bot.run())
