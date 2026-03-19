# Comment Analysis Implementation Guide

## Purpose

This document describes the current repo implementation of the TikTok comment analysis stack:

1. comment retrieval
2. video understanding
3. comment enrichment
4. local opinion clustering
5. cross-video meta clustering
6. insight and ask-layer output

It complements `docs/COMMENT_ENRICHMENT_AND_OPINION_CLUSTERING.md`, which remains the higher-level design document.

---

## Implemented File Map

### Core data contracts

- `src/core/interfaces/CommentAnalysis.ts`
  - canonical types for `VideoAnchor`, `EnrichedComment`, `OpinionUnit`, `LocalCluster`, `MetaCluster`, `Insight`, and `AskLayerIndex`
- `src/core/interfaces/SocialMediaPlatform.ts`
  - extends `ContentAnalysis` and `CommentClustering` so the new analysis objects can travel through MCP responses

### Shared utilities

- `src/core/utils/CommentAnalysisUtils.ts`
  - normalization
  - comment flattening
  - engagement scoring
  - stance / intent / noise heuristics
  - lexical similarity helpers
- `src/core/utils/CommentEmbeddingService.ts`
  - provides embedding vectors for clustering
  - uses OpenAI embeddings when `OPENAI_API_KEY` is available
  - falls back to deterministic local hash embeddings when remote embeddings are unavailable

### Core analysis services

- `src/core/utils/CommentEnricher.ts`
  - builds video anchors from `VideoContext`
  - grounds comments to anchors and parent-thread context
  - rewrites vague references when confidence is high enough
  - extracts opinion units
- `src/core/utils/CommentClustering.ts`
  - builds local clusters for one video
  - builds meta clusters across multiple videos
  - ranks clusters, produces insights, and builds the ask-layer index
- `src/core/utils/TikTokCommentAnalysis.ts`
  - orchestrates the TikTok-specific end-to-end flow
  - combines comment retrieval, video pipeline output, enrichment, local clustering, and cross-video clustering

### TikTok integration

- `src/platforms/TikTokAdapter.ts`
  - routes TikTok `analyzeContent()` through the richer comment+video analysis flow
- `src/core/base/BaseAdapter.ts`
  - mirrors clustering-derived objects back onto `ContentAnalysis` for generic platform adapters
- `src/index.ts`
  - exposes the new outputs through MCP tool handlers such as `analyze_content`, `cluster_opinions`, and `deep_platform_analysis`

---

## End-to-End Runtime Flow

### Single-video path

The single-video TikTok path is:

1. `TikTokAdapter.analyzeContent()`
2. fetch normalized comments for the TikTok video
3. `TikTokCommentAnalysisService.analyzeVideo()`
4. resolve a source URL when available
5. run the video pipeline:
   - download video
   - run `VideoUnderstandingService`
   - produce `VideoContext`
6. run `CommentEnricherService.enrichComments()`
7. run `CommentClusteringService.clusterSingleVideo()`
8. return a `ContentAnalysis` object containing:
   - classic summary fields
   - `clustering`
   - `enrichedComments`
   - `opinionUnits`
   - `videoAnchors`
   - `localClusters`
   - `insights`
   - `askLayerIndex`
   - `videoContext`
   - `analysisMetadata`

### Cross-video path

The cross-video TikTok path is:

1. `handleDeepPlatformAnalysis(platform='tiktok')`
2. search TikTok posts
3. `TikTokCommentAnalysisService.analyzePosts()`
4. run the single-video flow for each post
5. collect the resulting local clusters
6. `CommentClusteringService.buildCrossVideoClustering()`
7. return:
   - `perVideo`
   - `metaClusters`
   - `insights`
   - `askLayerIndex`
   - `overallAnalysis`

This preserves the intended hierarchy:

- ground comments inside one video first
- cluster within that video
- only then compare cluster-level themes across videos

---

## Object Lifecycle

### 1. `VideoContext` -> `VideoAnchor[]`

`CommentEnricherService.buildVideoAnchors()` converts the video pipeline output into explicit anchors.

Current anchor coverage:

