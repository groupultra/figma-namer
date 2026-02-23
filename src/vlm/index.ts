// ============================================================
// Figma Namer - Module C: VLM Integration & Prompt Engineering
// Public API surface for the VLM module
// ============================================================

// ---- Prompt builders ----
export { buildSystemPrompt, buildUserPrompt } from './prompt';
export type { NodeSupplement } from './prompt';

// ---- VLM API client ----
export { VLMClient, VLMClientError } from './client';
export type { VLMClientConfig } from './client';

// ---- Provider dispatcher ----
export { callProvider, PROVIDER_KEY_FAMILY } from './providers';
export type { VLMRawResult } from './providers';

// ---- Response parser & validator ----
export { parseVLMResponse, validateNaming } from './parser';
export type { ParsedNaming, ValidationResult } from './parser';
