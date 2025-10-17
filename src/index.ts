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

if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD) {
  serviceConfig.platforms.instagram = {
    platform: 'instagram',
    credentials: {
      username: process.env.INSTAGRAM_USERNAME,
      password: process.env.INSTAGRAM_PASSWORD
    }
  };
}

// TikTok configuration (optional ms_token)
serviceConfig.platforms.tiktok = {
  platform: 'tiktok',
  credentials: {
    ms_token: process.env.TIKTOK_MS_TOKEN || '',
    proxy: process.env.TIKTOK_PROXY || ''
  }
};

// Reddit configuration (no credentials needed for public content)
serviceConfig.platforms.reddit = {
  platform: 'reddit',
  credentials: {}
};

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
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'all'],
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
          enum: ['tiktok', 'twitter', 'reddit', 'instagram'],
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
          enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'all'],
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
          enum: ['tiktok', 'twitter', 'reddit', 'instagram'],
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
    description: 'Analyze content and extract insights with optional opinion theme clustering',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'twitter', 'reddit', 'instagram'],
          description: 'Platform where the content is located'
        },
        contentId: {
          type: 'string',
          description: 'ID of the content to analyze'
        },
        enableClustering: {
          type: 'boolean',
          default: true,
          description: 'Enable opinion theme clustering analysis using OpenAI embeddings (requires OPENAI_API_KEY)'
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
  }
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
  
  const comments = await unifiedService.getContentComments(platform as PlatformType, contentId, limit);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        platform,
        contentId,
        count: comments.length,
        comments
      }, null, 2)
    }]
  };
}

async function handleAnalyzeContent(args: any) {
  const { platform, contentId, enableClustering = true } = args;
  
  const analysis = await unifiedService.analyzeContent(platform as PlatformType, contentId, enableClustering);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(analysis, null, 2)
    }]
  };
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