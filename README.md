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

### Unified Tools (12 standardized endpoints)

#### Core Content Tools
1. `get_trending_content` - Trending content from any platform
2. `get_user_content` - User-specific content retrieval
3. `search_content` - Cross-platform content search
4. `get_content_comments` - Comment and reply fetching
5. `get_platform_status` - Platform availability status
6. `health_check` - System health monitoring

#### Advanced Analysis Tools (NEW)
7. `analyze_content` - Enhanced multi-modal content analysis with vertical slice methodology
8. `cluster_opinions` - Semantic opinion clustering using embeddings
9. `deep_platform_analysis` - Comprehensive platform-specific vertical analysis
10. `sentiment_evolution_tracker` - Temporal sentiment analysis with trend prediction
11. `expert_identification` - Authority scoring and expert voice identification
12. `cross_platform_synthesis` - Strategic insight synthesis across multiple platforms

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

## 🧠 Advanced Analysis Features

The CrowdListen MCP server now includes sophisticated vertical slice analysis capabilities that go far beyond basic social media monitoring. These advanced features implement comprehensive content analysis methodologies that extract deep insights from social conversations.

### 🎯 Vertical Slice vs Horizontal Analysis

Traditional social media tools perform horizontal analysis, skimming across platforms for basic metrics like follower counts and simple sentiment scores. Our vertical slice approach dives deep into each platform's unique characteristics, extracting multi-layered insights that reveal the true depth of public opinion.

The vertical slice methodology analyzes content through multiple interconnected layers: content analysis (text, media, language patterns), engagement analysis (likes, comments, shares with temporal patterns), authority analysis (expert identification, influence scoring, credibility assessment), and network analysis (conversation flows, community structures, viral pathways). This approach enables the discovery of nuanced opinions, expert insights, and emerging trends that surface-level monitoring completely misses.

### 🔍 Enhanced Content Analysis (`analyze_content`)

The enhanced `analyze_content` tool now provides comprehensive multi-modal analysis with four distinct depth levels. Surface analysis provides basic content metrics and simple sentiment scoring, suitable for quick overviews. Standard analysis includes opinion clustering, basic expert identification, and engagement pattern analysis. Deep analysis adds temporal sentiment tracking, advanced media analysis, and cross-reference validation. Comprehensive analysis provides full multi-modal processing, predictive trend analysis, and complete expert authority scoring.

**Enhanced Usage Example:**
```json
{
  "name": "analyze_content",
  "arguments": {
    "platform": "tiktok",
    "contentId": "video_123",
    "analysisDepth": "comprehensive",
    "enableClustering": true,
    "enableExpertScoring": true,
    "enableSentimentEvolution": true,
    "extractMedia": true,
    "maxComments": 1000
  }
}
```

This enhanced analysis integrates multiple analysis methods automatically. When clustering is enabled, the system performs semantic opinion grouping to identify distinct viewpoint clusters within the comments. Expert scoring identifies and weights authoritative voices versus general audience reactions. Sentiment evolution tracking reveals how opinions change over time, while media extraction analyzes audio, video, and image content for additional context.

The system provides a completeness score indicating the quality and depth of analysis achieved, along with processing metadata and fallback strategies when certain analysis components fail. This ensures robust analysis even when individual components encounter errors.

### 🧩 Semantic Opinion Clustering (`cluster_opinions`)

The opinion clustering tool uses advanced semantic analysis to group related opinions and identify distinct viewpoint themes within social conversations. Unlike simple keyword grouping, this approach understands contextual meaning and sentiment nuances to create meaningful opinion clusters.

The clustering process analyzes comment text using embedding-based similarity analysis, groups related opinions using K-means clustering algorithms, weights clusters by engagement metrics (likes, replies, shares), and extracts representative examples and key phrases for each cluster. This enables the identification of majority vs minority opinions, controversial topics with split sentiment, and emerging viewpoints that might influence future trends.

