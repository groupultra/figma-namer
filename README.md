# Figma Namer

AI-powered semantic layer naming for Figma. Supports Gemini 3, Claude 4.6, and GPT-5.2.

**Agentic two-round pipeline**: Round 1 uses LLM to analyze file structure (pages vs noise), Round 2 names components per-page with 3-image context. Cuts cost from ~$50 to ~$2.60 and time from 30 min to 3 min on large files.

Two ways to use: **Web Dashboard** (batch analysis with export) or **Figma Plugin** (in-editor, one-click apply).

> **[中文文档](./README.zh-CN.md)**

---

## Usage A: Web Dashboard (Browser)

The easiest way to use Figma Namer. Everything runs locally, no cloud deployment needed.

### Prerequisites

- Node.js 18+
- A **Figma Personal Access Token** ([how to get one](https://www.figma.com/developers/api#access-tokens))
- An API key from one of: **Google** (Gemini), **Anthropic** (Claude), or **OpenAI** (GPT-5.2)

### Quick Start

```bash
git clone https://github.com/groupultra/figma-namer.git
cd figma-namer
npm install
npm start
```

Browser opens at `http://localhost:5173`. Then:

1. **Paste your Figma Token** — Personal Access Token from Figma Settings
2. **Paste a Figma file URL** — e.g. `https://www.figma.com/design/xxxxx/MyFile`
   - To target a specific frame, append `?node-id=1-2` to the URL
3. **Choose AI model** — Gemini Flash (default) / Gemini Pro / Claude Sonnet / Claude Opus / GPT-5.2
4. **Enter your API key** — for the chosen provider
5. **Click "Analyze File"** — AI analyzes the file structure:
   - **Round 1 (Structure Analysis)**: Classifies file type (app screens / component library / icon library / mixed), identifies real pages vs noise (annotations, notes, dividers), lists nodes to name per page
   - Shows file type badge, AI reasoning, and a page list with checkboxes
   - Auxiliary elements (notes, arrows, dividers) are grayed out and excluded
6. **Select pages to name** — check/uncheck pages, review node counts per page
7. **Click "Start Naming"** — page-level + batch-level progress:
   - **Round 2 (Per-page naming)**: Each page gets its own screenshot for context
   - AI receives 3 images: full page, component grid, page highlight annotations
   - Sibling components on the same page share context for consistent naming
8. **Review results** — search, filter, edit names inline
9. **Export** — download as JSON or CSV

> Credentials are saved to localStorage for convenience (never sent anywhere except to the respective APIs).

### Applying names back to Figma

The Figma REST API is **read-only** — it cannot rename layers directly. To apply names:

- **Option 1**: Export JSON from the Web Dashboard, then use the Figma Plugin (Usage B) to paste and apply
- **Option 2**: Use the exported JSON/CSV as a reference and rename manually

---

## Usage B: Figma Plugin (In-Editor)

For direct in-Figma use. The plugin calls AI APIs directly from the browser — **no backend server needed**. You provide your own API key, which is stored locally in Figma's `clientStorage` and never sent to any third-party server.

### Setup

1. Build the plugin:
   ```bash
   npm run build:plugin
   ```
2. In Figma Desktop → Plugins → Development → Import plugin from manifest
3. Select `manifest.json` from this repo

### How to use

1. Select frames on your Figma canvas
2. Open the plugin (Plugins → Development → Figma Namer)
3. Enter global context (e.g. "E-commerce checkout flow")
4. Choose platform (Auto / iOS / Android / Web)
5. **Choose AI provider** — Gemini Flash / Gemini Pro / Claude Sonnet / Claude Opus / GPT-5.2
6. **Enter your API key** — stored locally in Figma, never leaves your device except to the AI API
7. Click **"Start Naming"**
8. Review AI-generated names → Apply selected → names are written to your Figma layers

> **No backend required.** The plugin makes direct `fetch` calls to AI provider APIs (Google, Anthropic, OpenAI) from the plugin UI iframe. Anthropic CORS is enabled via the `anthropic-dangerous-direct-browser-access` header. OpenAI may not support browser CORS — if it fails, use Gemini or Claude instead.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Web Dashboard (server + frontend) |
| `npm run start:server` | Start Express server only |
| `npm run start:web` | Start Vite dev server only |
| `npm run build:plugin` | Build Figma plugin (dist/) |
| `npm run dev:plugin` | Build plugin in watch mode |
| `npm test` | Run tests |

## Architecture

```
Web Dashboard:
  Round 0: Figma REST API → JSON tree
  Round 1: Tree summary → Gemini Flash (text-only, no images)
           → file type, pages vs noise, node IDs to name
  Round 2: Per-page batched naming
           → 3 images per VLM call: page full, component grid, page highlights
           → siblings share context for consistent naming

Figma Plugin:
  code.ts (sandbox)              UI iframe
  ─────────────────              ─────────
  1. Traverse selection
  2. Export root screenshot  →   Receive IMAGE_EXPORTED
  3. Create batches
  4. Compute SoM labels
  5. Send SOM_BATCH_READY    →   For each batch:
     (nodes + labels)              a. renderSoMImage() (Canvas API)
                                   b. Direct fetch → AI API
                                   c. Parse response → naming results
                                 6. All done → preview & apply
```

## Project Structure

```
figma-namer/
├── server/                 # Express backend (Web Dashboard)
│   └── src/
│       ├── index.ts        # Server entry point (port 3456)
│       ├── routes/         # API endpoints
│       ├── figma/          # Figma REST API client
│       ├── vlm/            # Claude, OpenAI, Gemini clients
│       ├── som/            # SoM rendering, page highlights
│       └── session/        # Session management
├── web/                    # React SPA (Vite)
│   └── src/
│       ├── App.tsx         # Main app state machine
│       ├── components/     # Dashboard, BatchProgress, NamingPreview
│       └── hooks/          # useNamingFlow, useSSEProgress
├── src/                    # Figma Plugin source
│   ├── shared/             # Shared types & constants
│   ├── plugin/             # Plugin main thread (code.ts)
│   │   ├── som/            # SoM Canvas renderer + anti-overlap
│   │   └── traversal/      # DFS node traversal & filtering
│   ├── ui/                 # Plugin React UI
│   │   ├── App.tsx         # Root component
│   │   ├── components/     # ContextInput, BatchProgress, NamingPreview
│   │   └── hooks/          # useNamingFlow (orchestrates VLM calls)
│   └── vlm/                # VLM integration
│       ├── providers/      # Raw fetch clients (Gemini, Anthropic, OpenAI)
│       ├── client.ts       # VLMClient with retry logic
│       ├── prompt.ts       # CESPC prompt engineering
│       └── parser.ts       # Response parser & validator
├── manifest.json           # Figma plugin manifest
└── package.json
```

## Supported AI Models

| Provider | Model | Plugin ID | Best for |
|----------|-------|-----------|----------|
| **Google** | gemini-3-flash-preview | `gemini-flash` | Fast & cheap (default) |
| **Google** | gemini-3-pro-preview | `gemini-pro` | Best reasoning |
| **Anthropic** | claude-sonnet-4-6 | `claude-sonnet` | Balanced |
| **Anthropic** | claude-opus-4-6 | `claude-opus` | Most capable |
| **OpenAI** | gpt-5.2 | `gpt-5.2` | Best vision (CORS may not work in plugin) |

## License

MIT
