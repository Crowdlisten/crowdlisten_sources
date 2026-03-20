---
name: crowdlisten-analyze
description: "Analyze social media content with opinion clustering and sentiment analysis. Use when you need structured insights from audience discussions, not just raw comments."
compatibility: "Requires Node.js 18+ and crowdlisten CLI. OPENAI_API_KEY needed for clustering."
metadata:
  author: crowdlisten
  version: "1.0.0"
  openclaw:
    emoji: "📊"
    requires:
      bins:
        - crowdlisten
      env:
        - YOUTUBE_API_KEY
        - OPENAI_API_KEY
    primaryEnv: OPENAI_API_KEY
    install:
      - id: crowdlisten
        kind: node
        package: crowdlisten
        bins:
          - crowdlisten
        label: "CrowdListen CLI"
allowed-tools: "Bash Read"
---

# CrowdListen Analyze

Full analysis pipeline: comments + opinion clustering + sentiment.

## Usage

```bash
crowdlisten analyze <platform> <contentId> [--depth LEVEL] [--no-clustering]
crowdlisten cluster <platform> <contentId> [--clusters N]
```

Platforms: `reddit`, `twitter`, `youtube`, `instagram`, `tiktok`

## Examples

```bash
# Analyze a Reddit thread with opinion clustering
crowdlisten analyze reddit t3_abc123

# Deep analysis of a YouTube video
crowdlisten analyze youtube dQw4w9WgXcQ --depth deep

# Just cluster opinions (without full analysis)
crowdlisten cluster reddit t3_abc123 --clusters 8

# Analyze TikTok video from URL
crowdlisten analyze tiktok https://www.tiktok.com/@user/video/7380123456
```

## Depth Levels

- `surface` — basic sentiment only
- `standard` — sentiment + 5 opinion clusters (default)
- `deep` — premium synthesis with tension mapping (requires CROWDLISTEN_API_KEY, see crowdlisten-deep-analysis skill)
- `comprehensive` — full research synthesis (requires CROWDLISTEN_API_KEY)

## Output

JSON with: `postId`, `platform`, `sentiment`, `themes[]`, `summary`, `commentCount`, `opinionClusters[]` (each with theme, size, sentiment, examples), `analysisMetadata`.

## When to Use

- "Analyze sentiment on this post"
- "What are the main opinions in this thread?"
- "Cluster the audience reactions to this video"
- "Give me structured insights from this discussion"
- "What themes emerge from these comments?"
