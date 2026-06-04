# LLaVA Parsing & Format Improvements

**Date**: 2025-01-22  
**Version**: v30 (llava-v2.js), v20250122-125 (ai-player.js)

## Problem Analysis

After reviewing verbatim LLaVA responses, we identified 5 critical issues:

### ❌ Issues Found

1. **Double Hash `##`**: `10,19##FFE4C3` instead of `10,19#FFE4C3`
2. **Out of Bounds Coordinates**: `0,20#F76841`, `0,21#F76841` (grid is 0-19!)
3. **Invalid HEX Colors**: 8-char colors like `F5AF5AF5` instead of 6-char `F5AF5A`
4. **Response Truncation**: Iteration #2 ended with `15,9##E0E0` (incomplete)
5. **Semantic Confusion**: Says "noir" (black) but uses `#E0E0E0` (light gray)

---

## Solutions Implemented

### 1. ✅ Improved Parser (`llava-v2.js`)

**File**: `public/js/llm-adapters/llava-v2.js`

**Changes**:

```javascript
// Accept ## or #, plus 3-8 HEX chars
const pixelPattern = /(\d+),(\d+)#{1,2}([0-9A-Fa-f]{3,8})\b/g;

// REJECT out-of-bounds coordinates (instead of clamping)
if (x < 0 || x >= 20 || y < 0 || y >= 20) {
    console.warn(`[LLaVA V2] ❌ Coordonnées hors limites REJETÉES: ${x},${y}`);
    rejectedCount++;
    continue; // Skip this pixel
}

// Normalize long colors (8 → 6 chars, remove alpha)
if (colorHex.length > 6) {
    const original = colorHex;
    colorHex = colorHex.substring(0, 6);
    console.warn(`[LLaVA V2] 🔧 Couleur tronquée: ${original} → ${colorHex}`);
}
```

**Benefits**:
- Tolerates `##` double hash (auto-normalized)
- Rejects invalid coordinates (prevents drawing outside grid)
- Truncates 8-char colors to 6 chars (removes alpha channel)
- Better error logging for debugging

---

### 2. ✅ Increased `max_tokens` 

**Change**: `2000` → `3000` tokens

**Reason**: Prevents response truncation (observed in Iteration #2)

---

### 3. ✅ Enhanced Prompt (`llava-prompts-v2.json`)

**File**: `public/llava-prompts-v2.json`

**Added explicit format examples** in both `seed_system` and `continuation_system`:

```json
"CRITICAL CONSTRAINTS - FORMAT EXACT:",
"Grid: 20x20 pixels (coordinates 0-19 ONLY, NOT 20!)",
"",
"✅ CORRECT FORMAT:",
"  5,10#FF0000   (ONE # followed by 6 HEX chars)",
"  0,0#FFF       (or 3 HEX chars)",
"  19,19#00FF00  (coordinates 0-19, max=19)",
"",
"❌ WRONG FORMAT (DO NOT USE):",
"  5,10##FF0000    (double ## is WRONG)",
"  5,10#FF00       (4 chars is incomplete)",
"  5,10#FF0000AA   (8 chars is too long)",
"  0,20#FF0000     (y=20 OUT OF BOUNDS, max=19!)",
"  20,0#FF0000     (x=20 OUT OF BOUNDS, max=19!)",
"  25,25#FF0000    (completely OUT OF BOUNDS!)"
```

**Benefits**:
- Shows LLaVA exactly what NOT to do
- Provides clear examples of correct vs incorrect format
- Emphasizes coordinate limits (0-19, NOT 20!)

---

### 4. ✅ Better Logging

**Console Warnings Now Show**:
- `❌ Coordonnées hors limites REJETÉES: 20,5 (max: 19,19)`
- `🔧 Couleur tronquée: F5AF5AF5 → F5AF5A`
- `⚠️ 3 pixel(s) rejeté(s) dans cette ligne`

**Purpose**: Easier debugging of LLaVA's output quality

---

## Expected Results

### Before:
```
Je produis les pixels : 10,19##FFE4C3 18,19##B5A6D3 0,20#F76841
❌ 2 pixels rejected (##), 1 pixel rejected (y=20)
```

### After:
```
Je produis les pixels : 10,19#FFE4C3 18,19#B5A6D3
✅ 2 pixels accepted
⚠️ Parser auto-corrects ## to #
❌ 0,20 rejected (out of bounds)
```

---

## Testing Checklist

- [x] Parser accepts `##` and normalizes to `#`
- [x] Parser rejects coordinates ≥ 20
- [x] Parser truncates 8-char colors to 6 chars
- [x] `max_tokens` increased to 3000
- [x] Prompt shows explicit correct/incorrect examples
- [x] Console warnings are clear and actionable
- [ ] Test with live LLaVA agent (next step)

---

## Files Modified

1. **`public/js/llm-adapters/llava-v2.js`** (v30)
   - Improved pixel parser (lines 230-275)
   - Increased `max_tokens` to 3000
   - Better error handling

2. **`public/llava-prompts-v2.json`**
   - Added "CRITICAL CONSTRAINTS - FORMAT EXACT" section
   - Explicit ✅/❌ examples for correct/wrong format
   - Reinforced coordinate limits (0-19)

3. **`public/ai-player-v2.html`** (v20250122-125)
   - Updated script versions

---

## Next Steps

1. Launch an agent with new parser/prompt
2. Monitor console for warnings
3. Check verbatim responses in Tab 3
4. Verify filtered responses in Tab 2 show correct pixel counts
5. Adjust prompt further if needed

---

**Status**: ✅ Ready for testing
