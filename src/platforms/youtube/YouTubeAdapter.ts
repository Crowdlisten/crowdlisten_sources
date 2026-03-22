/**
 * YouTube Platform Adapter
 * Uses YouTube Data API v3 for video search, trending, comments, and channel content
 */

import { BaseAdapter } from '../../core/base/BaseAdapter.js';
import { DataNormalizer } from '../../core/utils/DataNormalizer.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  NotFoundError
} from '../../core/interfaces/SocialMediaPlatform.js';
import axios, { AxiosInstance } from 'axios';

export class YouTubeAdapter extends BaseAdapter {
  private client: AxiosInstance | null = null;
  private apiKey: string = '';

  constructor(config: PlatformConfig) {
    super(config);
    // YouTube API quota is 10,000 units/day; keep requests conservative
    this.maxRequestsPerWindow = 20;
  }

  async initialize(): Promise<boolean> {
    try {
      this.apiKey = this.config.credentials?.apiKey || process.env.YOUTUBE_API_KEY || '';

      if (!this.apiKey) {
        this.log('No YouTube API key provided', 'warn');
        return false;
      }

      this.client = axios.create({
        baseURL: 'https://www.googleapis.com/youtube/v3',
        timeout: 15000
      });

      this.isInitialized = true;
      this.log('YouTube adapter initialized successfully');
      return true;
    } catch (error) {
      this.log('Failed to initialize YouTube adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();

      const response = await this.client!.get('/videos', {
        params: {
          part: 'snippet,statistics',
          chart: 'mostPopular',
          regionCode: 'US',
          maxResults: Math.min(limit, 50),
          key: this.apiKey
        }
      });

      const posts: Post[] = [];
      for (const item of (response.data.items || []).slice(0, limit)) {
        posts.push(DataNormalizer.normalizePost(item, 'youtube'));
      }

      this.log(`Retrieved ${posts.length} trending YouTube videos`);
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

      // First resolve the channel ID — userId could be a channel ID or a handle
      let channelId = userId;
      if (!userId.startsWith('UC')) {
        const handle = userId.startsWith('@') ? userId : `@${userId}`;
        const channelRes = await this.client!.get('/channels', {
          params: {
            part: 'id',
            forHandle: handle,
            key: this.apiKey
          }
        });
        channelId = channelRes.data.items?.[0]?.id;
        if (!channelId) {
          throw new NotFoundError('youtube', `Channel ${userId}`);
        }
      }

      await this.enforceRateLimit();

      // Search for videos on this channel
      const response = await this.client!.get('/search', {
        params: {
          part: 'snippet',
          channelId,
          type: 'video',
          order: 'date',
          maxResults: Math.min(limit, 50),
          key: this.apiKey
        }
      });

      // Get video statistics in a separate call
      const videoIds = (response.data.items || [])
        .map((item: any) => item.id?.videoId)
        .filter(Boolean)
        .join(',');

      let statsMap: Record<string, any> = {};
      if (videoIds) {
        await this.enforceRateLimit();
        const statsRes = await this.client!.get('/videos', {
          params: {
            part: 'statistics',
            id: videoIds,
            key: this.apiKey
          }
        });
        for (const v of statsRes.data.items || []) {
          statsMap[v.id] = v.statistics;
        }
      }

      const posts: Post[] = [];
      for (const item of (response.data.items || []).slice(0, limit)) {
        const videoId = item.id?.videoId;
        const merged = {
          id: videoId,
          snippet: item.snippet,
          statistics: statsMap[videoId] || {}
        };
        posts.push(DataNormalizer.normalizePost(merged, 'youtube'));
      }

      this.log(`Retrieved ${posts.length} videos from YouTube channel ${userId}`);
      return posts;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('youtube', `Channel ${userId}`, error as Error);
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

      const response = await this.client!.get('/search', {
        params: {
          part: 'snippet',
          q: query.trim(),
          type: 'video',
          order: 'relevance',
          maxResults: Math.min(limit, 50),
          key: this.apiKey
        }
      });

      // Get video statistics
      const videoIds = (response.data.items || [])
        .map((item: any) => item.id?.videoId)
        .filter(Boolean)
        .join(',');

      let statsMap: Record<string, any> = {};
      if (videoIds) {
        await this.enforceRateLimit();
        const statsRes = await this.client!.get('/videos', {
          params: {
            part: 'statistics',
            id: videoIds,
            key: this.apiKey
          }
        });
        for (const v of statsRes.data.items || []) {
          statsMap[v.id] = v.statistics;
        }
      }

      const posts: Post[] = [];
      for (const item of (response.data.items || []).slice(0, limit)) {
        const videoId = item.id?.videoId;
        const merged = {
          id: videoId,
          snippet: item.snippet,
          statistics: statsMap[videoId] || {}
        };
        posts.push(DataNormalizer.normalizePost(merged, 'youtube'));
      }

      this.log(`Found ${posts.length} YouTube videos for query: ${query}`);
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

      const response = await this.client!.get('/commentThreads', {
        params: {
          part: 'snippet,replies',
          videoId: contentId,
          maxResults: Math.min(limit, 100),
          order: 'relevance',
          key: this.apiKey
        }
      });

      const comments: Comment[] = [];
      for (const item of (response.data.items || []).slice(0, limit)) {
        comments.push(DataNormalizer.normalizeComment(item, 'youtube'));
      }

      this.log(`Retrieved ${comments.length} comments for YouTube video ${contentId}`);
      return comments;
    } catch (error) {
      if ((error as any).response?.status === 403 &&
          (error as any).response?.data?.error?.errors?.[0]?.reason === 'commentsDisabled') {
        this.log(`Comments are disabled for video ${contentId}`, 'warn');
        return [];
      }
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'youtube';
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

  protected isRateLimitError(error: any): boolean {
    return error.response?.status === 429 ||
           error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded' ||
           error.response?.data?.error?.errors?.[0]?.reason === 'rateLimitExceeded';
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
      this.log('Error during YouTube cleanup', 'warn');
    }
  }
}
