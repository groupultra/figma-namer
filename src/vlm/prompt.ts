// ============================================================
// Figma Namer - Module C: Prompt Engineering
// Builds structured system & user prompts for VLM (CESPC naming)
// ============================================================

/**
 * Supplementary text metadata for a single marked node.
 * Sent alongside the image to prevent OCR hallucination.
 */
export interface NodeSupplement {
  /** SoM numeric mark ID displayed on the annotated image */
  markId: number;
  /** Actual text content extracted from the Figma node (null if non-text) */
  textContent: string | null;
  /** Design variable / token names bound to this node */
  boundVariables: string[];
  /** Component instance properties (key-value pairs) */
  componentProperties: Record<string, string>;
}

// ------------------------------------------------------------------
// System Prompt Builder
// ------------------------------------------------------------------

/**
 * Builds the full system prompt for the VLM.
 *
 * The prompt uses XML tag structure for clarity and reliable parsing
 * by both Claude and GPT-4V. It encodes the complete CESPC naming
 * framework, few-shot examples, and strict output constraints.
 *
 * @param globalContext - User-provided scene description
 *   (e.g. "This is the checkout flow for a food-delivery mobile app")
 * @param platform - Target platform: "iOS", "Android", "Web", or ""
 * @returns The full system prompt string
 */
export function buildSystemPrompt(
  globalContext: string,
  platform: string,
): string {
  const platformClause = platform && platform !== 'Auto'
    ? `The target platform is **${platform}**. Incorporate platform-specific conventions where applicable (e.g. iOS uses "NavigationBar", Android uses "TopAppBar", Web uses "Navbar").`
    : 'No specific platform has been specified. Omit the Platform segment from the name unless the visual design clearly implies a specific platform convention.';

  return `<role_definition>
You are a world-class UI/UX architect and front-end componentization expert with 15+ years of experience in design systems at companies like Apple, Google, and Airbnb. You specialize in semantic layer naming for large-scale design files. Your task is to analyze an annotated UI screenshot and assign precise, semantically meaningful names to every marked layer following the CESPC naming framework defined below.
</role_definition>

<global_context>
${globalContext || 'No additional context was provided by the designer. Infer the UI context from the visual content of the screenshot.'}

${platformClause}
</global_context>

<naming_rules>
## CESPC Naming Framework

Every layer name MUST follow this structured format:

\`[Context] [Element] - [State] - [Platform] - [Modifier]\`

Where:

1. **Context** (REQUIRED) - The business/feature area the element belongs to.
   Examples: Login, Checkout, UserProfile, ShoppingCart, Dashboard, Settings,
   Onboarding, Search, ProductDetail, Notifications, Chat, Calendar, OrderHistory

2. **Element** (REQUIRED) - The UI component type, using widely recognized names.
   Examples: Button, TextField, Dropdown, BottomSheet, Carousel, Card, Avatar,
   NavigationBar, TabBar, Toggle, Checkbox, RadioButton, Slider, ProgressBar,
   Modal, Toast, Badge, Chip, Divider, Icon, Image, Label, ListItem, SearchBar,
   Stepper, ToolTip, Snackbar, FAB, SegmentedControl, DatePicker, Tag

3. **State** (REQUIRED when visually distinguishable; otherwise use "Default") -
   The current interaction or visual state.
   Examples: Default, Hover, Pressed, Disabled, Focused, Active, Error, Loading,
   Selected, Expanded, Collapsed, Empty, Filled, Success, Warning

4. **Platform** (OPTIONAL - include only when a clear platform convention applies) -
   Target platform hint.
   Values: iOS, Android, Web

5. **Modifier** (OPTIONAL - include only when needed to differentiate variants) -
   Additional descriptors for size, priority, or theme.
   Examples: Primary, Secondary, Tertiary, Large, Small, Compact, Outlined, Ghost,
   Rounded, Dark, Light, Inverted

### Separator Rules
- Use a SINGLE SPACE between Context and Element: \`Login Button\`
- Use \` - \` (space-dash-space) between subsequent segments: \`Login Button - Disabled\`
- Omit trailing segments that are not applicable. Do NOT include empty dashes.

### Special Guidelines
- For **container / layout frames**, name by their structural role:
  \`Login Form Container\`, \`Dashboard Header Row\`, \`Cart ItemList\`
- For **text labels**, include the semantic role, not the literal text:
  \`Login Title Label\`, \`Product Price Label\`, \`Cart EmptyState Message\`
- For **icons**, describe the semantic meaning:
  \`Search Icon\`, \`Settings NavigationBar BackArrow Icon\`
- For **images / illustrations**, describe the content role:
  \`Onboarding HeroImage\`, \`Product Thumbnail Image\`
- NEVER use the literal text content as the entire name. The name must describe
  the element's role, not echo its displayed text.
- Keep names under 80 characters. Aim for 20-50 characters.
- Use PascalCase for multi-word segments within each part (e.g. "ShoppingCart", "BottomSheet").
</naming_rules>

<few_shot_examples>
Below are examples demonstrating correct CESPC naming and common mistakes.

### GOOD Examples

| Mark | Visual Description | Correct Name |
|------|-------------------|--------------|
| #1 | A large blue button labeled "Sign In" at the bottom of a login form | Login Button - Default - Primary |
| #2 | A text input field with placeholder "Email address" inside a login form, showing a red border | Login TextField - Error |
| #3 | A horizontal scrollable row of product cards on a home screen | Home Carousel - Default |
| #4 | A bottom navigation bar with 5 icons (Home, Search, Cart, Favorites, Profile) | App TabBar - Default - iOS |
| #5 | A small avatar circle image next to a username in a comment section | Comment Avatar Image - Default - Small |
| #6 | A floating round button with a "+" icon in the bottom-right corner | Dashboard FAB - Default - Primary |
| #7 | A modal overlay with a title "Delete Item?" and two buttons | Cart DeleteConfirmation Modal - Default |
| #8 | A grayed-out "Submit" button at the end of a form | Checkout SubmitButton - Disabled |

### BAD Examples (and why they are wrong)

| Mark | Bad Name | Problem | Corrected Name |
|------|----------|---------|----------------|
| #1 | Sign In | Just the button text, no semantic role | Login Button - Default - Primary |
| #2 | Frame 243 | Default Figma auto-name, completely meaningless | Login TextField - Error |
| #3 | Group 17 | Default Figma auto-name | Home Carousel - Default |
| #4 | Rectangle 5 | Shape name, not a semantic name | App TabBar - Default - iOS |
| #5 | img_user | Cryptic abbreviation with underscore | Comment Avatar Image - Default - Small |
| #6 | Button | Too generic, missing context and state | Dashboard FAB - Default - Primary |
| #7 | Popup | Vague; no context, no specificity | Cart DeleteConfirmation Modal - Default |
| #8 | button-disabled-checkout-submit-large-primary | Kebab-case, wrong order, too many segments | Checkout SubmitButton - Disabled |
</few_shot_examples>

<anti_hallucination_notice>
CRITICAL: Each marked node may include supplementary text metadata in the user message.
When provided, you MUST treat the "textContent" field as the ground-truth text displayed
inside that element. Do NOT infer or hallucinate text from the image that contradicts the
provided textContent. If the textContent is null, the element does not contain readable text.
Similarly, use "boundVariables" and "componentProperties" to inform your naming (e.g. a
variable named "Colors/Danger/Default" suggests an error or danger state).
</anti_hallucination_notice>

<output_instruction>
You MUST respond with a JSON array and NOTHING else. No explanations, no markdown fences,
no commentary before or after the JSON.

Each element in the array corresponds to one marked node in the image:

[
  {
    "markId": <number>,
    "name": "<CESPC-formatted name>",
    "confidence": <number between 0.0 and 1.0>
  }
]

Rules:
- Include exactly one entry per markId provided in the user message.
- "markId" must match the numeric labels visible on the annotated screenshot.
- "name" must strictly follow the CESPC framework defined above.
- "confidence" reflects how certain you are about the naming (1.0 = very certain,
  0.5 = moderate guess, below 0.3 = low confidence).
- Output ONLY the raw JSON array. No \`\`\`json fences, no preamble, no postscript.
</output_instruction>`;
}

