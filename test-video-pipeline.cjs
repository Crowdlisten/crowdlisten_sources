#!/usr/bin/env node

/**
 * test-video-pipeline.cjs
 *
 * Step-by-step test script for the three new video pipeline modules.
 * Run each test independently to isolate failures:
 *
 *   node test-video-pipeline.cjs module2          # VideoDownloader only
 *   node test-video-pipeline.cjs module3 <path>   # VideoUnderstanding only (provide a .mp4 path)
 *   node test-video-pipeline.cjs module1          # TikTokBrowserSearch only
 *   node test-video-pipeline.cjs all              # Full pipeline end-to-end
 *
 * Prerequisites: run `npx tsc` before this script so dist/ is up to date.
 */

'use strict';

require('dotenv').config();
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(msg)  { console.log(`  ✓  ${msg}`); }
function fail(msg)  { console.error(`  ✗  ${msg}`); }
function info(msg)  { console.log(`  →  ${msg}`); }
function header(msg){ console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${ms}ms (${(ms / 1000).toFixed(1)}s)`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${ms}ms (${minutes}m ${seconds}s)`;
}

function checkEnv(key) {
  if (!process.env[key]) {
    fail(`Missing env var: ${key}  (check your .env file)`);
    return false;
  }
  pass(`${key} is set`);
  return true;
}

// ─── Module 2: VideoDownloader ────────────────────────────────────────────────

