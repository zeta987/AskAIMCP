# Ask AI MCP Server (zeta fork)

> This is a modified fork of [`ask-ai-mcp`](https://www.npmjs.com/package/ask-ai-mcp), published as [`ask-ai-mcp-zeta`](https://www.npmjs.com/package/ask-ai-mcp-zeta). Changes in this fork:
>
> - **Several models in one server**: list them in `MODELS`; the `ask_ai` tool exposes them as a `model` enum so the calling agent knows what it can pick.
> - **Streaming responses**: the upstream request is streamed, so proxies with an idle timeout (e.g. Cloudflare's ~100-120 s) see traffic while the model works. The server also sends MCP progress notifications every 10 s when the client asks for them.
> - Empty responses and mid-stream errors are reported as tool errors instead of empty answers.

A **Model Context Protocol (MCP) server** that enables AI models to consult with another AI model through tool calling. This server acts as a bridge, allowing AI assistants to ask questions to different AI models when they need help, alternative perspectives, code reviews, or expert opinions on complex problems. It supports multiple AI providers and is designed for seamless integration with MCP-compatible clients.

## ✨ Features

- **Multiple Models per Server**: one MCP entry, many models, selected per call
- **Streaming**: responses are streamed from the provider to avoid idle-timeout cut-offs
- **Multiple AI Providers**: OpenAI, Anthropic, Google AI Studio, Perplexity, and OpenAI-compatible endpoints
- **Reasoning Model Support**: Configurable reasoning effort for advanced models across all providers
- **Efficient Context Handling**: Single-call design for maximum efficiency and cost-effectiveness
- **Flexible Configuration**: Optional parameters for temperature, token limits, and custom endpoints
- **Production Ready**: Comprehensive error handling, validation, and TypeScript support

## 📦 Installation

### Prerequisites

- Node.js 24.0.0 or higher
- API key for your chosen AI provider

### Quick Start (Recommended)

The easiest way to use this MCP server is with npx:

```json
{
  "mcpServers": {
    "ask-ai": {
      "command": "npx",
      "args": ["-y", "ask-ai-mcp-zeta"],
      "env": {
        "PROVIDER": "openai-compatible",
        "BASE_URL": "https://your-gateway.example.com/v1",
        "API_KEY": "your_api_key_here",
        "MODELS": "gpt-5,gemini-3-pro,claude-opus-4-5,editor-A=kimi-k2"
      }
    }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers."ask-ai"]
command = "npx"
args = ["-y", "ask-ai-mcp-zeta"]
env = { "PROVIDER" = "openai-compatible", "BASE_URL" = "https://your-gateway.example.com/v1", "API_KEY" = "your_api_key_here", "MODELS" = "gpt-5,gemini-3-pro,claude-opus-4-5,editor-A=kimi-k2" }
startup_timeout_sec = 60.0
tool_timeout_sec = 1800.0
```

The first model in `MODELS` is the default. The agent sees the model names in the tool description and in the `model` parameter's enum, so a request like "ask gemini about this" leads it to pick `gemini-3-pro`.

Use `name=id` to expose a different name than the provider's model ID (e.g. `editor-A=kimi-k2`). Aliased models are labelled only by their name in responses, which keeps the underlying model anonymous to the calling agent.

### From Source (Advanced)

For development or customization:

```bash
git clone <link to repository>
cd ask-ai-mcp
pnpm install
pnpm run build
```

Then reference the built server in your MCP configuration:

```json
{
  "mcpServers": {
    "ask-ai": {
      "command": "node",
      "args": ["/path/to/AskAIMCP/dist/server.js"],
      "env": {
        "PROVIDER": "openai",
        "MODELS": "o3-2025-04-16,gpt-4.1",
        "API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## ⚙️ Configuration

### Required Environment Variables

| Variable   | Description                                                                                |
| :--------- | :----------------------------------------------------------------------------------------- |
| `PROVIDER` | The AI provider to use. `openai`, `anthropic`, `google`, `perplexity`, `openai-compatible` |
| `MODELS`   | Comma- or newline-separated model list; `name=id` sets an alias. The first is the default. |
| `MODEL`    | Single model (backward compatible). Ignored when `MODELS` is set.                          |
| `API_KEY`  | Your API key for the chosen provider.                                                      |

### Optional Environment Variables

| Variable           | Description                                                                                 |
| :----------------- | :------------------------------------------------------------------------------------------ |
| `TEMPERATURE`      | Sampling temperature for the model (e.g., `0.7`).                                           |
| `MAX_TOKENS`       | Maximum number of tokens to generate (e.g., `10000`).                                       |
| `BASE_URL`         | Custom endpoint for `openai-compatible` providers.                                          |
| `REASONING_EFFORT` | For reasoning models: `low`, `medium`, `high`, `max`, or a budget string (e.g., `"10000"`). |

### Provider Examples

#### OpenAI

```ini
PROVIDER=openai
MODEL=o3-2025-04-16
API_KEY=your_openai_api_key
# Optional
REASONING_EFFORT=medium  # low, medium, high, max, or budget like "10000"
```

#### Anthropic

```ini
PROVIDER=anthropic
MODEL=claude-opus-4-20250514
API_KEY=your_anthropic_api_key
```

#### Google AI Studio

```ini
PROVIDER=google
MODEL=gemini-2.5-pro-preview-06-05
API_KEY=your_google_api_key
```

#### Perplexity

```ini
PROVIDER=perplexity
MODEL=sonar-pro
API_KEY=your_perplexity_api_key
```

#### OpenAI-Compatible

```ini
PROVIDER=openai-compatible
MODEL=your_model_name
API_KEY=your_api_key
BASE_URL=https://your-endpoint.com/v1
```

### 🛠️ Available Tool

Once integrated, AI models can use the `ask_ai` tool:

```json
{
  "name": "ask_ai",
  "arguments": {
    "question": "How can I optimize this React component?",
    "model": "gemini-3-pro",
    "context": "I have a React component that renders 1000+ items and re-renders frequently causing performance issues. Current code: [include your code here]"
  }
}
```

`model` is optional and defaults to the first entry in `MODELS`. All models share the same `PROVIDER`, `BASE_URL`, `API_KEY`, `TEMPERATURE`, `MAX_TOKENS` and `REASONING_EFFORT`.

### About timeouts

Streaming keeps bytes flowing only if the gateway forwards them while the model is working. Reasoning models may stay silent until their thinking ends; if your gateway does not stream reasoning deltas or keep-alive comments, an idle-timeout proxy can still cut the request. In that case enable streaming keep-alive on the gateway side.

## 📄 License

This project is licensed under the [GNU General Public License, version 2](LICENSE). It is a modified version of `ask-ai-mcp` by its original author; this fork keeps the same license.
