# CrowdListen Insights

> Give your AI agent ears. Search 7 platforms, extract real conversations, and turn scattered feedback into structured signal.

[English](README.md) | [中文文档](README-CN.md)

## The Problem

Your users are already telling you what to build. They're complaining about your onboarding flow on Reddit, requesting features in YouTube comments, debating alternatives on Twitter, and sharing workarounds on TikTok. The signal is there — it's just scattered across seven platforms in seven different formats, buried in threads your team will never read.

CrowdListen Insights gives your AI agent a single interface to search all of them at once. It extracts comments, normalizes everything into the same JSON shape, and hands it back as structured data your agent can reason about. Pain points, feature requests, sentiment, consensus, dissent — all surfaced from real conversations, not surveys.

## What You Can Do With It

**Find out what people actually think.** Search Reddit, YouTube, TikTok, Twitter/X, Instagram, Xiaohongshu, and Moltbook from one command. Get back structured posts with engagement metrics, timestamps, and author info — same format regardless of platform.

**Drill into any discussion.** Found a Reddit thread with 500 comments about your product? Pull them all, structured and normalized. Your agent can read through them, identify patterns, and summarize what matters without you ever opening a browser tab.

**Extract from any website.** CrowdListen's vision mode takes a screenshot of any URL, sends it to an LLM (Claude, Gemini, or OpenAI), and returns structured data. Forum that doesn't have an API? News site with paywalled comments? Just point vision at it.

**Let your agent do the analysis.** The paid API layer adds opinion clustering (grouping hundreds of comments into themes), deep analysis (audience segments, competitive signals), and research synthesis (cross-platform reports from a single query). But the core extraction is free and open source.

## Try It Now

Reddit works immediately — no API keys, no setup, no account:

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

You'll get back structured JSON with posts, authors, engagement metrics, and timestamps. Every platform returns the same shape.

## Setup

### For AI Agents (MCP)