async function testModule2(videoUrl) {
  header('MODULE 2 — VideoDownloader');

  // Use a short, public TikTok video as the default test target
  const testUrl = videoUrl || 'https://www.tiktok.com/@espn/video/7610937086090202398';
  info(`Test URL: ${testUrl}`);

  // 1. Check yt-dlp is installed
  const { execSync } = require('child_process');
  try {
    const version = execSync('yt-dlp --version', { encoding: 'utf8', env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` } }).trim();
    pass(`yt-dlp found: v${version}`);
  } catch {
    fail('yt-dlp not found. Install it: brew install yt-dlp');
    return null;
  }

  // 2. Import compiled module
  let VideoDownloaderService;
  try {
    ({ VideoDownloaderService } = require('./dist/core/utils/VideoDownloader'));
    pass('VideoDownloader module loaded from dist/');
  } catch (err) {
    fail(`Could not load VideoDownloader: ${err.message}`);
    info('Have you run `npx tsc` to compile the TypeScript?');
    return null;
  }

  // 3. Run the download
  info('Starting download (this may take 10-30 seconds)...');
  try {
    const downloader = new VideoDownloaderService();
    const result = await downloader.downloadVideo(testUrl, {
      maxHeight: 480,
      useChromecookies: true,
      maxDurationSeconds: 1200,  // skip videos over 20 min
    });

    pass(`Download complete`);
    pass(`Video ID  : ${result.videoId}`);
    pass(`File path : ${result.filePath}`);
    pass(`Format    : ${result.format}`);
    pass(`Time taken: ${result.downloadTimeMs}ms`);

    return result; // pass result to Module 3 test
  } catch (err) {
    fail(`Download failed: ${err.message}`);
    if (err.message.includes('yt-dlp')) {
      info('Tip: try running yt-dlp manually first:');
      info(`  yt-dlp -f "best[height<=480]" --cookies-from-browser chrome "${testUrl}"`);
    }
    return null;
  }
}

// ─── Module 3: VideoUnderstanding ────────────────────────────────────────────

async function testModule3(localFilePath) {
  header('MODULE 3 — VideoUnderstanding (Gemini 2.5 Flash)');

  // 1. Check API key
  if (!checkEnv('GEMINI_API_KEY')) return null;

  // 2. Check file exists
  const fs = require('fs');
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    fail(`No valid video file path provided. Got: ${localFilePath}`);
    info('Pass a .mp4 path: node test-video-pipeline.cjs module3 /path/to/video.mp4');
    info('Or run module2 first to download a video.');
    return null;
  }
  pass(`Video file exists: ${localFilePath}`);

  // 3. Import compiled module
  let VideoUnderstandingService;
  try {
    ({ VideoUnderstandingService } = require('./dist/core/utils/VideoUnderstanding'));
    pass('VideoUnderstanding module loaded from dist/');
  } catch (err) {
    fail(`Could not load VideoUnderstanding: ${err.message}`);
    info('Have you run `npx tsc` to compile the TypeScript?');
    return null;
  }

  // 4. Run understanding
  info('Uploading to Gemini Files API and waiting for processing...');
  info('This typically takes 20-60 seconds depending on video length.');
  try {
    const service = new VideoUnderstandingService();
    const videoId = path.basename(localFilePath, path.extname(localFilePath));

    const context = await service.understandVideo(
      localFilePath,
      videoId,
      'test keyword'
    );

    pass('VideoContext received from Gemini');
    pass(`Main topic          : ${context.mainTopic}`);
    pass(`Mood                : ${context.mood}`);
    pass(`Emotional arc       : ${context.emotionalArc}`);
    pass(`Timeline segments   : ${context.timeline.length}`);
    pass(`Key moments         : ${context.keyMoments.length}`);
    pass(`Controversial moments: ${context.controversialMoments.length}`);
    pass(`People detected     : ${context.keyEntities.people.join(', ') || '(none)'}`);
    pass(`Audio track         : ${context.audioTrack || '(none)'}`);
    pass(`Calls to action     : ${context.callsToAction.join(' | ') || '(none)'}`);
    pass(`Visual text anchors : ${context.visualText.length}`);
    pass(`Transcript excerpt length: ${context.transcript.length} chars`);
    pass(`Processing time     : ${context.processingTimeMs}ms`);

    if (context.transcript) {
      info('Transcript excerpt preview:');
      info(`  "${context.transcript.substring(0, 150)}${context.transcript.length > 150 ? '...' : ''}"`);
    }
    if (context.keyMoments.length > 0) {
      info('Sample key moment:');
      info(`  ${context.keyMoments[0].timestamp} — ${context.keyMoments[0].description}`);
    }

    return context;
  } catch (err) {
    fail(`VideoUnderstanding failed: ${err.message}`);
    if (err.message.includes('GEMINI_API_KEY')) {
      info('Check that GEMINI_API_KEY is set correctly in your .env file');
    }
    return null;
  }
}

// ─── Module 1: TikTokBrowserSearch ───────────────────────────────────────────

async function testModule1(keyword) {
  header('MODULE 1 — TikTokBrowserSearch (Playwright + Claude Vision)');

  // 1. Check API key
  if (!checkEnv('ANTHROPIC_API_KEY')) return null;

  // 2. Check Chrome profile (warn if missing, don't block)
  const chromePath = process.env.TIKTOK_CHROME_PROFILE_PATH;
  if (!chromePath) {
    info('TIKTOK_CHROME_PROFILE_PATH is not set — will use headless browser');
    info('TikTok may show a login wall without a saved session.');
    info('Set it to your Chrome profile path for best results.');
  } else {
    pass(`Chrome profile path: ${chromePath}`);
  }

  // 3. Import compiled module
  let TikTokBrowserSearchService;
  try {
    ({ TikTokBrowserSearchService } = require('./dist/core/utils/TikTokBrowserSearch'));
    pass('TikTokBrowserSearch module loaded from dist/');
  } catch (err) {
    fail(`Could not load TikTokBrowserSearch: ${err.message}`);
    info('Have you run `npx tsc` and `npx playwright install chromium`?');
    return null;
  }

  // 4. Run search
  const searchKeyword = keyword || 'cooking tips';
  info(`Searching TikTok for: "${searchKeyword}"`);
  info('Browser will open — this takes 10-20 seconds...');

  try {
    const searcher = new TikTokBrowserSearchService();
    const result = await searcher.searchAndSelect(searchKeyword, 5);

    if (result.selectedVideos.length === 0) {
      fail('No videos selected — TikTok may have shown a login wall');
      info('Set TIKTOK_CHROME_PROFILE_PATH to your logged-in Chrome profile');
      return null;
    }

    pass(`Total candidates found : ${result.totalCandidates}`);
    pass(`Videos selected by Claude: ${result.selectedVideos.length}`);
    pass(`Screenshot saved to: ${result.screenshotPath}`);

    result.selectedVideos.forEach((v, i) => {
      pass(`  [${i + 1}] @${v.author}: ${v.title.substring(0, 60)}...`);
      info(`       ${v.url}`);
    });

    return result;
  } catch (err) {
    fail(`Browser search failed: ${err.message}`);
    if (err.message.includes('Executable doesn\'t exist')) {
      info('Playwright browser not installed. Run: npx playwright install chromium');
    }
    return null;
  }
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

async function testAll(keyword) {
  const pipelineStartTime = Date.now();
  header('FULL PIPELINE — Modules 1 + 2 + 3 (parallel)');

  // ── Step 1: Browser search → up to 5 videos (sequential — single browser) ──
  const searchResult = await testModule1(keyword || 'cooking tips');
  if (!searchResult || searchResult.selectedVideos.length === 0) {
    fail('Pipeline aborted — Module 1 did not return any videos');
    return;
  }

  const searchPhaseMs = Date.now() - pipelineStartTime;

  const { VideoDownloaderService } = require('./dist/core/utils/VideoDownloader');
  const downloader = new VideoDownloaderService();

  // ── Steps 2 + 3: Download + VLM for all videos in parallel ─────────────────
  // Note: Module 1 has no duration info — some videos may be skipped here if
  // they exceed maxDurationSeconds (1200s). That is expected behaviour.
  // Logs from concurrent videos will be interleaved — this is expected.
  header(`PARALLEL PROCESSING — launching ${searchResult.selectedVideos.length} videos simultaneously`);
  const parallelPhaseStartTime = Date.now();

  const tasks = searchResult.selectedVideos.map((video, i) =>
    (async () => {
      info(`[V${i + 1}] Starting @${video.author} — ${video.url}`);

      const downloadResult = await testModule2(video.url);
      if (!downloadResult) {
        fail(`[V${i + 1}] Skipped — download failed (may exceed duration limit)`);
        return null;
      }

      const context = await testModule3(downloadResult.filePath);
      downloader.cleanup(downloadResult.filePath);
      pass(`[V${i + 1}] Local video file cleaned up`);

      if (!context) {
        fail(`[V${i + 1}] Skipped — VLM understanding failed`);
        return null;
      }

      return { video, downloadResult, context };
    })()
  );

  const settled = await Promise.allSettled(tasks);

  const processed = settled
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  settled
    .filter(r => r.status === 'rejected')
    .forEach(r => fail(`Unexpected error: ${r.reason?.message ?? r.reason}`));

  const parallelPhaseMs = Date.now() - parallelPhaseStartTime;
  const totalWallClockMs = Date.now() - pipelineStartTime;

  // ── Summary ─────────────────────────────────────────────────────────────────
  header(`PIPELINE COMPLETE — ${processed.length}/${searchResult.selectedVideos.length} videos processed`);
  pass(`Keyword: "${searchResult.searchQuery}"`);
  pass(`Search phase       : ${formatDuration(searchPhaseMs)}`);
  pass(`Parallel phase     : ${formatDuration(parallelPhaseMs)}`);
  pass(`Total wall-clock   : ${formatDuration(totalWallClockMs)}`);
  processed.forEach(({ video, context }, i) => {
    pass(`  [${i + 1}] @${video.author}`);
    pass(`      Topic      : ${context.mainTopic}`);
    pass(`      Mood       : ${context.mood}`);
    pass(`      Key moments: ${context.keyMoments.length}`);
    if (context.transcript) {
      pass(`      Transcript : "${context.transcript.substring(0, 100)}..."`);
    }
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const [,, command, arg] = process.argv;

  console.log('\nCrowdListen Video Pipeline Test\n');

  switch (command) {
    case 'module1':
      await testModule1(arg);
      break;
    case 'module2':
      await testModule2(arg);
      break;
    case 'module3':
      await testModule3(arg);
      break;
    case 'all':
      await testAll(arg);
      break;
    default:
      console.log('Usage:');
      console.log('  node test-video-pipeline.cjs module1              # Test browser search');
      console.log('  node test-video-pipeline.cjs module2              # Test video download');
      console.log('  node test-video-pipeline.cjs module3 /path/to.mp4 # Test video understanding');
      console.log('  node test-video-pipeline.cjs all                  # Full pipeline\n');
      console.log('Run module2 first, then pass its output path to module3.');
  }
}

main().catch(err => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
