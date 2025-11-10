#!/usr/bin/env python3
"""
Bot intelligent qui communique avec Claude via l'API REST
Vision spatiale améliorée avec format compact obligatoire
"""

import asyncio
import websockets
import json
import logging
import time
import argparse
import requests
import os
import re
from typing import Dict, List, Tuple, Optional

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger('ClaudeAPIBot')

try:
    import anthropic  # SDK officiel
    _ANTHROPIC_AVAILABLE = True
except Exception:
    anthropic = None
    _ANTHROPIC_AVAILABLE = False

class ClaudeAPIBot:
    def __init__(self, poietic_url="ws://localhost:3001/updates", api_url="http://localhost:8001", interval=10):
        self.poietic_url = poietic_url
        self.api_url = api_url
        self.interval = interval
        self.websocket = None
        self.user_id = None
        self.my_cell_state = {}
        self.other_users = {}
        self.drawing_history = []
        self.iteration = 0
        self.running = True
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        self.anthropic_client = anthropic.Client(api_key=self.anthropic_key) if (self.anthropic_key and _ANTHROPIC_AVAILABLE) else None
        # État global de grille
        self.grid_size: Optional[int] = None
        self.user_positions: Dict[str, List[int]] = {}
        self.my_position: Optional[List[int]] = None

    # === ColorGenerator (portage JS -> Python) ===
    @staticmethod
    def _uuid_to_seed(uuid_str: str) -> int:
        seed = 0
        for ch in uuid_str:
            seed = ((seed << 8) + ord(ch)) & 0xFFFFFFFF
        return seed

    @staticmethod
    def _seeded_random_factory(seed: int):
        state = seed & 0xFFFFFFFF
        def rnd():
            nonlocal state
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
            return state / 4294967296.0
        return rnd

    @staticmethod
    def _hue_to_rgb(p: float, q: float, t: float) -> float:
        if t < 0: t += 1
        if t > 1: t -= 1
        if t < 1/6: return p + (q - p) * 6 * t
        if t < 1/2: return q
        if t < 2/3: return p + (q - p) * (2/3 - t) * 6
        return p

    @staticmethod
    def _hsl_to_hex(h: float, s: float, l: float) -> str:
        if s == 0:
            r = g = b = l
        else:
            q = l * (1 + s) if l < 0.5 else l + s - l * s
            p = 2 * l - q
            r = ClaudeAPIBot._hue_to_rgb(p, q, h + 1/3)
            g = ClaudeAPIBot._hue_to_rgb(p, q, h)
            b = ClaudeAPIBot._hue_to_rgb(p, q, h - 1/3)
        def to_hex(x: float) -> str:
            v = max(0, min(255, int(round(x * 255))))
            return f"{v:02x}"
        return f"#{to_hex(r)}{to_hex(g)}{to_hex(b)}"

    @staticmethod
    def generate_initial_colors_for_user(uuid_str: str) -> List[str]:
        seed = ClaudeAPIBot._uuid_to_seed(uuid_str or "")
        rnd = ClaudeAPIBot._seeded_random_factory(seed)
        baseH = rnd()
        baseS = 0.6 + (rnd() * 0.4)
        baseL = 0.4 + (rnd() * 0.2)
        colors: List[str] = []
        for _ in range(400):
            h = (baseH + (rnd() * 0.2) - 0.1) % 1.0
            s = max(0.0, min(1.0, baseS + (rnd() * 0.2) - 0.1))
            l = max(0.0, min(1.0, baseL + (rnd() * 0.2) - 0.1))
            colors.append(ClaudeAPIBot._hsl_to_hex(h, s, l))
        return colors

    @staticmethod
    def build_snapshot_20x20(base_colors: List[str], pixel_overrides: Dict[str, str]) -> List[List[str]]:
        grid = [["#000000" for _ in range(20)] for _ in range(20)]
        for y in range(20):
            for x in range(20):
                idx = y * 20 + x
                if idx < len(base_colors):
                    grid[y][x] = base_colors[idx]
        if pixel_overrides:
            for coords, color in pixel_overrides.items():
                try:
                    xs, ys = coords.split(",")
                    x = int(xs); y = int(ys)
                    if 0 <= x < 20 and 0 <= y < 20 and isinstance(color, str):
                        grid[y][x] = color
                except Exception:
                    continue
        return grid

    @staticmethod
    def grid_to_direct_format(grid_20x20: List[List[str]]) -> List[List[str]]:
        """Convertit une grille 20x20 en format direct (array de 20 arrays de 20 couleurs hex)"""
        result = []
        for y in range(20):
            row = []
            for x in range(20):
                color = grid_20x20[y][x] if y < len(grid_20x20) and x < len(grid_20x20[y]) else "#000000"
                row.append(color)
            result.append(row)
        return result

    async def send_heartbeat(self):
        """Envoie un heartbeat régulier pour éviter l'expiration de session."""
        try:
            while self.running and self.websocket:
                try:
                    await self.send_message({"type": "heartbeat"})
                except Exception:
                    pass
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            return

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
        for _idx, (x, y, color) in enumerate(pixels):
            await self.draw_pixel(x, y, color)

    def build_spatial_vision(self) -> str:
        """Crée une représentation ASCII de la grille globale pour situer Claude"""
        if not self.grid_size or not self.my_position:
            return "Position inconnue"
        
        size = self.grid_size
        lines = []
        lines.append(f"\n╔{'═' * (size * 3 + 1)}╗")
        
        for grid_y in range(-size//2, size//2 + 1):
            line = "║ "
            for grid_x in range(-size//2, size//2 + 1):
                # Trouver qui est à cette position
                found = None
                if [grid_x, grid_y] == self.my_position:
                    found = "ME"
                else:
                    for uid, pos in self.user_positions.items():
                        if pos == [grid_x, grid_y]:
                            # Utiliser première lettre de l'UUID
                            found = uid[0].upper() if uid else "?"
                            break
                
                if found == "ME":
                    line += "██ "
                elif found:
                    line += f"{found}  "
                else:
                    line += "·  "
            line += "║"
            lines.append(line)
        
        lines.append(f"╚{'═' * (size * 3 + 1)}╝")
        
        # Légende
        mx, my = self.my_position
        lines.append(f"\n📍 MA POSITION: ({mx}, {my})")
        lines.append(f"   ██ = MOI | Lettres = Voisins | · = Vide")
        
        return "\n".join(lines)

    def analyze_environment(self) -> Dict:
        """Analyse l'environnement avec vision spatiale améliorée."""
        print("\n" + "="*60)
        print("🔍 ANALYSE DE L'ENVIRONNEMENT")
        print("="*60)
        
        # DEBUG: afficher l'état de other_users
        print(f"DEBUG: other_users contient {len(self.other_users)} entrées:")
        for uid, info in list(self.other_users.items())[:3]:
            print(f"  - {uid[:8]}...: {len(info.get('pixels', {}))} pixels")
        
        # Ma cellule
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
        
        # Voisins avec snapshots ASCII
        # Compter tous les autres utilisateurs connus (via other_users, pas user_positions)
        all_users_info = []
        try:
            # Utiliser other_users directement car user_positions peut être incomplet
            for uid, info in self.other_users.items():
                if uid == self.user_id:
                    continue
                user_pixels = info.get("pixels", {})
                user_colors = {}
                for c in user_pixels.values():
                    if isinstance(c, str):
                        user_colors[c] = user_colors.get(c, 0) + 1
                        global_colors[c] = global_colors.get(c, 0) + 1
                all_users_info.append({
                    "user_id": uid[:8] + "...",
                    "pixel_count": len(user_pixels),
                    "colors": list(user_colors.keys())[:3]
                })
        except Exception as e:
            logger.error(f"❌ Erreur comptage utilisateurs: {e}")
        print(f"\n👥 AUTRES UTILISATEURS ({len(all_users_info)}):")
        other_users_info = []
        neighbor_map = {}
        neighbor_snapshots_ascii = {}
        global_colors = my_colors.copy()

        # Repli: si positions indisponibles, compter tout de même les autres utilisateurs connus
        if not self.my_position or not self.user_positions:
            try:
                for uid, info in self.other_users.items():
                    if uid == self.user_id:
                        continue
                    user_pixels = info.get("pixels", {})
                    user_colors = {}
                    for c in user_pixels.values():
                        if isinstance(c, str):
                            user_colors[c] = user_colors.get(c, 0) + 1
                            global_colors[c] = global_colors.get(c, 0) + 1
                    other_users_info.append({
                        "user_id": uid[:8] + "...",
                        "pixel_count": len(user_pixels),
                        "colors": list(user_colors.keys())[:3]
                    })
            except Exception:
                pass
            # Poursuivre l'analyse sans cartes de voisins directionnelles
            spatial_map = self.build_spatial_vision()
            return {
                "my_cell": {
                    "pixel_count": my_pixel_count,
                    "density": my_pixel_count / 400,
                    "colors": list(my_colors.keys())[:10]
                },
                "other_users": other_users_info,
                "global_environment": {
                    "distinct_colors": len(global_colors),
                    "total_activity": my_pixel_count + sum(u['pixel_count'] for u in other_users_info)
                },
                "spatial": {
                    "grid_size": self.grid_size,
                    "my_position": self.my_position,
                    "spatial_map": spatial_map,
                    "neighbors": {},
                    "neighbor_snapshots": {}
                }
            }

        directions = {
            "N": (0, -1), "NE": (1, -1), "E": (1, 0), "SE": (1, 1),
            "S": (0, 1), "SW": (-1, 1), "W": (-1, 0), "NW": (-1, -1)
        }
        
        try:
            if self.my_position and self.user_positions:
                myx, myy = self.my_position
                pos_to_user = {(pos[0], pos[1]): uid for uid, pos in self.user_positions.items()}
                # Préparer ma propre grille pour comparer les bords
                my_base = ClaudeAPIBot.generate_initial_colors_for_user(self.user_id or "")
                my_grid20 = ClaudeAPIBot.build_snapshot_20x20(my_base, self.my_cell_state)
                
                for label, (dx, dy) in directions.items():
                    coords = (myx + dx, myy + dy)
                    uid = pos_to_user.get(coords)
                    # Inclure le voisin même s'il n'a pas encore émis de pixels
                    if uid and uid != self.user_id:
                        info = self.other_users.get(uid, {"position": [coords[0], coords[1]], "pixels": {}})
                        user_pixels = info.get("pixels", {})
                        user_colors = {}
                        for c in user_pixels.values():
                            if isinstance(c, str):
                                user_colors[c] = user_colors.get(c, 0) + 1
                                global_colors[c] = global_colors.get(c, 0) + 1
                        
                        # Echo couleur (chevauchement de palettes)
                        my_colors_set = set(my_colors.keys())
                        neighbor_colors_set = set(user_colors.keys())
                        echo_color = 0.0
                        if neighbor_colors_set:
                            echo_color = len(my_colors_set.intersection(neighbor_colors_set)) / len(neighbor_colors_set)
                        
                        # Similarité de bord le long de la frontière partagée
                        border_similarity = 0.0
                        try:
                            base = ClaudeAPIBot.generate_initial_colors_for_user(uid)
                            grid20 = ClaudeAPIBot.build_snapshot_20x20(base, user_pixels)
                            matches = 0
                            total = 20
                            if label == "W":
                                # Mon x=0 vs voisin x=19
                                for y in range(20):
                                    if my_grid20[y][0] == grid20[y][19]:
                                        matches += 1
                            elif label == "E":
                                # Mon x=19 vs voisin x=0
                                for y in range(20):
                                    if my_grid20[y][19] == grid20[y][0]:
                                        matches += 1
                            elif label == "N":
                                # Mon y=0 vs voisin y=19
                                for x in range(20):
                                    if my_grid20[0][x] == grid20[19][x]:
                                        matches += 1
                            elif label == "S":
                                # Mon y=19 vs voisin y=0
                                for x in range(20):
                                    if my_grid20[19][x] == grid20[0][x]:
                                        matches += 1
                            else:
                                total = 1
                                matches = 0
                            border_similarity = matches / total
                        except Exception:
                            border_similarity = 0.0
                        
                        neighbor_map[label] = {
                            "user_id": uid[:8] + "...",
                            "pixel_count": len(user_pixels),
                            "colors": list(user_colors.keys())[:3],
                            "echo_color": round(echo_color, 3),
                            "border_similarity": round(border_similarity, 3)
                        }
                        
                        # Créer snapshot format direct (toutes couleurs)
                        base = ClaudeAPIBot.generate_initial_colors_for_user(uid)
                        grid20 = ClaudeAPIBot.build_snapshot_20x20(base, user_pixels)
                        grid_direct = ClaudeAPIBot.grid_to_direct_format(grid20)
                        neighbor_snapshots_ascii[label] = {
                            "user_id": uid[:8],
                            "grid": grid_direct,
                            "pixel_count": len(user_pixels)
                        }
                        
                        user_info = {
                            "user_id": uid[:8] + "...",
                            "pixel_count": len(user_pixels),
                            "colors": list(user_colors.keys())[:3]
                        }
                        other_users_info.append(user_info)
                        print(f"   - {label}: {uid[:8]}... | {len(user_pixels)} pixels")
        except Exception as e:
            logger.error(f"❌ Erreur voisins: {e}")
        
        print(f"\n🌍 ENVIRONNEMENT GLOBAL:")
        print(f"   - {len(global_colors)} couleurs différentes")
        
        # Vision spatiale
        spatial_map = self.build_spatial_vision()
        
        result = {
            "my_cell": {
                "pixel_count": my_pixel_count,
                "density": my_pixel_count / 400,
                "colors": list(my_colors.keys())[:10]
            },
            # Reporter tous les autres utilisateurs connus (pas seulement les adjacents)
            "other_users": all_users_info or other_users_info,
            "global_environment": {
                "distinct_colors": len(global_colors),
                "total_activity": my_pixel_count + sum(u['pixel_count'] for u in (all_users_info or other_users_info))
            },
            "spatial": {
                "grid_size": self.grid_size,
                "my_position": self.my_position,
                "spatial_map": spatial_map,
                "neighbors": neighbor_map,
                "neighbor_snapshots": neighbor_snapshots_ascii
            }
        }

        # Journaliser une note succincte sur les voisins
        try:
            notes = []
            for d in ["W","E","N","S","NW","NE","SW","SE"]:
                if d in neighbor_map:
                    n = neighbor_map[d]
                    notes.append(f"{d}:{n['user_id']} px={n['pixel_count']} echo={int(n.get('echo_color',0)*100)}% bord={int(n.get('border_similarity',0)*100)}%")
            note_str = " | ".join(notes) if notes else "aucun voisin"
            requests.post(f"{self.api_url}/api/event", json={"type":"env-note","message":f"Voisins: {note_str}"}, timeout=1)
        except Exception:
            pass

        return result

    def build_claude_prompt(self, analysis: Dict) -> str:
        """Construit un prompt clair et structuré pour Claude avec format compact OBLIGATOIRE"""
        my_cell = analysis.get("my_cell", {})
        spatial = analysis.get("spatial", {})
        neighbors = spatial.get("neighbor_snapshots", {})
        
        # Récupérer prompt utilisateur
        extra_prompt = ""
        try:
            r = requests.get(f"{self.api_url}/api/prompt", timeout=1.5)
            if r.ok:
                extra_prompt = (r.json() or {}).get("prompt", "")
        except Exception:
            pass
        
        # Trouver le voisin le plus pertinent (mention dans prompt utilisateur ou le plus actif)
        target_neighbor = None
        target_direction = None
        
        # Chercher si un direction est mentionnée dans le prompt
        prompt_lower = extra_prompt.lower()
        direction_keywords = {
            "W": ["gauche", "ouest", "left", "west", "w"],
            "E": ["droite", "est", "right", "east", "e"],
            "N": ["haut", "nord", "north", "top", "n"],
            "S": ["bas", "sud", "south", "bottom", "s"],
            "NW": ["nord-ouest", "northwest", "nw", "haut-gauche"],
            "NE": ["nord-est", "northeast", "ne", "haut-droite"],
            "SW": ["sud-ouest", "southwest", "sw", "bas-gauche"],
            "SE": ["sud-est", "southeast", "se", "bas-droite"]
        }
        
        for direction, keywords in direction_keywords.items():
            if any(kw in prompt_lower for kw in keywords):
                if direction in neighbors:
                    target_neighbor = neighbors[direction]
                    target_direction = direction
                    break
        
        # Sinon, prendre le plus actif
        if not target_neighbor:
            for direction in ["W", "E", "N", "S", "NW", "NE", "SW", "SE"]:
                if direction in neighbors:
                    target_neighbor = neighbors[direction]
                    target_direction = direction
                    break
        
        # Construire vue complète des voisins (format direct = toutes couleurs)
        neighbor_section = "\n═══ VOISINS ADJACENTS ═══\n"
        
        # Afficher TOUS les voisins adjacents avec leurs grilles complètes
        for direction in ["W", "E", "N", "S", "NW", "NE", "SW", "SE"]:
            if direction in neighbors:
                snap = neighbors[direction]
                # Ne pas induire en erreur: n'afficher la grille complète que si on a des pixels réels
                if int(snap.get('pixel_count', 0)) <= 0:
                    neighbor_section += f"\n- {direction}: ID={snap['user_id']} | aucun pixel réel reçu (ignore pour imitation)\n"
                    continue
                neighbor_section += f"\n╔═══ VOISIN {direction} ═══╗\n"
                neighbor_section += f"║ ID: {snap['user_id']} | {snap['pixel_count']} pixels modifiés ║\n"
                neighbor_section += f"╚════════════════════════════════════════════╝\n"
                neighbor_section += f"GRILLE 20x20:\n"
                grid = snap['grid']
                # Afficher sous forme JSON compact
                neighbor_section += "[\n"
                for y, row in enumerate(grid[:20]):
                    neighbor_section += f'  {json.dumps(row[:20], ensure_ascii=False)}'
                    if y < 19:
                        neighbor_section += ","
                    neighbor_section += "\n"
                neighbor_section += "]\n"
        
        # Pour éviter les erreurs de formatage dans les f-strings, on extrait les exemples hors de l'f-string
        example_delta = (
            "// FORMAT A - DELTA (recommandé pour itérations courtes)\n"
            "{\n  \"strategy\": \"ta stratégie en 1 phrase\",\n  \"neighbor_comment\": \"une phrase sur la réaction d'un voisin (optionnel)\",\n  \"pixels\": [\n    {\"x\": 12, \"y\": 7, \"color\": \"#AABBCC\"},\n    {\"x\": 13, \"y\": 7, \"color\": \"#334455\"}\n  ]\n}\n"
        )
        example_grid = (
            "// FORMAT B - GRILLE COMPLÈTE (20x20)\n"
            "{\n  \"strategy\": \"ta stratégie en 1 phrase\",\n  \"neighbor_comment\": \"une phrase sur la réaction d'un voisin (optionnel)\",\n  \"grid\": [\n    [\"#RRGGBB\", \"#RRGGBB\", \"...\"],\n    [\"#RRGGBB\", \"#RRGGBB\", \"...\"],\n    \"...\"\n  ]\n}\n"
        )

        prompt = f"""POIETIC GENERATOR - Artiste IA

{spatial.get('spatial_map', '')}

MON ÉTAT: {my_cell.get('pixel_count', 0)}/400 pixels ({my_cell.get('density', 0):.1%})

{neighbor_section}

INSTRUCTION: {extra_prompt if extra_prompt else "Libre. Aucun motif suggéré. Tu peux modifier de 1 à 400 pixels (y compris 400). Base-toi sur l'environnement global et/ou imite fidèlement un voisin si pertinent."}

═══════════════════════════════════════════════════════════════
FORMATS DE RÉPONSE (JSON strict, sans ``` ni texte):
═══════════════════════════════════════════════════════════════

{example_delta}

{example_grid}

RÈGLES:
- Aucune limite de pixels par itération: tu peux modifier de 1 à 400 pixels.
- pixels: liste d'updates ponctuelles (delta) — pour des retouches ciblées ou une copie précise.
- grid: grille complète si tu veux proposer un changement global majeur ou copier un motif entier.
- Aucune limite de couleurs.
- Observe l'environnement et vise la cohérence (copie exacte autorisée si c'est la meilleure action).

IMPORTANT IMITATION:
- Ignore tout voisin avec "aucun pixel réel reçu" (pixel_count=0): sa grille affichée serait seulement son état initial, pas son dessin actuel.
- Pour copier/imiter, utilise UNIQUEMENT les voisins qui ont des pixels réels (pixel_count>0).

COMMENTAIRE VOISINS (optionnel): ajoute "neighbor_comment" pour expliquer brièvement une réaction observée chez un voisin (écho de couleurs, similarité de bord, etc.).

Ta réponse influence le dessin GLOBAL. Vise la cohérence et la continuité visuelle.

RÉPONDS UNIQUEMENT EN JSON VALIDE."""

        return prompt

    def ask_claude_via_api(self, analysis: Dict) -> Optional[Dict]:
        """Appelle Claude et parse le format compact"""
        if not self.anthropic_client:
            return None

        def _call_claude(prompt_text: str):
            msg = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-latest",
                max_tokens=8000,
                temperature=0.7,
                system="Tu es un artiste dans un système collaboratif. Tu renvoies UNIQUEMENT du JSON strict valide (sans code fence, ni texte). Ta réponse influence le dessin global visible par tous.",
                messages=[{"role": "user", "content": prompt_text}],
            )
            content = ""
            for part in msg.content:
                if hasattr(part, "text"):
                    content += part.text
            content = content.strip()
            return content

        def _sanitize_json_text(text: str) -> Optional[Dict]:
            # Retirer les fences ```json ... ```
            if text.startswith("```"):
                text = text.strip('`')
                if text.startswith("json"):
                    text = text[4:].strip()
            # Remplacer guillemets typographiques
            text = text.replace("\u201c", '"').replace("\u201d", '"').replace("“", '"').replace("”", '"')
            text = text.replace("\u2019", "'").replace("’", "'")
            # Extraire bloc JSON probable (entre première { et dernière })
            if '{' in text and '}' in text:
                start = text.find('{')
                end = text.rfind('}') + 1
                text = text[start:end]
            # Enlever les virgules traînantes avant } ou ]
            text = re.sub(r",\s*(}\s*)", r"\1", text)
            text = re.sub(r",\s*(]\s*)", r"\1", text)
            # Essai direct
            try:
                return json.loads(text)
            except Exception:
                # Dernière tentative: remplacer quotes simples par doubles pour les chaînes simples
                try:
                    text2 = re.sub(r"'", '"', text)
                    return json.loads(text2)
                except Exception:
                    return None

        try:
            try:
                requests.post(f"{self.api_url}/api/event", json={"type": "info", "message": "Appel Claude (format compact)"}, timeout=1)
            except Exception:
                pass
            
            prompt = self.build_claude_prompt(analysis)
            
            # DEBUG: Sauvegarder le prompt pour inspection
            try:
                debug_path = os.path.join(os.path.dirname(__file__), "..", ".last_prompt.txt")
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(f"=== PROMPT ENVOYÉ À CLAUDE (itération {self.iteration}) ===\n\n")
                    f.write(prompt)
                    f.write(f"\n\n=== FIN PROMPT ===\n")
            except Exception:
                pass
            
            raw = _call_claude(prompt)
            data = _sanitize_json_text(raw) or {}
            
            # DEBUG: Sauvegarder la réponse de Claude
            try:
                debug_path = os.path.join(os.path.dirname(__file__), "..", ".last_response.json")
                with open(debug_path, "w", encoding="utf-8") as f:
                    if data:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    else:
                        f.write(raw)
            except Exception:
                pass
            
            # Parse format direct (grid = array de 20 arrays de couleurs) ou format delta (pixels)
            pixels = []
            try:
                # 1) Format delta (pixels)
                if isinstance(data.get("pixels"), list) and data.get("pixels"):
                    for p in data.get("pixels", [])[:400]:
                        try:
                            x = int(p.get("x")); y = int(p.get("y")); color = str(p.get("color"))
                            if 0 <= x < 20 and 0 <= y < 20 and isinstance(color, str) and color.startswith("#") and len(color) == 7:
                                pixels.append({"x": x, "y": y, "color": color, "reason": "delta"})
                        except Exception:
                            continue
                
                # 2) Format grille complète
                if not pixels:
                    grid_data = data.get("grid", [])
                    if not isinstance(grid_data, list):
                        raise ValueError("Format grid invalide (doit être un array)")
                    for y, row in enumerate(grid_data[:20]):
                        if not isinstance(row, list):
                            continue
                        for x, color in enumerate(row[:20]):
                            if isinstance(color, str) and color.startswith("#") and len(color) == 7:
                                pixels.append({"x": x, "y": y, "color": color, "reason": "direct"})
                
                print(f"✅ Claude a envoyé {len(pixels)} pixels")
                
                try:
                    neighbor_comment = str(data.get("neighbor_comment", "")).strip()
                    # Échapper les guillemets et caractères spéciaux dans le commentaire
                    neighbor_comment = neighbor_comment.replace('"', "'").replace('\n', ' ')
                    summary = f"Claude: {len(pixels)} pixels, stratégie='{data.get('strategy', '')[:50]}'"
                    if neighbor_comment:
                        summary += f" | voisin: {neighbor_comment[:80]}"
                    requests.post(f"{self.api_url}/api/event", json={"type": "claude", "message": summary}, timeout=1)
                except Exception as e:
                    logger.error(f"❌ Erreur journalisation: {e}")
                
                return {"strategy": str(data.get("strategy", "")), "pixels": pixels}
                
            except Exception as e:
                logger.error(f"❌ Erreur parsing grid: {e}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Appel Claude échoué: {e}")
            try:
                requests.post(f"{self.api_url}/api/event", json={"type": "error", "message": f"Erreur Claude: {e}"}, timeout=1)
            except Exception:
                pass
            return None

    def submit_environment_to_claude(self, analysis: Dict) -> bool:
        """Soumet l'environnement à Claude via l'API."""
        try:
            print(f"\n📤 Envoi de l'état à Claude...")
            state_data = {
                "my_cell": analysis["my_cell"],
                "other_users": analysis["other_users"],
                "global_environment": analysis["global_environment"],
                "iteration": self.iteration,
                "timestamp": time.time()
            }
            response = requests.post(f"{self.api_url}/api/submit_environment", json=state_data)
            if response.status_code == 200:
                print("✅ État envoyé")
                return True
            return False
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return False

    def get_claude_instruction(self) -> Dict:
        """Récupère les instructions de Claude."""
        try:
            response = requests.get(f"{self.api_url}/api/get_instruction")
            if response.status_code == 200:
                data = response.json()
                if data["status"] == "ready":
                    return data["instruction"]
            return None
        except Exception:
            return None

    def submit_instruction_to_api(self, instruction: Dict) -> None:
        """Publie une instruction à l'API."""
        try:
            requests.post(f"{self.api_url}/api/submit_instruction", json=instruction, timeout=3)
        except Exception:
            pass

    async def handle_message(self, message: str):
        """Traite les messages reçus."""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "initial_state":
                self.user_id = data.get("my_user_id")
                print(f"🎨 Mon user_id: {self.user_id}")
                self.grid_size = data.get("grid_size")
                
                # Parser grid_state pour positions
                try:
                    grid_state_raw = data.get("grid_state")
                    if isinstance(grid_state_raw, str):
                        grid_state = json.loads(grid_state_raw)
                    else:
                        grid_state = grid_state_raw or {}
                    if isinstance(grid_state, dict) and "user_positions" in grid_state:
                        self.user_positions = {}
                        for uid, pos in (grid_state.get("user_positions") or {}).items():
                            if isinstance(pos, list) and len(pos) == 2:
                                self.user_positions[str(uid)] = [int(pos[0]), int(pos[1])]
                        if self.user_id and self.user_id in self.user_positions:
                            self.my_position = self.user_positions[self.user_id]
                except Exception as e:
                    logger.error(f"❌ Erreur parsing grid_state: {e}")
                
                # CRUCIAL: Parser sub_cell_states pour charger TOUS les pixels existants des autres utilisateurs
                try:
                    # Pré-remplir tous les voisins connus par positions, même sans pixels
                    if isinstance(self.user_positions, dict):
                        for uid, pos in self.user_positions.items():
                            if uid != self.user_id:
                                uid_str = str(uid)
                                if uid_str not in self.other_users:
                                    self.other_users[uid_str] = {"position": pos, "pixels": {}}

                    sub_cell_states = data.get("sub_cell_states", {})
                    if isinstance(sub_cell_states, dict):
                        for uid, user_pixels in sub_cell_states.items():
                            if uid != self.user_id and isinstance(user_pixels, dict):
                                uid_str = str(uid)
                                if uid_str not in self.other_users:
                                    pos = self.user_positions.get(uid_str, [0, 0])
                                    self.other_users[uid_str] = {"position": pos, "pixels": {}}
                                for coords, color in user_pixels.items():
                                    if isinstance(color, str):
                                        self.other_users[uid_str]["pixels"][coords] = color
                    print(f"✅ État initial: {len([u for u in self.other_users if u != self.user_id])} voisins connus")
                except Exception as e:
                    logger.error(f"❌ Erreur parsing sub_cell_states: {e}")
            
            elif message_type == "new_user":
                user_id = data.get("user_id")
                position = data.get("position", [0, 0])
                if user_id != self.user_id:
                    if not isinstance(user_id, str):
                        user_id = str(user_id)
                    self.other_users[user_id] = {"position": position, "pixels": {}}
            
            elif message_type == "user_left":
                user_id = data.get("user_id")
                if user_id in self.other_users:
                    del self.other_users[user_id]
            
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
                        self.other_users[user_id] = {"position": [0, 0], "pixels": {}}
                        try:
                            if user_id in self.user_positions:
                                self.other_users[user_id]["position"] = self.user_positions[user_id]
                        except Exception:
                            pass
                    coords = f"{sub_x},{sub_y}"
                    self.other_users[user_id]["pixels"][coords] = color

            elif message_type == "batch_update":
                # Support des importations d'images: mises à jour groupées
                user_id = data.get("user_id")
                updates = data.get("updates", [])
                if user_id and isinstance(updates, list):
                    if not isinstance(user_id, str):
                        user_id = str(user_id)
                    if user_id == self.user_id:
                        # Mes propres updates
                        for upd in updates:
                            try:
                                x = int(upd.get("sub_x")); y = int(upd.get("sub_y")); color = str(upd.get("color"))
                                self.my_cell_state[f"{x},{y}"] = color
                            except Exception:
                                continue
                    else:
                        if user_id not in self.other_users:
                            self.other_users[user_id] = {"position": self.user_positions.get(user_id, [0, 0]), "pixels": {}}
                        for upd in updates:
                            try:
                                x = int(upd.get("sub_x")); y = int(upd.get("sub_y")); color = str(upd.get("color"))
                                self.other_users[user_id]["pixels"][f"{x},{y}"] = color
                            except Exception:
                                continue

            elif message_type == "zoom_update":
                # Reçoit un snapshot cohérent lors d'un changement de zoom: re-synchroniser positions et pixels
                try:
                    new_grid_size = data.get("grid_size")
                    if isinstance(new_grid_size, int):
                        self.grid_size = new_grid_size
                    grid_state_raw = data.get("grid_state")
                    grid_state = json.loads(grid_state_raw) if isinstance(grid_state_raw, str) else (grid_state_raw or {})
                    if isinstance(grid_state, dict) and "user_positions" in grid_state:
                        self.user_positions = {}
                        for uid, pos in (grid_state.get("user_positions") or {}).items():
                            if isinstance(pos, list) and len(pos) == 2:
                                self.user_positions[str(uid)] = [int(pos[0]), int(pos[1])]
                        if self.user_id and self.user_id in self.user_positions:
                            self.my_position = self.user_positions[self.user_id]
                    sub_cell_states = data.get("sub_cell_states", {})
                    if isinstance(sub_cell_states, dict):
                        for uid, user_pixels in sub_cell_states.items():
                            uid_str = str(uid)
                            if uid_str == self.user_id:
                                # Mettre à jour ma propre cellule
                                for coords, color in (user_pixels or {}).items():
                                    if isinstance(color, str):
                                        self.my_cell_state[coords] = color
                            else:
                                if uid_str not in self.other_users:
                                    pos = self.user_positions.get(uid_str, [0, 0])
                                    self.other_users[uid_str] = {"position": pos, "pixels": {}}
                                for coords, color in (user_pixels or {}).items():
                                    if isinstance(color, str):
                                        self.other_users[uid_str]["pixels"][coords] = color
                except Exception as e:
                    logger.error(f"❌ Erreur zoom_update: {e}")
                    
        except Exception as e:
            logger.error(f"❌ Erreur message: {e}")

    async def run(self):
        """Boucle principale."""
        print("🚀 Claude API Bot démarré!")
        print(f"🎨 Poietic: {self.poietic_url}")
        
        if not await self.connect():
            return
            
        try:
            async def listen_messages():
                try:
                    async for message in self.websocket:
                        await self.handle_message(message)
                except Exception as e:
                    logger.error(f"❌ Erreur écoute: {e}")
            
            listen_task = asyncio.create_task(listen_messages())
            heartbeat_task = asyncio.create_task(self.send_heartbeat())
            
            print("⏳ Attente messages initiaux...")
            await asyncio.sleep(3)
            print("⏳ Accumulation pixels voisins...")
            await asyncio.sleep(2)
            
            while self.running:
                self.iteration += 1
                print(f"\n🤔 ITÉRATION {self.iteration}")
                
                try:
                    analysis = self.analyze_environment()
                except Exception as e:
                    logger.error(f"❌ Erreur analyse: {e}")
                    await asyncio.sleep(self.interval)
                    continue
                
                if not self.submit_environment_to_claude(analysis):
                    await asyncio.sleep(self.interval)
                    continue
                
                print(f"⏳ Attente Claude (max {self.interval}s)...")
                instruction = None
                for _ in range(self.interval * 2):
                    instruction = self.get_claude_instruction()
                    if instruction:
                        break
                    await asyncio.sleep(0.5)
                
                if not instruction:
                    if self.iteration <= 2:
                        print("⏳ Re-analyse...")
                        await asyncio.sleep(2)
                        analysis = self.analyze_environment()
                        self.submit_environment_to_claude(analysis)
                        for _ in range(self.interval):
                            instruction = self.get_claude_instruction()
                            if instruction:
                                break
                            await asyncio.sleep(0.5)
                    
                    if not instruction:
                        direct = self.ask_claude_via_api(analysis)
                        if direct:
                            print("✨ Claude (direct)")
                            self.submit_instruction_to_api(direct)
                            instruction = direct
                        else:
                            print("⏳ Pas de réponse")
                            await asyncio.sleep(self.interval)
                            continue
                
                print(f"\n🎨 Exécution:")
                print(f"🎯 {instruction['strategy']}")
                
                pixels = []
                for pixel_data in instruction["pixels"]:
                    x = pixel_data["x"]
                    y = pixel_data["y"]
                    color = pixel_data["color"]
                    if 0 <= x < 20 and 0 <= y < 20:
                        pixels.append((x, y, color))
                
                if pixels:
                    print(f"✏️ Dessin de {len(pixels)} pixels...")
                    await self.draw_multiple(pixels)
                    print(f"✅ {len(pixels)} pixels dessinés!")
                    self.drawing_history.extend(pixels)
                    for x, y, color in pixels:
                        self.my_cell_state[f"{x},{y}"] = color
                else:
                    print("⏸️ Aucun pixel")
                
                print(f"\n📊 Total: {len(self.drawing_history)} pixels")
                await asyncio.sleep(self.interval)
                
        except KeyboardInterrupt:
            print("\n👋 Arrêt")
        except Exception as e:
            logger.error(f"❌ Erreur: {e}")
        finally:
            if self.websocket:
                await self.websocket.close()
            try:
                listen_task.cancel()
                heartbeat_task.cancel()
            except Exception:
                pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Claude API Bot")
    parser.add_argument("--poietic_url", type=str, default="ws://localhost:3001/updates")
    parser.add_argument("--api_url", type=str, default="http://localhost:8001")
    parser.add_argument("--interval", type=int, default=10)
    args = parser.parse_args()

    bot = ClaudeAPIBot(poietic_url=args.poietic_url, api_url=args.api_url, interval=args.interval)
    asyncio.run(bot.run())