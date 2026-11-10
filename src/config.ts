import fs from "node:fs";
import type {
  AIProvider,
  AskAIConfig,
  ModelEntry,
  ServerInfo,
} from "./types.js";

let VERSION = "unknown";
try {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
  );
  VERSION = packageJson.version;
} catch (error) {
  console.error("Failed to obtain version:", error);
}

export const SERVER_INFO: ServerInfo = {
  name: "ask-ai",
  version: VERSION,
};

/**
 * Parse a model list such as "gpt-5,gemini=gemini-3-pro" (comma or newline
 * separated). An entry "name=id" exposes `name` to the agent and sends `id`
 * to the provider; a bare entry uses the ID as its name.
 */
export function parseModels(raw: string): ModelEntry[] {
  const entries: ModelEntry[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(/[,\n]/)) {
    const item = part.trim();
    if (!item) continue;

    const eq = item.indexOf("=");
    const name = (eq >= 0 ? item.slice(0, eq) : item).trim();
    const id = (eq >= 0 ? item.slice(eq + 1) : item).trim();

    if (!name || !id) {
      throw new Error(`Invalid model entry: "${item}"`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate model name: "${name}"`);
    }
    seen.add(name);
    entries.push({ name, id });
  }

  return entries;
}

export function getConfig(): AskAIConfig {
  const provider = process.env["PROVIDER"] as AIProvider;
  const modelsEnv = process.env["MODELS"] ?? process.env["MODEL"];

  if (!provider) {
    throw new Error("PROVIDER environment variable is required");
  }

  const models = modelsEnv ? parseModels(modelsEnv) : [];
  const defaultModel = models[0];
  if (!defaultModel) {
    throw new Error("MODELS (or MODEL) environment variable is required");
  }

  const config: AskAIConfig = {
    provider,
    model: defaultModel.id,
    models,
  };

  const apiKey = process.env["API_KEY"];
  if (apiKey) {
    config.apiKey = apiKey;
  }

  const temperature = process.env["TEMPERATURE"];
  if (temperature) {
    config.temperature = parseFloat(temperature);
  }

  const maxTokens = process.env["MAX_TOKENS"];
  if (maxTokens) {
    config.maxTokens = parseInt(maxTokens, 10);
  }

  const baseUrl = process.env["BASE_URL"];
  if (baseUrl) {
    config.baseUrl = baseUrl;
  }

  const reasoningEffort = process.env["REASONING_EFFORT"];
  if (reasoningEffort) {
    config.reasoningEffort = reasoningEffort;
  }

  return config;
}
