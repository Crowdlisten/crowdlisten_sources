# CrowdListen Insights — Agent Reference

Machine-readable capability description for AI agents.

## Ecosystem

CrowdListen is two MCP servers that work together:
- **Insights** (this server) — discovers audience signal from social platforms
- **Harness** ([@crowdlisten/planner](https://github.com/Crowdlisten/crowdlisten_harness)) — plans and tracks work with a cloud-synced knowledge base

Install both with one command: `npx @crowdlisten/planner login`

## Onboard

### One command
```bash
npx @crowdlisten/planner login
```
Auto-configures MCP for Claude Code, Cursor, Gemini CLI, Codex, OpenClaw.

### Manual MCP config
```json
{
  "crowdlisten/insights": {
    "command": "npx",
    "args": ["-y", "crowdlisten"]
  }
}
```

## Interfaces

| Interface | Access | Best for |
|-----------|--------|----------|
| MCP (this server) | Agents call tools via stdio | AI agents |
| CLI | `npx crowdlisten <command>` | Scripts, shell |

Both interfaces share the same handlers and return the same JSON shape.

## Free Tools (7)

### search_content
Search posts across platforms. Start here, then drill into results.
```
search_content(platform, query, limit?)
```
- `platform`: reddit, youtube, tiktok, twitter, instagram, moltbook, xiaohongshu, all
- `query`: Search keywords or hashtags
- `limit`: 1-50, default 10

### get_content_comments
Get comments/replies for a specific post.
```
get_content_comments(platform, contentId, limit?)
```
- `platform`: reddit, youtube, tiktok, twitter, instagram, moltbook
- `contentId`: Post ID from search results
- `limit`: 1-100, default 20

### get_trending_content
Currently trending posts from a platform.
```
get_trending_content(platform, limit?)
```

### get_user_content
Recent posts from a specific user/creator.
```
get_user_content(platform, userId, limit?)
```

### extract_url
Vision extraction — screenshot any URL and get structured data back via LLM analysis. Works on any website. Requires one of: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY`.
```
extract_url(url, limit?, mode?)
```
- `url`: Any web URL to extract from
- `limit`: Max items to extract, default 10
- `mode`: Extraction mode (e.g. `comments`)

### get_platform_status
List which platforms are available and their capabilities.
```
get_platform_status()
```

### health_check
Check connectivity and health of all configured platforms.
```
health_check()
```

## Paid Tools (6) — require CROWDLISTEN_API_KEY

All paid tools require `CROWDLISTEN_API_KEY` — get one at [crowdlisten.com/api](https://crowdlisten.com/api). Comment retrieval is free; analysis requires a key.

### analyze_content
Analyze a post and its comments via the CrowdListen analysis API — sentiment, themes, tension synthesis.
```
analyze_content(platform, contentId, analysisDepth?)
```
- `analysisDepth`: surface, standard (default), deep, comprehensive

### cluster_opinions
Group comments into engagement-weighted semantic opinion clusters. Identifies recurring themes, consensus, and minority viewpoints.
```
cluster_opinions(platform, contentId, clusterCount?, includeExamples?, weightByEngagement?)
```
- `clusterCount`: 2-15, default 5
- `includeExamples`: true (default)
- `weightByEngagement`: true (default)
- **Free alternative**: `get_content_comments` returns raw comments for manual analysis

### enrich_content
Enrich comments with intent detection, stance analysis, engagement scoring, and timestamp hints.
```
enrich_content(platform, contentId, question?)
```
- `question`: Optional analysis context/question
- **Free alternative**: `get_content_comments` returns raw comments

### deep_analyze
AI-powered deep analysis: audience segments, pain points, feature requests, competitive signals.
```
deep_analyze(platform, contentId, analysisDepth?)
```
- `analysisDepth`: deep (default), comprehensive
- **Free alternative**: `get_content_comments` + manual analysis

### extract_insights
Categorized insight extraction: pain points, feature requests, praise, complaints, suggestions.
```
extract_insights(platform, contentId, categories?)
```
- `categories`: optional array, e.g. `["pain_points", "feature_requests"]`

### research_synthesis
Cross-platform research — searches multiple platforms, analyzes results, produces a unified report.
```
research_synthesis(query, platforms?, depth?)
```
- `platforms`: default `["reddit", "twitter", "youtube"]`
- `depth`: quick (~10 sources), standard (~25, default), deep (~50+)
- **Free alternative**: `search_content` on each platform individually

## Platforms

| Platform | Auth required | platform value | Notes |
|----------|--------------|----------------|-------|
| Reddit | None | `reddit` | Works immediately, public JSON API |
| YouTube | `YOUTUBE_API_KEY` | `youtube` | Free: 10k units/day |
| TikTok | Playwright browsers | `tiktok` | Browser-based, 3-5 req/min rate limit |
| Twitter/X | `TWITTER_USERNAME` + `TWITTER_PASSWORD` | `twitter` | Cookie-based scraper |
| Instagram | Playwright browsers | `instagram` | Browser-based, 3-5 req/min rate limit |
| Xiaohongshu | Playwright browsers | `xiaohongshu` | Browser-based (optional: `XHS_CHROME_PROFILE_PATH`) |
| Moltbook | `MOLTBOOK_API_KEY` | `moltbook` | Direct HTTP API |
| All platforms | — | `all` | Search only |

## Example Calls

```
# Find discussions about a topic
search_content(platform="reddit", query="cursor vs claude code", limit=20)

# Get comments from a specific post
get_content_comments(platform="youtube", contentId="dQw4w9WgXcQ", limit=50)

# Paid: analyze content (requires CROWDLISTEN_API_KEY)
analyze_content(platform="reddit", contentId="t3_abc123", analysisDepth="standard")

# Paid: deep analysis depth
analyze_content(platform="reddit", contentId="t3_abc123", analysisDepth="deep")

# Cluster opinions into themes
cluster_opinions(platform="reddit", contentId="t3_abc123", clusterCount=8)

# Paid: deep analysis
deep_analyze(platform="reddit", contentId="t3_abc123", analysisDepth="comprehensive")

# Paid: extract categorized insights
extract_insights(platform="reddit", contentId="t3_abc123", categories=["pain_points", "feature_requests"])

# Paid: cross-platform research
research_synthesis(query="AI coding assistants", platforms=["reddit", "youtube", "twitter"], depth="deep")
```
