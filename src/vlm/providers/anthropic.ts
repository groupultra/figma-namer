import type { VLMRawResult } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 120_000;

export async function callAnthropic(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model: string = DEFAULT_MODEL,
): Promise<VLMRawResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = {
    model,
    max_tokens: 4096,
    temperature: 0.1,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`Anthropic API error ${response.status}: ${errorText.substring(0, 300)}`),
        { retryable },
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text ?? '';

    return {
      content,
      model: data.model ?? model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw Object.assign(new Error(`Anthropic request timed out after ${TIMEOUT_MS}ms`), { retryable: true });
    }
    throw err;
  }
}
