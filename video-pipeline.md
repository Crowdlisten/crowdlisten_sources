# Video Pipeline — TikTok Search, Download & VLM Understanding

This document describes the three new modules added to CrowdListen MCP:
**Module 1** (`TikTokBrowserSearch` — browser search + Claude Vision selection),
**Module 2** (`VideoDownloader` — yt-dlp wrapper), and
**Module 3** (`VideoUnderstanding` — Gemini 2.5 Flash video analysis).

---

## Pipeline Overview

```
[Module 1] TikTokBrowserSearch          src/core/utils/TikTokBrowserSearch.ts
    Playwright opens TikTok search → extracts DOM candidates
    → Claude Vision selects top 5 relevant videos → returns URLs

        ↓  TikTokVideoCandidate[] (video URLs + metadata)

[Module 2] VideoDownloader              src/core/utils/VideoDownloader.ts
    Spawns yt-dlp for each URL → checks duration → downloads .mp4
    → returns local file paths + video IDs

        ↓  DownloadResult[] (local file paths)

[Module 3] VideoUnderstanding           src/core/utils/VideoUnderstanding.ts
    Uploads each .mp4 to Gemini Files API → polls until ready
    → Gemini 2.5 Flash returns structured VideoContext
    (timeline, key moments, entities, mood, implicit context)

        ↓  VideoContext[] (one per video)

[Future] CommentEnricher
    Combines VideoContext with retrieved comments
    → rewrites comments to resolve coreference
    ("that part", "when she did that" → concrete timestamped references)

        ↓  enriched Comment[]

[Existing] CommentClusteringService     src/core/utils/CommentClustering.ts
    Clusters enriched comments by semantic similarity + engagement weight
    → returns CommentClustering with themes, sentiment, representative examples
```

---

## Module 1 — TikTokBrowserSearch

**File:** `src/core/utils/TikTokBrowserSearch.ts`

### What it does

1. Launches a Playwright Chromium browser (headed with a saved profile, or headless as fallback)
2. Navigates to `https://www.tiktok.com/search/video?q=<keyword>`
3. Waits for TikTok's React app to finish rendering (`networkidle` + 4s extra wait)
4. If TikTok shows a login wall, waits up to 3 minutes for the user to log in, then retries
5. Extracts video candidates from `a[href*="/video/"]` DOM elements — title, author, URL
6. Takes a viewport screenshot of the results page
7. Sends the screenshot + candidate list to Claude (`claude-sonnet-4-6`) with vision
8. Claude returns the indices of the most relevant videos
9. Returns a `BrowserSearchResult` with the selected `TikTokVideoCandidate[]`

### Usage

```typescript
import { TikTokBrowserSearchService } from './src/core/utils/TikTokBrowserSearch';

const searcher = new TikTokBrowserSearchService();
const result = await searcher.searchAndSelect('productivity apps', 5);

console.log(result.selectedVideos);
// [{ index: 0, title: '...', author: 'username', url: 'https://...' }, ...]
```

### Known limitation — video duration

Module 1 selects videos based on visual relevance only. It has **no access to video duration**
at search time (TikTok does not expose duration in the search results DOM). Duration is checked
in Module 2 via `yt-dlp --print duration` before downloading.

This means some selected videos may be skipped by Module 2 if they exceed `maxDurationSeconds`.
The full pipeline (`testAll`) handles this gracefully — it skips the failed video and continues
with the remaining ones rather than aborting.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for Vision-based video selection |
| `TIKTOK_CHROME_PROFILE_PATH` | Recommended | Path to a Chrome profile with TikTok already logged in. Without this, TikTok may show a login wall. |

### First-time TikTok login setup (required)

Module 1 uses **Playwright's bundled Chromium** — not your regular Chrome. You must log into
TikTok inside that Chromium once so the session is saved to the profile directory.

**Steps:**

1. Set `TIKTOK_CHROME_PROFILE_PATH` to a new dedicated directory in your `.env`:
   ```
   TIKTOK_CHROME_PROFILE_PATH=/Users/YOUR_USERNAME/.playwright-tiktok-profile
   ```

