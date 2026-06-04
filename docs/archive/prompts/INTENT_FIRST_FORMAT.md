# Intent-First Format: "To draw X, I create the pixels..."

**Date**: 2025-01-22  
**Version**: v31 (llava-v2.js), v20250122-126 (ai-player.js)

## Motivation

### Problem with Previous Format
```
Je produis les pixels : 5,10#FF0000 ... pour réaliser : nez vertical
```
- Action BEFORE intention
- LLaVA generates pixels first, then rationalizes
- Risk of cognitive dissonance: "I drew X but I say Y"

### New Format (Intent-First)
```
To draw a vertical nose, I create the pixels: 5,10#FF0000 ...
```
- Intention BEFORE action
- LLaVA states the goal first, then generates coherent pixels
- More natural logic: "I want to do X, so I do Y"

---

## Hypothesis

**Will this help LLaVA 7B?**

### ✅ Optimistic View
- Better semantic coherence (plan before acting)
- Reduces post-hoc rationalization
- More natural instruction format

### ⚠️ Realistic View
- LLaVA 7B has inherent spatial understanding limits
- Real problem is geometric comprehension, not phrasing
- Out-of-bounds coords (20,20) suggest fundamental misunderstanding

### 💡 Pragmatic Approach
**Worth testing!** Even if LLaVA 7B isn't perfect:
- Won't hurt
- May slightly improve coherence
- Makes prompts more readable for humans too

---

## Changes Made

### 1. Updated Prompts (`llava-prompts-v2.json`)

**Old Format**:
```json
"Je produis les pixels : 10,5#{{color1}} ... pour réaliser : nez vertical"
```

**New Format**:
```json
"To draw a vertical nose, I create the pixels: 10,5#{{color1}} 10,6#{{color1}} ..."
"To draw a horizontal mouth, I create the pixels: 8,9#{{color2}} 9,9#{{color2}} ..."
"To draw two eyes, I create the pixels: 8,3#{{color3}} 12,3#{{color3}}"
```

**Updated in**:
- `seed_system` → Lines 24-29
- `continuation_system` → Lines 118-123

---

### 2. Updated Parser (`llava-v2.js`)

**Backward Compatible Regex**:
```javascript
// Supports BOTH formats:
// OLD: "Je produis les pixels : ..."
// NEW: "To draw X, I create the pixels: ..."
const pixelMatch = line.match(
  /(?:Je produis les pixels\s*:\s*|I create the pixels:\s*)(.+?)(?:\s+pour réaliser|$)/i
);
```

**Description Extraction** (new):
```javascript
// Extract descriptions from "To draw X, I create..." format
const drawMatches = text.match(/To draw ([^,]+),\s*I create the pixels:/gi);
if (drawMatches) {
    const descriptions = drawMatches.map(m => {
        const match = m.match(/To draw ([^,]+),/i);
        return match ? match[1].trim() : '';
    }).filter(d => d);
    localDescription = descriptions.join(', ');
}
```

**Benefits**:
- Extracts multiple drawing intentions
- Joins them with commas: "a vertical nose, a horizontal mouth, two eyes"
- Falls back to old format if new format not found

---

## Expected Output Examples

### Before (Old Format)
```
Je produis les pixels : 10,5#000000 10,6#000000 pour réaliser : nez
Je produis les pixels : 8,9#FF0000 9,9#FF0000 pour réaliser : bouche
```

**Description extracted**: "bouche" (only last one)

### After (New Format)
```
To draw a vertical nose, I create the pixels: 10,5#000000 10,6#000000
To draw a horizontal mouth, I create the pixels: 8,9#FF0000 9,9#FF0000
To draw two eyes, I create the pixels: 8,3#000000 12,3#000000
```

**Description extracted**: "a vertical nose, a horizontal mouth, two eyes"

---

## Linguistic Structure

### English Grammar Benefits

**"To draw X"** = Purpose clause (infinitive of purpose)
- Clearly states the GOAL
- Grammatically signals intention
- Natural in English instruction syntax

**"I create the pixels:"** = Main action
- Follows naturally from the purpose
- Active voice (agent-focused)
- Clear subject-verb structure

**Full sentence**:
```
[PURPOSE CLAUSE]          [MAIN CLAUSE]
To draw a vertical nose,  I create the pixels: 5,10#000 ...
└─ GOAL                   └─ ACTION to achieve goal
```

---

## Testing Checklist

- [x] Prompt updated in `seed_system`
- [x] Prompt updated in `continuation_system`
- [x] Parser accepts new format
- [x] Parser still accepts old format (backward compatible)
- [x] Description extraction works for new format
- [x] Descriptions joined correctly
- [ ] Test with live LLaVA agent
- [ ] Compare quality vs old format
- [ ] Monitor verbatim responses
- [ ] Check if descriptions match actual pixels

---

## Files Modified

1. **`public/llava-prompts-v2.json`**
   - Lines 24-29 (seed_system)
   - Lines 118-123 (continuation_system)
   - New format: "To draw X, I create the pixels: ..."

2. **`public/js/llm-adapters/llava-v2.js`** (v31)
   - Line 225: Updated regex to support both formats
   - Lines 303-316: New description extraction logic
   - Backward compatible with old format

3. **`public/ai-player-v2.html`** (v20250122-126)
   - Updated script versions

---

## Psychological Impact on LLM

### Theory: Intent Priming

When LLaVA reads:
```
"To draw a vertical nose, I create the pixels: ..."
```

**Cognitive Process**:
1. **Activation**: Concept of "vertical nose" activated first
2. **Attention**: Visual attention directed to nose region
3. **Generation**: Pixels generated in context of "nose"
4. **Coherence**: Higher probability of geometric consistency

Versus old format:
```
"Je produis les pixels : 5,10#000 ... pour réaliser : nez"
```

**Cognitive Process**:
1. **Generation**: Pixels generated first (blind)
2. **Rationalization**: Attempts to label what was created
3. **Dissonance**: Description may not match actual output

---

## Expected Improvements

### Quantitative
- **Pixel coherence**: Fewer scattered pixels
- **Coordinate validity**: Fewer out-of-bounds (hopeful)
- **Description accuracy**: Better match with actual drawing

### Qualitative
- **Semantic consistency**: Descriptions match visual output
- **Readability**: Easier for humans to understand LLaVA's intent
- **Debugging**: Clearer what LLaVA is trying to draw

---

## Next Steps

1. **Launch agent** with new format
2. **Compare verbatim responses** (Tab 3)
   - Old: Action → Description
   - New: Description → Action
3. **Analyze descriptions** (Tab 2)
   - Do they match the pixels?
   - Are they more coherent?
4. **Monitor console**
   - Fewer rejected pixels?
   - Better coordinate choices?

---

**Status**: ✅ Ready for testing

**Hypothesis**: Intent-first formulation will improve semantic coherence, even if it doesn't fully solve LLaVA 7B's spatial limitations.
