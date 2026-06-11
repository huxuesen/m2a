# MiMoCode2API

OpenAI-compatible API gateway for [Xiaomi MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code), enabling any OpenAI client (Hermes Agent, ChatGPT-next-web, etc.) to use MiMo models through the standard `/v1/chat/completions` endpoint.

Based on [OpenCode2API](https://github.com/TiaraBasori/OpenCode2API), adapted for MiMo-Code's API and auth headers.

## Why This Exists

MiMo-Code is a CLI coding agent (OpenCode fork) by Xiaomi, providing free access to MiMo models via `mimo serve`. However, its API is proprietary — no OpenAI `/v1/chat/completions` compatibility. This proxy bridges that gap.

**Key finding**: MiMo models (mimo-auto) don't follow prompt-injected `<function_calls>` format for tool calling. Instead, this gateway uses `DISABLE_TOOLS=true` mode, letting clients like Hermes Agent manage tool calling through their own system prompt mechanism. This works reliably — Hermes successfully calls tools (skill_view, terminal, etc.) through the mimocode provider.

## Features

- OpenAI `/v1/chat/completions` compatible endpoint (streaming + non-streaming)
- `/v1/models` endpoint listing all available MiMo models
- Docker deployment with auto-start `mimo serve` backend
- API key authentication (proxy-level)
- Conversation/session auto-cleanup
- Health check endpoint (`/health`)

## Available Models

| Model ID | Name | Free? |
|----------|------|-------|
| `mimo/mimo-auto` | MiMo Auto | Yes |
| `xiaomi/mimo-v2-omni` | MiMo V2 Omni | No (requires Xiaomi API key) |
| `xiaomi/mimo-v2-pro` | MiMo V2 Pro | No |
| `xiaomi/mimo-v2-flash` | MiMo V2 Flash | No |
| `xiaomi/mimo-v2.5` | MiMo V2.5 | No |
| `xiaomi/mimo-v2.5-pro` | MiMo V2.5 Pro | No |
| `xiaomi/mimo-v2.5-pro-ultraspeed` | MiMo V2.5 Pro UltraSpeed | No |

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/Sliverkiss/mimocode2api.git
cd mimocode2api
cp .env.example .env
# Edit .env — set API_KEY and MIMOCODE_SERVER_PASSWORD
```

### 2. Docker Deploy

```bash
docker compose build
docker compose up -d
```

Wait ~25s for `mimo serve` backend to initialize, then verify:

```bash
curl http://127.0.0.1:10000/health
# {"status":"ok","proxy":true}
```

### 3. Test API

```bash
# List models
curl -s http://127.0.0.1:10000/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY" | jq

# Chat completion
curl -s http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo/mimo-auto","messages":[{"role":"user","content":"hello"}]}' | jq
```

### 4. Hermes Agent Integration

```bash
hermes config set providers.mimocode.base_url http://127.0.0.1:10000/v1
hermes config set providers.mimocode.api_key YOUR_API_KEY

hermes chat -q "your question" --provider mimocode --model mimo/mimo-auto
```

## Configuration

All settings via `.env` file (see `.env.example` for full reference):

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | — | Proxy API key (client auth) |
| `MIMOCODE_SERVER_PASSWORD` | — | MiMo-Code backend password |
| `MIMOCODE_DISABLE_TOOLS` | `true` | Disable proxy tool bridging (recommended — let client manage tools) |
| `MIMOCODE_PROXY_OMIT_SYSTEM_PROMPT` | `false` | Preserve client system prompt (contains tool definitions) |
| `MIMOCODE_PROXY_PROMPT_MODE` | `standard` | Prompt processing mode |
| `MIMOCODE_PROXY_DEBUG` | `false` | Enable debug logging |
| `MIMOCODE_PROXY_PORT` | `10000` | Proxy listen port |
| `MIMOCODE_SERVER_PORT` | `10001` | Internal `mimo serve` port |

## Architecture

```
OpenAI Client (Hermes / any compatible client)
    │
    │  POST /v1/chat/completions (OpenAI format)
    ▼
┌── Proxy (Express, port 10000) ──────────────────┐
│  • Auth verification                             │
│  • OpenAI ↔ MiMo-Code format conversion          │
│  • Stream/non-stream response adaptation          │
│  • System prompt preservation (tool definitions) │
└──────────────────────────────────────────────────┘
    │
    │  POST /session/{id}/message (MiMo-Code format)
    ▼
┌── mimo serve (port 10001, internal) ────────────┐
│  • MiMo model inference                         │
│  • Session management                           │
│  • Reasoning + content streaming                │
└──────────────────────────────────────────────────┘
```

## Project Structure

```
mimocode2api/
  ├── index.js              # Entry point: start mimo serve + proxy
  ├── src/proxy.js           # Core proxy (OpenAI ↔ MiMo-Code translation)
  ├── src/tool-runtime/      # Tool calling infrastructure (parser, router, etc.)
  ├── Dockerfile             # Node.js + gosu user switching
  ├── docker-compose.yml     # Single-service deployment
  ├── entrypoint.sh          # Startup script
  ├── .env.example           # Configuration template
  └── config.json.example    # MiMo-Code config template
```

## License

MIT