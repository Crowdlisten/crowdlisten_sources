/**
 * Instagram Platform Adapter — flat browser adapter using API interception.
 *
 * Uses BrowserPool + RequestInterceptor to capture Instagram's internal API
 * responses (GraphQL + v1 API). No tiers, no fallback chains.
 *
 * API targets:
 *   - /graphql/query/ — posts, user content
 *   - /api/v1/tags/ — hashtag search
 *   - /api/v1/feed/ — explore/user feed
 *   - /api/v1/media/ — media endpoints
 */

import { BaseAdapter } from '../../core/base/BaseAdapter.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
} from '../../core/interfaces/SocialMediaPlatform.js';
import { getBrowserPool } from '../../browser/BrowserPool.js';
import { RequestInterceptor } from '../../browser/RequestInterceptor.js';

const API_PATTERNS = [
  '/graphql/query/',
  '/api/v1/tags/',
  '/api/v1/feed/',
  '/api/v1/media/',
  '/api/v1/web/search/',
  '/web/search/topsearch/',
];

export class InstagramAdapter extends BaseAdapter {
  constructor(config: PlatformConfig) {
    super(config);
    // Browser platforms risk IP blocks above ~2/min sustained; 5/min allows interactive bursts
    this.maxRequestsPerWindow = 5;
  }

  async initialize(): Promise<boolean> {
    this.isInitialized = true;
    this.log('Instagram adapter initialized (API interception mode)');
    return true;
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    const tag = query.replace(/^#/, '');
    const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
    return this.interceptPosts(url, limit);
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    return this.interceptPosts('https://www.instagram.com/explore/', limit);
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    await this.enforceRateLimit();

    const username = userId.startsWith('@') ? userId.slice(1) : userId;
    return this.interceptPosts(`https://www.instagram.com/${username}/`, limit);
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    await this.enforceRateLimit();

    const url = contentId.includes('instagram.com/')
      ? contentId
      : `https://www.instagram.com/p/${contentId}/`;

    const pool = getBrowserPool();
    const page = await pool.acquire('instagram');
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.waitAndScroll(page);

      const apiData = interceptor.getAllData();
      if (apiData.length === 0) return [];

      return this.structureComments(apiData).slice(0, limit);
    } catch (error) {
      this.handleError(error, `getContentComments(${contentId})`);
    } finally {
      interceptor.stop();
      await pool.release(page);
    }
  }

  // ── Interception pipeline ──────────────────────────────────────────────

