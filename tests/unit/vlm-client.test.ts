// ============================================================
// Tests for src/vlm/client.ts
// Covers: VLMClient, retry logic, timeout, AbortController,
//         error classification, successful flow
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VLMClient, VLMClientError } from '../../src/vlm/client';
import type { VLMClientConfig } from '../../src/vlm/client';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const TEST_CONFIG: VLMClientConfig = {
  apiEndpoint: 'https://api.example.com/naming',
  vlmProvider: 'claude',
};

/** Build a successful API response body */
function buildSuccessResponse(namings = [{ markId: 1, name: 'auth/button', confidence: 0.9 }]) {
  return {
    success: true,
    data: {
      namings,
      model: 'claude-sonnet-4-6',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    },
  };
}

/** Create a mock Response object */
function createMockResponse(
  body: any,
  status = 200,
  statusText = 'OK',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  } as unknown as Response;
}

/** Standard VLM request for tests */
function makeRequest() {
  return {
    imageBase64: 'data',
    nodeTextSupplements: [],
    globalContext: '',
    platform: '',
    batchSize: 1,
  };
}

// ------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// Successful API call flow
// ------------------------------------------------------------------

describe('VLMClient - successful flow', () => {
  it('should send a POST request to the configured endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(buildSuccessResponse()),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    await client.generateNames({
      imageBase64: 'base64data',
      nodeTextSupplements: [],
      globalContext: 'login screen',
      platform: 'Web',
      batchSize: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(TEST_CONFIG.apiEndpoint);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('should include the correct payload in the request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(buildSuccessResponse()),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    await client.generateNames({
      imageBase64: 'testImageData',
      nodeTextSupplements: [
        { markId: 1, textContent: 'Login', boundVariables: [], componentProperties: {} },
      ],
      globalContext: 'auth screen',
      platform: 'iOS',
      batchSize: 1,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('generate_names');
    expect(body.imageBase64).toBe('testImageData');
    expect(body.vlmProvider).toBe('claude');
    expect(body.globalContext).toBe('auth screen');
    expect(body.platform).toBe('iOS');
    expect(body.nodeTextSupplements).toHaveLength(1);
    expect(body.nodeTextSupplements[0].markId).toBe(1);
  });

  it('should return parsed VLM response with namings', async () => {
    const namings = [
      { markId: 1, name: 'auth/button/primary', confidence: 0.95 },
      { markId: 2, name: 'auth/input/email', confidence: 0.88 },
    ];
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(buildSuccessResponse(namings)),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames({
      imageBase64: 'data',
      nodeTextSupplements: [],
      globalContext: '',
      platform: '',
      batchSize: 2,
    });

    expect(result.namings).toHaveLength(2);
    expect(result.namings[0]).toEqual({
      markId: 1,
      name: 'auth/button/primary',
      confidence: 0.95,
    });
    expect(result.namings[1]).toEqual({
      markId: 2,
      name: 'auth/input/email',
      confidence: 0.88,
    });
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.usage.totalTokens).toBe(150);
  });

  it('should use openai vlmProvider when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(buildSuccessResponse()),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient({
      apiEndpoint: 'https://api.example.com/naming',
      vlmProvider: 'openai',
    });
    await client.generateNames(makeRequest());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.vlmProvider).toBe('openai');
  });

  it('should pass an AbortSignal with the request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(buildSuccessResponse()),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    await client.generateNames(makeRequest());

    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeDefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});

// ------------------------------------------------------------------
// Retry logic on retryable errors
// ------------------------------------------------------------------

describe('VLMClient - retry logic', () => {
  // Use fake timers for retry tests to avoid waiting for real backoff delays
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry on HTTP 500 (retryable) and succeed on second attempt', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Internal Server Error' }, 500, 'Internal Server Error'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should retry on HTTP 429 (rate limit)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Too Many Requests' }, 429, 'Too Many Requests'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should retry on HTTP 502 (Bad Gateway)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Bad Gateway' }, 502, 'Bad Gateway'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should retry on HTTP 503 (Service Unavailable)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Service Unavailable' }, 503, 'Service Unavailable'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should retry on HTTP 504 (Gateway Timeout)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Gateway Timeout' }, 504, 'Gateway Timeout'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should retry on HTTP 408 (Request Timeout)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({ error: 'Request Timeout' }, 408, 'Request Timeout'),
      )
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should exhaust all 3 retry attempts and throw MAX_RETRIES_EXCEEDED', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Internal Server Error' }, 500, 'Internal Server Error'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('MAX_RETRIES_EXCEEDED');
      expect(vlmErr.retryable).toBe(false);
      expect(vlmErr.message).toContain('3 attempts');
    }

    // Should have attempted exactly 3 times
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 30_000);

  it('should retry on network errors (TypeError with fetch)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        createMockResponse(buildSuccessResponse()),
      );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });
});

