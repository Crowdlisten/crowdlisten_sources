module.exports = async (req, res) => {
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
      description: 'Social media content analysis with engagement-weighted opinion clustering',
      status: 'healthy',
      tools: ['health_check', 'analyze_content', 'get_trending_content', 'search_content', 'get_content_comments'],
      platforms: ['tiktok', 'twitter', 'reddit', 'instagram'],
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
                    platform: { type: 'string', enum: ['tiktok', 'twitter', 'reddit', 'instagram'] },
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

        if (toolName === 'health_check') {
          return res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `# CrowdListen Health Status\n\n✅ MCP Server is working!\n\nTimestamp: ${new Date().toISOString()}\nProtocol Version: 2024-11-05\nSupported Platforms: TikTok, Twitter, Reddit, Instagram`
              }]
            }
          });
        }

        // For other tools, return a placeholder response
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `Tool "${toolName}" called successfully with arguments: ${JSON.stringify(toolArgs, null, 2)}\n\nNote: Full implementation pending for production deployment.`
            }]
          }
        });
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
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || 1,
        error: { code: -32603, message: 'Internal error', data: { error: error.message } }
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};