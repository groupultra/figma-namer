// ============================================================
// Figma Namer - Google Gemini Client
// New VLM provider using the @google/genai SDK
// ============================================================

import { GoogleGenAI } from '@google/genai';
import type { VLMResult } from './claude-client';

export async function callGemini(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<VLMResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Strip data URI prefix if present
  const cleanBase64 = imageBase64.replace(
    /^data:image\/(png|jpeg|webp|gif);base64,/,
    '',
  );

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
    model: 'gemini-2.5-flash',
    usage: {
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}
