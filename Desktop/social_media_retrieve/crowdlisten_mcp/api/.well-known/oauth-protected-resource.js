// OAuth metadata endpoint for MCP server
module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      // OAuth 2.0 Protected Resource Registration
      // See: https://datatracker.ietf.org/doc/html/rfc8414
      resource_documentation: "https://github.com/terrylinhaochen/crowdlisten_mcp",
      resource_policy_uri: "https://github.com/terrylinhaochen/crowdlisten_mcp/blob/main/README.md",
      
      // MCP-specific metadata
      mcp_version: "2024-11-05",
      vendor: "CrowdListen",
      description: "Social media content analysis with engagement-weighted opinion clustering across TikTok, Twitter, Reddit, and Instagram",
      
      // Server capabilities
      capabilities: {
        tools: [
          {
            name: "analyze_content",
            description: "Analyze social media content with opinion clustering"
          },
          {
            name: "get_trending_content", 
            description: "Get trending content from platforms"
          },
          {
            name: "search_content",
            description: "Search content across platforms"
          },
          {
            name: "get_content_comments",
            description: "Get comments for specific content"
          },
          {
            name: "health_check",
            description: "Check platform health status"
          }
        ],
        clustering: true,
        platforms: ["tiktok", "twitter", "reddit", "instagram"],
        engagement_weighting: true
      },

      // Contact information
      contacts: [{
        name: "CrowdListen Support",
        email: "support@crowdlisten.com",
        url: "https://github.com/terrylinhaochen/crowdlisten_mcp"
      }],

      // Authorization requirements
      authorization_requirements: {
        scope: ["read", "analyze"],
        description: "Access to social media content analysis and clustering features"
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}