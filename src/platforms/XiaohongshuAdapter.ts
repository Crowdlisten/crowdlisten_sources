/**
 * Xiaohongshu (RED / 小红书) Platform Adapter
 * Playwright-based browser scraping — runs standalone without the agent backend.
 *
 * Xiaohongshu aggressively blocks automated access, so this adapter uses:
 * - Realistic viewport and user-agent (mobile web)
 * - Random delays between requests
 * - Cookie persistence via a configurable Chrome profile
 *
 * Set XHS_CHROME_PROFILE_PATH to a persistent Chromium profile directory
 * where you have logged into Xiaohongshu at least once.
 *
 * Rate limit: 40 requests/min (conservative due to anti-detection)
 */

import type { BrowserContext, Page } from 'playwright';
import { BaseAdapter } from '../core/base/BaseAdapter.js';
import {
  Post,
  Comment,
  User,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
  NotFoundError,
} from '../core/interfaces/SocialMediaPlatform.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const XHS_BASE = 'https://www.xiaohongshu.com';
const XHS_SEARCH_URL = `${XHS_BASE}/search_result?keyword=`;
const XHS_EXPLORE_URL = `${XHS_BASE}/explore`;

/** Extra wait after page load for XHS SPA rendering. */
const POST_LOAD_WAIT_MS = 2000;

/** Random delay range between actions to appear more human (ms). */
const MIN_ACTION_DELAY = 800;
const MAX_ACTION_DELAY = 2500;

// ─── Adapter ────────────────────────────────────────────────────────────────