2. Run the test — a Chromium window will open and navigate to TikTok search:
   ```bash
   node test-video-pipeline.cjs module1
   ```

3. TikTok will show a login wall. Log in to your TikTok account in the opened Chromium window.

4. Once logged in, the search will resume automatically. The session is saved to the profile
   directory — all future runs will skip the login step entirely.

> **Note:** Do not point `TIKTOK_CHROME_PROFILE_PATH` at your real Chrome profile
> (`~/Library/Application Support/Google/Chrome/...`). Playwright's Chromium and Google Chrome
> have incompatible profile formats. Use a dedicated directory as shown above.

### Install Playwright browsers (one-time setup)

```bash
npm install
npx playwright install chromium
```

---

## Module 2 — VideoDownloader

**File:** `src/core/utils/VideoDownloader.ts`

### What it does

1. Accepts a TikTok video URL (or batch of URLs from Module 1)
2. Optionally checks video duration first — skips videos over the configured limit
3. Spawns `yt-dlp` as a child process with `best[height<=480]` format selection
4. Reuses the user's Chrome cookies for TikTok auth (`--cookies-from-browser chrome`)
5. Returns a `DownloadResult` with the local file path, ready for Module 3

### One-time system setup (yt-dlp is a system tool, not an npm package)

```bash
brew install yt-dlp     # macOS
# or: pip install yt-dlp
```

### Usage

```typescript
import { VideoDownloaderService } from './src/core/utils/VideoDownloader';

const downloader = new VideoDownloaderService();

// Single video
const result = await downloader.downloadVideo(
  'https://www.tiktok.com/@username/video/7380123456789',
  { maxHeight: 480, useChromecookies: true }
);
console.log(result.filePath); // '/tmp/crowdlisten_videos/7380123456789.mp4'

// Batch (sequential, from Module 1 output)
const results = await downloader.downloadVideos(
  searchResult.selectedVideos.map(v => v.url),
  { maxHeight: 480 }
);

// Cleanup after VideoUnderstanding has processed the files
downloader.cleanup(result.filePath);        // delete one file
downloader.cleanupAll();                    // delete all files in output dir
```

### DownloadOptions

| Option | Default | Description |
|---|---|---|
| `outputDir` | `/tmp/crowdlisten_videos` | Where to save video files |
| `maxHeight` | `720` | Max dimension (px) for format selection — applied to width first (portrait TikTok), then height (landscape). TikTok's smallest portrait format is 576px wide. |
| `useChromecookies` | `true` | Reuse Chrome TikTok session to avoid region blocks |
| `maxDurationSeconds` | `600` | Skip videos longer than this (10 min default). In the full pipeline test (`testAll`) this is set to **1200s (20 min)**. Videos exceeding this limit are skipped and the pipeline moves to the next candidate. |

---

## Module 3 — VideoUnderstanding

**File:** `src/core/utils/VideoUnderstanding.ts`

### What it does

1. Uploads the local `.mp4` file to the **Gemini Files API** (handles large files up to 2 GB)
2. Polls the file state until Gemini finishes server-side processing (`ACTIVE`)
3. Calls **Gemini 2.5 Flash** with the video file + structured understanding prompt
4. Parses the response into a typed `VideoContext` object

### The `VideoContext` structure

```typescript
{
  mainTopic: string;           // "Creator reviews the new iPhone 16 camera"
  summary: string;             // 3-5 sentence narrative of the full video
  keyEntities: {
    people: string[];          // ["male creator in gray hoodie", "interviewer off-camera"]
    objects: string[];         // ["iPhone 16 Pro", "camera setup"]
    locations: string[];       // ["studio apartment living room"]
  };
  timeline: TimelineSegment[]; // [{ start: "0:00", end: "0:15", description: "..." }]
  keyMoments: KeyMoment[];     // [{ timestamp: "0:23", description: "..." }]
  mood: string;                // "humorous" | "informative" | "emotional" | ...
  implicitContext: string[];   // Background knowledge commenters might assume
  searchKeywordRelevance: string;
  videoId: string;
  processingTimeMs: number;
}
```

### Why `keyMoments` and `timeline` matter

Comments frequently reference video content without naming it:

