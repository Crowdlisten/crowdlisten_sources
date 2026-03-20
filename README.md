# CrowdListen Sources

> What are people *actually* saying? Extract and analyze social media conversations across Reddit, YouTube, TikTok, Twitter/X, and Instagram — one unified interface for AI agents.

**CLI** for agents (Claude Code, Codex, Cursor) | **HTTP API** for backends | **MCP** for Claude Desktop

```bash
crowdlisten search reddit "what do people think about cursor vs claude code" --limit 20
```
```json
{
  "platform": "reddit",
  "query": "what do people think about cursor vs claude code",
  "count": 20,
  "posts": [
    {
      "id": "t3_1jk8m2x",
      "url": "https://reddit.com/r/programming/comments/1jk8m2x/...",
      "content": "I've been using both for a month and here's what I found...",
      "author": { "username": "dev_user", "displayName": "Dev User" },
      "engagement": { "likes": 142, "comments": 67, "shares": 12 },
      "timestamp": "2026-03-18T14:30:00.000Z"
    }
  ]
}
```

## Why

If you're building an AI agent that needs to know what people are saying — product feedback, audience sentiment, trending conversations — you need social media data. But every platform has a different API, different auth, different data format.

CrowdListen Sources gives you one interface across all platforms. Search Reddit, YouTube, TikTok, Twitter, and Instagram with the same command. Get back the same JSON shape every time. No MCP overhead if you don't want it — just a CLI that outputs JSON to stdout.

**Open source because extraction is commodity.** DOM selectors break, APIs change, new platforms emerge. The community can fix these faster than any single team. The [analysis layer](https://crowdlisten.com) — synthesis, insight clustering, Research Partner API — is where the intelligence lives, and that stays proprietary.

## Quick Start

```bash
git clone https://github.com/Crowdlisten/crowdlisten_sources_mcp.git
cd crowdlisten_sources_mcp
npm install
cp .env.example .env   # Add API keys (Reddit works with zero config)
npm run build
```

Try it immediately — Reddit needs no API keys:

```bash
node dist/cli.js search reddit "AI agents" --limit 5
node dist/cli.js status
```

For global CLI access:

```bash
npm install -g .
crowdlisten search reddit "remote work" --limit 10
```

## Usage

### CLI

Best for AI agents — fast, plain JSON to stdout, errors to stderr, exit codes.

```bash
# Search
crowdlisten search reddit "cursor vs claude code" --limit 20
crowdlisten search youtube "AI agent frameworks" --limit 10
crowdlisten search all "remote work productivity" --limit 30

# Comments from a specific post
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100
crowdlisten comments tiktok https://www.tiktok.com/@user/video/7380123456 --limit 200

# Full analysis: comments + opinion clustering + sentiment
crowdlisten analyze reddit t3_abc123
crowdlisten analyze youtube dQw4w9WgXcQ --depth deep

# Cluster opinions by theme (uses OpenAI embeddings if OPENAI_API_KEY set)
crowdlisten cluster reddit t3_abc123 --clusters 8

# Trending content / user content
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# Platform info
crowdlisten status
crowdlisten health
```

### HTTP API

Best for backend services and agent frameworks.

```bash
npm run start:http   # Runs on http://localhost:3001
```

```bash
curl -X POST http://localhost:3001/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"platform":"reddit","query":"AI agents","limit":10}'

curl -X POST http://localhost:3001/v1/comments \
  -H 'Content-Type: application/json' \
  -d '{"platform":"youtube","contentId":"dQw4w9WgXcQ","limit":50}'

curl -X POST http://localhost:3001/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{"platform":"reddit","contentId":"t3_abc123"}'

curl http://localhost:3001/v1/health
```

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/search` | Search posts |
| POST | `/v1/comments` | Get comments |
| POST | `/v1/analyze` | Full analysis pipeline |
| POST | `/v1/cluster` | Opinion clustering |
| POST | `/v1/trending` | Trending content |
| POST | `/v1/user-content` | User's content |
| GET | `/v1/status` | Available platforms |
| GET | `/v1/health` | Platform health |

### MCP

For Claude Desktop and other MCP clients.

```bash
npm run start   # stdio transport
```

```json
{
  "mcpServers": {
    "crowdlisten": {
      "command": "node",
      "args": ["/path/to/crowdlisten_sources_mcp/dist/index.js"],
      "env": { "YOUTUBE_API_KEY": "your-key" }
    }
  }
}
```

### Agent Skills

For agents that support the [Agent Skills spec](https://agentskills.io/specification) (Claude Code, OpenClaw, etc.), copy the `skills/` directory to your agent's skills path:

- `crowdlisten-search` — Multi-platform search
- `crowdlisten-comments` — Comment extraction
- `crowdlisten-analyze` — Full analysis pipeline

## Platforms

| Platform | Auth Required | Notes |
|----------|---------------|-------|
| Reddit | No | Works immediately, public JSON API |
| YouTube | API key | YouTube Data API v3 (free: 10k units/day) |
| TikTok | Optional | Playwright browser search + video pipeline |
| Twitter/X | Yes | Developer account (free: 1,500 tweets/month) |
| Instagram | No | Playwright browser scraping |

## Configuration

```bash
cp .env.example .env
```

```bash
# YouTube (free tier available)
YOUTUBE_API_KEY=your-key

# Twitter/X (all 4 required)
TWITTER_API_KEY=your-key
TWITTER_API_KEY_SECRET=your-secret
TWITTER_ACCESS_TOKEN=your-token
TWITTER_ACCESS_TOKEN_SECRET=your-token-secret

# Optional — semantic opinion clustering
OPENAI_API_KEY=your-key

# Optional — TikTok video understanding
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
```

### TikTok Video Pipeline

Requires additional setup:
1. **yt-dlp** — `brew install yt-dlp`
2. **Playwright** — included via `npm install`
3. **Chrome profile** (optional) — `TIKTOK_CHROME_PROFILE_PATH` to reuse your TikTok login session

## Architecture

```
src/
  cli.ts              — CLI entry point (commander)
  http-server.ts      — HTTP API (Express)
  index.ts            — MCP server (stdio)
  handlers.ts         — Shared handler logic (pure functions)
  service-config.ts   — Platform configuration factory
  services/           — UnifiedSocialMediaService orchestrator
  platforms/          — Platform adapters (one per platform)
  core/
    base/             — BaseAdapter abstract class
    interfaces/       — TypeScript types (Post, Comment, ContentAnalysis)
    utils/            — Clustering, URL resolution, video analysis
skills/               — Agent Skills (SKILL.md files)
```

All three entry points (CLI, HTTP, MCP) call the same pure handler functions. Each platform adapter extends `BaseAdapter` and implements a standard interface — search, comments, trending, user content, analysis.

## Development

```bash
npm run build         # TypeScript compile
npm run build:watch   # Watch mode
npm run dev           # Run CLI via tsx (no build step)
npm test              # Unit tests
npm run test:e2e      # E2E tests (needs API keys)
npm run test:coverage # Coverage report
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The highest-value contributions are **new platform adapters** — we'd love help with Threads, Bluesky, Hacker News, Product Hunt, Mastodon, and others. Browser scraping fixes are also always welcome since DOM selectors break frequently.

## Background

- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/) — CrowdListen's origin story
- [MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/) — why this boundary exists

## License

MIT
