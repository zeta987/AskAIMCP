import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createPerplexity } from "@ai-sdk/perplexity";
import { streamText } from "ai";
import type {
  AskAIConfig,
  AskAIRequest,
  AskAIResponse,
  ModelEntry,
} from "./types.js";

import type { AnthropicProviderSettings } from "@ai-sdk/anthropic";
import type { GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";
import type { OpenAIProviderSettings } from "@ai-sdk/openai";
import type { PerplexityProviderSettings } from "@ai-sdk/perplexity";

/** Progress callback invoked while the response is streaming in. */
export type ProgressCallback = (info: {
  /** Characters of answer text received so far */
  textChars: number;
  /** Characters of reasoning text received so far */
  reasoningChars: number;
}) => void;

const SYSTEM_PROMPT = `You are a large language model acting as a collaborative assistant.

You are being queried by another AI model that is using a tool to ask for your help.

Your role is to provide a helpful, peer-level response to assist the calling AI. It may be seeking a second opinion, a different perspective, or help with a problem it cannot solve on its own.

Key considerations:
- The request is from another AI. Your response will be programmatically processed and used to help it complete its task.
- Frame your response as a suggestion or an alternative viewpoint, not as a definitive command or factual statement.
- The calling AI might omit critical background, context, or prior conversation history, assuming you have this information. You do not. At the slightest indication that the provided information is incomplete or lacks detail, you MUST immediately halt your response. Do not proceed with an answer. Instead, you must explicitly state that the context is incomplete and that you have no memory of past interactions. Demand that the calling AI provide the absolute full and complete context, including all relevant history, before you can provide any assistance.

- The questioner's assumptions, viewpoint, or chosen direction might be incorrect. Step back, adopt a broader perspective, and think carefully before answering.
- Be aware of your own limitations and knowledge cutoff. If you are uncertain or a request is beyond your capabilities, state that clearly rather than give a misleading or evasive reply.

Your goal is to help your fellow AI overcome its challenge. Provide clear, structured, and actionable information.`;

export class AIService {
  private config: AskAIConfig;
  private models: ModelEntry[];

  constructor(config: AskAIConfig) {
    this.config = config;
    this.models = config.models?.length
      ? config.models
      : [{ name: config.model, id: config.model }];
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.model) {
      throw new Error("Model is required");
    }

    if (this.config.maxTokens !== undefined && this.config.maxTokens <= 0) {
      throw new Error("Max tokens must be greater than 0");
    }
  }

  /** Models available to the calling agent; the first entry is the default. */
  getModels(): ModelEntry[] {
    return this.models;
  }

  /** Resolve a requested model name or ID to a configured entry. */
  resolveModel(requested?: string): ModelEntry {
    const fallback = this.models[0];
    if (!fallback) {
      throw new Error("No model configured");
    }
    if (!requested) return fallback;

    const match =
      this.models.find((m) => m.name === requested) ??
      this.models.find((m) => m.id === requested);
    if (!match) {
      const names = this.models.map((m) => m.name).join(", ");
      throw new Error(
        `Unknown model "${requested}". Available models: ${names}`
      );
    }
    return match;
  }

  private getModel(modelId: string = this.config.model) {
    switch (this.config.provider) {
      case "openai":
      case "openai-compatible": {
        const settings: OpenAIProviderSettings = {};

        if (this.config.baseUrl) {
          settings.baseURL = this.config.baseUrl;
        } else if (this.config.provider === "openai-compatible") {
          throw new Error(
            "Base URL is required for OpenAI-compatible providers"
          );
        }

        if (this.config.apiKey) settings.apiKey = this.config.apiKey;

        const openai = createOpenAI(settings);
        return openai(modelId);
      }
      case "anthropic": {
        const settings: AnthropicProviderSettings = {};
        if (this.config.apiKey) settings.apiKey = this.config.apiKey;
        if (this.config.baseUrl) settings.baseURL = this.config.baseUrl;

        const anthropic = createAnthropic(settings);
        return anthropic(modelId);
      }
      case "google": {
        const settings: GoogleGenerativeAIProviderSettings = {};
        if (this.config.apiKey) settings.apiKey = this.config.apiKey;
        if (this.config.baseUrl) settings.baseURL = this.config.baseUrl;

        const google = createGoogleGenerativeAI(settings);
        return google(modelId);
      }
      case "perplexity": {
        const settings: PerplexityProviderSettings = {};
        if (this.config.apiKey) settings.apiKey = this.config.apiKey;
        if (this.config.baseUrl) settings.baseURL = this.config.baseUrl;

        const perplexity = createPerplexity(settings);
        return perplexity(modelId);
      }
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  async askAI(
    request: AskAIRequest,
    options: { onProgress?: ProgressCallback; abortSignal?: AbortSignal } = {}
  ): Promise<AskAIResponse> {
    try {
      const entry = this.resolveModel(request.model);
      const model = this.getModel(entry.id);

      // Construct the prompt with context if provided
      let prompt = `<question>\n${request.question}\n</question>`;

      if (request.context && request.context.trim()) {
        prompt = `<context>
${request.context}
</context>

${prompt}`;
      }

      const streamOptions: Parameters<typeof streamText>[0] = {
        model,
        prompt,
        system: SYSTEM_PROMPT,
        maxRetries: 0,
        // Errors are surfaced through the `error` stream parts below.
        onError: () => {},
      };

      if (options.abortSignal) {
        streamOptions.abortSignal = options.abortSignal;
      }

      // Add optional parameters only if configured
      if (this.config.temperature !== undefined) {
        streamOptions.temperature = this.config.temperature;
      }

      if (this.config.maxTokens !== undefined) {
        streamOptions.maxTokens = this.config.maxTokens;
      }

      if (this.config.reasoningEffort !== undefined) {
        streamOptions.providerOptions = {
          openai: { reasoningEffort: this.config.reasoningEffort },
        };
      }

      // Stream the response so the upstream connection never sits idle
      // (e.g. behind proxies with a ~100-120s idle timeout).
      const result = streamText(streamOptions);

      let text = "";
      let reasoningChars = 0;
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            text += part.textDelta;
            break;
          case "reasoning":
            reasoningChars += part.textDelta.length;
            break;
          case "error":
            throw part.error instanceof Error
              ? part.error
              : new Error(String(part.error));
          default:
            continue;
        }
        options.onProgress?.({ textChars: text.length, reasoningChars });
      }

      if (!text.trim()) {
        const finishReason = await result.finishReason.catch(() => "unknown");
        throw new Error(
          `Model returned an empty response (finish reason: ${finishReason})`
        );
      }

      const response = await result.response.catch(() => undefined);

      return {
        response: text,
        provider: this.config.provider,
        name: entry.name,
        model: response?.modelId ?? entry.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`AI service error: ${errorMessage}`);
    }
  }
}
