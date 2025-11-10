#!/usr/bin/env python3
"""
Test de connexion WebSocket ultra-basique
"""

import asyncio
import websockets
import json

async def test_connection():
    print("🔌 Test de connexion WebSocket...")
    
    try:
        # Test de connexion simple
        print("1. Tentative de connexion...")
        async with websockets.connect('ws://localhost:3001/updates') as websocket:
            print("✅ Connexion réussie!")
            
            # Attendre un message
            print("2. Attente d'un message...")
            message = await asyncio.wait_for(websocket.recv(), timeout=10)
            print(f"✅ Message reçu: {message[:100]}...")
            
            # Envoyer un message de test
            print("3. Envoi d'un message de test...")
            test_message = {"type": "heartbeat"}
            await websocket.send(json.dumps(test_message))
            print("✅ Message envoyé!")
            
            # Attendre une réponse
            print("4. Attente d'une réponse...")
            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            print(f"✅ Réponse reçue: {response}")
            
            print("🎉 Test réussi!")
            
    except asyncio.TimeoutError:
        print("⏰ Timeout - pas de réponse du serveur")
    except ConnectionRefusedError:
        print("❌ Connexion refusée - serveur non disponible")
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_connection())
