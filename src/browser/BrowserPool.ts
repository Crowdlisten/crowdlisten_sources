/**
 * BrowserPool — manages browser sessions for visual extraction.
 *
 * Providers:
 *   - local  → Playwright launches Chromium directly (default, zero-config)
 *   - remote → Connects to any CDP endpoint (Browserbase, E2B, etc.)
 *
 * Each platform gets its own BrowserContext with isolated cookies but shared browser.
 * Session persistence via cookies saved to ~/.crowdlisten/sessions/{platform}/
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PlatformType } from '../core/interfaces/SocialMediaPlatform.js';

export interface PlatformProfile {
  viewport: { width: number; height: number };
  userAgent: string;
  locale?: string;
  isMobile?: boolean;
}

const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  twitter: {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  tiktok: {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  instagram: {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  xiaohongshu: {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'zh-CN',
    isMobile: true,
  },
};

export type BrowserProvider = 'local' | 'remote';

export interface BrowserPoolOptions {
  maxContexts?: number;
  sessionDir?: string;
  headless?: boolean;
  /** Browser provider: 'local' (default) or 'remote' (CDP endpoint) */
  provider?: BrowserProvider;
  /** CDP endpoint URL for remote provider (e.g., ws://localhost:9222 or Browserbase URL) */
  cdpUrl?: string;
}

export class BrowserPool {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private activePages: Set<Page> = new Set();
  private maxContexts: number;
  private sessionDir: string;
  private headless: boolean;
  private provider: BrowserProvider;
  private cdpUrl: string | null;

  constructor(options: BrowserPoolOptions = {}) {
    this.maxContexts = options.maxContexts ?? parseInt(process.env.VISUAL_MAX_CONCURRENCY || '5');
    this.sessionDir = options.sessionDir ?? process.env.VISUAL_SESSION_DIR
      ?? path.join(os.homedir(), '.crowdlisten', 'sessions');
    this.headless = options.headless ?? (process.env.VISUAL_HEADLESS !== 'false');
    this.provider = options.provider
      ?? (process.env.BROWSER_PROVIDER as BrowserProvider) ?? 'local';
    this.cdpUrl = options.cdpUrl ?? process.env.BROWSER_CDP_URL ?? null;
  }

  /**
   * Launch or connect to a browser based on the configured provider.
   */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    this.browser = this.provider === 'remote'
      ? await this.connectViaRemote()
      : await this.launchLocal();

