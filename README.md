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

## Interfaces

| Interface | How to use | Best for |
|-----------|-----------|----------|
| **MCP** | Add to agent config, agents call tools directly | AI agents (Claude Code, Cursor, Gemini CLI, etc.) |
| **CLI** | `npx crowdlisten search reddit "query"` | Scripts, shell, quick lookups |

Both interfaces share the same handler logic and return the same JSON shape.

## Capability Matrix

| Capability | MCP | CLI | Auth needed |
|-----------|-----|-----|-------------|
| Search | Y | Y | None (Reddit free) |
| Comments | Y | Y | None |
| Analyze (surface/standard) | Y | Y | None |
| Analyze (deep/comprehensive) | Y | Y | `CROWDLISTEN_API_KEY` |
| Cluster opinions | Y | Y | `OPENAI_API_KEY` |
| Deep analyze | Y | Y | `CROWDLISTEN_API_KEY` |
| Extract insights | Y | Y | `CROWDLISTEN_API_KEY` |
| Research synthesis | Y | Y | `CROWDLISTEN_API_KEY` |
| Trending | Y | Y | None |
| User content | Y | Y | None |
| Platform status | Y | Y | None |
| Health check | Y | Y | None |

## Free vs Paid

**Free (open source, no key needed):**
- `search_content` — Search posts across platforms
- `get_content_comments` — Get comments for a post
- `analyze_content` (surface/standard) — Local sentiment and theme analysis
- `cluster_opinions` — Semantic opinion clustering (requires `OPENAI_API_KEY`)
- `get_trending_content` — Trending posts
- `get_user_content` — Posts from a specific user
- `get_platform_status` / `health_check` — Diagnostics

**Paid (requires `CROWDLISTEN_API_KEY` — get one at [crowdlisten.com/api](https://crowdlisten.com/api)):**
- `deep_analyze` — AI-powered audience intelligence: segments, pain points, feature requests, competitive signals
- `extract_insights` — Categorized insight extraction (pain points, feature requests, praise, complaints)
- `research_synthesis` — Cross-platform research reports from a single query
- `analyze_content` (deep/comprehensive) — Automatically upgrades to deep_analyze, falls back to local if no key

## Platforms

| Platform | Auth Required | Notes |
|----------|---------------|-------|
| Reddit | No | Works immediately, public JSON API |
| YouTube | API key | YouTube Data API v3 (free: 10k units/day) |
| TikTok | Optional | Playwright browser search + video pipeline |
| Twitter/X | Yes | Developer account (free: 1,500 tweets/month) |
| Instagram | No | Playwright browser scraping |
| Xiaohongshu | Optional | Playwright browser scraping (set `XHS_CHROME_PROFILE_PATH` for best results) |

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

## Agent Onboarding

**Path 1 — One command (recommended):**
```bash
npx @crowdlisten/planner login
```
Opens browser, sign in to CrowdListen, auto-configures MCP for 5 agents (Claude Code, Cursor, Gemini CLI, Codex, OpenClaw). Installs both Sources and Planner.

**Path 2 — Manual config:**
Add to your agent's MCP config file:
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

**Path 3 — Web:**
Sign in at [crowdlisten.com](https://crowdlisten.com). Your agent can read [AGENTS.md](AGENTS.md) for tool reference.

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

# Optional -- paid analysis features
CROWDLISTEN_API_KEY=your-key
```

Platform-specific setup details: [docs/PLATFORMS.md](docs/PLATFORMS.md)

## Architecture

```
src/
  cli.ts              -- CLI entry (commander)
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

Both entry points call the same handler functions.

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
