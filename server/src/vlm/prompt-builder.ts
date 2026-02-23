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

  return `You are an expert Figma layer naming assistant. Your task is to analyze a UI screenshot with numbered SoM (Set-of-Mark) labels and generate semantic layer names following the CESPC naming framework.

${CESPC_FRAMEWORK}

${platformSection}

<rules>
  <rule id="1">Analyze the VISUAL content of the marked region in the image to understand what the UI element IS.</rule>
  <rule id="2">Use the supplementary text/variable data to enrich your understanding, but rely primarily on the visual.</rule>
  <rule id="3">Generate names using the CESPC framework. Only include segments that add meaningful information.</rule>
  <rule id="4">Use lowercase with hyphens within segments, and "/" to separate segments.</rule>
  <rule id="5">Keep names concise: aim for 2-4 segments maximum.</rule>
  <rule id="6">If a node contains text, consider whether the text reveals the element's purpose (e.g., "Submit" -> button, "Username" -> input-label).</rule>
  <rule id="7">Use boundVariables to infer semantic meaning (e.g., "Surface/Danger" -> error state, "Color/Primary" -> primary variant).</rule>
  <rule id="8">Use componentProperties to detect variants and states (e.g., "State=Disabled" -> disabled).</rule>
  <rule id="9">Assign a confidence score (0.0-1.0) for each naming: 1.0 = visually obvious, 0.5 = educated guess, below 0.3 = uncertain.</rule>
  <rule id="10">If global context is provided, use it to inform the Context segment of names.</rule>
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
Analyze the attached image with SoM (Set-of-Mark) labels and generate semantic names for each marked element.
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
Analyze the attached image with SoM (Set-of-Mark) labels and generate semantic names for each marked element.

<node-supplements>
${supplementXml}
</node-supplements>

For each mark ID visible in the image, provide a semantic name following the CESPC framework.
Return a JSON object with the "namings" array. Include ALL mark IDs shown in the image.
</task>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
