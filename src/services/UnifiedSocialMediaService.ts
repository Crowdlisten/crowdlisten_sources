/**
 * Unified Social Media Service
 * Coordinates all platform adapters and provides a single interface.
 * Each platform has one adapter — no visual vs legacy distinction.
 */

import {
  SocialMediaPlatform,
  PlatformType,
  PlatformConfig,
  Post,
  Comment,
  SocialMediaError
} from '../core/interfaces/SocialMediaPlatform.js';

import { TwitterAdapter } from '../platforms/twitter/TwitterAdapter.js';
import { RedditAdapter } from '../platforms/reddit/RedditAdapter.js';
import { YouTubeAdapter } from '../platforms/youtube/YouTubeAdapter.js';
import { MoltbookAdapter } from '../platforms/moltbook/MoltbookAdapter.js';
import { TikTokAdapter } from '../platforms/tiktok/TikTokAdapter.js';
import { InstagramAdapter } from '../platforms/instagram/InstagramAdapter.js';
import { XiaohongshuAdapter } from '../platforms/xiaohongshu/XiaohongshuAdapter.js';
import { getBrowserPool } from '../browser/BrowserPool.js';

export interface UnifiedServiceConfig {
  platforms: {
    tiktok?: PlatformConfig;
    twitter?: PlatformConfig;
    reddit?: PlatformConfig;
    instagram?: PlatformConfig;
    youtube?: PlatformConfig;
    moltbook?: PlatformConfig;
    xiaohongshu?: PlatformConfig;
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
   * Initialize all configured platform adapters.
   * One adapter per platform — flat, no tiers.
   */
  async initialize(): Promise<{ [key in PlatformType]?: boolean }> {
    const results: { [key in PlatformType]?: boolean } = {};

    const adapterMap: Array<{ platform: PlatformType; create: () => SocialMediaPlatform }> = [
      { platform: 'twitter', create: () => new TwitterAdapter(this.config.platforms.twitter!) },
      { platform: 'tiktok', create: () => new TikTokAdapter(this.config.platforms.tiktok!) },
      { platform: 'instagram', create: () => new InstagramAdapter(this.config.platforms.instagram!) },
      { platform: 'xiaohongshu', create: () => new XiaohongshuAdapter(this.config.platforms.xiaohongshu!) },
      { platform: 'reddit', create: () => new RedditAdapter(this.config.platforms.reddit!) },
      { platform: 'youtube', create: () => new YouTubeAdapter(this.config.platforms.youtube!) },
      { platform: 'moltbook', create: () => new MoltbookAdapter(this.config.platforms.moltbook!) },
    ];

    for (const { platform, create } of adapterMap) {
      if (!this.config.platforms[platform]) continue;

      try {
        const adapter = create();
        const success = await adapter.initialize();
        if (success) {
          this.adapters.set(platform, adapter);
        }
        results[platform] = success;
      } catch (error) {
        console.error(`Failed to initialize ${platform} adapter:`, error);
        results[platform] = false;
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
   * Get the list of initialized platform types.
   * Used by HealthMonitor to know which platforms to probe.
   */
  getInitializedPlatforms(): PlatformType[] {
    return Array.from(this.adapters.keys());
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

    for (const [, posts] of Object.entries(allTrending)) {
      if (posts && Array.isArray(posts)) {
        combinedPosts.push(...posts);
      }
    }

    combinedPosts.sort((a, b) => {
      const aEngagement = (a.engagement.likes || 0) + (a.engagement.comments || 0);
      const bEngagement = (b.engagement.likes || 0) + (b.engagement.comments || 0);

      if (aEngagement !== bEngagement) {
        return bEngagement - aEngagement;
      }

      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return combinedPosts.slice(0, limit);
  }

  /**
   * Search across all platforms and return combined results
   */
  async getCombinedSearchResults(query: string, limit: number = 30): Promise<Post[]> {
    const allResults = await this.searchAllPlatforms(query, limit);
    const combinedPosts: Post[] = [];

    for (const [, posts] of Object.entries(allResults)) {
      if (posts && Array.isArray(posts)) {
        combinedPosts.push(...posts);
      }
    }

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
   * Cleanup all adapters and browser pool
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.adapters.values()).map(adapter =>
      adapter.cleanup().catch(error =>
        console.warn('Cleanup error:', error)
      )
    );

    await Promise.allSettled(cleanupPromises);

    // Cleanup browser pool if any browser-based adapters were used
    const browserPlatforms: PlatformType[] = ['tiktok', 'instagram', 'xiaohongshu'];
    const hasBrowserAdapters = browserPlatforms.some(p => this.adapters.has(p));
    if (hasBrowserAdapters) {
      try {
        const pool = getBrowserPool();
        await pool.cleanup();
      } catch (error) {
        console.warn('Browser pool cleanup error:', error);
      }
    }

    this.adapters.clear();
    this.isInitialized = false;
    console.log('Unified Social Media Service cleaned up');
  }

  private getAdapter(platform: PlatformType): SocialMediaPlatform {
    if (!this.isInitialized) {
      throw new SocialMediaError(
        'Service not initialized',
        'NOT_INITIALIZED',
        'tiktok'
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

    if (contentLower.includes(queryLower)) {
      score += 10;
    }

    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 2;
      }
    }

    return score;
  }
}
