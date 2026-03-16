/**
 * Twitter/X Platform Adapter
 * Uses Playwright browser automation for read-only access to Twitter/X.
 *
 * Login strategy: uses a persistent Playwright user-data directory so you only
 * need to log in manually once. On the first run (or if the session expires)
 * the browser stays open for 60 seconds so you can log in by hand. After that,
 * every subsequent run reuses the saved session automatically.
 */

import { BaseAdapter } from '../core/base/BaseAdapter.js';
import { DataNormalizer } from '../core/utils/DataNormalizer.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
} from '../core/interfaces/SocialMediaPlatform.js';
import type { BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const TWITTER_BASE = 'https://x.com';
const DEFAULT_SESSION_DIR = path.join(process.cwd(), '.twitter-session');

export class TwitterAdapter extends BaseAdapter {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionDir: string;

  constructor(config: PlatformConfig) {
    super(config);
    this.maxRequestsPerWindow = 20;
    // Allow overriding via env, or fall back to a local .twitter-session dir
    this.sessionDir = process.env.TWITTER_CHROME_PROFILE_PATH || DEFAULT_SESSION_DIR;
  }

  /**
   * Get (or create) the persistent page.
   */
  private async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (!this.context) {
      const { chromium } = await import('playwright');

      // Ensure session directory exists
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--ignore-certificate-errors',
        ],
      });
    }

    // Reuse existing page or create new one
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    return this.page;
  }

  async initialize(): Promise<boolean> {
    try {
      const page = await this.getPage();

      // Navigate to home and check if we're already logged in
      await page.goto(`${TWITTER_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      if (await this.isLoggedIn(page)) {
        this.isInitialized = true;
        this.log('Twitter adapter initialized — existing session found', 'info');
        return true;
      }

      // Not logged in — give the user time to log in manually
      this.log('No active Twitter session found.', 'info');
      this.log('Please log in manually in the browser window that just opened.', 'info');
      this.log('Waiting up to 120 seconds for you to complete login...', 'info');

      // Navigate to login page
      await page.goto(`${TWITTER_BASE}/i/flow/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Poll for up to 120 seconds waiting for login
      const maxWait = 120_000;
      const pollInterval = 3_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await page.waitForTimeout(pollInterval);
        const url = page.url();
        if (url.includes('/home') || (!url.includes('/login') && !url.includes('/i/flow'))) {
          // Double-check by navigating to /home
          await page.goto(`${TWITTER_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
          if (await this.isLoggedIn(page)) {
            this.isInitialized = true;
            this.log('Twitter login successful — session saved for future runs', 'info');
            return true;
          }
        }
      }

      this.log('Login timed out after 120 seconds', 'error');
      return false;
    } catch (error) {
      this.log(`Failed to initialize Twitter adapter: ${error}`, 'error');
      this.isInitialized = false;
      return false;
    }
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    await this.enforceRateLimit();

    const page = await this.getPage();

    await page.goto(`${TWITTER_BASE}/explore/tabs/trending`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(4000);

    const trends = await this.extractTrends(page);
    const posts: Post[] = [];

    for (const trend of trends.slice(0, 3)) {
      if (posts.length >= limit) break;
      const remaining = limit - posts.length;
      try {
        const trendPosts = await this.searchInBrowser(page, trend, remaining);
        posts.push(...trendPosts);
      } catch (err) {
        this.log(`Failed to search for trend "${trend}": ${err}`, 'warn');
      }
    }

    this.log(`Retrieved ${posts.length} trending Twitter posts`, 'info');
    return posts.slice(0, limit);
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    this.validateLimit(limit);
    await this.enforceRateLimit();

    const page = await this.getPage();
    const username = userId.replace(/^@/, '');

    await page.goto(`${TWITTER_BASE}/${username}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(4000);

    const tweets = await this.extractTweetsFromTimeline(page, limit);
    const posts = tweets.map(t => DataNormalizer.normalizePost(t, 'twitter'));

    this.log(`Retrieved ${posts.length} tweets from user ${userId}`, 'info');
    return posts;
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    await this.enforceRateLimit();

    const page = await this.getPage();
    const tweets = await this.searchInBrowser(page, query.trim(), limit);
    this.log(`Found ${tweets.length} tweets for query: ${query}`, 'info');
    return tweets;
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    this.validateLimit(limit);
    await this.enforceRateLimit();

    const page = await this.getPage();

    let tweetUrl: string;
    if (contentId.startsWith('http')) {
      tweetUrl = contentId;
    } else {
      tweetUrl = `${TWITTER_BASE}/i/status/${contentId}`;
    }

    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    await this.scrollForContent(page, 3);

    const comments = await this.extractReplies(page, limit);
    this.log(`Retrieved ${comments.length} replies for tweet ${contentId}`, 'info');
    return comments;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async isLoggedIn(page: Page): Promise<boolean> {
    const url = page.url();
    if (url.includes('/home')) {
      const hasTimeline = await page.$('div[data-testid="primaryColumn"]').then(el => !!el).catch(() => false);
      return hasTimeline;
    }
    return false;
  }

  // ─── Search & extraction ───────────────────────────────────────────────────

  private async searchInBrowser(page: Page, query: string, limit: number): Promise<Post[]> {
    const searchUrl = `${TWITTER_BASE}/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for tweet articles to appear (up to 15s)
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    } catch {
      this.log('No tweet articles appeared after 15s', 'warn');
    }
    await page.waitForTimeout(2000);

    const articleCount = await page.$$eval('article[data-testid="tweet"]', els => els.length).catch(() => 0);
    this.log(`searchInBrowser: found ${articleCount} articles on page before extraction`, 'info');

    const scrollTimes = Math.min(Math.ceil(limit / 5), 5);
    await this.scrollForContent(page, scrollTimes);

    const tweets = await this.extractTweetsFromTimeline(page, limit);
    return tweets.map(t => DataNormalizer.normalizePost(t, 'twitter'));
  }

  private async extractTrends(page: Page): Promise<string[]> {
    return page.$$eval(
      'div[data-testid="trend"] span',
      (spans) => {
        const trends: string[] = [];
        const seen = new Set<string>();
        for (const span of spans) {
          const text = (span.textContent || '').trim();
          if (text && text.length > 1 && !/^\d/.test(text) && !seen.has(text) && !text.includes('Trending')) {
            seen.add(text);
            trends.push(text);
          }
        }
        return trends;
      }
    ).catch(() => []);
  }

  private async extractTweetsFromTimeline(page: Page, limit: number): Promise<any[]> {
    const articles = await page.$$('article[data-testid="tweet"]');
    this.log(`extractTweetsFromTimeline: found ${articles.length} article elements`, 'info');

    const results: any[] = [];

    for (const article of articles) {
      if (results.length >= limit) break;

      try {
        const text = await article.$eval(
          'div[data-testid="tweetText"]', el => el.textContent?.trim() || ''
        ).catch(() => '');

        const statusHref = await article.$eval(
          'a[href*="/status/"]', el => el.getAttribute('href') || ''
        ).catch(() => '');
        const idMatch = statusHref.match(/\/status\/(\d+)/);
        const id = idMatch ? idMatch[1] : '';

        if (!id && !text) continue;

        const userHref = await article.$eval(
          'a[role="link"][href*="/"]', el => el.getAttribute('href') || ''
        ).catch(() => '');
        const username = userHref.replace('/', '').split('/')[0] || '';

        const displayName = await article.$eval(
          'div[data-testid="User-Name"] span', el => el.textContent?.trim() || ''
        ).catch(() => username);

        const datetime = await article.$eval(
          'time', el => el.getAttribute('datetime') || ''
        ).catch(() => '');

        const getMetric = async (testId: string): Promise<number> => {
          const label = await article.$eval(
            'button[data-testid="' + testId + '"]',
            el => el.getAttribute('aria-label') || ''
          ).catch(() => '');
          const m = label.match(/([\d,.]+)/);
          return m ? parseInt(m[1].replace(/,/g, ''), 10) || 0 : 0;
        };

        const likes = await getMetric('like');
        const replies = await getMetric('reply');
        const retweets = await getMetric('retweet');

        const viewLabel = await article.$eval(
          'a[href*="/analytics"]', el => el.getAttribute('aria-label') || ''
        ).catch(() => '');
        const viewMatch = viewLabel.match(/([\d,.]+)/);
        const views = viewMatch ? parseInt(viewMatch[1].replace(/,/g, ''), 10) || 0 : 0;

        const mediaUrl = await article.$eval(
          'div[data-testid="tweetPhoto"] img', el => el.getAttribute('src') || ''
        ).catch(() => '');

        results.push({
          id,
          text,
          username,
          name: displayName,
          timeParsed: datetime,
          likes,
          replies,
          retweets,
          views,
          permanentUrl: statusHref ? 'https://x.com' + statusHref : '',
          photos: mediaUrl ? [{ url: mediaUrl }] : [],
          hashtags: [],
        });
      } catch (err) {
        this.log(`Skipping article due to error: ${err}`, 'warn');
      }
    }

    this.log(`extractTweetsFromTimeline: extracted ${results.length} tweets`, 'info');
    return results;
  }

  private async extractReplies(page: Page, limit: number): Promise<Comment[]> {
    // All articles on a tweet detail page: first is the original tweet, rest are replies
    const articles = await page.$$('article[data-testid="tweet"]');
    this.log(`extractReplies: found ${articles.length} articles (first is original tweet)`, 'info');
    const replyArticles = articles.slice(1); // skip the original tweet

    const replies: any[] = [];

    for (const article of replyArticles) {
      if (replies.length >= limit) break;

      try {
        const text = await article.$eval(
          'div[data-testid="tweetText"]', el => el.textContent?.trim() || ''
        ).catch(() => '');

        if (!text) continue;

        const statusHref = await article.$eval(
          'a[href*="/status/"]', el => el.getAttribute('href') || ''
        ).catch(() => '');
        const idMatch = statusHref.match(/\/status\/(\d+)/);
        const id = idMatch ? idMatch[1] : '';

        const userHref = await article.$eval(
          'a[role="link"][href*="/"]', el => el.getAttribute('href') || ''
        ).catch(() => '');
        const username = userHref.replace('/', '').split('/')[0] || '';

        const displayName = await article.$eval(
          'div[data-testid="User-Name"] span', el => el.textContent?.trim() || ''
        ).catch(() => username);

        const datetime = await article.$eval(
          'time', el => el.getAttribute('datetime') || ''
        ).catch(() => '');

        const likesLabel = await article.$eval(
          'button[data-testid="like"]', el => el.getAttribute('aria-label') || ''
        ).catch(() => '');
        const likesMatch = likesLabel.match(/([\d,.]+)/);
        const likes = likesMatch ? parseInt(likesMatch[1].replace(/,/g, ''), 10) || 0 : 0;

        replies.push({ id, text, username, name: displayName, timeParsed: datetime, likes });
      } catch (err) {
        this.log(`Skipping reply due to error: ${err}`, 'warn');
      }
    }

    this.log(`extractReplies: extracted ${replies.length} replies`, 'info');
    return replies.map(r => DataNormalizer.normalizeComment(r, 'twitter'));
  }

  private async scrollForContent(page: Page, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      await page.evaluate('scrollBy(0, innerHeight)');
      await page.waitForTimeout(2000);
    }
  }

  // ─── Platform identity ─────────────────────────────────────────────────────

  getPlatformName(): PlatformType {
    return 'twitter';
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
    return error.message?.includes('rate limit') ||
           error.message?.includes('Too many requests');
  }

  protected isAuthError(error: any): boolean {
    return error.message?.includes('login') ||
           error.message?.includes('authentication');
  }

  protected isNotFoundError(error: any): boolean {
    return error.message?.includes('not found') ||
           error.message?.includes('does not exist');
  }

  async cleanup(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    this.page = null;
    this.context = null;
    await super.cleanup();
  }
}
