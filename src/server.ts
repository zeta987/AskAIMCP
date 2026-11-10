#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AIService } from "./ai-service.js";
import { getConfig, SERVER_INFO } from "./config.js";
import type { AskAIRequest, AskAIResponse, ModelEntry } from "./types.js";

const PROGRESS_INTERVAL_MS = 10_000;

/**
 * Label shown above the answer. Aliased models (name differs from ID) are
 * shown by alias only, so an alias can keep the underlying model anonymous.
 */
function formatModelLabel(
  response: AskAIResponse,
  models: ModelEntry[]
): string {
  const entry = models.find((m) => m.name === response.name);
  if (entry && entry.name !== entry.id) {
    return entry.name;
  }
  return `${response.provider}/${response.model ?? response.name}`;
}

async function createServer(): Promise<McpServer> {
  const config = getConfig();
  const aiService = new AIService(config);

  const server = new McpServer({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
  });

  const models = aiService.getModels();
  const modelNames = models.map((m) => m.name) as [string, ...string[]];
  const defaultModelName = modelNames[0];
  const modelList = models.map((m) => `- ${m.name}`).join("\n");

  server.tool(
    "ask_ai",
    `Call another AI model for help, a fresh perspective, or brainstorming across technical, creative, research, or strategic topics.

When should you call me?
- You're stuck on a problem or need help debugging or researching.
- You seek alternative viewpoints on design, planning, or creative work.
- You want a review or suggestions for improvement (code, writing, strategy, etc.).
- You need new ideas, inspiration, or broader perspectives.

How to use me for the best results:
- Put your focused question in the 'question' field.
- Provide comprehensive background in the 'context' field (code, data, requirements, conversation history, constraints, etc.) - the more detailed information you provide, the more accurate and reliable the response will be.
> Warning: Vague questions with minimal context will likely result in imprecise or unreliable answers. Quality and completeness of your input directly impacts the quality of AI assistance.

How to phrase your question effectively:
- Prefer open-ended questions that explain the issue you face and the goal you aim to achieve.
- Avoid adding unverified assumptions or early conclusions; they might be wrong and lead both of us astray.

**CRITICAL WARNING:**
The response comes from another AI. It could be inaccurate or misleading.
You MUST verify any information, code, or suggestions provided.
Treat the answer as guidance to be checked, not as fact.

Available models (pass one in the 'model' field; default: ${defaultModelName}):
${modelList}

Choosing a model:
- If the user names a model or model family (e.g. "ask gemini", "use the claude one"), pick the entry whose name matches it.
- To get several independent opinions, call this tool once per model.`,
    {
      question: z
        .string()
        .describe("The specific question or query to ask the AI model"),
      model: z
        .enum(modelNames)
        .optional()
        .describe(
          `Which model to ask. One of: ${modelNames.join(", ")}. Defaults to ${defaultModelName}.`
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Optional context: background information, code snippets, previous discussion results, conversation history, and any other relevant details"
        ),
    },
    async ({ question, context, model }, extra) => {
      const progressToken = extra._meta?.progressToken;
      let progress = 0;
      let lastSent = 0;
      let status = "Waiting for model response...";

      // Periodic progress notifications let clients that support it
      // (resetTimeoutOnProgress) know the call is still alive.
      const sendProgress = (message: string) => {
        if (progressToken === undefined) return;
        progress += 1;
        extra
          .sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress, message },
          })
          .catch(() => {});
      };
      const heartbeat =
        progressToken === undefined
          ? undefined
          : setInterval(() => {
              if (Date.now() - lastSent >= PROGRESS_INTERVAL_MS) {
                lastSent = Date.now();
                sendProgress(status);
              }
            }, PROGRESS_INTERVAL_MS);

      try {
        const request: AskAIRequest = { question };
        if (context !== undefined) {
          request.context = context;
        }
        if (model !== undefined) {
          request.model = model;
        }
        const response = await aiService.askAI(request, {
          abortSignal: extra.signal,
          onProgress: ({ textChars, reasoningChars }) => {
            status =
              textChars > 0
                ? `Receiving answer (${textChars} chars)`
                : `Model is reasoning (${reasoningChars} chars)`;
            if (Date.now() - lastSent < PROGRESS_INTERVAL_MS) return;
            lastSent = Date.now();
            sendProgress(status);
          },
        });
        const label = formatModelLabel(response, models);

        return {
          content: [
            {
              type: "text" as const,
              text: `Response from "${label}":

IMPORTANT: 
The following content is generated by AI.
Due to technical limitations of LLM including hallucinations, knowledge constraints, and potential inaccuracies due to insufficient context details, you MUST read this response with caution. Assume there could be fundamental factual errors.
You MUST carefully evaluate and verify before adoption. Do not accept any statements as facts without critical thinking, as this may lead to serious misleading.

\n\n${response.response}
`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [
            {
              type: "text" as const,
              text: `**Error**: Failed to get AI response: ${errorMessage}\n\nPlease ask user to configuration and try again.`,
            },
          ],
          isError: true,
        };
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }
    }
  );

  return server;
}

async function main(): Promise<void> {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error("Ask AI MCP Server is running...");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Failed to start server: ${errorMessage}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
