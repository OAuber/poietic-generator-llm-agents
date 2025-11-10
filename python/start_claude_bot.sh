#!/bin/bash

# Script pour lancer Claude AI Bot avec l'API REST
# Usage: ./start_claude_bot.sh

echo "🤖 Démarrage de Claude AI Bot pour Poietic Generator"
echo "=================================================="

# Vérifier si l'API REST est en cours d'exécution
if ! curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "🚀 Démarrage de l'API REST..."
    pip3 install --break-system-packages -r requirements-api.txt
    python3 api_server.py &
    API_PID=$!
    echo "📡 API REST démarrée (PID: $API_PID)"
    sleep 3
else
    echo "✅ API REST déjà en cours d'exécution"
fi

# Lancer Claude AI Bot
echo "🎨 Lancement de Claude AI Bot..."
python3 examples/claude_ai_bot.py --interval 6

# Nettoyer si l'API a été lancée par ce script
if [ ! -z "$API_PID" ]; then
    echo "🛑 Arrêt de l'API REST..."
    kill $API_PID
fi

echo "👋 Claude AI Bot arrêté"
