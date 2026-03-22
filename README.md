# CrowdListen Insights

> Give your AI agent ears. Search 7 platforms, extract comments, cluster opinions, analyze sentiment — structured JSON, every time.

[English](README.md) | [中文文档](README-CN.md)

## Why CrowdListen

Your users are telling you what to build. The problem is they're saying it across Reddit, YouTube, TikTok, Twitter/X, Instagram, Xiaohongshu, and more — and your agent can't hear any of it.

CrowdListen gives your agent a single tool to search all of them, extract comments, and turn raw conversation into structured signal: pain points, feature requests, sentiment, consensus, and dissent.

**One `npx` command. 7 platforms. Structured JSON. No API keys to start.**

## Try It Now

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

## Highlights

1. **Zero-config start** — Reddit, TikTok, Twitter/X, Instagram, and Xiaohongshu work out of the box. No API keys, no OAuth, no setup.
2. **7 platforms, one JSON shape** — Reddit, YouTube, TikTok, Twitter/X, Instagram, Xiaohongshu, Moltbook. Same `Post[]` and `Comment[]` every time.
3. **MCP-native** — Built as an MCP server. Your agent calls tools directly — no REST wrappers, no middleware.
4. **Vision mode** — Can't scrape it? Point CrowdListen at any URL and it screenshots the page, sends it to an LLM, and returns structured data. Works on any website.
5. **Free core, paid intelligence** — Search, comments, trending, and vision run locally for free. Deep analysis and research synthesis available via the CrowdListen API.

## Demo

https://github.com/user-attachments/assets/DEMO_VIDEO_ID

