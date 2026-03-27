/**
 * Instagram Platform Adapter — browser adapter using API interception.
 *
 * Supports authenticated and anonymous modes:
 *   - Authenticated: logs in via Playwright, persists session, unlocks private/feed content
 *   - Anonymous: intercepts public API calls without login (limited data)
 *
 * Tier 1 (API interception) with Tier 3 (Vision) fallback.
 * When API interception returns empty, automatically attempts vision-based
 * extraction. Tier 2 (DOM scraping) is intentionally skipped as too brittle.
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
import { getBrowserPool, BrowserPool } from '../../browser/BrowserPool.js';
import { RequestInterceptor } from '../../browser/RequestInterceptor.js';
import type { Page, BrowserContext } from 'playwright';

const API_PATTERNS = [
  '/graphql/query/',
  '/api/v1/tags/',
  '/api/v1/feed/',
  '/api/v1/media/',
  '/api/v1/web/search/',
  '/web/search/topsearch/',
];

/** Selectors for Instagram's login flow */
const LOGIN_SELECTORS = {
  usernameInput: 'input[name="username"]',
  passwordInput: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  // Post-login indicators — any of these means we're logged in
  loggedInIndicators: [
    'svg[aria-label="Home"]',
    'a[href="/direct/inbox/"]',
    'svg[aria-label="New post"]',
    'span[aria-label="Profile"]',
  ],
  // Challenge/checkpoint selectors
  twoFactorInput: 'input[name="verificationCode"]',
  suspiciousLoginButton: 'button:has-text("This Was Me")',
  saveLoginButton: 'button:has-text("Save Info")',
  notNowButton: 'button:has-text("Not Now")',
  cookieAccept: 'button:has-text("Allow")',
};

export class InstagramAdapter extends BaseAdapter {
  private authenticated: boolean = false;
  private persistentContext: BrowserContext | null = null;

  constructor(config: PlatformConfig) {
    super(config);
    // Browser platforms risk IP blocks above ~2/min sustained; 5/min allows interactive bursts
    this.maxRequestsPerWindow = 5;
  }

  async initialize(): Promise<boolean> {
    this.isInitialized = true;

    const username = this.config.credentials?.username
      || process.env.INSTAGRAM_USERNAME;
    const password = this.config.credentials?.password
      || process.env.INSTAGRAM_PASSWORD;

    if (!username || !password) {
      this.log('No Instagram credentials found — running in anonymous mode');
      return true;
    }

    try {
      await this.login(username, password);
    } catch (error) {
      this.log(`Login failed, falling back to anonymous mode: ${error}`, 'warn');
    }

    return true;
  }

  // ── Authentication ─────────────────────────────────────────────────────

  /**
   * Log into Instagram via Playwright browser automation.
   * Uses persistent context so the session survives across runs.
   * Skips login if cookies from a previous session are still valid.
   */
  private async login(username: string, password: string): Promise<void> {
    const pool = getBrowserPool();
    const { context, page } = await pool.acquirePersistent('instagram');
    this.persistentContext = context;

    try {
      // Navigate to Instagram and check if we're already logged in
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Dismiss cookie banner if present
      await this.dismissOverlays(page);

      // Check if prior session is still valid
      if (await this.isLoggedIn(page)) {
        this.authenticated = true;
        this.log(`Already logged in (session restored)`);
        await pool.release(page);
        return;
      }

      this.log('No active session — performing login');

      // Wait for the login form
      await page.waitForSelector(LOGIN_SELECTORS.usernameInput, { timeout: 10000 });

      // Fill credentials with human-like delays
      await page.fill(LOGIN_SELECTORS.usernameInput, '');
      await page.type(LOGIN_SELECTORS.usernameInput, username, { delay: 50 });
      await page.fill(LOGIN_SELECTORS.passwordInput, '');
      await page.type(LOGIN_SELECTORS.passwordInput, password, { delay: 50 });

      // Click login
      await page.click(LOGIN_SELECTORS.loginButton);

      // Wait for navigation or challenge
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      // Handle post-login prompts (2FA, save-login, notifications)
      await this.handlePostLoginChallenges(page);

      if (await this.isLoggedIn(page)) {
        this.authenticated = true;
        this.log('Login successful');
      } else {
        this.log('Login may have failed — could not confirm logged-in state', 'warn');
      }

      await pool.release(page);
    } catch (error) {
      // Release page on error but don't throw — let caller handle fallback
      try { await pool.release(page); } catch { /* ignore */ }
      throw error;
    }
  }

