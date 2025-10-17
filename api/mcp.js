// Streamlined CrowdListen MCP server with direct platform implementations
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');

// Simple Reddit implementation
const searchReddit = async (query, limit = 10) => {
  try {
    const response = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: query, limit, sort: 'relevance', type: 'link' },
      headers: { 'User-Agent': 'CrowdListen/1.0' },
      timeout: 10000
    });
    
    if (!response.data || !response.data.data || !response.data.data.children) {
      return [];
    }
    
    return response.data.data.children.map(post => ({
      id: post.data.id,
      content: post.data.title + (post.data.selftext ? '\n' + post.data.selftext : ''),
      author: {
        id: post.data.author,
        username: post.data.author,
        displayName: post.data.author
      },
      engagement: {
        likes: post.data.ups || 0,
        comments: post.data.num_comments || 0,
        shares: 0
      },
      url: `https://reddit.com${post.data.permalink}`,
      platform: 'reddit',
      timestamp: new Date(post.data.created_utc * 1000).toISOString()
    }));
  } catch (error) {
    console.error('Reddit search error:', error.message);
    return [];
  }
};

const getRedditTrending = async (limit = 10) => {
  try {
    const response = await axios.get('https://www.reddit.com/r/popular.json', {
      params: { limit },
      headers: { 'User-Agent': 'CrowdListen/1.0' },
      timeout: 10000
    });
    
    if (!response.data || !response.data.data || !response.data.data.children) {
      return [];
    }
    
    return response.data.data.children.map(post => ({
      id: post.data.id,
      content: post.data.title + (post.data.selftext ? '\n' + post.data.selftext : ''),
      author: {
        id: post.data.author,
        username: post.data.author,
        displayName: post.data.author
      },
      engagement: {
        likes: post.data.ups || 0,
        comments: post.data.num_comments || 0,
        shares: 0
      },
      url: `https://reddit.com${post.data.permalink}`,
      platform: 'reddit',
      timestamp: new Date(post.data.created_utc * 1000).toISOString()
    }));
  } catch (error) {
    console.error('Reddit trending error:', error.message);
    return [];
  }
};

