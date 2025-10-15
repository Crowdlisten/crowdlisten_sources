// Vercel MCP server implementation for CrowdListen
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { UnifiedSocialMediaService } from '../../../src/services/UnifiedSocialMediaService';
import type { PlatformType } from '../../../src/core/interfaces/SocialMediaPlatform';

// Initialize the unified service
const serviceConfig = {
  tiktok: {
    enabled: true,
    credentials: {
      msToken: process.env.TIKTOK_MS_TOKEN
    }
  },
  twitter: {
    enabled: true,
    credentials: {
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    }
  },
  reddit: {
    enabled: true,
    credentials: {}
  },
  instagram: {
    enabled: true,
    credentials: {
      username: process.env.INSTAGRAM_USERNAME,
      password: process.env.INSTAGRAM_PASSWORD
    }
  }
};

let unifiedService: UnifiedSocialMediaService;

async function getUnifiedService() {
  if (!unifiedService) {
    unifiedService = new UnifiedSocialMediaService(serviceConfig);
    await unifiedService.initialize();
  }
  return unifiedService;
}

// Create MCP handler with CrowdListen tools
const handler = createMcpHandler(
  (server) => {
    // Tool 1: Analyze content with engagement-weighted clustering
    server.tool(
      'analyze_content',
      'Analyze social media content and extract insights with optional opinion theme clustering',
      {
        platform: z.enum(['tiktok', 'twitter', 'reddit', 'instagram']).describe('Platform where the content is located'),
        contentId: z.string().describe('ID of the content to analyze'),
        enableClustering: z.boolean().default(true).describe('Enable opinion theme clustering analysis using OpenAI embeddings')
      },
      async ({ platform, contentId, enableClustering }) => {
        try {
          const service = await getUnifiedService();
          const analysis = await service.analyzeContent(platform as PlatformType, contentId, enableClustering);
          
          return {
            content: [{
              type: 'text',
              text: `# Content Analysis for ${platform} (${contentId})

## Basic Analysis
- **Platform**: ${analysis.platform}
- **Sentiment**: ${analysis.sentiment}
- **Themes**: ${analysis.themes?.join(', ') || 'General'}
- **Comment Count**: ${analysis.commentCount}
- **Summary**: ${analysis.summary}

## Top Comments
${analysis.topComments.map((comment, idx) => `${idx + 1}. **${comment.author.username}**: ${comment.text} (❤️ ${comment.likes})`).join('\n')}

${analysis.clustering ? `
## 🧠 Opinion Clustering Analysis
- **Total Comments Analyzed**: ${analysis.clustering.totalComments}
- **Clusters Found**: ${analysis.clustering.clustersCount}

### Cluster Breakdown
${analysis.clustering.clusters.map(cluster => `
**${cluster.theme}**
- Sentiment: ${cluster.sentiment}
- Size: ${cluster.size} comments
- Summary: ${cluster.summary}
- Sample: "${cluster.comments[0]?.text || 'No comments'}"
`).join('\n')}

### Overall Insights
${analysis.clustering.overallAnalysis}
` : ''}
`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `❌ Error analyzing content: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Tool 2: Get trending content
    server.tool(
      'get_trending_content',
      'Get trending/hot content from specific platform or all platforms',
      {
        platform: z.enum(['tiktok', 'twitter', 'reddit', 'instagram', 'all']).default('all').describe('Platform to get trending content from'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of trending posts to retrieve')
      },
      async ({ platform, limit }) => {
        try {
          const service = await getUnifiedService();
          let trendingContent;
          
          if (platform === 'all') {
            trendingContent = await service.getAllTrendingContent(limit);
          } else {
            trendingContent = await service.getTrendingContent(platform as PlatformType, limit);
          }
          
          return {
            content: [{
              type: 'text',
              text: `# Trending Content ${platform === 'all' ? 'Across All Platforms' : `on ${platform}`}

${trendingContent.map((post, idx) => `
## ${idx + 1}. ${post.platform.toUpperCase()}
**Author**: ${post.author.username}
**Content**: ${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}
**Engagement**: ❤️ ${post.likes} | 💬 ${post.commentCount} | 🔄 ${post.shares}
**Posted**: ${post.timestamp.toLocaleDateString()}
`).join('\n')}

*Retrieved ${trendingContent.length} trending posts*
`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text', 
              text: `❌ Error getting trending content: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Tool 3: Search content across platforms
    server.tool(
      'search_content',
      'Search for content across social media platforms',
      {
        query: z.string().describe('Search query/keywords'),
        platform: z.enum(['tiktok', 'twitter', 'reddit', 'instagram', 'all']).default('all').describe('Platform to search on'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of results to retrieve')
      },
      async ({ query, platform, limit }) => {
        try {
          const service = await getUnifiedService();
          let searchResults;
          
          if (platform === 'all') {
            searchResults = await service.searchAllPlatforms(query, limit);
          } else {
            searchResults = await service.searchContent(platform as PlatformType, query, limit);
          }
          
          return {
            content: [{
              type: 'text',
              text: `# Search Results for "${query}" ${platform === 'all' ? 'Across All Platforms' : `on ${platform}`}

${searchResults.map((post, idx) => `
## ${idx + 1}. ${post.platform.toUpperCase()}
**Author**: ${post.author.username}
**Content**: ${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}
**Engagement**: ❤️ ${post.likes} | 💬 ${post.commentCount} | 🔄 ${post.shares}
**Posted**: ${post.timestamp.toLocaleDateString()}
`).join('\n')}

*Found ${searchResults.length} results for "${query}"*
`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `❌ Error searching content: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Tool 4: Get content comments
    server.tool(
      'get_content_comments',
      'Get comments for specific content',
      {
        platform: z.enum(['tiktok', 'twitter', 'reddit', 'instagram']).describe('Platform where the content is located'),
        contentId: z.string().describe('ID of the content to get comments for'),
        limit: z.number().int().min(1).max(100).default(20).describe('Maximum number of comments to retrieve')
      },
      async ({ platform, contentId, limit }) => {
        try {
          const service = await getUnifiedService();
          const comments = await service.getContentComments(platform as PlatformType, contentId, limit);
          
          return {
            content: [{
              type: 'text',
              text: `# Comments for ${platform} content (${contentId})

${comments.map((comment, idx) => `
## ${idx + 1}. @${comment.author.username}
${comment.text}
**Engagement**: ❤️ ${comment.likes} ${comment.engagement?.upvotes ? `| ⬆️ ${comment.engagement.upvotes}` : ''} ${comment.engagement?.shares ? `| 🔄 ${comment.engagement.shares}` : ''}
**Posted**: ${comment.timestamp.toLocaleDateString()}
${comment.replies && comment.replies.length > 0 ? `**Replies**: ${comment.replies.length}` : ''}
`).join('\n')}

*Retrieved ${comments.length} comments*
`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `❌ Error getting comments: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Tool 5: Health check
    server.tool(
      'health_check',
      'Check health status of all social media platforms',
      {},
      async () => {
        try {
          const service = await getUnifiedService();
          const healthStatus = await service.healthCheck();
          
          return {
            content: [{
              type: 'text',
              text: `# CrowdListen Health Status

## Platform Status
${Object.entries(healthStatus.platforms).map(([platform, status]) => 
  `- **${platform.toUpperCase()}**: ${status.status === 'healthy' ? '✅' : '❌'} ${status.status} ${status.message ? `(${status.message})` : ''}`
).join('\n')}

## Overall Status
- **Service**: ${healthStatus.overall.status === 'healthy' ? '✅ Healthy' : '❌ Issues detected'}
- **Initialized Platforms**: ${healthStatus.overall.initializedPlatforms}
- **Total Platforms**: ${healthStatus.overall.totalPlatforms}
- **Clustering**: ${process.env.OPENAI_API_KEY ? '✅ Available' : '⚠️ Limited (no OpenAI key)'}

*Last checked: ${new Date().toISOString()}*
`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `❌ Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );
  },
  {},
  { basePath: '/api' }
);

export const { GET, POST } = handler;