    console.log(`[BrowserPool] Connected via provider: ${this.provider}`);
    return this.browser;
  }

  /**
   * Local provider: launch Chromium directly via Playwright (default).
   */
  private async launchLocal(): Promise<Browser> {
    return chromium.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });
  }

  /**
   * Remote provider: connect to an existing CDP endpoint.
   * Set BROWSER_CDP_URL to your endpoint (Browserbase, E2B, etc.)
   */
  private async connectViaRemote(): Promise<Browser> {
    if (!this.cdpUrl) {
      throw new Error(
        '[BrowserPool] Remote provider requires BROWSER_CDP_URL. Set it to your CDP endpoint.\n' +
        'Examples:\n' +
        '  BROWSER_CDP_URL=ws://localhost:9222\n' +
        '  BROWSER_CDP_URL=wss://connect.browserbase.com?apiKey=YOUR_KEY'
      );
    }

    console.log(`[BrowserPool] Connecting to remote browser: ${this.cdpUrl.substring(0, 50)}...`);
    return chromium.connectOverCDP(this.cdpUrl);
  }

  private getSessionPath(platform: string): string {
    return path.join(this.sessionDir, platform);
  }

  private getCookiePath(platform: string): string {
    return path.join(this.getSessionPath(platform), 'cookies.json');
  }

  /**
   * Acquire a Page for a specific platform.
   * Creates a BrowserContext if one doesn't exist for this platform.
   * Loads persisted cookies if available.
   */
  async acquire(platform: string): Promise<Page> {
    const browser = await this.ensureBrowser();

    if (!this.contexts.has(platform)) {
      if (this.contexts.size >= this.maxContexts) {
        // Evict least recently used context
        const oldest = this.contexts.keys().next().value;
        if (oldest) {
          await this.releaseContext(oldest);
        }
      }

      const profile = PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.twitter;
      const context = await browser.newContext({
        viewport: profile.viewport,
        userAgent: profile.userAgent,
        locale: profile.locale,
        isMobile: profile.isMobile,
        ignoreHTTPSErrors: true,
      });

      // Restore persisted cookies
      await this.loadCookies(context, platform);

      this.contexts.set(platform, context);
    }

    const context = this.contexts.get(platform)!;
    const page = await context.newPage();
    this.activePages.add(page);
    return page;
  }

  /**
   * Release a page back to the pool. Saves cookies and closes the page.
   */
  async release(page: Page): Promise<void> {
    this.activePages.delete(page);

    // Find which platform context this page belongs to
    for (const [platform, context] of this.contexts) {
      if (context.pages().includes(page)) {
        await this.saveCookies(context, platform);
        break;
      }
    }

    if (!page.isClosed()) {
      await page.close();
    }
  }

  /**
   * Get a persistent context for a platform (reuses existing chrome profile).
   * Used for platforms that need login persistence (Twitter, XHS).
   * Only available with local provider — remote/docker use cookie persistence instead.
   */
  async acquirePersistent(platform: string): Promise<{ context: BrowserContext; page: Page }> {
    if (this.provider !== 'local') {
      // Persistent contexts only work locally — fall back to cookie-based persistence
      console.log(`[BrowserPool] Persistent context unavailable for ${this.provider} provider, using cookie persistence`);
      const page = await this.acquire(platform);
      const context = this.contexts.get(platform)!;
      return { context, page };
    }

    const profilePath = this.getPersistentProfilePath(platform);
    fs.mkdirSync(profilePath, { recursive: true });

    const profile = PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.twitter;

    const context = await chromium.launchPersistentContext(profilePath, {
      headless: this.headless,
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      locale: profile.locale,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.contexts.set(`persistent_${platform}`, context);
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    this.activePages.add(page);

    return { context, page };
  }

  private getPersistentProfilePath(platform: string): string {
    const envMap: Record<string, string | undefined> = {
      twitter: process.env.TWITTER_CHROME_PROFILE_PATH,
      tiktok: process.env.TIKTOK_CHROME_PROFILE_PATH,
      xiaohongshu: process.env.XHS_CHROME_PROFILE_PATH,
      instagram: process.env.INSTAGRAM_CHROME_PROFILE_PATH,
    };
    return envMap[platform] ?? path.join(this.sessionDir, `${platform}-profile`);
  }

  private async loadCookies(context: BrowserContext, platform: string): Promise<void> {
    const cookiePath = this.getCookiePath(platform);
    try {
      if (fs.existsSync(cookiePath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
        if (Array.isArray(cookies) && cookies.length > 0) {
          await context.addCookies(cookies);
          console.log(`[BrowserPool] Loaded ${cookies.length} cookies for ${platform}`);
        }
      }
    } catch (err) {
      console.warn(`[BrowserPool] Failed to load cookies for ${platform}:`, err);
    }
  }

  private async saveCookies(context: BrowserContext, platform: string): Promise<void> {
    const cookiePath = this.getCookiePath(platform);
    try {
      const sessionPath = this.getSessionPath(platform);
      fs.mkdirSync(sessionPath, { recursive: true });
      const cookies = await context.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      console.log(`[BrowserPool] Saved ${cookies.length} cookies for ${platform}`);
    } catch (err) {
      console.warn(`[BrowserPool] Failed to save cookies for ${platform}:`, err);
    }
  }

  private async releaseContext(platform: string): Promise<void> {
    const context = this.contexts.get(platform);
    if (context) {
      await this.saveCookies(context, platform);
      // Close all pages in this context
      for (const page of context.pages()) {
        this.activePages.delete(page);
      }
      await context.close();
      this.contexts.delete(platform);
    }
  }

  /**
   * Close all contexts and the browser.
   */
  async cleanup(): Promise<void> {
    for (const [platform, context] of this.contexts) {
      try {
        await this.saveCookies(context, platform);
        await context.close();
      } catch (err) {
        console.warn(`[BrowserPool] Error cleaning up ${platform}:`, err);
      }
    }

    this.contexts.clear();
    this.activePages.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    console.log('[BrowserPool] Cleanup complete');
  }

  get activeContextCount(): number {
    return this.contexts.size;
  }

  get activePageCount(): number {
    return this.activePages.size;
  }

  get currentProvider(): BrowserProvider {
    return this.provider;
  }
}

// Singleton pool instance
let _poolInstance: BrowserPool | null = null;

export function getBrowserPool(options?: BrowserPoolOptions): BrowserPool {
  if (!_poolInstance) {
    _poolInstance = new BrowserPool(options);
  }
  return _poolInstance;
}