  /**
   * Check if the current page shows a logged-in Instagram session.
   */
  private async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Check for any logged-in indicator
      for (const selector of LOGIN_SELECTORS.loggedInIndicators) {
        const el = await page.$(selector);
        if (el) return true;
      }

      // Also check cookies for sessionid — definitive auth signal
      const cookies = await page.context().cookies('https://www.instagram.com');
      return cookies.some(c => c.name === 'sessionid' && c.value.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Handle common post-login challenges:
   * - 2FA code prompt (logs warning — user must handle manually or use persistent profile)
   * - "Save Your Login Info?" prompt
   * - "Turn on Notifications?" prompt
   * - Suspicious login "This Was Me" prompt
   */
  private async handlePostLoginChallenges(page: Page): Promise<void> {
    // Give Instagram a moment to render any challenge screens
    await page.waitForTimeout(2000);

    // 2FA detection — we can't automate this, but we can warn
    const has2FA = await page.$(LOGIN_SELECTORS.twoFactorInput);
    if (has2FA) {
      this.log(
        '2FA code required. To bypass: log in manually in Chrome and set INSTAGRAM_CHROME_PROFILE_PATH, ' +
        'or disable 2FA on the dedicated account.',
        'warn'
      );
      // Wait a bit in case user has a TOTP automation in the future
      await page.waitForTimeout(5000);
      return;
    }

    // "Suspicious login" — click "This Was Me"
    await this.clickIfVisible(page, LOGIN_SELECTORS.suspiciousLoginButton);

    // "Save Your Login Info?" — click "Save Info" to persist session
    await this.clickIfVisible(page, LOGIN_SELECTORS.saveLoginButton);

    // "Turn on Notifications?" — click "Not Now"
    await this.clickIfVisible(page, LOGIN_SELECTORS.notNowButton);
  }

  /**
   * Dismiss cookie consent and other overlays that block interaction.
   */
  private async dismissOverlays(page: Page): Promise<void> {
    await this.clickIfVisible(page, LOGIN_SELECTORS.cookieAccept);
    await this.clickIfVisible(page, LOGIN_SELECTORS.notNowButton);
  }

  /**
   * Click a button/element if it exists on the page. Non-blocking.
   */
  private async clickIfVisible(page: Page, selector: string): Promise<void> {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Not present or not clickable — fine
    }
  }

  /**
   * Acquire a page for Instagram — uses persistent (authenticated) context
   * when available, falls back to standard anonymous context.
   */
  private async acquirePage(): Promise<{ pool: BrowserPool; page: Page }> {
    const pool = getBrowserPool();

    if (this.authenticated && this.persistentContext) {
      // Reuse the authenticated persistent context
      const page = await this.persistentContext.newPage();
      return { pool, page };
    }

    // Anonymous mode — standard acquire
    const page = await pool.acquire('instagram');
    return { pool, page };
  }

  /**
   * Release a page — handles both persistent and standard contexts.
   */
  private async releasePage(pool: BrowserPool, page: Page): Promise<void> {
    if (this.authenticated && this.persistentContext) {
      // For persistent context, just close the page (context stays alive)
      if (!page.isClosed()) {
        await page.close();
      }
    } else {
      await pool.release(page);
    }
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

    const { pool, page } = await this.acquirePage();
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.waitAndScroll(page);

      const apiData = interceptor.getAllData();
      if (apiData.length === 0) {
        return await this.tryVisionFallback(url, 'comments', limit) as Comment[];
      }

      return this.structureComments(apiData).slice(0, limit);
    } catch (error) {
      this.handleError(error, `getContentComments(${contentId})`);
    } finally {
      interceptor.stop();
      await this.releasePage(pool, page);
    }
  }

  // ── Interception pipeline ──────────────────────────────────────────────

  private async interceptPosts(url: string, limit: number): Promise<Post[]> {
    const { pool, page } = await this.acquirePage();
    const interceptor = new RequestInterceptor();

    try {
      await interceptor.setup(page, API_PATTERNS);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.waitAndScroll(page);

      const apiData = interceptor.getAllData();
      if (apiData.length === 0) {
        return await this.tryVisionFallback(url, 'posts', limit) as Post[];
      }

      return this.structurePosts(apiData).slice(0, limit);
    } catch (error) {
      this.handleError(error, `interceptPosts(${url})`);
    } finally {
      interceptor.stop();
      await this.releasePage(pool, page);
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
    };
  }

  /** Whether this adapter has an active authenticated session. */
  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  async cleanup(): Promise<void> {
    if (this.persistentContext) {
      try {
        await this.persistentContext.close();
      } catch {
        // Context may already be closed
      }
      this.persistentContext = null;
    }
    this.authenticated = false;
    await super.cleanup();
  }
}
