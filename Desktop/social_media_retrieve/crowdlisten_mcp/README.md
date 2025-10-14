# CrowdListen MCP Server

A comprehensive Model Context Protocol (MCP) server that provides unified access to multiple social media platforms through a single, standardized interface. This system abstracts platform-specific complexities and provides consistent data formats across TikTok, Twitter/X, Reddit, and Instagram.

## 🚀 Features

### Core Capabilities
- **Unified Interface**: Single API for multiple social media platforms
- **Standardized Data**: Consistent data models across all platforms
- **Error Handling**: Robust error recovery and platform fallbacks
- **Rate Limiting**: Built-in protection against API limits
- **Real-time Content**: Access to trending content, user posts, and comments

### Platform Support
- **TikTok**: Video search, trending content, user videos, comments
- **Twitter/X**: Tweet search, user timelines, trending topics, replies
- **Reddit**: Subreddit content, user posts, comment threads
- **Instagram**: User content, hashtag-based trending discovery, engagement data

### Unified Tools (7 standardized endpoints)
1. `get_trending_content` - Trending content from any platform
2. `get_user_content` - User-specific content retrieval
3. `search_content` - Cross-platform content search
4. `get_content_comments` - Comment and reply fetching
5. `analyze_content` - Content analysis and insights
6. `get_platform_status` - Platform availability status
7. `health_check` - System health monitoring

## 📋 Prerequisites

