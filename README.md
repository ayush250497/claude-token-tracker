# Claude Token Tracker

A Chrome extension that shows **live token counts and cost estimates** on [claude.ai](https://claude.ai) as you type, after each response, and across your entire session.

No API key required. No external calls. Everything runs locally in your browser.

---

## Features

- **Live input tracking** — Token count and cost updates as you type
- **Response cost** — Output tokens and cost shown after each Claude response
- **Session totals** — Running totals of input tokens, output tokens, and cumulative cost
- **Model selector** — Switch between Opus 4, Sonnet 4, and Haiku 3.5 pricing via the toolbar popup
- **Draggable widget** — Reposition the floating tracker anywhere on the page
- **Minimizable** — Collapse to just the header bar when not needed

---

## Installation

### 1. Clone this repo

```bash
git clone https://github.com/ayush250497/claude-token-tracker.git
```

### 2. Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `claude-token-tracker` folder
5. The extension is now installed

### 3. Use it

1. Open [https://claude.ai](https://claude.ai)
2. The floating widget appears in the bottom-right corner
3. Start typing — token count updates live
4. Click the extension icon to switch models

---

## The Widget

```
┌──────────────────────────┐
│ Token Tracker  [Sonnet 4]│
├──────────────────────────┤
│ CURRENT INPUT            │
│ 142 tokens       $0.0004 │  ← updates as you type
│                          │
│ LAST RESPONSE            │
│ 831 tokens       $0.0125 │  ← appears after Claude responds
│──────────────────────────│
│ SESSION TOTAL            │
│ In:  450 tokens          │
│ Out: 1,662 tokens        │
│ Cost: $0.0263            │
│                  3 turns │
└──────────────────────────┘
```

- **Drag** the header to reposition
- **Click "−"** to minimize / **"+"** to expand

---

## Pricing Reference

| Model      | Input (per MTok) | Output (per MTok) |
|------------|------------------|--------------------|
| Opus 4     | $15.00           | $75.00             |
| Sonnet 4   | $3.00            | $15.00             |
| Haiku 3.5  | $0.80            | $4.00              |

*Verify latest pricing at [anthropic.com/pricing](https://anthropic.com/pricing)*

---

## Project Structure

```
claude-token-tracker/
├── manifest.json      Chrome Extension Manifest V3
├── content.js         Core content script (widget + tracking logic)
├── tokenizer.js       Local BPE-style token estimation engine
├── styles.css         Widget styles (dark theme)
├── popup.html         Model selector popup
├── popup.js           Popup logic
├── popup.css          Popup styles
└── icons/
    ├── icon48.png
    └── icon128.png
```

---

## How It Works

1. **Input tracking** — Listens to the claude.ai composer (`contenteditable` div), counts tokens on each keystroke (debounced 150ms)
2. **Send detection** — Polls for input clearing to detect when a message is sent; logs input tokens to session totals
3. **Response detection** — Uses `MutationObserver` to watch for DOM changes; after 2s of no mutations, diffs the conversation text to extract the response and count output tokens
4. **Token estimation** — Local heuristic tokenizer (~85–90% accuracy vs Claude's actual tokenizer); no network calls or API keys needed

---

## Limitations

- Token counts are **estimates** (~85–90% accuracy) — uses a local heuristic, not Claude's actual tokenizer
- Session resets on page reload — totals are kept in memory only
- Model must be **set manually** via the popup — the extension cannot auto-detect the active model on claude.ai
- DOM selectors may need updating if Anthropic redesigns claude.ai

---

## Troubleshooting

**Widget doesn't appear?**
- Confirm you're on `https://claude.ai`
- Check the extension is enabled in `chrome://extensions/`
- Refresh the page
- Open DevTools (F12) → Console for errors

**Token count seems off?**
- Expected — the tokenizer is an approximation. For exact counts, use Anthropic's `/count_tokens` API endpoint.

**Extension disabled after Chrome update?**
- Go to `chrome://extensions/` and re-enable it (unpacked extensions sometimes get disabled on updates)
