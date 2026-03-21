# CrowdListen Sources

> Cross-channel audience signal for AI agents. Consolidates pain points, feature requests, sentiment, and workarounds from Reddit, YouTube, TikTok, Twitter/X, and Instagram into structured JSON.

## Try It Now

Zero config -- Reddit works immediately:

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

## Install for Your Agent

```bash
npx @crowdlisten/planner login
```

One command installs both CrowdListen Planner and Sources into your agent's MCP config. Just restart your agent.

Or add manually:

```json
{
  "mcpServers": {
    "crowdlisten/sources": {
      "command": "npx",
      "args": ["-y", "crowdlisten"]
    }
  }
}
```

## What This Does

Customer feedback fragments across channels. CrowdListen Sources consolidates cross-channel conversation into structured signal -- same JSON shape every time. Search, extract comments, cluster opinions by theme, track sentiment. One interface across all platforms.

Open source because extraction is commodity -- DOM selectors break, APIs change, the community fixes these faster than any single team. The [analysis layer](https://crowdlisten.com) is where the intelligence lives.

## Platforms

| Platform | Auth Required | Notes |
|----------|---------------|-------|
| Reddit | No | Works immediately, public JSON API |
| YouTube | API key | YouTube Data API v3 (free: 10k units/day) |
| TikTok | Optional | Playwright browser search + video pipeline |
| Twitter/X | Yes | Developer account (free: 1,500 tweets/month) |
| Instagram | No | Playwright browser scraping |

## CLI Commands

```bash
# Search
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search youtube "AI agent frameworks" --limit 10
crowdlisten search all "remote work productivity" --limit 30

# Comments
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# Analysis (comments + clustering + sentiment)
crowdlisten analyze reddit t3_abc123
crowdlisten analyze youtube dQw4w9WgXcQ --depth deep

# Cluster opinions by theme
crowdlisten cluster reddit t3_abc123 --clusters 8

# Trending / user content
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# Platform info
crowdlisten status
crowdlisten health
```

Also available as HTTP API and MCP server -- see [docs/HTTP_API.md](docs/HTTP_API.md) and [docs/PLATFORMS.md](docs/PLATFORMS.md).

## For Agents

See [AGENTS.md](AGENTS.md) for machine-readable tool descriptions, MCP config, and example calls.

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

# Optional -- semantic opinion clustering
OPENAI_API_KEY=your-key

# Optional -- TikTok video understanding
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
```

Platform-specific setup details: [docs/PLATFORMS.md](docs/PLATFORMS.md)

## Architecture

```
src/
  cli.ts              -- CLI entry (commander)
  http-server.ts      -- HTTP API (Express)
  index.ts            -- MCP server (stdio)
  handlers.ts         -- Shared handler logic
  service-config.ts   -- Platform config factory
  services/           -- UnifiedSocialMediaService
  platforms/          -- Platform adapters (one per platform)
  core/
    base/             -- BaseAdapter abstract class
    interfaces/       -- TypeScript types
    utils/            -- Clustering, URL resolution, video analysis
```

All three entry points call the same handler functions.

## Development

```bash
git clone https://github.com/Crowdlisten/crowdlisten_sources.git
cd crowdlisten_sources
npm install && npm run build
npm test              # Unit tests
npm run test:e2e      # E2E tests (needs API keys)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Highest-value contributions: new platform adapters (Threads, Bluesky, Hacker News, Product Hunt, Mastodon) and browser scraping fixes.

## Background

- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/)
- [MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/)

## License

MIT

Part of the [CrowdListen](https://crowdlisten.com) open source ecosystem -- see also [@crowdlisten/planner](https://github.com/Crowdlisten/crowdlisten_tasks).
