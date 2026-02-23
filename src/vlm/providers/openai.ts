import type { VLMRawResult } from './types';

const DEFAULT_MODEL = 'gpt-5.2';
const TIMEOUT_MS = 120_000;

export async function callOpenAI(
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
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
              detail: 'high',
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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 300)}`),
        { retryable },
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    const usage = data.usage ?? {};

    return {
      content,
      model: data.model ?? model,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw Object.assign(new Error(`OpenAI request timed out after ${TIMEOUT_MS}ms`), { retryable: true });
    }
    throw err;
  }
}
