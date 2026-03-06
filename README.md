# CrowdListen Sources MCP

A Model Context Protocol (MCP) server that gives AI agents unified access to social media platforms — Reddit, YouTube, TikTok, Twitter/X, and Instagram — through a single standardized interface. Built as the data ingestion layer for [CrowdListen](https://crowdlisten.com), an audience intelligence platform that conducts original research directly from unstructured social data.

For background on why this exists and how it fits into the agent-first architecture, see:
- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/) — CrowdListen's origin story
- [When to Use MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/) — design rationale for the Sources MCP boundary

## What It Does

- **Unified Interface**: Single API across Reddit, YouTube, TikTok, Twitter/X, Instagram
- **Standardized Data**: Consistent data models regardless of platform
- **Video Pipeline**: TikTok search → download → Gemini VLM understanding (transcript, emotional arc, key moments)
- **Analysis Tools**: Opinion clustering, sentiment tracking, expert identification, cross-platform synthesis
- **MCP Native**: Plugs into any MCP-compatible client (Claude Desktop, OpenAI agents, custom agents)

## Recent Changes

### Video Analysis Pipeline (Feb 28 – Mar 1, by Forrest)

End-to-end TikTok video understanding:

- **TikTokBrowserSearch** (`src/core/utils/TikTokBrowserSearch.ts`) — Playwright drives Chrome to search TikTok, then Claude Vision selects the most relevant videos from a screenshot of results
- **VideoDownloader** (`src/core/utils/VideoDownloader.ts`) — Wraps `yt-dlp` with bot-detection bypass (`--impersonate chrome`, `--cookies-from-browser`) and portrait-aware format selection
- **VideoUnderstanding** (`src/core/utils/VideoUnderstanding.ts`) — Uploads videos to Gemini Files API, returns structured analysis: transcript, visual text, audio track, calls to action, emotional arc, controversial moments, key entities, timeline
- Full pipeline runs in under 1.5 minutes with parallel processing
- Login wall detection loop, 5-minute Gemini timeout, dedicated Playwright Chromium profile

### YouTube & Reddit Adapters (Feb 22 – Mar 2, by Simone)

- **YouTubeAdapter** (`src/platforms/YouTubeAdapter.ts`) — Full YouTube Data API v3 integration with search, channel content, and video metadata
- **RedditAdapter** (`src/platforms/RedditAdapter.ts`) — Working Reddit adapter with comment thread fetching
- Updated `DataNormalizer` for cross-platform data consistency
- Updated Vercel bridge (`api/mcp.js`) for both adapters

## Platform Support

| Platform | Status | Auth Required | Notes |
|----------|--------|---------------|-------|
| Reddit | Working | No | Public content access |
| YouTube | Working | API key | YouTube Data API v3 (free tier: 10k units/day) |
| TikTok | Working | Optional | Browser search + video pipeline; enhanced with Chrome profile |
| Twitter/X | Working | Yes | Developer account required (free tier: 1,500 tweets/month) |
| Instagram | Working | Yes | Username/password; risk of security flags |

## Tools (13 endpoints)

### Core Content
| Tool | Description |
|------|-------------|
| `get_trending_content` | Trending content from any platform |
| `get_user_content` | User-specific content retrieval |
| `search_content` | Cross-platform content search |
| `get_content_comments` | Comment and reply fetching |
| `get_platform_status` | Platform availability status |
| `health_check` | System health monitoring |

### Advanced Analysis

### TikTok URL Analysis Example

```json
{
  "name": "analyze_url",
  "arguments": {
    "url": "https://vm.tiktok.com/ZM.../",
    "platform": "tiktok",
    "maxComments": 50,
    "enableClustering": false
  }
}
```

| Tool | Description |
|------|-------------|
| `analyze_content` | Multi-modal content analysis with vertical slice methodology |
| `analyze_url` | URL-first analysis (TikTok: resolves short links, extracts video ID, returns structured comments analysis with degraded fallback) |
| `cluster_opinions` | Semantic opinion clustering using embeddings |
| `deep_platform_analysis` | Platform-specific vertical analysis |
| `sentiment_evolution_tracker` | Temporal sentiment analysis with trend prediction |
| `expert_identification` | Authority scoring and expert voice identification |
| `cross_platform_synthesis` | Strategic insight synthesis across platforms |

## Quick Start

```bash
# Clone and install
git clone https://github.com/terrylinhaochen/crowdlisten_sources_mcp.git
cd crowdlisten_sources_mcp
npm install

# Configure
cp .env.example .env
# Edit .env with your credentials (see below)

# Build and run
npm run build
npm start
```

