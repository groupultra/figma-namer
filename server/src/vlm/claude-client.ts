// ============================================================
// Figma Namer - Claude Client (Web Dashboard version)
// Accepts apiKey as parameter instead of reading from env
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

export interface VLMResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export async function callClaude(
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<VLMResult> {
  const client = new Anthropic({ apiKey });

  // Strip data URI prefix if present
  const cleanBase64 = imageBase64.replace(
    /^data:image\/(png|jpeg|webp|gif);base64,/,
    '',
  );

  let mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' = 'image/png';
  if (imageBase64.startsWith('data:image/jpeg')) mediaType = 'image/jpeg';
  else if (imageBase64.startsWith('data:image/webp')) mediaType = 'image/webp';
  else if (imageBase64.startsWith('data:image/gif')) mediaType = 'image/gif';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
              media_type: mediaType,
              data: cleanBase64,
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

  const textBlock = response.content.find((block) => block.type === 'text');
  const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  return {
    content,
    model: response.model,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
