# Poietic Generator - LLaVA AI Agents

## 🎨 **AI-Powered Drawing Agents with Vision**

This project integrates **LLaVA (Large Language and Vision Assistant)** with the Poietic Generator to create autonomous drawing agents that can see, analyze, and collaborate on a shared canvas.

## ✨ **Key Features**

### 🧠 **Multimodal AI**
- **Vision Model**: LLaVA 7B for image analysis and understanding
- **Pattern Recognition**: Specialized prompts for artistic evaluation
- **Memory Externalization**: Visual context from previous iterations

### 🎯 **Smart Drawing**
- **200-800 pixels per iteration** for substantial drawings
- **Connected components** instead of scattered dots
- **Color diversity** with random palette generation
- **Progressive drawing** with smooth animations

### 🔄 **Robust Parsing**
- **Code block detection**: Handles ````pixels: ... ``` ` formats
- **Color correction**: Fixes `##4D28` → `#4D28` automatically
- **Coordinate validation**: Filters invalid coordinates (outside 0-19)
- **Placeholder replacement**: Converts `{{colorX}}` to random hex colors

### 🌐 **Global Canvas Awareness**
- **Position tracking**: Agents know their location in the global grid
- **Neighbor analysis**: Q1-Q6 structured responses
- **Visual annotations**: Gray borders and center markers
- **Collaborative context**: Memory of previous drawings

## 🚀 **Quick Start**

### Prerequisites
- **Ollama** with `llava:7b` model installed
- **Poietic Generator API** server running on port 3001
- **Python AI server** running on port 8003

### Installation
```bash
# Clone the repository
git clone https://github.com/OAuber/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents

# Install Ollama and LLaVA model
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llava:7b

# Start the Poietic Generator API
cd bin && ./poietic-generator-api --port=3001

# Start the Python AI server
cd python && python3 poietic_ai_server.py
```

### Usage
1. Open `public/ai-player.html` in your browser
2. Select "LLaVA" as the model
3. Click "Démarrer" to begin drawing
4. Watch the agent analyze images and create art!

## 🏗️ **Architecture**

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ai-player.js  │────│   llava.js       │────│  Ollama API     │
│   (Main Logic)  │    │   (LLM Adapter)  │    │  (llava:7b)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         │              ┌──────────────────┐
         └──────────────│ llava-canvas.js  │
                        │ (Image Gen.)     │
                        └──────────────────┘
```

### Data Flow

1. **Image Capture**: Local + Global canvas images
2. **Prompt Construction**: Dynamic prompts with random colors
3. **LLM Processing**: LLaVA analyzes images and generates pixels
4. **Response Parsing**: Robust extraction of pixel data
5. **Progressive Drawing**: Smooth pixel-by-pixel rendering

## 📝 **Prompt System**

### Structured Q&A Format
- **Q1**: Image receipt confirmation
- **Q2**: Bot location in global canvas
- **Q3**: Global vision analysis
- **Q4**: Interesting neighbors
- **Q5**: Drawing description/intention
- **Q6**: Technical issues and pixel count

### Dynamic Color Generation
```javascript
// Random colors replace {{colorX}} placeholders
const randomColors = generateRandomColors(8);
// Avoids common colors like blue, red, green
```

### Memory Context
- **Previous iteration image**: What the bot drew
- **Global canvas**: Current state of all bots
- **Color palette**: ASCII representation of bot's grid
- **Last description**: Previous drawing intention

## 🛠️ **Technical Details**

### Parsing Robustness
```javascript
// Handles multiple formats:
// - pixels: x,y#HEX x,y#HEX
// - ```pixels: x,y#HEX ... ```
// - Multi-line pixel outputs
// - Invalid coordinates filtering
// - Color format correction
```

### Error Handling
- **WebSocket disconnections**: Automatic reconnection
- **API timeouts**: 90-second timeout with retry
- **Parsing failures**: Fallback to random shapes
- **Consecutive errors**: Agent stops after 5 errors

### Performance
- **Temperature**: 0.8 for creativity
- **Max tokens**: 4000 for detailed responses
- **Image size**: 20x20 local, 5x5 global grid
- **Response time**: ~30-60 seconds per iteration

## 🎨 **Artistic Features**

### Color Palettes
- **Random generation**: Avoids common colors
- **Diverse combinations**: Encourages creativity
- **No black pixels**: Prevents empty drawings

### Drawing Patterns
- **Connected components**: Forms recognizable shapes
- **Avoids isolation**: Prefers grouped pixels
- **Meaningful forms**: Faces, objects, patterns

### Collaboration
- **Global awareness**: Sees other agents' work
- **Position tracking**: Knows location in grid
- **Neighbor analysis**: Identifies interesting patterns

## 📊 **Monitoring & Debugging**

### Console Logs
```javascript
[LLaVA] 📊 Réponse reçue: 1234 caractères
[LLaVA] 📝 Réponse complète: Q1: Yes, I received both images...
[LLaVA] ✅ 15 pixels parsés
[AI Player] ✅ 15 pixels dessinés | "Description: A blue star"
```

### Image Samples
- **Modal viewer**: Click thumbnails to see full images
- **Debug display**: Shows what LLaVA actually sees
- **Visual verification**: Confirm image quality

## 🔧 **Configuration**

### Model Settings
```javascript
// llava.js
temperature: 0.8,
top_p: 0.9,
repeat_penalty: 1.1,
max_tokens: 4000
```

### Canvas Settings
```javascript
// llava-canvas.js
localSize: 20x20,
globalSize: 5x5 grids,
centerPosition: [0,0],
borderColor: #888888
```

## 🐛 **Troubleshooting**

### Common Issues
1. **"LLaVA not responding"**: Check Ollama server and model
2. **"0 pixels parsed"**: Check response format in console
3. **"Invalid coordinates"**: Parser filters out-of-range coords
4. **"Empty images"**: Verify canvas generation

### Debug Steps
1. Check browser console for error messages
2. Verify Ollama is running: `curl http://localhost:8003/health`
3. Check LLaVA model: `ollama list | grep llava`
4. Monitor network tab for API calls

## 🤝 **Contributing**

### Development
```bash
# Make changes to prompts
vim public/llava-prompts.json

# Update version in HTML
vim public/ai-player.html

# Test changes
# Reload browser with Ctrl+F5
```

### Code Style
- **JavaScript**: ES6+, 4-space indentation
- **JSON**: Valid syntax, no trailing commas
- **Comments**: French for prompts, English for code

## 📄 **License**

MIT License - see LICENSE file for details.

## 🙏 **Credits**

- **Olivier Auber**: Poietic Generator concept (1986-2025)
- **LLaVA Team**: Multimodal vision model
- **Ollama**: Local LLM deployment
- **Community**: Testing and feedback

---

**Made with ❤️ for AI creativity** 🎨🤖

*"What emerges when AI agents draw together with vision?"*