// ------------------------------------------------------------------
// Non-retryable error handling
// ------------------------------------------------------------------

describe('VLMClient - non-retryable errors', () => {
  it('should not retry on HTTP 400 (Bad Request)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Bad Request' }, 400, 'Bad Request'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    await expect(client.generateNames(makeRequest())).rejects.toThrow(VLMClientError);

    // Should only attempt once (no retries for 400)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on HTTP 401 (Unauthorized)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Unauthorized' }, 401, 'Unauthorized'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    await expect(client.generateNames(makeRequest())).rejects.toThrow(VLMClientError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on HTTP 403 (Forbidden)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Forbidden' }, 403, 'Forbidden'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    await expect(client.generateNames(makeRequest())).rejects.toThrow(VLMClientError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on HTTP 404 (Not Found)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Not Found' }, 404, 'Not Found'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    await expect(client.generateNames(makeRequest())).rejects.toThrow(VLMClientError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw VLMClientError with retryable=false for non-retryable HTTP errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Bad Request' }, 400, 'Bad Request'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('HTTP_400');
      expect(vlmErr.retryable).toBe(false);
    }
  });

  it('should not retry when API returns success=false', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({
        success: false,
        error: 'Invalid image format',
      }),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('API_ERROR');
      expect(vlmErr.retryable).toBe(false);
      expect(vlmErr.message).toContain('Invalid image format');
    }

    // Should only call once (API_ERROR is not retryable)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should include HTTP status code in the error code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse({ error: 'Forbidden' }, 403, 'Forbidden'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('HTTP_403');
    }
  });

  it('should include the HTTP error body in the error message', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(
        { error: 'Detailed error info' },
        400,
        'Bad Request',
      ),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      const vlmErr = err as VLMClientError;
      expect(vlmErr.message).toContain('HTTP 400');
      expect(vlmErr.message).toContain('Bad Request');
    }
  });
});

// ------------------------------------------------------------------
// Timeout handling
// ------------------------------------------------------------------

describe('VLMClient - timeout handling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw a TIMEOUT error when the request times out', async () => {
    // Mock fetch to never resolve, simulating a hang
    const mockFetch = vi.fn().mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        // Listen for abort signal
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }
      });
    });
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    const promise = client.generateNames(makeRequest());

    // Attach a no-op catch immediately to prevent "unhandled rejection"
    // warnings while we advance timers. We'll still assert on the original promise below.
    promise.catch(() => {});

    // Advance time past all timeout + backoff delays
    // 3 attempts x 120s timeout + backoff delays
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(130_000);
    }

    await expect(promise).rejects.toThrow(VLMClientError);
    await expect(promise).rejects.toMatchObject({
      code: 'MAX_RETRIES_EXCEEDED',
    });
  });
});

// ------------------------------------------------------------------
// AbortController behavior
// ------------------------------------------------------------------

