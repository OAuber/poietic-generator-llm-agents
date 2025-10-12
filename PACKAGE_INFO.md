# 📦 Package Information

**Poietic Generator LLM Agents v1.0.0**

---

## 📁 Package Structure

```
poietic-generator-llm-agents/
├── README.md                   # Main documentation (English)
├── QUICKSTART.md               # 5-minute setup guide
├── INSTALL.md                  # Detailed installation
├── CONTRIBUTING.md             # Contribution guidelines
├── CHANGELOG.md                # Version history
├── LICENSE                     # MIT License
├── .gitignore                  # Git ignore rules
├── env.example                 # Environment config template
│
├── public/                     # Frontend (JavaScript)
│   ├── ai-player.html         # Agent launcher interface
│   └── js/
│       ├── ai-player.js       # Main orchestration
│       ├── spatial-analysis.js # Neighbor detection
│       └── llm-adapters/      # LLM-specific code
│           ├── ollama.js      # Ollama adapter
│           └── anthropic.js   # Claude adapter
│
├── python/                     # Backend (FastAPI proxy)
│   ├── poietic_ai_server.py   # AI proxy server
│   └── requirements.txt       # Python dependencies
│
├── docs/                       # Instruction manuals (French)
│   ├── MANUEL_OLLAMA.md       # Ollama agent instructions
│   ├── MANUEL_ANTHROPIC.md    # Claude agent instructions
│   ├── MANUEL_OPENAI.md       # GPT agent instructions
│   └── MANUEL_PRATIQUE_LLM.md # General LLM guide
│
└── examples/                   # Examples & utilities
    └── launch_agents.sh       # Multi-agent launcher script
```

---

## 📊 Statistics

- **Total Files**: 20
- **Lines of Code**: ~5,000+
  - JavaScript: ~2,500
  - Python: ~800
  - Documentation: ~2,000
- **Languages**: JavaScript, Python, Markdown, Bash
- **Dependencies**: 
  - Python: fastapi, uvicorn, httpx
  - Crystal: Poietic Generator server
  - LLMs: Ollama, Anthropic, OpenAI

---

## 🎯 Key Features

✅ **Multi-LLM Support**: Ollama, Claude, GPT, Mistral  
✅ **Real-time Collaboration**: 8-neighbor detection  
✅ **5 Color Palettes**: Artistic depth & harmony  
✅ **Temporal Continuity**: Agents complete drawings  
✅ **Graceful Fallback**: Robust error handling  
✅ **Progressive Drawing**: Smooth animations  
✅ **Performance Analytics**: Real-time monitoring  

---

## 🔗 Links

- **Main Project**: https://github.com/OAuber/poietic-generator2-documentation
- **This Package**: https://github.com/OAuber/poietic-generator-llm-agents
- **Website**: http://poietic-generator.net/

---

## 📄 License

MIT License - See LICENSE file

---

## 👥 Credits

- **Olivier Auber** - Creator & Maintainer
- **Community Contributors** - Testing & Feedback

---

## 📅 Release Info

- **Version**: 1.0.0
- **Release Date**: 2025-01-12
- **Status**: Stable
- **Tested With**:
  - Ollama llama3.2:3b (local)
  - Ollama llama3.1:8b (local)
  - Anthropic Claude 3 Haiku (cloud)
  - Anthropic Claude 3.5 Sonnet (cloud)
  - OpenAI GPT-4o Mini (cloud)

---

**Built with ❤️ for collective AI creativity** 🎨🤖
