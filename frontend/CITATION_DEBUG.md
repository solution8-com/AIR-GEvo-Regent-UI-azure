# Citation Debug Logging

## Overview

The citation parser in `src/components/Answer/AnswerParser.tsx` includes comprehensive debug logging to help diagnose issues where citations are present in PromptFlow API responses but missing from the rendered UI.

## How to Enable Debug Logging

Debug logging is **disabled by default** to avoid performance impact in production. To enable it:

### Method 1: Browser Console (Recommended for Testing)

Open your browser's Developer Tools console and run:

```javascript
window.ENABLE_CITATION_DEBUG = true
```

Then reload the page or send a new query to the chatbot.

### Method 2: During Development

To enable debug logging persistently during development, you can modify the code temporarily:

1. Open `frontend/src/components/Answer/AnswerParser.tsx`
2. Find the `isDebugEnabled` function
3. Temporarily return `true`:

```typescript
const isDebugEnabled = (): boolean => {
  return true  // Force enable for debugging
}
```

**Important**: Remember to revert this change before committing!

## Understanding Debug Output

When debug logging is enabled, you'll see detailed console output for every step of citation parsing:

### PromptFlow Citation Parser Logs

The parser logs each step with clear indicators:
- ✓ (checkmark) - Success
- ❌ (red X) - Critical failure/missing data
- ⚠ (warning) - Non-critical skip/fallback

Example output:
```
[PromptFlow Citation Parser] Starting extraction from PromptFlow response
[PromptFlow Citation Parser] Input answer object: {...}
[PromptFlow Citation Parser] Checking for choices array in response
[PromptFlow Citation Parser] ✓ Found choices array with 1 choice(s)
[PromptFlow Citation Parser] Processing choice: {...}
[PromptFlow Citation Parser] ✓ Found messages array with 2 message(s)
[PromptFlow Citation Parser] Examining message: {...}
[PromptFlow Citation Parser] ⚠ Message role is "assistant", not "tool" - skipping
[PromptFlow Citation Parser] Examining message: {...}
[PromptFlow Citation Parser] ✓ Found message with role="tool"
[PromptFlow Citation Parser] ✓ Tool message has content
[PromptFlow Citation Parser] Content is a string, attempting to parse as JSON
[PromptFlow Citation Parser] Raw content string: {"citations": [...]}
[PromptFlow Citation Parser] ✓ Successfully parsed JSON content: {...}
[PromptFlow Citation Parser] Checking for citations array in parsed content
[PromptFlow Citation Parser] ✓ Found citations array with 1 citation(s)
[PromptFlow Citation Parser] Processing citation 1/1: {...}
[PromptFlow Citation Parser] ✓ Created Citation object: {...}
[PromptFlow Citation Parser]   - docId: TI46 → id: TI46
[PromptFlow Citation Parser]   - source: Technical information.pdf → filepath: Technical information.pdf
[PromptFlow Citation Parser]   - page: 1 → part_index: 1
[PromptFlow Citation Parser] ✅ Extraction complete - found 1 total citation(s)
```

### Answer Parser Logs

The main parser logs the overall flow:
```
[Answer Parser] ========== Starting parseAnswer ==========
[Answer Parser] Received answer object: {...}
[Answer Parser] ✓ answer.answer is a valid string
[Answer Parser] Searching for inline [docN] citation patterns
[Answer Parser] Found citation links: null
[Answer Parser] Processing inline [docN] citations (if any)
[Answer Parser] Inline citations processed: 0 citation(s)
[Answer Parser] Checking if PromptFlow fallback is needed
[Answer Parser] ✓ No inline citations found - activating PromptFlow citation fallback
[Answer Parser] PromptFlow extraction returned 1 citation(s)
[Answer Parser] ✓ Re-indexing PromptFlow citations for display
[Answer Parser]   - Citation 0: reindex_id = 1
[Answer Parser] ✅ PromptFlow citations successfully loaded as fallback
[Answer Parser] Enumerating citations (assigning part_index)
[Answer Parser] Final enumerated citations: [...]
[Answer Parser] ========== parseAnswer complete ==========
[Answer Parser] Returning 1 citation(s)
```

## Common Issues and Solutions

### Issue: No citations appear in UI

1. Enable debug logging
2. Look for these specific log messages:

**If you see:**
```
[PromptFlow Citation Parser] ❌ No choices array found in response
```
**Solution**: The API response structure is missing the `choices` array. Check that you're querying the correct PromptFlow endpoint.

**If you see:**
```
[PromptFlow Citation Parser] ⚠ Message role is "assistant", not "tool" - skipping
```
**Solution**: The API response has messages, but none have `role: "tool"`. Check the PromptFlow configuration to ensure tool messages are included.

**If you see:**
```
[PromptFlow Citation Parser] ❌ Failed to parse JSON content
```
**Solution**: The tool message content is not valid JSON. Check the raw content string in the logs to see what was received.

**If you see:**
```
[PromptFlow Citation Parser] ⚠ No citations array found in content object
```
**Solution**: The tool message JSON was parsed successfully but doesn't contain a `citations` array. Check the `Content object keys` log to see what fields are actually present.

### Issue: Inline citations work but PromptFlow citations don't

Check for:
```
[Answer Parser] ⚠ Skipping PromptFlow fallback - already have N inline citation(s)
```

This is expected behavior! The PromptFlow citation parser only activates when **no** inline `[docN]` citations are found. This is by design to avoid conflicts between the two citation sources.

## Performance Considerations

- Debug logging is disabled by default to avoid performance overhead
- When enabled, large objects are automatically truncated to 1000 characters in logs
- Individual citation objects are truncated to 500 characters
- Logging only occurs when debug mode is explicitly enabled

## Implementation Details

The debug logging system uses:
- `isDebugEnabled()`: Checks if debug mode is active
- `debugLog()`: Conditionally logs based on debug mode
- `safeStringify()`: Safely stringifies objects with size limits to prevent performance issues

All logging is designed to be:
- **Side-effect free**: Only console output, no logic changes
- **Defensive**: Never crashes even with malformed data
- **Clear**: Includes context and visual indicators for non-experts
