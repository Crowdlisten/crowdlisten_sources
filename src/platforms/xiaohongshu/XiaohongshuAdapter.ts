/**
 * Xiaohongshu (RedNote) Platform Adapter — flat browser adapter using API interception.
 *
 * Uses BrowserPool + RequestInterceptor to capture XHS's internal API responses.
 * Preserves mobile viewport, zh-CN locale, and conservative anti-detection delays.
 * No tiers, no fallback chains.
 *
 * API targets:
 *   - /api/sns/web/v1/search/notes — search
 *   - /api/sns/web/v2/comment/page — comments
 *   - /api/sns/web/v1/feed — explore/trending
 *   - /api/sns/web/v1/user_posted — user posts
 */

import type { Page } from 'playwright';
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
  '/api/sns/web/v1/search/notes',
  '/api/sns/web/v2/comment/page',
  '/api/sns/web/v1/feed',
  '/api/sns/web/v1/user_posted',
  '/api/sns/web/v1/note/',
  '/api/sns/web/v2/note/',
];

export class XiaohongshuAdapter extends BaseAdapter {
  constructor(config: PlatformConfig) {
    super(config);
    // Browser platforms risk IP blocks above ~1/min sustained; 3/min allows interactive bursts
    this.maxRequestsPerWindow = 3;
  }

  async initialize(): Promise<boolean> {
    this.isInitialized = true;
    this.log('Xiaohongshu adapter initialized (API interception mode, mobile profile)');
    return true;
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&type=1`;
    return this.interceptPosts(url, limit);
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    return this.interceptPosts('https://www.xiaohongshu.com/explore', limit);
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    await this.enforceRateLimit();

    return this.interceptPosts(`https://www.xiaohongshu.com/user/profile/${userId}`, limit);
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    await this.enforceRateLimit();

    const url = contentId.includes('xiaohongshu.com/')
      ? contentId
      : `https://www.xiaohongshu.com/explore/${contentId}`;

    const pool = getBrowserPool();
    const page = await pool.acquire('xiaohongshu');
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await this.waitAndScrollSlow(page);

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
    const page = await pool.acquire('xiaohongshu');
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await this.waitAndScrollSlow(page);

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

  /**
   * XHS needs longer waits and slower scrolling due to anti-bot measures.
   */
  private async waitAndScrollSlow(page: Page): Promise<void> {
    // Human-like initial wait
    await this.humanDelay(page, 2000, 4000);

    try {
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    } catch {
      // Non-fatal
    }

    // Slow scrolling with random delays (70% viewport height)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.7));
      await this.humanDelay(page, 2000, 5000);
    }
  }

  private async humanDelay(page: Page, minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await page.waitForTimeout(delay);
  }

  // ── Data normalization (preserved from VisualXiaohongshuAdapter) ───────

  private structurePosts(interceptedData: any[]): Post[] {
    const posts: Post[] = [];
    const seenIds = new Set<string>();

    for (const data of interceptedData) {
      try {
        // Search results shape
        const items = data?.data?.items || data?.data?.notes || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            const noteCard = item.note_card || item;
            const post = this.normalizeNote(noteCard, item.id || noteCard.note_id);
            if (post && !seenIds.has(post.id)) {
              seenIds.add(post.id);
              posts.push(post);
            }
          }
        }

        // Single note detail
        if (data?.data?.note_id || data?.data?.id) {
          const post = this.normalizeNote(data.data, data.data.note_id || data.data.id);
          if (post && !seenIds.has(post.id)) {
            seenIds.add(post.id);
            posts.push(post);
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
        const commentList = data?.data?.comments || [];
        if (Array.isArray(commentList)) {
          for (const item of commentList) {
            const comment = this.normalizeXHSComment(item);
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

  private normalizeNote(note: any, noteId?: string): Post | null {
    try {
      const id = noteId || note.note_id || note.id || '';
      if (!id) return null;

      const user = note.user || note.author || {};
      const interactInfo = note.interact_info || {};

      return {
        id: String(id),
        platform: 'xiaohongshu',
        author: {
          id: user.user_id || user.uid || '',
          username: user.nickname || user.nick_name || '',
          displayName: user.nickname || user.nick_name || '',
          profileImageUrl: user.avatar || user.images,
        },
        content: note.title || note.desc || note.display_title || '',
        mediaUrl: note.cover?.url || note.cover?.url_default || note.image_list?.[0]?.url || '',
        engagement: {
          likes: interactInfo.liked_count || note.liked_count || 0,
          comments: interactInfo.comment_count || note.comment_count || 0,
          shares: interactInfo.share_count || note.share_count || 0,
          views: interactInfo.view_count || 0,
        },
        timestamp: note.time
          ? new Date(note.time)
          : note.create_time
            ? new Date(note.create_time * 1000)
            : new Date(),
        url: `https://www.xiaohongshu.com/explore/${id}`,
        hashtags: (note.tag_list || []).map((t: any) => t.name || t),
      };
    } catch {
      return null;
    }
  }

  private normalizeXHSComment(item: any): Comment | null {
    try {
      const id = item.id || item.comment_id || '';
      if (!id) return null;

      const user = item.user_info || item.user || {};
      const subComments = (item.sub_comments || [])
        .map((s: any) => this.normalizeXHSComment(s))
        .filter(Boolean) as Comment[];

      return {
        id: String(id),
        author: {
          id: user.user_id || '',
          username: user.nickname || '',
          displayName: user.nickname || '',
          profileImageUrl: user.image || user.avatar,
        },
        text: item.content || '',
        timestamp: item.create_time
          ? new Date(item.create_time * 1000)
          : new Date(),
        likes: item.like_count || 0,
        replies: subComments.length > 0 ? subComments : undefined,
      };
    } catch {
      return null;
    }
  }

  // ── Platform identity ──────────────────────────────────────────────────

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
}
