// ============================================================
// Figma Namer - Anthropic Claude Client
// Supports Claude Opus 4.6 and Claude Sonnet 4.6
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

export type ClaudeModel = 'claude-opus-4-6' | 'claude-sonnet-4-6';

export interface VLMResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call Claude with one or more images.
 * Images are raw base64 PNG strings (no data: prefix).
 */
export async function callClaude(
  apiKey: string,
  images: string[],
  systemPrompt: string,
  userPrompt: string,
  model: ClaudeModel = 'claude-sonnet-4-6',
): Promise<VLMResult> {
  const client = new Anthropic({ apiKey });

  // Build content blocks: images first, then text prompt
  const content: Anthropic.Messages.ContentBlockParam[] = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: img.replace(/^data:image\/(png|jpeg|webp|gif);base64,/, ''),
    },
  }));
  content.push({ type: 'text' as const, text: userPrompt });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
  );

  return {
    content: textBlock?.text ?? '',
    model: response.model,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
