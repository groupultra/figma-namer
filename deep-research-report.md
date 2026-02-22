# Deep research report on Figma REST API, Figma MCP server, and automated precise naming for Figma components & frames

## Executive summary

A robust “auto-precise naming” system for design layers (frames, components, instances, key groups) must reconcile three realities of the entity["company","Figma","design platform"] platform: (a) the public REST API is primarily **read/observe** for file content (plus select write surfaces like comments, variables, dev resources, webhooks); (b) precise layer renaming at scale is most safely executed **inside the editor via the Plugin API**, where `node.name` is writable and changes are naturally undoable in document history; and (c) when AI is involved, high-quality results require combining **structural metadata (node tree + auto-layout + variables + component properties)** with **selective screenshots** for disambiguation and semantic intent. citeturn31search10turn5view3turn22view0turn21view0turn20view0turn26view0turn27view0turn11view0turn14view0turn29view0

In practice, the strongest architecture is a hybrid: use REST + webhooks to **index and incrementally sync** design metadata (files, nodes, components, styles, variables, dev resources), while a Figma plugin performs **batch rename transactions** (with preview, conflict resolution, and rollback). Optionally, the Figma MCP server is used to pull “design context” (including variables and screenshots tooling) into agentic workflows, but you should not assume MCP can directly rename layers—its documented toolset focuses on extracting context, code generation, screenshots, and design-system rules rather than editor-side renaming primitives. citeturn15view0turn14view0turn29view0turn26view0turn27view0

A naming schema that is both **human-readable** and **LLM-friendly** should be: strictly ordered, tokenized by a small set of delimiters, backed by controlled vocabularies, and explicitly encode role, state, platform, placement, size, variant axes, interaction affordances, accessibility, language/locale, and design token bindings. The schema should also define how to name (1) main components vs component sets vs instances; (2) variant/property axes; (3) layout containers; and (4) semantic groups (e.g., “header”, “form”, “footer”), modularizing names so automated systems can confidently change only the right segments of a name. citeturn23view0turn24view2turn24view0turn27view0turn29view0

## Platform interfaces and relevant APIs

### Public REST API surface (capabilities, write limits, and what it means for naming)

The official developer documentation frames the public API as **REST-based** (and provides an official OpenAPI specification repository for that REST interface), with endpoints spanning files/nodes, images, versions, users, comments, projects, components/styles, variables, dev resources, analytics, and webhooks. citeturn16search3turn18search5turn18search2turn3search0

**Implication for automated naming:** most layer renaming workflows will consume file metadata through REST, but apply renames via the **Plugin API** (or an equivalent in-editor mechanism), because the REST “file content” endpoints are designed around retrieving a JSON scene model and related exports, not mutating layer names. citeturn5view3turn22view0turn31search17turn31search0

### Core REST endpoints for node graphs, components, styles, images, and versions

The REST “files” endpoints are the foundation for extracting structure. `GET /v1/files/:key` returns a JSON representation of a file (root `DOCUMENT` node, pages/canvases, and a full node tree unless constrained), along with helpful mappings like `components` and `styles` for resolving instance/component references. citeturn5view3turn22view0turn5view4

To target specific subtrees efficiently, `GET /v1/files/:key/nodes?ids=...` returns a `nodes` map keyed by node id, and supports key parameters that matter for automation:
- `depth` to limit traversal (avoid huge payloads)
- `geometry=paths` to include vector path geometry
- `plugin_data` to include plugin/private metadata (`pluginData` and `sharedPluginData`) for specified plugin IDs or `shared` citeturn4view4turn19search3

**Example request (abridged):**
```bash
curl -H "Authorization: Bearer $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/$FILE_KEY/nodes?ids=1:2,1:3&depth=2&geometry=paths"
```
The documented response shape includes file-level metadata (`name`, `lastModified`, `thumbnailUrl`, etc.) and a per-id payload including a `document` node and maps such as `components`, `componentSets`, and `styles`. citeturn4view4turn5view3

For visual exports, `GET /v1/images/:key?ids=...` renders images for nodes (PNG/JPG/SVG/PDF), supports `scale` (0.01–4), includes SVG options like `svg_outline_text`, can include `id` attributes, and notes operational constraints: exported image URLs expire after ~30 days, and exports over 32 megapixels are scaled down. The response can include `null` values for nodes that failed to render (e.g., non-renderable/invisible nodes). citeturn4view4turn5view3

**Example request (PNG, 2x):**
```bash
curl -H "Authorization: Bearer $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=43:2,43:9&format=png&scale=2"
```
**Example response shape (abridged, illustrative):**
```json
{
  "images": {
    "43:2": "https://s3.../render.png",
    "43:9": null
  }
}
```
(The possibility of `null` and URL expiry/size constraints are explicitly documented.) citeturn4view4

For published components and styles in libraries, “components and styles endpoints” provide metadata for team libraries (not local-only assets). For example, `GET /v1/teams/:team_id/components` is documented as a Tier 3 endpoint requiring `team_library_content:read`, and file-scoped library listing endpoints exist as well. The docs emphasize that to get metadata for local/subscribed components and styles, you should use file endpoints like `GET /v1/files/:key`. citeturn30search7turn16search10turn5view3turn5view3

