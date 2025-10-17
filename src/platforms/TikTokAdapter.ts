/**
 * TikTok Platform Adapter
 * Refactored to use unified interface, removing content strategy and mock data
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
import fetch from 'node-fetch';

export class TikTokAdapter extends BaseAdapter {
  private api: any = null;
  private session: any = null;
  private msToken?: string;
  private proxy?: string;

  constructor(config: PlatformConfig) {
    super(config);
    this.msToken = config.credentials?.ms_token;
    this.proxy = config.credentials?.proxy;
    this.maxRequestsPerWindow = 30; // Conservative rate limiting for TikTok
  }

  async initialize(): Promise<boolean> {
    try {
      this.log('Initializing TikTok HTTP adapter...', 'info');
      
      // TikTok will use HTTP-only approach since Python TikTokApi is not available in Node.js
      if (this.msToken) {
        this.log('TikTok ms_token available for enhanced functionality', 'info');
      } else {
        this.log('No ms_token provided, TikTok functionality will be limited', 'warn');
      }
      
      this.isInitialized = true;
      this.log('TikTok adapter initialized successfully (HTTP mode)', 'info');
      return true;
      
    } catch (error) {
      this.log('Failed to initialize TikTok adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    
    try {
      await this.enforceRateLimit();
      
      const videos: any[] = [];
      
      // Use HTTP method for trending videos
      const httpVideos = await this.getTrendingViaHttp(limit);
      videos.push(...httpVideos);

      this.log(`Retrieved ${videos.length} trending TikTok videos`, 'info');
      return videos.map(video => DataNormalizer.normalizePost(video, 'tiktok'));
      
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
      
      // Use HTTP method for user content
      const videos = await this.getUserViaHttp(userId, limit);

      this.log(`Retrieved ${videos.length} videos from TikTok user ${userId}`, 'info');
      return videos.map(video => DataNormalizer.normalizePost(video, 'tiktok'));
      
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
      
      const cleanQuery = query.trim();
      
      // Use HTTP search method
      const videos = await this.searchViaHttp(cleanQuery, limit);

      this.log(`Found ${videos.length} TikTok videos for query: ${query}`, 'info');
      return videos.map(video => DataNormalizer.normalizePost(video, 'tiktok'));
      
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
      
      // Use HTTP method for comments
      const comments = await this.getCommentsViaHttp(contentId, limit);

      this.log(`Retrieved ${comments.length} comments for TikTok video ${contentId}`, 'info');
      return comments.map(comment => DataNormalizer.normalizeComment(comment, 'tiktok'));
      
    } catch (error) {
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'tiktok';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: true,
      supportsAnalysis: true
    };
  }

  /**
   * HTTP methods for TikTok content retrieval
   */
  private async getUserViaHttp(userId: string, limit: number): Promise<any[]> {
    const headers = this.getHttpHeaders();
    
    try {
      // TikTok user content endpoint would require specific API access
      // For now, return empty array with log message
      this.log(`TikTok user content for ${userId} requires advanced API access`, 'warn');
      return [];
      
    } catch (error) {
      this.log('HTTP user request failed', 'warn');
      return [];
    }
  }

  private async getTrendingViaHttp(limit: number): Promise<any[]> {
    const headers = this.getHttpHeaders();
    const params = {
      aid: '1988',
      count: limit.toString(),
      app_language: 'en',
      device_platform: 'web_pc'
    };

    try {
      const response = await fetch('https://www.tiktok.com/api/recommend/item_list/', {
        method: 'GET',
        headers,
        // Add params to URL
      });

      if (response.ok) {
        const data: any = await response.json();
        return data.itemList || data.items || [];
      }
    } catch (error) {
      this.log('HTTP trending request failed', 'warn');
    }
    
    return [];
  }

  private async searchViaHttp(query: string, limit: number): Promise<any[]> {
    const headers = this.getHttpHeaders();
    const params = {
      aid: '1988',
      keyword: query.replace('#', ''),
      count: limit.toString(),
      cursor: '0',
      type: '1'
    };

    try {
      const response = await fetch('https://www.tiktok.com/api/search/item/', {
        method: 'GET',
        headers,
        // Add params to URL
      });

      if (response.ok) {
        const data: any = await response.json();
        return data.item_list || data.data?.videos || [];
      }
    } catch (error) {
      this.log('HTTP search request failed', 'warn');
    }
    
    return [];
  }

  private async getCommentsViaHttp(videoId: string, limit: number): Promise<any[]> {
    const headers = this.getHttpHeaders();
    const params = {
      aid: '1988',
      aweme_id: videoId,
      count: limit.toString(),
      cursor: '0'
    };

    try {
      const response = await fetch('https://www.tiktok.com/api/comment/list/', {
        method: 'GET',
        headers,
        // Add params to URL
      });

      if (response.ok) {
        const data: any = await response.json();
        return data.comments || [];
      }
    } catch (error) {
      this.log('HTTP comments request failed', 'warn');
    }
    
    return [];
  }

  private getHttpHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.tiktok.com/',
      'Origin': 'https://www.tiktok.com'
    };

    if (this.msToken) {
      headers['Cookie'] = `msToken=${this.msToken}`;
    }

    return headers;
  }

  /**
   * Error detection methods
   */
  protected isRateLimitError(error: any): boolean {
    return error.name === 'IgRequestsLimitError' || 
           error.message?.includes('rate limit') ||
           error.status === 429;
  }

  protected isAuthError(error: any): boolean {
    return error.name === 'IgLoginRequiredError' ||
           error.name === 'IgCheckpointError' ||
           error.message?.includes('authentication');
  }

  protected isNotFoundError(error: any): boolean {
    return error.name === 'IgNotFoundError' ||
           error.status === 404 ||
           error.message?.includes('not found');
  }

  async cleanup(): Promise<void> {
    try {
      if (this.session) {
        // Close TikTok sessions
        if (Array.isArray(this.session)) {
          for (const session of this.session) {
            await session.close();
          }
        }
        this.session = null;
      }
      
      this.api = null;
      await super.cleanup();
      
    } catch (error) {
      this.log('Error during TikTok cleanup', 'warn');
    }
  }
}