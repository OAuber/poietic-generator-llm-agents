#!/usr/bin/env python3
"""
Random Bot - Bot simple qui dessine des pixels aléatoires
=========================================================

Ce bot se connecte à Poietic Generator et dessine continuellement
des pixels de couleurs aléatoires à des positions aléatoires.
"""

import asyncio
import random
import sys
import os

# Ajouter le répertoire parent au path pour importer poietic_client
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from poietic_client import PoieticClient


def random_color() -> str:
    """Génère une couleur aléatoire au format hexadécimal."""
    r = random.randint(0, 255)
    g = random.randint(0, 255)
    b = random.randint(0, 255)
    return f"#{r:02X}{g:02X}{b:02X}"


async def random_bot(url: str = "ws://localhost:3001/updates", interval: float = 0.5):
    """
    Bot qui dessine des pixels aléatoires.
    
    Args:
        url: URL du serveur WebSocket
        interval: Intervalle en secondes entre chaque dessin
    """
    
    def on_initial_state(client, message):
        print(f"🤖 Bot connecté: {client.my_user_id}")
        print(f"📐 Grille: {client.grid_size}x{client.grid_size}")
        print(f"👥 {len(client.user_positions)} utilisateur(s) connecté(s)")
        print(f"🎨 Démarrage du dessin aléatoire...")
        
    # Créer et connecter le client
    client = PoieticClient(url=url, on_initial_state=on_initial_state)
    await client.connect()
    
    # Attendre l'état initial
    await asyncio.sleep(1)
    
    try:
        # Boucle de dessin
        draw_count = 0
        while client.is_connected:
            x = random.randint(0, 19)
            y = random.randint(0, 19)
            color = random_color()
            
            await client.draw(x, y, color)
            draw_count += 1
            
            if draw_count % 10 == 0:
                print(f"✏️  {draw_count} pixels dessinés")
                
            await asyncio.sleep(interval)
            
    except KeyboardInterrupt:
        print("\n🛑 Arrêt du bot...")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bot Poietic qui dessine aléatoirement")
    parser.add_argument(
        "--url", 
        default="ws://localhost:3001/updates",
        help="URL du serveur WebSocket"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.5,
        help="Intervalle entre les dessins (secondes)"
    )
    
    args = parser.parse_args()
    
    print("🤖 Démarrage du Random Bot...")
    print(f"🔗 Connexion à: {args.url}")
    print(f"⏱️  Intervalle: {args.interval}s")
    print()
    
    asyncio.run(random_bot(args.url, args.interval))


