// Next.js root page for CrowdListen MCP server
export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🎤 CrowdListen MCP Server</h1>
      <p>Social media content analysis with engagement-weighted opinion clustering</p>
      
      <h2>Available Endpoints:</h2>
      <ul>
        <li><strong>MCP Server:</strong> <code>/api/mcp</code></li>
        <li><strong>OAuth Metadata:</strong> <code>/.well-known/oauth-protected-resource</code></li>
      </ul>

      <h2>Supported Platforms:</h2>
      <ul>
        <li>🎵 TikTok</li>
        <li>🐦 Twitter/X</li>
        <li>📱 Reddit</li>
        <li>📸 Instagram</li>
      </ul>

      <h2>MCP Tools:</h2>
      <ul>
        <li><code>analyze_content</code> - Content analysis with clustering</li>
        <li><code>get_trending_content</code> - Get trending posts</li>
        <li><code>search_content</code> - Search across platforms</li>
        <li><code>get_content_comments</code> - Get comments for content</li>
        <li><code>health_check</code> - Check platform status</li>
      </ul>

      <p>
        <strong>Status:</strong> 
        <span style={{ color: 'green' }}>🟢 Online</span>
      </p>
    </div>
  );
}