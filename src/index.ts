#!/usr/bin/env node

/**
 * CrowdListen MCP Server
 * Cross-channel feedback analysis — consolidates audience signal from social
 * platforms into structured, decision-grade context for AI agents.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { createService } from './service-config.js';
import {
  getTrendingContent,
  getUserContent,
  searchContent,
  getContentComments,
  analyzeContent,
  getPlatformStatus,
  healthCheck,
  clusterOpinions,
  deepAnalyze,
  extractInsights,
  researchSynthesis,
} from './handlers.js';

export async function main() {
  const unifiedService = createService();

  const server = new Server(
    {
      name: 'crowdlisten/sources',
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
      name: 'search_content',
      description: 'Search for posts and discussions across social platforms. Use this first to find content, then use get_content_comments or analyze_content on specific results. Free, no API key needed.',
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
      description: 'Get comments/replies for a specific post. Use after search_content to drill into a discussion. Returns raw comment text, authors, timestamps, and engagement metrics. Free, no API key needed.',
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
      description: 'Analyze a post and its comments locally — sentiment, themes, opinion clustering. Free, no API key needed. For surface/standard depth, runs entirely locally. For deep/comprehensive depth, automatically upgrades to the paid CrowdListen analysis API (requires CROWDLISTEN_API_KEY) and falls back to local analysis if no key is set.',
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
            description: 'Depth of analysis. surface/standard are free and local. deep/comprehensive use the paid API if CROWDLISTEN_API_KEY is set, otherwise fall back to local.'
          },
          enableClustering: {
            type: 'boolean',
            default: true,
            description: 'Enable semantic opinion clustering using embeddings (uses OPENAI_API_KEY if available)'
          }
        },
        required: ['platform', 'contentId']
      }
    },
    {
      name: 'cluster_opinions',
      description: 'Group comments into semantic opinion clusters using OpenAI embeddings. Identifies recurring themes, consensus, and minority viewpoints. Requires OPENAI_API_KEY for embeddings. Without it, returns an error with upgrade instructions. Best after get_content_comments when you want structured opinion analysis.',
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
    {
      name: 'get_trending_content',
      description: 'Get currently trending posts from a platform. Useful for discovering what audiences are talking about right now. Free, no API key needed.',
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
      description: 'Get recent posts from a specific user/creator. Useful for tracking influencers, competitors, or key voices. Free, no API key needed.',
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
      name: 'get_platform_status',
      description: 'List which platforms are available and their capabilities. Call this to check what platforms are configured before searching.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'health_check',
      description: 'Check connectivity and health of all configured platforms. Call this to diagnose issues if search or comments return errors.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },

    // ── Paid tools — require CROWDLISTEN_API_KEY ─────────────────────────────

    {
      name: 'deep_analyze',
      description: 'AI-powered deep analysis of content via the CrowdListen analysis API. Returns structured insights including audience segments, pain points, feature requests, and competitive signals. Requires CROWDLISTEN_API_KEY — get one at crowdlisten.com/api. Free alternative: analyze_content with depth=standard.',
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
            enum: ['deep', 'comprehensive'],
            default: 'deep',
            description: 'deep = structured analysis; comprehensive = full audience intelligence report'
          }
        },
        required: ['platform', 'contentId']
      }
    },
    {
      name: 'extract_insights',
      description: 'Extract categorized insights (pain points, feature requests, praise, complaints, suggestions) from content via the CrowdListen analysis API. Requires CROWDLISTEN_API_KEY — get one at crowdlisten.com/api. Free alternative: analyze_content + cluster_opinions.',
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
            description: 'ID of the content to extract insights from'
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: filter to specific insight categories (e.g. ["pain_points", "feature_requests"])'
          }
        },
        required: ['platform', 'contentId']
      }
    },
    {
      name: 'research_synthesis',
      description: 'Cross-platform research synthesis — searches multiple platforms, analyzes results, and produces a unified research report. Requires CROWDLISTEN_API_KEY — get one at crowdlisten.com/api. Free alternative: search_content on each platform + analyze_content on top results.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Research query or topic to synthesize across platforms'
          },
          platforms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Platforms to include (default: reddit, twitter, youtube)'
          },
          depth: {
            type: 'string',
            enum: ['quick', 'standard', 'deep'],
            default: 'standard',
            description: 'Research depth — quick (~10 sources), standard (~25), deep (~50+)'
          }
        },
        required: ['query']
      }
    },
  ];

  // Helper: wrap handler result in MCP text response
  function mcpText(data: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_content':
          return mcpText(await searchContent(unifiedService, args as any));

        case 'get_content_comments':
          return mcpText(await getContentComments(unifiedService, args as any));

        case 'analyze_content': {
          const depth = (args as any)?.analysisDepth;
          if (depth === 'deep' || depth === 'comprehensive') {
            try {
              return mcpText(await deepAnalyze({
                platform: (args as any).platform,
                contentId: (args as any).contentId,
                analysisDepth: depth,
              }));
            } catch (error: any) {
              if (error.message?.includes('CROWDLISTEN_API_KEY')) {
                const local = await analyzeContent(unifiedService, args as any);
                return mcpText({
                  ...local,
                  _note: 'Deep analysis requires CROWDLISTEN_API_KEY. Showing local analysis instead. Get a key at crowdlisten.com/api',
                });
              }
              throw error;
            }
          }
          return mcpText(await analyzeContent(unifiedService, args as any));
        }

        case 'cluster_opinions':
          try {
            return mcpText(await clusterOpinions(unifiedService, args as any));
          } catch (error: any) {
            return mcpText({
              error: 'Failed to cluster opinions',
              message: error.message,
              platform: (args as any)?.platform,
              contentId: (args as any)?.contentId,
            });
          }

        case 'get_trending_content':
          return mcpText(await getTrendingContent(unifiedService, args as any));

        case 'get_user_content':
          return mcpText(await getUserContent(unifiedService, args as any));

        case 'get_platform_status':
          return mcpText(getPlatformStatus(unifiedService));

        case 'health_check':
          return mcpText(await healthCheck(unifiedService));

        // ── Paid tools ─────────────────────────────────────────────────

        case 'deep_analyze':
          return mcpText(await deepAnalyze(args as any));

        case 'extract_insights':
          return mcpText(await extractInsights(args as any));

        case 'research_synthesis':
          return mcpText(await researchSynthesis(args as any));

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
      }
    } catch (error: any) {
      console.error(`Error executing tool ${name}:`, error);

      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Error executing ${name}: ${error.message || 'Unknown error'}`
      );
    }
  });

  // Initialize platforms
  console.error('[Setup] Initializing CrowdListen MCP server...');

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

  process.on('unhandledRejection', (reason, _promise) => {
    console.error('[Unhandled Rejection]', reason);
    process.exit(1);
  });

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Setup] CrowdListen MCP server running on stdio');
}

// Auto-start when run directly (node dist/index.js / npm run start)
// Dynamic imports from cli.ts call main() explicitly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Error] Failed to start server:', error);
    process.exit(1);
  });
}
