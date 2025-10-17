/**
 * Simple Reddit Platform Adapter
 * Uses Reddit's public JSON API for basic functionality
 */

import { BaseAdapter } from '../core/base/BaseAdapter.js';
import { DataNormalizer } from '../core/utils/DataNormalizer.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  NotFoundError
} from '../core/interfaces/SocialMediaPlatform.js';
import axios from 'axios';

export class RedditAdapter extends BaseAdapter {
  private client: any = null;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 60;
  }

  async initialize(): Promise<boolean> {
    try {
      this.client = axios.create({
        baseURL: 'https://www.reddit.com',
        headers: {
          'User-Agent': 'crowdlisten-mcp/1.0.0'
        },
        timeout: 10000
      });
      
      this.isInitialized = true;
      this.log('Reddit adapter initialized successfully (HTTP access)', 'info');
      return true;
      
    } catch (error) {
      this.log('Failed to initialize Reddit adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      const response = await this.client.get('/r/popular.json', {
        params: { limit }
      });
      
      const posts: Post[] = [];
      const items = response.data?.data?.children || [];
      
      for (const item of items.slice(0, limit)) {
        const postData = item.data;
        const post = DataNormalizer.normalizePost({
          id: postData.id,
          title: postData.title,
          selftext: postData.selftext || '',
          author: postData.author,
          score: postData.score,
          num_comments: postData.num_comments,
          created_utc: postData.created_utc,
          permalink: postData.permalink,
          url: postData.url || `https://reddit.com${postData.permalink}`,
          subreddit: postData.subreddit
        }, 'reddit');
        
        posts.push(post);
      }

      this.log(`Retrieved ${posts.length} trending Reddit posts`, 'info');
      return posts;
      
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
      
      const response = await this.client.get(`/user/${userId}.json`, {
        params: { limit }
      });
      
      const posts: Post[] = [];
      const items = response.data?.data?.children || [];
      
      for (const item of items.slice(0, limit)) {
        const postData = item.data;
        if (postData.title) { // Only posts, not comments
          const post = DataNormalizer.normalizePost({
            id: postData.id,
            title: postData.title,
            selftext: postData.selftext || '',
            author: postData.author || userId,
            score: postData.score,
            num_comments: postData.num_comments,
            created_utc: postData.created_utc,
            permalink: postData.permalink,
            url: postData.url || `https://reddit.com${postData.permalink}`,
            subreddit: postData.subreddit
          }, 'reddit');
          
          posts.push(post);
        }
      }

      this.log(`Retrieved ${posts.length} posts from Reddit user ${userId}`, 'info');
      return posts;
      
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('reddit', `User ${userId}`, error as Error);
      }
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
      
      const response = await this.client.get('/search.json', {
        params: { 
          q: query.trim(),
          limit,
          sort: 'relevance',
          type: 'link'
        }
      });
      
      const posts: Post[] = [];
      const items = response.data?.data?.children || [];
      
      for (const item of items.slice(0, limit)) {
        const postData = item.data;
        const post = DataNormalizer.normalizePost({
          id: postData.id,
          title: postData.title,
          selftext: postData.selftext || '',
          author: postData.author,
          score: postData.score,
          num_comments: postData.num_comments,
          created_utc: postData.created_utc,
          permalink: postData.permalink,
          url: postData.url || `https://reddit.com${postData.permalink}`,
          subreddit: postData.subreddit
        }, 'reddit');
        
        posts.push(post);
      }

      this.log(`Found ${posts.length} Reddit posts for query: ${query}`, 'info');
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
      
      // Reddit comments require the full post URL structure
      this.log(`Reddit comments for ${contentId} require post context - returning empty array`, 'warn');
      return [];
      
    } catch (error) {
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'reddit';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: false, // Limited due to Reddit API structure
      supportsAnalysis: true
    };
  }

  protected isRateLimitError(error: any): boolean {
    return error.response?.status === 429 ||
           error.message?.includes('rate limit');
  }

  protected isAuthError(error: any): boolean {
    return error.response?.status === 401 ||
           error.response?.status === 403;
  }

  protected isNotFoundError(error: any): boolean {
    return error.response?.status === 404;
  }

  async cleanup(): Promise<void> {
    try {
      this.client = null;
      await super.cleanup();
      
    } catch (error) {
      this.log('Error during Reddit cleanup', 'warn');
    }
  }
}