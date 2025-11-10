#!/usr/bin/env python3
"""
Claude AI Bot Verbose - Version avec affichage détaillé des pensées
================================================================

Version du bot Claude qui affiche toutes ses pensées et décisions
en temps réel pour observer son processus de réflexion.
"""

import requests
import json
import time
import random
import math
from typing import Dict, List, Tuple, Optional

class ClaudeAIBotVerbose:
    """Bot IA avec affichage détaillé de ses pensées."""
    
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url
        self.session_id = None
        self.iteration = 0
        self.artistic_style = "collaborative_abstract"
        self.color_palette = [
            "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
            "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
        ]
        self.drawing_history = []
        
    def connect(self) -> bool:
        """Se connecte au serveur Poietic via l'API REST."""
        print("🔗 Connexion à l'API REST...")
        try:
            response = requests.post(f"{self.api_url}/sessions", json={
                "poietic_url": "ws://localhost:3001/updates",
                "name": "Claude-AI-Bot-Verbose"
            })
            response.raise_for_status()
            data = response.json()
            self.session_id = data["session_id"]
            print(f"✅ Claude AI Bot connecté: {self.session_id}")
            return True
        except Exception as e:
            print(f"❌ Erreur de connexion: {e}")
            return False
            
    def get_my_cell(self) -> Dict:
        """Récupère l'état de ma cellule."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/cell")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Erreur récupération cellule: {e}")
            return {"pixels": {}, "pixel_count": 0}
            
    def get_session_info(self) -> Dict:
        """Récupère les informations de la session."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Erreur infos session: {e}")
            return {}
            
    def get_all_users(self) -> List[Dict]:
        """Récupère la liste de tous les utilisateurs connectés."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/users")
            response.raise_for_status()
            return response.json().get("users", [])
        except Exception as e:
            print(f"❌ Erreur récupération utilisateurs: {e}")
            return []
            
    def get_user_cell(self, user_id: str) -> Dict:
        """Récupère l'état de la cellule d'un autre utilisateur."""
        try:
            response = requests.get(f"{self.api_url}/sessions/{self.session_id}/users/{user_id}/cell")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Erreur récupération cellule utilisateur {user_id}: {e}")
            return {"pixels": {}, "pixel_count": 0}
            
    def draw_pixel(self, x: int, y: int, color: str) -> bool:
        """Dessine un pixel."""
        try:
            response = requests.post(f"{self.api_url}/sessions/{self.session_id}/draw", json={
                "x": x, "y": y, "color": color
            })
            response.raise_for_status()
            self.drawing_history.append((x, y, color))
            return True
        except Exception as e:
            print(f"❌ Erreur dessin: {e}")
            return False
            
    def draw_multiple(self, pixels: List[Tuple[int, int, str]]) -> bool:
        """Dessine plusieurs pixels."""
        try:
            response = requests.post(f"{self.api_url}/sessions/{self.session_id}/draw/multiple", json={
                "pixels": pixels
            })
            response.raise_for_status()
            self.drawing_history.extend(pixels)
            return True
        except Exception as e:
            print(f"❌ Erreur dessin multiple: {e}")
            return False
            
    def analyze_global_environment(self) -> Dict:
        """Analyse l'environnement global (tous les utilisateurs)."""
        print("🌍 Analyse de l'environnement global...")
        
        users = self.get_all_users()
        session_info = self.get_session_info()
        my_user_id = session_info.get("poietic_user_id")
        
        print(f"   👥 {len(users)} utilisateur(s) connecté(s)")
        
        global_analysis = {
            "total_users": len(users),
            "other_users": [],
            "global_colors": {},
            "global_activity": 0,
            "collaborative_opportunities": []
        }
        
        for user in users:
            user_id = user["user_id"]
            is_me = user_id == my_user_id
            position = user.get("position", [0, 0])
            
            if not is_me:
                print(f"   👤 Analyse de l'utilisateur {user_id[:8]}... à la position {position}")
                
                # Récupérer la cellule de cet utilisateur
                user_cell = self.get_user_cell(user_id)
                user_pixels = user_cell.get("pixels", {})
                user_pixel_count = user_cell.get("pixel_count", 0)
                
                print(f"      📊 {user_pixel_count} pixels dessinés")
                
                # Analyser les couleurs de cet utilisateur
                user_colors = {}
                for coords, color in user_pixels.items():
                    user_colors[color] = user_colors.get(color, 0) + 1
                    global_analysis["global_colors"][color] = global_analysis["global_colors"].get(color, 0) + 1
                
                if user_colors:
                    top_color = max(user_colors.items(), key=lambda x: x[1])
                    print(f"      🎨 Couleur dominante: {top_color[0]} ({top_color[1]} pixels)")
                    
                    # Identifier les opportunités collaboratives
                    if user_pixel_count > 50:  # Utilisateur actif
                        global_analysis["collaborative_opportunities"].append({
                            "user_id": user_id,
                            "style": "active",
                            "dominant_color": top_color[0],
                            "pixel_count": user_pixel_count
                        })
                        print(f"      🤝 Opportunité collaborative détectée!")
                
                global_analysis["other_users"].append({
                    "user_id": user_id,
                    "position": position,
                    "pixel_count": user_pixel_count,
                    "colors": user_colors
                })
                
                global_analysis["global_activity"] += user_pixel_count
        
        print(f"   🌈 {len(global_analysis['global_colors'])} couleurs globales")
        print(f"   🎯 {len(global_analysis['collaborative_opportunities'])} opportunités collaboratives")
        
        return global_analysis

    def analyze_cell_state(self, cell: Dict) -> Dict:
        """Analyse l'état de la cellule pour prendre des décisions créatives."""
        print("🔍 Analyse de l'état de ma cellule...")
        
        pixels = cell.get("pixels", {})
        pixel_count = cell.get("pixel_count", 0)
        
        print(f"   📊 {pixel_count} pixels dessinés sur 400 possibles")
        
        # Analyser les couleurs utilisées
        colors = {}
        for coords, color in pixels.items():
            colors[color] = colors.get(color, 0) + 1
            
        print(f"   🎨 {len(colors)} couleurs différentes utilisées")
        if colors:
            sorted_colors = sorted(colors.items(), key=lambda x: x[1], reverse=True)
            print("   🏆 Top 3 couleurs:")
            for i, (color, count) in enumerate(sorted_colors[:3]):
                print(f"      {i+1}. {color}: {count} pixels")
        
        # Analyser la densité
        density = pixel_count / 400  # 20x20 = 400 pixels max
        print(f"   📈 Densité: {density:.1%}")
        
        # Analyser les patterns spatiaux
        filled_positions = []
        for coords in pixels.keys():
            x, y = map(int, coords.split(','))
            filled_positions.append((x, y))
            
        # Analyser la distribution spatiale
        if filled_positions:
            xs = [pos[0] for pos in filled_positions]
            ys = [pos[1] for pos in filled_positions]
            center_x = sum(xs) / len(xs)
            center_y = sum(ys) / len(ys)
            print(f"   📍 Centre de gravité: ({center_x:.1f}, {center_y:.1f})")
            
            # Analyser la dispersion
            spread_x = max(xs) - min(xs) if xs else 0
            spread_y = max(ys) - min(ys) if ys else 0
            print(f"   📏 Dispersion: {spread_x}x{spread_y}")
        
        analysis = {
            "pixel_count": pixel_count,
            "density": density,
            "colors": colors,
            "color_count": len(colors),
            "filled_positions": filled_positions,
            "is_empty": pixel_count == 0,
            "is_sparse": density < 0.1,
            "is_dense": density > 0.5
        }
        
        print(f"   🧠 Évaluation: {'Vide' if analysis['is_empty'] else 'Épars' if analysis['is_sparse'] else 'Dense' if analysis['is_dense'] else 'Modéré'}")
        
        return analysis
        
    def choose_artistic_strategy(self, analysis: Dict, global_analysis: Dict) -> str:
        """Choisit une stratégie artistique basée sur l'analyse locale et globale."""
        print("🎯 Choix de la stratégie artistique...")
        
        # Prendre en compte l'environnement global
        has_collaborative_opportunities = len(global_analysis.get("collaborative_opportunities", [])) > 0
        global_activity = global_analysis.get("global_activity", 0)
        other_users_count = global_analysis.get("total_users", 1) - 1  # -1 pour exclure moi-même
        
        print(f"   🌍 Contexte global: {other_users_count} autres utilisateurs, {global_activity} pixels globaux")
        
        if analysis["is_empty"]:
            if has_collaborative_opportunities:
                strategy = "collaborative_initial"
                print("   💡 Stratégie: Composition initiale collaborative")
                print("   🤝 Je vais créer un motif qui s'harmonise avec les autres créations")
            else:
                strategy = "initial_composition"
                print("   💡 Stratégie: Composition initiale harmonieuse")
                print("   🎨 Je vais créer un motif central avec des cercles concentriques")
        elif analysis["is_sparse"]:
            if has_collaborative_opportunities:
                strategy = "collaborative_fill"
                print("   💡 Stratégie: Remplissage collaboratif")
                print("   🤝 Je vais compléter et connecter en m'inspirant des autres")
            else:
                strategy = "fill_and_connect"
                print("   💡 Stratégie: Remplissage et connexion")
                print("   🔗 Je vais connecter les éléments existants et remplir les vides")
        elif analysis["is_dense"]:
            if global_activity > 200:  # Environnement très actif
                strategy = "collaborative_refine"
                print("   💡 Stratégie: Raffinement collaboratif")
                print("   🤝 Je vais ajouter des détails qui dialoguent avec les autres")
            else:
                strategy = "refine_and_detail"
                print("   💡 Stratégie: Raffinement et détails")
                print("   ✨ Je vais ajouter des accents et des détails fins")
        elif analysis["color_count"] < 3:
            if has_collaborative_opportunities:
                strategy = "collaborative_color_variety"
                print("   💡 Stratégie: Variété chromatique collaborative")
                print("   🌈 Je vais introduire des couleurs qui complètent les autres")
            else:
                strategy = "add_color_variety"
                print("   💡 Stratégie: Ajout de variété chromatique")
                print("   🌈 Je vais introduire de nouvelles couleurs harmonieuses")
        else:
            strategy = "collaborative_response"
            print("   💡 Stratégie: Réponse collaborative")
            print("   🤝 Je vais réagir de manière harmonieuse aux créations existantes")
            
        return strategy
        
    def generate_initial_composition(self) -> List[Tuple[int, int, str]]:
        """Crée une composition initiale harmonieuse."""
        print("🎨 Création d'une composition initiale harmonieuse...")
        
        pixels = []
        base_color = random.choice(self.color_palette)
        print(f"   🎨 Couleur de base choisie: {base_color}")
        
        # Créer un motif central avec des cercles concentriques
        center_x, center_y = 10, 10
        print(f"   📍 Centre du motif: ({center_x}, {center_y})")
        
        for radius in [3, 6, 9]:
            print(f"   ⭕ Dessin du cercle de rayon {radius}...")
            for angle in range(0, 360, 15):
                rad = math.radians(angle)
                x = int(center_x + radius * math.cos(rad))
                y = int(center_y + radius * math.sin(rad))
                if 0 <= x < 20 and 0 <= y < 20:
                    # Variation de couleur basée sur la distance
                    color_intensity = int(255 * (1 - radius/10))
                    color = self._adjust_color_intensity(base_color, color_intensity)
                    pixels.append((x, y, color))
                    
        print(f"   ✅ {len(pixels)} pixels générés pour la composition initiale")
        return pixels[:15]  # Limiter à 15 pixels par itération
        
    def generate_fill_and_connect(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Remplit les espaces vides et connecte les éléments existants."""
        print("🔗 Remplissage et connexion des éléments...")
        
        pixels = []
        filled = set(analysis["filled_positions"])
        print(f"   📍 {len(filled)} positions déjà occupées")
        
        # Trouver des positions vides près des éléments existants
        connections_made = 0
        for x, y in analysis["filled_positions"]:
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    nx, ny = x + dx, y + dy
                    if (0 <= nx < 20 and 0 <= ny < 20 and 
                        (nx, ny) not in filled and 
                        random.random() < 0.3):
                        color = random.choice(self.color_palette)
                        pixels.append((nx, ny, color))
                        connections_made += 1
                        
        print(f"   🔗 {connections_made} connexions créées")
        return pixels[:10]
        
    def generate_refine_and_detail(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Ajoute des détails et raffine la composition."""
        print("✨ Ajout de détails et raffinement...")
        
        pixels = []
        
        # Ajouter des accents colorés
        accent_count = 5
        print(f"   ✨ Ajout de {accent_count} accents colorés...")
        for i in range(accent_count):
            x, y = random.randint(0, 19), random.randint(0, 19)
            color = random.choice(self.color_palette)
            pixels.append((x, y, color))
            print(f"      Accent {i+1}: ({x}, {y}) = {color}")
            
        return pixels
        
    def generate_color_variety(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Ajoute de la variété chromatique."""
        print("🌈 Ajout de variété chromatique...")
        
        pixels = []
        existing_colors = set(analysis["colors"].keys())
        new_colors = [c for c in self.color_palette if c not in existing_colors]
        
        if not new_colors:
            new_colors = self.color_palette
            print("   🎨 Toutes les couleurs de ma palette sont déjà utilisées, j'en réutilise")
        else:
            print(f"   🆕 {len(new_colors)} nouvelles couleurs disponibles")
            
        for i in range(8):
            x, y = random.randint(0, 19), random.randint(0, 19)
            color = random.choice(new_colors)
            pixels.append((x, y, color))
            print(f"      Pixel {i+1}: ({x}, {y}) = {color}")
            
        return pixels
        
    def generate_collaborative_response(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Répond de manière collaborative aux autres utilisateurs."""
        print("🤝 Réponse collaborative aux autres créations...")
        
        pixels = []
        
        # Créer des motifs qui complètent ou contrastent
        if analysis["color_count"] > 3:
            print("   🎨 Mode harmonieux - utilisation de couleurs complémentaires")
            base_colors = list(analysis["colors"].keys())[:3]
            print(f"   🎯 Couleurs de base: {base_colors}")
            for i, color in enumerate(base_colors):
                complementary = self._get_complementary_color(color)
                print(f"      Couleur {i+1}: {color} → complémentaire {complementary}")
                for j in range(2):
                    x, y = random.randint(0, 19), random.randint(0, 19)
                    pixels.append((x, y, complementary))
        else:
            print("   🎨 Mode contrasté - ajout de couleurs vives")
            for i in range(6):
                x, y = random.randint(0, 19), random.randint(0, 19)
                color = random.choice(self.color_palette)
                pixels.append((x, y, color))
                print(f"      Contraste {i+1}: ({x}, {y}) = {color}")
                
        return pixels
        
    def _adjust_color_intensity(self, color: str, intensity: int) -> str:
        """Ajuste l'intensité d'une couleur."""
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            
            r = min(255, r + intensity)
            g = min(255, g + intensity)
            b = min(255, b + intensity)
            
            return f"#{r:02X}{g:02X}{b:02X}"
        return color
        
    def _get_complementary_color(self, color: str) -> str:
        """Trouve une couleur complémentaire."""
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            
            # Couleur complémentaire simple
            return f"#{255-r:02X}{255-g:02X}{255-b:02X}"
        return random.choice(self.color_palette)
        
    def generate_collaborative_initial(self, global_analysis: Dict) -> List[Tuple[int, int, str]]:
        """Crée une composition initiale qui s'harmonise avec les autres."""
        print("🤝 Création d'une composition initiale collaborative...")
        
        pixels = []
        
        # Analyser les couleurs dominantes des autres utilisateurs
        global_colors = global_analysis.get("global_colors", {})
        if global_colors:
            dominant_global_color = max(global_colors.items(), key=lambda x: x[1])[0]
            print(f"   🎨 Couleur dominante globale: {dominant_global_color}")
            
            # Créer un motif qui complète cette couleur
            complementary = self._get_complementary_color(dominant_global_color)
            print(f"   🌈 Couleur complémentaire choisie: {complementary}")
            
            # Créer un motif central avec la couleur complémentaire
            center_x, center_y = 10, 10
            for radius in [2, 4, 6]:
                for angle in range(0, 360, 20):
                    rad = math.radians(angle)
                    x = int(center_x + radius * math.cos(rad))
                    y = int(center_y + radius * math.sin(rad))
                    if 0 <= x < 20 and 0 <= y < 20:
                        pixels.append((x, y, complementary))
        else:
            # Fallback si pas d'autres utilisateurs
            pixels = self.generate_initial_composition()
            
        print(f"   ✅ {len(pixels)} pixels générés pour la composition collaborative")
        return pixels[:12]

    def generate_collaborative_fill(self, analysis: Dict, global_analysis: Dict) -> List[Tuple[int, int, str]]:
        """Remplit en s'inspirant des autres utilisateurs."""
        print("🤝 Remplissage collaboratif...")
        
        pixels = []
        filled = set(analysis["filled_positions"])
        
        # Utiliser les couleurs des autres utilisateurs
        global_colors = global_analysis.get("global_colors", {})
        if global_colors:
            collaborative_colors = list(global_colors.keys())[:3]
            print(f"   🎨 Couleurs collaboratives: {collaborative_colors}")
            
            for x, y in analysis["filled_positions"]:
                for dx in [-1, 0, 1]:
                    for dy in [-1, 0, 1]:
                        nx, ny = x + dx, y + dy
                        if (0 <= nx < 20 and 0 <= ny < 20 and 
                            (nx, ny) not in filled and 
                            random.random() < 0.4):
                            color = random.choice(collaborative_colors)
                            pixels.append((nx, ny, color))
        else:
            pixels = self.generate_fill_and_connect(analysis)
            
        print(f"   ✅ {len(pixels)} pixels générés pour le remplissage collaboratif")
        return pixels[:10]

    def think_and_draw(self):
        """Processus de réflexion et de dessin."""
        self.iteration += 1
        print(f"\n{'='*60}")
        print(f"🤔 ITÉRATION {self.iteration} - Claude réfléchit...")
        print(f"{'='*60}")
        
        # Analyser l'environnement global d'abord
        global_analysis = self.analyze_global_environment()
        
        # Analyser l'état actuel de ma cellule
        cell = self.get_my_cell()
        analysis = self.analyze_cell_state(cell)
        
        # Choisir une stratégie en tenant compte de l'environnement global
        strategy = self.choose_artistic_strategy(analysis, global_analysis)
        
        # Générer des pixels selon la stratégie
        print(f"\n🎨 Génération des pixels selon la stratégie '{strategy}'...")
        if strategy == "initial_composition":
            pixels = self.generate_initial_composition()
        elif strategy == "collaborative_initial":
            pixels = self.generate_collaborative_initial(global_analysis)
        elif strategy == "fill_and_connect":
            pixels = self.generate_fill_and_connect(analysis)
        elif strategy == "collaborative_fill":
            pixels = self.generate_collaborative_fill(analysis, global_analysis)
        elif strategy == "refine_and_detail":
            pixels = self.generate_refine_and_detail(analysis)
        elif strategy == "collaborative_refine":
            pixels = self.generate_refine_and_detail(analysis)  # Pour l'instant, même logique
        elif strategy == "add_color_variety":
            pixels = self.generate_color_variety(analysis)
        elif strategy == "collaborative_color_variety":
            pixels = self.generate_color_variety(analysis)  # Pour l'instant, même logique
        else:  # collaborative_response
            pixels = self.generate_collaborative_response(analysis)
            
        # Dessiner
        if pixels:
            print(f"\n✏️  Exécution du dessin...")
            success = self.draw_multiple(pixels)
            if success:
                print(f"✅ {len(pixels)} pixels dessinés avec succès!")
                print("🎨 Résultat visible sur http://localhost:3001")
            else:
                print("❌ Erreur lors du dessin")
        else:
            print("⏸️  Aucun pixel à dessiner cette fois")
            
        print(f"\n📊 Historique: {len(self.drawing_history)} pixels dessinés au total")
        print(f"⏱️  Prochaine réflexion dans 6 secondes...")
            
    def run(self, think_interval: float = 6.0):
        """Lance le bot en boucle."""
        if not self.connect():
            return
            
        print("🎨 Claude AI Bot Verbose démarré!")
        print("💭 Je vais analyser et créer de manière collaborative...")
        print("🔍 Toutes mes pensées seront affichées en temps réel!")
        print(f"⏱️  Intervalle de réflexion: {think_interval}s")
        print("🛑 Appuyez sur Ctrl+C pour arrêter")
        print("\n" + "="*60)
        
        try:
            while True:
                self.think_and_draw()
                time.sleep(think_interval)
        except KeyboardInterrupt:
            print(f"\n\n🛑 Arrêt du bot Claude...")
            print(f"📊 Session terminée: {len(self.drawing_history)} pixels dessinés au total")
        except Exception as e:
            print(f"\n❌ Erreur: {e}")
        finally:
            self.disconnect()
            
    def disconnect(self):
        """Se déconnecte."""
        if self.session_id:
            try:
                requests.delete(f"{self.api_url}/sessions/{self.session_id}")
                print("👋 Déconnexion réussie")
            except:
                pass


def main():
    """Fonction principale."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude AI Bot Verbose pour Poietic Generator")
    parser.add_argument("--api-url", default="http://localhost:8000", help="URL de l'API REST")
    parser.add_argument("--interval", type=float, default=6.0, help="Intervalle entre réflexions (s)")
    
    args = parser.parse_args()
    
    print("🤖 Démarrage de Claude AI Bot Verbose...")
    print(f"🔗 API: {args.api_url}")
    print(f"⏱️  Intervalle: {args.interval}s")
    print()
    
    bot = ClaudeAIBotVerbose(args.api_url)
    bot.run(args.interval)


if __name__ == "__main__":
    main()
