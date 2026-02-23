// ============================================================
// Figma Namer - Prompt Builder (server/src/vlm/)
// Copied from backend/src/vlm/prompt-builder.ts for standalone use
// ============================================================

export interface NodeSupplement {
  markId: number;
  textContent: string | null;
  boundVariables: string[];
  componentProperties: Record<string, string>;
}

const CESPC_FRAMEWORK = `
<naming-framework name="CESPC">
  <description>
    CESPC (Context-Element-State-Property-Category) is a hierarchical naming
    convention for Figma design layers. It produces concise, semantic names
    that reflect the UI role of each element rather than its visual appearance.
  </description>

  <segments>
    <segment name="Context" optional="true">
      The screen or section where the element lives.
      Examples: auth, settings, dashboard, onboarding, checkout
    </segment>
    <segment name="Element" required="true">
      The UI component type or role.
      Examples: button, card, input, header, nav, modal, avatar, badge, tab, list
    </segment>
    <segment name="State" optional="true">
      The interactive or visual state.
      Examples: default, hover, pressed, disabled, active, selected, error, loading
    </segment>
    <segment name="Property" optional="true">
      A distinguishing variant or attribute.
      Examples: primary, secondary, large, small, outlined, filled, icon-only
    </segment>
    <segment name="Category" optional="true">
      Additional semantic grouping or purpose.
      Examples: container, wrapper, content, label, icon, image, divider
    </segment>
  </segments>

  <format>
    Segments are joined with "/" to form the full name.
    Use lowercase and hyphens within each segment.
    Only include segments that add meaningful information.
    Maximum depth: 3-4 segments for most elements.
  </format>

  <examples>
    <example>
      <visual>A blue primary button with "Sign In" text</visual>
      <name>auth/button/primary</name>
    </example>
    <example>
      <visual>A card containing user profile info</visual>
      <name>profile/card/container</name>
    </example>
    <example>
      <visual>A text input field with red error border</visual>
      <name>form/input/error</name>
    </example>
    <example>
      <visual>A navigation bar at the top</visual>
      <name>nav/header</name>
    </example>
    <example>
      <visual>A modal dialog overlay for confirming deletion</visual>
      <name>modal/confirm-delete/container</name>
    </example>
    <example>
      <visual>A search icon inside a search bar</visual>
      <name>search/icon</name>
    </example>
    <example>
      <visual>A horizontal list of product cards</visual>
      <name>products/list/horizontal</name>
    </example>
    <example>
      <visual>A disabled submit button in a checkout form</visual>
      <name>checkout/button/disabled</name>
    </example>
    <example>
      <visual>A user avatar thumbnail in comments section</visual>
      <name>comments/avatar/thumbnail</name>
    </example>
    <example>
      <visual>A toggle switch in settings, currently on</visual>
      <name>settings/toggle/active</name>
    </example>
  </examples>
</naming-framework>`;

const PLATFORM_GUIDELINES: Record<string, string> = {
  iOS: `
<platform-guidelines platform="iOS">
  - Prefer Apple HIG terminology: NavigationBar, TabBar, Sheet, Alert
  - Use camelCase segment names where it matches iOS conventions
  - Consider safe area, Dynamic Island, and iOS layout patterns
  - Common iOS patterns: nav-bar, tab-bar, sheet, action-sheet, segmented-control
</platform-guidelines>`,
  Android: `
<platform-guidelines platform="Android">
  - Prefer Material Design terminology: AppBar, FAB, BottomSheet, Snackbar
  - Consider Material You / M3 component names
  - Common Android patterns: app-bar, bottom-nav, fab, chip, bottom-sheet
</platform-guidelines>`,
  Web: `
<platform-guidelines platform="Web">
  - Use standard web component terminology: header, nav, sidebar, footer, modal
  - Consider semantic HTML element names as reference
  - Common web patterns: header, sidebar, breadcrumb, dropdown, tooltip, toast
</platform-guidelines>`,
  Auto: '',
};

