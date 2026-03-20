---
name: crowdlisten-comments
description: "Extract comments from specific social media posts, videos, or threads. Use when you need the actual audience responses to a particular piece of content."
compatibility: "Requires Node.js 18+ and crowdlisten CLI"
metadata:
  author: crowdlisten
  version: "1.0.0"
  openclaw:
    emoji: "💬"
    requires:
      bins:
        - crowdlisten
      env:
        - YOUTUBE_API_KEY
    primaryEnv: YOUTUBE_API_KEY
    install:
      - id: crowdlisten
        kind: node
        package: crowdlisten
        bins:
          - crowdlisten
        label: "CrowdListen CLI"
allowed-tools: "Bash Read"
---

# CrowdListen Comments

Extract comments from a specific post, video, or thread.

## Usage

```bash
crowdlisten comments <platform> <contentId> [--limit N]
```

Platforms: `reddit`, `twitter`, `youtube`, `instagram`, `tiktok`

## Examples

```bash
# Reddit thread comments
crowdlisten comments reddit t3_abc123 --limit 50

# YouTube video comments
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# TikTok video (accepts URLs or IDs)
crowdlisten comments tiktok https://www.tiktok.com/@user/video/7380123456 --limit 200

# Instagram post
crowdlisten comments instagram CxYz123AbCd --limit 30
```

## Output

JSON to stdout with: `platform`, `contentId`, `count`, `comments[]`. Each comment has:
`id`, `author` (username), `text`, `timestamp`, `likes`, `replies[]`.

## When to Use

- "Get comments from this Reddit thread"
- "What are people saying on this YouTube video?"
- "Extract audience reactions to this TikTok"
- "Pull comments from this specific post"