Version history is accessible through the “version history” endpoints (scope `file_versions:read`). This matters for reproducibility, evaluation snapshots, and rollback strategies around naming. citeturn28view0turn3search0

### Webhooks V2 for incremental sync

Webhooks let you observe file- and library-related events, with contexts at team/project/file levels, creation via API (no dedicated UI), and explicit limits per context (e.g., max webhooks per team/project/file and overall file webhook totals by plan). citeturn11view0turn11view1

Event payloads are documented with examples. Notable events for naming pipelines include:
- `FILE_UPDATE` (fires after ~30 minutes of editing inactivity)
- `FILE_VERSION_UPDATE` (named version created)
- `LIBRARY_PUBLISH` (library published; may split into multiple events by asset type/volume)
- `DEV_MODE_STATUS_UPDATE` (handoff status change, includes node id and related dev resources) citeturn12view0turn13view0

This enables a practical pattern: ingest and cache node graphs; refresh only impacted files and/or nodes when events arrive. citeturn12view0turn13view0turn4view4

### Variables and design tokens (REST + binding metadata)

The Variables REST API provides endpoints for enumerating local variables and remote variables referenced in a file, retrieving published variables, and bulk create/update/delete for variables and collections (Enterprise/full-member requirements apply). Crucially for naming: the docs note that `GET /v1/files/:file_key` now returns a `boundVariables` property containing variable IDs, and the local variables endpoint can be used to retrieve full variable objects and collection/mode values. The published endpoint omits modes, requiring local variables for mode-level values. citeturn27view0turn24view0

In the node/property model, many types (paints, effects, type styles, component properties) can carry `boundVariables` mappings to `VariableAlias`, enabling you to propagate “token identity” into names (e.g., `token=color/bg/surface`). citeturn24view0turn24view1turn27view0

### Dev resources (REST) and Dev Mode status metadata

Dev resources endpoints allow CRUD operations over “related links” attached to nodes (`GET /v1/files/:file_key/dev_resources`, bulk POST/PUT, and DELETE). These can be leveraged to attach “source of truth” references (e.g., to code, issues, specs) and to enrich naming suggestions and confidence scoring. citeturn26view0turn13view0

### Projects and user identity endpoints

For traversing organizational structure, the Projects endpoints include `GET /v1/teams/:team_id/projects` and `GET /v1/projects/:project_id/files` (Tier 2, `projects:read`). The documentation also warns against indexing/ingesting other companies’ files. citeturn30search0turn30search10turn28view0

User identity is available via `GET /v1/me` when using OAuth authentication (Tier 3, `current_user:read`). citeturn30search1turn28view0

### Rate limits (REST) and how to engineer within them

Figma documents tiered rate limits for REST API calls, with different limits by endpoint tier (Tier 1/2/3), seat type, and plan. It also explains that the plan/location of the resource matters (e.g., a file in a Starter plan can constrain access even for a user with a Full seat elsewhere), uses a leaky-bucket algorithm, and returns `429` with a `Retry-After` header and other metadata. citeturn8view0turn10view0

From the published tables, Tier 1 endpoints (e.g., file content/images) can be extremely constrained for View/Collab seats (up to 6/month), while Dev/Full seats on paid plans have per-minute budgets; Tier 2 and Tier 3 have higher per-minute limits. Interpreting the published table structure: Dev/Full per-minute numbers appear to apply to paid plans, while Starter-plan resources remain constrained to the low-seat limits (consistent with the “Starter plan file is 6/month even if you have a Full seat elsewhere” example). citeturn8view0turn10view0turn14view0

**Engineering techniques explicitly recommended** in the docs include batching IDs into fewer requests and caching. citeturn5view2turn8view0

### GraphQL “if any”

The official developer documentation describes the public API as REST-based and provides an official OpenAPI specification for the REST API; it does not present a public GraphQL interface in its core API navigation (REST API + OpenAPI). Therefore, for planning purposes you should assume **no official public GraphQL API** is available, and build on REST + webhooks + plugin/MCP surfaces. citeturn16search3turn18search5turn18search2

### Figma MCP server specifics (what it is, tools, and limits)

Figma’s MCP server is positioned as a standardized way to bring Figma context into agentic coding tools through the Model Context Protocol. The official docs and help center distinguish a remote server and a desktop server, and enumerate server tools oriented around design-to-code, metadata extraction, variables, screenshots, and Code Connect mapping. citeturn4view1turn4view2turn15view0turn29view0

The documented MCP tools include (among others): `get_design_context`, `get_variable_defs`, `get_screenshot`, `get_metadata`, and Code Connect mapping tools; and `generate_figma_design` (Claude Code remote-only) for creating design layers from live UI captures. citeturn15view0turn4view1turn29view0

MCP server access is controlled with daily tool-call limits and per-minute rate limits by plan/seat type (e.g., higher daily tool-call limits for Enterprise; very low limits for Starter or View/Collab). citeturn14view0turn4view1

## Extracting hierarchical, layout, interaction, and visual context from Figma files

### Node-tree fundamentals and hierarchy traversal

A Figma file is explicitly modeled as a **tree of nodes** with a `DOCUMENT` root and `CANVAS` nodes representing pages. This is documented in the REST “Figma files” model and is mirrored in the plugin model. citeturn5view4turn22view0turn16search28