> Get the whole system, and more, deployed for you at [crowdlisten.com](https://crowdlisten.com)

## Install for Your Agent

```bash
npx @crowdlisten/planner login
```

One command installs both CrowdListen Planner and Insights into your agent's MCP config. Just restart your agent.

Or add manually:

```json
{
  "mcpServers": {
    "crowdlisten/insights": {
      "command": "npx",
      "args": ["-y", "crowdlisten"]
    }
  }
}
```

## How the Two Systems Work Together

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CrowdListen Ecosystem                            │
│                                                                         │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐    │
│  │   CrowdListen Insights      │    │   CrowdListen Planner       │    │
│  │                             │    │                             │    │
│  │   "What are people saying?" │    │   "What should we build?"   │    │
│  │                             │    │                             │    │
│  │   Search 7 platforms        │    │   Plan with context         │    │
│  │   Extract comments          │    │   Execute with agents       │    │
│  │   Cluster opinions          │    │   Capture learnings         │    │
│  │   Vision extraction         │    │   Compound knowledge        │    │
│  │                             │    │                             │    │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘    │
│                 │                                   │                   │
│                 └────────►  Your AI Agent  ◄────────┘                   │
│                     (Claude Code, Cursor, Gemini CLI, Codex...)         │
│                                                                         │
│                    npx @crowdlisten/planner login                       │
│                    One command installs both.                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Insights** discovers what audiences are saying across social platforms. **Planner** turns that signal into planned, tracked work. Together, your agent can research a topic, plan a response, execute it, and remember what it learned for next time.

## Platforms

| Platform | Auth | Method | Notes |
|----------|------|--------|-------|
| Reddit | None | Public JSON API | Works immediately, zero config |
| YouTube | `YOUTUBE_API_KEY` | YouTube Data API v3 | Free tier: 10k units/day |
| TikTok | None | Browser + API interception | Playwright captures internal API responses |
| Twitter/X | `TWITTER_USERNAME` + `TWITTER_PASSWORD` | Cookie-based scraper | No developer account needed |
| Instagram | None | Browser + API interception | Playwright captures GraphQL responses |
| Xiaohongshu | None | Browser + API interception | Conservative rate limiting, mobile viewport |
| Moltbook | `MOLTBOOK_API_KEY` | REST API | Direct API access |
| Any URL | LLM API key | Vision (screenshot + LLM) | Works on any website |

## CLI Commands

```bash
# Search
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search twitter "LLM frameworks" --limit 10
crowdlisten search all "remote work" --limit 30

# Comments
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# Vision — extract from any URL
crowdlisten vision https://news.ycombinator.com --limit 10
crowdlisten vision https://tiktok.com/@user/video/123 --mode comments
crowdlisten search twitter "AI" --vision   # force vision mode

# Analysis (requires CROWDLISTEN_API_KEY)
crowdlisten analyze reddit t3_abc123 --depth deep
crowdlisten cluster reddit t3_abc123 --clusters 8
crowdlisten insights reddit t3_abc123
crowdlisten research "AI code editors" --platforms reddit,twitter,youtube

# Trending / user content
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# Diagnostics
crowdlisten status
crowdlisten health
```

## MCP Tools

| Tool | Description | Auth |
|------|-------------|------|
| `search_content` | Search posts across platforms | Free |
| `get_content_comments` | Get comments for a post | Free |
| `get_trending_content` | Trending posts from a platform | Free |
| `get_user_content` | Posts from a specific user | Free |
| `extract_url` | Vision extraction from any URL | LLM API key |
| `get_platform_status` | Available platforms and capabilities | Free |
| `health_check` | Platform connectivity check | Free |
| `analyze_content` | Sentiment + theme analysis | `CROWDLISTEN_API_KEY` |
| `cluster_opinions` | Semantic opinion clustering | `CROWDLISTEN_API_KEY` |
| `enrich_content` | Intent detection + stance analysis | `CROWDLISTEN_API_KEY` |
| `deep_analyze` | Full audience intelligence report | `CROWDLISTEN_API_KEY` |
| `extract_insights` | Categorized insight extraction | `CROWDLISTEN_API_KEY` |
| `research_synthesis` | Cross-platform research report | `CROWDLISTEN_API_KEY` |

## Configuration

```bash
cp .env.example .env
```

```bash
# YouTube (free tier available)
YOUTUBE_API_KEY=your-key

# Twitter/X (cookie-based auth, no developer account needed)
TWITTER_USERNAME=your-username
TWITTER_PASSWORD=your-password

# Vision extraction (at least one needed for vision mode)
ANTHROPIC_API_KEY=your-key    # Claude (preferred)
GEMINI_API_KEY=your-key       # Gemini (fallback)
OPENAI_API_KEY=your-key       # OpenAI (fallback)

# Browser provider (default: local Playwright)
# BROWSER_PROVIDER=docker
# BROWSER_PROVIDER=remote
# BROWSER_CDP_URL=ws://localhost:9222

# Paid analysis features
CROWDLISTEN_API_KEY=your-key
```

## Architecture

```
src/
  cli.ts                — CLI entry (commander)
  index.ts              — MCP server (stdio)
  handlers.ts           — Shared handler logic (CLI + MCP)
  service-config.ts     — Platform config factory
  services/
    UnifiedSocialMediaService.ts  — Coordinates all platform adapters
  platforms/
    reddit/             — Public JSON API (axios)
    youtube/            — YouTube Data API v3 (axios)
    moltbook/           — Moltbook REST API (axios)
    twitter/            — Cookie-based scraper (twitter-scraper)
    tiktok/             — Browser + API interception (Playwright)
    instagram/          — Browser + API interception (Playwright)
    xiaohongshu/        — Browser + API interception (Playwright)
  browser/
    BrowserPool.ts      — Browser lifecycle: local, Docker, or remote CDP
    RequestInterceptor.ts — Captures internal API responses by URL pattern
  vision/
    VisionExtractor.ts  — Screenshot + LLM extraction for any URL
  core/
    base/               — BaseAdapter abstract class
    interfaces/         — TypeScript types (Post, Comment, User, etc.)
    utils/              — URL resolution helpers
```

Each platform has one adapter doing one thing well. No tiers, no fallback chains. Vision is a standalone tool you invoke explicitly — not buried in a callback chain.

## Agent Onboarding

**Path 1 — One command (recommended):**
```bash
npx @crowdlisten/planner login
```
Opens browser, sign in to CrowdListen, auto-configures MCP for 5 agents (Claude Code, Cursor, Gemini CLI, Codex, OpenClaw). Installs both Insights and Planner.

**Path 2 — Manual config:**
Add to your agent's MCP config file:
```json
{
  "mcpServers": {
    "crowdlisten/insights": {
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

## Development

```bash
git clone https://github.com/Crowdlisten/crowdlisten_insights.git
cd crowdlisten_insights
npm install && npm run build
npm test              # Unit tests
npm run test:e2e      # E2E tests (needs API keys)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Highest-value contributions: new platform adapters (Threads, Bluesky, Hacker News, Product Hunt, Mastodon) and extraction fixes.

## Background

- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/)
- [MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/)

## License

MIT

Get the whole system, and more, deployed for you at [crowdlisten.com](https://crowdlisten.com). See also [@crowdlisten/planner](https://github.com/Crowdlisten/crowdlisten_harness).
