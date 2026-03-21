# Platform Setup

## Reddit
No configuration needed. Uses public JSON API. Works immediately.

## YouTube
Requires a YouTube Data API v3 key (free tier: 10,000 units/day).

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable YouTube Data API v3
3. Create an API key
4. Add to `.env`:
```bash
YOUTUBE_API_KEY=your-key
```

## TikTok
Optional setup -- uses Playwright browser automation.

Requirements:
- **yt-dlp** -- `brew install yt-dlp` (for video downloads)
- **Playwright** -- included via `npm install`
- **Chrome profile** (optional) -- set `TIKTOK_CHROME_PROFILE_PATH` to reuse your TikTok login session

```bash
TIKTOK_CHROME_PROFILE_PATH=/path/to/chrome/profile
```

For video understanding (transcript + visual analysis):
```bash
GEMINI_API_KEY=your-key      # Google Gemini for visual analysis
ANTHROPIC_API_KEY=your-key   # Claude for transcript analysis
```

## Twitter/X
Requires a Twitter Developer account (free tier: 1,500 tweets/month).

All four tokens required:
```bash
TWITTER_API_KEY=your-key
TWITTER_API_KEY_SECRET=your-secret
TWITTER_ACCESS_TOKEN=your-token
TWITTER_ACCESS_TOKEN_SECRET=your-token-secret
```

## Instagram
No API keys needed. Uses Playwright browser scraping. May require periodic updates as Instagram changes its DOM structure.

## Optional: Opinion Clustering
For semantic opinion clustering using embeddings:
```bash
OPENAI_API_KEY=your-key
```
Without this, clustering falls back to keyword-based grouping.