To extract hierarchical context at scale:
- Use `GET /v1/files/:key` for full-file inspection, but prefer `GET /v1/files/:key/nodes?ids=...&depth=...` for targeted subtrees (performance + rate limits). citeturn5view3turn4view4turn8view0
- Use `depth` strategically: depth=1 for quick indexing, depth=2–4 for frame-level context, and deeper only when needed. citeturn4view4turn8view0
- Include `plugin_data` when your pipeline relies on plugin-authored metadata (e.g., precomputed role tags, naming locks, or “do-not-rename” markers). citeturn4view4

### Layout and geometry signals (positions, auto-layout, constraints, sizing)

The REST node model (Node types catalog) documents the most relevant spatial/layout fields you need for naming inference, including:
- `absoluteBoundingBox` (absolute x/y/width/height)
- `absoluteRenderBounds` (accounts for shadows, strokes, etc.; null if invisible)
- `relativeTransform` and `size` when `geometry=paths` is requested
- auto-layout fields such as `layoutMode`, `layoutWrap`, axis sizing modes and alignments, padding and spacing, and child sizing settings (`layoutSizingHorizontal/Vertical`)
- constraints (`constraints`) for responsive intent citeturn22view0turn23view0turn24view0

On the plugin side, the corresponding properties are also documented and often easier to work with in-editor, including `layoutMode`, `layoutGrow`, `layoutPositioning` (AUTO vs ABSOLUTE in auto-layout), and `layoutWrap`. citeturn16search1turn16search7turn16search30turn3search24turn16search13

### Z-order and stacking context

For naming and semantic inference (e.g., detecting overlays, modals, dropdowns), stacking order matters. In the Plugin API, `children` is explicitly described as sorted back-to-front (first child is bottommost, last is topmost), and the order of children corresponds to layer order in the editor. citeturn16search9turn16search28

For auto-layout frames, the plugin property `itemReverseZIndex` indicates whether the first layer is drawn on top, which is essential for correctly interpreting overlays within auto-layout containers. citeturn16search17

In the underlying collaboration model, Figma also describes ordered sequences in its engineering blog (children order determined by sorting on indices). This supports treating child array order as a meaningful ordering signal. citeturn16search24

### Components, component sets, instances, variants, and overrides

For precise naming, the component model provides highly structured, low-ambiguity metadata:
- `COMPONENT` and `COMPONENT_SET` nodes add `componentPropertyDefinitions` (map of property name → definition including type/default/variantOptions). citeturn23view0turn24view2
- `INSTANCE` nodes include `componentId`, `componentProperties` (name → property including type/value and possibly `boundVariables`), and `overrides` (direct overrides). citeturn23view0turn24view0

On the plugin side, component property mechanics (including naming collisions for TEXT/BOOLEAN/INSTANCE_SWAP properties and the `#...` suffix behavior) are documented and should inform how you canonicalize property names into layer names. citeturn3search2turn31search14turn3search10

### Styles and variables “token identity”

Styles appear via file endpoints (`styles` maps), and variable bindings appear both as `boundVariables` fields on relevant node/property objects and via the Variables REST API for values/modes and collection structure. This enables naming that can encode token identities and mode contexts (e.g., light/dark, brand variants). citeturn27view0turn24view0turn4view4

### Exporting visuals for context (REST images vs plugin exportAsync)

You have two main ways to capture visuals for nodes:
- REST: `GET /v1/images/:key?ids=...` produces render URLs (expiring, size-limited; some nodes render-null). citeturn4view4turn5view3
- Plugin: `exportAsync` exports nodes to PNG/JPG/SVG/PDF and can export JSON in REST shape (`JSON_REST_V1`) for performance and consistent parsing. Export settings include `contentsOnly` and `useAbsoluteBounds` (useful for text nodes and avoiding cropping artifacts). citeturn20view0turn21view0

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Figma auto layout frame properties inspector screenshot","Figma component variants component set screenshot","Figma Dev Mode status READY_FOR_DEV screenshot"],"num_per_query":1}

## Naming schema design for human readability and LLM friendliness

### Design goals and constraints

A naming system for frames/components should satisfy:
1) **Determinism**: same input context → same name (critical for trust + repeatability). citeturn22view0turn23view0turn24view0  
2) **Edit locality**: automated steps should only mutate specific segments (e.g., state/platform) without rewriting the base role. This reduces churn and merge conflicts in design collaboration contexts. citeturn12view0turn16search24  
3) **Round-tripability**: you can parse a name back into structured attributes without guessing. citeturn24view2turn24view0  
4) **Alignment with native property models**: variant axes and token variables should map cleanly to names, rather than duplicating ambiguous free-text. citeturn23view0turn24view2turn27view0turn29view0  
5) **Safety for automation**: must support conflict resolution, locked layers, and instance-sublayer constraints. (Figma’s own “rename layers with AI” notes that layers already renamed are preserved and that instance sublayers are constrained, which should influence your own workflow design.) citeturn31search6turn23view0turn3search10  

### Proposed canonical schema

A practical, LLM-friendly, human-readable schema (proposed) is:

**Base form**
```
<domain>/<role>__<part>--<state>--<platform>--<placement>--<size>--<variant>--<interaction>--<a11y>--<lang>--<locale>--<tokens>
```