export function buildSystemPrompt(
  globalContext: string,
  platform: string,
): string {
  const platformSection =
    PLATFORM_GUIDELINES[platform] || PLATFORM_GUIDELINES['Auto'] || '';

  return `You are an expert Figma layer naming assistant. Your task is to analyze UI screenshots and generate semantic layer names following the CESPC naming framework.

You will receive TWO images:
  Image 1: The full frame / screen — use this to understand the overall UI context.
  Image 2: A close-up with numbered SoM (Set-of-Mark) labels highlighting the specific elements to name.

${CESPC_FRAMEWORK}

${platformSection}

<rules>
  <rule id="1">Use Image 1 (full frame) to understand the screen context and purpose.</rule>
  <rule id="2">Use Image 2 (annotated close-up) to identify which elements need naming — each is marked with a numbered label.</rule>
  <rule id="3">Analyze the VISUAL content of each marked region to understand what the UI element IS.</rule>
  <rule id="4">Use the supplementary text/variable data to enrich your understanding, but rely primarily on the visual.</rule>
  <rule id="5">Generate names using the CESPC framework. Only include segments that add meaningful information.</rule>
  <rule id="6">Use lowercase with hyphens within segments, and "/" to separate segments.</rule>
  <rule id="7">Keep names concise: aim for 2-4 segments maximum.</rule>
  <rule id="8">If a node contains text, consider whether the text reveals the element's purpose (e.g., "Submit" -> button, "Username" -> input-label).</rule>
  <rule id="9">Use boundVariables to infer semantic meaning (e.g., "Surface/Danger" -> error state, "Color/Primary" -> primary variant).</rule>
  <rule id="10">Use componentProperties to detect variants and states (e.g., "State=Disabled" -> disabled).</rule>
  <rule id="11">Assign a confidence score (0.0-1.0) for each naming: 1.0 = visually obvious, 0.5 = educated guess, below 0.3 = uncertain.</rule>
  <rule id="12">If global context is provided, use it to inform the Context segment of names.</rule>
</rules>

<global-context>${globalContext || 'No specific context provided.'}</global-context>

<output-format>
  You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.
  The JSON must match this exact structure:
  {
    "namings": [
      {
        "markId": <number>,
        "name": "<string>",
        "confidence": <number between 0 and 1>
      }
    ]
  }
</output-format>`;
}

export function buildUserPrompt(supplements: NodeSupplement[]): string {
  if (supplements.length === 0) {
    return `<task>
Image 1 is the full screen context. Image 2 has numbered SoM labels on the elements to name.
Analyze each marked element and generate semantic names.
No supplementary metadata is available for this batch.
Return a JSON object with the "namings" array.
</task>`;
  }

  const supplementXml = supplements
    .map((s) => {
      const parts: string[] = [`    <mark id="${s.markId}">`];

      if (s.textContent) {
        parts.push(`      <text>${escapeXml(s.textContent)}</text>`);
      }

      if (s.boundVariables.length > 0) {
        parts.push(
          `      <bound-variables>${s.boundVariables.map(escapeXml).join(', ')}</bound-variables>`,
        );
      }

      const propEntries = Object.entries(s.componentProperties);
      if (propEntries.length > 0) {
        const propStr = propEntries
          .map(([k, v]) => `${escapeXml(k)}=${escapeXml(v)}`)
          .join(', ');
        parts.push(
          `      <component-properties>${propStr}</component-properties>`,
        );
      }

      parts.push(`    </mark>`);
      return parts.join('\n');
    })
    .join('\n');

  return `<task>
Image 1 is the full screen context. Image 2 has numbered SoM labels on the elements to name.
Analyze each marked element and generate semantic names.

<node-supplements>
${supplementXml}
</node-supplements>

For each mark ID visible in Image 2, provide a semantic name following the CESPC framework.
Return a JSON object with the "namings" array. Include ALL mark IDs shown.
</task>`;
}

// ============================================================
// Structure Analysis Prompt (Round 1 - text only, no images)
// ============================================================