## Configuration

### Required API Keys

```env
# YouTube Data API v3 (free tier available)
YOUTUBE_API_KEY=your_key

# For video pipeline
ANTHROPIC_API_KEY=your_key    # Claude Vision for TikTok search
GEMINI_API_KEY=your_key       # Gemini for video understanding

# Optional
TWITTER_API_KEY=...           # Twitter/X (all 4 credentials needed)
INSTAGRAM_USERNAME=...        # Instagram
TIKTOK_MS_TOKEN=...          # Enhanced TikTok access
OPENAI_API_KEY=...           # Opinion clustering
```

See `.env.example` for the full list with setup instructions.

### Video Pipeline Setup

The TikTok video pipeline requires additional dependencies:

1. **yt-dlp** — `brew install yt-dlp` (or `pip install yt-dlp`)
2. **Playwright** — installed via `npm install` (uses bundled Chromium)
3. **Chrome profile** (optional) — set `TIKTOK_CHROME_PROFILE_PATH` to reuse your TikTok login session and avoid bot detection

First-time TikTok setup: log into TikTok in Chrome, then point the profile path at your Chrome profile directory. See `video-pipeline.md` for details.

### MCP Client Configuration

```json
{
  "mcpServers": {
    "crowdlisten-sources": {
      "command": "node",
      "args": ["/path/to/crowdlisten_sources_mcp/dist/index.js"],
      "env": {
        "YOUTUBE_API_KEY": "your_key",
        "ANTHROPIC_API_KEY": "your_key",
        "GEMINI_API_KEY": "your_key"
      }
    }
  }
}
```

## Project Structure

```
src/
├── core/
│   ├── interfaces/                # Type definitions
│   ├── base/                      # Base adapter class
│   └── utils/
│       ├── DataNormalizer.ts       # Cross-platform data normalization
│       ├── CommentClustering.ts    # Semantic opinion clustering
│       ├── TikTokBrowserSearch.ts  # Playwright + Claude Vision search
│       ├── VideoDownloader.ts      # yt-dlp wrapper with bot bypass
│       └── VideoUnderstanding.ts   # Gemini VLM video analysis
├── platforms/
│   ├── RedditAdapter.ts
│   ├── YouTubeAdapter.ts
│   ├── TikTokAdapter.ts
│   ├── TwitterAdapter.ts
│   └── InstagramAdapter.ts
├── services/
│   └── UnifiedSocialMediaService.ts
└── index.ts                       # MCP server entry point
```

## Development

```bash
npm run dev      # Development mode with auto-reload
npm run build    # Build TypeScript
npm run test     # Run tests
npm start        # Production server
```

### Adding a Platform

1. Create adapter in `src/platforms/` extending `BaseAdapter`
2. Implement required interface methods
3. Register in `UnifiedSocialMediaService`
4. Add credentials to `.env.example`

## Data Models

```typescript
interface Post {
  id: string;
  content: string;
  author: { id: string; username: string; displayName?: string; verified?: boolean };
  platform: 'tiktok' | 'twitter' | 'reddit' | 'instagram' | 'youtube';
  engagement: { likes?: number; comments?: number; shares?: number; views?: number };
  metadata: { hashtags: string[]; mentions: string[]; urls: string[] };
  timestamp: string;
  url?: string;
}

interface Comment {
  id: string;
  content: string;
  author: { id: string; username: string; displayName?: string };
  platform: 'tiktok' | 'twitter' | 'reddit' | 'instagram' | 'youtube';
  engagement: { likes?: number; replies?: number };
  timestamp: string;
  replies?: Comment[];
}
```

## Architecture Context

This MCP serves as the **data boundary layer** in CrowdListen's agent-first architecture. Per the [MCPs vs Skills](https://chenterry.com/posts/skills_vs_mcps_for_agents/) design:

- **Sources MCP** (this repo) handles platform access, ingestion, normalization, and retrieval
- **Tasks MCP** ([crowdlisten_tasks_mcp](https://github.com/terrylinhaochen/crowdlisten_tasks_mcp)) handles task lifecycle, assignment, and progress tracking
- Agent reasoning and behavioral logic live in Skills, not MCPs

The MCP handles the calls; Skills handle the judgment.

## Contributors

- **Terry Chen** — Core MCP server, analysis tools, project architecture
- **Forrest Chai** — TikTok video pipeline (search, download, VLM understanding)
- **Simone** — YouTube and Reddit adapter integration

## License

MIT
