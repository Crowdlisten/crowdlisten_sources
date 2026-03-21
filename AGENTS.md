# CrowdListen Sources — Agent Reference

Machine-readable capability description for AI agents.

## Install

```bash
npx @crowdlisten/planner login
```

Installs both Planner and Sources into your agent's MCP config.

## MCP Entry

```json
{
  "crowdlisten/sources": {
    "command": "npx",
    "args": ["-y", "crowdlisten"]
  }
}
```

## Tools

- `search_content(platform, query, limit?)` — Search posts across platforms
- `get_content_comments(platform, contentId, limit?)` — Get comments for a post
- `analyze_content(platform, contentId, analysisDepth?, enableClustering?)` — Full analysis pipeline
- `cluster_opinions(platform, contentId, clusterCount?, includeExamples?, weightByEngagement?)` — Semantic opinion clustering
- `get_trending_content(platform, limit?)` — Trending content
- `get_user_content(platform, userId, limit?)` — Content from a specific user
- `get_platform_status()` — Available platforms and capabilities
- `health_check()` — Platform health status

## Platforms

| Platform | Auth | platform value |
|----------|------|---------------|
| Reddit | None | `reddit` |
| YouTube | `YOUTUBE_API_KEY` | `youtube` |
| TikTok | Optional | `tiktok` |
| Twitter/X | OAuth tokens | `twitter` |
| Instagram | None | `instagram` |
| All | — | `all` |

## Example Calls

```
search_content(platform="reddit", query="cursor vs claude code", limit=20)
get_content_comments(platform="youtube", contentId="dQw4w9WgXcQ", limit=50)
analyze_content(platform="reddit", contentId="t3_abc123", analysisDepth="deep")
cluster_opinions(platform="reddit", contentId="t3_abc123", clusterCount=8)
```