describe('VLMClient - AbortController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a new AbortController for each request attempt', async () => {
    let signalCount = 0;
    const mockFetch = vi.fn().mockImplementation((_url: string, options: any) => {
      if (options?.signal) signalCount++;
      // First call fails with retryable error, second succeeds
      if (signalCount === 1) {
        return Promise.resolve(
          createMockResponse({ error: 'Server Error' }, 500, 'Server Error'),
        );
      }
      return Promise.resolve(
        createMockResponse(buildSuccessResponse()),
      );
    });
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);
    await client.generateNames(makeRequest());

    // Each attempt should have its own signal
    expect(signalCount).toBe(2);
  });

  it('should classify AbortError as a TIMEOUT error with retryable=true', async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames(makeRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      // All 3 attempts throw AbortError -> wraps as MAX_RETRIES_EXCEEDED
      // since TIMEOUT errors are retryable
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('MAX_RETRIES_EXCEEDED');
    }

    // Should have attempted 3 times (TIMEOUT is retryable)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ------------------------------------------------------------------
// VLMClientError
// ------------------------------------------------------------------

describe('VLMClientError', () => {
  it('should be an instance of Error', () => {
    const err = new VLMClientError('test message', 'TEST_CODE', true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VLMClientError);
  });

  it('should have the correct name', () => {
    const err = new VLMClientError('test', 'CODE', false);
    expect(err.name).toBe('VLMClientError');
  });

  it('should store the error code', () => {
    const err = new VLMClientError('test', 'NETWORK_ERROR', true);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('should store the retryable flag', () => {
    const retryable = new VLMClientError('test', 'CODE', true);
    expect(retryable.retryable).toBe(true);

    const nonRetryable = new VLMClientError('test', 'CODE', false);
    expect(nonRetryable.retryable).toBe(false);
  });

  it('should store the error message', () => {
    const err = new VLMClientError('Detailed failure reason', 'CODE', false);
    expect(err.message).toBe('Detailed failure reason');
  });
});

// ------------------------------------------------------------------
// generateNamesForBatch (high-level API)
// ------------------------------------------------------------------

describe('VLMClient - generateNamesForBatch', () => {
  it('should assemble node supplements from batch data and return NamingResults', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(
        buildSuccessResponse([
          { markId: 1, name: 'auth/button/primary', confidence: 0.95 },
          { markId: 2, name: 'auth/input/email', confidence: 0.88 },
        ]),
      ),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    const batch = {
      batchIndex: 0,
      totalBatches: 1,
      nodes: [
        {
          id: 'node-001',
          originalName: 'Rectangle 45',
          nodeType: 'FRAME',
          boundingBox: { x: 100, y: 500, width: 200, height: 48 },
          depth: 1,
          parentId: 'page-root',
          textContent: 'Log In',
          boundVariables: ['primary-color'],
          componentProperties: {},
          hasChildren: true,
          childCount: 1,
          layoutMode: 'NONE' as const,
        },
        {
          id: 'node-002',
          originalName: 'Frame 123',
          nodeType: 'FRAME',
          boundingBox: { x: 100, y: 350, width: 200, height: 44 },
          depth: 1,
          parentId: 'page-root',
          textContent: 'Enter your email',
          boundVariables: [],
          componentProperties: {},
          hasChildren: true,
          childCount: 2,
          layoutMode: 'HORIZONTAL' as const,
        },
      ],
      labels: [
        {
          markId: 1,
          nodeId: 'node-001',
          labelPosition: { x: 100, y: 490 },
          highlightBox: { x: 100, y: 500, width: 200, height: 48 },
          originalName: 'Rectangle 45',
        },
        {
          markId: 2,
          nodeId: 'node-002',
          labelPosition: { x: 100, y: 340 },
          highlightBox: { x: 100, y: 350, width: 200, height: 44 },
          originalName: 'Frame 123',
        },
      ],
      markedImageBase64: 'markedImageData',
    };

    const results = await client.generateNamesForBatch(batch, 'login screen', 'iOS');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      markId: 1,
      nodeId: 'node-001',
      originalName: 'Rectangle 45',
      suggestedName: 'auth/button/primary',
      confidence: 0.95,
    });
    expect(results[1]).toEqual({
      markId: 2,
      nodeId: 'node-002',
      originalName: 'Frame 123',
      suggestedName: 'auth/input/email',
      confidence: 0.88,
    });
  });

  it('should handle missing namings by returning empty name and zero confidence', async () => {
    // VLM only returns a naming for markId 1, not markId 2
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(
        buildSuccessResponse([
          { markId: 1, name: 'auth/button', confidence: 0.9 },
        ]),
      ),
    );
    globalThis.fetch = mockFetch;

    const client = new VLMClient(TEST_CONFIG);

    const batch = {
      batchIndex: 0,
      totalBatches: 1,
      nodes: [
        {
          id: 'node-001',
          originalName: 'Rect 1',
          nodeType: 'FRAME',
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
          depth: 1,
          parentId: null,
          textContent: null,
          boundVariables: [],
          componentProperties: {},
          hasChildren: false,
          childCount: 0,
          layoutMode: 'NONE' as const,
        },
        {
          id: 'node-002',
          originalName: 'Rect 2',
          nodeType: 'FRAME',
          boundingBox: { x: 200, y: 0, width: 100, height: 50 },
          depth: 1,
          parentId: null,
          textContent: null,
          boundVariables: [],
          componentProperties: {},
          hasChildren: false,
          childCount: 0,
          layoutMode: 'NONE' as const,
        },
      ],
      labels: [
        {
          markId: 1,
          nodeId: 'node-001',
          labelPosition: { x: 0, y: 0 },
          highlightBox: { x: 0, y: 0, width: 100, height: 50 },
          originalName: 'Rect 1',
        },
        {
          markId: 2,
          nodeId: 'node-002',
          labelPosition: { x: 200, y: 0 },
          highlightBox: { x: 200, y: 0, width: 100, height: 50 },
          originalName: 'Rect 2',
        },
      ],
      markedImageBase64: 'data',
    };

    const results = await client.generateNamesForBatch(batch, '', '');

    expect(results[0].suggestedName).toBe('auth/button');
    expect(results[0].confidence).toBe(0.9);
    // markId 2 was not in the response
    expect(results[1].suggestedName).toBe('');
    expect(results[1].confidence).toBe(0);
  });
});
