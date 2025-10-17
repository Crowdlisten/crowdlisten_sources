// Minimal CrowdListen MCP server for debugging
const axios = require('axios');

module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        name: 'CrowdListen MCP Server',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: {
          twitter_configured: !!process.env.TWITTER_API_KEY,
          node_version: process.version
        }
      });
    }

    if (req.method === 'POST') {
      const { jsonrpc, method, params, id } = req.body || {};

      // Handle MCP initialize method
      if (method === 'initialize') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} },
            serverInfo: { name: 'CrowdListen MCP Server', version: '1.0.0' }
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
                description: 'Check server health',
                inputSchema: { type: 'object', properties: {}, required: [] }
              },
              {
                name: 'search_content',
                description: 'Search Reddit content',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    limit: { type: 'number', default: 10 }
                  },
                  required: ['query']
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

        if (toolName === 'health_check') {
          return res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `# CrowdListen Health Status\n\n✅ Server is working!\n\n**Timestamp**: ${new Date().toISOString()}\n**Twitter Configured**: ${process.env.TWITTER_API_KEY ? 'Yes' : 'No'}`
              }]
            }
          });
        }

        if (toolName === 'search_content') {
          const { query, limit = 5 } = toolArgs;
          
          try {
            // Simple Reddit search
            const response = await axios.get('https://www.reddit.com/search.json', {
              params: { q: query, limit, sort: 'relevance' },
              headers: { 'User-Agent': 'CrowdListen/1.0' },
              timeout: 10000
            });

            const posts = response.data?.data?.children || [];
            const results = posts.slice(0, limit).map(post => ({
              title: post.data?.title || 'No title',
              author: post.data?.author || 'Unknown',
              url: `https://reddit.com${post.data?.permalink || ''}`,
              score: post.data?.ups || 0
            }));

            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# Search Results for "${query}"\n\nFound ${results.length} Reddit posts:\n\n${results.map(post => 
                    `**${post.title}**\n👤 ${post.author} | 👍 ${post.score}\n🔗 ${post.url}\n---`
                  ).join('\n\n') || 'No results found'}`
                }]
              }
            });
          } catch (error) {
            return res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `# Search Error\n\nFailed to search Reddit: ${error.message}`
                }]
              }
            });
          }
        }

        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `Tool "${toolName}" executed successfully.`
            }]
          }
        });
      }

      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found', data: { method } }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Function error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};