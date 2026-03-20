# Contributing to CrowdListen

Thanks for your interest in contributing! CrowdListen's extraction layer is open source so the community can help expand platform coverage and improve reliability.

## Quick Start

```bash
git clone https://github.com/Crowdlisten/crowdlisten_sources.git
cd crowdlisten_sources
npm install
cp .env.example .env   # Add your API keys
npm run build
```

## How to Contribute

### Adding a New Platform Adapter

This is the most valuable contribution. Each platform adapter lives in `src/platforms/` and implements the `SocialMediaPlatform` interface.

1. **Create your adapter** in `src/platforms/YourPlatformAdapter.ts`
2. **Extend `BaseAdapter`** from `src/core/base/BaseAdapter.ts`
3. **Implement required methods:**
   - `initialize()` — Set up API client or browser session
   - `getTrendingContent(limit?)` — Fetch trending posts
   - `getUserContent(userId, limit?)` — Fetch user's posts
   - `searchContent(query, limit?)` — Search for posts
   - `getContentComments(contentId, limit?)` — Fetch comments
   - `getPlatformName()` — Return platform identifier
   - `getSupportedFeatures()` — Return capability flags
4. **Register it** in `src/services/UnifiedSocialMediaService.ts`
5. **Add configuration** in `src/service-config.ts`
6. **Add tests** in `tests/`

Use existing adapters as reference — `RedditAdapter.ts` is a good example for API-based platforms, `InstagramAdapter.ts` for browser-based scraping.

### Fixing Browser Scraping

DOM selectors for TikTok, Instagram, and other browser-scraped platforms break frequently. If you notice broken selectors:

1. Identify the broken selector in the relevant adapter or utility file
2. Find the updated selector using browser DevTools
3. Submit a PR with the fix and a brief description of what changed

### Bug Fixes

1. Fork the repo
2. Create a feature branch: `git checkout -b fix/description`
3. Make your changes
4. Run tests: `npm test`
5. Run type check: `npx tsc --noEmit`
6. Submit a PR

## Code Style

- TypeScript strict mode
- Follow existing patterns in the codebase
- All platform methods return standardized `Post[]`, `Comment[]`, or `ContentAnalysis` types
- Error handling uses the custom error hierarchy (`SocialMediaError`, `RateLimitError`, etc.)
- Rate limiting is handled by `BaseAdapter` — don't bypass it

## Data Types

All adapters must normalize their output to these shared types defined in `src/core/interfaces/SocialMediaPlatform.ts`:

- **Post**: id, platform, author, content, engagement, timestamp, url
- **Comment**: id, author, text, timestamp, likes, replies
- **User**: id, username, displayName, followerCount, verified

## Testing

```bash
npm test              # Unit tests
npm run test:e2e      # End-to-end tests (requires API keys)
npm run test:coverage # Coverage report
```

## Platform Wishlist

Platforms we'd love adapters for:
- **Threads** (Meta)
- **Bluesky**
- **Mastodon** / Fediverse
- **Hacker News**
- **Product Hunt**
- **LinkedIn** (public posts)
- **Discord** (public servers)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
