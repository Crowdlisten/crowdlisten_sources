# CrowdListen + OpenClaw Integration Guide

> Cross-channel feedback analysis inside OpenClaw — consolidate audience signal (pain points, feature requests, sentiment) from Reddit, YouTube, TikTok, Twitter/X, and Instagram into structured, decision-grade context for your agents.

## How It Works

CrowdListen integrates with OpenClaw through **two complementary channels**:

```
                    ┌─────────────────────────────────┐
                    │           OpenClaw               │
                    │                                  │
                    │  ┌───────────┐  ┌─────────────┐  │
                    │  │  Skills   │  │ MCP Server  │  │
                    │  │ (ClawHub) │  │  (stdio)    │  │
                    │  └─────┬─────┘  └──────┬──────┘  │
                    │        │               │         │
                    │        ▼               ▼         │
                    │    crowdlisten CLI    MCP tools   │
                    │        │               │         │
                    │        └───────┬───────┘         │
                    │                ▼                  │
                    │     Unified Handler Layer         │
                    │                │                  │
                    │    ┌───┬───┬───┼───┬───┐         │
                    │    ▼   ▼   ▼   ▼   ▼   ▼         │
                    │   RD  YT  TT  TW  IG  ...       │
                    └─────────────────────────────────┘
```

| Channel | What it provides | Best for |
|---------|-----------------|----------|
| **Skills** (ClawHub) | Workflow instructions — tells OpenClaw *when* and *how* to use CrowdListen | Natural language triggers ("what are people saying about X?") |
| **MCP Server** | Tool capabilities — 8 structured tools with typed inputs/outputs | Direct tool calls, programmatic access |

You can use either or both. Skills give OpenClaw workflow context. MCP gives it raw tool access.

---

## Quick Start

### Option 1: Install Skills from ClawHub (Recommended)

```bash
# Install individual skills
clawhub install crowdlisten-search
clawhub install crowdlisten-comments
clawhub install crowdlisten-analyze
clawhub install crowdlisten-deep-analysis

# Or install all at once
clawhub install crowdlisten-search crowdlisten-comments crowdlisten-analyze crowdlisten-deep-analysis
```

Skills auto-install the `crowdlisten` CLI as a dependency. You just need API keys.

### Option 2: Local Skills (no ClawHub)

```bash
# Clone the repo
git clone https://github.com/Crowdlisten/crowdlisten_insights.git

# Copy skills to OpenClaw's skill directory
cp -r crowdlisten_insights/skills/* ~/.openclaw/skills/

# Install the CLI
npm install -g crowdlisten
```

### Option 3: MCP Server (direct tool access)

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "crowdlisten": {
      "command": "npx",
      "args": ["-y", "crowdlisten"],
      "env": {
        "YOUTUBE_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key"
      }
    }
  }
}
```

### Option 4: Both Skills + MCP (Full Power)

Use skills for natural language workflows AND MCP for direct tool access:

```json
{
  "mcpServers": {
    "crowdlisten": {
      "command": "npx",
      "args": ["-y", "crowdlisten"],
      "env": {
        "YOUTUBE_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key"
      }
    }
  }
}
```

Plus install skills via ClawHub or locally. OpenClaw will use skills for workflow guidance and MCP for tool execution.

---

## Available Skills

### crowdlisten-search

Search across platforms for audience conversations.

```
"What are people saying about cursor vs claude code?"
→ OpenClaw runs: crowdlisten search reddit "cursor vs claude code" --limit 20
```

**Platforms**: reddit, youtube, twitter, instagram, tiktok, all

### crowdlisten-comments

Extract comments from specific posts/videos.

```
"Get comments from this YouTube video: dQw4w9WgXcQ"
→ OpenClaw runs: crowdlisten comments youtube dQw4w9WgXcQ --limit 50
```

### crowdlisten-analyze

Full analysis with opinion clustering and sentiment.

```
"Analyze the sentiment in this Reddit thread: t3_abc123"
→ OpenClaw runs: crowdlisten analyze reddit t3_abc123
```

Requires `OPENAI_API_KEY` for semantic clustering.

### crowdlisten-deep-analysis

Premium AI-powered analysis (requires `CROWDLISTEN_API_KEY`).

```
"Research what developers think about AI coding assistants"
→ OpenClaw runs: crowdlisten research "AI coding assistants" --platforms reddit,twitter,youtube
```

Get an API key at https://crowdlisten.com/api

---

## MCP Tools Reference

When using the MCP server, OpenClaw gets access to 8 tools:

| Tool | Description | Key Params |
|------|-------------|------------|
| `search_content` | Search posts across platforms | `platform`, `query`, `limit` |
| `get_content_comments` | Extract comments from a post | `platform`, `contentId`, `limit` |
| `analyze_content` | Full analysis pipeline | `platform`, `contentId`, `analysisDepth` |
| `cluster_opinions` | Semantic opinion clustering | `platform`, `contentId`, `clusterCount` |
| `get_trending_content` | Trending posts on a platform | `platform`, `limit` |
| `get_user_content` | User's posts/content | `platform`, `userId`, `limit` |
| `get_platform_status` | Available platforms + capabilities | — |
| `health_check` | Health status per platform | — |

---

## Environment Variables

### Required for Basic Use (Reddit works with zero config)

```bash
# YouTube — free tier: 10k API units/day
YOUTUBE_API_KEY=your-key
```

### Required for Analysis Features

```bash
# OpenAI — embeddings for opinion clustering
OPENAI_API_KEY=your-key
```

### Optional Platform Credentials

```bash
# Twitter/X — all 4 required for Twitter access
TWITTER_API_KEY=your-key
TWITTER_API_KEY_SECRET=your-secret
TWITTER_ACCESS_TOKEN=your-token
TWITTER_ACCESS_TOKEN_SECRET=your-token-secret

