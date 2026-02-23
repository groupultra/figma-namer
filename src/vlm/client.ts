// ============================================================
// Figma Namer - Module C: VLM API Client
// HTTP client for communicating with the backend VLM proxy
// ============================================================

import type {
  VLMRequest,
  VLMResponse,
  NamingBatch,
  NamingResult,
} from '../shared/types';
import type { APIRequest, APIResponse } from '../shared/messages';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { NodeSupplement } from './prompt';
import { parseVLMResponse } from './parser';

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

/** Client configuration */
export interface VLMClientConfig {
  /** Backend API endpoint URL */
  apiEndpoint: string;
  /** VLM provider to use */
  vlmProvider: 'claude' | 'openai';
}

/** Retry configuration constants */
const RETRY_CONFIG = {
  /** Maximum number of retry attempts (initial + retries) */
  MAX_ATTEMPTS: 3,
  /** Base delay for exponential backoff (ms) */
  BASE_DELAY_MS: 1000,
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 10000,
  /** Request timeout (ms) - 2 minutes for large batches */
  REQUEST_TIMEOUT_MS: 120_000,
} as const;

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// ------------------------------------------------------------------
// VLM Client
// ------------------------------------------------------------------

/**
 * HTTP client for calling the Figma Namer backend API, which proxies
 * requests to the configured VLM provider (Claude or OpenAI GPT-4V).
 *
 * Features:
 * - Automatic retry with exponential backoff (up to 3 attempts)
 * - Request timeout handling
 * - Structured error reporting
 * - Prompt assembly from batch data
 */
export class VLMClient {
  private readonly config: VLMClientConfig;

  constructor(config: VLMClientConfig) {
    this.config = {
      apiEndpoint: config.apiEndpoint,
      vlmProvider: config.vlmProvider,
    };
  }

  // ----------------------------------------------------------------
  // High-level API
  // ----------------------------------------------------------------

  /**
   * Processes a complete naming batch: assembles prompts, calls the VLM
   * API, and parses the response into NamingResult objects.
   *
   * @param batch         - The naming batch (image + nodes + labels)
   * @param globalContext - User-provided scene description
   * @param platform      - Target platform (iOS/Android/Web/"")
   * @returns Array of NamingResult objects aligned with the batch nodes
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
        textContent: node?.textContent ?? null,
        boundVariables: node?.boundVariables ?? [],
        componentProperties: node?.componentProperties ?? {},
      };
    });

    // ---- 2. Assemble the VLM request ----
    const request: VLMRequest = {
      imageBase64: batch.markedImageBase64,
      nodeTextSupplements: nodeSupplements,
      globalContext,
      platform,
      batchSize: batch.labels.length,
    };

    // ---- 3. Call the VLM API ----
    const response = await this.generateNames(request);

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
   * Sends a naming request to the backend API with retry logic.
   *
   * @param request - The structured VLM request payload
   * @returns The parsed VLM response
   * @throws {VLMClientError} on unrecoverable errors after all retries
   */
  async generateNames(request: VLMRequest): Promise<VLMResponse> {
    const apiPayload: APIRequest = {
      action: 'generate_names',
      imageBase64: request.imageBase64,
      nodeTextSupplements: request.nodeTextSupplements,
      globalContext: request.globalContext,
      platform: request.platform,
      vlmProvider: this.config.vlmProvider,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      // Exponential backoff delay (skip for first attempt)
      if (attempt > 0) {
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1),
          RETRY_CONFIG.MAX_DELAY_MS,
        );
        // Add jitter: +/- 20% of the delay
        const jitter = delay * 0.2 * (Math.random() * 2 - 1);
        await sleep(delay + jitter);

        console.log(
          `[Figma Namer] VLM API retry attempt ${attempt + 1}/${RETRY_CONFIG.MAX_ATTEMPTS}`,
        );
      }

      try {
        const response = await this.sendRequest(apiPayload);
        return response;
      } catch (err) {
        lastError = err as Error;

        // Decide whether to retry
        if (err instanceof VLMClientError && !err.retryable) {
          // Non-retryable error: give up immediately
          throw err;
        }

        // Log and continue to next retry attempt
        console.warn(
          `[Figma Namer] VLM API call failed (attempt ${attempt + 1}):`,
          (err as Error).message,
        );
      }
    }

    // All retries exhausted
    throw new VLMClientError(
      `VLM API request failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'Unknown error'}`,
      'MAX_RETRIES_EXCEEDED',
      false,
    );
  }

  // ----------------------------------------------------------------
  // Private methods
  // ----------------------------------------------------------------

  /**
   * Sends a single HTTP request to the backend API.
   *
   * @param payload - The API request body
   * @returns Parsed VLM response
   * @throws {VLMClientError} on network, timeout, or API errors
   */
  private async sendRequest(payload: APIRequest): Promise<VLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      RETRY_CONFIG.REQUEST_TIMEOUT_MS,
    );

    try {
      const httpResponse = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ---- Handle HTTP errors ----
      if (!httpResponse.ok) {
        const retryable = RETRYABLE_STATUS_CODES.has(httpResponse.status);
        let errorMessage = `HTTP ${httpResponse.status}: ${httpResponse.statusText}`;

        try {
          const errorBody = await httpResponse.text();
          if (errorBody) {
            errorMessage += ` - ${errorBody.substring(0, 500)}`;
          }
        } catch {
          // Could not read error body; use the status text alone
        }

        throw new VLMClientError(
          errorMessage,
          `HTTP_${httpResponse.status}`,
          retryable,
        );
      }

      // ---- Parse response ----
      const apiResponse: APIResponse = await httpResponse.json();

      if (!apiResponse.success || !apiResponse.data) {
        throw new VLMClientError(
          apiResponse.error || 'API returned success=false with no error message',
          'API_ERROR',
          false,
        );
      }

      return {
        namings: apiResponse.data.namings,
        model: apiResponse.data.model,
        usage: apiResponse.data.usage,
      };
    } catch (err) {
      clearTimeout(timeoutId);

      // Re-throw VLMClientError as-is
      if (err instanceof VLMClientError) {
        throw err;
      }

      // Handle AbortController timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new VLMClientError(
          `Request timed out after ${RETRY_CONFIG.REQUEST_TIMEOUT_MS}ms`,
          'TIMEOUT',
          true,
        );
      }

      // Handle network errors (retryable)
      if (err instanceof TypeError && (err as Error).message.includes('fetch')) {
        throw new VLMClientError(
          `Network error: ${(err as Error).message}`,
          'NETWORK_ERROR',
          true,
        );
      }

      // Unknown error
      throw new VLMClientError(
        `Unexpected error: ${(err as Error).message}`,
        'UNKNOWN',
        true,
      );
    }
  }
}

// ------------------------------------------------------------------
// Error class
// ------------------------------------------------------------------

/**
 * Custom error class for VLM client failures.
 * Includes a machine-readable error code and retryable flag.
 */
export class VLMClientError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** Whether the caller should retry this request */
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

/**
 * Returns a promise that resolves after the specified delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
