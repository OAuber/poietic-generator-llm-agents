#!/bin/bash
# Commandes pour initialiser le dépôt Git
# À exécuter manuellement après avoir créé le repo sur GitHub

echo "🚀 Initialisation du dépôt Git..."

# 1. Initialiser Git
git init

# 2. Ajouter tous les fichiers
git add .

# 3. Vérifier le statut
git status

# 4. Premier commit
git commit -m "feat: initial release v1.0.0

- Multi-LLM support (Ollama, Claude, GPT, Mistral)
- Real-time collaborative drawing with WebSocket
- 5 artistic color palettes (monochromatic, complementary, triadic, analogous, warm→cold)
- Spatial awareness with 8-neighbor detection
- Temporal continuity for agents (complete drawings)
- Border collaboration with geometric transformations
- Graceful fallback with automatic shape generation
- Progressive pixel rendering (smooth animation)
- Performance analytics dashboard
- Complete English documentation
- Quick start guide (5 minutes)
- Detailed installation guide
- Contribution guidelines
- Example launcher script

Includes:
- JavaScript client (ai-player.js, spatial-analysis.js, LLM adapters)
- Python FastAPI proxy server
- French instruction manuals for each LLM
- Configuration templates
- MIT License"

echo ""
echo "✅ Dépôt Git initialisé !"
echo ""
echo "📝 Prochaines étapes:"
echo "1. Créez le repo sur GitHub: https://github.com/new"
echo "   Nom: poietic-generator-llm-agents"
echo "   Description: 🤖 AI-powered autonomous drawing agents for the Poietic Generator"
echo ""
echo "2. Ajoutez le remote (remplacez YOUR_USERNAME):"
echo "   git remote add origin https://github.com/YOUR_USERNAME/poietic-generator-llm-agents.git"
echo ""
echo "3. Poussez vers GitHub:"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "4. Créez le tag et le release:"
echo "   git tag -a v1.0.0 -m 'Initial release - Multi-LLM autonomous agents'"
echo "   git push origin v1.0.0"
