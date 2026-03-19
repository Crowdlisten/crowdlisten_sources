#!/usr/bin/env node

/**
 * test-comment-analysis.cjs
 *
 * Lightweight verification script for the implemented comment-analysis stack.
 *
 * Run after compiling TypeScript:
 *
 *   npx tsc
 *   node test-comment-analysis.cjs
 *
 * This test uses deterministic fixtures so we can verify the full flow without
 * hitting external services:
 *
 *   VideoContext -> VideoAnchors -> EnrichedComments -> OpinionUnits
 *   -> LocalClusters -> MetaClusters -> Insights -> AskLayerIndex
 */

'use strict';

function pass(msg)  { console.log(`  ✓  ${msg}`); }
function fail(msg)  { console.error(`  ✗  ${msg}`); }
function info(msg)  { console.log(`  →  ${msg}`); }
function header(msg){ console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildVideoContexts() {
  const base = {
    mainTopic: 'Steak cooking tutorial',
    summary: 'Creator explains how to cook steak and says to leave it at room temperature for an hour.',
    keyEntities: {
      people: ['creator'],
      objects: ['steak', 'pan'],
      locations: ['kitchen'],
    },
    timeline: [
      { start: '0:00', end: '0:20', description: 'Creator introduces the steak prep process' },
      { start: '0:20', end: '0:45', description: 'Creator explains room temperature rest and pan prep' },
    ],
    mood: 'informative',
    implicitContext: ['Food safety concerns around leaving meat out too long'],
    searchKeywordRelevance: 'high',
    audioTrack: 'none',
    callsToAction: ['Comment below'],
    emotionalArc: 'steady',
    processingTimeMs: 1,
  };

  return {
    v1: {
      ...base,
      keyMoments: [{ timestamp: '0:42', description: 'Creator says steak can sit at room temperature for an hour' }],
      controversialMoments: [{ timestamp: '0:42', description: 'Creator says steak can sit at room temperature for an hour' }],
      transcript: 'Let your steak sit at room temperature for at least an hour.\nDo not move it once it hits the pan.',
      visualText: ['Room temp 1 hour', 'Do not move steak'],
      videoId: 'v1',
    },
    v2: {
      ...base,
      summary: 'Another creator gives similar steak advice and viewers debate the safety of leaving meat out.',
      keyMoments: [{ timestamp: '0:30', description: 'Creator repeats the one hour room temperature advice' }],
      controversialMoments: [{ timestamp: '0:30', description: 'Creator repeats the one hour room temperature advice' }],
      transcript: 'I always let steak sit out for an hour before cooking.\nThat is the only way I do it.',
      visualText: ['Let steak rest 1 hour', 'Best steak method'],
      videoId: 'v2',
    },
  };
}

function buildComments() {
  return {
    v1: [
      {
        id: 'c1',
        author: { id: 'u1', username: 'chefwatcher' },
        text: 'that part is unsafe',
        timestamp: new Date('2026-03-10T00:00:00Z'),
        likes: 12,
        replies: [
          {
            id: 'c1r1',
            author: { id: 'u2', username: 'replyguy' },
            text: 'same',
            timestamp: new Date('2026-03-10T01:00:00Z'),
            likes: 3,
            replies: [],
          },
        ],
      },
      {
        id: 'c2',
        author: { id: 'u3', username: 'panfan' },
        text: 'do not move it once it hits the pan is actually useful',
        timestamp: new Date('2026-03-10T02:00:00Z'),
        likes: 9,
        replies: [],
      },
      {
        id: 'c3',
        author: { id: 'u4', username: 'joker' },
        text: 'lol',
        timestamp: new Date('2026-03-10T03:00:00Z'),
        likes: 1,
        replies: [],
      },
    ],
    v2: [
      {
        id: 'd1',
        author: { id: 'u5', username: 'foodsafety' },
        text: 'leaving steak out that long is risky',
        timestamp: new Date('2026-03-11T00:00:00Z'),
        likes: 15,
        replies: [],
      },
      {
        id: 'd2',
        author: { id: 'u6', username: 'questioner' },
        text: 'what temp should the pan be?',
        timestamp: new Date('2026-03-11T01:00:00Z'),
        likes: 4,
        replies: [],
      },
    ],
  };
}

async function main() {
  header('COMMENT ANALYSIS SMOKE TEST');

  let CommentEnricherService;
  let CommentClusteringService;

  try {
    ({ CommentEnricherService } = require('./dist/core/utils/CommentEnricher'));
    ({ CommentClusteringService } = require('./dist/core/utils/CommentClustering'));
    pass('Loaded compiled comment-analysis modules from dist/');
  } catch (error) {
    fail(`Could not load compiled modules: ${error.message}`);
    info('Run `npx tsc` before executing this script.');
    process.exit(1);
  }

  const enricher = new CommentEnricherService();
  const clusterer = new CommentClusteringService();
  const videoContexts = buildVideoContexts();
  const comments = buildComments();

  info('Running enrichment for two TikTok-style fixture videos...');
  const enrichment1 = enricher.enrichComments('v1', comments.v1, videoContexts.v1);
  const enrichment2 = enricher.enrichComments('v2', comments.v2, videoContexts.v2);

  assert(enrichment1.videoAnchors.length > 0, 'Expected v1 to produce video anchors');
  assert(enrichment2.videoAnchors.length > 0, 'Expected v2 to produce video anchors');
  pass(`Built ${enrichment1.videoAnchors.length} anchors for v1 and ${enrichment2.videoAnchors.length} anchors for v2`);

  const reply = enrichment1.enrichedComments.find(comment => comment.commentId === 'c1r1');
  assert(reply, 'Expected reply comment c1r1 to be enriched');
  assert(reply.targetType === 'parent_comment', 'Expected short reply to target the parent comment');
  assert(reply.anchorRefs.length > 0, 'Expected reply to inherit or match an anchor');
  pass('Replies inherit parent-aware targeting and anchor grounding');

  const criticism = enrichment2.enrichedComments.find(comment => comment.commentId === 'd1');
  assert(criticism, 'Expected d1 to be enriched');
  assert(
    criticism.anchorRefs.some(ref => ref.anchorId.includes('moment_0_30') || ref.anchorId.includes('room_temperature_advice')),
    'Expected risky room-temperature comment to map to a specific moment/controversy anchor'
  );
  pass('Specific controversy/moment anchors are preferred over broad entity anchors');

  info('Running local clustering for each video...');
  const clustering1 = await clusterer.clusterSingleVideo({
    videoId: 'v1',
    comments: comments.v1,
    enrichment: enrichment1,
    videoContext: videoContexts.v1,
  });
  const clustering2 = await clusterer.clusterSingleVideo({
    videoId: 'v2',
    comments: comments.v2,
    enrichment: enrichment2,
    videoContext: videoContexts.v2,
  });

  assert((clustering1.localClusters || []).length > 0, 'Expected local clusters for v1');
  assert((clustering2.localClusters || []).length > 0, 'Expected local clusters for v2');
  assert((clustering1.insights || []).length > 0, 'Expected insights for v1');
  pass('Single-video clustering returns local clusters and insights');

  info('Running cross-video meta clustering...');
  const crossVideo = clusterer.buildCrossVideoClustering({
    videoIds: ['v1', 'v2'],
    clusterings: [
      { videoId: 'v1', clustering: clustering1, videoContext: videoContexts.v1 },
      { videoId: 'v2', clustering: clustering2, videoContext: videoContexts.v2 },
    ],
  });

  assert((crossVideo.metaClusters || []).length > 0, 'Expected at least one recurring meta cluster');
  assert((crossVideo.insights || []).length > 0, 'Expected cross-video insights');
  assert(crossVideo.askLayerIndex, 'Expected ask-layer metadata');
  assert(
    (crossVideo.metaClusters || []).some(cluster => cluster.label.toLowerCase().includes('recurring criticism')),
    'Expected recurring criticism cluster across the two videos'
  );
  pass('Cross-video clustering returns recurring themes, insights, and ask-layer metadata');

  info('Top local clusters:');
  for (const label of (clustering1.localClusters || []).slice(0, 3).map(cluster => cluster.label)) {
    info(`  v1 -> ${label}`);
  }
  for (const label of (clustering2.localClusters || []).slice(0, 3).map(cluster => cluster.label)) {
    info(`  v2 -> ${label}`);
  }

  info('Top meta clusters:');
  for (const label of (crossVideo.metaClusters || []).slice(0, 3).map(cluster => cluster.label)) {
    info(`  ${label}`);
  }

  pass('Comment analysis smoke test passed');
}

main().catch(error => {
  fail(error.message);
  process.exit(1);
});
