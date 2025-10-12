# ⚡ Quick Start Guide

Get your first AI agent drawing in **5 minutes**!

---

## 🎯 Goal

Launch an AI agent that autonomously draws on the Poietic Generator grid.

---

## 📦 What You Need

- **Poietic Generator server** (Crystal)
- **This package** (Python + JavaScript)
- **Ollama** (local LLM - free!)

---

## 🚀 Step-by-Step

### 1. Install Ollama (2 minutes)

```bash
# Install
curl -fsSL https://ollama.ai/install.sh | sh

# Pull model (3GB download)
ollama pull llama3.2:3b

# Verify
ollama list
# Should show: llama3.2:3b
```

---

### 2. Start Poietic Generator (1 minute)

```bash
# Clone & build (if not done already)
cd ~/projects
git clone https://github.com/OAuber/poietic-generator2-documentation.git
cd poietic-generator2-documentation
shards install && shards build

# Run server
./bin/poietic-generator-api --port=3001 &

# Verify
curl http://localhost:3001
# Should return HTML
```

---

### 3. Start AI Proxy (1 minute)

```bash
# Clone this repo (if not done already)
cd ~/projects
git clone https://github.com/OAuber/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents/python

# Install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run proxy
python poietic_ai_server.py &

# Verify
curl http://localhost:8003
# Should return JSON status
```

---

### 4. Launch Agent! (1 minute)

```bash
# Open browser
firefox http://localhost:3001/ai-player.html
```

**In the browser**:
1. Select: **"🦙 Ollama Llama3.2 3B (Free, Local)"**
2. Leave API Key **empty**
3. Click **"Start"**

**Expected output in console (F12)**:
```
✅ Connected to Poietic Generator
🎨 [Palette] Technique: "Monochromatic (ombres/lumières)" - ...
✅ 23 pixels dessinés | "yellow circle"
```

---

### 5. View the Drawing!

Open **another tab**:
```
http://localhost:3001
```

You should see:
- **Grid with cells** (20×20 each)
- **Your agent's cell** drawing autonomously
- **Real-time updates** every ~20 seconds

---

## 🎨 What's Next?

### Launch More Agents

Open **5 tabs** of `ai-player.html` → Start each → Watch collaboration!

### Try Custom Prompts

In the "Custom Prompt" field:
```
Draw only geometric shapes with warm colors
```

### Monitor Performance

- **Analytics**: `http://localhost:8003/analytics-dashboard.html`
- **Ollama Stats**: `http://localhost:8003/ollama-stats.html`

---

## 🐛 Troubleshooting

### "Cannot connect to WebSocket"

```bash
# Check server is running
curl http://localhost:3001
```

### "Ollama timeout"

```bash
# Check Ollama is running
ollama list

# Restart if needed
sudo systemctl restart ollama  # Linux
# or
ollama serve  # Manual start
```

### "Agent not drawing"

```bash
# Check all services
curl http://localhost:3001  # Poietic Generator
curl http://localhost:8003  # AI Proxy
curl http://localhost:11434/api/tags  # Ollama

# Check browser console (F12)
```

---

## 📚 Full Documentation

- **Complete Guide**: See [README.md](README.md)
- **Installation**: See [INSTALL.md](INSTALL.md)
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 🎉 Success!

If you see your agent drawing, **congratulations**! 🤖🎨

You're now part of the AI collective drawing experiment!

---

**Next**: Launch multiple agents and watch emergent patterns form! 🌀

