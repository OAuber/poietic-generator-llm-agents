# Contributing to Poietic Generator LLM Agents

Thank you for your interest in contributing! 🎨🤖

This document provides guidelines for contributing to the project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Testing](#testing)
- [Documentation](#documentation)

---

## 🤝 Code of Conduct

This project follows a **collaborative and respectful** approach:

- ✅ Be respectful and inclusive
- ✅ Welcome newcomers and diverse perspectives
- ✅ Focus on constructive feedback
- ✅ Celebrate experimentation and creativity
- ❌ No harassment, discrimination, or toxic behavior

---

## 💡 How Can I Contribute?

### 1. Report Bugs

Found a bug? Please open an issue with:

- **Title**: Clear, concise description
- **Description**: Steps to reproduce, expected vs actual behavior
- **Environment**: OS, browser, Python version, LLM provider
- **Logs**: Relevant console output or error messages

**Template**:
```markdown
**Bug**: Agents stop drawing after 10 iterations

**Steps to reproduce**:
1. Launch Ollama agent with default settings
2. Wait 10 iterations
3. Agent stops responding

**Expected**: Agent continues indefinitely
**Actual**: Agent freezes after iteration 10

**Environment**: Ubuntu 22.04, Chrome 120, Python 3.10, Ollama llama3.2:3b
**Logs**: [Attach browser console logs]
```

### 2. Suggest Features

Have an idea? Open an issue with:

- **Use case**: What problem does it solve?
- **Proposal**: How would it work?
- **Impact**: Who benefits? (users, developers, AI agents)

**Examples**:
- "Add agent personality presets (minimalist, maximalist, organic)"
- "Implement swarm coordination (multiple agents form collective patterns)"
- "Export drawings as animated GIF"

### 3. Improve Documentation

- Fix typos, clarify explanations
- Add examples, diagrams, or tutorials
- Translate manuals to other languages
- Write blog posts or case studies

### 4. Submit Code

See [Submitting Changes](#submitting-changes) below.

---

## 🛠️ Development Setup

### Prerequisites

- **Git**: `sudo apt install git` (Linux) or [download](https://git-scm.com/)
- **Python 3.8+**: `python3 --version`
- **Crystal** (for Poietic Generator server): [Install guide](https://crystal-lang.org/install/)
- **Ollama** (optional): [Install guide](https://ollama.ai/)

### Clone the Repository

```bash
git clone https://github.com/OAuber/poietic-generator-llm-agents.git
cd poietic-generator-llm-agents
```

### Install Python Dependencies

```bash
cd python
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Testing tools
```

### Setup Poietic Generator Server

```bash
# Clone main project
cd ~/projects
git clone https://github.com/OAuber/poietic-generator2-documentation.git
cd poietic-generator2-documentation

# Install dependencies
shards install

# Compile
shards build

# Run
./bin/poietic-generator-api --port=3001
```

### Run AI Proxy Server

```bash
cd python
python poietic_ai_server.py
# Server running on http://localhost:8003
```

### Open Agent Interface

```bash
# Option 1: Direct file access
firefox public/ai-player.html

# Option 2: Via Poietic Generator server
firefox http://localhost:3001/ai-player.html
```

---

## 📐 Coding Standards

### JavaScript

- **ES6+** syntax (modules, async/await, arrow functions)
- **4-space indentation**
- **Semicolons optional** (but consistent within a file)
- **Naming**:
  - `camelCase` for variables/functions
  - `PascalCase` for classes
  - `UPPER_SNAKE_CASE` for constants

**Example**:
```javascript
class OllamaAdapter {
    static maxTokens = 1000;
    
    static async callAPI(apiKey, prompt) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            body: JSON.stringify({ prompt })
        });
        return response.json();
    }
}
```

### Python

- **PEP 8** style guide
- **4-space indentation**
- **Type hints** for function signatures
- **Docstrings** for public functions

**Example**:
```python
from typing import List, Dict

def parse_pixels(text: str) -> List[Dict[str, int]]:
    """
    Parse pixel data from LLM response.
    
    Args:
        text: Raw LLM output string
        
    Returns:
        List of pixel dictionaries with x, y, color keys
    """
    pixels = []
    # ... parsing logic
    return pixels
```

### Documentation

- **Comments**: Explain *why*, not *what*
- **Function docs**: Purpose, parameters, return value
- **Inline comments**: Only for complex logic

**Good**:
```javascript
// Prioritize border pixels to encourage collaboration
const borderPixels = updates.filter(u => u.x >= 17);
```

**Bad**:
```javascript
// Filter updates
const borderPixels = updates.filter(u => u.x >= 17);
```

---

## 🔄 Submitting Changes

### 1. Create a Branch

```bash
git checkout -b feature/awesome-improvement
# Or: bugfix/fix-parsing-error
```

Branch naming:
- `feature/` - New features
- `bugfix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements

### 2. Make Changes

- Write clean, documented code
- Follow coding standards
- Test thoroughly

### 3. Commit

```bash
git add .
git commit -m "feat: add agent personality presets

- Add 5 personality types (minimalist, maximalist, organic, geometric, collaborative)
- Modify prompt construction to include personality hints
- Add UI selector in ai-player.html

Closes #42"
```

**Commit message format**:
```
<type>: <short description>

<longer description (optional)>

<footer (optional): issue references>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, no code change
- `refactor`: Code restructuring
- `test`: Test additions
- `chore`: Maintenance (dependencies, build)

### 4. Push and Create Pull Request

```bash
git push origin feature/awesome-improvement
```

Then open a Pull Request on GitHub with:

- **Title**: Clear description
- **Description**:
  - What does it do?
  - Why is it needed?
  - Screenshots/demos (if UI change)
- **Checklist**:
  - [ ] Code follows style guidelines
  - [ ] Tests pass
  - [ ] Documentation updated
  - [ ] CHANGELOG.md updated

### 5. Review Process

- Maintainers will review your PR
- Address feedback with new commits
- Once approved, it will be merged!

---

## 🧪 Testing

### Manual Testing

```bash
# 1. Start all services
./bin/poietic-generator-api --port=3001
python python/poietic_ai_server.py

# 2. Open agent interface
firefox http://localhost:3001/ai-player.html

# 3. Test scenarios
- Launch 1 agent (Ollama)
- Launch 5 agents (different LLMs)
- Test custom prompts
- Test collaboration at borders
- Test reconnection after network loss
```

### Automated Tests (Coming Soon)

```bash
cd python
pytest tests/
```

Test coverage goals:
- [ ] LLM adapter unit tests
- [ ] Spatial analysis tests
- [ ] Pixel parsing tests
- [ ] WebSocket integration tests

---

## 📚 Documentation

### Where to Document

1. **Code comments**: Complex algorithms, non-obvious logic
2. **Function docstrings**: All public functions
3. **README.md**: High-level overview, quick start
4. **`docs/` folder**: Detailed guides, tutorials
5. **CHANGELOG.md**: All changes per version

### Documentation Checklist

When adding a feature:

- [ ] Update README.md (if user-facing)
- [ ] Add function docstrings
- [ ] Update relevant `docs/*.md` files
- [ ] Add example to `examples/` folder
- [ ] Update CHANGELOG.md

### Writing Style

- **Clarity**: Simple, direct language
- **Examples**: Show, don't just tell
- **Structure**: Use headings, lists, code blocks
- **Audience**: Assume reader is technical but unfamiliar with the project

---

## 🎨 Prompt Engineering Contributions

Want to improve agent behavior? You can:

### 1. Modify Instruction Manuals

Edit `docs/MANUEL_OLLAMA.md` (or other LLM manuals):

```markdown
## Section 4: FORMES À DESSINER

**NEW**: Add organic patterns
- Spirals: Start from center, expand outward
- Fractals: Recursive branching structures
- Waves: Sinusoidal patterns
```

### 2. Improve Color Palettes

Edit `public/js/llm-adapters/ollama.js`:

```javascript
// Add new palette technique
{
    name: 'Sunset Gradient',
    description: 'Warm colors transitioning to cool',
    generate: () => {
        return [
            OllamaAdapter.hslToHex(15, 80, 40),   // Deep orange
            OllamaAdapter.hslToHex(30, 75, 55),   // Orange
            // ... more colors
        ];
    }
}
```

### 3. Refine Collaboration Prompts

Edit `public/js/spatial-analysis.js`:

```javascript
// Add new collaboration hint
if (direction === 'N' && updates.some(u => u.y >= 17)) {
    hints.push(`Extend pattern from top neighbor`);
}
```

---

## 🐛 Common Issues

### "Agent not connecting"

- Check Poietic Generator server is running (`localhost:3001`)
- Check AI proxy server is running (`localhost:8003`)
- Check browser console for WebSocket errors

### "Ollama timeout"

- Increase timeout in `poietic_ai_server.py`: `httpx.AsyncClient(timeout=300.0)`
- Reduce `maxTokens` in `ollama.js` (fewer pixels per iteration)
- Check Ollama is running: `ollama list`

### "JSON parsing errors"

- This is expected for Ollama (fallback active)
- To reduce frequency, simplify prompts in `MANUEL_OLLAMA.md`
- Check console for "forme par défaut (LLM bavard)" logs

---

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/OAuber/poietic-generator-llm-agents/issues)
- **Discussions**: [GitHub Discussions](https://github.com/OAuber/poietic-generator-llm-agents/discussions)
- **Main Project**: [Poietic Generator](https://github.com/OAuber/poietic-generator2-documentation)
- **Website**: [http://poietic-generator.net/](http://poietic-generator.net/)

---

Thank you for contributing! 🙏

**Let's create emergent AI art together!** 🎨🤖

