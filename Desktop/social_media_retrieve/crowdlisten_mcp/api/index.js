// Root API endpoint for Vercel Functions
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'CrowdListen MCP Server',
      version: '1.0.0',
      endpoints: {
        mcp: '/api/mcp',
        oauth: '/.well-known/oauth-protected-resource'
      },
      status: 'healthy'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}