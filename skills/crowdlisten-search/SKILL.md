---
name: crowdlisten-search
description: >
  Search social media platforms (Reddit, Twitter, YouTube, Instagram, TikTok)
  for audience conversations about any topic. Use when asked to find what
  people are saying, research audience sentiment, or gather crowd intelligence.
metadata:
  author: crowdlisten
  version: "1.0"
allowed-tools:
  - Bash
  - Read
---

# CrowdListen Search

Search across social media for real audience conversations.

## Usage

```bash
crowdlisten search <platform> "<query>" [--limit N]
```

Platforms: `reddit`, `twitter`, `youtube`, `instagram`, `tiktok`, `moltbook`, `all`

## Examples

```bash
# What do developers think about a product?
crowdlisten search reddit "cursor vs claude code" --limit 20

# Find relevant YouTube discussions
crowdlisten search youtube "AI agent frameworks" --limit 10

# Search across all platforms at once
crowdlisten search all "remote work productivity" --limit 30

# Find Instagram discussions
crowdlisten search instagram "skincare routine" --limit 5
```

## Output

JSON to stdout with: `platform`, `query`, `count`, `posts[]`. Each post has:
`id`, `url`, `content`, `author` (username, displayName, followerCount), `engagement` (likes, comments, shares, views), `timestamp`, `hashtags`.

## When to Use

- "What are people saying about [topic]?"
- "Research audience sentiment on [product]"
- "Find social media discussions about [category]"
- "What problems do [audience] have with [X]?"
- "Find trending conversations about [topic]"