# Instagram — optional, uses Playwright browser
INSTAGRAM_USERNAME=your-username
INSTAGRAM_PASSWORD=your-password

# TikTok — optional enhanced access
TIKTOK_MS_TOKEN=your-token
TIKTOK_CHROME_PROFILE_PATH=/path/to/chrome/profile
```

### Premium Features

```bash
# CrowdListen API — deep analysis, insights, research synthesis
CROWDLISTEN_API_KEY=your-key
```

### Setting Env Vars in OpenClaw

**For MCP server**: Set in `openclaw.json` under the server's `env` block.

**For skills**: Set in your shell profile (`~/.zshrc`, `~/.bashrc`) or in OpenClaw's environment config:

```json
{
  "env": {
    "YOUTUBE_API_KEY": "your-key",
    "OPENAI_API_KEY": "your-key"
  }
}
```

---

## Skills vs. MCP: When to Use Which

| Scenario | Use Skills | Use MCP |
|----------|-----------|---------|
| Natural language requests ("what do people think about X?") | Yes | — |
| Programmatic workflows (chain search → analyze) | — | Yes |
| First-time setup (simplest path) | Yes | — |
| Custom tool composition with other MCP servers | — | Yes |
| Both workflow guidance + tool access | Yes | Yes |

**Recommendation**: Start with skills. Add MCP if you need direct tool control or want to compose CrowdListen tools with other MCP servers.

---

## Platform Support Matrix

| Platform | Auth | Search | Comments | Trending | User Content | Analysis |
|----------|------|--------|----------|----------|-------------|----------|
| Reddit | None | Yes | Yes | Yes | Yes | Yes |
| YouTube | API Key | Yes | Yes | Yes | Yes | Yes |
| TikTok | Optional | Yes | Yes | — | — | Yes |
| Twitter/X | Required | Yes | Yes | Yes | Yes | Yes |
| Instagram | Optional | Yes | Yes | — | — | Yes |

---

## Publishing Skills to ClawHub

If you've forked CrowdListen and want to publish your own modified skills:

### Prerequisites

```bash
npm install -g clawhub
clawhub login  # Authenticates via GitHub (account must be 1+ week old)
```

### Publish

```bash
clawhub publish skills/crowdlisten-search \
  --slug my-crowdlisten-search \
  --name "My CrowdListen Search" \
  --version 1.0.0 \
  --changelog "Initial release"
