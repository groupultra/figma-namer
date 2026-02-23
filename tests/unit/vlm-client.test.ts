// ============================================================
// Tests for src/vlm/client.ts
// Covers: VLMClient, retry logic, error classification,
//         successful flow, generateNamesForBatch
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VLMClient, VLMClientError } from '../../src/vlm/client';
import type { VLMClientConfig } from '../../src/vlm/client';

// ------------------------------------------------------------------
// Mock the providers module
// ------------------------------------------------------------------

vi.mock('../../src/vlm/providers', () => ({
  callProvider: vi.fn(),
  PROVIDER_KEY_FAMILY: {
    'gemini-flash': 'google',
    'claude-sonnet': 'anthropic',
  },
}));

import { callProvider } from '../../src/vlm/providers';
const mockCallProvider = vi.mocked(callProvider);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const TEST_CONFIG: VLMClientConfig = {
  vlmProvider: 'gemini-flash',
  apiKey: 'test-api-key',
};

/** Build a successful raw result from the provider */
function buildSuccessResult(content?: string) {
  return {
    content: content ?? JSON.stringify([
      { markId: 1, name: 'Login Button - Default - Primary', confidence: 0.9 },
    ]),
    model: 'gemini-3-flash-preview',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  };
}

// ------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------

beforeEach(() => {
  mockCallProvider.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// Successful API call flow
// ------------------------------------------------------------------

describe('VLMClient - successful flow', () => {
  it('should call the provider with correct arguments', async () => {
    mockCallProvider.mockResolvedValue(buildSuccessResult());

    const client = new VLMClient(TEST_CONFIG);
    await client.generateNames('base64data', 'system prompt', 'user prompt', [1]);

    expect(mockCallProvider).toHaveBeenCalledTimes(1);
    expect(mockCallProvider).toHaveBeenCalledWith(
      'gemini-flash',
      'test-api-key',
      'base64data',
      'system prompt',
      'user prompt',
    );
  });

  it('should return parsed VLM response with namings', async () => {
    const content = JSON.stringify([
      { markId: 1, name: 'Login Button - Default - Primary', confidence: 0.95 },
      { markId: 2, name: 'Login TextField - Error', confidence: 0.88 },
    ]);
    mockCallProvider.mockResolvedValue(buildSuccessResult(content));

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames('data', 'sys', 'usr', [1, 2]);

    expect(result.namings).toHaveLength(2);
    expect(result.namings[0]).toEqual({
      markId: 1,
      name: 'Login Button - Default - Primary',
      confidence: 0.95,
    });
    expect(result.namings[1]).toEqual({
      markId: 2,
      name: 'Login TextField - Error',
      confidence: 0.88,
    });
    expect(result.model).toBe('gemini-3-flash-preview');
    expect(result.usage.totalTokens).toBe(150);
  });

  it('should use the configured provider', async () => {
    mockCallProvider.mockResolvedValue(buildSuccessResult());

    const client = new VLMClient({
      vlmProvider: 'claude-sonnet',
      apiKey: 'anthropic-key',
    });
    await client.generateNames('data', 'sys', 'usr', [1]);

    expect(mockCallProvider).toHaveBeenCalledWith(
      'claude-sonnet',
      'anthropic-key',
      'data',
      'sys',
      'usr',
    );
  });
});

// ------------------------------------------------------------------
// Retry logic on retryable errors
// ------------------------------------------------------------------

describe('VLMClient - retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry on retryable errors and succeed on second attempt', async () => {
    mockCallProvider
      .mockRejectedValueOnce(
        Object.assign(new Error('HTTP 500'), { retryable: true }),
      )
      .mockResolvedValueOnce(buildSuccessResult());

    const client = new VLMClient(TEST_CONFIG);
    const result = await client.generateNames('data', 'sys', 'usr', [1]);

    expect(mockCallProvider).toHaveBeenCalledTimes(2);
    expect(result.namings).toHaveLength(1);
  });

  it('should exhaust all 3 retry attempts and throw MAX_RETRIES_EXCEEDED', async () => {
    mockCallProvider.mockRejectedValue(
      Object.assign(new Error('HTTP 500'), { retryable: true }),
    );

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames('data', 'sys', 'usr', [1]);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('MAX_RETRIES_EXCEEDED');
      expect(vlmErr.retryable).toBe(false);
      expect(vlmErr.message).toContain('3 attempts');
    }

    expect(mockCallProvider).toHaveBeenCalledTimes(3);
  }, 30_000);
});

// ------------------------------------------------------------------
// Non-retryable error handling
// ------------------------------------------------------------------

describe('VLMClient - non-retryable errors', () => {
  it('should not retry on non-retryable errors', async () => {
    mockCallProvider.mockRejectedValue(
      Object.assign(new Error('HTTP 401: Unauthorized'), { retryable: false }),
    );

    const client = new VLMClient(TEST_CONFIG);

    await expect(
      client.generateNames('data', 'sys', 'usr', [1]),
    ).rejects.toThrow(VLMClientError);

    expect(mockCallProvider).toHaveBeenCalledTimes(1);
  });

  it('should throw VLMClientError with PROVIDER_ERROR code for non-retryable errors', async () => {
    mockCallProvider.mockRejectedValue(
      Object.assign(new Error('Bad Request'), { retryable: false }),
    );

    const client = new VLMClient(TEST_CONFIG);

    try {
      await client.generateNames('data', 'sys', 'usr', [1]);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VLMClientError);
      const vlmErr = err as VLMClientError;
      expect(vlmErr.code).toBe('PROVIDER_ERROR');
      expect(vlmErr.retryable).toBe(false);
    }
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
    const content = JSON.stringify([
      { markId: 1, name: 'Login Button - Default - Primary', confidence: 0.95 },
      { markId: 2, name: 'Login TextField - Error', confidence: 0.88 },
    ]);
    mockCallProvider.mockResolvedValue(buildSuccessResult(content));

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
      suggestedName: 'Login Button - Default - Primary',
      confidence: 0.95,
    });
    expect(results[1]).toEqual({
      markId: 2,
      nodeId: 'node-002',
      originalName: 'Frame 123',
      suggestedName: 'Login TextField - Error',
      confidence: 0.88,
    });
  });

  it('should handle missing namings by returning empty name and zero confidence', async () => {
    const content = JSON.stringify([
      { markId: 1, name: 'Login Button - Default', confidence: 0.9 },
    ]);
    mockCallProvider.mockResolvedValue(buildSuccessResult(content));

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

    expect(results[0].suggestedName).toBe('Login Button - Default');
    expect(results[0].confidence).toBe(0.9);
    // markId 2 was not in the response
    expect(results[1].suggestedName).toBe('');
    expect(results[1].confidence).toBe(0);
  });
});
