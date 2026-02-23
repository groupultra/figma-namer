// ============================================================
// Figma Namer - OpenAI Client (Web Dashboard version)
// Uses GPT-5.2 with vision capabilities
// ============================================================

import OpenAI from 'openai';
import type { VLMResult } from './claude-client';

export async function callOpenAI(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<VLMResult> {
  const client = new OpenAI({ apiKey });

  // OpenAI requires the full data URI prefix
  let imageUrl: string;
  if (imageBase64.startsWith('data:image/')) {
    imageUrl = imageBase64;
  } else {
    imageUrl = `data:image/png;base64,${imageBase64}`;
  }

  const response = await client.chat.completions.create({
    model: 'gpt-5.2',
    max_tokens: 4096,
    temperature: 0.1,
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
              url: imageUrl,
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
  });

  const choice = response.choices[0];
  const content = choice?.message?.content ?? '';
  const usage = response.usage;

  return {
    content,
    model: response.model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}
