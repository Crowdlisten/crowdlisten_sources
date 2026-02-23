/**
 * Unified Social Media Service
 * Coordinates all platform adapters and provides a single interface
 */

import {
  SocialMediaPlatform,
  PlatformType,
  PlatformConfig,
  Post,
  Comment,
  ContentAnalysis,
  SocialMediaError
} from '../core/interfaces/SocialMediaPlatform.js';

import { TikTokAdapter } from '../platforms/TikTokAdapter.js';
import { TwitterAdapter } from '../platforms/TwitterAdapter.js';
import { RedditAdapter } from '../platforms/RedditAdapter.js';
import { InstagramAdapter } from '../platforms/InstagramAdapter.js';
import { YouTubeAdapter } from '../platforms/YouTubeAdapter.js';

export interface UnifiedServiceConfig {
  platforms: {
    tiktok?: PlatformConfig;
    twitter?: PlatformConfig;
    reddit?: PlatformConfig;
    instagram?: PlatformConfig;
    youtube?: PlatformConfig;
  };
  globalOptions?: {
    timeout?: number;
    retries?: number;
    fallbackStrategy?: 'fail' | 'continue' | 'mock';
  };
}

export class UnifiedSocialMediaService {
  private adapters: Map<PlatformType, SocialMediaPlatform> = new Map();
  private config: UnifiedServiceConfig;
  private isInitialized: boolean = false;

  constructor(config: UnifiedServiceConfig) {
    this.config = config;
  }

  /**
   * Initialize all configured platform adapters
   */
  async initialize(): Promise<{ [key in PlatformType]?: boolean }> {
    const results: { [key in PlatformType]?: boolean } = {};

    // Initialize TikTok
    if (this.config.platforms.tiktok) {
      try {
        const adapter = new TikTokAdapter(this.config.platforms.tiktok);
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set('tiktok', adapter);
        }
        results.tiktok = success;
      } catch (error) {
        console.error('Failed to initialize TikTok adapter:', error);
        results.tiktok = false;
      }
    }

