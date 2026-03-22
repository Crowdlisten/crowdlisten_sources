/**
 * CrowdListen Shared Handlers
 * Pure functions that return plain objects — used by CLI and MCP server.
 *
 * Retrieval handlers (free, local): search, comments, trending, user content, vision
 * Analysis handlers (paid, API): analyze, cluster, enrich, deep_analyze, insights, research
 */

import { UnifiedSocialMediaService } from './services/UnifiedSocialMediaService.js';
import { PlatformType } from './core/interfaces/SocialMediaPlatform.js';
import { TikTokUrlUtils } from './core/utils/TikTokUrlUtils.js';
import { InstagramUrlUtils } from './core/utils/InstagramUrlUtils.js';
import { VisionExtractor } from './vision/VisionExtractor.js';
import { HealthMonitor } from './core/health/HealthMonitor.js';

// ---------- Types ----------

export interface SearchArgs {
  platform: string;
  query: string;
  limit?: number;
  useVision?: boolean;
}

export interface CommentsArgs {
  platform: string;
  contentId: string;
  limit?: number;
  useVision?: boolean;
}

export interface AnalyzeArgs {
  platform: string;
  contentId: string;
  analysisDepth?: 'surface' | 'standard' | 'deep' | 'comprehensive';
}

export interface ClusterArgs {
  platform: string;
  contentId: string;
  clusterCount?: number;
  includeExamples?: boolean;
  weightByEngagement?: boolean;
}

export interface EnrichArgs {
  platform: string;
  contentId: string;
  question?: string;
}

export interface TrendingArgs {
  platform: string;
  limit?: number;
}

export interface UserContentArgs {
  platform: string;
  userId: string;
  limit?: number;
}

export interface ExtractUrlArgs {
  url: string;
  mode?: 'posts' | 'comments' | 'raw';
  limit?: number;
}

// ---------- Vision Extraction Handler ----------

export async function extractWithVision(args: ExtractUrlArgs) {
  const { url, mode = 'posts', limit = 10 } = args;
  const vision = new VisionExtractor();

  if (!vision.isAvailable()) {
    throw new Error(
      'Vision extraction requires at least one LLM API key.\n' +
      'Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.'
    );
  }

  const result = await vision.extract(url, { mode, limit });
  return {
    url,
    mode,
    provider: result.provider,
    extractionMethod: 'vision',
    ...(result.posts && { count: result.posts.length, posts: result.posts }),
    ...(result.comments && { count: result.comments.length, comments: result.comments }),
    ...(result.raw && { raw: result.raw }),
  };
}

// ---------- Free Retrieval Handlers ----------

export async function getTrendingContent(service: UnifiedSocialMediaService, args: TrendingArgs) {
  const { platform, limit = 10 } = args;

  if (platform === 'all') {
    const allTrending = await service.getCombinedTrendingContent(limit);
    return { platform: 'combined', count: allTrending.length, posts: allTrending };
  }

  const posts = await service.getTrendingContent(platform as PlatformType, limit);
  return { platform, count: posts.length, posts };
}

export async function getUserContent(service: UnifiedSocialMediaService, args: UserContentArgs) {
  const { platform, userId, limit = 10 } = args;

  const posts = await service.getUserContent(platform as PlatformType, userId, limit);
  return { platform, userId, count: posts.length, posts };
}

export async function searchContent(service: UnifiedSocialMediaService, args: SearchArgs) {
  const { platform, query, limit = 10, useVision } = args;

  // Vision mode override
  if (useVision) {
    return extractWithVision({ url: query, mode: 'posts', limit });
  }

  if (platform === 'all') {
    const allResults = await service.getCombinedSearchResults(query, limit);
    return { platform: 'combined', query, count: allResults.length, posts: allResults };
  }

  const posts = await service.searchContent(platform as PlatformType, query, limit);
  return { platform, query, count: posts.length, posts };
}

export async function getContentComments(service: UnifiedSocialMediaService, args: CommentsArgs) {
  const { platform, contentId, limit = 20, useVision } = args;

  // Vision mode override
  if (useVision) {
    return extractWithVision({ url: contentId, mode: 'comments', limit });
  }

  let normalizedContentId = contentId;
  if (platform === 'tiktok' && typeof contentId === 'string' && TikTokUrlUtils.isTikTokUrl(contentId)) {
    const resolvedUrl = await TikTokUrlUtils.resolveUrl(contentId);
    const extractedId = TikTokUrlUtils.extractVideoId(resolvedUrl);
    if (!extractedId) {
      throw new Error(`Unable to extract TikTok video ID from URL: ${contentId}`);
    }
    normalizedContentId = extractedId;
  } else if (platform === 'instagram' && typeof contentId === 'string' && InstagramUrlUtils.isInstagramUrl(contentId)) {
    const resolvedUrl = await InstagramUrlUtils.resolveUrl(contentId);
    const extractedId = InstagramUrlUtils.extractShortcode(resolvedUrl);
    if (!extractedId) {
      throw new Error(`Unable to extract Instagram shortcode from URL: ${contentId}`);
    }
    normalizedContentId = extractedId;
  }

  const comments = await service.getContentComments(platform as PlatformType, normalizedContentId, limit);
  return { platform, contentId: normalizedContentId, count: comments.length, comments };
}

export function getPlatformStatus(service: UnifiedSocialMediaService) {
  const platforms = service.getAvailablePlatforms();
  return { availablePlatforms: platforms, totalPlatforms: Object.keys(platforms).length };
}

