// ============================================================
// Figma Namer - Google Gemini Client
// Supports Gemini 3 Flash and Gemini 3 Pro
// ============================================================

import { GoogleGenAI } from '@google/genai';
import type { VLMResult } from './claude-client';

export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

export async function callGemini(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel = 'gemini-3-flash-preview',
): Promise<VLMResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Strip data URI prefix if present (Gemini takes raw base64)
  const cleanBase64 = imageBase64.replace(
    /^data:image\/(png|jpeg|webp|gif);base64,/,
    '',
  );

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64,
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
    ],
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
