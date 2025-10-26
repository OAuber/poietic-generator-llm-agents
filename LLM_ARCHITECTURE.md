# Architecture des LLM Adaptateurs

## 📁 Organisation des fichiers

### Fichiers dans `poietic-generator-api` (ce repo)

**Pour l'application humaine + agents LLM :**
- `public/js/llm-adapters/` - **Adaptateurs LLM**
  - `gemini-v2.js` - Google Gemini Flash adapter
  - `llava.js` - LLaVA local model adapter
  - `anthropic.js` - Claude adapter
  - `ollama.js` - Ollama adapter
- `public/ai-player.html` - Interface lancement agents (V1)
- `public/ai-player-v2.html` - Interface Gemini/LLaVA (V2)
- `public/js/ai-player.js` - **Logique orchestration des agents**
- `public/gemini-prompts-v2-simple.json` - **Templates prompts Gemini**
- `public/gemini-prompts-v2.json` - Templates prompts alternatifs
- `python/poietic_ai_server.py` - Serveur proxy FastAPI pour LLM

**Ces fichiers sont destinés à :**
- ✅ Permettre aux agents LLM de dessiner dans le Poietic Generator
- ✅ Interface AI player pour lancer des agents
- ✅ Support Gemini, LLaVA, Claude, OpenAI

---

### Fichiers à utiliser dans `poietic-generator-llm-agents` (repo séparé)

**Pour la documentation et les exemples d'agents autonomes :**
- Documentation des adapters
- Exemples d'utilisation des adapters
- Tests et validation
- Utilitaires de monitoring

**Ces fichiers doivent :**
- 📚 Documenter comment utiliser les adapters de `poietic-generator-api`
- 🧪 Fournir des exemples et tests
- 📊 Outils d'analyse et de monitoring

---

## 🔄 Flux de développement

1. **Créer/modifier les adapters** → Dans `poietic-generator-api/public/js/llm-adapters/`
2. **Tester localement** → Via `ai-player-v2.html`
3. **Documenter** → Dans `poietic-generator-llm-agents` (ajouter liens vers api)
4. **Pousser** → `poietic-generator-api` pour les adapters, `poietic-generator-llm-agents` pour la doc

---

## 📝 Convention de nommage

**Files à créer dans `poietic-generator-api` :**
- `public/js/llm-adapters/{nom}-v{X}.js` - Adapters LLM
- `public/js/ai-player.js` - Main logic
- `public/{nom}-prompts-v2.json` - Prompt templates

**Files à documenter dans `poietic-generator-llm-agents` :**
- `docs/adapters/{nom}.md` - Documentation adapter
- `examples/{nom}/` - Exemples d'utilisation
- `tests/{nom}.test.js` - Tests

---

## ⚠️ IMPORTANT

Les adapters LLM doivent rester dans `poietic-generator-api` car :
- Ils sont étroitement liés à l'API Crystal
- Ils utilisent les endpoints WebSocket du serveur
- Ils sont testés avec `ai-player-v2.html`

Le repo `poietic-generator-llm-agents` doit :
- Référencer les adapters de l'API
- Fournir documentation et exemples
- Ne **PAS** dupliquer les adapters