export async function healthCheck(
  service: UnifiedSocialMediaService,
  monitor?: HealthMonitor
) {
  // If the monitor has recent data (< 5 minutes), return the cached summary
  // instead of running a live probe. This is faster and non-blocking.
  if (monitor && monitor.hasRecentData(5 * 60 * 1000)) {
    const summary = monitor.getSummary();
    const healthStatus: Record<string, unknown> = {};

    for (const [platform, state] of Object.entries(summary.platforms)) {
      healthStatus[platform] = {
        status: state.status,
        responseTimeMs: state.responseTimeMs,
        lastChecked: state.lastChecked.toISOString(),
        lastHealthy: state.lastHealthy?.toISOString() ?? null,
        consecutiveFailures: state.consecutiveFailures,
        ...(state.error && { error: state.error }),
      };
    }

    return {
      overall: summary.overall,
      healthStatus,
      source: 'cached',
      lastFullCheck: summary.lastFullCheck?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  // No cached data available -- trigger a fresh check via the monitor if
  // present, otherwise fall back to the service's built-in health check.
  if (monitor) {
    const summary = await monitor.checkAll();
    const healthStatus: Record<string, unknown> = {};

    for (const [platform, state] of Object.entries(summary.platforms)) {
      healthStatus[platform] = {
        status: state.status,
        responseTimeMs: state.responseTimeMs,
        lastChecked: state.lastChecked.toISOString(),
        lastHealthy: state.lastHealthy?.toISOString() ?? null,
        consecutiveFailures: state.consecutiveFailures,
        ...(state.error && { error: state.error }),
      };
    }

    return {
      overall: summary.overall,
      healthStatus,
      source: 'live',
      lastFullCheck: summary.lastFullCheck?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  // Fallback: no monitor (e.g. CLI usage) -- use legacy service.healthCheck()
  const health = await service.healthCheck();
  return { healthStatus: health, timestamp: new Date().toISOString() };
}

// ---------- Paid Agent API Proxy ----------

const AGENT_API_BASE = process.env.CROWDLISTEN_AGENT_URL || 'https://agent.crowdlisten.com';

function requireApiKey(): string {
  const apiKey = process.env.CROWDLISTEN_API_KEY;
  if (!apiKey) {
    throw new Error(
      'CROWDLISTEN_API_KEY required for this feature.\n' +
      'Get one at https://crowdlisten.com/api\n\n' +
      'Free features (no key): search, comments, trending, user content, vision\n' +
      'Paid features (key required): analyze, cluster, enrich, deep analysis, insights, research'
    );
  }
  return apiKey;
}

async function agentPost(path: string, body: Record<string, unknown>): Promise<any> {
  const apiKey = requireApiKey();
  const url = `${AGENT_API_BASE}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Agent API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// ---------- Analysis Handlers (all delegate to API) ----------

export async function analyzeContent(service: UnifiedSocialMediaService, args: AnalyzeArgs) {
  const { platform, contentId, analysisDepth = 'standard' } = args;

  return agentPost('/api/v1/analyze', {
    platform,
    content_id: contentId,
    depth: analysisDepth,
  });
}

export async function clusterOpinions(service: UnifiedSocialMediaService, args: ClusterArgs) {
  const { platform, contentId, clusterCount = 5 } = args;

  const comments = await service.getContentComments(platform as PlatformType, contentId, 500);

  if (comments.length === 0) {
    return {
      platform,
      contentId,
      analysisType: 'opinion_clustering',
      totalComments: 0,
      clusterCount: 0,
      clusters: [],
      message: 'No comments found for clustering',
    };
  }

  const commentPayload = comments.map(c => ({
    text: c.text,
    author: c.author?.username || 'anonymous',
    likes: c.likes || 0,
    replies: c.replies?.length || 0,
  }));

  return agentPost('/api/v1/cluster', {
    comments: commentPayload,
    question: `Analyze comments for ${platform} content ${contentId}`,
    max_comments: Math.min(comments.length, 150),
  });
}

export async function enrichContent(service: UnifiedSocialMediaService, args: EnrichArgs) {
  const { platform, contentId, question = '' } = args;

  const comments = await service.getContentComments(platform as PlatformType, contentId, 200);

  if (comments.length === 0) {
    return {
      platform,
      contentId,
      totalComments: 0,
      enrichedComments: [],
      message: 'No comments found for enrichment',
    };
  }

  const commentPayload = comments.map(c => ({
    text: c.text,
    author: c.author?.username || 'anonymous',
    likes: c.likes || 0,
    replies: c.replies?.length || 0,
  }));

  return agentPost('/api/v1/enrich', {
    comments: commentPayload,
    question: question || `Enrich comments for ${platform} content ${contentId}`,
  });
}

// ---------- Deep Analysis Handlers (always API) ----------

export interface DeepAnalyzeArgs {
  platform: string;
  contentId: string;
  analysisDepth: 'deep' | 'comprehensive';
}

export interface InsightsArgs {
  platform: string;
  contentId: string;
  categories?: string[];
}

export interface ResearchArgs {
  query: string;
  platforms?: string[];
  depth?: 'quick' | 'standard' | 'deep';
}

export async function deepAnalyze(args: DeepAnalyzeArgs) {
  return agentPost('/api/v1/analyze', {
    platform: args.platform,
    content_id: args.contentId,
    depth: args.analysisDepth,
  });
}

export async function extractInsights(args: InsightsArgs) {
  return agentPost('/api/v1/insights', {
    platform: args.platform,
    content_id: args.contentId,
    categories: args.categories,
  });
}

export async function researchSynthesis(args: ResearchArgs) {
  return agentPost('/api/v1/research', {
    query: args.query,
    platforms: args.platforms || ['reddit', 'twitter', 'youtube'],
    depth: args.depth || 'standard',
  });
}
