#!/usr/bin/env node

/**
 * test-comment-intelligence.cjs
 *
 * Real integration runner for the TikTok comment-analysis stack.
 *
 * Usage:
 *
 *   npx tsc
 *   node test-comment-intelligence.cjs "cooking tips"
 *
 * Optional arguments:
 *
 *   node test-comment-intelligence.cjs "cooking tips" 3 80
 *   -> query="cooking tips", maxVideos=3, maxCommentsPerVideo=80
 *
 * This script exercises the full implemented path:
 *
 *   TikTok search -> comment retrieval -> video pipeline -> comment enrichment
 *   -> local clustering -> cross-video meta clustering -> insight output
 */

'use strict';

require('dotenv').config();

function pass(msg)  { console.log(`  ✓  ${msg}`); }
function fail(msg)  { console.error(`  ✗  ${msg}`); }
function info(msg)  { console.log(`  →  ${msg}`); }
function header(msg){ console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

async function main() {
  header('TIKTOK COMMENT INTELLIGENCE RUNNER');

  const query = process.argv[2] || 'cooking tips';
  const maxVideos = Math.min(Math.max(Number(process.argv[3] || 3), 1), 5);
  const maxCommentsPerVideo = Math.min(Math.max(Number(process.argv[4] || 80), 20), 150);
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    fail('ANTHROPIC_API_KEY is required for TikTok browser search');
    process.exit(1);
  }

  let TikTokAdapter;
  let TikTokCommentAnalysisService;

  try {
    ({ TikTokAdapter } = require('./dist/platforms/TikTokAdapter'));
    ({ TikTokCommentAnalysisService } = require('./dist/core/utils/TikTokCommentAnalysis'));
    pass('Loaded compiled TikTok analysis modules from dist/');
  } catch (error) {
    fail(`Could not load compiled modules: ${error.message}`);
    info('Run `npx tsc` before executing this script.');
    process.exit(1);
  }

  const adapter = new TikTokAdapter({
    platform: 'tiktok',
    credentials: {
      ms_token: process.env.TIKTOK_MS_TOKEN || '',
      proxy: process.env.TIKTOK_PROXY || '',
    },
  });

  try {
    await adapter.initialize();
    pass(`Initialized TikTok adapter for query "${query}"`);

    info(`Searching TikTok for up to ${maxVideos} videos...`);
    const posts = await adapter.searchContent(query, maxVideos);
    pass(`Search returned ${posts.length} candidate videos`);

    if (posts.length === 0) {
      fail('No TikTok posts found for the query');
      process.exit(1);
    }

    const analysisService = new TikTokCommentAnalysisService();
    info(`Running comment intelligence with up to ${maxCommentsPerVideo} comments per video...`);

    const result = await analysisService.analyzePosts(
      query,
      posts,
      async (postId, limit) => adapter.getContentComments(postId, limit),
      maxCommentsPerVideo
    );

    pass(`Analyzed ${result.videosAnalyzed} videos in ${formatDuration(Date.now() - startTime)}`);
    pass(`Cross-video meta clusters: ${result.metaClusters.length}`);
    pass(`Cross-video insights: ${result.insights.length}`);

    info('Per-video highlights:');
    for (const analysis of result.perVideo) {
      const topInsight = analysis.insights?.[0]?.title || analysis.summary || 'No insight generated';
      info(`  ${analysis.postId}: ${topInsight}`);
    }

    if (result.insights.length > 0) {
      info('Cross-video insights:');
      for (const insight of result.insights.slice(0, 5)) {
        info(`  ${insight.title}`);
      }
    }

    if (result.logs.length > 0) {
      info('Pipeline log preview:');
      for (const line of result.logs.slice(0, 10)) {
        info(`  ${line}`);
      }
    }
  } finally {
    await adapter.cleanup();
  }
}

main().catch(error => {
  fail(error.message);
  process.exit(1);
});