| Raw comment | After enrichment (using VideoContext) |
|---|---|
| `"that part was hilarious"` | `"the moment at 0:23 when the creator dropped the phone was hilarious"` |
| `"when she walked away"` | `"when the interviewer walked away at 1:05 after the creator's answer"` |
| `"Same 😭"` | `"I share the creator's frustration at 0:45 about the battery life"` |

### Usage

```typescript
import { VideoUnderstandingService } from './src/core/utils/VideoUnderstanding';

const service = new VideoUnderstandingService();

const context = await service.understandVideo(
  '/tmp/tiktok/7380123456789.mp4',  // local file path from yt-dlp
  '7380123456789',                   // video ID
  'productivity apps'                // keyword used to find the video
);

console.log(context.keyMoments);
// [{ timestamp: "0:12", description: "Creator shows the app's main dashboard for the first time" }, ...]
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |

### Gemini Files API limits

| Limit | Value |
|---|---|
| Max file size | 2 GB |
| Max storage per project | 20 GB |
| File TTL | 48 hours (auto-deleted) |
| Processing time (TikTok ~30s video) | ~10–30 seconds |

TikTok videos downloaded at 480p are typically 5–30 MB, well within these limits.

### generateContent timeout

Gemini 2.5 Flash is a **thinking model** — it reasons internally before producing output.
For longer videos (60–120s) with the full structured prompt, the API call can take
**3–8 minutes**. A hard timeout of **5 minutes** (`GENERATE_TIMEOUT_MS = 300_000`) is set
in the code. If Gemini does not respond within 5 minutes, the call throws and the pipeline
skips that video rather than hanging indefinitely.

---

## End-to-end example

```typescript
import { TikTokBrowserSearchService } from './src/core/utils/TikTokBrowserSearch';
import { VideoDownloaderService } from './src/core/utils/VideoDownloader';
import { VideoUnderstandingService } from './src/core/utils/VideoUnderstanding';

const keyword = 'productivity apps';

// Step 1: Browser search + Claude Vision selection
const searcher = new TikTokBrowserSearchService();
const searchResult = await searcher.searchAndSelect(keyword, 5);

console.log(`Found ${searchResult.totalCandidates} candidates, selected ${searchResult.selectedVideos.length}`);

// Step 2: Download selected videos with VideoDownloaderService (yt-dlp wrapper)
const downloader = new VideoDownloaderService();
const downloadResults = await downloader.downloadVideos(
  searchResult.selectedVideos.map(v => v.url),
  { maxHeight: 480, maxDurationSeconds: 300 } // skip videos over 5 min
);

// Step 3: Understand each downloaded video with Gemini 2.5 Flash
const understanding = new VideoUnderstandingService();

for (const download of downloadResults) {
  const context = await understanding.understandVideo(
    download.filePath,
    download.videoId,
    keyword
  );

  console.log(`\n--- ${download.videoId} ---`);
  console.log(`Topic: ${context.mainTopic}`);
  console.log(`Key moments: ${context.keyMoments.length}`);
  console.log(`Timeline segments: ${context.timeline.length}`);

  // Clean up local file after Gemini has uploaded it
  // (Gemini retains its own copy for 48h; we don't need the local file anymore)
  downloader.cleanup(download.filePath);
}
```

---

## New dependencies

Run after pulling these changes:

```bash
npm install
npx playwright install chromium   # one-time: downloads Chromium browser
brew install yt-dlp               # one-time: system video downloader

# Install curl_cffi into yt-dlp's bundled Python — required for TikTok bot-detection bypass
# Replace <version> with your installed version (check: brew info yt-dlp)
/opt/homebrew/Cellar/yt-dlp/<version>/libexec/bin/python3 -m pip install curl_cffi

# Verify impersonation is available:
yt-dlp --list-impersonate-targets   # should show Chrome targets without "(unavailable)"
```

New packages added to `package.json`:

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.26.0 | Claude API for Vision-based video selection (Module 1) |
| `@google/generative-ai` | ^0.17.0 | Gemini API for video understanding (Module 3) |
| `playwright` | ^1.44.0 | Browser automation for TikTok search (Module 1) |
