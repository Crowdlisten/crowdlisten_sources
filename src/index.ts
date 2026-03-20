#!/usr/bin/env node

/**
 * CrowdListen MCP Server
 * Social media content retrieval and analysis across multiple platforms
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

import { UnifiedSocialMediaService, UnifiedServiceConfig } from './services/UnifiedSocialMediaService.js';
import { PlatformType } from './core/interfaces/SocialMediaPlatform.js';
import { TikTokUrlUtils } from './core/utils/TikTokUrlUtils.js';
import { CommentClusteringService } from './core/utils/CommentClustering.js';

// Load environment variables
dotenv.config();

// Create unified service configuration
const serviceConfig: UnifiedServiceConfig = {
  platforms: {},
  globalOptions: {
    timeout: 30000,
    retries: 3,
    fallbackStrategy: 'continue'
  }
};

// Configure platforms based on available credentials
if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_KEY_SECRET && 
    process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_TOKEN_SECRET) {
  serviceConfig.platforms.twitter = {
    platform: 'twitter',
    credentials: {
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    }
  };
}

// TikTok and Instagram adapters exist but are not actively initialized
// (TikTok analysis is handled by the agent backend; Instagram lacks comment extraction)

// Reddit configuration (no credentials needed for public content)
serviceConfig.platforms.reddit = {
  platform: 'reddit',
  credentials: {}
};

// YouTube configuration (requires API key)
if (process.env.YOUTUBE_API_KEY) {
  serviceConfig.platforms.youtube = {
    platform: 'youtube',
    credentials: {
      apiKey: process.env.YOUTUBE_API_KEY
    }
  };
}

// Moltbook configuration (requires API key)
if (process.env.MOLTBOOK_API_KEY) {
  serviceConfig.platforms.moltbook = {
    platform: 'moltbook',
    credentials: {
      apiKey: process.env.MOLTBOOK_API_KEY
    }
  };
}

// Initialize the unified service
const unifiedService = new UnifiedSocialMediaService(serviceConfig);

// Create MCP server
const server = new Server(
  {
    name: 'crowdlisten-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  {
    name: 'get_trending_content',
    description: 'Get trending content from a specific platform or all platforms',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook', 'all'],
          description: 'Platform to get trending content from, or "all" for all platforms'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of posts to retrieve'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'get_user_content',
    description: 'Get content from a specific user on a platform',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook'],
          description: 'Platform to get user content from'
        },
        userId: {
          type: 'string',
          description: 'User ID or username to get content from'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of posts to retrieve'
        }
      },
      required: ['platform', 'userId']
    }
  },
  {
    name: 'search_content',
    description: 'Search for content across platforms',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook', 'all'],
          description: 'Platform to search on, or "all" for all platforms'
        },
        query: {
          type: 'string',
          description: 'Search query (keywords, hashtags, etc.)'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of posts to retrieve'
        }
      },
      required: ['platform', 'query']
    }
  },
  {
    name: 'get_content_comments',
    description: 'Get comments for a specific piece of content',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook'],
          description: 'Platform where the content is located'
        },
        contentId: {
          type: 'string',
          description: 'ID of the content to get comments for'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of comments to retrieve'
        }
      },
      required: ['platform', 'contentId']
    }
  },
  {
    name: 'analyze_content',
    description: 'Analyze content with optional opinion clustering using embeddings',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook'],
          description: 'Platform where the content is located'
        },
        contentId: {
          type: 'string',
          description: 'ID of the content to analyze'
        },
        analysisDepth: {
          type: 'string',
          enum: ['surface', 'standard', 'deep', 'comprehensive'],
          default: 'standard',
          description: 'Depth of analysis to perform'
        },
        enableClustering: {
          type: 'boolean',
          default: true,
          description: 'Enable semantic opinion clustering using embeddings'
        }
      },
      required: ['platform', 'contentId']
    }
  },
  {
    name: 'get_platform_status',
    description: 'Get status and capabilities of available platforms',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'health_check',
    description: 'Check the health status of all platforms',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'cluster_opinions',
    description: 'Semantic clustering of opinions using embeddings to identify opinion themes and patterns',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook'],
          description: 'Platform where the content is located'
        },
        contentId: {
          type: 'string',
          description: 'ID of the content to analyze comments from'
        },
        clusterCount: {
          type: 'number',
          default: 5,
          minimum: 2,
          maximum: 15,
          description: 'Number of opinion clusters to generate'
        },
        includeExamples: {
          type: 'boolean',
          default: true,
          description: 'Include example comments for each cluster'
        },
        weightByEngagement: {
          type: 'boolean',
          default: true,
          description: 'Weight clusters by comment engagement (likes, replies)'
        }
      },
      required: ['platform', 'contentId']
    }
  },
];

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'get_trending_content':
        return await handleGetTrendingContent(args);
      
      case 'get_user_content':
        return await handleGetUserContent(args);
      
      case 'search_content':
        return await handleSearchContent(args);
      
      case 'get_content_comments':
        return await handleGetContentComments(args);
      
      case 'analyze_content':
        return await handleAnalyzeContent(args);
      
      case 'get_platform_status':
        return await handleGetPlatformStatus();
      
      case 'health_check':
        return await handleHealthCheck();
      
      case 'cluster_opinions':
        return await handleClusterOpinions(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
    }
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);
    
    if (error instanceof McpError) {
      throw error;
    }
    
    // Convert other errors to MCP errors
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error.message || 'Unknown error'}`
    );
  }
});

// Tool handlers
async function handleGetTrendingContent(args: any) {
  const { platform, limit = 10 } = args;
  
  if (platform === 'all') {
    const allTrending = await unifiedService.getCombinedTrendingContent(limit);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          platform: 'combined',
          count: allTrending.length,
          posts: allTrending
        }, null, 2)
      }]
    };
  } else {
    const posts = await unifiedService.getTrendingContent(platform as PlatformType, limit);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          platform,
          count: posts.length,
          posts
        }, null, 2)
      }]
    };
  }
}

async function handleGetUserContent(args: any) {
  const { platform, userId, limit = 10 } = args;
  
  const posts = await unifiedService.getUserContent(platform as PlatformType, userId, limit);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        platform,
        userId,
        count: posts.length,
        posts
      }, null, 2)
    }]
  };
}

async function handleSearchContent(args: any) {
  const { platform, query, limit = 10 } = args;
  
  if (platform === 'all') {
    const allResults = await unifiedService.getCombinedSearchResults(query, limit);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          platform: 'combined',
          query,
          count: allResults.length,
          posts: allResults
        }, null, 2)
      }]
    };
  } else {
    const posts = await unifiedService.searchContent(platform as PlatformType, query, limit);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          platform,
          query,
          count: posts.length,
          posts
        }, null, 2)
      }]
    };
  }
}

async function handleGetContentComments(args: any) {
  const { platform, contentId, limit = 20 } = args;

  let normalizedContentId = contentId;
  if (platform === 'tiktok' && typeof contentId === 'string' && TikTokUrlUtils.isTikTokUrl(contentId)) {
    const resolvedUrl = await TikTokUrlUtils.resolveUrl(contentId);
    const extractedId = TikTokUrlUtils.extractVideoId(resolvedUrl);
    if (!extractedId) {
      throw new Error(`Unable to extract TikTok video ID from URL: ${contentId}`);
    }
    normalizedContentId = extractedId;
  }
  
  const comments = await unifiedService.getContentComments(platform as PlatformType, normalizedContentId, limit);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        platform,
        contentId: normalizedContentId,
        count: comments.length,
        comments
      }, null, 2)
    }]
  };
}

async function handleAnalyzeContent(args: any) {
  const {
    platform,
    contentId,
    analysisDepth = 'standard',
    enableClustering = true,
  } = args;
  
  try {
    // Base analysis from the platform adapter
    const baseAnalysis = await unifiedService.analyzeContent(platform as PlatformType, contentId, enableClustering);
    
    // Enhanced vertical slice analysis
    // Typed as any so we can attach extra fields (opinionClusters, expertVoices, etc.)
    // without extending the ContentAnalysis interface.
    const enhancedAnalysis: any = {
      ...baseAnalysis,
      verticalSliceAnalysis: {
        analysisDepth,
        enabledFeatures: {
          clustering: enableClustering,
        }
      }
    };

    // Add opinion clustering if enabled
    if (enableClustering) {
      try {
        const clusterAnalysis = await handleClusterOpinions({
          platform,
          contentId,
          clusterCount: analysisDepth === 'comprehensive' ? 8 : analysisDepth === 'deep' ? 6 : 5,
          includeExamples: true,
          weightByEngagement: true
        });
        
        const clusterData = JSON.parse(clusterAnalysis.content[0].text);
        enhancedAnalysis.opinionClusters = clusterData.clusters;
        enhancedAnalysis.totalComments = clusterData.totalComments;
      } catch (clusterError) {
        console.error('Clustering failed:', clusterError);
        enhancedAnalysis.clusteringError = 'Opinion clustering failed';
      }
    }

    // Analysis completeness score
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

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(enhancedAnalysis, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Enhanced content analysis failed',
          message: error.message,
          platform,
          contentId,
          fallbackToBasic: true
        }, null, 2)
      }]
    };
  }
}

async function handleGetPlatformStatus() {
  const platforms = unifiedService.getAvailablePlatforms();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        availablePlatforms: platforms,
        totalPlatforms: Object.keys(platforms).length
      }, null, 2)
    }]
  };
}

async function handleHealthCheck() {
  const health = await unifiedService.healthCheck();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        healthStatus: health,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

// Enhanced Analysis Tools - Vertical Slice Implementation

async function handleClusterOpinions(args: any) {
  const { platform, contentId, clusterCount = 5, includeExamples = true, weightByEngagement = true } = args;

  try {
    // Get comments from the content
    const comments = await unifiedService.getContentComments(platform as PlatformType, contentId, 500);

    if (comments.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            platform,
            contentId,
            clusters: [],
            totalComments: 0,
            message: "No comments found for clustering"
          }, null, 2)
        }]
      };
    }

    // Use real clustering service with OpenAI embeddings
    const clusteringService = new CommentClusteringService();

    if (clusteringService.isClusteringAvailable()) {
      const clusteringResult = await clusteringService.clusterComments(comments, 200);

      const clusters = clusteringResult.clusters.map((cluster, idx) => {
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
          sentiment: {
            label: cluster.sentiment,
          },
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
        content: [{
          type: 'text',
          text: JSON.stringify({
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
          }, null, 2)
        }]
      };
    }

    // Fallback: simple equal-split clustering if no OpenAI key
    const clusters = [];
    const commentsPerCluster = Math.ceil(comments.length / clusterCount);

    for (let i = 0; i < clusterCount; i++) {
      const clusterComments = comments.slice(i * commentsPerCluster, (i + 1) * commentsPerCluster);
      if (clusterComments.length === 0) continue;

      const totalLikes = clusterComments.reduce((sum, comment) => sum + (comment.likes || 0), 0);
      clusters.push({
        clusterId: i + 1,
        theme: `Opinion Theme ${i + 1}`,
        size: clusterComments.length,
        percentage: (clusterComments.length / comments.length * 100).toFixed(1),
        engagement: {
          totalLikes,
          avgLikes: (totalLikes / clusterComments.length).toFixed(1),
        },
        sentiment: { label: 'neutral' },
        examples: includeExamples
          ? clusterComments.slice(0, 3).map(c => ({
              text: c.text,
              likes: c.likes || 0,
              author: c.author?.username || 'anonymous',
            }))
          : [],
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          platform,
          contentId,
          analysisType: 'opinion_clustering',
          totalComments: comments.length,
          clusterCount: clusters.length,
          clusters: clusters.sort((a, b) => b.size - a.size),
          metadata: {
            weightByEngagement,
            includeExamples,
            clusteringMethod: 'simple_fallback',
            timestamp: new Date().toISOString(),
          },
        }, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to cluster opinions',
          message: error.message,
          platform,
          contentId
        }, null, 2)
      }]
    };
  }
}

// Initialize and start server
async function main() {
  console.error('[Setup] Initializing CrowdListen MCP server...');
  
  try {
    // Initialize the unified service
    const initResults = await unifiedService.initialize();
    console.error('[Setup] Platform initialization results:', initResults);
    
    const successfulPlatforms = Object.entries(initResults)
      .filter(([, success]) => success)
      .map(([platform]) => platform);
    
    if (successfulPlatforms.length === 0) {
      console.error('[Error] No platforms initialized successfully');
      process.exit(1);
    }
    
    console.error(`[Setup] Successfully initialized: ${successfulPlatforms.join(', ')}`);
    
    // Start the MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Setup] CrowdListen MCP server running on stdio');
    
  } catch (error) {
    console.error('[Error] Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('[Shutdown] Cleaning up...');
  await unifiedService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Shutdown] Cleaning up...');
  await unifiedService.cleanup();
  process.exit(0);
});

// Error handling
server.onerror = (error) => console.error('[MCP Error]', error);
process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
  process.exit(1);
});

// Start the server
main().catch(console.error);