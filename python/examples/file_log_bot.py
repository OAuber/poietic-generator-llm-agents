#!/usr/bin/env python3
"""
Bot qui écrit ses logs dans un fichier pour debug
"""

import asyncio
import websockets
import json
import logging
import time
import sys

# Configuration du logging vers un fichier
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/bot_debug.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('FileLogBot')

class FileLogBot:
    def __init__(self):
        self.websocket = None
        self.user_id = None
        self.my_cell_state = {}
        self.iteration = 0

    def log(self, message):
        """Log avec timestamp."""
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] {message}")
        logger.info(message)

    async def connect(self):
        """Connexion WebSocket."""
        try:
            self.log("🔌 Tentative de connexion...")
            self.websocket = await websockets.connect('ws://localhost:3001/updates')
            self.log("✅ Connexion réussie!")
            return True
        except Exception as e:
            self.log(f"❌ Erreur connexion: {e}")
            return False

    async def send_message(self, message):
        """Envoie un message."""
        if self.websocket:
            await self.websocket.send(json.dumps(message))

    async def draw_pixel(self, x, y, color):
        """Dessine un pixel."""
        self.log(f"  ✏️ Dessin pixel ({x},{y}) = {color}")
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
                self.log(f"🎨 Mon user_id: {self.user_id}")
                
            elif message_type == "cell_update":
                user_id = data.get("user_id")
                if user_id == self.user_id:
                    sub_x = data.get("sub_x")
                    sub_y = data.get("sub_y")
                    color = data.get("color")
                    coords = f"{sub_x},{sub_y}"
                    self.my_cell_state[coords] = color
                    self.log(f"  📝 Mon pixel: ({sub_x},{sub_y}) = {color}")
                    
        except Exception as e:
            self.log(f"❌ Erreur message: {e}")

    async def run(self):
        """Boucle principale."""
        self.log("🚀 Démarrage du bot...")
        
        if not await self.connect():
            self.log("❌ Impossible de se connecter")
            return
            
        try:
            self.log("⏳ Attente messages initiaux...")
            await asyncio.sleep(2)
            
            # Écouter les messages
            async def listen():
                try:
                    async for message in self.websocket:
                        await self.handle_message(message)
                except Exception as e:
                    self.log(f"❌ Erreur écoute: {e}")
            
            # Démarrer l'écoute
            listen_task = asyncio.create_task(listen())
            self.log("👂 Écoute démarrée")
            
            # Attendre un peu
            await asyncio.sleep(1)
            
            # Faire quelques dessins
            for i in range(3):
                self.log(f"\n🎨 Dessin {i+1}/3")
                try:
                    await self.draw_pixel(5 + i, 5 + i, "#FF6B6B")
                    await asyncio.sleep(1)
                    self.log(f"✅ Dessin {i+1} terminé")
                except Exception as e:
                    self.log(f"❌ Erreur dessin {i+1}: {e}")
                    break
            
            self.log("\n🎯 Test terminé!")
            await asyncio.sleep(2)
            
        except Exception as e:
            self.log(f"❌ Erreur critique: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.log("🔌 Fermeture...")
            if self.websocket:
                await self.websocket.close()
            self.log("✅ Fermé")

if __name__ == "__main__":
    bot = FileLogBot()
    asyncio.run(bot.run())