The fastest path — one command installs both CrowdListen Insights and [CrowdListen Harness](https://github.com/Crowdlisten/crowdlisten_harness) into your agent's MCP config:

```bash
npx @crowdlisten/planner login
```

This opens your browser, signs you into CrowdListen, and auto-configures MCP for Claude Code, Cursor, Gemini CLI, Codex, and OpenClaw. Restart your agent and it can start calling tools immediately.

If you only want Insights (no Harness), add it manually to your agent's MCP config:

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

### For CLI Use

No installation required — `npx` runs it directly:

```bash
npx crowdlisten search reddit "your query"
npx crowdlisten comments youtube dQw4w9WgXcQ
npx crowdlisten vision https://news.ycombinator.com
```

### Platform Setup

Most platforms work with zero configuration. Here's what you actually need:

| Platform | Setup | What happens without it |
|----------|-------|------------------------|
| Reddit | Nothing | Works immediately |
| TikTok | Playwright browsers (`npx playwright install chromium`) | Fails with browser not found error |
| Instagram | Playwright browsers (`npx playwright install chromium`) | Fails with browser not found error |
| Xiaohongshu | Playwright browsers (`npx playwright install chromium`) | Fails with browser not found error |
| Moltbook | `MOLTBOOK_API_KEY` in `.env` | Skipped — platform not available |
| Twitter/X | `TWITTER_USERNAME` + `TWITTER_PASSWORD` in `.env` | Skipped — add credentials for Twitter access |
| YouTube | `YOUTUBE_API_KEY` in `.env` | Skipped — get a free key from Google Cloud Console |
| Vision mode | Any one of: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | Vision commands return a clear error |
| Paid analysis | `CROWDLISTEN_API_KEY` | Free tools still work; paid tools return a clear error with signup link |

> **Browser-based platforms (TikTok, Instagram, Xiaohongshu):** These platforms require Playwright's Chromium browser. Install it once with `npx playwright install chromium`. They also have built-in rate limits of 3–5 requests per minute to prevent IP blocks — if you exceed this, responses slow down automatically.

To configure optional platforms:

```bash
cp .env.example .env
# Edit .env with your keys
```

## CLI Commands

```bash
# Search across platforms
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search twitter "LLM frameworks" --limit 10
crowdlisten search all "remote work" --limit 30

# Get comments from a specific post
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# Vision — extract structured data from any URL
crowdlisten vision https://news.ycombinator.com --limit 10
crowdlisten vision https://tiktok.com/@user/video/123 --mode comments

# Force vision mode on any search
crowdlisten search twitter "AI" --vision

# Paid analysis (requires CROWDLISTEN_API_KEY)
crowdlisten analyze reddit t3_abc123 --depth deep
crowdlisten cluster reddit t3_abc123 --clusters 8
crowdlisten insights reddit t3_abc123
crowdlisten research "AI code editors" --platforms reddit,twitter,youtube

# Discovery
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# Diagnostics
crowdlisten status
crowdlisten health
```

## MCP Tools

When your agent connects via MCP, it gets access to these tools:

**Free tools (no API key needed):**

| Tool | What it does |
|------|-------------|
| `search_content` | Search posts across any platform. Supports `useVision` flag. |
| `get_content_comments` | Get comments for a specific post. Supports `useVision` flag. |
| `get_trending_content` | Currently trending posts from a platform |
| `get_user_content` | Recent posts from a specific user |
| `extract_url` | Vision extraction — screenshot any URL, get structured data back |
| `get_platform_status` | Which platforms are available and their capabilities |
| `health_check` | Platform connectivity check |

**Paid tools (require `CROWDLISTEN_API_KEY` — get one at [crowdlisten.com/api](https://crowdlisten.com/api)):**

| Tool | What it does |
|------|-------------|
| `analyze_content` | Sentiment + theme analysis on a post and its comments |
| `cluster_opinions` | Group comments into semantic opinion clusters by theme |
| `enrich_content` | Intent detection, stance analysis, engagement scoring |
| `deep_analyze` | Full audience intelligence: segments, pain points, competitive signals |
| `extract_insights` | Categorized insight extraction (pain points, feature requests, praise) |
| `research_synthesis` | Cross-platform research report from a single query |

## How It Works Under the Hood

Each platform has one adapter that does one thing well. There are no fallback chains, no tiers, no callback nesting.

- **Reddit, YouTube, Moltbook** use direct HTTP APIs — fast and reliable.
- **Twitter** uses a cookie-based scraper — no developer account needed, just a username and password.
- **TikTok, Instagram, Xiaohongshu** launch a real browser via Playwright, navigate to the page, and intercept the platform's own internal API responses as they load. This is more reliable than reverse-engineering private APIs because you're capturing the same data the app itself renders.

Every adapter has built-in rate limiting (`enforceRateLimit`) to prevent IP blocks. Browser-based platforms are capped at 3–5 requests per minute; API-based platforms use higher limits that stay within official quotas. If you burst above the limit, the adapter pauses automatically — you'll see slower responses, not errors.

- **Vision mode** is a standalone tool. It opens a browser, takes a full-page screenshot, and sends it to an LLM with a structured extraction prompt. It works on any website — not just the supported platforms.

The browser can run locally (default), in a Docker container, or via a remote CDP endpoint (for cloud browser services like Browserbase):

```bash
# Default: local Playwright
crowdlisten search tiktok "AI agents"

# Docker: sandboxed browser
BROWSER_PROVIDER=docker crowdlisten search tiktok "AI agents"

# Remote: cloud browser
BROWSER_PROVIDER=remote BROWSER_CDP_URL=wss://connect.browserbase.com?apiKey=KEY crowdlisten search tiktok "AI agents"
```

## The CrowdListen Ecosystem

CrowdListen is two MCP servers that work together:

**Insights** (this repo) discovers what audiences are saying across social platforms. **[Harness](https://github.com/Crowdlisten/crowdlisten_harness)** turns that signal into planned, tracked work — with a knowledge base that compounds across every task. Together, your agent can research a topic, plan a response, execute it, and remember what it learned for next time.

```bash
# Install both with one command
npx @crowdlisten/planner login
```

## Connected Channels

**Slack and Discord** integration is available through [crowdlisten.com](https://crowdlisten.com). Connect your team channels to surface product feedback, feature requests, and pain points from internal comms. Connected channels use a different privacy model than public social platforms — they require explicit opt-in via OAuth, and access is scoped to only the channels your team grants.

## Development

```bash
git clone https://github.com/Crowdlisten/crowdlisten_insights.git
cd crowdlisten_insights
npm install && npm run build
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Highest-value contributions: new platform adapters (Threads, Bluesky, Hacker News, Product Hunt, Mastodon) and extraction fixes.

## License

MIT — [crowdlisten.com](https://crowdlisten.com)
