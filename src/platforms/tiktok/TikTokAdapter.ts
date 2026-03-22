/**
 * TikTok Platform Adapter — flat browser adapter using API interception.
 *
 * Uses BrowserPool + RequestInterceptor to capture TikTok's internal API
 * responses. No tiers, no fallback chains.
 *
 * API targets:
 *   - /api/search/item/ — search results
 *   - /api/comment/list/ — comment threads
 *   - /api/recommend/item_list/ — trending/FYP
 *   - /api/post/item_list/ — user posts
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
  '/api/search/item/',
  '/api/search/general/',
  '/api/comment/list/',
  '/api/recommend/item_list/',
  '/api/post/item_list/',
  '/v1/search/',
];

export class TikTokAdapter extends BaseAdapter {
  constructor(config: PlatformConfig) {
    super(config);
    // Browser platforms risk IP blocks above ~2/min sustained; 5/min allows interactive bursts
    this.maxRequestsPerWindow = 5;
  }

  async initialize(): Promise<boolean> {
    this.isInitialized = true;
    this.log('TikTok adapter initialized (API interception mode)');
    return true;
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    const url = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
    return this.interceptPosts(url, limit);
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    return this.interceptPosts('https://www.tiktok.com/explore', limit);
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    await this.enforceRateLimit();

    const username = userId.startsWith('@') ? userId : `@${userId}`;
    return this.interceptPosts(`https://www.tiktok.com/${username}`, limit);
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    await this.enforceRateLimit();

    const url = contentId.includes('tiktok.com/')
      ? contentId
      : `https://www.tiktok.com/video/${contentId}`;

    const pool = getBrowserPool();
    const page = await pool.acquire('tiktok');
    const interceptor = new RequestInterceptor();

    try {
      await this.setupPage(page);
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
    const page = await pool.acquire('tiktok');
    const interceptor = new RequestInterceptor();

    try {
      await this.setupPage(page);
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

  /**
   * TikTok uses IntersectionObserver for lazy loading — stub it before navigation.
   */
  private async setupPage(page: Page): Promise<void> {
    await page.addInitScript(() => {
      if (typeof globalThis.IntersectionObserver === 'undefined') {
        (globalThis as any).IntersectionObserver = class {
          private _cb: any;
          constructor(cb: any) { this._cb = cb; }
          observe(target: any) {
            setTimeout(() => this._cb([{
              isIntersecting: true,
              intersectionRatio: 1,
              target,
            }]), 50);
          }
          unobserve() {}
          disconnect() {}
        };
      }
    });
  }

  private async waitAndScroll(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      // Non-fatal
    }

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }
  }

  // ── Data normalization (preserved from VisualTikTokAdapter) ────────────

  private structurePosts(interceptedData: any[]): Post[] {
    const posts: Post[] = [];
    const seenIds = new Set<string>();

    for (const data of interceptedData) {
      try {
        const items = data?.data || data?.item_list || data?.itemList || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            const post = this.normalizeItem(item);
            if (post && !seenIds.has(post.id)) {
              seenIds.add(post.id);
              posts.push(post);
            }
          }
        }

        const searchItems = data?.data?.item_list || data?.data?.items || [];
        if (Array.isArray(searchItems) && searchItems !== items) {
          for (const item of searchItems) {
            const post = this.normalizeItem(item);
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
        const commentList = data?.comments || data?.data?.comments || [];
        if (Array.isArray(commentList)) {
          for (const item of commentList) {
            const comment = this.normalizeComment(item);
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

  private normalizeItem(item: any): Post | null {
    try {
      const id = item.id || item.aweme_id || item.video?.id || '';
      if (!id) return null;

      const author = item.author || {};
      const stats = item.stats || item.statistics || {};
      const desc = item.desc || item.title || item.video?.title || '';
      const createTime = item.createTime || item.create_time;

      return {
        id: String(id),
        platform: 'tiktok',
        author: {
          id: author.id || author.uid || '',
          username: author.uniqueId || author.unique_id || author.nickname || '',
          displayName: author.nickname || '',
          followerCount: author.followerCount || author.follower_count,
          verified: author.verified,
          profileImageUrl: author.avatarThumb || author.avatar_thumb,
        },
        content: desc,
        mediaUrl: item.video?.cover || item.video?.dynamicCover || '',
        engagement: {
          likes: stats.diggCount || stats.digg_count || stats.likeCount || 0,
          comments: stats.commentCount || stats.comment_count || 0,
          shares: stats.shareCount || stats.share_count || 0,
          views: stats.playCount || stats.play_count || 0,
        },
        timestamp: createTime ? new Date(createTime * 1000) : new Date(),
        url: `https://www.tiktok.com/@${author.uniqueId || author.unique_id || 'user'}/video/${id}`,
        hashtags: (item.textExtra || [])
          .filter((t: any) => t.hashtagName || t.hashtag_name)
          .map((t: any) => t.hashtagName || t.hashtag_name),
      };
    } catch {
      return null;
    }
  }

  private normalizeComment(item: any): Comment | null {
    try {
      const id = item.cid || item.id || '';
      if (!id) return null;

      const user = item.user || {};
      const createTime = item.create_time || item.createTime;

      return {
        id: String(id),
        author: {
          id: user.uid || user.id || '',
          username: user.unique_id || user.uniqueId || user.nickname || '',
          displayName: user.nickname || '',
        },
        text: item.text || '',
        timestamp: createTime ? new Date(createTime * 1000) : new Date(),
        likes: item.digg_count || item.diggCount || item.likes || 0,
        replies: (item.reply_comment || []).map((r: any) => this.normalizeComment(r)).filter(Boolean) as Comment[],
      };
    } catch {
      return null;
    }
  }

  // ── Platform identity ──────────────────────────────────────────────────

  getPlatformName(): PlatformType {
    return 'tiktok';
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
