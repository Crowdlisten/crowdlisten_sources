#!/usr/bin/env node

/**
 * test-comment-intelligence-replay.cjs
 *
 * Deterministic-style inspection runner for specific TikTok videos. Unlike the
 * search-based live report, this script analyzes exactly the URLs / video IDs
 * you pass in, which makes manual before/after comparisons much more stable.
 *
 * Usage:
 *   npx tsc
 *   node test-comment-intelligence-replay.cjs comment-intelligence-replay.txt <video-or-url> <video-or-url> [...]
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  formatDuration,
  formatList,
  section,
  subSection,
  renderVideoContext,
  renderAnchors,
  renderEnrichedComments,
  renderOpinionUnits,
  renderLocalClusters,
  renderInsights,
  renderMetaClusters,
  renderAskLayerIndex,
} = require('./scripts/comment-analysis-report-utils.cjs');

function pass(msg)  { console.log(`  ✓  ${msg}`); }
function fail(msg)  { console.error(`  ✗  ${msg}`); }
function info(msg)  { console.log(`  →  ${msg}`); }
function header(msg){ console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }

async function main() {
  header('TIKTOK COMMENT INTELLIGENCE REPLAY');

  const outputPath = path.resolve(process.argv[2] || 'comment-intelligence-replay.txt');
  const targets = process.argv.slice(3).filter(Boolean);
  const startTime = Date.now();

  if (targets.length === 0) {
    fail('Pass at least one TikTok URL or video ID.');
    info('Example: node test-comment-intelligence-replay.cjs replay.txt <video-url-1> <video-url-2>');
    process.exit(1);
  }

  let TikTokAdapter;
  let CommentClusteringService;

  try {
    ({ TikTokAdapter } = require('./dist/platforms/TikTokAdapter'));
    ({ CommentClusteringService } = require('./dist/core/utils/CommentClustering'));
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
    info(`Analyzing ${targets.length} fixed TikTok target(s)...`);

    const settled = await Promise.allSettled(
      targets.map(async target => ({
        target,
        analysis: await adapter.analyzeContent(target, true),
      }))
    );

    const perVideo = [];
    const logs = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        perVideo.push(result.value.analysis);
        logs.push(`Replay analyzed ${result.value.target} -> ${result.value.analysis.postId}`);
      } else {
        logs.push(`Replay failed for one target: ${result.reason}`);
      }
    }

    const clusterings = perVideo
      .map(analysis => ({
        videoId: analysis.postId,
        clustering: analysis.clustering,
        videoContext: analysis.videoContext,
      }))
      .filter(item => Boolean(item.clustering));

    const clusteringService = new CommentClusteringService();
    const crossVideo = await clusteringService.buildCrossVideoClustering({
      videoIds: perVideo.map(analysis => analysis.postId),
      clusterings,
    });

    logs.push(...(crossVideo.logs || []));

    const lines = [];
    lines.push(section('RUN SUMMARY'));
    lines.push(`Generated at: ${new Date().toISOString()}`);
    lines.push(`Replay targets: ${targets.length}`);
    lines.push(`Targets: ${formatList(targets)}`);
    lines.push(`Videos analyzed: ${perVideo.length}`);
    lines.push(`Total runtime: ${formatDuration(Date.now() - startTime)}`);
    lines.push(`Cross-video meta clusters: ${(crossVideo.metaClusters || []).length}`);
    lines.push(`Cross-video insights: ${(crossVideo.insights || []).length}`);

    const perVideoById = new Map(perVideo.map(item => [item.postId, item]));

    for (const analysis of perVideo) {
      const anchorsById = new Map((analysis.videoAnchors || []).map(anchor => [anchor.anchorId, anchor]));
      const enrichedByCommentId = new Map((analysis.enrichedComments || []).map(comment => [comment.commentId, comment]));
      const opinionUnitsById = new Map((analysis.opinionUnits || []).map(unit => [unit.opinionUnitId, unit]));

      lines.push(section(`VIDEO ${analysis.postId}`));
      lines.push(`Summary: ${analysis.summary || '(none)'}`);
      lines.push(`Themes: ${formatList(analysis.themes || [])}`);
      lines.push(`Sentiment: ${analysis.sentiment || '(none)'}`);
      lines.push(`Comment count: ${analysis.commentCount}`);

      lines.push(subSection('VIDEO CONTEXT'));
      lines.push(renderVideoContext(analysis.videoContext));

      lines.push(subSection('VIDEO ANCHORS'));
      lines.push(renderAnchors(analysis.videoAnchors || []));

      lines.push(subSection('ENRICHED COMMENTS'));
      lines.push(renderEnrichedComments(analysis.enrichedComments || [], anchorsById));

      lines.push(subSection('OPINION UNITS'));
      lines.push(renderOpinionUnits(analysis.opinionUnits || [], enrichedByCommentId));

      lines.push(subSection('LOCAL CLUSTERS'));
      lines.push(renderLocalClusters(analysis.localClusters || [], opinionUnitsById, enrichedByCommentId, anchorsById));

      lines.push(subSection('VIDEO INSIGHTS'));
      lines.push(renderInsights(analysis.insights || []));

      lines.push(subSection('VIDEO LOGS'));
      lines.push((analysis.analysisMetadata?.logs || analysis.clustering?.logs || []).join('\n') || '(none)');
    }

    lines.push(section('CROSS-VIDEO META CLUSTERS'));
    lines.push(renderMetaClusters(crossVideo.metaClusters || [], perVideoById));

    lines.push(section('CROSS-VIDEO INSIGHTS'));
    lines.push(renderInsights(crossVideo.insights || []));

    lines.push(section('ASK LAYER INDEX'));
    lines.push(renderAskLayerIndex(crossVideo.askLayerIndex));

    lines.push(section('PIPELINE LOGS'));
    lines.push(logs.join('\n') || '(none)');

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

    pass(`Replay report saved to ${outputPath}`);
    pass(`Analyzed ${perVideo.length} fixed videos in ${formatDuration(Date.now() - startTime)}`);
  } finally {
    await adapter.cleanup();
  }
}

main().catch(error => {
  fail(error.message);
  process.exit(1);
});