Where:
- `/` separates high-level domain taxonomy (e.g., `auth/`, `nav/`, `form/`, `commerce/`)
- `__` separates role from a sub-part (e.g., button role vs icon/text slot)
- `--` introduces ordered modifiers (fixed order; omitted segments are skipped, never reordered)
- values are lowercase, snake_case; vocab is controlled
- tokens segment uses `token:<path>` references, potentially multiple tokens joined by `+` (e.g., `token=color/bg/surface+token=radius/md`) to reflect `boundVariables` identities citeturn24view0turn27view0turn29view0

**Allowed omissions (proposed)**
- If a modifier is “default”, omit it (e.g., no `--enabled`, no `--web` if file is web-only)
- If locale is implied by file/project conventions, omit and store in plugin metadata (via `pluginData`), but keep the schema capable of representing it when needed `plugin_data=shared`. citeturn4view4turn24view0

**Variant alignment**
- Map `componentPropertyDefinitions` (VARIANT options) into `--variant` or explicit key/value pairs (e.g., `--variant:style=filled,shape=round`) depending on how many axes you have; the definitions are a canonical source of truth. citeturn23view0turn24view2turn3search2

### Naming taxonomy table (sample)

| Aspect | Examples (controlled vocabulary) | Extraction source(s) |
|---|---|---|
| role | `button`, `input`, `card`, `navbar`, `tab`, `icon`, `sheet`, `dialog`, `toast`, `list_item` | inferred from component type + text + visuals (proposed); component/instance metadata when available citeturn23view0turn29view0 |
| state | `default`, `hover`, `pressed`, `focused`, `disabled`, `loading`, `error`, `success`, `selected` | prototype interactions + component properties + heuristics (proposed) citeturn22view0turn24view3turn23view0 |
| platform | `ios`, `android`, `web`, `desktop` | file/page conventions + design system rules (proposed) citeturn29view0turn15view0 |
| placement | `top_bar`, `bottom_sheet`, `modal`, `inline`, `drawer_left`, `drawer_right`, `sticky_footer` | parent frame semantics + z-order + layout context citeturn16search9turn16search17turn22view0 |
| size | `xs`, `sm`, `md`, `lg`, `xl` | frame dimensions + layout sizing props (HUG/FILL/FIXED) citeturn22view0turn16search7turn16search1 |
| tokens | `token=color/bg/surface`, `token=radius/md`, `token=space/2` | variable bindings (`boundVariables`) + Variables REST API values/modes citeturn24view0turn27view0 |
| accessibility | `a11y:role=button`, `a11y:label=...`, `a11y:contrast=pass` | partially inferable; store computed metrics in pluginData (proposed) citeturn4view4turn29view0 |

### Concrete naming examples (40+)

The following examples implement the proposed schema style (role + modifiers). These are intentionally consistent and parseable (proposed); tokens/locale segments show how you would represent variable bindings and i18n dimensions when they matter. citeturn24view0turn27view0turn23view0turn29view0

**Buttons (12)**
- `auth/button__primary--default--android--bottom_sheet--md--variant:style=filled--tap--a11y:role=button--lang=zh--locale=zh_CN--token=color/brand/primary+token=radius/md`
- `auth/button__primary--disabled--android--bottom_sheet--md--variant:style=filled--tap--a11y:role=button--lang=zh--locale=zh_CN--token=color/brand/primary`
- `auth/button__primary--loading--android--bottom_sheet--md--variant:style=filled--tap--a11y:role=button--lang=zh--locale=zh_CN--token=color/brand/primary`
- `auth/button__secondary--default--ios--inline--sm--variant:style=outline--tap--a11y:role=button--lang=en--locale=en_US--token=color/border/default`
- `auth/button__secondary--pressed--ios--inline--sm--variant:style=outline--tap--a11y:role=button--lang=en--locale=en_US--token=color/border/active`
- `auth/button__tertiary--default--web--inline--sm--variant:style=ghost--click--a11y:role=button--lang=en--locale=en_US--token=color/text/link`
- `commerce/button__cta--default--web--sticky_footer--lg--variant:style=filled--click--a11y:role=button--lang=en--locale=en_US--token=color/brand/accent`
- `commerce/button__cta--disabled--web--sticky_footer--lg--variant:style=filled--click--a11y:role=button--lang=en--locale=en_US--token=color/brand/accent`
- `form/button__submit--focused--web--inline--md--variant:style=filled--enter_key--a11y:role=button--lang=en--locale=en_US--token=focus/ring/default`
- `nav/button__icon_only--default--ios--top_bar--sm--variant:icon=close--tap--a11y:role=button--lang=en--locale=en_US--token=color/icon/default`
- `nav/button__icon_only--disabled--ios--top_bar--sm--variant:icon=close--tap--a11y:role=button--lang=en--locale=en_US--token=color/icon/disabled`
- `system/button__danger--default--android--dialog--md--variant:style=filled--tap--a11y:role=button--lang=en--locale=en_US--token=color/semantic/danger`

