# Figma Namer

AI-powered semantic layer naming for Figma. Supports Gemini 3, Claude 4.6, and GPT-5.2.

**Agentic two-round pipeline**: Round 1 uses LLM to analyze file structure (pages vs noise), Round 2 names components per-page with 3-image context. Cuts cost from ~$50 to ~$2.60 and time from 30 min to 3 min on large files.

Two ways to use: **Web Dashboard** (recommended) or **Figma Plugin** (in-editor).

> **[中文文档](./README.zh-CN.md)**

---

## Usage A: Web Dashboard (Browser)

The easiest way to use Figma Namer. Everything runs locally, no Vercel deployment needed.

### Prerequisites

- Node.js 18+
- A **Figma Personal Access Token** ([how to get one](https://www.figma.com/developers/api#access-tokens))
- An API key from one of: **Google** (Gemini 3), **Anthropic** (Claude 4.6), or **OpenAI** (GPT-5.2)

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
3. **Choose AI model** — Gemini 3 Flash (default) / Gemini 3 Pro / Claude Sonnet / Claude Opus / GPT-5.2
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

For direct in-Figma use. The plugin can traverse, name, and apply names all within Figma.

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
5. Click "Start Naming"
6. Review AI-generated names → Apply selected

### Backend

The plugin calls a Vercel-hosted backend for AI inference. To self-host:

```bash
cd backend
npm install
# Set env vars: ANTHROPIC_API_KEY and/or OPENAI_API_KEY
vercel dev
```

Then update `apiEndpoint` in the plugin config.

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
Round 0: Figma REST API → JSON tree
Round 1: Tree summary → Gemini Flash (text-only, no images)
         → file type, pages vs noise, node IDs to name
Round 2: Per-page batched naming
         → 3 images per VLM call: page full, component grid, page highlights
         → siblings share context for consistent naming
```

## Project Structure

```
figma-namer/
├── server/                 # Express backend (Web Dashboard)
│   └── src/
│       ├── index.ts        # Server entry point (port 3456)
│       ├── routes/         # API endpoints
│       │   ├── analyze.ts  # POST /api/analyze (+ AI structure analysis)
│       │   ├── name.ts     # POST /api/name (page-based + legacy)
│       │   ├── progress.ts # GET /api/progress/:id (SSE)
│       │   └── export.ts   # GET /api/export/:id
│       ├── figma/          # Figma REST API client
│       │   ├── client.ts   # File & image API
│       │   ├── traversal.ts # Node traversal & extraction
│       │   └── tree-summarizer.ts # Condensed tree for LLM
│       ├── vlm/            # Claude, OpenAI, Gemini clients
│       ├── som/            # SoM rendering, page highlights, component grid
│       └── session/        # Session management (page-level tracking)
├── web/                    # React SPA (Vite)
│   └── src/
│       ├── App.tsx         # Main app state machine
│       ├── components/     # Dashboard, NodeCounter, BatchProgress, NamingPreview
│       └── hooks/          # useNamingFlow, useSSEProgress
├── src/                    # Figma Plugin source
│   ├── shared/             # Shared types & constants
│   ├── plugin/             # Plugin main thread
│   ├── ui/                 # Plugin React UI
│   └── vlm/                # Client-side VLM wrapper
├── backend/                # Vercel serverless (for plugin)
├── manifest.json           # Figma plugin manifest
└── package.json
```

## Supported AI Models

| Provider | Model | Best for |
|----------|-------|----------|
| **Google** | gemini-3-flash-preview | Fast & cheap (default) |
| **Google** | gemini-3-pro-preview | Best reasoning |
| **Anthropic** | claude-sonnet-4-6 | Balanced |
| **Anthropic** | claude-opus-4-6 | Most capable |
| **OpenAI** | gpt-5.2 | Best vision |

## License

MIT