**Clustering Example:**
```json
{
  "name": "cluster_opinions",
  "arguments": {
    "platform": "reddit",
    "contentId": "post_456",
    "clusterCount": 6,
    "includeExamples": true,
    "weightByEngagement": true
  }
}
```

The output provides detailed cluster analysis including theme identification, sentiment scoring for each cluster, engagement metrics and popularity percentages, representative comment examples, and key phrases that define each opinion group. This clustering reveals the true diversity of public opinion beyond simple positive/negative classification.

### 🏗️ Deep Platform Analysis (`deep_platform_analysis`)

This comprehensive tool performs platform-specific vertical analysis that understands each social media platform's unique characteristics, user behaviors, and content patterns. Rather than applying generic analysis across platforms, it adapts its methodology to extract platform-specific insights.

The analysis examines multiple content layers simultaneously. Text analysis includes language detection, key term extraction, sentiment analysis, and readability scoring. Engagement analysis tracks likes, comments, shares with temporal patterns, viral coefficient calculation, and audience demographic insights. Authority analysis identifies top influencers and thought leaders, calculates authority scores based on multiple criteria, analyzes network centrality and influence paths, and assesses expertise indicators and credibility signals.

Platform-specific insights are extracted based on each platform's characteristics. For TikTok, this includes video engagement patterns, trending hashtag analysis, creator ecosystem mapping, and viral content characteristics. For Twitter, it covers real-time conversation flow, hashtag trend analysis, retweet network analysis, and influencer amplification patterns. For Reddit, it examines subreddit community dynamics, upvote/downvote patterns, discussion thread analysis, and expert AMA identification. For Instagram, it includes visual content analysis, story engagement patterns, hashtag performance tracking, and lifestyle trend identification.

**Deep Analysis Example:**
```json
{
  "name": "deep_platform_analysis", 
  "arguments": {
    "platform": "twitter",
    "query": "artificial intelligence ethics",
    "analysisType": "topic_deep_dive",
    "extractAudio": false,
    "extractImages": true,
    "trackInfluencers": true,
    "timeWindow": "30d",
    "maxPosts": 500
  }
}
```

### 📈 Sentiment Evolution Tracking (`sentiment_evolution_tracker`)

This temporal analysis tool tracks how sentiment evolves over time, identifying trends, patterns, and inflection points in public opinion. Unlike static sentiment analysis, this provides dynamic insights into opinion shifts and their causes.

The tracking system monitors sentiment changes across different time granularities (hourly, daily, weekly), identifies events that influence sentiment shifts, calculates volatility and stability metrics, and predicts future sentiment trends based on historical patterns. Event correlation analysis helps identify what drives sentiment changes, whether it's product announcements, competitor actions, media coverage, or community events.

**Evolution Tracking Example:**
```json
{
  "name": "sentiment_evolution_tracker",
  "arguments": {
    "platform": "all",
    "topic": "electric vehicles",
    "timeGranularity": "daily", 
    "trackingPeriod": "90d",
    "includeEvents": true,
    "predictTrends": true
  }
}
```

The output provides comprehensive temporal analysis including sentiment timeline with data points and trend lines, volatility analysis and pattern recognition, event correlation with impact assessment, peak and trough identification with explanations, and predictive modeling for future sentiment direction. This enables proactive strategy adjustments based on predicted opinion shifts.

### 👑 Expert Identification (`expert_identification`)

This advanced tool identifies and scores expert voices within social conversations, distinguishing between authoritative sources and general audience reactions. This is crucial for understanding whose opinions carry the most weight and influence in specific domains.

The expert identification system uses multi-criteria scoring that considers follower count and reach, engagement rate and interaction quality, content quality and expertise signals, verification status and credentials, network centrality and influence paths, and historical accuracy and credibility. The system weights these factors appropriately for each platform and topic domain.

Expert categorization separates voices into different authority levels. High authority experts include verified industry leaders, academic researchers, professional practitioners with demonstrated expertise, and established thought leaders with consistent track records. Medium authority experts include active community contributors, emerging voices with growing influence, and specialists in niche areas. Emerging experts include new voices with strong expertise signals, community members gaining recognition, and potential future influencers.

