/**
 * Moltbook Platform Adapter
 * Uses Moltbook REST API for content retrieval and comment extraction.
 *
 * API Endpoints:
 * - GET /api/v1/search?q=QUERY&type=all&limit=N
 * - GET /api/v1/posts/{ID}/comments?sort=best
 * - GET /api/v1/posts?sort=hot (trending)
 *
 * Auth: Bearer token via MOLTBOOK_API_KEY
 * Rate limit: 60 reads/min
 */

import { BaseAdapter } from '../../core/base/BaseAdapter.js';
import {
  Post,
  Comment,
  User,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  NotFoundError
} from '../../core/interfaces/SocialMediaPlatform.js';
import axios, { AxiosInstance } from 'axios';

export class MoltbookAdapter extends BaseAdapter {
  private client: AxiosInstance | null = null;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 60;
  }

  async initialize(): Promise<boolean> {
    try {
      const apiKey = this.config.credentials?.apiKey || '';
      const headers: Record<string, string> = {
        'User-Agent': 'crowdlisten-mcp/1.0.0',
        'Accept': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      this.client = axios.create({
        baseURL: 'https://moltbook.com/api/v1',
        headers,
        timeout: 10000,
      });

      this.isInitialized = true;
      this.log('Moltbook adapter initialized successfully', 'info');
      return true;
    } catch (error) {
      this.log('Failed to initialize Moltbook adapter', 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();

      const response = await this.client!.get('/posts', {
        params: { sort: 'hot', limit },
      });

      const items = response.data?.posts || response.data?.data || response.data?.results || [];
      const posts: Post[] = [];

      for (const item of (Array.isArray(items) ? items : []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Retrieved ${posts.length} trending Moltbook posts`, 'info');
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

      const response = await this.client!.get(`/users/${userId}/posts`, {
        params: { limit },
      });

      const items = response.data?.posts || response.data?.data || [];
      const posts: Post[] = [];

      for (const item of (Array.isArray(items) ? items : []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Retrieved ${posts.length} posts from Moltbook user ${userId}`, 'info');
      return posts;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('moltbook', `User ${userId}`, error as Error);
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
        params: { q: query.trim(), type: 'all', limit },
      });

      const items = response.data?.posts || response.data?.results || response.data?.data || [];
      const posts: Post[] = [];

      for (const item of (Array.isArray(items) ? items : []).slice(0, limit)) {
        posts.push(this.normalizePost(item));
      }

      this.log(`Found ${posts.length} Moltbook posts for query: ${query}`, 'info');
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

      const response = await this.client!.get(`/posts/${contentId}/comments`, {
        params: { sort: 'best', limit },
      });

      const items = response.data?.comments || response.data?.data || response.data?.results || [];
      const comments: Comment[] = [];

      const flatten = (list: any[], depth: number = 0) => {
        for (const item of list) {
          if (comments.length >= limit) return;
          comments.push(this.normalizeComment(item));
          const replies = item.replies || item.children || [];
          if (replies.length > 0 && depth < 3) {
            flatten(replies, depth + 1);
          }
        }
      };

      flatten(Array.isArray(items) ? items : []);

      this.log(`Retrieved ${comments.length} comments for Moltbook post ${contentId}`);
      return comments.slice(0, limit);
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new NotFoundError('moltbook', `Post ${contentId}`, error as Error);
      }
      this.handleError(error, 'getContentComments');
    }
  }

  getPlatformName(): PlatformType {
    return 'moltbook';
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
      this.log('Error during Moltbook cleanup', 'warn');
    }
  }

  // --- Private helpers ---

  private normalizePost(raw: any): Post {
    const author = raw.author || {};
    const community = raw.community?.name || raw.community_name || '';
    const postId = raw.id || '';

    const user: User = {
      id: author.id || author.username || '',
      username: author.username || author.name || '',
      displayName: author.display_name || author.username || '',
      followerCount: author.follower_count,
      verified: author.verified || false,
    };

    return {
      id: String(postId),
      platform: 'moltbook',
      author: user,
      content: raw.body || raw.content || raw.title || '',
      mediaUrl: raw.media_url || raw.image_url,
      engagement: {
        likes: raw.score || raw.upvotes || 0,
        comments: raw.comment_count || raw.num_comments || 0,
        shares: raw.share_count || 0,
        views: raw.view_count || 0,
      },
      timestamp: raw.created_at ? new Date(raw.created_at) : new Date(),
      url: raw.url || (community ? `https://moltbook.com/m/${community}/posts/${postId}` : ''),
      hashtags: raw.tags || raw.hashtags || [],
    };
  }

  private normalizeComment(raw: any): Comment {
    const author = raw.author || {};

    const user: User = {
      id: author.id || author.username || '',
      username: author.username || author.name || 'anonymous',
      displayName: author.display_name || author.username,
    };

    return {
      id: String(raw.id || ''),
      author: user,
      text: raw.body || raw.content || raw.text || '',
      timestamp: raw.created_at ? new Date(raw.created_at) : new Date(),
      likes: raw.score || raw.upvotes || 0,
      replies: raw.replies ? raw.replies.map((r: any) => this.normalizeComment(r)) : undefined,
      engagement: {
        upvotes: raw.upvotes || raw.score || 0,
        downvotes: raw.downvotes || 0,
        score: raw.score || 0,
      },
    };
  }
}
