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
} from './handlers.js';

// Initialize the unified service
const unifiedService = createService();

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
      case 'get_trending_content':
        return mcpText(await getTrendingContent(unifiedService, args as any));

      case 'get_user_content':
        return mcpText(await getUserContent(unifiedService, args as any));

      case 'search_content':
        return mcpText(await searchContent(unifiedService, args as any));

      case 'get_content_comments':
        return mcpText(await getContentComments(unifiedService, args as any));

      case 'analyze_content':
        try {
          return mcpText(await analyzeContent(unifiedService, args as any));
        } catch (error: any) {
          return mcpText({
            error: 'Enhanced content analysis failed',
            message: error.message,
            platform: (args as any)?.platform,
            contentId: (args as any)?.contentId,
            fallbackToBasic: true,
          });
        }

      case 'get_platform_status':
        return mcpText(getPlatformStatus(unifiedService));

      case 'health_check':
        return mcpText(await healthCheck(unifiedService));

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

// Initialize and start server
async function main() {
  console.error('[Setup] Initializing CrowdListen MCP server...');

  try {
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