**Expert Identification Example:**
```json
{
  "name": "expert_identification",
  "arguments": {
    "platform": "twitter",
    "topic": "machine learning",
    "scoringCriteria": ["expertise_signals", "engagement_rate", "network_centrality"],
    "minAuthorityScore": 0.7,
    "includeMetrics": true,
    "maxExperts": 25
  }
}
```

### 🌐 Cross-Platform Synthesis (`cross_platform_synthesis`)

This strategic analysis tool synthesizes insights across multiple platforms to identify universal themes, platform-specific patterns, and content flow between different social ecosystems. This provides a comprehensive view of how conversations evolve and spread across the social media landscape.

The synthesis process performs several types of analysis. Theme convergence analysis identifies topics and sentiments that appear consistently across platforms, revealing universal concerns or interests. Platform comparison analysis examines how the same topic is discussed differently on each platform, showing audience segmentation and platform-specific behaviors. Audience segmentation analysis maps different demographic and psychographic groups to their preferred platforms and communication styles. Content flow analysis tracks how information and trends move between platforms, identifying viral pathways and influence patterns.

**Synthesis Example:**
```json
{
  "name": "cross_platform_synthesis",
  "arguments": {
    "topic": "sustainable technology",
    "platforms": ["twitter", "reddit", "tiktok", "instagram"],
    "synthesisType": "theme_convergence",
    "identifyGaps": true,
    "includeMetrics": true
  }
}
```

The output provides strategic insights including convergent themes that appear across platforms, platform-specific discussion patterns and characteristics, audience segmentation with demographic insights, viral pathway analysis showing content flow patterns, gap identification revealing missing conversations or audiences, and strategic recommendations for content and engagement strategies.

### 🎨 Integration and Workflow

These advanced analysis tools are designed to work together seamlessly, providing complementary insights that build a comprehensive understanding of social conversations. A typical analysis workflow might start with deep platform analysis to understand the overall landscape, followed by expert identification to find authoritative voices, then opinion clustering to understand the diversity of viewpoints, with sentiment evolution tracking to understand temporal patterns, and finally cross-platform synthesis to develop strategic insights.

The tools can be used independently for specific analysis needs or combined for comprehensive research projects. Each tool provides structured JSON output that can be easily integrated into business intelligence systems, reporting dashboards, or further analysis workflows. The system maintains consistent data formats and metadata across all tools, enabling seamless integration and comparison of results.

## 📊 Advanced Analysis Output Examples

### Enhanced Content Analysis Output

The enhanced analysis provides comprehensive multi-layered insights in a structured format:

```json
{
  "baseAnalysis": {
    "sentiment": {"positive": 65, "neutral": 20, "negative": 15},
    "themes": ["user_experience", "pricing", "features"],
    "totalComments": 347
  },
  "opinionClusters": [
    {
      "clusterId": 1,
      "theme": "Positive User Experience",
      "size": 156,
      "percentage": "45.0",
      "sentiment": {"score": "0.73", "label": "positive"},
      "examples": [
        {"text": "This app changed my workflow completely", "likes": 23, "author": "user123"}
      ],
      "keyPhrases": ["easy to use", "great interface", "highly recommend"]
    }
  ],
  "expertVoices": [
    {
      "username": "techexpert_ai",
      "authorityScore": "0.847",
      "metrics": {
        "followerEstimate": 45000,
        "verificationStatus": "verified",
        "expertiseIndicators": ["frequent_poster", "technical_language", "industry_connections"]
      }
    }
  ],
  "analysisMetadata": {
    "completenessScore": "92.5%",
    "analysisDepth": "comprehensive",
    "verticalSliceApproach": true,
    "processingTime": "3.247s"
  }
}
```

### Deep Platform Analysis Output

Platform-specific analysis reveals unique behavioral patterns and community characteristics:

