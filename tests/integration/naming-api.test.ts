// ============================================================
// Integration tests for backend/api/naming.ts
// Covers: CORS, request validation, rate limiting, successful
//         naming flow, error responses, JSON extraction
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ------------------------------------------------------------------
// Mock the VLM provider modules BEFORE importing the handler
// ------------------------------------------------------------------

const mockCallClaude = vi.fn();
const mockCallOpenAI = vi.fn();

vi.mock('../../backend/src/vlm/claude-client', () => ({
  callClaude: (...args: any[]) => mockCallClaude(...args),
}));

vi.mock('../../backend/src/vlm/openai-client', () => ({
  callOpenAI: (...args: any[]) => mockCallOpenAI(...args),
}));

// Now import the handler
import handler from '../../backend/api/naming';

// ------------------------------------------------------------------
// Unique IP generator to avoid rate limit collisions between tests
// ------------------------------------------------------------------

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter++;
  const a = (ipCounter >> 16) & 0xff;
  const b = (ipCounter >> 8) & 0xff;
  const c = ipCounter & 0xff;
  return `172.${a}.${b}.${c}`;
}

// ------------------------------------------------------------------
// Mock request/response factories
// ------------------------------------------------------------------

interface MockVercelRequest {
  method: string;
  headers: Record<string, string>;
  body: any;
}

interface MockVercelResponse {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: any;
  ended: boolean;
  status: (code: number) => MockVercelResponse;
  setHeader: (name: string, value: string) => MockVercelResponse;
  json: (body: any) => MockVercelResponse;
  end: () => void;
}

function createMockRequest(overrides: Partial<MockVercelRequest> = {}): MockVercelRequest {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.figma.com',
      'content-type': 'application/json',
      'x-forwarded-for': uniqueIp(),
    },
    body: null,
    ...overrides,
  };
}

function createMockResponse(): MockVercelResponse {
  const res: MockVercelResponse = {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: any) {
      this.jsonBody = body;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  return res;
}

/** Returns a valid request body for generate_names */
function createValidBody(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    action: 'generate_names',
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
    nodeTextSupplements: [
      {
        markId: 1,
        textContent: 'Log In',
        boundVariables: ['primary-color'],
        componentProperties: { variant: 'primary' },
      },
    ],
    globalContext: 'Login screen',
    platform: 'Web',
    vlmProvider: 'claude',
    ...overrides,
  };
}

/** Returns a successful VLM result for mocking */
function createVLMResult(namings = [{ markId: 1, name: 'auth/button/primary', confidence: 0.95 }]) {
  return {
    content: JSON.stringify({ namings }),
    model: 'claude-sonnet-4-6',
    usage: {
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
    },
  };
}

// ------------------------------------------------------------------
// Setup / Teardown
// ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Set NODE_ENV to development so CORS is more permissive
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// CORS preflight handling
// ------------------------------------------------------------------

describe('CORS preflight handling', () => {
  it('should respond to OPTIONS with 204 and CORS headers', async () => {
    const req = createMockRequest({ method: 'OPTIONS' });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
    expect(res.headers['access-control-max-age']).toBe('86400');
  });

  it('should set Access-Control-Allow-Origin for Figma origins', async () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: { origin: 'https://www.figma.com', 'x-forwarded-for': uniqueIp() },
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.headers['access-control-allow-origin']).toBe('https://www.figma.com');
  });

  it('should accept origin "null" (Figma sandbox iframe)', async () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: { origin: 'null', 'x-forwarded-for': uniqueIp() },
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.headers['access-control-allow-origin']).toBe('null');
  });

  it('should accept subdomain origins like *.figma.com', async () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: { origin: 'https://staging.figma.com', 'x-forwarded-for': uniqueIp() },
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.headers['access-control-allow-origin']).toBe('https://staging.figma.com');
  });

  it('should set CORS headers on POST responses too', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    const req = createMockRequest({
      body: createValidBody(),
      headers: { origin: 'https://www.figma.com', 'x-forwarded-for': uniqueIp() },
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.headers['access-control-allow-origin']).toBe('https://www.figma.com');
    expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  });
});

// ------------------------------------------------------------------
// HTTP method validation
// ------------------------------------------------------------------