  private async interceptPosts(url: string, limit: number): Promise<Post[]> {
    const pool = getBrowserPool();
    const page = await pool.acquire('instagram');
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.waitAndScroll(page);

      const apiData = interceptor.getAllData();
      if (apiData.length === 0) return [];

      return this.structurePosts(apiData).slice(0, limit);
    } catch (error) {
      this.handleError(error, `interceptPosts(${url})`);
    } finally {
      interceptor.stop();
      await pool.release(page);
    }
  }

  private async waitAndScroll(page: any): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      // Non-fatal
    }

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }
  }

  // ── Data normalization (preserved from VisualInstagramAdapter) ─────────

  private structurePosts(interceptedData: any[]): Post[] {
    const posts: Post[] = [];
    const seenIds = new Set<string>();

    for (const data of interceptedData) {
      try {
        // GraphQL query response shapes
        const edges = this.extractMediaEdges(data);
        for (const edge of edges) {
          const node = edge.node || edge;
          const post = this.normalizeMediaNode(node);
          if (post && !seenIds.has(post.id)) {
            seenIds.add(post.id);
            posts.push(post);
          }
        }

        // Tag search shape
        const tagMedia = data?.data?.hashtag?.edge_hashtag_to_media?.edges
          || data?.data?.hashtag?.edge_hashtag_to_top_posts?.edges
          || [];
        for (const edge of tagMedia) {
          const post = this.normalizeMediaNode(edge.node || edge);
          if (post && !seenIds.has(post.id)) {
            seenIds.add(post.id);
            posts.push(post);
          }
        }

        // v1 API shape (items array)
        const items = data?.items || data?.ranked_items || data?.media || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            const post = this.normalizeV1Item(item);
            if (post && !seenIds.has(post.id)) {
              seenIds.add(post.id);
              posts.push(post);
            }
          }
        }
      } catch {
        // Skip malformed response
      }
    }

    return posts;
  }

  private structureComments(interceptedData: any[]): Comment[] {
    const comments: Comment[] = [];
    const seenIds = new Set<string>();

    for (const data of interceptedData) {
      try {
        // GraphQL comments shape
        const commentEdges = data?.data?.shortcode_media?.edge_media_to_parent_comment?.edges
          || data?.data?.shortcode_media?.edge_media_to_comment?.edges
          || [];
        for (const edge of commentEdges) {
          const comment = this.normalizeCommentNode(edge.node || edge);
          if (comment && !seenIds.has(comment.id)) {
            seenIds.add(comment.id);
            comments.push(comment);
          }
        }

        // v1 API comments shape
        const commentItems = data?.comments || [];
        if (Array.isArray(commentItems)) {
          for (const item of commentItems) {
            const comment = this.normalizeV1Comment(item);
            if (comment && !seenIds.has(comment.id)) {
              seenIds.add(comment.id);
              comments.push(comment);
            }
          }
        }
      } catch {
        // Skip malformed response
      }
    }

    return comments;
  }

  private extractMediaEdges(data: any): any[] {
    const userEdges = data?.data?.user?.edge_owner_to_timeline_media?.edges;
    if (userEdges) return userEdges;

    const exploreEdges = data?.data?.user?.edge_web_feed_timeline?.edges;
    if (exploreEdges) return exploreEdges;

    const discoverEdges = data?.data?.web_discover_media?.edges;
    if (discoverEdges) return discoverEdges;

    return [];
  }

  private normalizeMediaNode(node: any): Post | null {
    try {
      const id = node.id || node.pk || '';
      if (!id) return null;

      const owner = node.owner || {};
      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text
        || node.caption?.text
        || '';

      return {
        id: String(id),
        platform: 'instagram',
        author: {
          id: owner.id || '',
          username: owner.username || '',
          displayName: owner.full_name || owner.username || '',
          profileImageUrl: owner.profile_pic_url,
        },
        content: caption,
        mediaUrl: node.display_url || node.thumbnail_src || '',
        engagement: {
          likes: node.edge_media_preview_like?.count || node.like_count || 0,
          comments: node.edge_media_to_comment?.count || node.comment_count || 0,
          views: node.video_view_count || 0,
        },
        timestamp: node.taken_at_timestamp
          ? new Date(node.taken_at_timestamp * 1000)
          : new Date(),
        url: `https://www.instagram.com/p/${node.shortcode || id}/`,
        hashtags: this.extractHashtags(caption),
      };
    } catch {
      return null;
    }
  }

  private normalizeV1Item(item: any): Post | null {
    try {
      const id = item.pk || item.id || '';
      if (!id) return null;

      const user = item.user || {};
      const caption = item.caption?.text || '';

      return {
        id: String(id),
        platform: 'instagram',
        author: {
          id: user.pk || user.id || '',
          username: user.username || '',
          displayName: user.full_name || '',
          profileImageUrl: user.profile_pic_url,
          verified: user.is_verified,
        },
        content: caption,
        mediaUrl: item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url || '',
        engagement: {
          likes: item.like_count || 0,
          comments: item.comment_count || 0,
          views: item.view_count || item.play_count || 0,
        },
        timestamp: item.taken_at ? new Date(item.taken_at * 1000) : new Date(),
        url: `https://www.instagram.com/p/${item.code || id}/`,
        hashtags: this.extractHashtags(caption),
      };
    } catch {
      return null;
    }
  }

  private normalizeCommentNode(node: any): Comment | null {
    try {
      const id = node.id || node.pk || '';
      if (!id) return null;

      const user = node.owner || {};
      const replies = (node.edge_threaded_comments?.edges || [])
        .map((e: any) => this.normalizeCommentNode(e.node || e))
        .filter(Boolean) as Comment[];

      return {
        id: String(id),
        author: {
          id: user.id || '',
          username: user.username || '',
          displayName: user.username || '',
          profileImageUrl: user.profile_pic_url,
        },
        text: node.text || '',
        timestamp: node.created_at
          ? new Date(node.created_at * 1000)
          : new Date(),
        likes: node.edge_liked_by?.count || 0,
        replies: replies.length > 0 ? replies : undefined,
      };
    } catch {
      return null;
    }
  }

  private normalizeV1Comment(item: any): Comment | null {
    try {
      const id = item.pk || item.id || '';
      if (!id) return null;

      const user = item.user || {};

      return {
        id: String(id),
        author: {
          id: user.pk || user.id || '',
          username: user.username || '',
          displayName: user.full_name || '',
        },
        text: item.text || '',
        timestamp: item.created_at ? new Date(item.created_at * 1000) : new Date(),
        likes: item.comment_like_count || 0,
      };
    } catch {
      return null;
    }
  }

  private extractHashtags(text: string): string[] {
    return (text.match(/#\w+/g) || []).map(h => h.slice(1));
  }

  // ── Platform identity ──────────────────────────────────────────────────

  getPlatformName(): PlatformType {
    return 'instagram';
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
}
