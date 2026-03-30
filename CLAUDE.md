# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Streamdown (remend) Markdown 修复演示** — A Next.js web app that demonstrates real-time markdown repair during LLM streaming. The UI is in Chinese (Mandarin). It connects to an OpenAI-compatible LLM API (default: DeepSeek), streams the response, and shows a three-column comparison: chat, raw markdown (with defects), and repaired markdown.

The repair pipeline has two tiers:
1. **Syntactic fixes** — deterministic regex-based repairs via `remendByBlocks()` (wraps the `remend` npm package)
2. **Semantic fixes** — ambiguous patterns that can't be resolved syntactically are detected by `findAmbiguousPatterns()` and sent to an LLM for context-aware judgment (only the ambiguous fragments are sent, to minimize token usage)

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server with hot reload (localhost:3000)
npm run build      # Production build
npm start          # Start production server
npm run lint       # ESLint via Next.js
```

No test framework is configured. `malformed_markdown_test_cases.json` at the project root contains 55 test cases across 16 categories for manual verification of `remendByBlocks()`.

## Architecture

### Data Flow

```
User message → POST /api/chat → LLM (OpenAI-compatible SSE stream)
                                        ↓
                                  Raw markdown (streamed)
                                   ↓              ↓
                            Rendered view    remendByBlocks() → Syntactic fix (immediate)
                                                                      ↓
                                                        findAmbiguousPatterns() on original text
                                                                      ↓ (if ambiguous segments found)
                                                        POST /api/fix-ambiguous → LLM
                                                                      ↓
                                                        applyLLMFixes() → Final fix (async)
```

During streaming, the syntactic fix is displayed. After streaming completes, ambiguous segments (if any) are sent to the repair model. When the LLM responds, the final fix replaces the syntactic result.

### Key Modules

- **`src/lib/remend-blocks.ts`** — Core repair logic. Three main exports:
  - `remendByBlocks(text)` — Synchronous syntactic fixer. Pipeline: heading spacing → heading overflow cap → blockquote spacing → spaced bold markers → asymmetric marker fix (with inline math protection) → list spacing → table trailing pipes → link bracket spacing → per-line fixes (inline math, unclosed links/images, backtick asymmetry, nested unclosed markers, inline code) → `remend()`. Tracks code block and math block (`$$` and `\[...\]`) state across lines. `protectInlineMath()` shields `\(...\)` and inline `\[...\]` content from formatting fixers via null-byte placeholders.
  - `findAmbiguousPatterns(text)` — Detects 6 categories of syntactically ambiguous patterns (see `ambiguous-patterns.md` for the full list with regexes). Skips code block and math block content.
  - `applyLLMFixes(syntacticResult, segments, fixes)` — Patches LLM-determined fixes into the syntactic result by replacing `syntacticFix` strings.

- **`src/app/page.tsx`** — Main page component (client-side). Three-column layout: chat, raw markdown, fixed markdown. Manages streaming state, chat history, abort control, and the async LLM repair flow (`isRepairing` / `llmFixedMarkdown` / `repairError` states). Shows status badges for repair progress.

- **`src/app/api/chat/route.ts`** — Server-side POST endpoint. Proxies to any OpenAI-compatible `/v1/chat/completions` endpoint with SSE streaming.

- **`src/app/api/fix-ambiguous/route.ts`** — Server-side POST endpoint for semantic repair (used internally by the demo page). Receives ambiguous segments with context, calls an LLM with a specialized prompt describing 6 ambiguity types, parses structured responses (`片段1：fix\n片段2：fix`), returns fixes mapped by segment ID. Uses `temperature: 0`.

- **`src/app/api/repair/route.ts`** — Public API endpoint for external consumers. Accepts `POST { text, semantic? }`, returns `{ fixed, ambiguous_count, warning? }`. Reads LLM config from env vars (`REPAIR_API_URL`, `REPAIR_API_KEY`, `REPAIR_MODEL_ID`, `REPAIR_SEMANTIC_ENABLED`). Falls back to syntactic-only if LLM call fails.

- **`src/lib/store.ts`** — TypeScript types (`ModelConfig`, `RepairModelConfig`, `ChatMessage`) and default configs.

- **`src/components/ConfigPanel.tsx`** — Two-tab config modal: "聊天模型" (chat model: API URL, key, model ID, system prompt) and "修复模型" (repair model: enable/disable toggle, API URL, key, model ID).

- **`src/components/MarkdownRenderer.tsx`** — Renders markdown via `react-markdown` with `remark-gfm`, `remark-math`, `rehype-katex`. Supports streaming cursor animation.

### Tech Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 (uses `@import "tailwindcss"` syntax in `globals.css`, CSS variables for theming)
- Path alias: `@/*` → `./src/*`

## Notes

- Both API routes work with any OpenAI-compatible endpoint, not just DeepSeek. Config is passed from client state per request.
- `ambiguous-patterns.md` documents all 6 ambiguity categories with their regexes and trigger conditions.
- The `remend` npm package handles unclosed bold/italic/strikethrough/code/links but has limitations (e.g., `$$` doubling, image deletion). Custom pre-processing in `remend-blocks.ts` works around these by fixing patterns before `remend()` sees them, and by passing `{ katex: false, inlineKatex: false }` to disable remend's math handling (math blocks are tracked separately).
- LaTeX math is protected at two levels: block-level (`$$`/`\[...\]` tracked as state machines, content passed through untouched) and inline-level (`\(...\)` and same-line `\[...\]` replaced with null-byte placeholders before fixers run, restored after `remend()`). This prevents `remend` from treating `\[` as a link bracket or `_` inside math as italic.
- The `looksLikeMarkdownNotCode` heuristic detects unclosed code block boundaries; it recognizes `##`+ headings (not `#` alone — that's a code comment in many languages), blockquotes, tables, links, and images.
- Dark mode is supported via `prefers-color-scheme` CSS variables defined in `globals.css`.