**Inputs (10)**
- `form/input__text--default--android--inline--md--variant:type=email--typing--a11y:role=textbox--lang=en--locale=en_US--token=color/border/default+token=space/2`
- `form/input__text--focused--android--inline--md--variant:type=email--typing--a11y:role=textbox--lang=en--locale=en_US--token=focus/ring/default`
- `form/input__text--error--android--inline--md--variant:type=email--typing--a11y:role=textbox--lang=en--locale=en_US--token=color/semantic/error`
- `form/input__password--default--ios--inline--md--variant:reveal=true--typing--a11y:role=textbox--lang=en--locale=en_US--token=color/border/default`
- `form/input__password--error--ios--inline--md--variant:reveal=false--typing--a11y:role=textbox--lang=en--locale=en_US--token=color/semantic/error`
- `form/input__search--default--web--top_bar--md--variant:with_icon=true--typing--a11y:role=searchbox--lang=en--locale=en_US--token=color/bg/surface`
- `form/textarea__comment--default--web--inline--lg--variant:resize=none--typing--a11y:role=textbox--lang=en--locale=en_US--token=space/3`
- `form/select__country--default--web--inline--md--variant:style=filled--click--a11y:role=combobox--lang=en--locale=en_US--token=color/bg/surface`
- `form/checkbox__remember_me--checked--android--inline--sm--variant:style=default--tap--a11y:role=checkbox--lang=en--locale=en_US--token=color/brand/primary`
- `form/switch__biometric_login--on--ios--inline--sm--variant:style=default--tap--a11y:role=switch--lang=en--locale=en_US--token=color/brand/primary`

**Cards (8)**
- `commerce/card__product--default--web--grid--md--variant:layout=vertical--click--a11y:role=group--lang=en--locale=en_US--token=radius/md+token=shadow/sm`
- `commerce/card__product--hover--web--grid--md--variant:layout=vertical--hover--a11y:role=group--lang=en--locale=en_US--token=shadow/md`
- `commerce/card__product--selected--web--grid--md--variant:layout=vertical--click--a11y:role=group--lang=en--locale=en_US--token=color/border/active`
- `profile/card__user--default--ios--inline--md--variant:layout=horizontal--tap--a11y:role=group--lang=en--locale=en_US--token=radius/lg`
- `system/card__empty_state--default--android--inline--lg--variant:illustration=true--none--a11y:role=group--lang=en--locale=en_US--token=color/bg/subtle`
- `system/card__error_state--default--android--inline--lg--variant:illustration=true--none--a11y:role=group--lang=en--locale=en_US--token=color/semantic/error`
- `content/card__article--default--web--list--md--variant:with_thumbnail=true--click--a11y:role=article--lang=en--locale=en_US--token=space/4`
- `content/card__article--default--web--list--md--variant:with_thumbnail=false--click--a11y:role=article--lang=en--locale=en_US--token=space/4`

**Navigation (6)**
- `nav/navbar__primary--default--web--top_bar--lg--variant:layout=horizontal--click--a11y:role=navigation--lang=en--locale=en_US--token=color/bg/surface`
- `nav/tabbar__primary--default--android--bottom_bar--md--variant:layout=fixed--tap--a11y:role=tablist--lang=en--locale=en_US--token=color/bg/surface`
- `nav/tab__item--selected--android--bottom_bar--md--variant:icon=true--tap--a11y:role=tab--lang=en--locale=en_US--token=color/brand/primary`
- `nav/drawer__left--default--web--drawer_left--lg--variant:overlay=true--click--a11y:role=navigation--lang=en--locale=en_US--token=shadow/lg`
- `nav/breadcrumb__path--default--web--inline--sm--variant:max_items=4--click--a11y:role=navigation--lang=en--locale=en_US--token=color/text/secondary`
- `nav/pagination__controls--default--web--inline--sm--variant:style=compact--click--a11y:role=navigation--lang=en--locale=en_US--token=space/2`

**Icons (6)**
- `icon/close--default--web--inline--sm--variant:stroke=2--none--a11y:decorative=true--lang=en--locale=en_US--token=color/icon/default`
- `icon/close--disabled--web--inline--sm--variant:stroke=2--none--a11y:decorative=true--lang=en--locale=en_US--token=color/icon/disabled`
- `icon/arrow_left--default--ios--inline--sm--variant:stroke=2--none--a11y:decorative=true--lang=en--locale=en_US--token=color/icon/default`
- `icon/check--default--android--inline--sm--variant:filled=true--none--a11y:decorative=true--lang=en--locale=en_US--token=color/brand/primary`
- `icon/warning--default--web--inline--sm--variant:filled=true--none--a11y:decorative=true--lang=en--locale=en_US--token=color/semantic/warning`
- `icon/error--default--web--inline--sm--variant:filled=true--none--a11y:decorative=true--lang=en--locale=en_US--token=color/semantic/error`

## Algorithms and workflows to auto-generate names

### Overall workflow design (recommended hybrid)

Because file content is retrieved via REST and renaming is best done inside the editor, a robust workflow typically looks like: REST indexing + plugin rename execution, with webhooks for incremental triggers. This aligns with the REST API’s strengths (reading/observing + exports) and the plugin API’s strengths (editing nodes, exporting node visuals/JSON). citeturn5view3turn4view4turn11view0turn26view0turn21view0turn31search17

