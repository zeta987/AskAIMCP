import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamText } from "ai";
import { AIService } from "./ai-service.js";
import type { AskAIConfig } from "./types.js";

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

type Part = Record<string, unknown>;

/** Build a fake streamText result that yields the given stream parts. */
function fakeStream(parts: Part[], modelId = "served-model") {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
    response: Promise.resolve({ modelId }),
    finishReason: Promise.resolve("stop"),
  };
}

const multiConfig: AskAIConfig = {
  provider: "openai-compatible",
  model: "gpt-x",
  baseUrl: "https://api.example.com/v1",
  models: [
    { name: "gpt-x", id: "gpt-x" },
    { name: "gemini", id: "gemini-3-pro" },
  ],
};

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "mocked-openai-model")),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mocked-anthropic-model")),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mocked-google-model")),
}));

describe("AIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create AIService with valid config", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should throw error for invalid config - missing model", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "",
      };

      expect(() => new AIService(config)).toThrow("Model is required");
    });

    it("should throw error for invalid maxTokens", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
        maxTokens: -1,
      };

      expect(() => new AIService(config)).toThrow(
        "Max tokens must be greater than 0"
      );
    });
  });

  describe("provider support", () => {
    it("should support OpenAI provider", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
        apiKey: "test-key",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should support Anthropic provider", () => {
      const config: AskAIConfig = {
        provider: "anthropic",
        model: "claude-opus-4-20250514",
        apiKey: "test-key",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should support Google provider", () => {
      const config: AskAIConfig = {
        provider: "google",
        model: "gemini-2.5-pro-preview-06-05",
        apiKey: "test-key",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should support Perplexity provider", () => {
      const config: AskAIConfig = {
        provider: "perplexity",
        model: "sonar-pro",
        apiKey: "test-key",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should support OpenAI-compatible provider", () => {
      const config: AskAIConfig = {
        provider: "openai-compatible",
        model: "custom-model",
        apiKey: "test-key",
        baseUrl: "https://api.example.com/v1",
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should throw error for OpenAI-compatible without baseUrl", () => {
      const config: AskAIConfig = {
        provider: "openai-compatible",
        model: "custom-model",
        apiKey: "test-key",
      };

      const service = new AIService(config);

      // This will throw when trying to get the model
      expect(() => service["getModel"]()).toThrow(
        "Base URL is required for OpenAI-compatible providers"
      );
    });
  });

  describe("configuration validation", () => {
    it("should accept valid temperature", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
        temperature: 0.7,
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should accept valid maxTokens", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
        maxTokens: 10000,
      };

      expect(() => new AIService(config)).not.toThrow();
    });

    it("should accept reasoning effort", () => {
      const config: AskAIConfig = {
        provider: "openai",
        model: "o3-2025-04-16",
        reasoningEffort: "medium",
      };

      expect(() => new AIService(config)).not.toThrow();
    });
  });

  describe("askAI streaming", () => {
    it("concatenates streamed text and reports progress", async () => {
      vi.mocked(streamText).mockReturnValue(
        fakeStream([
          { type: "reasoning", textDelta: "think" },
          { type: "text-delta", textDelta: "Hello " },
          { type: "text-delta", textDelta: "world" },
          { type: "finish" },
        ]) as never
      );
      const onProgress = vi.fn();
      const service = new AIService(multiConfig);

      const result = await service.askAI({ question: "hi" }, { onProgress });

      expect(result.response).toBe("Hello world");
      expect(result.name).toBe("gpt-x");
      expect(result.model).toBe("served-model");
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenLastCalledWith({
        textChars: 11,
        reasoningChars: 5,
      });
    });

    it("routes the request to the selected model", async () => {
      vi.mocked(streamText).mockReturnValue(
        fakeStream([{ type: "text-delta", textDelta: "ok" }]) as never
      );
      const service = new AIService(multiConfig);

      const result = await service.askAI({ question: "hi", model: "gemini" });

      expect(result.name).toBe("gemini");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const factory = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(factory).toHaveBeenCalledWith("gemini-3-pro");
    });

    it("rejects an unknown model", async () => {
      const service = new AIService(multiConfig);

      await expect(
        service.askAI({ question: "hi", model: "nope" })
      ).rejects.toThrow('Unknown model "nope". Available models: gpt-x, gemini');
    });

    it("throws on an error stream part", async () => {
      vi.mocked(streamText).mockReturnValue(
        fakeStream([
          { type: "text-delta", textDelta: "partial" },
          { type: "error", error: new Error("401 Unauthorized") },
        ]) as never
      );
      const service = new AIService(multiConfig);

      await expect(service.askAI({ question: "hi" })).rejects.toThrow(
        "AI service error: 401 Unauthorized"
      );
    });

    it("throws on an empty response", async () => {
      vi.mocked(streamText).mockReturnValue(
        fakeStream([{ type: "finish" }]) as never
      );
      const service = new AIService(multiConfig);

      await expect(service.askAI({ question: "hi" })).rejects.toThrow(
        "Model returned an empty response (finish reason: stop)"
      );
    });
  });
});
