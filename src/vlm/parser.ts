// ============================================================
// Figma Namer - Module C: VLM Response Parser
// Extracts and validates naming results from raw VLM output
// ============================================================

/**
 * A single parsed naming result from the VLM response.
 */
export interface ParsedNaming {
  markId: number;
  name: string;
  confidence: number;
}

/**
 * Validation result for a single CESPC-formatted name.
 */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// ------------------------------------------------------------------
// Response Parser
// ------------------------------------------------------------------

/**
 * Parses raw VLM text output into a validated array of naming results.
 *
 * Handles common VLM response quirks:
 * - Markdown code fences (```json ... ```)
 * - Leading/trailing whitespace or commentary
 * - Extra or missing entries compared to expected mark IDs
 * - Malformed JSON gracefully
 *
 * @param rawText        - The raw text response from the VLM API
 * @param expectedMarkIds - The mark IDs we expect to find in the response
 * @returns Cleaned array of parsed naming results, one per expected markId
 */
export function parseVLMResponse(
  rawText: string,
  expectedMarkIds: number[],
): ParsedNaming[] {
  // ---- 1. Extract JSON from the raw text ----
  const jsonStr = extractJsonArray(rawText);

  if (jsonStr === null) {
    console.warn(
      '[Figma Namer] Could not extract JSON array from VLM response. Raw text:',
      rawText.substring(0, 500),
    );
    // Return fallback entries with empty names so upstream can handle gracefully
    return expectedMarkIds.map((markId) => ({
      markId,
      name: '',
      confidence: 0,
    }));
  }

  // ---- 2. Parse the JSON ----
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn(
      '[Figma Namer] JSON.parse failed on extracted string:',
      (err as Error).message,
    );
    return expectedMarkIds.map((markId) => ({
      markId,
      name: '',
      confidence: 0,
    }));
  }

  // ---- 3. Validate top-level structure ----
  if (!Array.isArray(parsed)) {
    console.warn('[Figma Namer] VLM response JSON is not an array.');
    return expectedMarkIds.map((markId) => ({
      markId,
      name: '',
      confidence: 0,
    }));
  }

  // ---- 4. Normalize each entry ----
  const entryMap = new Map<number, ParsedNaming>();

  for (const item of parsed) {
    if (!isValidEntry(item)) {
      continue;
    }

    const markId = typeof item.markId === 'string'
      ? parseInt(item.markId, 10)
      : item.markId;

    if (isNaN(markId)) {
      continue;
    }

    const name = sanitizeName(String(item.name || ''));
    const confidence = normalizeConfidence(item.confidence);

    // Only keep the first occurrence for each markId (ignore duplicates)
    if (!entryMap.has(markId)) {
      entryMap.set(markId, { markId, name, confidence });
    }
  }

  // ---- 5. Build final array aligned to expectedMarkIds ----
  const results: ParsedNaming[] = [];

  for (const markId of expectedMarkIds) {
    const entry = entryMap.get(markId);
    if (entry && entry.name.length > 0) {
      results.push(entry);
    } else {
      // Missing or empty entry for this markId
      results.push({ markId, name: '', confidence: 0 });
    }
  }

  return results;
}

// ------------------------------------------------------------------
// Name Validator
// ------------------------------------------------------------------

