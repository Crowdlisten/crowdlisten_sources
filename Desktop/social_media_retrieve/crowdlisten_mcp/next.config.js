/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for MCP
  experimental: {
    serverComponentsExternalPackages: [
      '@modelcontextprotocol/sdk',
      'twitter-api-v2', 
      'instagram-private-api',
      'openai'
    ]
  },
  
  // Webpack configuration for MCP dependencies
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'twitter-api-v2': 'twitter-api-v2',
        'instagram-private-api': 'instagram-private-api'
      });
    }
    return config;
  },

  // Environment variables
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_KEY_SECRET: process.env.TWITTER_API_KEY_SECRET,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME,
    INSTAGRAM_PASSWORD: process.env.INSTAGRAM_PASSWORD,
    TIKTOK_MS_TOKEN: process.env.TIKTOK_MS_TOKEN
  },

  // API routes configuration
  async rewrites() {
    return [
      {
        source: '/mcp',
        destination: '/api/mcp'
      }
    ];
  }
};

module.exports = nextConfig;