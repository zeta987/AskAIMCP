export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "perplexity"
  | "openai-compatible";

export interface ModelEntry {
  /** Name exposed to the calling agent (defaults to the model ID) */
  name: string;
  /** Model ID sent to the provider */
  id: string;
}

export interface AskAIConfig {
  /** The AI provider to use */
  provider: AIProvider;
  /** The default model ID (first entry of `models`) */
  model: string;
  /** All models the calling agent may choose from; the first is the default */
  models?: ModelEntry[];
  /** API key for the AI provider*/
  apiKey?: string;
  temperature?: number;
  /** Maximum tokens for AI responses (could causes empty or truncated responses) */
  maxTokens?: number;
  /** Base URL for AI providers */
  baseUrl?: string;
  /** Reasoning effort for reasoning models ('low', 'medium', 'high', 'max', or budget string, e.g. 10000) */
  reasoningEffort?: "low" | "medium" | "high" | string;
}

export interface AskAIRequest {
  /** The specific question or query to ask the AI */
  question: string;
  /** Optional context including background information, code snippets, etc. */
  context?: string;
  /** Model name (as exposed to the agent) or model ID; defaults to the first configured model */
  model?: string;
}

export interface AskAIResponse {
  response: string;
  provider: AIProvider;
  /** Model name as exposed to the agent */
  name?: string;
  /** Actual model ID from response */
  model?: string;
}

export interface ServerInfo {
  name: string;
  version: string;
}