describe('HTTP method validation', () => {
  it('should reject GET requests with 405', async () => {
    const req = createMockRequest({ method: 'GET' });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('GET');
  });

  it('should reject PUT requests with 405', async () => {
    const req = createMockRequest({ method: 'PUT' });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(res.jsonBody.success).toBe(false);
  });

  it('should reject DELETE requests with 405', async () => {
    const req = createMockRequest({ method: 'DELETE' });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(405);
  });
});

// ------------------------------------------------------------------
// Request body validation
// ------------------------------------------------------------------

describe('Request body validation', () => {
  it('should reject null body', async () => {
    const req = createMockRequest({ body: null });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('JSON object');
  });

  it('should reject non-object body', async () => {
    const req = createMockRequest({ body: 'not an object' });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
  });

  it('should reject invalid action', async () => {
    const req = createMockRequest({
      body: createValidBody({ action: 'invalid_action' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('Invalid action');
  });

  it('should reject missing imageBase64', async () => {
    const req = createMockRequest({
      body: createValidBody({ imageBase64: '' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('imageBase64');
  });

  it('should reject non-string imageBase64', async () => {
    const req = createMockRequest({
      body: createValidBody({ imageBase64: 12345 }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('imageBase64');
  });

  it('should reject imageBase64 with invalid characters', async () => {
    const req = createMockRequest({
      body: createValidBody({ imageBase64: 'invalid!!base64##data' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('invalid characters');
  });

  it('should reject nodeTextSupplements that is not an array', async () => {
    const req = createMockRequest({
      body: createValidBody({ nodeTextSupplements: 'not-an-array' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('nodeTextSupplements must be an array');
  });

  it('should reject nodeTextSupplements with invalid markId', async () => {
    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          {
            markId: 'not-a-number',
            textContent: null,
            boundVariables: [],
            componentProperties: {},
          },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('markId must be a number');
  });

  it('should reject nodeTextSupplements with invalid textContent type', async () => {
    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          {
            markId: 1,
            textContent: 123, // should be string or null
            boundVariables: [],
            componentProperties: {},
          },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('textContent must be a string or null');
  });

  it('should reject nodeTextSupplements with invalid boundVariables type', async () => {
    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          {
            markId: 1,
            textContent: null,
            boundVariables: 'not-an-array',
            componentProperties: {},
          },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('boundVariables must be an array');
  });

  it('should reject nodeTextSupplements with invalid componentProperties type', async () => {
    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          {
            markId: 1,
            textContent: null,
            boundVariables: [],
            componentProperties: 'not-an-object',
          },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('componentProperties must be an object');
  });

  it('should reject too many nodeTextSupplements (> 50)', async () => {
    const supplements = Array.from({ length: 51 }, (_, i) => ({
      markId: i + 1,
      textContent: null,
      boundVariables: [],
      componentProperties: {},
    }));
    const req = createMockRequest({
      body: createValidBody({ nodeTextSupplements: supplements }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('exceeds maximum count');
  });

  it('should reject non-string globalContext', async () => {
    const req = createMockRequest({
      body: createValidBody({ globalContext: 12345 }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('globalContext must be a string');
  });

  it('should reject globalContext exceeding max length (2000 chars)', async () => {
    const req = createMockRequest({
      body: createValidBody({ globalContext: 'x'.repeat(2001) }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('exceeds maximum length');
  });

  it('should reject non-string platform', async () => {
    const req = createMockRequest({
      body: createValidBody({ platform: 123 }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('platform must be a string');
  });

  it('should reject invalid platform values', async () => {
    const req = createMockRequest({
      body: createValidBody({ platform: 'Windows' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('Invalid platform');
  });

  it('should accept all valid platform values', async () => {
    const validPlatforms = ['iOS', 'Android', 'Web', 'Auto', ''];

    for (const platform of validPlatforms) {
      mockCallClaude.mockResolvedValue(createVLMResult());
      const req = createMockRequest({
        body: createValidBody({ platform }),
      });
      const res = createMockResponse();

      await handler(req as any, res as any);

      expect(res.statusCode).toBe(200);
    }
  });

  it('should reject invalid vlmProvider', async () => {
    const req = createMockRequest({
      body: createValidBody({ vlmProvider: 'gemini' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toContain('Invalid vlmProvider');
  });

  it('should accept vlmProvider "claude"', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());
    const req = createMockRequest({
      body: createValidBody({ vlmProvider: 'claude' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });

  it('should accept vlmProvider "openai"', async () => {
    mockCallOpenAI.mockResolvedValue(createVLMResult());
    const req = createMockRequest({
      body: createValidBody({ vlmProvider: 'openai' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });

  it('should accept nodeTextSupplements with null textContent', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());
    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          {
            markId: 1,
            textContent: null,
            boundVariables: [],
            componentProperties: {},
          },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });

  it('should accept empty nodeTextSupplements array', async () => {
    mockCallClaude.mockResolvedValue(
      createVLMResult([]),
    );
    const req = createMockRequest({
      body: createValidBody({ nodeTextSupplements: [] }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });
});

// ------------------------------------------------------------------
// Rate limiting
// ------------------------------------------------------------------

describe('Rate limiting', () => {
  it('should allow requests within the rate limit', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    const ip = uniqueIp();
    const req = createMockRequest({
      body: createValidBody(),
      headers: {
        origin: 'https://www.figma.com',
        'x-forwarded-for': ip,
      },
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });

  it('should reject requests that exceed the rate limit (30 per minute)', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    // Use a unique IP to avoid interference from other tests
    const ip = uniqueIp();

    // Send 30 requests to fill the rate limit
    for (let i = 0; i < 30; i++) {
      const req = createMockRequest({
        body: createValidBody(),
        headers: {
          origin: 'https://www.figma.com',
          'x-forwarded-for': ip,
        },
      });
      const res = createMockResponse();
      await handler(req as any, res as any);
      expect(res.statusCode).toBe(200);
    }

    // 31st request should be rate limited
    const req = createMockRequest({
      body: createValidBody(),
      headers: {
        origin: 'https://www.figma.com',
        'x-forwarded-for': ip,
      },
    });
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('Too many requests');
  });

  it('should use different rate limit buckets for different IPs', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    const ip1 = uniqueIp();
    const ip2 = uniqueIp();

    // First IP
    const req1 = createMockRequest({
      body: createValidBody(),
      headers: {
        origin: 'https://www.figma.com',
        'x-forwarded-for': ip1,
      },
    });
    const res1 = createMockResponse();
    await handler(req1 as any, res1 as any);
    expect(res1.statusCode).toBe(200);

    // Different IP
    const req2 = createMockRequest({
      body: createValidBody(),
      headers: {
        origin: 'https://www.figma.com',
        'x-forwarded-for': ip2,
      },
    });
    const res2 = createMockResponse();
    await handler(req2 as any, res2 as any);
    expect(res2.statusCode).toBe(200);
  });
});

// ------------------------------------------------------------------
// Successful naming flow
// ------------------------------------------------------------------

describe('Successful naming flow', () => {
  it('should call Claude when vlmProvider is "claude"', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    const req = createMockRequest({
      body: createValidBody({ vlmProvider: 'claude' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAI).not.toHaveBeenCalled();
  });

  it('should call OpenAI when vlmProvider is "openai"', async () => {
    mockCallOpenAI.mockResolvedValue(createVLMResult());

    const req = createMockRequest({
      body: createValidBody({ vlmProvider: 'openai' }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('should pass imageBase64, systemPrompt, and userPrompt to the VLM', async () => {
    mockCallClaude.mockResolvedValue(createVLMResult());

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    const [imageBase64, systemPrompt, userPrompt] = mockCallClaude.mock.calls[0];
    expect(typeof imageBase64).toBe('string');
    expect(imageBase64.length).toBeGreaterThan(0);
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt).toContain('CESPC');
    expect(typeof userPrompt).toBe('string');
  });

  it('should return 200 with structured naming results', async () => {
    const namings = [
      { markId: 1, name: 'auth/button/primary', confidence: 0.95 },
      { markId: 2, name: 'auth/input/email', confidence: 0.88 },
    ];
    mockCallClaude.mockResolvedValue(createVLMResult(namings));

    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          { markId: 1, textContent: 'Login', boundVariables: [], componentProperties: {} },
          { markId: 2, textContent: 'Email', boundVariables: [], componentProperties: {} },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.success).toBe(true);
    expect(res.jsonBody.data.namings).toHaveLength(2);
    expect(res.jsonBody.data.namings[0]).toEqual({
      markId: 1,
      name: 'auth/button/primary',
      confidence: 0.95,
    });
    expect(res.jsonBody.data.model).toBe('claude-sonnet-4-6');
    expect(res.jsonBody.data.usage.totalTokens).toBe(600);
  });

  it('should include model and usage info in the response', async () => {
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify({
        namings: [{ markId: 1, name: 'test/element', confidence: 0.8 }],
      }),
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 },
    });

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.model).toBe('claude-sonnet-4-6');
    expect(res.jsonBody.data.usage).toEqual({
      promptTokens: 200,
      completionTokens: 50,
      totalTokens: 250,
    });
  });

  it('should clamp confidence values to [0, 1] range', async () => {
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify({
        namings: [
          { markId: 1, name: 'test/element', confidence: 1.5 }, // above 1
          { markId: 2, name: 'test/other', confidence: -0.5 },  // below 0
        ],
      }),
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({
      body: createValidBody({
        nodeTextSupplements: [
          { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
          { markId: 2, textContent: null, boundVariables: [], componentProperties: {} },
        ],
      }),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].confidence).toBe(1);
    expect(res.jsonBody.data.namings[1].confidence).toBe(0);
  });

  it('should default confidence to 0.5 when not a number', async () => {
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify({
        namings: [
          { markId: 1, name: 'test/element', confidence: 'high' },
        ],
      }),
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].confidence).toBe(0.5);
  });
});

// ------------------------------------------------------------------
// JSON extraction from VLM response
// ------------------------------------------------------------------

describe('JSON extraction from VLM response', () => {
  it('should extract JSON from a direct JSON string', async () => {
    mockCallClaude.mockResolvedValue({
      content: '{"namings": [{"markId": 1, "name": "auth/button", "confidence": 0.9}]}',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].name).toBe('auth/button');
  });

  it('should extract JSON from markdown code fences', async () => {
    const jsonContent = '{"namings": [{"markId": 1, "name": "nav/header", "confidence": 0.85}]}';
    mockCallClaude.mockResolvedValue({
      content: '```json\n' + jsonContent + '\n```',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].name).toBe('nav/header');
  });

  it('should extract JSON from code fences without language tag', async () => {
    const jsonContent = '{"namings": [{"markId": 1, "name": "form/input", "confidence": 0.8}]}';
    mockCallClaude.mockResolvedValue({
      content: '```\n' + jsonContent + '\n```',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].name).toBe('form/input');
  });

  it('should extract JSON embedded in preamble text', async () => {
    mockCallClaude.mockResolvedValue({
      content:
        'Here are the naming suggestions:\n{"namings": [{"markId": 1, "name": "modal/dialog", "confidence": 0.92}]}\nHope this helps!',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data.namings[0].name).toBe('modal/dialog');
  });

  it('should return 500 when JSON cannot be extracted from VLM response', async () => {
    mockCallClaude.mockResolvedValue({
      content: 'I cannot process this image because it is too blurry.',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('Internal server error');
  });

  it('should return 500 when VLM response JSON has no namings array', async () => {
    mockCallClaude.mockResolvedValue({
      content: '{"results": []}',
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
  });

  it('should return 500 when a naming entry has empty name', async () => {
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify({
        namings: [{ markId: 1, name: '', confidence: 0.9 }],
      }),
      model: 'claude-sonnet-4-6',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
  });
});

// ------------------------------------------------------------------
// Error responses for various failure modes
// ------------------------------------------------------------------

describe('Error responses', () => {
  it('should return 502 when VLM API authentication fails', async () => {
    mockCallClaude.mockRejectedValue(new Error('401 Unauthorized - Invalid API key'));

    const req = createMockRequest({ body: createValidBody() });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(502);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('authentication failed');
  });

  it('should return 429 when VLM API rate limit is exceeded', async () => {
    mockCallClaude.mockRejectedValue(new Error('429 rate limit exceeded'));

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('rate limit');
  });

  it('should return 504 when VLM API times out', async () => {
    mockCallClaude.mockRejectedValue(new Error('timeout waiting for response'));

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(504);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('timed out');
  });

  it('should return 504 when VLM API throws ETIMEDOUT', async () => {
    mockCallClaude.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(504);
  });

  it('should return 500 for generic/unknown errors', async () => {
    mockCallClaude.mockRejectedValue(new Error('Something unexpected happened'));

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error).toContain('Internal server error');
  });

  it('should handle non-Error thrown values gracefully', async () => {
    mockCallClaude.mockRejectedValue('a string error');

    const req = createMockRequest({
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
  });
});