```

### SKILL.md Format Requirements

ClawHub requires specific frontmatter format:

```yaml
---
name: skill-name
description: "What the skill does"
version: 1.0.0
homepage: https://example.com
metadata: {"openclaw":{"emoji":"ear","requires":{"bins":["crowdlisten"],"env":["API_KEY"]},"primaryEnv":"API_KEY","install":[{"id":"crowdlisten","kind":"node","package":"crowdlisten","bins":["crowdlisten"],"label":"CrowdListen CLI"}]}}
allowed-tools: "Bash Read"
---
```

**Critical**: The `metadata` field must be a **single-line JSON object**. Multi-line YAML for metadata will fail the OpenClaw embedded parser.

### Security Scanning

ClawHub's security scan checks that:
- All referenced env vars are declared in `requires.env`
- All referenced binaries are declared in `requires.bins`
- No undeclared external dependencies

If your SKILL.md references an env var not in the frontmatter, the publish will be rejected.

---

## CI/CD Pipeline

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that automates:

### On Every PR / Push to Main

```
lint-and-build → unit-test → (e2e-test on main only)
                  validate-skills
```

- **lint-and-build**: TypeScript compilation + type checking
- **unit-test**: Jest unit tests with coverage
- **validate-skills**: Checks all SKILL.md files have required frontmatter fields and single-line JSON metadata
- **e2e-test**: Live API integration tests (main branch only, needs secrets)

### On Version Tags (v*)

```
unit-test ────→ publish-npm ────→ npm registry
validate-skills ──→ publish-clawhub → ClawHub marketplace
```

- **publish-npm**: Builds and publishes to npm with provenance
- **publish-clawhub**: Syncs skill versions with tag, publishes all 4 skills to ClawHub

### Required GitHub Secrets

| Secret | Purpose | Where to Get |
|--------|---------|-------------|
| `NPM_TOKEN` | npm package publishing | npmjs.com → Access Tokens |
| `CLAWHUB_TOKEN` | ClawHub skill publishing | `clawhub token` after login |
| `YOUTUBE_API_KEY` | E2E tests | Google Cloud Console |
| `OPENAI_API_KEY` | E2E tests (clustering) | platform.openai.com |

### Release Workflow

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Push with tag
git push && git push --tags

# 3. CI automatically:
#    - Runs all tests
#    - Validates skill format
#    - Publishes to npm
#    - Publishes all skills to ClawHub with matching version
```

---

## Troubleshooting

### "crowdlisten: command not found"

```bash
npm install -g crowdlisten
# or use npx:
npx crowdlisten search reddit "test" --limit 1
```

### Skills not showing in OpenClaw

1. Check skill location: `ls ~/.openclaw/skills/crowdlisten-*/SKILL.md`
2. Verify frontmatter: `head -10 ~/.openclaw/skills/crowdlisten-search/SKILL.md`
3. Check env vars are set: `echo $YOUTUBE_API_KEY`

### MCP server not connecting

1. Test manually: `echo '{}' | npx crowdlisten` (should output MCP initialization)
2. Check `openclaw.json` syntax: `cat ~/.openclaw/openclaw.json | python3 -m json.tool`
3. Check logs: `tail -50 ~/.openclaw/logs/mcp-crowdlisten.log`

### "Platform not available" errors

Run `crowdlisten status` to see which platforms are configured. Missing API keys mean those platforms won't initialize.

### ClawHub publish fails with "metadata mismatch"

Ensure all env vars referenced in the SKILL.md body are also declared in `metadata.openclaw.requires.env`. The security scanner cross-references these.

---

## Architecture

```
crowdlisten (npm package)
├── dist/cli.js          ← CLI entry (skills use this)
├── dist/index.js        ← MCP server entry (MCP config uses this)
├── dist/http-server.js  ← HTTP API entry (backend services)
├── dist/handlers.js     ← Shared pure handler functions
├── dist/services/       ← UnifiedSocialMediaService
└── dist/platforms/      ← Platform adapters (Reddit, YouTube, etc.)

skills/ (ClawHub / local)
├── crowdlisten-search/SKILL.md
├── crowdlisten-comments/SKILL.md
├── crowdlisten-analyze/SKILL.md
└── crowdlisten-deep-analysis/SKILL.md
```

All three entry points (CLI, MCP, HTTP) share the same handler layer. Skills invoke the CLI. MCP provides direct tool access. The result is identical regardless of channel.

---

## Contributing

The highest-value contributions for OpenClaw integration:

1. **New platform adapters** — Threads, Bluesky, Hacker News, Product Hunt, Mastodon
2. **New skills** — Specialized workflows (competitive intelligence, content calendar, etc.)
3. **Skill improvements** — Better trigger descriptions, more examples, workflow refinements
4. **Browser scraping fixes** — DOM selectors break frequently, especially TikTok and Instagram

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.
