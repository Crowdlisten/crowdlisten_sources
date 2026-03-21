/**
 * CrowdListen Shared Handlers
 * Pure functions that return plain objects — used by CLI and MCP server.
 */

import { UnifiedSocialMediaService } from './services/UnifiedSocialMediaService.js';
import { PlatformType } from './core/interfaces/SocialMediaPlatform.js';
import { TikTokUrlUtils } from './core/utils/TikTokUrlUtils.js';
import { InstagramUrlUtils } from './core/utils/InstagramUrlUtils.js';
import { CommentClusteringService } from './core/utils/CommentClustering.js';

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
  enableClustering?: boolean;
}

export interface ClusterArgs {
  platform: string;
  contentId: string;
  clusterCount?: number;
  includeExamples?: boolean;
  weightByEngagement?: boolean;
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

// ---------- Handlers ----------

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

export async function clusterOpinions(service: UnifiedSocialMediaService, args: ClusterArgs) {
  const { platform, contentId, clusterCount = 5, includeExamples = true, weightByEngagement = true } = args;

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

  const clusteringService = new CommentClusteringService();

  if (!clusteringService.isClusteringAvailable()) {
    return {
      platform,
      contentId,
      analysisType: 'opinion_clustering',
      totalComments: comments.length,
      clusterCount: 0,
      clusters: [],
      error: 'Semantic clustering requires OPENAI_API_KEY. Set it in your environment for local clustering, or get a CROWDLISTEN_API_KEY at crowdlisten.com/api for the full analysis suite.',
    };
  }

  const clusteringResult = await clusteringService.clusterComments(comments, 200);

  const clusters = clusteringResult.clusters.map((cluster) => {
    const totalLikes = cluster.comments.reduce((sum, c) => sum + (c.likes || 0), 0);
    return {
      clusterId: cluster.id,
      theme: cluster.theme,
      size: cluster.size,
      percentage: (cluster.size / comments.length * 100).toFixed(1),
      engagement: {
        totalLikes,
        avgLikes: cluster.size > 0 ? (totalLikes / cluster.size).toFixed(1) : '0',
      },
      sentiment: { label: cluster.sentiment },
      summary: cluster.summary,
      examples: includeExamples
        ? cluster.comments.slice(0, 3).map(c => ({
            text: c.text,
            likes: c.likes || 0,
            author: c.author?.username || 'anonymous',
          }))
        : [],
    };
  });

  return {
    platform,
    contentId,
    analysisType: 'opinion_clustering',
    totalComments: comments.length,
    clusterCount: clusters.length,
    clusters: clusters.sort((a, b) => b.size - a.size),
    overallAnalysis: clusteringResult.overallAnalysis,
    metadata: {
      weightByEngagement,
      includeExamples,
      clusteringMethod: 'openai_embeddings_kmeans',
      timestamp: new Date().toISOString(),
    },
  };
}

export async function analyzeContent(service: UnifiedSocialMediaService, args: AnalyzeArgs) {
  const { platform, contentId, analysisDepth = 'standard', enableClustering = true } = args;

  // Base analysis from the platform adapter
  const baseAnalysis = await service.analyzeContent(platform as PlatformType, contentId, enableClustering);

  const enhancedAnalysis: any = {
    ...baseAnalysis,
    verticalSliceAnalysis: {
      analysisDepth,
      enabledFeatures: { clustering: enableClustering },
    },
  };

  // Add opinion clustering if enabled
  if (enableClustering) {
    try {
      const clusterData = await clusterOpinions(service, {
        platform,
        contentId,
        clusterCount: analysisDepth === 'comprehensive' ? 8 : analysisDepth === 'deep' ? 6 : 5,
        includeExamples: true,
        weightByEngagement: true,
      });
      enhancedAnalysis.opinionClusters = clusterData.clusters;
      enhancedAnalysis.totalComments = clusterData.totalComments;
    } catch (clusterError) {
      console.error('Clustering failed:', clusterError);
      enhancedAnalysis.clusteringError = 'Opinion clustering failed';
    }
  }

  const completenessScore = [
    baseAnalysis ? 0.5 : 0,
    enableClustering && enhancedAnalysis.opinionClusters ? 0.5 : 0,
  ].reduce((sum, score) => sum + score, 0);

  enhancedAnalysis.analysisMetadata = {
    completenessScore: (completenessScore * 100).toFixed(1) + '%',
    analysisDepth,
    timestamp: new Date().toISOString(),
    verticalSliceApproach: true,
  };

  return enhancedAnalysis;
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
      'Free features: search, comments, basic analyze, cluster\n' +
      'Paid features: deep analysis, insights, research synthesis'
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
