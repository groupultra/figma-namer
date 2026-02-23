// ============================================================
// Figma Namer - Claude API Client
// Calls Anthropic's Claude API with vision capabilities
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

/** Result from a Claude API call */
export interface ClaudeResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Singleton client instance (reused across invocations in the same
// Vercel serverless container for connection pooling)
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is not set. ' +
          'Please configure it in your Vercel project settings.'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Call Claude with an image and text prompts using the Messages API.
 *
 * @param imageBase64 - Base64-encoded PNG/JPEG image (without data URI prefix)
 * @param systemPrompt - System-level instructions
 * @param userPrompt - User-level task description
 * @returns The raw text content from Claude's response plus usage metadata
 */
export async function callClaude(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<ClaudeResult> {
  const anthropic = getClient();

  // Strip data URI prefix if present
  const cleanBase64 = imageBase64.replace(
    /^data:image\/(png|jpeg|webp|gif);base64,/,
    ''
  );

  // Detect media type from the original string, default to PNG
  let mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' =
    'image/png';
  if (imageBase64.startsWith('data:image/jpeg')) {
    mediaType = 'image/jpeg';
  } else if (imageBase64.startsWith('data:image/webp')) {
    mediaType = 'image/webp';
  } else if (imageBase64.startsWith('data:image/gif')) {
    mediaType = 'image/gif';
  }

  const response = await anthropic.messages.create({
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

  // Extract text content from response
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
