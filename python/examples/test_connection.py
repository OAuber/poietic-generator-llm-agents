#!/usr/bin/env python3
"""
Script de test pour vérifier la connexion à l'API REST.
"""

import requests
import json

def test_api_connection():
    """Teste la connexion à l'API REST."""
    api_url = "http://localhost:8000"
    
    print("🔍 Test de connexion à l'API REST...")
    
    try:
        # Test 1: Lister les sessions existantes
        print("\n1️⃣ Test: Lister les sessions")
        response = requests.get(f"{api_url}/sessions")
        response.raise_for_status()
        sessions = response.json()
        print(f"✅ Sessions trouvées: {len(sessions)}")
        for session in sessions:
            print(f"   - {session['session_id'][:8]}... : {session['name']}")
        
        # Test 2: Créer une nouvelle session
        print("\n2️⃣ Test: Créer une nouvelle session")
        response = requests.post(f"{api_url}/sessions", json={
            'poietic_url': 'ws://localhost:3001/updates',
            'name': 'Test-Connection'
        })
        response.raise_for_status()
        session_data = response.json()
        print(f"✅ Session créée: {session_data['session_id']}")
        print(f"✅ Poietic user ID: {session_data['poietic_user_id']}")
        
        session_id = session_data['session_id']
        
        # Test 3: Récupérer les infos de la session
        print("\n3️⃣ Test: Récupérer les infos de la session")
        response = requests.get(f"{api_url}/sessions/{session_id}")
        response.raise_for_status()
        session_info = response.json()
        print(f"✅ Infos session: {session_info}")
        
        # Test 4: Récupérer l'état de la cellule
        print("\n4️⃣ Test: Récupérer l'état de la cellule")
        response = requests.get(f"{api_url}/sessions/{session_id}/cell")
        response.raise_for_status()
        cell_data = response.json()
        print(f"✅ Cellule: {cell_data['pixel_count']} pixels")
        
        # Test 5: Dessiner un pixel
        print("\n5️⃣ Test: Dessiner un pixel")
        response = requests.post(f"{api_url}/sessions/{session_id}/draw", json={
            "sub_x": 10,
            "sub_y": 10,
            "color": "#FF6B6B"
        })
        response.raise_for_status()
        print("✅ Pixel dessiné avec succès!")
        
        # Test 6: Dessiner plusieurs pixels
        print("\n6️⃣ Test: Dessiner plusieurs pixels")
        response = requests.post(f"{api_url}/sessions/{session_id}/draw/multiple", json={
            "pixels": [
                {"sub_x": 5, "sub_y": 5, "color": "#4ECDC4"},
                {"sub_x": 6, "sub_y": 5, "color": "#45B7D1"},
                {"sub_x": 5, "sub_y": 6, "color": "#96CEB4"}
            ]
        })
        response.raise_for_status()
        print("✅ Pixels multiples dessinés avec succès!")
        
        # Test 7: Récupérer les utilisateurs
        print("\n7️⃣ Test: Récupérer les utilisateurs")
        response = requests.get(f"{api_url}/sessions/{session_id}/users")
        response.raise_for_status()
        users_data = response.json()
        print(f"✅ Utilisateurs: {users_data}")
        
        print("\n🎉 Tous les tests ont réussi!")
        print("🎨 Vérifiez le résultat sur http://localhost:3001")
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        if 'response' in locals():
            print(f"📋 Réponse: {response.text}")

if __name__ == "__main__":
    test_api_connection()