```json
{
  "platform": "reddit",
  "query": "productivity apps",
  "contentLayers": {
    "textAnalysis": {
      "totalWords": 25847,
      "averageLength": 187,
      "keyTerms": ["notion", "obsidian", "productivity", "workflow"]
    },
    "engagementLayer": {
      "totalLikes": 12456,
      "averageEngagement": 78.3,
      "discussionDepth": 4.7
    },
    "authorityLayer": {
      "topInfluencers": [
        {
          "username": "productivity_guru",
          "followers": 75000,
          "authorityScore": "0.89"
        }
      ]
    }
  },
  "verticalInsights": {
    "platformSpecific": {
      "dominantContentType": "text",
      "communityBehavior": {
        "averageResponseTime": "2.3 hours",
        "discussionDepth": 4.7,
        "viralityFactors": ["detailed_reviews", "comparison_posts", "tutorials"]
      }
    },
    "thematicAnalysis": {
      "primaryThemes": [
        {"theme": "Feature Comparisons", "prevalence": "35%", "sentiment": "neutral"},
        {"theme": "User Experience", "prevalence": "28%", "sentiment": "mixed"}
      ]
    }
  }
}
```

### Cross-Platform Synthesis Output

Strategic synthesis reveals how conversations flow and evolve across different social ecosystems:

```json
{
  "topic": "remote work tools",
  "synthesisType": "theme_convergence",
  "platformsCovered": ["twitter", "reddit", "tiktok"],
  "convergentThemes": [
    {
      "theme": "Productivity Challenges",
      "platforms": ["twitter", "reddit"],
      "prevalence": "78%",
      "sentiment": "mixed",
      "keyInsights": ["time_management", "distraction_issues", "collaboration_difficulties"]
    }
  ],
  "platformSpecificThemes": [
    {
      "platform": "tiktok",
      "uniqueThemes": ["visual_productivity_tips", "workspace_aesthetics"],
      "dominantNarrative": "TikTok users focus on visual content and quick tips"
    },
    {
      "platform": "reddit", 
      "uniqueThemes": ["detailed_tool_reviews", "technical_comparisons"],
      "dominantNarrative": "Reddit users focus on detailed discussions and comprehensive analysis"
    }
  ],
  "crossPlatformInsights": {
    "contentFlow": "TikTok trends → Twitter discussions → Reddit deep analysis",
    "audienceSegmentation": {
      "casual_users": {"platforms": ["tiktok"], "size": "60%"},
      "power_users": {"platforms": ["reddit", "twitter"], "size": "25%"}
    }
  }
}
```

## 🔬 Technical Implementation Details

### Vertical Slice Architecture

The vertical slice methodology is implemented through multiple interconnected analysis layers that work together to provide comprehensive insights. The content layer extracts and analyzes text, media, and metadata from posts and comments. The engagement layer calculates interaction patterns, viral coefficients, and audience response metrics. The authority layer identifies expert voices, calculates influence scores, and maps network relationships. The temporal layer tracks changes over time, identifies trends, and predicts future patterns.

### Semantic Analysis Pipeline

The opinion clustering system uses advanced natural language processing to understand contextual meaning rather than just keyword matching. Comments are processed through embedding generation using models like OpenAI's text-embedding-ada-002, which creates vector representations that capture semantic meaning. These embeddings are then clustered using K-means algorithms to group similar opinions together. The system weights clusters by engagement metrics to understand which opinions have the most influence and reach.

### Expert Authority Scoring

The expert identification system combines multiple signals to calculate authority scores. Quantitative metrics include follower count, engagement rates, and content frequency. Qualitative signals include verification status, bio keywords indicating expertise, and network connections to other experts. Content analysis examines the use of technical language, citation of credible sources, and historical accuracy of predictions or statements. The system adapts scoring criteria based on the platform and topic domain being analyzed.

### Real-Time Processing and Caching

The system implements sophisticated caching strategies to balance real-time insights with performance requirements. Hot data (recent posts, trending topics) is processed in real-time with minimal caching. Warm data (historical trends, expert profiles) uses time-based caching with regular updates. Cold data (deep historical analysis) is cached for longer periods and updated on-demand. This approach ensures that the most relevant and time-sensitive insights are always current while maintaining acceptable response times.