    // Initialize Twitter
    if (this.config.platforms.twitter) {
      try {
        const adapter = new TwitterAdapter(this.config.platforms.twitter);
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set('twitter', adapter);
        }
        results.twitter = success;
      } catch (error) {
        console.error('Failed to initialize Twitter adapter:', error);
        results.twitter = false;
      }
    }

    // Initialize Reddit
    if (this.config.platforms.reddit) {
      try {
        const adapter = new RedditAdapter(this.config.platforms.reddit);
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set('reddit', adapter);
        }
        results.reddit = success;
      } catch (error) {
        console.error('Failed to initialize Reddit adapter:', error);
        results.reddit = false;
      }
    }

    // Initialize Instagram
    if (this.config.platforms.instagram) {
      try {
        const adapter = new InstagramAdapter(this.config.platforms.instagram);
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set('instagram', adapter);
        }
        results.instagram = success;
      } catch (error) {
        console.error('Failed to initialize Instagram adapter:', error);
        results.instagram = false;
      }
    }

    // Initialize YouTube
    if (this.config.platforms.youtube) {
      try {
        const adapter = new YouTubeAdapter(this.config.platforms.youtube);
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set('youtube', adapter);
        }
        results.youtube = success;
      } catch (error) {
        console.error('Failed to initialize YouTube adapter:', error);
        results.youtube = false;
      }
    }

    this.isInitialized = true;
    console.log(`Unified Service initialized with ${this.adapters.size} platforms:`,
                Array.from(this.adapters.keys()));
    
    return results;
  }

  /**
   * Get trending content from a specific platform
   */
  async getTrendingContent(platform: PlatformType, limit?: number): Promise<Post[]> {
    const adapter = this.getAdapter(platform);
    return await adapter.getTrendingContent(limit);
  }

  /**
   * Get trending content from all available platforms
   */
  async getAllTrendingContent(limit?: number): Promise<{ [key in PlatformType]?: Post[] }> {
    const results: { [key in PlatformType]?: Post[] } = {};
    const limitPerPlatform = limit ? Math.ceil(limit / this.adapters.size) : 10;

    const promises = Array.from(this.adapters.entries()).map(async ([platform, adapter]) => {
      try {
        const posts = await adapter.getTrendingContent(limitPerPlatform);
        results[platform] = posts;
      } catch (error) {
        console.error(`Failed to get trending content from ${platform}:`, error);
        if (this.config.globalOptions?.fallbackStrategy === 'continue') {
          results[platform] = [];
        }
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get user content from a specific platform
   */
  async getUserContent(platform: PlatformType, userId: string, limit?: number): Promise<Post[]> {
    const adapter = this.getAdapter(platform);
    return await adapter.getUserContent(userId, limit);
  }

  /**
   * Get user content from all available platforms
   */
  async getAllUserContent(userId: string, limit?: number): Promise<{ [key in PlatformType]?: Post[] }> {
    const results: { [key in PlatformType]?: Post[] } = {};
    const limitPerPlatform = limit ? Math.ceil(limit / this.adapters.size) : 10;

    const promises = Array.from(this.adapters.entries()).map(async ([platform, adapter]) => {
      try {
        const posts = await adapter.getUserContent(userId, limitPerPlatform);
        results[platform] = posts;
      } catch (error) {
        console.error(`Failed to get user content from ${platform}:`, error);
        if (this.config.globalOptions?.fallbackStrategy === 'continue') {
          results[platform] = [];
        }
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Search content on a specific platform
   */
  async searchContent(platform: PlatformType, query: string, limit?: number): Promise<Post[]> {
    const adapter = this.getAdapter(platform);
    return await adapter.searchContent(query, limit);
  }

  /**
   * Search content across all available platforms
   */
  async searchAllPlatforms(query: string, limit?: number): Promise<{ [key in PlatformType]?: Post[] }> {
    const results: { [key in PlatformType]?: Post[] } = {};
    const limitPerPlatform = limit ? Math.ceil(limit / this.adapters.size) : 10;

    const promises = Array.from(this.adapters.entries()).map(async ([platform, adapter]) => {
      try {
        const posts = await adapter.searchContent(query, limitPerPlatform);
        results[platform] = posts;
      } catch (error) {
        console.error(`Failed to search ${platform} for "${query}":`, error);
        if (this.config.globalOptions?.fallbackStrategy === 'continue') {
          results[platform] = [];
        }
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get comments for content on a specific platform
   */
  async getContentComments(platform: PlatformType, contentId: string, limit?: number): Promise<Comment[]> {
    const adapter = this.getAdapter(platform);
    return await adapter.getContentComments(contentId, limit);
  }

  /**
   * Analyze content on a specific platform
   */
  async analyzeContent(platform: PlatformType, contentId: string, enableClustering: boolean = true): Promise<ContentAnalysis> {
    const adapter = this.getAdapter(platform);
    return await adapter.analyzeContent(contentId, enableClustering);
  }

  /**
   * Get available platforms and their capabilities
   */
  getAvailablePlatforms(): { [key in PlatformType]?: any } {
    const platforms: { [key in PlatformType]?: any } = {};
    
    for (const [platform, adapter] of this.adapters) {
      platforms[platform] = {
        name: platform,
        capabilities: adapter.getSupportedFeatures(),
        initialized: true
      };
    }
    
    return platforms;
  }

  /**
   * Get combined trending content with platform attribution
   */
  async getCombinedTrendingContent(limit: number = 30): Promise<Post[]> {
    const allTrending = await this.getAllTrendingContent(limit);
    const combinedPosts: Post[] = [];
    
    // Combine posts from all platforms
    for (const [platform, posts] of Object.entries(allTrending)) {
      if (posts && Array.isArray(posts)) {
        combinedPosts.push(...posts);
      }
    }
    
    // Sort by engagement (likes + comments) and timestamp
    combinedPosts.sort((a, b) => {
      const aEngagement = (a.engagement.likes || 0) + (a.engagement.comments || 0);
      const bEngagement = (b.engagement.likes || 0) + (b.engagement.comments || 0);
      
      if (aEngagement !== bEngagement) {
        return bEngagement - aEngagement; // Higher engagement first
      }
      
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); // Newer first
    });
    
    return combinedPosts.slice(0, limit);
  }

  /**
   * Search across all platforms and return combined results
   */
  async getCombinedSearchResults(query: string, limit: number = 30): Promise<Post[]> {
    const allResults = await this.searchAllPlatforms(query, limit);
    const combinedPosts: Post[] = [];
    
    // Combine posts from all platforms
    for (const [platform, posts] of Object.entries(allResults)) {
      if (posts && Array.isArray(posts)) {
        combinedPosts.push(...posts);
      }
    }
    
    // Sort by relevance (simple text matching) and engagement
    combinedPosts.sort((a, b) => {
      const aRelevance = this.calculateRelevance(a.content, query);
      const bRelevance = this.calculateRelevance(b.content, query);
      
      if (aRelevance !== bRelevance) {
        return bRelevance - aRelevance;
      }
      
      const aEngagement = (a.engagement.likes || 0) + (a.engagement.comments || 0);
      const bEngagement = (b.engagement.likes || 0) + (b.engagement.comments || 0);
      return bEngagement - aEngagement;
    });
    
    return combinedPosts.slice(0, limit);
  }

  /**
   * Platform health check
   */
  async healthCheck(): Promise<{ [key in PlatformType]?: 'healthy' | 'degraded' | 'down' }> {
    const health: { [key in PlatformType]?: 'healthy' | 'degraded' | 'down' } = {};
    
    const promises = Array.from(this.adapters.entries()).map(async ([platform, adapter]) => {
      try {
        // Try to get a small amount of trending content as a health check
        await adapter.getTrendingContent(1);
        health[platform] = 'healthy';
      } catch (error) {
        console.warn(`Health check failed for ${platform}:`, error);
        health[platform] = 'down';
      }
    });
    
    await Promise.allSettled(promises);
    return health;
  }

  /**
   * Cleanup all adapters
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.cleanup().catch(error => 
        console.warn('Cleanup error:', error)
      )
    );
    
    await Promise.allSettled(cleanupPromises);
    this.adapters.clear();
    this.isInitialized = false;
    console.log('Unified Social Media Service cleaned up');
  }

  /**
   * Private helper methods
   */
  private getAdapter(platform: PlatformType): SocialMediaPlatform {
    if (!this.isInitialized) {
      throw new SocialMediaError(
        'Service not initialized',
        'NOT_INITIALIZED',
        'tiktok' // Default platform for service-level errors
      );
    }
    
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new SocialMediaError(
        `Platform ${platform} not available`,
        'PLATFORM_NOT_AVAILABLE',
        platform
      );
    }
    
    return adapter;
  }

  private calculateRelevance(content: string, query: string): number {
    if (!content || !query) return 0;
    
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    let score = 0;
    
    // Exact match gets highest score
    if (contentLower.includes(queryLower)) {
      score += 10;
    }
    
    // Individual word matches
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 2;
      }
    }
    
    return score;
  }
}