// ============================================================
// Figma Namer - Module C: VLM API Client
// Direct API calls to AI providers (Gemini, Claude, OpenAI)
// ============================================================

import type {
  VLMResponse,
  NamingBatch,
  NamingResult,
} from '../shared/types';
import { callProvider } from './providers';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { NodeSupplement } from './prompt';
import { parseVLMResponse } from './parser';

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

/** Client configuration */
export interface VLMClientConfig {
  /** Provider ID (e.g. 'gemini-flash', 'claude-sonnet', 'gpt-5.2') */
  vlmProvider: string;
  /** API key for the selected provider */
  apiKey: string;
}

/** Retry configuration constants */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
} as const;

// ------------------------------------------------------------------
// VLM Client
// ------------------------------------------------------------------

/**
 * Client for calling AI provider APIs directly from the browser.
 *
 * Features:
 * - Automatic retry with exponential backoff (up to 3 attempts)
 * - Structured error reporting
 * - Prompt assembly from batch data
 */
export class VLMClient {
  private readonly config: VLMClientConfig;

  constructor(config: VLMClientConfig) {
    this.config = { ...config };
  }

  // ----------------------------------------------------------------
  // High-level API
  // ----------------------------------------------------------------

  /**
   * Processes a complete naming batch: assembles prompts, calls the VLM
   * API, and parses the response into NamingResult objects.
   */
  async generateNamesForBatch(
    batch: NamingBatch,
    globalContext: string,
    platform: string,
  ): Promise<NamingResult[]> {
    // ---- 1. Build node supplements from batch data ----
    const nodeSupplements: NodeSupplement[] = batch.labels.map((label) => {
      const node = batch.nodes.find((n) => n.id === label.nodeId);
      return {
        markId: label.markId,
        originalName: label.originalName,
        textContent: node?.textContent ?? null,
        boundVariables: node?.boundVariables ?? [],
        componentProperties: node?.componentProperties ?? {},
      };
    });

    // ---- 2. Build prompts ----
    const systemPrompt = buildSystemPrompt(globalContext, platform);
    const userPrompt = buildUserPrompt(nodeSupplements);

    // ---- 3. Call the VLM API with retry ----
    const expectedMarkIds = batch.labels.map((l) => l.markId);
    const response = await this.generateNames(
      batch.markedImageBase64,
      systemPrompt,
      userPrompt,
      expectedMarkIds,
    );

    // ---- 4. Map VLM response back to NamingResult objects ----
    const results: NamingResult[] = [];

    for (const label of batch.labels) {
      const naming = response.namings.find((n) => n.markId === label.markId);
      results.push({
        markId: label.markId,
        nodeId: label.nodeId,
        originalName: label.originalName,
        suggestedName: naming?.name ?? '',
        confidence: naming?.confidence ?? 0,
      });
    }

    return results;
  }

  // ----------------------------------------------------------------
  // Low-level API
  // ----------------------------------------------------------------

  /**
   * Calls the AI provider with retry logic, then parses the response.
   */
  async generateNames(
    imageBase64: string,
    systemPrompt: string,
    userPrompt: string,
    expectedMarkIds: number[],
  ): Promise<VLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1),
          RETRY_CONFIG.MAX_DELAY_MS,
        );
        const jitter = delay * 0.2 * (Math.random() * 2 - 1);
        await sleep(delay + jitter);

        console.log(
          `[Figma Namer] VLM API retry attempt ${attempt + 1}/${RETRY_CONFIG.MAX_ATTEMPTS}`,
        );
      }

      try {
        const rawResult = await callProvider(
          this.config.vlmProvider,
          this.config.apiKey,
          imageBase64,
          systemPrompt,
          userPrompt,
        );

        // Parse the raw text response into structured naming results
        const parsed = parseVLMResponse(rawResult.content, expectedMarkIds);

        return {
          namings: parsed,
          model: rawResult.model,
          usage: rawResult.usage,
        };
      } catch (err) {
        lastError = err as Error;

        // Non-retryable errors: give up immediately
        const retryable = (err as { retryable?: boolean }).retryable;
        if (retryable === false) {
          throw new VLMClientError(
            (err as Error).message,
            'PROVIDER_ERROR',
            false,
          );
        }

        console.warn(
          `[Figma Namer] VLM API call failed (attempt ${attempt + 1}):`,
          (err as Error).message,
        );
      }
    }

    throw new VLMClientError(
      `VLM API request failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'Unknown error'}`,
      'MAX_RETRIES_EXCEEDED',
      false,
    );
  }
}

// ------------------------------------------------------------------
// Error class
// ------------------------------------------------------------------

export class VLMClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'VLMClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