## 🎯 Business Applications and Use Cases

### Brand Monitoring and Reputation Management

The advanced analysis tools enable sophisticated brand monitoring that goes beyond simple mention tracking. Companies can use sentiment evolution tracking to understand how brand perception changes over time and identify the specific events or factors that influence public opinion. Expert identification helps distinguish between influential voices that can significantly impact brand reputation and general audience chatter. Opinion clustering reveals the specific aspects of products or services that generate the most discussion and sentiment.

### Product Development and Market Research

Product teams can use these tools to understand detailed user feedback and feature requests. Deep platform analysis reveals how different user segments discuss product needs across various platforms. Cross-platform synthesis shows how product conversations evolve from initial awareness (often on visual platforms like TikTok) to detailed discussions (on platforms like Reddit) to viral spread (on Twitter). This understanding helps teams prioritize features and tailor marketing messages to different audience segments.

### Competitive Intelligence and Market Analysis

The tools provide comprehensive competitive analysis capabilities by tracking how competitors are discussed across platforms. Sentiment evolution tracking reveals how competitive actions affect market perception over time. Expert identification shows which thought leaders influence opinions about different companies or products. Cross-platform synthesis reveals how competitive information flows between different communities and platforms.

### Crisis Management and Response Planning

During crisis situations, these tools provide critical insights for response planning. Real-time sentiment tracking shows how quickly negative sentiment is spreading. Expert identification helps companies understand which voices they need to address most urgently. Opinion clustering reveals the specific concerns and misconceptions that need to be addressed in communications. Cross-platform synthesis shows how crisis information is spreading and evolving across different social ecosystems.

### Content Strategy and Community Building

Content creators and marketers can use these tools to understand what resonates with different audiences across platforms. Deep platform analysis reveals the content types and topics that generate the most engagement on each platform. Expert identification shows which voices have the most influence in specific niches. Cross-platform synthesis reveals how content spreads between platforms and which adaptation strategies work best for different audiences.

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

### Enhanced Analysis Response Object
```typescript
interface EnhancedAnalysisResponse {
  baseAnalysis: {
    sentiment: { positive: number; neutral: number; negative: number };
    themes: string[];
    totalComments: number;
  };
  verticalSliceAnalysis: {
    analysisDepth: 'surface' | 'standard' | 'deep' | 'comprehensive';
    enabledFeatures: {
      clustering: boolean;
      expertScoring: boolean;
      sentimentEvolution: boolean;
      mediaExtraction: boolean;
    };
  };
  opinionClusters?: OpinionCluster[];
  expertVoices?: ExpertProfile[];
  sentimentEvolution?: SentimentDataPoint[];
  mediaAnalysis?: MediaAnalysisResult;
  analysisMetadata: {
    completenessScore: string;
    analysisDepth: string;
    timestamp: string;
    verticalSliceApproach: boolean;
    processingTime: string;
  };
}

interface OpinionCluster {
  clusterId: number;
  theme: string;
  size: number;
  percentage: string;
  sentiment: { score: string; label: 'positive' | 'negative' | 'neutral' };
  examples: Array<{ text: string; likes: number; author: string }>;
  keyPhrases: string[];
}

interface ExpertProfile {
  username: string;
  displayName: string;
  authorityScore: string;
  metrics?: {
    postCount: number;
    avgEngagement: string;
    followerEstimate: number;
    verificationStatus: 'verified' | 'unverified';
    expertiseIndicators: string[];
    influenceScore: string;
    credibilityScore: string;
  };
  recentPosts: Array<{
    content: string;
    engagement: object;
    timestamp: string;
  }>;
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

### Extending Analysis Features

The vertical slice analysis system is designed to be extensible. To add new analysis capabilities:

1. **New Analysis Layers**: Add new analysis functions to the handlers (e.g., `handleContentAnalysis` for media-specific analysis)
2. **Custom Clustering Algorithms**: Implement alternative clustering methods in the `handleClusterOpinions` function
3. **Platform-Specific Insights**: Extend `deep_platform_analysis` with platform-specific analysis modules
4. **Additional Expert Scoring Criteria**: Add new scoring factors to the `expert_identification` system
5. **Custom Synthesis Types**: Implement new synthesis strategies in `cross_platform_synthesis`

### Integration with AI Services

The system is designed to integrate with various AI services for enhanced analysis:

```typescript
// Example OpenAI integration for clustering
const embeddings = await openai.embeddings.create({
  model: "text-embedding-ada-002",
  input: commentTexts
});