- `global_video`
- `controversy`
- `moment`
- `timeline_segment`
- `entity`
- `spoken_quote`
- `visual_text`
- `cta`

Implementation rules:

- a global video anchor is always created
- controversial moments are seeded before generic key moments
- transcript anchors are capped to the first 12 non-trivial lines
- visual text anchors are capped to 15 items
- CTA anchors are capped to 8 items
- when broad anchors and specific anchors are close in confidence, the implementation prefers the more specific anchor type

Why this matters:

- comment grounding stays inspectable
- local clustering gets a strong aboutness signal
- vague references such as "that part" can resolve to a moment-level anchor

### 2. Raw `Comment` -> `EnrichedComment`

Each normalized comment or reply is enriched with:

- thread position:
  - `parentCommentId`
  - `threadRootId`
  - `depth`
- target inference:
  - `video`
  - `parent_comment`
  - `thread`
  - `unclear`
- anchor references
- grounding confidence
- ambiguity flags
- resolved text
- comment intent
- engagement score

Important behavior:

- replies can inherit parent anchors when they do not contain enough standalone grounding evidence
- rewrites are only applied when grounding confidence is reasonably high
- low-confidence comments keep the raw text

### 3. `EnrichedComment` -> `OpinionUnit[]`

`CommentEnricherService.extractOpinionUnits()` splits one comment into up to three segments.

Each opinion unit stores:

- normalized text span
- aboutness:
  - `aspectKey`
  - `aspectLabel`
  - `anchorIds`
- stance
- intent
- evidence source
- semantic density
- noise flags
- author id
- engagement score

This is the core analysis atom. Clustering operates on opinion units, not raw comments.

### 4. `OpinionUnit[]` -> `LocalCluster[]`

`CommentClusteringService.clusterSingleVideo()` runs two passes:

1. coarse bucketing by `aboutness.aspectKey`
2. fine clustering inside each bucket by:
   - cluster-type compatibility
   - stance compatibility
   - embedding similarity
   - lexical similarity

Current local cluster types:

- `opinion`
- `question`
- `humor`
- `reaction_only`
- `spam`
- `mixed_noise`

Each local cluster includes:

- dominant stance and stance distribution
- size
- unique authors
- total engagement
- reply depth score
- average grounding confidence
- average semantic density
- importance score
- representative comment ids
- user-facing label and summary

### 5. `LocalCluster[]` -> `MetaCluster[]`

`CommentClusteringService.buildCrossVideoClustering()` compares local clusters across videos.

Important rule:

- the cross-video layer only compares local clusters
- it does not compare raw comments directly

Meta clustering currently uses:

- stance compatibility
- embedding similarity across cluster signatures
- lexical similarity across:
  - primary aspect label
  - cluster label
  - cluster summary
- one cluster per source video inside one accumulator

Meta clusters are filtered to recurring themes only:

- `coverage.videos > 1`

Each meta cluster includes:

- canonical theme
- canonical aspect key
- canonical stance
- source local cluster ids
- supporting video ids
- coverage metrics
- recurrence score
- controversy score
- confidence
- importance score
- summary

### 6. `LocalCluster` / `MetaCluster` -> `Insight[]`

Insights are a product-facing layer.

Single-video insights:

- come from the top local clusters
- skip spam
- usually suppress tiny low-signal clusters unless they are clearly meaningful

Cross-video insights:

- come from the ranked meta clusters
- summarize recurring themes across the analyzed videos

Each insight includes:

- title
- description
- why it matters
- supporting videos
- representative supporting comments
- supporting anchors
- importance score
- confidence

### 7. Clusters -> `AskLayerIndex`

The ask-layer index is a compact description of what dimensions can be queried or filtered.

Current fields:

- default scope
- default grouping
- available scopes
- available stances
- available intents
- available cluster types
- available aspect keys

This is meant to support future CLI / analyst interactions such as:

- auto mode
- selected-dimension browsing
- ask-style querying

---

## Engagement Weighting

The current implementation does not duplicate comments by likes. It uses a continuous engagement score.

### Comment-level score