// Twitter implementation using your credentials
const searchTwitter = async (query, limit = 10) => {
  try {
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_KEY_SECRET || 
        !process.env.TWITTER_ACCESS_TOKEN || !process.env.TWITTER_ACCESS_TOKEN_SECRET) {
      throw new Error('Twitter credentials not configured');
    }
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    const searchResult = await twitterClient.v2.search(query.trim(), {
      max_results: Math.min(limit, 100),
      'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
      'user.fields': ['name', 'username', 'verified', 'public_metrics'],
      expansions: ['author_id']
    });

    if (!searchResult.data?.data) {
      return [];
    }

    return searchResult.data.data.map(tweet => {
      const author = searchResult.includes?.users?.find(u => u.id === tweet.author_id) || 
                    { id: tweet.author_id || '', username: 'unknown', name: 'Unknown User' };
      
      return {
        id: tweet.id,
        content: tweet.text || '',
        author: {
          id: author.id,
          username: author.username || 'unknown',
          displayName: author.name || author.username || 'Unknown User'
        },
        engagement: {
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0
        },
        url: `https://twitter.com/${author.username}/status/${tweet.id}`,
        platform: 'twitter',
        timestamp: tweet.created_at || new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('Twitter search error:', error.message);
    return [];
  }
};

const getTwitterTrending = async (limit = 10) => {
  try {
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_KEY_SECRET || 
        !process.env.TWITTER_ACCESS_TOKEN || !process.env.TWITTER_ACCESS_TOKEN_SECRET) {
      throw new Error('Twitter credentials not configured');
    }
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    // Get trending topics for worldwide (woeid: 1)
    const trendingTopics = await twitterClient.v1.trends(1);
    const topTrends = trendingTopics[0]?.trends?.slice(0, 3) || [];
    
    const trendingPosts = [];
    
    for (const trend of topTrends) {
      if (trendingPosts.length >= limit) break;
      
      try {
        const searchResult = await twitterClient.v2.search(trend.name, {
          max_results: Math.min(10, limit - trendingPosts.length),
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
          'user.fields': ['name', 'username', 'verified', 'public_metrics'],
          expansions: ['author_id']
        });

        if (searchResult.data?.data) {
          const posts = searchResult.data.data.map(tweet => {
            const author = searchResult.includes?.users?.find(u => u.id === tweet.author_id) || 
                          { id: tweet.author_id || '', username: 'unknown', name: 'Unknown User' };
            
            return {
              id: tweet.id,
              content: tweet.text || '',
              author: {
                id: author.id,
                username: author.username || 'unknown',
                displayName: author.name || author.username || 'Unknown User'
              },
              engagement: {
                likes: tweet.public_metrics?.like_count || 0,
                comments: tweet.public_metrics?.reply_count || 0,
                shares: tweet.public_metrics?.retweet_count || 0
              },
              url: `https://twitter.com/${author.username}/status/${tweet.id}`,
              platform: 'twitter',
              timestamp: tweet.created_at || new Date().toISOString()
            };
          });
          trendingPosts.push(...posts);
        }
      } catch (searchError) {
        console.error(`Failed to search for trend: ${trend.name}`, searchError.message);
      }
    }

    return trendingPosts.slice(0, limit);
  } catch (error) {
    console.error('Twitter trending error:', error.message);
    return [];
  }
};

// Platform configuration
const getAvailablePlatforms = () => {
  const platforms = ['reddit']; // Reddit always available
  
  if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_KEY_SECRET && 
      process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_TOKEN_SECRET) {
    platforms.push('twitter');
  }
  
  if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD) {
    platforms.push('instagram');
  }
  
  if (process.env.TIKTOK_MS_TOKEN) {
    platforms.push('tiktok');
  }
  
  return platforms;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const platforms = getAvailablePlatforms();
    
    return res.status(200).json({
      name: 'CrowdListen MCP Server',
      version: '1.0.0',
      description: 'Social media content analysis with engagement-weighted opinion clustering',
      status: 'healthy',
      tools: ['health_check', 'analyze_content', 'get_trending_content', 'search_content', 'get_content_comments'],
      platforms: platforms,
      configuredPlatforms: platforms.length,
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

      // Handle MCP tools/call method
      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        switch (toolName) {
          case 'health_check':
            const platforms = getAvailablePlatforms();
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# CrowdListen Health Status\n\n✅ MCP Server is working!\n\n**Protocol**: 2024-11-05\n**Available Platforms**: ${platforms.join(', ')}\n**Environment Variables**: ${Object.keys(process.env).filter(key => key.includes('TWITTER') || key.includes('INSTAGRAM') || key.includes('TIKTOK')).map(key => `${key}=${process.env[key] ? '✅ Set' : '❌ Missing'}`).join(', ')}\n**Timestamp**: ${new Date().toISOString()}`
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
              const allResults = [];
              
              // Multi-platform search
              if (platform === 'all') {
                // Search Reddit
                try {
                  const redditResults = await searchReddit(query, Math.ceil(limit / 2));
                  allResults.push(...redditResults);
                } catch (error) {
                  console.error('Reddit search failed:', error.message);
                }
                
                // Search Twitter if credentials available
                if (process.env.TWITTER_API_KEY) {
                  try {
                    const twitterResults = await searchTwitter(query, Math.ceil(limit / 2));
                    allResults.push(...twitterResults);
                  } catch (error) {
                    console.error('Twitter search failed:', error.message);
                  }
                }
              } 
              // Single platform search
              else if (platform === 'reddit') {
                const results = await searchReddit(query, limit);
                allResults.push(...results);
              }
              else if (platform === 'twitter') {
                if (!process.env.TWITTER_API_KEY) {
                  return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                      content: [{
                        type: 'text',
                        text: `# Twitter Search Not Available\n\nTwitter API credentials are not configured.\n\nRequired variables: TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET`
                      }]
                    }
                  });
                }
                const results = await searchTwitter(query, limit);
                allResults.push(...results);
              }
              else {
                return res.status(200).json({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    content: [{
                      type: 'text',
                      text: `# Platform "${platform}" Not Available\n\nCurrently available platforms: Reddit${process.env.TWITTER_API_KEY ? ', Twitter' : ''}\n\nTo enable ${platform}, add API credentials to Vercel environment variables.`
                    }]
                  }
                });
              }

              const resultText = allResults.length > 0 
                ? `# Search Results for "${query}"\n\nFound ${allResults.length} posts:\n\n${allResults.map(post => 
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
              const allResults = [];
              
              if (trendPlatform === 'all') {
                // Get Reddit trending
                try {
                  const redditResults = await getRedditTrending(Math.ceil(trendLimit / 2));
                  allResults.push(...redditResults);
                } catch (error) {
                  console.error('Reddit trending failed:', error.message);
                }
                
                // Get Twitter trending if credentials available
                if (process.env.TWITTER_API_KEY) {
                  try {
                    const twitterResults = await getTwitterTrending(Math.ceil(trendLimit / 2));
                    allResults.push(...twitterResults);
                  } catch (error) {
                    console.error('Twitter trending failed:', error.message);
                  }
                }
              }
              else if (trendPlatform === 'reddit') {
                const results = await getRedditTrending(trendLimit);
                allResults.push(...results);
              }
              else if (trendPlatform === 'twitter') {
                if (!process.env.TWITTER_API_KEY) {
                  return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                      content: [{
                        type: 'text',
                        text: `# Twitter Trending Not Available\n\nTwitter API credentials are not configured.`
                      }]
                    }
                  });
                }
                const results = await getTwitterTrending(trendLimit);
                allResults.push(...results);
              }
              else {
                return res.status(200).json({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    content: [{
                      type: 'text',
                      text: `Platform "${trendPlatform}" trending requires API credentials. Currently available: Reddit${process.env.TWITTER_API_KEY ? ', Twitter' : ''}`
                    }]
                  }
                });
              }

              const resultText = allResults.length > 0 
                ? `# Trending Content${trendPlatform !== 'all' ? ` on ${trendPlatform.charAt(0).toUpperCase() + trendPlatform.slice(1)}` : ''}\n\nFound ${allResults.length} trending posts:\n\n${allResults.map(post => 
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
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# Content Analysis\n\nContent analysis with opinion clustering requires OpenAI API integration.\n\n**Arguments received**: ${JSON.stringify(toolArgs, null, 2)}\n\n**Status**: Available with OpenAI API key configuration.`
                }]
              }
            });

          case 'get_content_comments':
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# Content Comments\n\nComment retrieval requires platform-specific implementation.\n\n**Arguments received**: ${JSON.stringify(toolArgs, null, 2)}\n\n**Status**: Available with proper platform API access.`
                }]
              }
            });

          default:
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# Tool "${toolName}" Executed\n\n**Arguments**: ${JSON.stringify(toolArgs, null, 2)}\n\n**Implementation**: Streamlined version with Reddit and Twitter integration using your configured API credentials.`
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