---
name: crowdlisten-search
description: "Search Reddit, YouTube, TikTok, Twitter, Instagram for audience conversations. Use when finding what people say about topics, products, or trends."
version: 1.0.0
homepage: https://crowdlisten.com
metadata: {"openclaw":{"emoji":"ear","requires":{"bins":["crowdlisten"],"anyEnv":["YOUTUBE_API_KEY"]},"primaryEnv":"YOUTUBE_API_KEY","install":[{"id":"crowdlisten","kind":"node","package":"crowdlisten","bins":["crowdlisten"],"label":"CrowdListen CLI"}]}}
allowed-tools: "Bash Read"
---

# CrowdListen Search

Search across social media for real audience conversations.

## Usage

```bash
crowdlisten search <platform> "<query>" [--limit N]
```

Platforms: `reddit`, `twitter`, `youtube`, `instagram`, `tiktok`, `all`

Reddit works with zero configuration. Other platforms need API keys (see Setup).

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

## Setup

```bash
npm install -g crowdlisten
```

Reddit needs no API keys. For other platforms, set environment variables:
- `YOUTUBE_API_KEY` — YouTube Data API v3 key
- `TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` — Twitter/X credentials
- `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD` — Instagram (optional, uses Playwright)

## When to Use

- "What are people saying about [topic]?"
- "Research audience sentiment on [product]"
- "Find social media discussions about [category]"
- "What problems do [audience] have with [X]?"
- "Find trending conversations about [topic]"
