// ============================================================
// Figma Namer - Google Gemini Client
// Supports Gemini 3 Flash and Gemini 3 Pro
// ============================================================

import { GoogleGenAI } from '@google/genai';
import type { VLMResult } from './claude-client';

export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

/**
 * Call Gemini with one or more images.
 * Images are raw base64 PNG strings (no data: prefix).
 */
export async function callGemini(
  apiKey: string,
  images: string[],
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel = 'gemini-3-flash-preview',
): Promise<VLMResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Build parts: images first, then text
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> =
    images.map((img) => ({
      inlineData: {
        mimeType: 'image/png',
        data: img.replace(/^data:image\/(png|jpeg|webp|gif);base64,/, ''),
      },
    }));
  parts.push({ text: userPrompt });

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

  const content = response.text ?? '';

  return {
    content,
    model,
    usage: {
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}
