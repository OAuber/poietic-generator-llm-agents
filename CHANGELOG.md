# Changelog

All notable changes to the Poietic Generator LLM Agents project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-12

### 🎉 Initial Release

First public release of the LLM Agents integration for Poietic Generator.

### ✨ Added

#### Core Features
- Multi-LLM support: Anthropic Claude, OpenAI GPT, Ollama (local), Mistral
- Real-time WebSocket communication with Poietic Generator server
- Spatial awareness system (8-neighbor detection)
- Autonomous drawing loop with configurable iteration intervals
- FastAPI proxy server for LLM API calls with CORS support

#### Artistic Features
- 5 color palette techniques:
  - Monochromatic (shadows/highlights)
  - Complementary (contrast)
  - Triadic (balance)
  - Analogous (harmony)
  - Warm→Cold (depth/perspective)
- Temporal continuity: agents remember and continue previous drawings
- Progressive pixel rendering (smooth animation)
- Graceful fallback: automatic shape generation when LLM fails

#### Collaboration Features
- Border pixel prioritization for cell-to-cell collaboration
- Geometric transformations (mirror, translation, rotation)
- Neighbor update tracking (200-pixel memory, ~8-10 iterations)
- Collaborative prompt suggestions with numbered options

#### Developer Tools
- Performance analytics dashboard (`/analytics-dashboard.html`)
- Ollama statistics monitoring (`/ollama-stats.html`)
- Comprehensive browser console logging
- Robust error handling and parsing recovery

### 🔧 Technical Improvements
- Compact text format for Ollama (more reliable than JSON)
- Regex-based pixel parsing with fallback mechanisms
- Cache-busting for JavaScript files
- Deduplication of pixel updates
- Race condition prevention in WebSocket handlers

### 📖 Documentation
- Complete README in English
- French instruction manuals for each LLM provider
- Architecture diagrams (data flow, message formats)
- Usage examples and quick start guide

### 🛠️ Infrastructure
- Python 3.8+ FastAPI server
- Crystal WebSocket integration
- OVHcloud AI Deploy compatibility (Ollama GPU)
- Local and cloud deployment options

---

## [Unreleased]

### 🚀 Planned Features
- [ ] Agent personality presets (minimalist, maximalist, organic, geometric)
- [ ] Multi-agent coordination protocols (swarm behavior)
- [ ] Learning from human feedback (RLHF-style)
- [ ] Export drawings as PNG/SVG
- [ ] Time-lapse recording of agent evolution
- [ ] Agent "memory" across sessions (persistent state)
- [ ] Voice commentary (agents explain their artistic choices via TTS)
- [ ] 3D visualization mode

### 🐛 Known Issues
- Ollama occasionally generates conversational text instead of pixels (fallback active)
- Border collaboration can be too aggressive with certain prompts
- Cache invalidation requires hard refresh on some browsers

---

## Version History

- **1.0.0** (2025-01-12): Initial release
- **0.9.0** (2025-01-10): Beta testing with Ollama llama3.2:3b
- **0.8.0** (2025-01-08): Compact format implementation
- **0.7.0** (2025-01-05): Color palette techniques
- **0.6.0** (2025-01-03): Border collaboration system
- **0.5.0** (2025-01-01): Temporal continuity
- **0.4.0** (2024-12-28): Spatial analysis refactoring
- **0.3.0** (2024-12-25): Multi-LLM adapter architecture
- **0.2.0** (2024-12-20): FastAPI proxy server
- **0.1.0** (2024-12-15): First prototype (Claude only)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Acknowledgments

Special thanks to:
- Early testers who helped refine prompt engineering
- The Poietic Generator community for inspiration
- Anthropic, OpenAI, and Meta for powerful LLM tools
- OVHcloud for GPU infrastructure support

