// ============================================================
// Figma Namer - Serverless API Entry Point
// POST /api/naming - Proxies VLM (Claude / GPT-4o) requests
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude } from '../src/vlm/claude-client';
import { callOpenAI } from '../src/vlm/openai-client';
import { buildSystemPrompt, buildUserPrompt } from '../src/vlm/prompt-builder';
import type { NodeSupplement } from '../src/vlm/prompt-builder';

// ---- CORS configuration ----

const ALLOWED_ORIGINS = [
  'https://www.figma.com',
  'https://figma.com',
  'null', // Figma plugin iframes sometimes report origin as "null"
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin ?? '';

  // In development, allow all origins. In production, restrict to known origins.
  // Figma plugin sandboxed iframes may send origin "null" (string).
  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.figma.com') ||
    process.env.NODE_ENV !== 'production'
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    // In production, reject unknown origins by not setting Access-Control-Allow-Origin.
    // Figma plugin iframes typically send origin "null" which is already in ALLOWED_ORIGINS.
    // Omitting the header causes browsers to block the response for cross-origin requests.
    console.warn(`[naming] Rejected unknown origin: ${origin}`);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ---- Request validation ----

interface ValidatedBody {
  action: 'generate_names';
  imageBase64: string;
  nodeTextSupplements: NodeSupplement[];
  globalContext: string;
  platform: string;
  vlmProvider: 'claude' | 'openai';
}

function validateRequestBody(body: unknown): ValidatedBody {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const b = body as Record<string, unknown>;

  // action
  if (b.action !== 'generate_names') {
    throw new ValidationError(
      `Invalid action "${String(b.action)}". Expected "generate_names".`
    );
  }

  // imageBase64
  if (typeof b.imageBase64 !== 'string' || b.imageBase64.length === 0) {
    throw new ValidationError(
      'imageBase64 is required and must be a non-empty string.'
    );
  }

  // Basic sanity check on base64 size (reject absurdly large payloads > 25MB of base64)
  const MAX_BASE64_LENGTH = 25 * 1024 * 1024 * (4 / 3); // ~33M chars for 25MB
  if ((b.imageBase64 as string).length > MAX_BASE64_LENGTH) {
    throw new ValidationError(
      'imageBase64 exceeds the maximum allowed size (25 MB).'
    );
  }

  // Validate base64 format (strip optional data URI prefix before checking)
  const base64Data = (b.imageBase64 as string).replace(
    /^data:image\/(png|jpeg|webp|gif);base64,/, ''
  );
  const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!BASE64_REGEX.test(base64Data)) {
    throw new ValidationError(
      'imageBase64 contains invalid characters. Must be valid Base64-encoded data.'
    );
  }

  // nodeTextSupplements
  if (!Array.isArray(b.nodeTextSupplements)) {
    throw new ValidationError('nodeTextSupplements must be an array.');
  }

  // Limit number of supplements per request to prevent abuse
  const MAX_SUPPLEMENTS = 50;
  if (b.nodeTextSupplements.length > MAX_SUPPLEMENTS) {
    throw new ValidationError(
      `nodeTextSupplements exceeds maximum count (${b.nodeTextSupplements.length}, maximum ${MAX_SUPPLEMENTS}).`
    );
  }

  for (let i = 0; i < b.nodeTextSupplements.length; i++) {
    const item = b.nodeTextSupplements[i] as Record<string, unknown>;
    if (typeof item.markId !== 'number') {
      throw new ValidationError(
        `nodeTextSupplements[${i}].markId must be a number.`
      );
    }
    if (
      item.textContent !== null &&
      item.textContent !== undefined &&
      typeof item.textContent !== 'string'
    ) {
      throw new ValidationError(
        `nodeTextSupplements[${i}].textContent must be a string or null.`
      );
    }
    if (!Array.isArray(item.boundVariables)) {
      throw new ValidationError(
        `nodeTextSupplements[${i}].boundVariables must be an array.`
      );
    }
    if (
      typeof item.componentProperties !== 'object' ||
      item.componentProperties === null ||
      Array.isArray(item.componentProperties)
    ) {
      throw new ValidationError(
        `nodeTextSupplements[${i}].componentProperties must be an object.`
      );
    }
  }

  // globalContext
  if (typeof b.globalContext !== 'string') {
    throw new ValidationError('globalContext must be a string.');
  }

  // Limit globalContext length to prevent prompt injection abuse and excessive token usage
  const MAX_GLOBAL_CONTEXT_LENGTH = 2000;
  if ((b.globalContext as string).length > MAX_GLOBAL_CONTEXT_LENGTH) {
    throw new ValidationError(
      `globalContext exceeds maximum length (${(b.globalContext as string).length} chars, maximum ${MAX_GLOBAL_CONTEXT_LENGTH}).`
    );
  }

  // platform
  if (typeof b.platform !== 'string') {
    throw new ValidationError('platform must be a string.');
  }

  // Validate platform against known values
  const VALID_PLATFORMS = ['iOS', 'Android', 'Web', 'Auto', ''];
  if (!VALID_PLATFORMS.includes(b.platform as string)) {
    throw new ValidationError(
      `Invalid platform "${String(b.platform)}". Must be one of: ${VALID_PLATFORMS.join(', ')}.`
    );
  }

  // vlmProvider
  if (b.vlmProvider !== 'claude' && b.vlmProvider !== 'openai') {
    throw new ValidationError(
      `Invalid vlmProvider "${String(b.vlmProvider)}". Must be "claude" or "openai".`
    );
  }

  return {
    action: b.action as 'generate_names',
    imageBase64: b.imageBase64 as string,
    nodeTextSupplements: b.nodeTextSupplements as NodeSupplement[],
    globalContext: b.globalContext as string,
    platform: b.platform as string,
    vlmProvider: b.vlmProvider as 'claude' | 'openai',
  };
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ---- JSON extraction helper ----

/**
 * Attempts to extract a valid JSON object from the VLM response text.
 * VLMs sometimes wrap JSON in markdown code fences or add preamble text.
 */
function extractJson(raw: string): Record<string, unknown> {
  // Try parsing directly first
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to extraction strategies
  }

  // Try extracting from markdown code fence
  const codeFenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try finding the first { ... } block
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  throw new Error(
    'Failed to extract valid JSON from VLM response. Raw output: ' +
      raw.slice(0, 500)
  );
}

