/** Raw result from a VLM provider API call */
export interface VLMRawResult {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}
