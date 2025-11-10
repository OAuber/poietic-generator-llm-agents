#!/usr/bin/env python3
"""
Bot ultra-simple pour identifier le point de plantage
"""

import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger('SimpleBot')

class SimpleBot:
    def __init__(self):
        self.websocket = None
        self.user_id = None
        self.my_cell_state = {}
        self.iteration = 0

    async def connect(self):
        """Connexion WebSocket."""
        try:
            print("🔌 Connexion...")
            self.websocket = await websockets.connect('ws://localhost:3001/updates')
            print("✅ Connecté!")
            return True
        except Exception as e:
            print(f"❌ Erreur connexion: {e}")
            return False

    async def send_message(self, message):
        """Envoie un message."""
        if self.websocket:
            await self.websocket.send(json.dumps(message))

    async def draw_pixel(self, x, y, color):
        """Dessine un pixel."""
        print(f"  ✏️ Dessin pixel ({x},{y}) = {color}")
        message = {
            "type": "cell_update",
            "sub_x": x,
            "sub_y": y,
            "color": color
        }
        await self.send_message(message)
        coords = f"{x},{y}"
        self.my_cell_state[coords] = color

    async def handle_message(self, message):
        """Traite un message."""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "initial_state":
                self.user_id = data.get("my_user_id")
                print(f"🎨 Mon user_id: {self.user_id}")
                
            elif message_type == "cell_update":
                user_id = data.get("user_id")
                if user_id == self.user_id:
                    sub_x = data.get("sub_x")
                    sub_y = data.get("sub_y")
                    color = data.get("color")
                    coords = f"{sub_x},{sub_y}"
                    self.my_cell_state[coords] = color
                    print(f"  📝 Mon pixel: ({sub_x},{sub_y}) = {color}")
                    
        except Exception as e:
            print(f"❌ Erreur message: {e}")

    async def run(self):
        """Boucle principale simplifiée."""
        print("🚀 Démarrage...")
        
        if not await self.connect():
            return
            
        try:
            print("⏳ Attente messages initiaux...")
            await asyncio.sleep(2)
            
            # Écouter les messages
            async def listen():
                try:
                    async for message in self.websocket:
                        await self.handle_message(message)
                except Exception as e:
                    print(f"❌ Erreur écoute: {e}")
            
            # Démarrer l'écoute
            listen_task = asyncio.create_task(listen())
            print("👂 Écoute démarrée")
            
            # Attendre un peu
            await asyncio.sleep(1)
            
            # Faire quelques dessins simples
            for i in range(3):
                print(f"\n🎨 Dessin {i+1}/3")
                try:
                    await self.draw_pixel(5 + i, 5 + i, "#FF6B6B")
                    await asyncio.sleep(1)
                    print(f"✅ Dessin {i+1} terminé")
                except Exception as e:
                    print(f"❌ Erreur dessin {i+1}: {e}")
                    break
            
            print("\n🎯 Test terminé avec succès!")
            
            # Attendre un peu avant de fermer
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f"❌ Erreur critique: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("🔌 Fermeture...")
            if self.websocket:
                await self.websocket.close()
            print("✅ Fermé")

if __name__ == "__main__":
    bot = SimpleBot()
    asyncio.run(bot.run())