export function buildStructureAnalysisPrompt(
  treeSummary: string,
  globalContext: string,
): { system: string; user: string } {
  const system = `You are an expert at understanding Figma file structures. Your task is to analyze a condensed tree summary of a Figma file and classify its content.

You will receive a text-only tree summary showing the hierarchy of nodes with their IDs, names, types, dimensions, and child counts. NO images are provided.

<objectives>
1. Classify the file type: app-screens, component-library, icon-library, mixed, landing-page, or unknown
2. Identify which top-level nodes are actual UI pages/screens vs auxiliary elements (notes, annotations, arrows, dividers, labels)
3. For each real page, list the node IDs of children that need semantic naming
4. Handle duplicate page names by noting distinguishing characteristics from their children
</objectives>

<auxiliary-patterns>
Elements that are typically auxiliary (noise):
- Nodes named "Notes", "Annotations", "TODO", "Label", "Arrow", "Divider", "Separator", "---"
- Very narrow or very tall rectangles (divider lines)
- Standalone TEXT nodes at the top level
- Frames with no children or only TEXT children (comment frames)
- Nodes with dimensions suggesting they are not screens (e.g., < 100px in both dimensions)
</auxiliary-patterns>

<rules>
1. A "page" is a top-level FRAME, COMPONENT, or SECTION that represents a complete UI screen or component view
2. Auxiliary elements should have isAuxiliary=true and empty nodeIdsToName
3. For pages, list child node IDs that have default names (Frame 1, Group 2, etc.) or are INSTANCE/COMPONENT types — these need naming
4. Maximum 500 total nodes across all pages' nodeIdsToName arrays
5. If two pages share the same name, explain their differences in the pageRole field
</rules>

<global-context>${globalContext || 'No specific context provided.'}</global-context>

<output-format>
You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.
The JSON must match this exact structure:
{
  "fileType": "app-screens" | "component-library" | "icon-library" | "mixed" | "landing-page" | "unknown",
  "reasoning": "<brief explanation of classification>",
  "pages": [
    {
      "nodeId": "<figma node ID>",
      "name": "<display name>",
      "pageRole": "<description of what this page/screen represents>",
      "isAuxiliary": false,
      "nodeIdsToName": ["<child-id-1>", "<child-id-2>", ...]
    }
  ]
}
</output-format>`;

  const user = `<task>
Analyze the following Figma file tree summary and classify its structure.
Identify pages vs auxiliary elements, and list which nodes need naming.

<tree-summary>
${treeSummary}
</tree-summary>

Return a JSON object with fileType, reasoning, and pages array.
</task>`;

  return { system, user };
}

/**
 * Build a naming prompt that supports 3 images:
 * Image 1: Full page screenshot (shared context)
 * Image 2: Component crop/grid (detail view)
 * Image 3: Page with highlight annotations (showing where components are)
 */
export function buildSystemPromptWithPageContext(
  globalContext: string,
  platform: string,
): string {
  const platformSection =
    PLATFORM_GUIDELINES[platform] || PLATFORM_GUIDELINES['Auto'] || '';

  return `You are an expert Figma layer naming assistant. Your task is to analyze UI screenshots and generate semantic layer names following the CESPC naming framework.

You will receive UP TO THREE images:
  Image 1: The full page / screen — use this to understand the overall UI context.
  Image 2: A close-up grid or crop showing the specific components to name, each marked with a numbered label.
  Image 3 (if provided): The full page with highlight boxes and numbers showing where each component is located.

${CESPC_FRAMEWORK}

${platformSection}

<rules>
  <rule id="1">Use Image 1 (full page) to understand the screen context and purpose.</rule>
  <rule id="2">Use Image 2 (component detail/grid) to see each element up close — each is marked with a numbered label.</rule>
  <rule id="3">Use Image 3 (page highlights) to understand where each numbered element sits within the full page layout.</rule>
  <rule id="4">Analyze the VISUAL content of each marked region to understand what the UI element IS.</rule>
  <rule id="5">Use the supplementary text/variable data to enrich your understanding, but rely primarily on the visual.</rule>
  <rule id="6">Generate names using the CESPC framework. Only include segments that add meaningful information.</rule>
  <rule id="7">Use lowercase with hyphens within segments, and "/" to separate segments.</rule>
  <rule id="8">Keep names concise: aim for 2-4 segments maximum.</rule>
  <rule id="9">Components on the same page are siblings — use consistent Context segments for them.</rule>
  <rule id="10">If a node contains text, consider whether the text reveals the element's purpose.</rule>
  <rule id="11">Assign a confidence score (0.0-1.0) for each naming.</rule>
  <rule id="12">If global context is provided, use it to inform the Context segment of names.</rule>
</rules>

<global-context>${globalContext || 'No specific context provided.'}</global-context>

<output-format>
  You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.
  The JSON must match this exact structure:
  {
    "namings": [
      {
        "markId": <number>,
        "name": "<string>",
        "confidence": <number between 0 and 1>
      }
    ]
  }
</output-format>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
