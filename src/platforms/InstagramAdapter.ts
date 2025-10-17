/**
 * Instagram Platform Adapter
 * Enhanced with trending discovery, removing business analytics features
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
  NotFoundError,
  TrendingHashtag
} from '../core/interfaces/SocialMediaPlatform.js';
import { IgApiClient } from 'instagram-private-api';

export class InstagramAdapter extends BaseAdapter {
  private ig: IgApiClient | null = null;
  private isLoggedIn: boolean = false;
  private username?: string;
  private password?: string;

  constructor(config: PlatformConfig) {
    super(config);
    this.username = config.credentials?.username;
    this.password = config.credentials?.password;
    this.maxRequestsPerWindow = 30; // Conservative rate limiting for Instagram
  }

  async initialize(): Promise<boolean> {
    try {
      if (!this.username || !this.password) {
        throw new AuthenticationError('instagram', new Error('Username and password required'));
      }

      this.ig = new IgApiClient();
      this.ig.state.generateDevice(this.username);
      
      await this.ig.account.login(this.username, this.password);
      this.isLoggedIn = true;
      
      this.isInitialized = true;
      this.log('Instagram adapter initialized successfully', 'info');
      return true;
      
    } catch (error) {
      this.log('Failed to initialize Instagram adapter', 'error');
      this.isInitialized = false;
      this.isLoggedIn = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      if (!this.ig) {
        throw new Error('Instagram client not initialized');
      }

      const posts: Post[] = [];
      
      // Get trending hashtags first
      const trendingHashtags = await this.getTrendingHashtags(5);
      
      // Get posts for each trending hashtag
      for (const hashtag of trendingHashtags) {
        if (posts.length >= limit) break;
        
        try {
          const hashtagPosts = await this.getHashtagPosts(
            hashtag.hashtag.replace('#', ''), 
            Math.min(5, limit - posts.length)
          );
          posts.push(...hashtagPosts);
        } catch (hashtagError) {
          this.log(`Failed to get posts for hashtag ${hashtag.hashtag}`, 'warn');
        }
      }

      // If we don't have enough posts, get from explore feed
      if (posts.length < limit) {
        try {
          const explorePosts = await this.getExplorePosts(limit - posts.length);
          posts.push(...explorePosts);
        } catch (exploreError) {
          this.log('Failed to get explore posts', 'warn');
        }
      }

      this.log(`Retrieved ${posts.length} trending Instagram posts`, 'info');
      return posts.slice(0, limit);
      
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
      
      if (!this.ig) {
        throw new Error('Instagram client not initialized');
      }

      let userPk: number;
      
      // Get user ID (pk) from username
      try {
        if (/^\d+$/.test(userId)) {
          // userId is already a numeric ID
          userPk = parseInt(userId, 10);
        } else {
          // userId is a username, need to get the pk
          userPk = await this.ig.user.getIdByUsername(userId);
        }
      } catch (userError) {
        throw new NotFoundError('instagram', `User ${userId}`, userError as Error);
      }

      const posts: Post[] = [];
      
      try {
        const userFeed = this.ig.feed.user(userPk);
        const userPosts = await userFeed.items();
        
        for (const post of userPosts.slice(0, limit)) {
          const normalizedPost = DataNormalizer.normalizePost(post, 'instagram');
          posts.push(normalizedPost);
        }
      } catch (feedError) {
        this.log(`Failed to get posts for user ${userId}`, 'warn');
      }

      this.log(`Retrieved ${posts.length} posts from Instagram user ${userId}`, 'info');
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
      
      if (!this.ig) {
        throw new Error('Instagram client not initialized');
      }

      const posts: Post[] = [];
      const cleanQuery = query.trim();
      
      if (cleanQuery.startsWith('#')) {
        // Hashtag search
        const hashtag = cleanQuery.substring(1);
        const hashtagPosts = await this.getHashtagPosts(hashtag, limit);
        posts.push(...hashtagPosts);
      } else {
        // General search (search for users and get their recent posts)
        try {
          const searchResults = await this.ig.search.users(cleanQuery);
          
          for (const user of (searchResults as any).users?.slice(0, 3) || []) { // Search top 3 users
            if (posts.length >= limit) break;
            
            try {
              const userFeed = this.ig.feed.user(user.pk);
              const userPosts = await userFeed.items();
              
              for (const post of userPosts.slice(0, Math.min(3, limit - posts.length))) {
                const normalizedPost = DataNormalizer.normalizePost(post, 'instagram');
                posts.push(normalizedPost);
              }
            } catch (userFeedError) {
              this.log(`Failed to get posts for user ${user.username}`, 'warn');
            }
          }
        } catch (searchError) {
          this.log(`Instagram search failed for query: ${query}`, 'warn');
        }
      }

      this.log(`Found ${posts.length} Instagram posts for query: ${query}`, 'info');
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
      
      if (!this.ig) {
        throw new Error('Instagram client not initialized');
      }

      const comments: Comment[] = [];
      
      try {
        const commentsFeed = this.ig.feed.mediaComments(contentId);
        const commentsData = await commentsFeed.items();
        
        for (const comment of commentsData.slice(0, limit)) {
          const normalizedComment = DataNormalizer.normalizeComment(comment, 'instagram');
          comments.push(normalizedComment);
        }
      } catch (commentError) {
        if (this.isNotFoundError(commentError)) {
          throw new NotFoundError('instagram', `Post ${contentId}`, commentError as Error);
        }
        throw commentError;
      }

      this.log(`Retrieved ${comments.length} comments for Instagram post ${contentId}`, 'info');
      return comments;
      
    } catch (error) {
      this.handleError(error, 'getContentComments');
    }
  }

  /**
   * Instagram-specific trending discovery methods
   */
  private async getTrendingHashtags(limit: number = 10): Promise<TrendingHashtag[]> {
    if (!this.ig) return [];
    
    try {
      // Sample popular accounts to find trending hashtags
      const popularAccounts = ['instagram', 'natgeo', 'theellenshow', 'cristiano', 'arianagrande'];
      const hashtagFrequency = new Map<string, number>();
      const hashtagEngagement = new Map<string, number>();
      
      for (const username of popularAccounts.slice(0, 3)) {
        try {
          const userPk = await this.ig.user.getIdByUsername(username);
          const userFeed = this.ig.feed.user(userPk);
          const posts = await userFeed.items();
          
          for (const post of posts.slice(0, 5)) {
            const caption = post.caption?.text || '';
            const hashtags = this.extractHashtags(caption);
            
            for (const hashtag of hashtags) {
              const count = hashtagFrequency.get(hashtag) || 0;
              hashtagFrequency.set(hashtag, count + 1);
              
              const engagement = (post.like_count || 0) + (post.comment_count || 0);
              const currentEngagement = hashtagEngagement.get(hashtag) || 0;
              hashtagEngagement.set(hashtag, currentEngagement + engagement);
            }
          }
        } catch (accountError) {
          this.log(`Failed to analyze account ${username}`, 'warn');
        }
      }
      
      // Convert to trending hashtags and sort by engagement
      const trendingHashtags: TrendingHashtag[] = Array.from(hashtagFrequency.entries())
        .map(([hashtag, postCount]) => ({
          hashtag,
          postCount,
          engagementScore: hashtagEngagement.get(hashtag) || 0
        }))
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, limit);
      
      return trendingHashtags;
      
    } catch (error) {
      this.log('Failed to get trending hashtags', 'warn');
      return [];
    }
  }

  private async getHashtagPosts(hashtag: string, limit: number): Promise<Post[]> {
    if (!this.ig) return [];
    
    try {
      const hashtagInfo = await (this.ig as any).hashtag(hashtag).info();
      const hashtagFeed = this.ig.feed.tags(hashtag, 'recent');
      const posts = await hashtagFeed.items();
      
      return posts.slice(0, limit).map((post: any) => 
        DataNormalizer.normalizePost(post, 'instagram')
      );
      
    } catch (error) {
      this.log(`Failed to get hashtag posts for #${hashtag}`, 'warn');
      return [];
    }
  }

  private async getExplorePosts(limit: number): Promise<Post[]> {
    if (!this.ig) return [];
    
    try {
      const exploreFeed = this.ig.feed.discover();
      const posts = await exploreFeed.items();
      
      return posts.slice(0, limit).map((post: any) => 
        DataNormalizer.normalizePost(post, 'instagram')
      );
      
    } catch (error) {
      this.log('Failed to get explore posts', 'warn');
      return [];
    }
  }

  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w\u00c0-\u024f\u1e00-\u1eff]+/gi;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map(tag => tag.toLowerCase()) : [];
  }

  getPlatformName(): PlatformType {
    return 'instagram';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true, // Enhanced functionality
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: true,
      supportsAnalysis: true
    };
  }

  /**
   * Error detection methods
   */
  protected isRateLimitError(error: any): boolean {
    return error.name === 'IgRequestsLimitError' ||
           error.message?.includes('rate limit') ||
           error.message?.includes('too many requests');
  }

  protected isAuthError(error: any): boolean {
    return error.name === 'IgLoginRequiredError' ||
           error.name === 'IgCheckpointError' ||
           error.message?.includes('login required') ||
           error.message?.includes('challenge required');
  }

  protected isNotFoundError(error: any): boolean {
    return error.name === 'IgNotFoundError' ||
           error.message?.includes('not found') ||
           error.message?.includes('user not found');
  }

  async cleanup(): Promise<void> {
    try {
      // Instagram client doesn't need explicit cleanup
      this.ig = null;
      this.isLoggedIn = false;
      await super.cleanup();
      
    } catch (error) {
      this.log('Error during Instagram cleanup', 'warn');
    }
  }
}