```mermaid
flowchart TB
  A[Webhook events: FILE_UPDATE / LIBRARY_PUBLISH] --> B[Sync service: fetch affected file_key]
  B --> C[REST: GET /v1/files/:key/meta + selective /nodes]
  C --> D[Metadata store: node tree + components + styles + variables bindings]
  D --> E[Name generator: rules + LLM (optional) + confidence]
  E --> F[Rename plan: diff list of node_id -> new_name]
  F --> G[Figma Plugin: preview + apply in transaction]
  G --> H[Verification: render snapshots + spot checks]
  H --> I[Audit log + rollback pointers]
```
The event types and the “files/nodes/images” capabilities, as well as plugin export facilities, are all documented; the particular arrangement above is a proposed architecture for naming automation. citeturn12view0turn13view0turn4view4turn5view3turn21view0turn20view0

### Rule-based naming (high precision, low cost) — core heuristics

Rule-based naming is the backbone because it is deterministic and explainable. The rules should rely on stable signals in the node/property model:

**Structural & type rules (examples, proposed):**
- If node is `COMPONENT_SET`, base role comes from the set name or a pre-tag (domain/role), while variant axes come from `componentPropertyDefinitions` and instance `componentProperties`. citeturn23view0turn24view2turn24view0
- If node is `INSTANCE`, use `componentId` and `componentProperties` to emit stabilized modifiers (`--variant:...`, `--state=...`). citeturn23view0turn24view0
- If node is a `FRAME` with `layoutMode != NONE`, treat it as a container; infer placement and structure from padding/spacing/axis alignment and child distribution. citeturn22view0turn16search1turn16search7
- If node has `absoluteRenderBounds` significantly larger than `absoluteBoundingBox`, treat it as “shadow/elevated”; this can guide naming like `--elevated` or token tags. citeturn22view0turn16search16
- Use children order and `itemReverseZIndex` to infer overlay-like topmost elements (dialogs, dropdowns). citeturn16search9turn16search17turn16search24

**Text/content heuristics (examples, proposed):**
- For button candidates, prefer frames/instances with a single primary text node child (or text + icon) and a clickable interaction defined in `interactions`. citeturn22view0turn24view3turn29view0
- Use TextNode `characters` (REST node model) to classify likely roles (e.g., “Sign in” → auth submit). citeturn22view0turn29view0

**Token heuristics (examples, proposed):**
- When `boundVariables` are present on fills/effects/text styles, prefer including token IDs/names rather than raw colors, enabling stable names even if values change by mode. citeturn24view0turn27view0turn29view0

### ML / vision + LLM hybrid (disambiguation and semantic intent)

Figma’s own MCP framing emphasizes that screenshots plus structured metadata outperform either alone for design intent tasks (e.g., distinguishing interactive imagery or understanding high-level flow context). This supports a hybrid approach: rules first, then escalate to multimodal reasoning only when ambiguity remains. citeturn29view0turn15view0turn21view0turn4view4

A practical hybrid pipeline (proposed):
1) Generate a candidate name from rules and component properties.
2) Render:
   - node-only image (tight bounds)
   - parent-frame crop with margin (context)
   - optionally annotate with bounding boxes (mask) derived from `absoluteBoundingBox` coordinates. citeturn22view0turn4view4turn21view0
3) Ask a multimodal model to confirm the role/state/placement and propose corrections, but **constrain output** to your controlled vocabulary and segment ordering.
4) Compute confidence scores and require human review below threshold.

### Confidence scoring (proposed, evidence-oriented)

A confidence score can be rooted in the presence of authoritative signals:
- **High confidence** when:
  - node is an instance of a known component set,
  - variant axes fully resolved from `componentProperties`,
  - token bindings present (`boundVariables`) for key style fields,
  - placement inferred from stable container semantics. citeturn23view0turn24view0turn22view0turn27view0
- **Medium confidence** when:
  - text heuristics dominate,
  - visuals used without strong component metadata. citeturn29view0turn4view4turn22view0
- **Low confidence** when:
  - node is unnamed generic frames (“Frame 1”) with little structure,
  - node render fails (`images[id]=null`),
  - layout is absolute-positioned collage without auto-layout signals. citeturn4view4turn22view0turn16search30

### Conflict resolution and stable identifiers

Conflicts are inevitable (duplicate roles in the same container, repeated icons, etc.). A conflict policy (proposed) should:
- Prefer semantic disambiguators already present in the model:
  - sibling index in parent’s child order (z-order/back-to-front) citeturn16search9turn16search24
  - grid position (row/column span/anchor for GRID layout) citeturn22view0
  - constraints / layout positioning (ABSOLUTE vs AUTO) citeturn16search30turn16search13
- Only as a last resort, append a short stable suffix derived from node id (e.g., `~43_2`) stored in pluginData so it can be hidden from human-visible naming if desired (proposed; pluginData retrieval is supported by REST via `plugin_data`, and nodes globally have stable IDs within a document). citeturn5view4turn4view4turn21view0turn31search15

### Batch renaming, preview, undo, and safety in the plugin

