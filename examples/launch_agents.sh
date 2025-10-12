#!/bin/bash
#
# Quick launch script for Poietic Generator LLM Agents
# Usage: ./launch_agents.sh [num_agents]
#
# Example: ./launch_agents.sh 5  # Launch 5 agents in separate browser tabs
#

set -e

# Configuration
POIETIC_URL="http://localhost:3001"
AI_PLAYER_URL="${POIETIC_URL}/ai-player.html"
NUM_AGENTS=${1:-3}  # Default: 3 agents
BROWSER=${BROWSER:-firefox}  # Default browser

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🤖 Poietic Generator LLM Agents Launcher${NC}"
echo ""

# Check if Poietic Generator is running
echo -e "${YELLOW}[1/3]${NC} Checking Poietic Generator server..."
if curl -s "${POIETIC_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Poietic Generator running on ${POIETIC_URL}"
else
    echo -e "${RED}❌${NC} Poietic Generator NOT running!"
    echo ""
    echo "Please start the server first:"
    echo "  cd ~/projects/poietic-generator2-documentation"
    echo "  ./bin/poietic-generator-api --port=3001"
    exit 1
fi

# Check if AI proxy is running
echo -e "${YELLOW}[2/3]${NC} Checking AI proxy server..."
if curl -s "http://localhost:8003" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} AI proxy running on http://localhost:8003"
else
    echo -e "${RED}❌${NC} AI proxy NOT running!"
    echo ""
    echo "Please start the proxy first:"
    echo "  cd python"
    echo "  source venv/bin/activate"
    echo "  python poietic_ai_server.py"
    exit 1
fi

# Check if Ollama is running (optional, warn only)
echo -e "${YELLOW}[3/3]${NC} Checking Ollama (optional)..."
if curl -s "http://localhost:11434/api/tags" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Ollama running on http://localhost:11434"
else
    echo -e "${YELLOW}⚠️${NC}  Ollama not detected (OK if using cloud LLMs)"
fi

echo ""
echo -e "${GREEN}🚀 Launching ${NUM_AGENTS} agent(s)...${NC}"
echo ""

# Launch agents in browser tabs
for i in $(seq 1 $NUM_AGENTS); do
    echo "  Agent $i: Opening ${AI_PLAYER_URL}"
    
    if command -v $BROWSER > /dev/null 2>&1; then
        $BROWSER --new-tab "${AI_PLAYER_URL}" > /dev/null 2>&1 &
    elif command -v xdg-open > /dev/null 2>&1; then
        xdg-open "${AI_PLAYER_URL}" > /dev/null 2>&1 &
    elif command -v open > /dev/null 2>&1; then
        # macOS
        open "${AI_PLAYER_URL}"
    else
        echo -e "${RED}❌${NC} No browser found! Please open manually:"
        echo "     ${AI_PLAYER_URL}"
    fi
    
    # Small delay between launches
    sleep 0.5
done

echo ""
echo -e "${GREEN}✅ Done!${NC}"
echo ""
echo "📖 Next steps:"
echo "  1. In each browser tab, select LLM (e.g., Ollama)"
echo "  2. Click 'Start' to begin drawing"
echo "  3. View collective drawing: ${POIETIC_URL}"
echo ""
echo "📊 Monitoring:"
echo "  - Analytics: http://localhost:8003/analytics-dashboard.html"
echo "  - Ollama Stats: http://localhost:8003/ollama-stats.html"
echo ""
echo "🛑 To stop: Close browser tabs, then press Ctrl+C in server terminals"

