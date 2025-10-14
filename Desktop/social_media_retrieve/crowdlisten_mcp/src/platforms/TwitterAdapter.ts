/**
 * Twitter Platform Adapter
 * Refactored to use unified interface, removing user interactions (read-only)
 */

import { BaseAdapter } from '../core/base/BaseAdapter.js';
import { DataNormalizer } from '../core/utils/DataNormalizer.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  AuthenticationError,
  NotFoundError
} from '../core/interfaces/SocialMediaPlatform.js';
import { TwitterApi, TweetV2, UserV2 } from 'twitter-api-v2';

export class TwitterAdapter extends BaseAdapter {
  private client: TwitterApi | null = null;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 100; // Twitter's rate limits are generally higher
  }

  async initialize(): Promise<boolean> {
    try {
      const credentials = this.config.credentials;
      
      if (!credentials?.apiKey || !credentials?.apiSecret || 
          !credentials?.accessToken || !credentials?.accessSecret) {
        throw new AuthenticationError('twitter', new Error('Missing Twitter credentials'));
      }

      this.client = new TwitterApi({
        appKey: credentials.apiKey,
        appSecret: credentials.apiSecret,
        accessToken: credentials.accessToken,
        accessSecret: credentials.accessSecret,
      });

      // Test the connection
      try {
        await this.client.v2.me();
        this.log('Twitter API connection verified', 'info');
      } catch (authError) {
        throw new AuthenticationError('twitter', authError as Error);
      }

      this.isInitialized = true;
      this.log('Twitter adapter initialized successfully', 'info');
      return true;
      
    } catch (error) {
      this.log('Failed to initialize Twitter adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      if (!this.client) {
        throw new Error('Twitter client not initialized');
      }

      // Get trending topics first
      const trends = await this.client.v1.trendsAvailable();
      const worldwideTrends = trends.find(location => location.woeid === 1);
      
      if (!worldwideTrends) {
        throw new Error('Could not fetch trending topics');
      }

      // Search for tweets from trending topics
      const trendingPosts: Post[] = [];
      const trendingTopics = (worldwideTrends as any).trends?.slice(0, 3) || []; // Get top 3 trends
      
      for (const trend of trendingTopics) {
        if (trendingPosts.length >= limit) break;
        
        try {
          const searchResult = await this.client.v2.search(trend.name || '', {
            max_results: Math.min(10, limit - trendingPosts.length),
            'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
            'user.fields': ['name', 'username', 'verified', 'public_metrics']
          });

          if (searchResult.data?.data) {
            const posts = searchResult.data.data.map(tweet => 
              DataNormalizer.normalizePost({
                ...tweet,
                author: searchResult.includes?.users?.find(u => u.id === tweet.author_id)
              }, 'twitter')
            );
            trendingPosts.push(...posts);
          }
        } catch (searchError) {
          this.log(`Failed to search for trend: ${trend.name}`, 'warn');
        }
      }

      this.log(`Retrieved ${trendingPosts.length} trending Twitter posts`, 'info');
      return trendingPosts.slice(0, limit);
      
    } catch (error) {
      this.handleError(error, 'getTrendingContent');
    }
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      if (!this.client) {
        throw new Error('Twitter client not initialized');
      }

      // Get user timeline
      const timeline = await this.client.v2.userTimeline(userId, {
        max_results: limit,
        exclude: ['retweets', 'replies'],
        'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
        'user.fields': ['name', 'username', 'verified', 'public_metrics']
      });

      if (!timeline.data?.data) {
        this.log(`No tweets found for user ${userId}`, 'info');
        return [];
      }

      // Get user info for author data
      let userInfo: UserV2 | undefined;
      try {
        const userResult = await this.client.v2.user(userId);
        userInfo = userResult.data;
      } catch (userError) {
        this.log('Could not fetch user info', 'warn');
      }

      const posts = timeline.data.data.map(tweet => 
        DataNormalizer.normalizePost({
          ...tweet,
          author: userInfo || { id: userId, username: userId }
        }, 'twitter')
      );

      this.log(`Retrieved ${posts.length} tweets from user ${userId}`, 'info');
      return posts;
      
    } catch (error) {
      this.handleError(error, 'getUserContent');
    }
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }
    
    try {
      await this.enforceRateLimit();
      
      if (!this.client) {
        throw new Error('Twitter client not initialized');
      }

      const searchResult = await this.client.v2.search(query.trim(), {
        max_results: limit,
        'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
        'user.fields': ['name', 'username', 'verified', 'public_metrics'],
        expansions: ['author_id']
      });

      if (!searchResult.data?.data) {
        this.log(`No tweets found for query: ${query}`, 'info');
        return [];
      }

      const posts = searchResult.data.data.map(tweet => 
        DataNormalizer.normalizePost({
          ...tweet,
          author: searchResult.includes?.users?.find(u => u.id === tweet.author_id) || 
                  { id: tweet.author_id || '', username: 'unknown' }
        }, 'twitter')
      );

      this.log(`Found ${posts.length} tweets for query: ${query}`, 'info');
      return posts;
      
    } catch (error) {
      this.handleError(error, 'searchContent');
    }
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      if (!this.client) {
        throw new Error('Twitter client not initialized');
      }

      // Twitter doesn't have traditional comments, but we can get replies
      // Search for tweets that are replies to the original tweet
      const searchQuery = `conversation_id:${contentId}`;
      
      const repliesResult = await this.client.v2.search(searchQuery, {
        max_results: limit,
        'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text', 'in_reply_to_user_id'],
        'user.fields': ['name', 'username', 'verified'],
        expansions: ['author_id']
      });

      if (!repliesResult.data?.data) {
        this.log(`No replies found for tweet ${contentId}`, 'info');
        return [];
      }

      const comments = repliesResult.data.data
        .filter(tweet => tweet.in_reply_to_user_id) // Only actual replies
        .map(tweet => 
          DataNormalizer.normalizeComment({
            ...tweet,
            author: repliesResult.includes?.users?.find(u => u.id === tweet.author_id) || 
                    { id: tweet.author_id || '', username: 'unknown' }
          }, 'twitter')
        );

      this.log(`Retrieved ${comments.length} replies for tweet ${contentId}`, 'info');
      return comments;
      
    } catch (error) {
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'twitter';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: true, // Twitter replies as comments
      supportsAnalysis: true
    };
  }

  /**
   * Error detection methods
   */
  protected isRateLimitError(error: any): boolean {
    return error.code === 88 || // Twitter rate limit code
           error.message?.includes('rate limit') ||
           error.rateLimit;
  }

  protected isAuthError(error: any): boolean {
    return error.code === 89 || // Twitter auth error code
           error.code === 401 ||
           error.message?.includes('authentication') ||
           error.message?.includes('unauthorized');
  }

  protected isNotFoundError(error: any): boolean {
    return error.code === 50 || // Twitter not found code
           error.code === 404 ||
           error.message?.includes('not found');
  }

  async cleanup(): Promise<void> {
    try {
      // Twitter API client doesn't need explicit cleanup
      this.client = null;
      await super.cleanup();
      
    } catch (error) {
      this.log('Error during Twitter cleanup', 'warn');
    }
  }
}