In the Plugin API, node names can be edited via the `name` property (including documented behaviors such as TextNode auto-rename rules). A plugin-run batch rename can:
- compute a rename plan (node id → new name),
- show a preview diff,
- apply in one step (so a single Undo can revert, depending on how you implement the edit batch),
- respect locked/hidden filtering and instance constraints (also aligned with Figma’s own “rename layers with AI” guidance). citeturn31search0turn31search6turn22view0turn16search28

## Incorporating screenshots and visual context

### Capture strategies (recommended)

A “multi-scale” capture strategy (proposed) improves semantic classification while controlling cost:

1) **Node-tight render**  
   - REST: `GET /v1/images/:key?ids=<node>&scale=...` citeturn4view4  
   - Plugin: `node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } })` citeturn20view0turn21view0  

2) **Context render** (parent frame or section)  
   Render the containing frame and crop around the node using relative coordinates from `absoluteBoundingBox` (REST node model) to preserve placement semantics like “in bottom sheet” or “in top bar.” citeturn22view0turn29view0

3) **Mask/overlay render (proposed)**  
   Produce a simple annotation (e.g., rectangular highlight) in the downstream system; in-plugin you can also generate PNGs and overlay in the UI. Export settings like `useAbsoluteBounds` can help reduce cropping surprises (notably for text). citeturn21view0turn20view0turn29view0

4) **Vector-first for icons**  
   When classifying icons, also export SVG (REST image endpoint supports SVG format; plugin export supports SVG_STRING) to detect geometric simplicity and avoid raster ambiguities. citeturn4view4turn21view0turn20view0

### Metadata embedding and prompt packaging

Figma’s own MCP guidance highlights that the best outcomes come from combining screenshots with “pattern metadata” (components, variables, styles). Thus, the packaging you send to a model should include:
- node type + id + current name
- bounding box + layout props
- component set + component properties (if instance)
- variable bindings (`boundVariables`) and resolved variable names/values by mode when relevant
- z-order position within parent (children order) citeturn29view0turn23view0turn24view0turn22view0turn16search9turn27view0

### Prompt templates (visual + text LLM)

Below are **sample prompt templates** (proposed) that enforce controlled vocabularies and structured outputs.

**Template A: classify role/state/placement**
```text
You are assisting with deterministic layer naming for a Figma design system.

INPUTS:
- node_metadata: {id, type, current_name, absoluteBoundingBox, layoutMode, constraints, interactions_summary}
- component_context: {is_instance, component_set_name, component_properties}
- token_bindings: {boundVariables_summary}
- parent_context: {parent_name, parent_layoutMode, sibling_summary}
- images:
  1) node_tight.png
  2) parent_context_crop.png (node highlighted)

TASK:
1) Choose ROLE from: [button, input, card, navbar, tab, icon, dialog, bottom_sheet, toast, list_item, ...]
2) Choose STATE from: [default, hover, pressed, focused, disabled, loading, error, success, selected]
3) Choose PLACEMENT from: [inline, top_bar, bottom_bar, bottom_sheet, dialog, drawer_left, drawer_right, grid, list]
4) Output JSON only:
{
  "role": "...",
  "state": "...",
  "placement": "...",
  "notes": "...",
  "confidence": 0.0-1.0,
  "evidence": ["which signals you used (componentProperties, interactions, layoutMode, screenshot cues)"]
}

CONSTRAINTS:
- Never invent new vocabulary.
- If uncertain, lower confidence and explain ambiguity in notes.
```
Rationale: aligns with MCP’s recommendation to combine screenshots with known components/variables metadata, and uses well-defined node/layout fields available in the file model. citeturn29view0turn22view0turn23view0turn24view0

**Template B: propose full canonical name (segment-locked)**
```text
You must produce a canonical name in this exact modifier order:
<domain>/<role>__<part>--<state>--<platform>--<placement>--<size>--<variant>--<interaction>--<a11y>--<lang>--<locale>--<tokens>

Given:
- domain_hint: "auth"
- platform_hint: "android"
- size_hint: "md"
- interaction_hint: derived from interactions ("tap" | "click" | "typing" | "none")
- a11y_hint: (role=button/textbox/nav/etc)
- locale: zh_CN
- tokens: ["token=color/brand/primary", "token=radius/md"]

Return:
1) name: <string>
2) parsed: JSON fields for each segment
3) confidence + reasons

Hard rules:
- Omit segments only if they are default OR missing.
- Use snake_case in values.
- Do not include node ids in the name unless asked.
```
This template is designed to “keep output constrained,” which is the key practical lesson when combining automated context extraction with LLM generation. citeturn29view0turn15view0

## Integration architecture, security, and implementation plan

### Reference architecture

```mermaid
flowchart LR
  subgraph Figma
    W[Webhooks V2]
    R[REST API: files/nodes/images/variables/dev_resources]
    P[Plugin: rename + exportAsync + JSON_REST_V1]
    M[MCP server: context + screenshots + variables + Code Connect]
  end

  W --> S[Sync worker]
  S --> R
  R --> DB[(Metadata Store)]
  DB --> N[Name Engine]

  N --> Q[Rename Queue / Plan]
  Q --> UI[Designer UI (Plugin modal / web dashboard)]
  UI --> P
  P --> DB

  N -->|optional disambiguation| V[Vision/LLM Service]
  V --> N

  M -->|optional: agentic assistants| V
```

