/**
 * CrowdListen Shared Handlers
 * Pure functions that return plain objects — used by CLI and MCP server.
 *
 * Retrieval handlers (free, local): search, comments, trending, user content
 * Analysis handlers (paid, API): analyze, cluster, enrich, deep_analyze, insights, research
 */

import { UnifiedSocialMediaService } from './services/UnifiedSocialMediaService.js';
import { PlatformType } from './core/interfaces/SocialMediaPlatform.js';
import { TikTokUrlUtils } from './core/utils/TikTokUrlUtils.js';
import { InstagramUrlUtils } from './core/utils/InstagramUrlUtils.js';

// ---------- Types ----------

export interface SearchArgs {
  platform: string;
  query: string;
  limit?: number;
}

export interface CommentsArgs {
  platform: string;
  contentId: string;
  limit?: number;
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
  const { platform, query, limit = 10 } = args;

  if (platform === 'all') {
    const allResults = await service.getCombinedSearchResults(query, limit);
    return { platform: 'combined', query, count: allResults.length, posts: allResults };
  }

  const posts = await service.searchContent(platform as PlatformType, query, limit);
  return { platform, query, count: posts.length, posts };
}

export async function getContentComments(service: UnifiedSocialMediaService, args: CommentsArgs) {
  const { platform, contentId, limit = 20 } = args;

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

export async function healthCheck(service: UnifiedSocialMediaService) {
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
      'Free features (no key): search, comments, trending, user content\n' +
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

  // All analysis now goes through the API
  return agentPost('/api/v1/analyze', {
    platform,
    content_id: contentId,
    depth: analysisDepth,
  });
}

export async function clusterOpinions(service: UnifiedSocialMediaService, args: ClusterArgs) {
  const { platform, contentId, clusterCount = 5 } = args;

  // Fetch comments locally (free), then send to API for clustering (paid)
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

  // Send comments to the clustering API
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

  // Fetch comments locally (free), send to API for enrichment (paid)
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
