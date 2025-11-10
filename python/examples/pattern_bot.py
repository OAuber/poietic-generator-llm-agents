#!/usr/bin/env python3
"""
Pattern Bot - Bot qui dessine des motifs géométriques
=====================================================

Ce bot dessine différents motifs géométriques dans sa cellule.
"""

import asyncio
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from poietic_client import PoieticClient


class PatternBot:
    """Bot qui dessine des motifs géométriques."""
    
    def __init__(self, client: PoieticClient):
        self.client = client
        
    async def draw_grid(self, color: str = "#808080"):
        """Dessine une grille."""
        print("📐 Dessin d'une grille...")
        for i in range(0, 20, 4):
            for j in range(20):
                await self.client.draw(i, j, color)
                await self.client.draw(j, i, color)
                await asyncio.sleep(0.01)
                
    async def draw_diagonal(self, color: str = "#FF0000"):
        """Dessine une diagonale."""
        print("📐 Dessin d'une diagonale...")
        for i in range(20):
            await self.client.draw(i, i, color)
            await asyncio.sleep(0.05)
            
    async def draw_circle(self, cx: int = 10, cy: int = 10, radius: int = 8, color: str = "#00FF00"):
        """Dessine un cercle."""
        print("⭕ Dessin d'un cercle...")
        for angle in range(0, 360, 5):
            rad = math.radians(angle)
            x = int(cx + radius * math.cos(rad))
            y = int(cy + radius * math.sin(rad))
            if 0 <= x < 20 and 0 <= y < 20:
                await self.client.draw(x, y, color)
                await asyncio.sleep(0.02)
                
    async def draw_spiral(self, color: str = "#0000FF"):
        """Dessine une spirale."""
        print("🌀 Dessin d'une spirale...")
        cx, cy = 10, 10
        max_radius = 9
        
        for t in range(0, 360 * 3, 5):
            rad = math.radians(t)
            radius = (t / (360 * 3)) * max_radius
            x = int(cx + radius * math.cos(rad))
            y = int(cy + radius * math.sin(rad))
            if 0 <= x < 20 and 0 <= y < 20:
                await self.client.draw(x, y, color)
                await asyncio.sleep(0.01)
                
    async def draw_gradient(self):
        """Dessine un dégradé horizontal."""
        print("🎨 Dessin d'un dégradé...")
        for x in range(20):
            intensity = int((x / 19) * 255)
            color = f"#{intensity:02X}{intensity:02X}{intensity:02X}"
            for y in range(20):
                await self.client.draw(x, y, color)
                await asyncio.sleep(0.005)
                
    async def draw_rainbow_gradient(self):
        """Dessine un dégradé arc-en-ciel vertical."""
        print("🌈 Dessin d'un arc-en-ciel...")
        for y in range(20):
            # Calcul HSL vers RGB simplifié
            hue = (y / 20) * 360
            r, g, b = self._hsl_to_rgb(hue, 1.0, 0.5)
            color = f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"
            for x in range(20):
                await self.client.draw(x, y, color)
                await asyncio.sleep(0.005)
                
    def _hsl_to_rgb(self, h: float, s: float, l: float) -> tuple:
        """Convertit HSL en RGB."""
        h = h / 360
        c = (1 - abs(2 * l - 1)) * s
        x = c * (1 - abs((h * 6) % 2 - 1))
        m = l - c / 2
        
        if h < 1/6:
            r, g, b = c, x, 0
        elif h < 2/6:
            r, g, b = x, c, 0
        elif h < 3/6:
            r, g, b = 0, c, x
        elif h < 4/6:
            r, g, b = 0, x, c
        elif h < 5/6:
            r, g, b = x, 0, c
        else:
            r, g, b = c, 0, x
            
        return r + m, g + m, b + m
        
    async def draw_checkerboard(self):
        """Dessine un damier."""
        print("♟️  Dessin d'un damier...")
        for y in range(20):
            for x in range(20):
                if (x + y) % 2 == 0:
                    color = "#FFFFFF"
                else:
                    color = "#000000"
                await self.client.draw(x, y, color)
                await asyncio.sleep(0.01)
                
    async def run_demo(self):
        """Exécute une démonstration de tous les motifs."""
        patterns = [
            self.draw_grid,
            self.draw_diagonal,
            self.draw_circle,
            self.draw_spiral,
            self.draw_gradient,
            self.draw_rainbow_gradient,
            self.draw_checkerboard,
        ]
        
        for pattern in patterns:
            await pattern()
            print("⏸️  Pause de 3 secondes...")
            await asyncio.sleep(3)


async def main(url: str = "ws://localhost:3001/updates"):
    """Fonction principale."""
    
    def on_initial_state(client, message):
        print(f"🎨 Pattern Bot connecté: {client.my_user_id}")
        print(f"📐 Grille: {client.grid_size}x{client.grid_size}")
        print()
        
    # Créer et connecter le client
    client = PoieticClient(url=url, on_initial_state=on_initial_state)
    await client.connect()
    
    # Attendre l'état initial
    await asyncio.sleep(1)
    
    # Créer le bot et lancer la démo
    bot = PatternBot(client)
    
    try:
        await bot.run_demo()
        print("\n✅ Démonstration terminée!")
        print("🔄 Maintien de la connexion. Appuyez sur Ctrl+C pour quitter.")
        await client.run_forever()
        
    except KeyboardInterrupt:
        print("\n🛑 Arrêt du bot...")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bot qui dessine des motifs géométriques")
    parser.add_argument(
        "--url", 
        default="ws://localhost:3001/updates",
        help="URL du serveur WebSocket"
    )
    
    args = parser.parse_args()
    
    print("🎨 Démarrage du Pattern Bot...")
    print(f"🔗 Connexion à: {args.url}")
    print()
    
    asyncio.run(main(args.url))