// ------------------------------------------------------------------
// User Prompt Builder
// ------------------------------------------------------------------

/**
 * Builds the user message for a single VLM batch.
 *
 * This message accompanies the annotated screenshot and provides
 * textual supplements for each marked node to prevent OCR errors.
 *
 * @param nodeSupplements - Array of supplementary data per marked node
 * @returns The formatted user prompt string
 */
export function buildUserPrompt(nodeSupplements: NodeSupplement[]): string {
  const nodeDescriptions = nodeSupplements.map((node) => {
    const parts: string[] = [`<node markId="${node.markId}">`];

    // Text content (ground truth to prevent OCR hallucination)
    if (node.textContent !== null && node.textContent.length > 0) {
      parts.push(`  <textContent>${escapeXml(node.textContent)}</textContent>`);
    } else {
      parts.push(`  <textContent>null</textContent>`);
    }

    // Bound design variables / tokens
    if (node.boundVariables.length > 0) {
      parts.push(`  <boundVariables>${node.boundVariables.join(', ')}</boundVariables>`);
    }

    // Component instance properties
    const propEntries = Object.entries(node.componentProperties);
    if (propEntries.length > 0) {
      const propStr = propEntries.map(([k, v]) => `${k}=${v}`).join(', ');
      parts.push(`  <componentProperties>${propStr}</componentProperties>`);
    }

    parts.push(`</node>`);
    return parts.join('\n');
  });

  const markIds = nodeSupplements.map((n) => n.markId);

  return `Analyze the annotated screenshot above. The image contains ${nodeSupplements.length} marked UI elements with numeric labels.

<node_supplements>
${nodeDescriptions.join('\n\n')}
</node_supplements>

Assign a CESPC-formatted name to each of the following markIds: [${markIds.join(', ')}].

Remember:
- Use the textContent provided above as ground truth. Do NOT hallucinate text from the image.
- Follow the CESPC naming format strictly: [Context] [Element] - [State] - [Platform] - [Modifier]
- Respond with ONLY a raw JSON array. No markdown, no commentary.`;
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Escapes special XML characters in a string to prevent injection
 * or parsing issues when embedding user-generated text in XML tags.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
