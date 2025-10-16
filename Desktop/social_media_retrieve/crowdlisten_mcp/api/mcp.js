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

      if (method === 'tools/call' && params?.name === 'health_check') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `# CrowdListen Health Status\n\n✅ MCP Server is working!\n\nTimestamp: ${new Date().toISOString()}`
            }]
          }
        });
      }

      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `MCP Server is working! Method: ${method}`
          }]
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