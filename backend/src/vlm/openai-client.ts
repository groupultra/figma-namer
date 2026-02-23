// ============================================================
// Figma Namer - OpenAI API Client
// Calls OpenAI's GPT-4o API with vision capabilities
// ============================================================

import OpenAI from 'openai';

/** Result from an OpenAI API call */
export interface OpenAIResult {
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
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
          'Please configure it in your Vercel project settings.'
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Call OpenAI GPT-4o with an image and text prompts using the Chat Completions API.
 *
 * @param imageBase64 - Base64-encoded PNG/JPEG image (without data URI prefix)
 * @param systemPrompt - System-level instructions
 * @param userPrompt - User-level task description
 * @returns The raw text content from GPT-4o's response plus usage metadata
 */
export async function callOpenAI(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<OpenAIResult> {
  const openai = getClient();

  // Ensure we have a proper data URI for OpenAI
  let imageUrl: string;
  if (imageBase64.startsWith('data:image/')) {
    imageUrl = imageBase64;
  } else {
    // Default to PNG if no prefix
    imageUrl = `data:image/png;base64,${imageBase64}`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
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