export class XiaohongshuAdapter extends BaseAdapter {
  private context: BrowserContext | null = null;
  private readonly profilePath: string | undefined;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 40;
    this.profilePath = config.credentials?.profilePath || process.env.XHS_CHROME_PROFILE_PATH;
  }

  async initialize(): Promise<boolean> {
    try {
      this.context = await this.launchBrowser();
      this.isInitialized = true;
      this.log('Xiaohongshu adapter initialized (Playwright)', 'info');
      return true;
    } catch (error) {
      this.log(`Failed to initialize Xiaohongshu adapter: ${(error as Error).message}`, 'error');
      this.isInitialized = false;
      return false;
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
      const page = await this.newPage();

      try {
        const url = `${XHS_SEARCH_URL}${encodeURIComponent(query.trim())}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await this.humanDelay(page);

        const posts = await this.extractNotesFromPage(page, limit);
        this.log(`Found ${posts.length} Xiaohongshu notes for query: ${query}`, 'info');
        return posts;
      } finally {
        await page.close();
      }
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
      const page = await this.newPage();

      try {
        // contentId can be a URL or a note ID
        const noteUrl = contentId.startsWith('http')
          ? contentId
          : `${XHS_EXPLORE_URL}/${contentId}`;

        await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await this.humanDelay(page);

        const comments = await this.extractCommentsFromPage(page, limit);
        this.log(`Retrieved ${comments.length} comments for Xiaohongshu note ${contentId}`);
        return comments;
      } finally {
        await page.close();
      }
    } catch (error) {
      if ((error as any).message?.includes('not found') || (error as any).message?.includes('404')) {
        throw new NotFoundError('xiaohongshu', `Note ${contentId}`, error as Error);
      }
      this.handleError(error, 'getContentComments');
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();
      const page = await this.newPage();

      try {
        await page.goto(XHS_EXPLORE_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await this.humanDelay(page);

        const posts = await this.extractNotesFromPage(page, limit);
        this.log(`Retrieved ${posts.length} trending Xiaohongshu notes`, 'info');
        return posts;
      } finally {
        await page.close();
      }
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
      const page = await this.newPage();

      try {
        // User profile URL pattern
        const profileUrl = userId.startsWith('http')
          ? userId
          : `${XHS_BASE}/user/profile/${userId}`;

        await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await this.humanDelay(page);

        const posts = await this.extractNotesFromPage(page, limit);
        this.log(`Retrieved ${posts.length} notes for Xiaohongshu user ${userId}`, 'info');
        return posts;
      } finally {
        await page.close();
      }
    } catch (error) {
      if ((error as any).message?.includes('not found') || (error as any).message?.includes('404')) {
        throw new NotFoundError('xiaohongshu', `User ${userId}`, error as Error);
      }
      this.handleError(error, 'getUserContent');
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
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      await super.cleanup();
    } catch (error) {
      this.log('Error during Xiaohongshu cleanup', 'warn');
    }
  }

  // ─── Private: browser ──────────────────────────────────────────────────────

  private async launchBrowser(): Promise<BrowserContext> {
    const { chromium } = await import('playwright');

    const commonArgs = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ];

    if (this.profilePath) {
      this.log(`Using persistent Chrome profile: ${this.profilePath}`, 'info');
      return chromium.launchPersistentContext(this.profilePath, {
        headless: false,
        viewport: { width: 390, height: 844 }, // iPhone 14 Pro dimensions
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        args: commonArgs,
      });
    }

    this.log('No Chrome profile set — launching fresh headless browser', 'info');
    const browser = await chromium.launch({
      headless: true,
      args: commonArgs,
    });
    return browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      locale: 'zh-CN',
    });
  }

  private async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser context not initialized');
    return this.context.newPage();
  }

  /** Random delay to appear more human. */
  private async humanDelay(page: Page): Promise<void> {
    const delay = MIN_ACTION_DELAY + Math.random() * (MAX_ACTION_DELAY - MIN_ACTION_DELAY);
    await page.waitForTimeout(POST_LOAD_WAIT_MS + delay);
  }

  // ─── Private: DOM extraction ──────────────────────────────────────────────

  /**
   * Extract note cards from the current page.
   * Works on search results, explore page, and user profiles.
   *
   * Xiaohongshu renders note cards as section elements or divs with note links.
   * The primary selector targets anchor elements linking to /explore/<noteId>.
   */
  private async extractNotesFromPage(page: Page, limit: number): Promise<Post[]> {
    // Wait for note cards to render
    try {
      await page.waitForSelector('a[href*="/explore/"], section.note-item, [class*="note-item"]', {
        timeout: 10000,
      });
    } catch {
      this.log('Note card selector timeout — page may require login or be empty', 'warn');
      return [];
    }

    const rawNotes = await page.$$eval(
      'a[href*="/explore/"], section.note-item a, [class*="note-item"] a',
      (elements) => {
        const seen = new Set<string>();
        const notes: Array<{
          href: string;
          title: string;
          author: string;
          likes: string;
        }> = [];

        for (const el of elements) {
          const anchor = el as any;
          const href = anchor.href as string;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          // Walk up to find the card container
          const card = anchor.closest(
            'section, [class*="note-item"], [class*="feed-item"], [class*="Card"]'
          ) || anchor;

          // Extract title from card text or anchor text
          const titleEl = card.querySelector('[class*="title"], h3, [class*="desc"]');
          const title = (titleEl?.textContent || card.textContent || '').trim().substring(0, 200);

          // Extract author
          const authorEl = card.querySelector('[class*="author"], [class*="nickname"], [class*="user"]');
          const author = (authorEl?.textContent || '').trim();

          // Extract likes count
          const likesEl = card.querySelector('[class*="like"], [class*="count"]');
          const likes = (likesEl?.textContent || '0').trim();

          notes.push({ href, title, author, likes });
        }

        return notes;
      }
    );

    const posts: Post[] = [];
    for (const raw of rawNotes.slice(0, limit)) {
      // Extract note ID from URL: /explore/<noteId> or /discovery/item/<noteId>
      const idMatch = raw.href.match(/\/explore\/([a-f0-9]+)/i)
        || raw.href.match(/\/item\/([a-f0-9]+)/i);
      const noteId = idMatch ? idMatch[1] : raw.href;

      const user: User = {
        id: raw.author || '',
        username: raw.author || '',
        displayName: raw.author || '',
      };

      posts.push({
        id: noteId,
        platform: 'xiaohongshu',
        author: user,
        content: raw.title || '',
        engagement: {
          likes: this.parseLikeCount(raw.likes),
          comments: 0,
          shares: 0,
          views: 0,
        },
        timestamp: new Date(),
        url: raw.href,
        hashtags: this.extractHashtags(raw.title),
      });
    }

    return posts;
  }

  /**
   * Extract comments from a note detail page.
   */
  private async extractCommentsFromPage(page: Page, limit: number): Promise<Comment[]> {
    // Wait for comment section to render
    try {
      await page.waitForSelector('[class*="comment"], [class*="Comment"]', {
        timeout: 10000,
      });
    } catch {
      this.log('Comment section not found — note may have no comments', 'warn');
      return [];
    }

    // Scroll to load more comments if needed
    const scrollAttempts = Math.min(Math.ceil(limit / 10), 5);
    for (let i = 0; i < scrollAttempts; i++) {
      await page.evaluate(() => (globalThis as any).scrollBy(0, 800));
      await page.waitForTimeout(500 + Math.random() * 500);
    }

    const rawComments = await page.$$eval(
      '[class*="comment-item"], [class*="CommentItem"], [class*="comment-inner"]',
      (elements) => {
        return elements.map((el) => {
          const authorEl = el.querySelector('[class*="author"], [class*="nickname"], [class*="user-name"]');
          const textEl = el.querySelector('[class*="content"], [class*="text"], [class*="note-text"]');
          const likesEl = el.querySelector('[class*="like"], [class*="count"]');
          const timeEl = el.querySelector('[class*="time"], [class*="date"]');

          return {
            author: (authorEl?.textContent || '').trim(),
            text: (textEl?.textContent || el.textContent || '').trim().substring(0, 500),
            likes: (likesEl?.textContent || '0').trim(),
            time: (timeEl?.textContent || '').trim(),
          };
        });
      }
    );

    const comments: Comment[] = [];
    for (const raw of rawComments.slice(0, limit)) {
      if (!raw.text) continue;

      const user: User = {
        id: raw.author || '',
        username: raw.author || 'anonymous',
        displayName: raw.author,
      };

      comments.push({
        id: String(comments.length + 1),
        author: user,
        text: raw.text,
        timestamp: new Date(),
        likes: this.parseLikeCount(raw.likes),
        engagement: {
          upvotes: this.parseLikeCount(raw.likes),
          downvotes: 0,
          score: this.parseLikeCount(raw.likes),
        },
      });
    }

    return comments;
  }

  // ─── Private: helpers ─────────────────────────────────────────────────────

  /** Parse Chinese number formats (e.g. "1.2万" → 12000). */
  private parseLikeCount(text: string): number {
    if (!text) return 0;
    const cleaned = text.replace(/[^\d.万w千k]/gi, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    if (cleaned.includes('万') || cleaned.toLowerCase().includes('w')) return Math.round(num * 10000);
    if (cleaned.includes('千') || cleaned.toLowerCase().includes('k')) return Math.round(num * 1000);
    return Math.round(num);
  }

  /** Extract hashtags from text (both # and Xiaohongshu's hashtag format). */
  private extractHashtags(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/#[^\s#]+/g) || [];
    return matches.map(h => h.replace('#', ''));
  }
}