// Example sentiment analysis integration
const sentimentAnalysis = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: "Analyze sentiment and themes in these comments" },
    { role: "user", content: commentsData }
  ]
});
```

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

**"Analysis failed or returned incomplete results"**
- Verify OpenAI API key is configured if using clustering features
- Check network connectivity to social media APIs
- Review analysis depth settings - start with 'surface' for testing
- Monitor rate limits and API quotas for all platforms

**"Expert identification returned no results"**
- Ensure sufficient content volume (minimum 10-20 posts recommended)
- Lower the `minAuthorityScore` parameter for broader results
- Verify the topic has established expert voices on the platform
- Check that expert scoring criteria are appropriate for the domain

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

## 🚀 Performance and Scalability

### Analysis Performance Metrics

The enhanced analysis system is designed for both speed and depth. Performance varies by analysis type and data volume:

- **Surface Analysis**: ~0.5-2 seconds for basic content analysis
- **Standard Analysis**: ~2-5 seconds including opinion clustering
- **Deep Analysis**: ~5-15 seconds with expert identification and temporal tracking
- **Comprehensive Analysis**: ~15-45 seconds for full multi-modal processing

### Optimization Strategies

The system implements several optimization strategies to maintain performance while providing deep insights. Parallel processing enables simultaneous analysis across multiple platforms and analysis layers. Intelligent caching stores frequently accessed data and analysis results with appropriate expiration times. Selective content fetching retrieves only the most relevant content for analysis rather than processing everything. Progressive analysis allows starting with basic analysis and adding deeper layers as needed.

### Scalability Considerations

For high-volume usage, consider implementing request queuing for analysis jobs, distributed processing across multiple server instances, database storage for analysis results and caching, and API rate limit management across all platforms. The system is designed to scale horizontally with additional server instances handling different aspects of the analysis pipeline.

## 🔒 Privacy and Compliance

### Data Handling

The CrowdListen MCP server processes publicly available social media content and does not store personal data beyond what's necessary for analysis. All processed content respects platform terms of service and privacy policies. The system implements data minimization principles, processing only the content necessary for the requested analysis.

### Compliance Considerations

When using this system, consider relevant privacy regulations like GDPR, CCPA, and other regional data protection laws. Implement appropriate data retention policies based on your organization's needs and legal requirements. Ensure that any insights or reports generated respect user privacy and don't identify specific individuals unless they're public figures or have explicitly consented.

### Ethical Use Guidelines

Use the system responsibly and ethically. Don't use the analysis capabilities to target individuals for harassment or discrimination. Respect the intent and context of user-generated content. Be transparent about data collection and analysis when required. Consider the potential impact of insights and recommendations on communities and individuals.

## 📈 Roadmap and Future Enhancements

### Planned Features

Future enhancements to the CrowdListen MCP server will include real-time streaming analysis for live event monitoring, advanced media analysis with computer vision and audio processing, machine learning model integration for improved accuracy, API integrations with additional social platforms, and enhanced visualization and reporting capabilities.

### Community Contributions

The project welcomes contributions from the community. Priority areas for contribution include new platform adapters, improved analysis algorithms, additional AI service integrations, performance optimizations, and comprehensive testing frameworks. Check the project's GitHub repository for current contribution guidelines and open issues.

---

**Built with ❤️ for unified social media access and advanced social intelligence**