import type { VLMRawResult } from './types';
import { callGemini } from './gemini';
import { callAnthropic } from './anthropic';
import { callOpenAI } from './openai';

export type { VLMRawResult } from './types';

/** Provider ID → { call function, default model } */
const PROVIDERS: Record<string, {
  call: (apiKey: string, imageBase64: string, systemPrompt: string, userPrompt: string, model?: string) => Promise<VLMRawResult>;
  model: string;
}> = {
  'gemini-flash': { call: callGemini, model: 'gemini-3-flash-preview' },
  'gemini-pro':   { call: callGemini, model: 'gemini-3-pro-preview' },
  'claude-sonnet': { call: callAnthropic, model: 'claude-sonnet-4-6' },
  'claude-opus':   { call: callAnthropic, model: 'claude-opus-4-6' },
  'gpt-5.2':      { call: callOpenAI, model: 'gpt-5.2' },
};

/** Map provider IDs to the API key family name (for UI display) */
export const PROVIDER_KEY_FAMILY: Record<string, string> = {
  'gemini-flash': 'google',
  'gemini-pro':   'google',
  'claude-sonnet': 'anthropic',
  'claude-opus':   'anthropic',
  'gpt-5.2':      'openai',
};

/**
 * Dispatches a VLM call to the correct provider.
 *
 * @throws Error with `.retryable` flag on transient failures
 */
export async function callProvider(
  providerId: string,
  apiKey: string,
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<VLMRawResult> {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown VLM provider: "${providerId}". Valid: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  return provider.call(apiKey, imageBase64, systemPrompt, userPrompt, provider.model);
}
