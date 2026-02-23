// ============================================================
// Figma Namer - OpenAI Client (Web Dashboard version)
// Uses GPT-5.2 with vision capabilities
// ============================================================

import OpenAI from 'openai';
import type { VLMResult } from './claude-client';

/**
 * Call OpenAI GPT-5.2 with one or more images.
 * Images are raw base64 PNG strings (no data: prefix).
 */
export async function callOpenAI(
  apiKey: string,
  images: string[],
  systemPrompt: string,
  userPrompt: string,
): Promise<VLMResult> {
  const client = new OpenAI({ apiKey });

  // Build content: images then text
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = images.map((img) => {
    const imageUrl = img.startsWith('data:image/') ? img : `data:image/png;base64,${img}`;
    return {
      type: 'image_url' as const,
      image_url: { url: imageUrl, detail: 'high' as const },
    };
  });
  content.push({ type: 'text' as const, text: userPrompt });

  const response = await client.chat.completions.create({
    model: 'gpt-5.2',
    max_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
  });

  const choice = response.choices[0];
  const text = choice?.message?.content ?? '';
  const usage = response.usage;

  return {
    content: text,
    model: response.model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}
