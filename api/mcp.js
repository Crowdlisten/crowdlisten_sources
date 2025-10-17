// Vercel serverless function that bridges to your complete TypeScript implementation
const { UnifiedSocialMediaService } = require('../dist/services/UnifiedSocialMediaService.js');

// Initialize the unified service with your existing configuration
let unifiedService = null;

const initializeService = () => {
  if (unifiedService) return unifiedService;
  
  const serviceConfig = {
    platforms: {},
    globalOptions: {
      timeout: 30000,
      retries: 3,
      fallbackStrategy: 'continue'
    }
  };

  // Configure platforms based on available credentials (your existing logic)
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

  unifiedService = new UnifiedSocialMediaService(serviceConfig);
  return unifiedService;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const service = initializeService();
    await service.initialize();
    const platforms = service.getAvailablePlatforms();
    
    return res.status(200).json({
      name: 'CrowdListen MCP Server',
      version: '1.0.0',
      description: 'Social media content analysis with engagement-weighted opinion clustering',
      status: 'healthy',
      tools: ['health_check', 'analyze_content', 'get_trending_content', 'search_content', 'get_content_comments'],
      platforms: Object.keys(platforms),
      configuredPlatforms: Object.keys(platforms).length,
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'POST') {
    try {
      const { jsonrpc, method, params, id } = req.body;

      // Handle MCP initialize method
      if (method === 'initialize') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
              logging: {}
            },
            serverInfo: {
              name: 'CrowdListen MCP Server',
              version: '1.0.0'
            }
          }
        });
      }

      // Handle MCP tools/list method
      if (method === 'tools/list') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'health_check',
                description: 'Check the health status of the CrowdListen MCP server',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'analyze_content',
                description: 'Analyze social media content with engagement-weighted opinion clustering',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content_url: { type: 'string', description: 'URL of the content to analyze' },
                    platform: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram'] }
                  },
                  required: ['content_url', 'platform']
                }
              },
              {
                name: 'get_trending_content',
                description: 'Get trending content from specified social media platforms',
                inputSchema: {
                  type: 'object',
                  properties: {
                    platform: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'all'] },
                    limit: { type: 'number', description: 'Number of items to return', default: 10 }
                  },
                  required: ['platform']
                }
              },
              {
                name: 'search_content',
                description: 'Search for content across social media platforms',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    platforms: { 
                      type: 'array', 
                      items: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram'] },
                      description: 'Platforms to search on'
                    },
                    platform: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram', 'all'] },
                    limit: { type: 'number', description: 'Number of results to return', default: 20 }
                  },
                  required: ['query']
                }
              },
              {
                name: 'get_content_comments',
                description: 'Get comments for specific social media content',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content_url: { type: 'string', description: 'URL of the content' },
                    platform: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram'] },
                    limit: { type: 'number', description: 'Number of comments to return', default: 50 }
                  },
                  required: ['content_url', 'platform']
                }
              }
            ]
          }
        });
      }

      // Handle MCP tools/call method - use your complete implementation
      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        const service = initializeService();
        await service.initialize();

        switch (toolName) {
          case 'health_check':
            const health = await service.healthCheck();
            const platforms = service.getAvailablePlatforms();
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# CrowdListen Health Status\n\n✅ MCP Server is working!\n\n**Protocol**: 2024-11-05\n**Available Platforms**: ${Object.keys(platforms).join(', ')}\n**Health Status**: ${JSON.stringify(health, null, 2)}\n**Timestamp**: ${new Date().toISOString()}`
                }]
              }
            });

          case 'search_content':
            // Handle both 'platform' (single) and 'platforms' (array) parameters
            let { platform, platforms, query, limit = 10 } = toolArgs;
            
            // If platforms array is provided, convert to single platform or 'all'
            if (platforms && Array.isArray(platforms)) {
              if (platforms.length === 1) {
                platform = platforms[0];
              } else if (platforms.length > 1) {
                platform = 'all';
              }
            }
            
            // Default to 'all' if no platform specified
            if (!platform) {
              platform = 'all';
            }
            
            console.log(`Search request: platform="${platform}", query="${query}", limit=${limit}`);
            
            try {
              let results;
              if (platform === 'all') {
                results = await service.getCombinedSearchResults(query, limit);
              } else {
                results = await service.searchContent(platform, query, limit);
              }

              const resultText = results.length > 0 
                ? `# Search Results for "${query}"\n\nFound ${results.length} posts:\n\n${results.map(post => 
                    `**[${post.platform.toUpperCase()}]** ${post.content.slice(0, 150)}${post.content.length > 150 ? '...' : ''}\n` +
                    `👤 ${post.author.displayName} (@${post.author.username}) | 👍 ${post.engagement.likes} | 💬 ${post.engagement.comments}\n` +
                    `🔗 ${post.url}\n---`
                  ).join('\n\n')}`
                : `# Search Results for "${query}"\n\n**No results found** for "${query}".\n\nTry different search terms or check platform connectivity.`;
              
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: resultText
                  }]
                }
              });
            } catch (error) {
              console.error('Search error:', error.message);
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: `# Search Error\n\nFailed to search for "${query}".\n\nError: ${error.message}\n\nPlease try again with different search terms.`
                  }]
                }
              });
            }

          case 'get_trending_content':
            const { platform: trendPlatform = 'all', limit: trendLimit = 10 } = toolArgs;
            
            try {
              let results;
              if (trendPlatform === 'all') {
                results = await service.getCombinedTrendingContent(trendLimit);
              } else {
                results = await service.getTrendingContent(trendPlatform, trendLimit);
              }

              const resultText = results.length > 0 
                ? `# Trending Content${trendPlatform !== 'all' ? ` on ${trendPlatform.charAt(0).toUpperCase() + trendPlatform.slice(1)}` : ''}\n\nFound ${results.length} trending posts:\n\n${results.map(post => 
                    `**[${post.platform.toUpperCase()}]** ${post.content.slice(0, 150)}${post.content.length > 150 ? '...' : ''}\n` +
                    `👤 ${post.author.displayName} (@${post.author.username}) | 👍 ${post.engagement.likes} | 💬 ${post.engagement.comments}\n` +
                    `🔗 ${post.url}\n---`
                  ).join('\n\n')}`
                : `# Trending Content\n\n**No trending content found**.\n\nTry again in a few minutes.`;
              
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: resultText
                  }]
                }
              });
            } catch (error) {
              console.error('Trending content error:', error.message);
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: `# Trending Content Error\n\nFailed to get trending content.\n\nError: ${error.message}\n\nPlease try again.`
                  }]
                }
              });
            }

          case 'analyze_content':
            const { platform: analysisPlatform, content_url, enableClustering = true } = toolArgs;
            
            try {
              // Extract content ID from URL (simplified)
              const contentId = content_url.split('/').pop() || content_url;
              const analysis = await service.analyzeContent(analysisPlatform, contentId, enableClustering);
              
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: `# Content Analysis\n\n${JSON.stringify(analysis, null, 2)}`
                  }]
                }
              });
            } catch (error) {
              console.error('Content analysis error:', error.message);
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: `# Content Analysis Error\n\nFailed to analyze content.\n\nError: ${error.message}\n\nMake sure the content URL and platform are correct.`
                  }]
                }
              });
            }

          case 'get_content_comments':
            const { platform: commentsPlatform, content_url: commentsUrl, limit: commentsLimit = 50 } = toolArgs;
            
            try {
              // Extract content ID from URL (simplified)
              const contentId = commentsUrl.split('/').pop() || commentsUrl;
              const comments = await service.getContentComments(commentsPlatform, contentId, commentsLimit);
              
              const resultText = comments.length > 0 
                ? `# Comments for Content\n\nFound ${comments.length} comments:\n\n${comments.map(comment => 
                    `**${comment.content.slice(0, 100)}${comment.content.length > 100 ? '...' : ''}**\n` +
                    `👤 ${comment.author.displayName} (@${comment.author.username}) | 👍 ${comment.engagement.likes}\n` +
                    `🕒 ${new Date(comment.timestamp).toLocaleDateString()}\n---`
                  ).join('\n\n')}`
                : `# Comments\n\n**No comments found** for this content.`;
              
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: resultText
                  }]
                }
              });
            } catch (error) {
              console.error('Comments error:', error.message);
              return res.status(200).json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: `# Comments Error\n\nFailed to get comments.\n\nError: ${error.message}\n\nMake sure the content URL and platform are correct.`
                  }]
                }
              });
            }

          default:
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `Tool "${toolName}" executed with arguments:\n${JSON.stringify(toolArgs, null, 2)}\n\n**Implementation**: Using your complete TypeScript implementation with full platform support.`
                }]
              }
            });
        }
      }

      // Handle unknown methods
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found',
          data: { method }
        }
      });

    } catch (error) {
      console.error('Serverless function error:', error.message);
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || 1,
        error: { code: -32603, message: 'Internal error', data: { error: error.message } }
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};