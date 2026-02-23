import type { VLMRawResult } from './types';

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const TIMEOUT_MS = 120_000;

export async function callGemini(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model: string = DEFAULT_MODEL,
): Promise<VLMRawResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
          { text: userPrompt },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 300)}`),
        { retryable },
      );
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text ?? '';
    const usage = data.usageMetadata ?? {};

    return {
      content,
      model,
      usage: {
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw Object.assign(new Error(`Gemini request timed out after ${TIMEOUT_MS}ms`), { retryable: true });
    }
    throw err;
  }
}
