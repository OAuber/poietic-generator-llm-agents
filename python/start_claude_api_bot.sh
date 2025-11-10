#!/bin/bash

echo "🚀 Démarrage du système Claude API Bot"
echo "======================================"

# Vérifier si l'API est déjà en cours d'exécution
if curl -s http://localhost:8001/api/status > /dev/null 2>&1; then
    echo "⚠️  L'API est déjà en cours d'exécution sur le port 8001"
    echo "🔄 Redémarrage de l'API..."
    pkill -f "api_claude_bridge.py" || true
    sleep 2
fi

# Démarrer l'API en arrière-plan
echo "📡 Démarrage de l'API Claude Bridge..."
python3 api_claude_bridge.py &
API_PID=$!

# Attendre que l'API soit prête
echo "⏳ Attente que l'API soit prête..."
for i in {1..10}; do
    if curl -s http://localhost:8001/api/status > /dev/null 2>&1; then
        echo "✅ API prête!"
        break
    fi
    echo "   Tentative $i/10..."
    sleep 1
done

# Vérifier que l'API fonctionne
if ! curl -s http://localhost:8001/api/status > /dev/null 2>&1; then
    echo "❌ L'API n'a pas démarré correctement"
    exit 1
fi

echo ""
echo "🎯 Instructions d'utilisation:"
echo "1. L'API est disponible sur http://localhost:8001"
echo "2. Documentation sur http://localhost:8001/docs"
echo "3. Le bot va maintenant se connecter et analyser l'environnement"
echo "4. Quand le bot soumet l'état, répondez avec vos instructions JSON"
echo "5. Appuyez sur Ctrl+C pour arrêter"
echo ""

# Démarrer le bot
echo "🤖 Démarrage du bot Claude API..."
python3 examples/claude_api_bot.py --interval 15

# Nettoyage
echo ""
echo "🧹 Arrêt de l'API..."
kill $API_PID 2>/dev/null || true
echo "✅ Système arrêté"