This diagram assembles documented building blocks (webhooks, REST, plugin exportAsync, MCP tools) into a proposed end-to-end architecture suited for naming automation. citeturn11view0turn4view4turn20view0turn21view0turn15view0turn14view0

### Data flow and storage (practical considerations)

Because REST rate limits can be tight (especially for Starter or low-seat contexts) and because webhooks can deliver coarse events like “file updated,” you should store:
- normalized node graph snapshots keyed by `(file_key, version)` (using version history IDs where possible) citeturn4view4turn8view0turn3search0
- derived features: role candidates, container inference, token bindings, interaction summaries citeturn22view0turn24view0turn24view3turn27view0
- visual artifacts: either cached render URLs (with expiry) or stored PNG bytes (from plugin export) depending on your security posture and retention needs citeturn4view4turn20view0turn21view0

### Authentication, permissions, and compliance

REST requests must be authenticated via OAuth2 or personal access tokens; some APIs require OAuth apps; scopes do not override underlying file permissions. The platform has tightened OAuth app publishing requirements and scope granularity (notably updated around November 17, 2025). citeturn28view1turn28view0turn28view2turn9view0

The docs also warn against indexing/ingesting other companies’ Figma files—your system should enforce plan/org boundaries and ensure users only process files they have access to. citeturn30search10turn28view0

### Performance and rate-limit strategy

A rate-limit-safe design should:
- Prefer `files/:key/nodes?ids=...` batching and caching, as recommended by Figma’s own rate-limit guidance citeturn8view0turn4view4
- Use webhooks to reduce polling and limit full-file refreshes citeturn11view0turn12view0
- Provide graceful `429` handling (respect `Retry-After`), and surface “upgrade link” guidance if needed citeturn8view0turn10view0
- Push heavy serialization tasks into the plugin using `exportAsync({format:"JSON_REST_V1"})` for selected nodes when designers explicitly choose a scope to rename (reducing server-side ingestion). citeturn21view0turn20view0turn15view0

### Designer/developer UI and rollback

A minimal but effective UI (proposed) typically includes:
- scope selection: current selection / current page / selected frames / component set citeturn16search28turn30search2
- preview table: old name → proposed name + confidence + reasons
- filters: only unnamed or “Frame \d+” patterns; exclude locked/hidden; exclude instance sublayers unless operating at component level citeturn31search6turn23view0turn22view0
- apply button: commits in one batch (so Undo works naturally)
- audit log: store rename plan + timing + file version id; optionally attach a Dev Resource link or comment for traceability citeturn26view0turn16search25turn3search0

### Implementation plan, milestones, stack options, evaluation, and effort

**Budget:** unspecified (as requested). citeturn27view0turn8view0

**Milestones (proposed)**

**Foundation**
- Define naming taxonomy + controlled vocab + parsing/validation library
- Implement REST ingestion for files/nodes, variables, and components/styles metadata
- Set up webhook receiver for `FILE_UPDATE`, `LIBRARY_PUBLISH`, `DEV_MODE_STATUS_UPDATE` triggers citeturn12view0turn13view0turn4view4turn27view0turn30search7

**Plugin renamer MVP**
- Build a plugin using official typings (`@figma/plugin-typings`) citeturn18search4turn18search0
- Implement selection/page traversal and rename planning
- Apply renames via `node.name`, with preview UI and a single-batch apply where possible
- Add “export context” button to attach `JSON_REST_V1` + PNG snapshots for hard cases citeturn31search0turn21view0turn20view0

**Hybrid intelligence**
- Add screenshot capture (node + contextual crop) using REST images or `exportAsync`
- Add LLM prompt templates with constrained outputs and integrate confidence scoring
- Add conflict resolver and “locked segments” so LLM edits only allowed modifiers citeturn4view4turn21view0turn29view0turn24view2

**Enterprise/scale hardening**
- Incremental sync by webhooks + caching
- Rate-limit aware scheduler (batching + backoff)
- Security review: OAuth scope minimization, least-privilege, data retention policy aligned to plan/org boundaries citeturn8view0turn28view0turn28view2turn30search10

**Tech stack options (examples; proposed)**
- Plugin: TypeScript + official typings; UI in vanilla HTML/React/Svelte (bundled) citeturn18search4turn18search15
- Backend: Node.js or Python; store in Postgres for graph metadata; blob store for images if needed (storage provider unspecified)
- API client typing: use `@figma/rest-api-spec` to keep request/response types aligned to official spec citeturn18search2turn18search5
- Optional MCP integration for agentic assistants working in IDEs (tool call budgets apply) citeturn15view0turn14view0

**Evaluation metrics (proposed)**
- Name correctness: human audit pass rate per component category
- Determinism: identical input snapshot → identical output name
- Stability: churn rate (how often names change across runs without meaningful design change)
- Coverage: % of target nodes renamed with confidence ≥ threshold
- Designer time saved: actions avoided vs manual rename (measured in user studies; measurement design unspecified) citeturn8view0turn29view0turn31search1

**Estimated effort:** unspecified budget; effort depends heavily on scope (which parts of the file tree, how strict the taxonomy, whether to include multimodal LLM services, and which plans/seats must be supported). Hard constraints like rate limits and Enterprise-only APIs (variables) can materially affect timelines. citeturn8view0turn27view0turn14view0