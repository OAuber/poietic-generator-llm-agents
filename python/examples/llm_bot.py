#!/usr/bin/env python3
"""
LLM Bot - Bot contrôlé par un LLM (OpenAI GPT ou Anthropic Claude)
==================================================================

Ce bot utilise un LLM pour décider quoi dessiner en fonction de l'état
actuel de sa cellule et des instructions créatives.

Nécessite:
    pip install openai anthropic
    
Variables d'environnement:
    OPENAI_API_KEY ou ANTHROPIC_API_KEY
"""

import asyncio
import sys
import os
import json
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from poietic_client import PoieticClient


class LLMBot:
    """Bot qui utilise un LLM pour décider de ses actions."""
    
    def __init__(
        self, 
        client: PoieticClient,
        llm_provider: str = "openai",  # "openai" ou "anthropic"
        model: Optional[str] = None,
        creative_prompt: str = "Tu es un artiste créatif qui dessine des motifs intéressants."
    ):
        self.client = client
        self.llm_provider = llm_provider.lower()
        self.creative_prompt = creative_prompt
        self.draw_history = []
        
        # Initialiser le client LLM
        if self.llm_provider == "openai":
            import openai
            self.llm_client = openai.OpenAI()
            self.model = model or "gpt-4o-mini"
        elif self.llm_provider == "anthropic":
            import anthropic
            self.llm_client = anthropic.Anthropic()
            self.model = model or "claude-3-5-sonnet-20241022"
        else:
            raise ValueError(f"Provider non supporté: {llm_provider}")
            
    def _cell_to_description(self) -> str:
        """Convertit l'état de la cellule en description textuelle."""
        cell = self.client.get_my_cell()
        
        if not cell:
            return "Cellule vide (20x20 pixels, tous blancs)"
            
        # Compter les couleurs utilisées
        colors = {}
        for (x, y), color in cell.items():
            colors[color] = colors.get(color, 0) + 1
            
        total_pixels = len(cell)
        description = f"Cellule avec {total_pixels} pixels colorés sur 400 possibles.\n"
        description += f"Couleurs utilisées: {len(colors)}\n"
        
        if colors:
            sorted_colors = sorted(colors.items(), key=lambda x: x[1], reverse=True)
            top_colors = sorted_colors[:5]
            description += "Top 5 couleurs:\n"
            for color, count in top_colors:
                description += f"  - {color}: {count} pixels\n"
                
        return description
        
    async def _ask_llm(self, prompt: str) -> str:
        """Interroge le LLM."""
        if self.llm_provider == "openai":
            response = self.llm_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.creative_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.9,
                max_tokens=500
            )
            return response.choices[0].message.content
            
        elif self.llm_provider == "anthropic":
            response = self.llm_client.messages.create(
                model=self.model,
                max_tokens=500,
                temperature=0.9,
                system=self.creative_prompt,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            return response.content[0].text
            
    async def decide_next_actions(self, max_actions: int = 10) -> list:
        """
        Demande au LLM de décider des prochaines actions.
        
        Returns:
            Liste de tuples (x, y, color)
        """
        cell_desc = self._cell_to_description()
        
        prompt = f"""Tu contrôles un bot qui dessine dans une grille de 20x20 pixels.

État actuel de ta cellule:
{cell_desc}

Historique récent (dernières actions):
{self.draw_history[-20:] if self.draw_history else "Aucune action encore"}

Propose {max_actions} pixels à dessiner pour créer ou continuer un motif intéressant.
Réponds UNIQUEMENT au format JSON suivant (sans markdown):

{{
  "reasoning": "brève explication de ton intention artistique",
  "actions": [
    {{"x": 0, "y": 0, "color": "#FF0000"}},
    {{"x": 1, "y": 1, "color": "#00FF00"}}
  ]
}}

Contraintes:
- x et y doivent être entre 0 et 19
- Les couleurs sont au format hexadécimal (#RRGGBB)
- Sois créatif mais cohérent avec ce qui existe déjà
"""

        try:
            response = await self._ask_llm(prompt)
            
            # Parser la réponse JSON
            # Nettoyer la réponse (enlever markdown si présent)
            response = response.strip()
            if response.startswith("```"):
                lines = response.split("\n")
                response = "\n".join(lines[1:-1])
            if response.startswith("json"):
                response = response[4:].strip()
                
            data = json.loads(response)
            
            print(f"💭 LLM reasoning: {data.get('reasoning', 'N/A')}")
            
            actions = []
            for action in data.get("actions", []):
                x = action.get("x")
                y = action.get("y")
                color = action.get("color")
                
                if x is not None and y is not None and color:
                    if 0 <= x < 20 and 0 <= y < 20:
                        actions.append((x, y, color))
                        
            return actions
            
        except Exception as e:
            print(f"⚠️  Erreur lors de la décision LLM: {e}")
            print(f"Réponse brute: {response if 'response' in locals() else 'N/A'}")
            return []
            
    async def run(self, think_interval: float = 5.0):
        """
        Exécute le bot en boucle.
        
        Args:
            think_interval: Temps entre chaque décision du LLM (secondes)
        """
        iteration = 0
        
        while self.client.is_connected:
            iteration += 1
            print(f"\n🤔 Itération {iteration}: Le LLM réfléchit...")
            
            try:
                actions = await self.decide_next_actions(max_actions=10)
                
                if actions:
                    print(f"✏️  Exécution de {len(actions)} actions...")
                    for x, y, color in actions:
                        await self.client.draw(x, y, color)
                        self.draw_history.append(f"({x},{y})={color}")
                        await asyncio.sleep(0.1)
                    print(f"✅ {len(actions)} pixels dessinés")
                else:
                    print("⚠️  Aucune action valide proposée")
                    
            except Exception as e:
                print(f"❌ Erreur: {e}")
                
            print(f"⏸️  Pause de {think_interval}s...")
            await asyncio.sleep(think_interval)


async def main(
    url: str = "ws://localhost:3001/updates",
    provider: str = "openai",
    model: Optional[str] = None,
    creative_prompt: Optional[str] = None,
    think_interval: float = 5.0
):
    """Fonction principale."""
    
    def on_initial_state(client, message):
        print(f"🤖 LLM Bot connecté: {client.my_user_id}")
        print(f"🧠 Provider: {provider.upper()}")
        print(f"📐 Grille: {client.grid_size}x{client.grid_size}")
        print()
        
    # Créer et connecter le client
    client = PoieticClient(url=url, on_initial_state=on_initial_state)
    await client.connect()
    
    # Attendre l'état initial
    await asyncio.sleep(1)
    
    # Créer le bot LLM
    default_prompt = (
        "Tu es un artiste numérique créatif qui dessine dans une grille de pixels. "
        "Tu cherches à créer des motifs intéressants, des formes reconnaissables, "
        "ou des compositions abstraites harmonieuses. Tu peux créer des dégradés, "
        "des formes géométriques, des patterns, ou laisser libre cours à ton imagination."
    )
    
    bot = LLMBot(
        client=client,
        llm_provider=provider,
        model=model,
        creative_prompt=creative_prompt or default_prompt
    )
    
    try:
        print("🎨 Démarrage de la création artistique...")
        await bot.run(think_interval=think_interval)
        
    except KeyboardInterrupt:
        print("\n🛑 Arrêt du bot...")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bot Poietic contrôlé par un LLM")
    parser.add_argument(
        "--url", 
        default="ws://localhost:3001/updates",
        help="URL du serveur WebSocket"
    )
    parser.add_argument(
        "--provider",
        choices=["openai", "anthropic"],
        default="openai",
        help="Provider LLM à utiliser"
    )
    parser.add_argument(
        "--model",
        help="Modèle spécifique à utiliser (défaut: gpt-4o-mini ou claude-3-5-sonnet)"
    )
    parser.add_argument(
        "--prompt",
        help="Prompt créatif personnalisé pour le LLM"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Intervalle entre chaque décision du LLM (secondes)"
    )
    
    args = parser.parse_args()
    
    print("🤖 Démarrage du LLM Bot...")
    print(f"🔗 Connexion à: {args.url}")
    print(f"🧠 Provider: {args.provider.upper()}")
    if args.model:
        print(f"📝 Modèle: {args.model}")
    print(f"⏱️  Intervalle de réflexion: {args.interval}s")
    print()
    
    # Vérifier les clés API
    if args.provider == "openai":
        if not os.getenv("OPENAI_API_KEY"):
            print("❌ OPENAI_API_KEY non définie dans l'environnement")
            sys.exit(1)
    elif args.provider == "anthropic":
        if not os.getenv("ANTHROPIC_API_KEY"):
            print("❌ ANTHROPIC_API_KEY non définie dans l'environnement")
            sys.exit(1)
    
    asyncio.run(main(
        url=args.url,
        provider=args.provider,
        model=args.model,
        creative_prompt=args.prompt,
        think_interval=args.interval
    ))


