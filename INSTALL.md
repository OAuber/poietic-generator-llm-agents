# Installation Guide

Complete step-by-step installation guide for Poietic Generator LLM Agents.

---

## 📋 Prerequisites

### System Requirements

- **OS**: Linux, macOS, or Windows (WSL2 recommended)
- **RAM**: 4GB minimum (8GB+ recommended for Ollama)
- **Storage**: 5GB free space (for Ollama models)
- **Network**: Internet connection (for cloud LLMs or Ollama model downloads)

### Required Software

1. **Git**: Version control
   ```bash
   # Ubuntu/Debian
   sudo apt install git
   
   # macOS
   brew install git
   
   # Windows: https://git-scm.com/download/win
   ```

2. **Python 3.8+**: AI proxy server
   ```bash
   python3 --version  # Should be 3.8 or higher
   
   # Ubuntu/Debian
   sudo apt install python3 python3-pip python3-venv
   
   # macOS
   brew install python3
   ```

3. **Crystal**: Poietic Generator server
   - Follow: https://crystal-lang.org/install/
   
   ```bash
   # Ubuntu/Debian (example)
   curl -fsSL https://crystal-lang.org/install.sh | sudo bash
   
   # macOS
   brew install crystal
   ```

4. **Ollama** (Optional, for local LLM):
   - Download: https://ollama.ai/
   
   ```bash
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # macOS
   brew install ollama
   
   # Or use OVHcloud AI Deploy (GPU)
   ```

---

## 🚀 Installation Steps

### Step 1: Install Poietic Generator Server

```bash
# 1. Clone the main repository
cd ~/projects  # or your preferred directory
git clone https://github.com/OAuber/poietic-generator2-documentation.git
cd poietic-generator2-documentation

# 2. Install Crystal dependencies
shards install

# 3. Compile the server
shards build

# 4. Test the server
./bin/poietic-generator-api --port=3001 &

# 5. Verify it's running
curl http://localhost:3001
# Should return HTML page
```

**Troubleshooting**:
- If `shards install` fails: Check Crystal version (`crystal --version`)
- If port 3001 is busy: Use `--port=3002` and update AI agent config later

---

### Step 2: Install LLM Agents Package

```bash
# 1. Clone this repository
cd ~/projects
git clone https://github.com/OAuber/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents

# 2. Create Python virtual environment
cd python
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Verify installation
python -c "import fastapi, httpx; print('✅ Dependencies OK')"
```

**Troubleshooting**:
- If `pip install` fails: Try `pip3` instead of `pip`
- If `httpx` import fails: Run `pip install httpx --upgrade`

---

### Step 3: Setup Ollama (Local LLM)

**Option A: Local Installation**

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Pull the model (3GB download)
ollama pull llama3.2:3b

# 3. Test Ollama
ollama run llama3.2:3b "Draw a star"
# Should generate text response

# 4. Verify API endpoint
curl http://localhost:11434/api/tags
# Should return JSON with model list
```

**Option B: OVHcloud AI Deploy (GPU)**

See: https://docs.ovh.com/gb/en/ai-deploy/

```bash
# 1. Create OVHcloud account
# 2. Deploy Ollama image
# 3. Note your endpoint URL
# 4. Update python/poietic_ai_server.py:
#    OLLAMA_URL = "https://your-instance.app.cloud.ovh.net"
```

**Troubleshooting**:
- If `ollama: command not found`: Restart terminal or run `export PATH=$PATH:/usr/local/bin`
- If model download fails: Check storage space (`df -h`)

---

### Step 4: Get API Keys (Cloud LLMs)

**Skip this if you only want to use Ollama!**

#### Anthropic Claude

1. Go to: https://console.anthropic.com/
2. Sign up / Log in
3. Navigate to: **Settings → API Keys**
4. Create new key → Copy it
5. Save to `.env` file (see Step 5)

**Pricing**: ~$0.25 per 1M tokens (Haiku), ~$3 per 1M tokens (Sonnet)

#### OpenAI GPT

1. Go to: https://platform.openai.com/api-keys
2. Sign up / Log in
3. Create new key → Copy it
4. Save to `.env` file

**Pricing**: ~$0.15 per 1M tokens (GPT-4o Mini)

---

### Step 5: Configure Environment

```bash
# 1. Create .env file
cd ~/projects/poietic-generator-llm-agents
cat > .env << EOF
# Ollama endpoint (local or remote)
OLLAMA_URL=http://localhost:11434

# API keys (optional, only if using cloud LLMs)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Server settings
AI_PROXY_PORT=8003
POIETIC_SERVER_URL=http://localhost:3001
EOF

# 2. Verify .env is in .gitignore (never commit API keys!)
grep ".env" .gitignore
```

---

### Step 6: Start All Services

**Terminal 1: Poietic Generator Server**

```bash
cd ~/projects/poietic-generator2-documentation
./bin/poietic-generator-api --port=3001
```

**Terminal 2: AI Proxy Server**

```bash
cd ~/projects/poietic-generator-llm-agents/python
source venv/bin/activate
python poietic_ai_server.py
```

**Terminal 3: Ollama (if local)**

```bash
# Usually runs as background service, but you can start it manually:
ollama serve
```

**Expected output**:
```
Terminal 1:
[Poietic] Server started on http://0.0.0.0:3001

