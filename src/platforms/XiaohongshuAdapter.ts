/**
 * Xiaohongshu (RED / 小红书) Platform Adapter
 * Routes requests to CrowdListen agent backend's Xiaohongshu endpoints.
 *
 * Agent endpoints:
 * - search_xiaohongshu(question, limit, sort)
 * - get_xiaohongshu_comments(note_id_or_url, limit)
 * - get_xiaohongshu_trending(category, limit)
 *
 * Rate limit: 40 requests/min (conservative due to anti-detection)
 */

import { BaseAdapter } from '../core/base/BaseAdapter.js';
import {
  Post,
  Comment,
  User,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  NotFoundError
} from '../core/interfaces/SocialMediaPlatform.js';
import axios, { AxiosInstance } from 'axios';

export class XiaohongshuAdapter extends BaseAdapter {
  private client: AxiosInstance | null = null;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 40; // Conservative rate limit
  }

  async initialize(): Promise<boolean> {
    try {
      const baseUrl = this.config.credentials?.baseUrl || 'http://localhost:8000/agent/v1';

      this.client = axios.create({
        baseURL: baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000, // Longer timeout due to potential LLM query translation
      });

      this.isInitialized = true;
      this.log('Xiaohongshu adapter initialized successfully', 'info');
      return true;
    } catch (error) {
      this.log('Failed to initialize Xiaohongshu adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();

      const response = await this.client!.post('/tools/call', {
        tool: 'get_xiaohongshu_trending',
        args: { category: 'homefeed_recommend', limit },
      });

      const data = response.data;
      if (!data?.success) {
        this.log(`Xiaohongshu trending failed: ${data?.error}`, 'warn');
        return [];
      }

      const posts: Post[] = [];
      for (const item of (data.sources || []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Retrieved ${posts.length} trending Xiaohongshu notes`, 'info');
      return posts;
    } catch (error) {
      this.handleError(error, 'getTrendingContent');
    }
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    this.validateLimit(limit);

    // Xiaohongshu doesn't expose user content search via our agent
    // Search for the user's name instead
    try {
      await this.enforceRateLimit();

      const response = await this.client!.post('/tools/call', {
        tool: 'search_xiaohongshu',
        args: { question: userId, limit },
      });

      const data = response.data;
      if (!data?.success) {
        return [];
      }

      const posts: Post[] = [];
      for (const item of (data.sources || []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Retrieved ${posts.length} notes for Xiaohongshu user ${userId}`, 'info');
      return posts;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('xiaohongshu', `User ${userId}`, error as Error);
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

      const response = await this.client!.post('/tools/call', {
        tool: 'search_xiaohongshu',
        args: { question: query.trim(), limit },
      });

      const data = response.data;
      if (!data?.success) {
        this.log(`Xiaohongshu search failed: ${data?.error}`, 'warn');
        return [];
      }

      const posts: Post[] = [];
      for (const item of (data.sources || []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Found ${posts.length} Xiaohongshu notes for query: ${query}`, 'info');
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

      const response = await this.client!.post('/tools/call', {
        tool: 'get_xiaohongshu_comments',
        args: { note_id_or_url: contentId, limit },
      });

      const data = response.data;
      if (!data?.success) {
        this.log(`Xiaohongshu comments failed: ${data?.error}`, 'warn');
        return [];
      }

      const comments: Comment[] = [];
      for (const item of (data.sources || []).slice(0, limit)) {
        comments.push(this.normalizeComment(item));
      }

      this.log(`Retrieved ${comments.length} comments for Xiaohongshu note ${contentId}`);
      return comments;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('xiaohongshu', `Note ${contentId}`, error as Error);
      }
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'xiaohongshu';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: true,
      supportsAnalysis: true,
    };
  }

  protected isRateLimitError(error: any): boolean {
    return error.response?.status === 429 || error.message?.includes('rate limit');
  }

  protected isAuthError(error: any): boolean {
    return error.response?.status === 401 || error.response?.status === 403;
  }

  protected isNotFoundError(error: any): boolean {
    return error.response?.status === 404;
  }

  async cleanup(): Promise<void> {
    try {
      this.client = null;
      await super.cleanup();
    } catch (error) {
      this.log('Error during Xiaohongshu cleanup', 'warn');
    }
  }

  // --- Private helpers ---

  private normalizePost(raw: any): Post {
    const metadata = raw.metadata || {};

    const user: User = {
      id: metadata.author_id || metadata.author || '',
      username: metadata.author || '',
      displayName: metadata.author || '',
    };

    return {
      id: metadata.note_id || String(raw.id || ''),
      platform: 'xiaohongshu',
      author: user,
      content: raw.snippet || raw.title || '',
      engagement: {
        likes: metadata.likes || 0,
        comments: metadata.comments || 0,
        shares: metadata.collections || 0,
        views: 0,
      },
      timestamp: raw.published_at ? new Date(raw.published_at) : new Date(),
      url: raw.url || '',
      hashtags: [],
    };
  }

  private normalizeComment(raw: any): Comment {
    const metadata = raw.metadata || {};

    const user: User = {
      id: metadata.author_id || metadata.author || '',
      username: metadata.author || 'anonymous',
      displayName: metadata.author,
    };

    return {
      id: String(raw.id || ''),
      author: user,
      text: raw.snippet || raw.content || raw.text || '',
      timestamp: raw.published_at ? new Date(raw.published_at) : new Date(),
      likes: metadata.likes || 0,
      engagement: {
        upvotes: metadata.likes || 0,
        downvotes: 0,
        score: metadata.likes || 0,
      },
    };
  }
}
