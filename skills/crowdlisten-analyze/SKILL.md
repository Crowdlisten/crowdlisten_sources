---
name: crowdlisten-analyze
description: >
  Full analysis pipeline for social media content: extracts comments, clusters
  opinions by theme using embeddings, and provides sentiment analysis. Use when
  you need structured insights from audience discussions, not just raw comments.
metadata:
  author: crowdlisten
  version: "1.0"
allowed-tools:
  - Bash
  - Read
---

# CrowdListen Analyze

Full analysis pipeline: comments + opinion clustering + sentiment.

## Usage

```bash
crowdlisten analyze <platform> <contentId> [--depth LEVEL] [--no-clustering]
crowdlisten cluster <platform> <contentId> [--clusters N]
```

Platforms: `reddit`, `twitter`, `youtube`, `instagram`, `tiktok`, `moltbook`

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

## Output

JSON with: `postId`, `platform`, `sentiment`, `themes[]`, `summary`, `commentCount`, `opinionClusters[]` (each with theme, size, sentiment, examples), `analysisMetadata`.

Cluster output includes: `clusterId`, `theme`, `size`, `percentage`, `sentiment`, `engagement` (totalLikes, avgLikes), `summary`, `examples[]`.

## When to Use

- "Analyze sentiment on this post"
- "What are the main opinions in this thread?"
- "Cluster the audience reactions to this video"
- "Give me structured insights from this discussion"
- "What themes emerge from these comments?"