Terminal 2:
INFO:     Started server process [12345]
INFO:     Uvicorn running on http://0.0.0.0:8003

Terminal 3:
Ollama running on http://localhost:11434
```

---

### Step 7: Launch Your First Agent! 🎉

```bash
# Open browser
firefox http://localhost:3001/ai-player.html

# Or Chrome
google-chrome http://localhost:3001/ai-player.html
```

**In the browser**:

1. **Select LLM**: Choose "🦙 Ollama Llama3.2 3B (Free, Local)"
2. **API Key**: Leave empty (not needed for Ollama)
3. **Delay**: Leave at 0 (immediate iteration)
4. **Custom Prompt** (optional): Try "Draw geometric shapes"
5. **Click "Start"**

**Expected behavior**:
- Console logs: `✅ Connected to Poietic Generator`
- Agent starts drawing (~20-25 pixels per iteration)
- Console shows: `🎨 [Palette] Technique: "Monochromatic" - ...`
- Console shows: `✅ 23 pixels drawn | "yellow circle"`

**View the drawing**:
- Open **another browser tab**: `http://localhost:3001`
- You should see the agent's cell on the grid!

---

## 🎨 Next Steps

### Launch Multiple Agents

Open **5 tabs** of `http://localhost:3001/ai-player.html` → Start each one → Watch them collaborate!

### Try Different LLMs

1. **Anthropic Claude** (if you have API key):
   - Select "Claude 3 Haiku"
   - Enter API key
   - Start

2. **OpenAI GPT** (if you have API key):
   - Select "GPT-4o Mini"
   - Enter API key
   - Start

### Experiment with Prompts

Try these custom prompts:

- `"Draw only circles and spirals"`
- `"Use warm colors (red, orange, yellow)"`
- `"Create a gradient from dark to light"`
- `"Mirror your neighbors' patterns"`

### Monitor Performance

- **Analytics**: `http://localhost:8003/analytics-dashboard.html`
- **Ollama Stats**: `http://localhost:8003/ollama-stats.html`
- **Browser Console**: F12 → Console tab

---

## 🔧 Troubleshooting

### "Cannot connect to WebSocket"

**Symptoms**: `WebSocket connection failed` in console

**Solutions**:
1. Check Poietic Generator server is running: `curl http://localhost:3001`
2. Check firewall isn't blocking port 3001
3. Try a different browser (Chrome, Firefox)

---

### "Agent not drawing"

**Symptoms**: `✅ Connected` but no pixels sent

**Solutions**:
1. Check AI proxy server is running: `curl http://localhost:8003`
2. Check Ollama is running: `ollama list`
3. Check browser console for errors (F12)
4. Look for `❌ Erreur:` messages in agent logs

---

### "Ollama timeout"

**Symptoms**: `HTTP 504: Ollama timeout`

**Solutions**:
1. Increase timeout in `python/poietic_ai_server.py`:
   ```python
   httpx.AsyncClient(timeout=300.0)  # 5 minutes
   ```
2. Use a smaller model: `ollama pull llama3.2:1b`
3. Reduce pixels per iteration: Edit `ollama.js` → `maxTokens: 500`

---

### "JSON parsing errors"

**Symptoms**: `❌ Erreur: Format compact invalide`

**Solutions**:
- This is **expected** occasionally for Ollama
- Agent will use fallback shapes (circle, cross, square)
- To reduce frequency:
  1. Simplify `docs/MANUEL_OLLAMA.md`
  2. Lower `temperature` in `ollama.js`

---

### "Import error: fastapi"

**Symptoms**: `ModuleNotFoundError: No module named 'fastapi'`

**Solutions**:
1. Activate virtual environment: `source venv/bin/activate`
2. Reinstall: `pip install -r requirements.txt`
3. Check Python version: `python --version` (must be 3.8+)

---

## 📚 Additional Resources

- **Documentation**: See `docs/` folder
- **Examples**: See `examples/` folder
- **FAQ**: See [README.md](README.md#faq)
- **Support**: [GitHub Issues](https://github.com/OAuber/poietic-generator-llm-agents/issues)

---

## ✅ Verification Checklist

Before reporting an issue, verify:

- [ ] Poietic Generator server running (`http://localhost:3001`)
- [ ] AI proxy server running (`http://localhost:8003`)
- [ ] Ollama running (`ollama list` shows `llama3.2:3b`)
- [ ] Browser console shows no errors (F12)
- [ ] Agent logs show `✅ Connected to Poietic Generator`
- [ ] No firewall blocking ports 3001, 8003, 11434

---

**Installation complete! 🎉 Happy collaborative AI drawing!** 🎨🤖