`calculateEngagementScore()` uses:

- likes
- reply count
- shares
- views
- any existing upstream engagement score

Each component is compressed with `log1p()` to avoid extreme comments dominating the system.

### Where engagement is used

- selecting the top comments in generic clustering fallback
- sorting opinion units before fine clustering
- choosing representative comments
- ranking local clusters
- ranking meta clusters

### Where engagement is not used

- deciding what a comment is about
- deciding whether a comment is noise
- deciding the stance of a comment

That separation is intentional:

- semantics are decided by grounding and text heuristics
- importance is decided partly by engagement

---

## Handling Noise

Noise handling is explicit and separate from engagement weighting.

Current low-signal detection includes:

- `emoji_only`
- `ultra_short`
- `reaction_only`
- `spam`

Why this is separate from engagement:

- low-like comments are not always low-value
- high-like comments can still be low-signal reactions
- a large number of low-like reactions can still form a meaningful mass-reaction cluster

Current policy:

- keep comments in the pipeline when possible
- mark low-signal behavior with noise flags
- let cluster type and ranking decide how visible the result should be

---

## Current MCP Outputs

### `analyze_content`

For TikTok, this now returns a `ContentAnalysis` that can include:

- `clustering`
- `enrichedComments`
- `opinionUnits`
- `videoAnchors`
- `localClusters`
- `insights`
- `askLayerIndex`
- `videoContext`
- `analysisMetadata`

### `cluster_opinions`

This returns:

- local clusters for single content
- meta clusters when available
- insights
- ask-layer index
- metadata describing the request

### `deep_platform_analysis` for TikTok

This returns:

- per-video analyses
- cross-video meta clusters
- cross-video insights
- ask-layer index
- overall analysis
- logs

---

## Failure Handling

### Video pipeline unavailable

If the video pipeline fails:

- comment enrichment still runs
- a global fallback video anchor is used
- the system still produces local clusters

This means the comment-analysis stack degrades to comment-only mode instead of failing completely.

### Cross-video partial failure

If one TikTok post fails during multi-video analysis:

- other videos still complete
- only successfully clustered videos are included in the cross-video layer

---

## Known Heuristic Limits

The current implementation now uses embeddings for local and cross-video clustering, but it still mixes deterministic heuristics with model-driven similarity.

Current limitations:

- grounding is heuristic rather than model-based
- local clustering still uses lexical overlap alongside embeddings for stability
- meta clustering may still under-merge semantically similar but lexically distant clusters when the hash fallback is active
- ask-layer output is an index, not a full query engine
- noise detection is conservative and not yet platform-specific

These are acceptable for the current repo stage because the full stack is now functional and inspectable end to end.

---

## Suggested Next Improvements

Priority order:

1. replace lexical similarity in fine clustering with embeddings
2. add model-assisted comment rewrite / coreference repair for ambiguous comments
3. strengthen meta-cluster candidate generation with aspect and stance priors
4. add evaluator scripts for:
   - grounding quality
   - local cluster purity
   - meta cluster recurrence quality
5. expose a real ask-layer retrieval path on top of `AskLayerIndex`, `Insight`, and cluster objects

---

## Verification Commands

Recommended verification after changes:

```bash
npx tsc --pretty false --noEmit
npx tsc --pretty false
node --check test-video-pipeline.cjs
npm run verify:comment-analysis
```

The repository now includes `test-comment-analysis.cjs`, which uses deterministic fixtures to verify:

- parent-aware reply grounding
- anchor construction from `VideoContext`
- single-video local clustering
- cross-video meta clustering
- insight and ask-layer output

For a real TikTok integration run, use `test-comment-intelligence.cjs`:

- searches TikTok videos for a query
- fetches comments for each selected video
- runs the full enrichment and clustering stack
- prints local and cross-video insights

---

## Bottom Line

The repo now implements the intended hierarchy from the design document:

- comments are preserved
- video context is converted into anchors
- comments are enriched before clustering
- clustering happens locally before cross-video
- insights and ask-layer metadata are produced as first-class outputs

This is now a real working pipeline, not only a design sketch.
