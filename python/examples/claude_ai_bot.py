#!/usr/bin/env python3
"""
Claude AI Bot - Bot contrôlé par Claude (via Cursor Chat)
========================================================

Ce bot simule ma "personnalité" artistique en tant qu'IA Claude.
Il analyse l'état de la grille et prend des décisions créatives
basées sur des principes esthétiques et collaboratifs.
"""

import requests
import json
import time
import random
import math
from typing import Dict, List, Tuple, Optional

class ClaudeAIBot:
    """Bot IA avec la personnalité de Claude."""
    
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
        try:
            response = requests.post(f"{self.api_url}/sessions", json={
                "poietic_url": "ws://localhost:3001/updates",
                "name": "Claude-AI-Bot"
            })
            response.raise_for_status()
            data = response.json()
            self.session_id = data["session_id"]
            print(f"🤖 Claude AI Bot connecté: {self.session_id}")
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
            
    def analyze_cell_state(self, cell: Dict) -> Dict:
        """Analyse l'état de la cellule pour prendre des décisions créatives."""
        pixels = cell.get("pixels", {})
        pixel_count = cell.get("pixel_count", 0)
        
        # Analyser les couleurs utilisées
        colors = {}
        for coords, color in pixels.items():
            colors[color] = colors.get(color, 0) + 1
            
        # Analyser la densité
        density = pixel_count / 400  # 20x20 = 400 pixels max
        
        # Analyser les patterns spatiaux
        filled_positions = []
        for coords in pixels.keys():
            x, y = map(int, coords.split(','))
            filled_positions.append((x, y))
            
        return {
            "pixel_count": pixel_count,
            "density": density,
            "colors": colors,
            "color_count": len(colors),
            "filled_positions": filled_positions,
            "is_empty": pixel_count == 0,
            "is_sparse": density < 0.1,
            "is_dense": density > 0.5
        }
        
    def choose_artistic_strategy(self, analysis: Dict) -> str:
        """Choisit une stratégie artistique basée sur l'analyse."""
        if analysis["is_empty"]:
            return "initial_composition"
        elif analysis["is_sparse"]:
            return "fill_and_connect"
        elif analysis["is_dense"]:
            return "refine_and_detail"
        elif analysis["color_count"] < 3:
            return "add_color_variety"
        else:
            return "collaborative_response"
            
    def generate_initial_composition(self) -> List[Tuple[int, int, str]]:
        """Crée une composition initiale harmonieuse."""
        print("🎨 Création d'une composition initiale harmonieuse...")
        
        pixels = []
        
        # Créer un motif central avec des cercles concentriques
        center_x, center_y = 10, 10
        base_color = random.choice(self.color_palette)
        
        for radius in [3, 6, 9]:
            for angle in range(0, 360, 15):
                rad = math.radians(angle)
                x = int(center_x + radius * math.cos(rad))
                y = int(center_y + radius * math.sin(rad))
                if 0 <= x < 20 and 0 <= y < 20:
                    # Variation de couleur basée sur la distance
                    color_intensity = int(255 * (1 - radius/10))
                    color = self._adjust_color_intensity(base_color, color_intensity)
                    pixels.append((x, y, color))
                    
        return pixels[:15]  # Limiter à 15 pixels par itération
        
    def generate_fill_and_connect(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Remplit les espaces vides et connecte les éléments existants."""
        print("🔗 Remplissage et connexion des éléments...")
        
        pixels = []
        filled = set(analysis["filled_positions"])
        
        # Trouver des positions vides près des éléments existants
        for x, y in analysis["filled_positions"]:
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    nx, ny = x + dx, y + dy
                    if (0 <= nx < 20 and 0 <= ny < 20 and 
                        (nx, ny) not in filled and 
                        random.random() < 0.3):
                        color = random.choice(self.color_palette)
                        pixels.append((nx, ny, color))
                        
        return pixels[:10]
        
    def generate_refine_and_detail(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Ajoute des détails et raffine la composition."""
        print("✨ Ajout de détails et raffinement...")
        
        pixels = []
        
        # Ajouter des accents colorés
        for _ in range(5):
            x, y = random.randint(0, 19), random.randint(0, 19)
            color = random.choice(self.color_palette)
            pixels.append((x, y, color))
            
        return pixels
        
    def generate_color_variety(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Ajoute de la variété chromatique."""
        print("🌈 Ajout de variété chromatique...")
        
        pixels = []
        existing_colors = set(analysis["colors"].keys())
        new_colors = [c for c in self.color_palette if c not in existing_colors]
        
        if not new_colors:
            new_colors = self.color_palette
            
        for _ in range(8):
            x, y = random.randint(0, 19), random.randint(0, 19)
            color = random.choice(new_colors)
            pixels.append((x, y, color))
            
        return pixels
        
    def generate_collaborative_response(self, analysis: Dict) -> List[Tuple[int, int, str]]:
        """Répond de manière collaborative aux autres utilisateurs."""
        print("🤝 Réponse collaborative aux autres créations...")
        
        pixels = []
        
        # Créer des motifs qui complètent ou contrastent
        if analysis["color_count"] > 3:
            # Mode harmonieux - utiliser des couleurs complémentaires
            base_colors = list(analysis["colors"].keys())[:3]
            for color in base_colors:
                complementary = self._get_complementary_color(color)
                for _ in range(2):
                    x, y = random.randint(0, 19), random.randint(0, 19)
                    pixels.append((x, y, complementary))
        else:
            # Mode contrasté - ajouter des couleurs vives
            for _ in range(6):
                x, y = random.randint(0, 19), random.randint(0, 19)
                color = random.choice(self.color_palette)
                pixels.append((x, y, color))
                
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
        
    def think_and_draw(self):
        """Processus de réflexion et de dessin."""
        self.iteration += 1
        print(f"\n🤔 Itération {self.iteration}: Claude réfléchit...")
        
        # Analyser l'état actuel
        cell = self.get_my_cell()
        analysis = self.analyze_cell_state(cell)
        
        print(f"📊 Analyse: {analysis['pixel_count']} pixels, "
              f"{analysis['color_count']} couleurs, "
              f"densité {analysis['density']:.2f}")
        
        # Choisir une stratégie
        strategy = self.choose_artistic_strategy(analysis)
        print(f"🎯 Stratégie: {strategy}")
        
        # Générer des pixels selon la stratégie
        if strategy == "initial_composition":
            pixels = self.generate_initial_composition()
        elif strategy == "fill_and_connect":
            pixels = self.generate_fill_and_connect(analysis)
        elif strategy == "refine_and_detail":
            pixels = self.generate_refine_and_detail(analysis)
        elif strategy == "add_color_variety":
            pixels = self.generate_color_variety(analysis)
        else:  # collaborative_response
            pixels = self.generate_collaborative_response(analysis)
            
        # Dessiner
        if pixels:
            success = self.draw_multiple(pixels)
            if success:
                print(f"✏️  {len(pixels)} pixels dessinés avec succès")
            else:
                print("❌ Erreur lors du dessin")
        else:
            print("⏸️  Aucun pixel à dessiner cette fois")
            
    def run(self, think_interval: float = 8.0):
        """Lance le bot en boucle."""
        if not self.connect():
            return
            
        print("🎨 Claude AI Bot démarré!")
        print("💭 Je vais analyser et créer de manière collaborative...")
        print(f"⏱️  Intervalle de réflexion: {think_interval}s")
        print("🛑 Appuyez sur Ctrl+C pour arrêter")
        
        try:
            while True:
                self.think_and_draw()
                print(f"⏸️  Pause de {think_interval}s...")
                time.sleep(think_interval)
        except KeyboardInterrupt:
            print("\n🛑 Arrêt du bot Claude...")
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
    
    parser = argparse.ArgumentParser(description="Claude AI Bot pour Poietic Generator")
    parser.add_argument("--api-url", default="http://localhost:8000", help="URL de l'API REST")
    parser.add_argument("--interval", type=float, default=8.0, help="Intervalle entre réflexions (s)")
    
    args = parser.parse_args()
    
    print("🤖 Démarrage de Claude AI Bot...")
    print(f"🔗 API: {args.api_url}")
    print(f"⏱️  Intervalle: {args.interval}s")
    print()
    
    bot = ClaudeAIBot(args.api_url)
    bot.run(args.interval)


if __name__ == "__main__":
    main()