- Node.js 18+ 
- TypeScript 5+
- Social media platform API credentials (see [API Keys Setup](#-api-keys--credentials-setup))

## 🛠️ Installation

1. **Clone and setup:**
```bash
cd crowdlisten-mcp
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your API credentials (see API Keys section below)
```

3. **Build the project:**
```bash
npm run build
```

4. **Start the server:**
```bash
npm start
```

## 🔑 API Keys & Credentials Setup

### Twitter/X API (Required for Twitter functionality)

**What you need:**
- API Key
- API Key Secret  
- Access Token
- Access Token Secret

**How to get them:**

1. **Apply for Twitter Developer Account:**
   - Go to [developer.twitter.com](https://developer.twitter.com)
   - Click "Apply for a developer account"
   - Complete the application process (can take 1-2 days for approval)
   - **Free tier is sufficient** for this MCP server's functionality

2. **Create a Twitter App:**
   - Once approved, go to the [Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Click "Create App" 
   - Fill in app details (name, description, website URL)
   - Generate API keys in the "Keys and tokens" tab

3. **Get Access Tokens:**
   - In your app's "Keys and tokens" tab
   - Click "Generate" under "Access Token and Secret"
   - Copy all 4 credentials

**💰 Cost Information:**
- **Free Tier**: 1,500 tweets/month (sufficient for testing and light usage)
- **Basic Tier**: $100/month for 10,000 tweets/month
- **Pro Tier**: $5,000/month for 1M tweets/month

**✅ Free Tier Limitations vs Our Usage:**
- ✅ Read tweets and timelines (included)
- ✅ Search tweets (included) 
- ✅ Get user information (included)
- ✅ Access to trending topics (included)
- ❌ Higher rate limits (upgrade needed for heavy usage)
- ❌ Advanced search filters (upgrade needed)

**Recommendation:** Start with the free tier to test functionality, upgrade only if you need higher volume.

**Environment variables:**
```env
TWITTER_API_KEY=your_api_key_here
TWITTER_API_KEY_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here
```

### Instagram API (Required for Instagram functionality)

**What you need:**
- Instagram username
- Instagram password

**How to get them:**
- Use your regular Instagram account credentials
- ⚠️ **Security Note**: Consider creating a dedicated account for API access
- ⚠️ **Risk Warning**: Instagram may flag automated access - use responsibly

**Environment variables:**
```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
```

### TikTok API (Optional - enhances functionality)

**What you need:**
- MS Token (optional but recommended)
- Proxy settings (optional)

**How to get MS Token:**

1. **Browser Method (Easiest):**
   - Open TikTok in your browser and log in
   - Open Developer Tools (F12)
   - Go to Application/Storage tab → Cookies
   - Find and copy the `msToken` value

2. **Alternative Method:**
   - Some browser extensions can extract TikTok tokens
   - Look for "TikTok Token Extractor" type extensions

**Environment variables:**
```env
TIKTOK_MS_TOKEN=your_ms_token_here
TIKTOK_PROXY=http://your_proxy:port (optional)
```

### Reddit API (No credentials required)

Reddit functionality works without authentication for public content access.

## 🔧 Configuration

### Environment Variables (.env file)

```env
# Twitter/X API (Required for Twitter functionality)
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_KEY_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_twitter_access_token_secret

# Instagram (Required for Instagram functionality)
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password

# TikTok (Optional - improves functionality)
TIKTOK_MS_TOKEN=your_tiktok_ms_token
TIKTOK_PROXY=http://proxy:port

# No Reddit credentials needed - works with public access
```

### Platform Configuration

The server automatically initializes platforms based on available credentials:

- **Twitter**: Requires all 4 API credentials
- **Instagram**: Requires username/password
- **TikTok**: Works without credentials (limited functionality), enhanced with MS token
- **Reddit**: No credentials required

## 🚀 Usage

### MCP Tool Examples

**Get trending content from all platforms:**
```json
{
  "name": "get_trending_content",
  "arguments": {
    "platform": "all",
    "limit": 20
  }
}
```

**Get specific user's content:**
```json
{
  "name": "get_user_content", 
  "arguments": {
    "platform": "twitter",
    "userId": "elonmusk",
    "limit": 10
  }
}
```

**Search across platforms:**
```json
{
  "name": "search_content",
  "arguments": {
    "platform": "all", 
    "query": "#AI",
    "limit": 15
  }
}
```

**Health check:**
```json
{
  "name": "health_check",
  "arguments": {}
}
```

### Running as MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "unified-social-media": {
      "command": "node",
      "args": ["/path/to/crowdlisten-mcp/dist/index.js"],
      "env": {
        "TWITTER_API_KEY": "your_key",
        "TWITTER_API_KEY_SECRET": "your_secret",
        "TWITTER_ACCESS_TOKEN": "your_token", 
        "TWITTER_ACCESS_TOKEN_SECRET": "your_token_secret",
        "INSTAGRAM_USERNAME": "your_username",
        "INSTAGRAM_PASSWORD": "your_password",
        "TIKTOK_MS_TOKEN": "your_ms_token"
      }
    }
  }
}
```

## 📊 Data Models

### Post Object
```typescript
interface Post {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName?: string;
    verified?: boolean;
  };
  platform: 'tiktok' | 'twitter' | 'reddit' | 'instagram';
  engagement: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
  metadata: {
    hashtags: string[];
    mentions: string[];
    urls: string[];
  };
  timestamp: string;
  url?: string;
}
```

### Comment Object
```typescript
interface Comment {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName?: string;
  };
  platform: 'tiktok' | 'twitter' | 'reddit' | 'instagram';
  engagement: {
    likes?: number;
    replies?: number;
  };
  timestamp: string;
  replies?: Comment[];
}
```

## 🔧 Development

### Project Structure
```
src/
├── core/
│   ├── interfaces/          # Type definitions and interfaces
│   ├── base/               # Base adapter class
│   └── utils/              # Data normalization utilities
├── platforms/              # Platform-specific adapters
│   ├── TikTokAdapter.ts
│   ├── TwitterAdapter.ts
│   ├── RedditAdapter.ts
│   └── InstagramAdapter.ts
├── services/               # Unified service coordinator
└── index.ts               # Main MCP server
```

### Development Commands
```bash
npm run dev          # Development mode with auto-reload
npm run build        # Build TypeScript to JavaScript  
npm run test         # Run tests
npm start            # Start production server
```

### Adding New Platforms

1. Create new adapter in `src/platforms/`
2. Extend `BaseAdapter` class
3. Implement required interface methods
4. Add to `UnifiedSocialMediaService`
5. Update environment configuration

## ⚠️ Important Notes

### Rate Limiting
- Each platform has different rate limits
- The system includes built-in rate limiting protection
- Monitor your API usage to avoid hitting limits

### Authentication & Security
- Store credentials securely in environment variables
- Consider using dedicated social media accounts for API access
- Instagram access may trigger security checks

### Platform Limitations
- **TikTok**: May require proxy for some regions, HTTP fallbacks included
- **Instagram**: Private API usage may risk account restrictions
- **Twitter**: Requires developer account approval
- **Reddit**: Public content only without authentication

### Legal & Compliance
- Respect platform Terms of Service
- Implement appropriate data retention policies
- Consider user privacy and data protection regulations
- Use responsibly and ethically

## 🛟 Troubleshooting

### Common Issues

**"Twitter adapter failed to initialize"**
- Verify all 4 Twitter credentials are correct
- Check if your Twitter app has necessary permissions
- Ensure access tokens are generated

**"Instagram login failed"**
- Check username/password are correct
- Instagram may require 2FA to be disabled for the account
- Consider using a dedicated account

**"TikTok functionality limited"**
- TikTok works without credentials but with limited functionality
- Add MS token for enhanced features
- Consider using proxy if in restricted region

**"No platforms initialized successfully"**
- Check .env file exists and has correct format
- Verify at least one set of platform credentials is provided
- Check console logs for specific initialization errors

### Getting Help

1. Check the console logs for detailed error messages
2. Verify your API credentials are valid and active
3. Ensure your network allows access to social media APIs
4. Test individual platform credentials outside this system first

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

---

**Built with ❤️ for unified social media access**