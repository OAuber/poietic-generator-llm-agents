# 🤖 Poietic Generator - LLM Agents

**AI-powered autonomous drawing agents for the Poietic Generator**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Crystal](https://img.shields.io/badge/Crystal-1.x-blue.svg)](https://crystal-lang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Python](https://img.shields.io/badge/Python-3.8+-green.svg)](https://www.python.org/)

> **Part of the [Poietic Generator](https://github.com/OAuber/poietic-generator2-documentation) ecosystem** - A collaborative real-time drawing experiment since 1986.

---

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Supported LLM Providers](#supported-llm-providers)
- [How It Works](#how-it-works)
- [Advanced Features](#advanced-features)
- [Documentation](#documentation)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)

---

## 🎯 Overview

This package provides **autonomous AI agents** that can participate in the [Poietic Generator](https://github.com/OAuber/poietic-generator2-documentation) collaborative drawing experience. Each agent controls a 20×20 pixel cell and draws in real-time, creating emergent collective artworks.

### What is Poietic Generator?

The Poietic Generator is a pioneering collaborative drawing system where multiple participants draw simultaneously on a shared grid. Each user sees their own 20×20 cell plus their neighbors' cells, creating a large evolving mosaic. **This package extends this concept to AI agents**, enabling human-AI co-creation.

### Why LLM Agents?

- 🎨 **Creative autonomy**: Agents make artistic decisions based on spatial context
- 🤝 **Collaboration**: Agents detect and interact with neighboring cells (human or AI)
- 🧠 **Emergent behavior**: Complex patterns emerge from simple local rules
- 🔬 **Experimentation**: Study AI creativity, cooperation, and collective intelligence

---

## ✨ Features

### Core Capabilities

- ✅ **Multi-LLM Support**: Google Gemini Flash, LLaVA 7B (vision models), Anthropic Claude, OpenAI GPT, Ollama (local), Mistral
- ✅ **Vision Capabilities**: Gemini and LLaVA can "see" the canvas and respond to visual patterns
- ✅ **Real-time Drawing**: WebSocket-based live updates (20-35 pixels per iteration)
- ✅ **Spatial Awareness**: Agents analyze their 8 neighbors (N, S, E, W, NE, NW, SE, SW)
- ✅ **Collaborative Strategies**: Mirror, translation, rotation of neighbor patterns
- ✅ **Creative Diversity**: Forms, colors, depth effects without repetitive diagonals/X patterns
- ✅ **Temporal Continuity**: Agents remember and continue their previous drawings
- ✅ **Graceful Fallback**: Automatic recovery when LLM output fails

### Advanced Features

- 🎨 **Depth & Shadows**: Color gradients for 3D effects
- 🔄 **Progressive Drawing**: Pixels sent gradually over iteration interval (smooth animation)
- 📊 **Performance Analytics**: Real-time monitoring (tokens/sec, response times)
- 🛡️ **Robust Parsing**: Handles malformed LLM outputs with compact text format
- 🌈 **Palette Techniques**: Contrast, harmony, atmospheric perspective
- 🧩 **Border Prioritization**: Enhanced collaboration at cell boundaries

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Poietic Generator                           │
│                  (Crystal WebSocket Server)                     │
│                        Port 3001                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
       ┌────────▼────────┐       ┌───────▼────────┐
       │  Human Browser  │       │   AI Agent     │
       │   (Viewer)      │       │  (ai-player)   │
       └─────────────────┘       └────────┬───────┘
                                           │
                                  ┌────────▼────────┐
                                  │  AI Proxy Server│
                                  │   (FastAPI)     │
                                  │   Port 8003     │
                                  └────────┬────────┘
                                           │
                         ┌─────────────────┼─────────────────┐
                         │                 │                 │
                    ┌────▼─────┐   ┌──────▼──────┐   ┌──────▼──────┐
                    │ Anthropic│   │   OpenAI    │   │   Ollama    │
                    │  Claude  │   │     GPT     │   │   (Local)   │
                    └──────────┘   └─────────────┘   └─────────────┘
```

### Components

**⚠️ IMPORTANT**: The LLM adapters and AI player logic are located in the **[poietic-generator-api](https://github.com/OAuber/poietic-generator-api)** repository:

1. **`public/js/llm-adapters/`** ← Located in `poietic-generator-api`
   - `gemini-v2.js` - Google Gemini Flash adapter
   - `llava.js` - LLaVA local model adapter  
   - `anthropic.js` - Claude adapter
   - `ollama.js` - Ollama adapter
2. **`public/js/ai-player.js`** ← Located in `poietic-generator-api`
   - Agent orchestration, WebSocket client, iteration loop
3. **`public/js/spatial-analysis.js`** ← Located in `poietic-generator-api`
   - Neighbor detection and spatial context generation
4. **`public/ai-player.html`** ← Located in `poietic-generator-api`
   - Web interface for launching AI agents (V1)
5. **`public/ai-player-v2.html`** ← Located in `poietic-generator-api`
   - Gemini/LLaVA player interface (V2)
6. **`python/poietic_ai_server.py`** ← Located in `poietic-generator-api`
   - FastAPI proxy for LLM APIs (CORS, analytics, Ollama)
7. **`docs/MANUEL_*.md`** ← Located in `poietic-generator-llm-agents` (this repo)
   - Instruction manuals for each LLM (in French, used as system prompts)

### Why This Structure?

**poietic-generator-api** contains the **production code** (adapters, player, server) because:
- These files are tightly coupled to the Poietic Generator Crystal server
- They use WebSocket endpoints and Crystal infrastructure
- They are tested with the main application (`ai-player-v2.html`)

**poietic-generator-llm-agents** (this repo) contains **documentation** and **examples** because:
- Focuses on explaining how to use the adapters
- Provides testing utilities and examples
- Avoids code duplication

📖 **For the actual adapters and implementation, see: [github.com/OAuber/poietic-generator-api](https://github.com/OAuber/poietic-generator-api)**

---

## 🚀 Quick Start

### Prerequisites

- **Poietic Generator server** running (Crystal): [Installation guide](https://github.com/OAuber/poietic-generator2-documentation)
- **Python 3.8+** (for AI proxy server)
- **Node.js / Web browser** (for AI agent client)
- **API keys** for external LLMs (Anthropic, OpenAI) OR **Ollama** for local inference

### 1. Start the Poietic Generator Server

```bash
cd poietic-generator-api
./bin/poietic-generator-api --port=3001
```

### 2. Start the AI Proxy Server

```bash
cd python
pip install -r requirements.txt
python poietic_ai_server.py
# Server running on http://localhost:8003
```

### 3. Launch AI Agents

Open `http://localhost:3001/ai-player-v2.html` in your browser:

**Available LLMs**:
1. **Google Gemini Flash** (Recommended) - Fast, high-quality vision model
2. **LLaVA 7B** - Local vision model (requires Ollama with LLaVA installed)
3. **Anthropic Claude** - Requires API key
4. **OpenAI GPT** - Requires API key

**To launch**:
1. **Select LLM**: Choose from dropdown (Gemini recommended for best results)
2. **Enter API Key** (if using Gemini/Claude/OpenAI): Click "Configure API Key"
3. **Configure**: Set iteration interval (default: 20s for Gemini)
4. **Start**: Click "Start" → Agent connects and begins drawing

### 4. View the Collective Drawing

Open `http://localhost:3001` in another browser tab to see humans and AI agents drawing together in real-time!

---

## 📦 Installation

### Clone the Repository

```bash
git clone https://github.com/OAuber/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents
```

### Python Dependencies

```bash
cd python
pip install -r requirements.txt
```

**Required packages**:
- `fastapi` (web framework)
- `uvicorn` (ASGI server)
- `httpx` (async HTTP client for Ollama)

### Ollama (Optional, for Local Inference)

Install Ollama: [https://ollama.ai/](https://ollama.ai/)

```bash
# Pull the recommended model
ollama pull llama3.2:3b

# Or deploy on OVHcloud AI Deploy (GPU)
# See: https://www.ovhcloud.com/en/public-cloud/ai-deploy/
```

### API Keys (Optional, for Cloud LLMs)

- **Anthropic**: [Get API key](https://console.anthropic.com/)
- **OpenAI**: [Get API key](https://platform.openai.com/api-keys)

Store keys securely (`.env` file, environment variables, or enter directly in UI).

---

## ⚙️ Configuration

### AI Proxy Server

Edit `python/poietic_ai_server.py`:

```python
# Ollama endpoint (local or remote)
OLLAMA_URL = "http://localhost:11434"  # Local
# OLLAMA_URL = "https://your-ollama-instance.app.cloud.ovh.net"  # OVHcloud

# CORS origins (allow AI agent frontend)
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8080",
]
```

### Agent Behavior

Edit `public/js/llm-adapters/ollama.js` (or `anthropic.js`):

```javascript
// Number of pixels per iteration
maxTokens: 1000  // ~20-25 pixels for Ollama

// Ollama model
model: "llama3.2:3b"  // Lightweight, fast
// model: "llama3.1:8b"  // Better quality, slower

// Generation parameters
temperature: 0.7        // Creativity
repeat_penalty: 0.9     // Allow repetition for patterns
```

### Instruction Manuals

Edit `docs/MANUEL_OLLAMA.md` to customize agent behavior:

```markdown
## Section 4: FORMES À DESSINER

Tu peux dessiner :
- Geometric: circles, triangles, rectangles, spirals
- Letters/Symbols: A-Z, *, +, -, arrows
- Patterns: checkerboard, gradients, waves
- Organic: flowers, trees, fractals
```

---

## 📚 Usage

### Basic Agent Launch

```bash
# 1. Start Poietic Generator
cd poietic-generator-api
./bin/poietic-generator-api --port=3001

# 2. Start AI proxy
cd python
python poietic_ai_server.py

# 3. Open browser
firefox http://localhost:3001/ai-player-v2.html
```

### Advanced: Multiple Agents

Open **multiple tabs** of `ai-player-v2.html` to launch several agents simultaneously. Each agent gets a unique cell and can collaborate with neighbors!

### Custom Prompts

Use the **"Custom Prompt"** field to guide agent behavior:

- `"Draw only geometric shapes"`
- `"Use warm colors (red, orange, yellow)"`
- `"Create a gradient from top to bottom"`
- `"Collaborate with neighbors by extending their patterns"`

### Monitoring

- **Agent Console**: View logs in browser DevTools (F12)
- **Analytics Dashboard**: `http://localhost:8003/analytics-dashboard.html`
- **Ollama Stats**: `http://localhost:8003/ollama-stats.html`

---

## 🤖 Supported LLM Providers

| Provider | Model | Cost | Speed | Quality | Vision | Local |
|----------|-------|------|-------|---------|--------|-------|
| **Google Gemini** | `gemini-2.5-flash` | Free tier* | ⚡⚡⚡ Fast | ⭐⭐⭐⭐⭐ Excellent | ✅ Yes | ❌ Cloud |
| **LLaVA** | `llava:7b` | Free | ⚡⚡ Medium | ⭐⭐⭐⭐ Very Good | ✅ Yes | ✅ Yes |
| **Anthropic** | `claude-3-haiku` | $0.25/M tokens | ⚡⚡⚡ Fast | ⭐⭐⭐⭐ Very Good | ❌ No | ❌ Cloud |
| **Anthropic** | `claude-3.5-sonnet` | $3/M tokens | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | ❌ No | ❌ Cloud |
| **OpenAI** | `gpt-4o-mini` | $0.15/M tokens | ⚡⚡⚡ Fast | ⭐⭐⭐⭐ Very Good | ❌ No | ❌ Cloud |
| **Ollama** | `llama3.2:3b` | Free | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | ❌ No | ✅ Yes |
| **Ollama** | `llama3.1:8b` | Free | ⚡⚡ Medium | ⭐⭐⭐⭐ Very Good | ❌ No | ✅ Yes |

**Recommendations**:
- 🥇 **Google Gemini Flash** (Recommended) - Best vision quality, fast, free tier
- 🥈 **LLaVA 7B** - Local vision model, free, good quality
- 🥉 **Ollama llama3.1:8b** - Free text-only model, best local option

\* Gemini free tier: 15 requests per minute. See [Gemini API pricing](https://ai.google.dev/pricing).

---

## 🧠 How It Works

### Agent Loop

```
1. Connect to Poietic Generator WebSocket
2. Receive initial state (my cell + neighbors)
3. LOOP every N seconds:
   a. Analyze spatial context (8 neighbors)
   b. Build prompt with:
      - My last strategy (continuity)
      - Neighbor updates (collaboration)
      - Color palette (artistic technique)
      - Custom user prompt
   c. Send prompt to LLM
   d. Parse response (strategy + pixels)
   e. Send pixels progressively to server
   f. Update neighbors' tracking
4. Repeat until stopped
```

### Spatial Analysis

Each agent sees:
- **8 neighbors** (N, S, E, W, NE, NW, SE, SW)
- **Recent updates** (last 200 pixels per neighbor, ~8-10 iterations)
- **Border pixels** (prioritized for collaboration)

Example prompt section:
```
Neighbors:
E (right, x=19) 🔗BORDER(3): 2,7:#E91E63 2,6:#1ABC9C 2,5:#1ABC9C
N (top, y=0) 🔗BORDER(12): 5,17:#964B00 7,17:#964B00 ...

Collaboration ideas (choose ONE or draw freely):
[1] 🔗 Mirror neighbor E: 19,7:#E91E63 19,6:#1ABC9C 19,5:#1ABC9C
[2] 🔗 Extend neighbor N: 5,0:#964B00 7,0:#964B00 9,0:#964B00
```

### Compact Format

To minimize parsing errors, Ollama uses a **compact text format** instead of JSON:

```
strategy: yellow star with shadows
pixels: 10,5:#F1C40F 11,5:#F39C12 10,6:#D68910 11,6:#E67E22 ...
```

**Benefits**:
- ✅ Simpler for LLMs to generate
- ✅ Robust regex parsing
- ✅ Graceful fallback (generates random shapes if parsing fails)

### Color Palettes

5 artistic techniques for depth and harmony:

1. **Monochromatique** (Monochromatic): 8 shades of one color (dark shadows → light highlights)
2. **Complémentaires** (Complementary): 2 opposite colors (strong contrast)
3. **Triade** (Triadic): 3 evenly-spaced colors (balanced harmony)
4. **Analogues** (Analogous): Adjacent colors (smooth transitions)
5. **Chaud→Froid** (Warm→Cold): Red/orange → blue/violet (atmospheric perspective)

Example:
```
Colors (Monochromatic): #3A2A1F #5C4A3F #7D6A5F #9D8A7F #BDA9A0 #DCC9C0 #F5E9E0 #FFF9F5
Use: dark for shadows/depth, light for highlights/foreground.
```

---

## 🎨 Advanced Features

### Temporal Continuity

Agents remember their previous strategy and are encouraged to complete drawings:

```
Last iteration: "yellow star with shadows". CONTINUE it OR start new.
```

**Result**: Agents finish stars, letters, patterns instead of changing theme every iteration!

### Border Collaboration

Agents prioritize pixels at common borders (x=0, x=19, y=0, y=19):

```python
# Filter neighbor updates for border pixels
if direction == 'E':  # East neighbor
    border_pixels = updates.filter(u => u.x <= 2)  # Their left border
    # Transform to my right border (x=19)
```

**Result**: Seamless connections between cells (mirrored patterns, extended lines).

### Progressive Drawing

Pixels are sent one-by-one over 80% of the iteration interval:

```javascript
const delayBetweenPixels = (targetInterval * 0.8) / pixels.length;
for (const pixel of pixels) {
    sendPixel(pixel);
    await sleep(delayBetweenPixels);
}
```

**Result**: Smooth animation instead of sudden "flashes" every iteration.

### Geometric Transformations

When neighbors draw at borders, agents receive transformation suggestions:

- **Mirror** (horizontal/vertical)
- **Translation** (shift pattern)
- **Rotation** (90°)

Example:
```
[1] 🔗 Mirror neighbor W: 0,5:#E74C3C 1,5:#C85A3F 2,5:#AF7AC5
[2] 🔗 Translate neighbor N: 5,0:#964B00 7,0:#964B00 9,0:#964B00
```

---

## 📖 Documentation

- **`docs/MANUEL_GEMINI.md`**: Instructions for Gemini Flash agents (French, JSON format)
- **`docs/MANUEL_OLLAMA.md`**: Instructions for Ollama agents (French, text format)
- **`docs/MANUEL_ANTHROPIC.md`**: Instructions for Claude agents (French, JSON format)
- **`docs/MANUEL_OPENAI.md`**: Instructions for GPT agents (French, JSON format)
- **`docs/ARCHITECTURE.md`**: Technical architecture (coming soon)
- **`docs/API.md`**: API reference (coming soon)

### Architecture Diagrams

See `docs/ARCHITECTURE_FORMATS_DONNEES.md` for:
- Data flow between components
- JSON vs compact format usage
- WebSocket message protocol

---

## 💡 Examples

### Example 1: Monochromatique Agent

```javascript
// Agent receives palette
Colors (Monochromatic): #3A2A1F #5C4A3F #7D6A5F #9D8A7F #BDA9A0 #DCC9C0
Use: dark for shadows/depth, light for highlights/foreground.

// Agent draws a sphere with shadows
strategy: sphere with shadows
pixels: 10,10:#3A2A1F 11,10:#5C4A3F 10,11:#7D6A5F 11,11:#9D8A7F ...
```

**Visual**: 🌑 A shaded ball (dark left/bottom, light right/top)

### Example 2: Collaborative Border Extension

```javascript
// Agent sees neighbor E drawing at border
E (right, x=19) 🔗BORDER(3): 2,7:#E91E63 2,6:#1ABC9C 2,5:#1ABC9C

// Collaboration suggestion
[1] 🔗 Mirror neighbor E: 19,7:#E91E63 19,6:#1ABC9C 19,5:#1ABC9C

// Agent chooses to collaborate
strategy: mirror [1]
pixels: 19,7:#E91E63 19,6:#1ABC9C 19,5:#1ABC9C 18,7:#C85A3F ...
```

**Visual**: Seamless color continuity across cell boundary!

### Example 3: Temporal Continuity

```javascript
// Iteration 1
strategy: yellow star
pixels: 10,8:#F1C40F 11,8:#F39C12 9,9:#E67E22 ...

// Iteration 2 (agent remembers)
Last iteration: "yellow star". CONTINUE it OR start new.
strategy: continue yellow star with highlights
pixels: 10,7:#F9E79F 11,7:#F8C471 9,10:#CA6F1E ...

// Result: A complete, finished star instead of abandoned fragments!
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-improvement`
3. **Commit** your changes: `git commit -m 'Add amazing improvement'`
4. **Push** to the branch: `git push origin feature/amazing-improvement`
5. **Open** a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents

# Install dependencies
cd python && pip install -r requirements.txt

# Run tests (coming soon)
# pytest tests/
```

### Code Style

- **JavaScript**: ES6+, 4-space indentation
- **Python**: PEP 8, Black formatter
- **Documentation**: English (code comments can be French)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

### Original Concept

- **Olivier Auber** - Creator of the Poietic Generator (1986-2025)
- [http://poietic-generator.net/](http://poietic-generator.net/)

### LLM Integration

- **Olivier Auber** - Design & prompt engineering
- **Community contributors** - Testing, feedback, improvements

### Related Projects

- [Poietic Generator (Crystal/Crystal)](https://github.com/OAuber/poietic-generator2-documentation) - Main server
- [Poietic Generator History](http://poietic-generator.net/) - Historical documentation

### Acknowledgments

- Anthropic, OpenAI, Meta (Llama) - LLM providers
- OVHcloud - GPU infrastructure for Ollama deployment
- Crystal community - WebSocket server framework
- FastAPI community - Python proxy server

---

## 🔗 Links

- **Main Project**: [Poietic Generator](https://github.com/OAuber/poietic-generator2-documentation)
- **Live Demo**: [http://poietic-generator.net/](http://poietic-generator.net/) *(coming soon)*
- **Documentation**: [https://poietic-generator.github.io/poietic-generator-documentation/](https://poietic-generator.github.io/poietic-generator-documentation/)
- **Report Issues**: [GitHub Issues](https://github.com/OAuber/poietic-generator-llm-agents/issues)

---

**Made with ❤️ for collective AI creativity** 🎨🤖

*"What emerges when (humans and) AI draw together?"*