/** Characters that are not allowed in Figma layer names */
const ILLEGAL_CHAR_PATTERN = /[\\/:*?"<>|{}[\]#@!$%^&=+~`]/;

/** Maximum allowed name length */
const MAX_NAME_LENGTH = 100;

/** Minimum meaningful name length */
const MIN_NAME_LENGTH = 2;

/**
 * Validates whether a name string conforms to the CESPC naming framework.
 *
 * Checks performed:
 * 1. Non-empty and within length bounds
 * 2. No illegal characters
 * 3. At least two PascalCase segments (Context + Element)
 * 4. Separator format (` - ` between optional segments)
 * 5. Does not look like a Figma default name (e.g. "Frame 123")
 *
 * @param name - The naming string to validate
 * @returns Validation result with a list of specific issues found
 */
export function validateNaming(name: string): ValidationResult {
  const issues: string[] = [];

  // ---- 1. Length checks ----
  if (!name || name.trim().length === 0) {
    return { valid: false, issues: ['Name is empty'] };
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_NAME_LENGTH) {
    issues.push(`Name is too short (${trimmed.length} chars, minimum ${MIN_NAME_LENGTH})`);
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    issues.push(`Name exceeds maximum length (${trimmed.length} chars, maximum ${MAX_NAME_LENGTH})`);
  }

  // ---- 2. Illegal characters ----
  const illegalMatch = trimmed.match(ILLEGAL_CHAR_PATTERN);
  if (illegalMatch) {
    issues.push(`Contains illegal character: "${illegalMatch[0]}"`);
  }

  // ---- 3. CESPC structural check ----
  // Split on the segment separator " - "
  const segments = trimmed.split(' - ');
  const contextElement = segments[0]; // Should be "[Context] [Element]"

  if (!contextElement || contextElement.trim().length === 0) {
    issues.push('Missing Context and Element segments');
  } else {
    // The first segment should contain at least two words (Context + Element)
    const words = contextElement.trim().split(/\s+/);
    if (words.length < 2) {
      issues.push(
        'First segment should contain both Context and Element ' +
        '(e.g. "Login Button", not just "Button")',
      );
    }
  }

  // ---- 4. Separator format ----
  // Check for incorrect separators (e.g. using "/" or "_" or "-" without spaces)
  if (/[_/]/.test(trimmed)) {
    issues.push(
      'Uses underscores or slashes as separators. Use " - " (space-dash-space) between segments',
    );
  }

  // Check for double dashes or trailing dashes
  if (/\s-\s-\s/.test(trimmed) || trimmed.endsWith(' -') || trimmed.endsWith('-')) {
    issues.push('Contains empty segments or trailing dashes');
  }

  // ---- 5. Default Figma name detection ----
  const defaultNamePatterns = [
    /^Frame \d+$/,
    /^Group \d+$/,
    /^Rectangle \d+$/,
    /^Ellipse \d+$/,
    /^Vector \d+$/,
    /^Line \d+$/,
    /^Text$/,
    /^Component \d+$/,
    /^Instance$/,
  ];

  if (defaultNamePatterns.some((p) => p.test(trimmed))) {
    issues.push('Name matches a Figma default layer name pattern');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Extracts the first JSON array from a raw text string.
 *
 * Handles:
 * - Clean JSON arrays
 * - Markdown-wrapped JSON (```json ... ```)
 * - Leading/trailing text around the JSON
 *
 * @returns The extracted JSON string, or null if not found
 */
function extractJsonArray(text: string): string | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  let cleaned = text.trim();

  // Strip markdown code fences if present
  // Handles: ```json\n...\n```, ```\n...\n```, etc.
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = cleaned.match(fencePattern);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Also handle { "namings": [...] } wrapper format
  const wrappedPattern = /\{\s*"namings"\s*:\s*(\[[\s\S]*\])\s*\}/;
  const wrappedMatch = cleaned.match(wrappedPattern);
  if (wrappedMatch) {
    return wrappedMatch[1];
  }

  // Try to find the outermost [ ... ] bracket pair
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.substring(firstBracket, lastBracket + 1);
  }

  // Handle truncated JSON: response cut off mid-array (no closing ']')
  // Try to recover by finding the last complete object and closing the array
  if (firstBracket !== -1 && lastBracket === -1) {
    const partial = cleaned.substring(firstBracket);
    // Find the last complete JSON object (ends with '}')
    const lastCloseBrace = partial.lastIndexOf('}');
    if (lastCloseBrace > 0) {
      const recovered = partial.substring(0, lastCloseBrace + 1) + ']';
      // Verify it parses
      try {
        JSON.parse(recovered);
        console.warn('[Figma Namer] Recovered truncated JSON array (' + recovered.length + ' chars)');
        return recovered;
      } catch (_e) {
        // Try removing the last potentially incomplete object
        const secondLastBrace = partial.lastIndexOf('}', lastCloseBrace - 1);
        if (secondLastBrace > 0) {
          // Find the comma before the incomplete object
          const afterSecondLast = partial.substring(secondLastBrace + 1, lastCloseBrace + 1);
          const commaIdx = afterSecondLast.indexOf(',');
          if (commaIdx !== -1) {
            const trimmed = partial.substring(0, secondLastBrace + 1) + ']';
            try {
              JSON.parse(trimmed);
              console.warn('[Figma Namer] Recovered truncated JSON (dropped last incomplete entry)');
              return trimmed;
            } catch (_e2) {
              // Give up
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Validates that an unknown value looks like a valid naming entry object.
 */
function isValidEntry(
  item: unknown,
): item is { markId: number | string; name: unknown; confidence?: unknown } {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const obj = item as Record<string, unknown>;

  // markId is required (number or numeric string)
  if (obj.markId === undefined && obj.mark_id === undefined && obj.id === undefined) {
    return false;
  }

  // Normalize markId from alternative key names
  if (obj.markId === undefined) {
    if (obj.mark_id !== undefined) {
      obj.markId = obj.mark_id;
    } else if (obj.id !== undefined) {
      obj.markId = obj.id;
    }
  }

  // name must be present
  if (obj.name === undefined && obj.suggested_name === undefined) {
    return false;
  }

  // Normalize name from alternative keys
  if (obj.name === undefined && obj.suggested_name !== undefined) {
    obj.name = obj.suggested_name;
  }

  return true;
}

/**
 * Sanitizes a layer name string by trimming whitespace and collapsing
 * internal runs of whitespace.
 */
function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')       // Collapse internal whitespace
    .replace(/\s*-\s*/g, ' - ') // Normalize dash spacing
    .substring(0, MAX_NAME_LENGTH);
}

/**
 * Normalizes a confidence value to the range [0, 1].
 */
function normalizeConfidence(value: unknown): number {
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return 0.5;
    }
    // If the value is > 1, assume it is a percentage (0-100)
    if (value > 1) {
      return Math.min(value / 100, 1);
    }
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return normalizeConfidence(parsed);
    }
  }

  // Default confidence when not provided
  return 0.5;
}