// ---- Naming result validation ----

interface NamingEntry {
  markId: number;
  name: string;
  confidence: number;
}

function validateNamings(parsed: Record<string, unknown>): NamingEntry[] {
  if (!Array.isArray(parsed.namings)) {
    throw new Error(
      'VLM response JSON does not contain a "namings" array.'
    );
  }

  return (parsed.namings as Array<Record<string, unknown>>).map(
    (entry, idx) => {
      if (typeof entry.markId !== 'number') {
        throw new Error(
          `namings[${idx}].markId is missing or not a number.`
        );
      }
      if (typeof entry.name !== 'string' || entry.name.length === 0) {
        throw new Error(
          `namings[${idx}].name is missing or empty.`
        );
      }

      let confidence =
        typeof entry.confidence === 'number' ? entry.confidence : 0.5;
      confidence = Math.max(0, Math.min(1, confidence));

      return {
        markId: entry.markId,
        name: entry.name,
        confidence,
      };
    }
  );
}

// ---- Basic in-memory rate limiting ----
// Note: This is per-instance and resets on cold start. For production,
// consider using Vercel KV, Upstash Redis, or a similar distributed store.

const RATE_LIMIT = {
  WINDOW_MS: 60_000, // 1 minute window
  MAX_REQUESTS: 30,  // max requests per IP per window
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT.MAX_REQUESTS;
}

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);

// ---- Main handler ----

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Set CORS headers for all responses
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Rate limit check
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a moment before trying again.',
    });
    return;
  }

  // Only accept POST
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed. Use POST.`,
    });
    return;
  }

  const startTime = Date.now();

  try {
    // 1. Validate request body
    const body = validateRequestBody(req.body);

    console.log(
      `[naming] Provider=${body.vlmProvider}, ` +
        `supplements=${body.nodeTextSupplements.length}, ` +
        `platform=${body.platform}, ` +
        `imageSize=${Math.round(body.imageBase64.length / 1024)}KB`
    );

    // 2. Build prompts
    const systemPrompt = buildSystemPrompt(body.globalContext, body.platform);
    const userPrompt = buildUserPrompt(body.nodeTextSupplements);

    // 3. Call VLM based on provider
    let rawContent: string;
    let model: string;
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number };

    if (body.vlmProvider === 'claude') {
      const result = await callClaude(
        body.imageBase64,
        systemPrompt,
        userPrompt
      );
      rawContent = result.content;
      model = result.model;
      usage = result.usage;
    } else {
      const result = await callOpenAI(
        body.imageBase64,
        systemPrompt,
        userPrompt
      );
      rawContent = result.content;
      model = result.model;
      usage = result.usage;
    }

    console.log(
      `[naming] VLM responded in ${Date.now() - startTime}ms, ` +
        `model=${model}, tokens=${usage.totalTokens}`
    );

    // 4. Parse and validate VLM output
    const parsed = extractJson(rawContent);
    const namings = validateNamings(parsed);

    console.log(
      `[naming] Extracted ${namings.length} naming(s) successfully.`
    );

    // 5. Return structured response
    res.status(200).json({
      success: true,
      data: {
        namings,
        model,
        usage,
      },
    });
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;

    if (error instanceof ValidationError) {
      console.warn(`[naming] Validation error (${elapsed}ms): ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    // Classify common API errors
    const errMsg =
      error instanceof Error ? error.message : String(error);

    console.error(`[naming] Error (${elapsed}ms): ${errMsg}`);

    // Check for known upstream API errors
    if (
      errMsg.includes('401') ||
      errMsg.includes('authentication') ||
      errMsg.includes('invalid.*api.*key')
    ) {
      res.status(502).json({
        success: false,
        error:
          'VLM API authentication failed. Please check the API key configuration.',
      });
      return;
    }

    if (errMsg.includes('429') || errMsg.includes('rate limit')) {
      res.status(429).json({
        success: false,
        error:
          'VLM API rate limit exceeded. Please try again in a few moments.',
      });
      return;
    }

    if (
      errMsg.includes('timeout') ||
      errMsg.includes('ETIMEDOUT') ||
      errMsg.includes('ECONNABORTED')
    ) {
      res.status(504).json({
        success: false,
        error:
          'VLM API request timed out. The image may be too large or the service is under heavy load.',
      });
      return;
    }

    // Generic server error
    res.status(500).json({
      success: false,
      error: `Internal server error: ${errMsg}`,
    });
  }
}
