/**
 * InstagramBrowserSearch - Playwright-based Instagram Reels search with Claude Vision selection
 *
 * Mirrors TikTokBrowserSearch.ts architecture. Drives a real browser to Instagram's
 * hashtag explore page, extracts Reel candidates from the DOM, captures a screenshot,
 * then uses Claude Vision to select the most relevant Reels.
 *
 * Pipeline position:
 *   [InstagramBrowserSearch] → VideoDownloader → VideoUnderstanding → CommentEnricher
 */

import type { BrowserContext, Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface InstagramReelCandidate {
  index: number;
  caption: string;
  author: string;
  url: string;
  shortcode: string;
}

export interface InstagramBrowserSearchResult {
  searchQuery: string;
  selectedReels: InstagramReelCandidate[];
  totalCandidates: number;
  screenshotPath: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const DEFAULT_REELS_TO_SELECT = 5;
const MAX_CANDIDATES = 40;
const POST_LOAD_WAIT_MS = 2000;
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// ─── Service class ────────────────────────────────────────────────────────────

export class InstagramBrowserSearchService {
  private readonly anthropic: Anthropic;
  private readonly chromiumProfilePath: string | undefined;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for browser search');
    }
    this.anthropic = new Anthropic({ apiKey });
    this.chromiumProfilePath = process.env.INSTAGRAM_CHROME_PROFILE_PATH;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async searchAndSelect(
    keyword: string,
    reelsToSelect: number = DEFAULT_REELS_TO_SELECT
  ): Promise<InstagramBrowserSearchResult> {
    let context: BrowserContext | null = null;

    try {
      context = await this.launchBrowser();
      const page = await context.newPage();

      // IntersectionObserver stub — force lazy images to load
      await page.addInitScript(() => {
        const win = globalThis as any;
        win.IntersectionObserver = class {
          private _cb: Function;
          constructor(cb: Function) { this._cb = cb; }
          observe(target: any) {
            setTimeout(() => this._cb([{
              isIntersecting: true,
              intersectionRatio: 1,
              target,
              boundingClientRect: {},
              intersectionRect: {},
              rootBounds: null,
              time: 0,
            }]), 50);
          }
          unobserve() {}
          disconnect() {}
          takeRecords() { return []; }
        };
      });

      const candidates = await this.loadSearchResults(page, keyword);

      if (candidates.length === 0) {
        console.warn('[InstagramSearch] No Reel candidates found — page may require login');
        return {
          searchQuery: keyword,
          selectedReels: [],
          totalCandidates: 0,
          screenshotPath: '',
        };
      }

      const screenshotPath = await this.captureScreenshot(page, keyword);

      const selectedIndices = await this.selectWithClaude(
        screenshotPath,
        candidates,
        keyword,
        reelsToSelect
      );

      const selectedReels = selectedIndices
        .filter(i => i >= 0 && i < candidates.length)
        .map(i => candidates[i]);

      console.log(
        `[InstagramSearch] Selected ${selectedReels.length}/${candidates.length} ` +
        `candidates for keyword: "${keyword}"`
      );

      return {
        searchQuery: keyword,
        selectedReels,
        totalCandidates: candidates.length,
        screenshotPath,
      };
    } finally {
      if (context) await context.close();
    }
  }

  // ─── Private: browser ─────────────────────────────────────────────────────

  private async launchBrowser(): Promise<BrowserContext> {
    const { chromium } = await import('playwright');

    const commonArgs = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--ignore-certificate-errors',
    ];

    if (this.chromiumProfilePath) {
      console.log(`[InstagramSearch] Using persistent Chrome profile: ${this.chromiumProfilePath}`);

      const profileMatch = this.chromiumProfilePath.match(/[/\\](Default|Profile \d+)$/);
      const userDataDir = profileMatch
        ? path.dirname(this.chromiumProfilePath)
        : this.chromiumProfilePath;
      const profileArgs = profileMatch ? [`--profile-directory=${profileMatch[1]}`] : [];

      return chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 3600 },
        args: [...commonArgs, ...profileArgs],
      });
    }

    console.log('[InstagramSearch] No Chrome profile set — launching fresh headless browser');
    const browser = await chromium.launch({
      headless: true,
      args: commonArgs,
    });
    return browser.newContext({
      viewport: { width: 1280, height: 3600 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
  }

  // ─── Private: DOM extraction ──────────────────────────────────────────────

  private async loadSearchResults(
    page: Page,
    keyword: string
  ): Promise<InstagramReelCandidate[]> {
    // Convert keyword to hashtag slug (strip #, replace spaces with no separator)
    const slug = keyword.replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
    const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(slug)}/`;
    console.log(`[InstagramSearch] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(POST_LOAD_WAIT_MS);

    let candidates = await this.extractCandidatesFromDOM(page);

    // Login wall handling — same pattern as TikTok
    if (candidates.length === 0 && this.chromiumProfilePath) {
      console.log('[InstagramSearch] No results — Instagram may be showing a login wall.');
      console.log('[InstagramSearch] Please log in to Instagram in the opened browser.');
      console.log('[InstagramSearch] Will retry automatically once login is detected (timeout: 3 min)...');

      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline && candidates.length === 0) {
        await page.waitForTimeout(5_000);
        if (!page.url().includes('/explore/')) {
          await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(POST_LOAD_WAIT_MS);
        }
        candidates = await this.extractCandidatesFromDOM(page);
      }

      if (candidates.length > 0) {
        console.log('[InstagramSearch] Login detected — continuing with search results.');
      }
    }

    return candidates;
  }

  private async extractCandidatesFromDOM(page: Page): Promise<InstagramReelCandidate[]> {
    // Extract links to Reels. Instagram uses /reel/{shortcode}/ for Reel content.
    // Also try /p/{shortcode}/ as some Reels appear under /p/ in explore grids.
    const rawLinks = await page.$$eval('a[href*="/reel/"], a[href*="/p/"]', (anchors) =>
      anchors.map((a) => {
        const anchor = a as any;
        const card = anchor.closest(
          '[class*="Container"], [class*="Item"], [class*="Card"], [class*="wrapper"], article'
        );
        return {
          href: anchor.href as string,
          cardText: ((card?.textContent ?? anchor.textContent ?? '') as string).trim(),
        };
      })
    );

    const candidates: InstagramReelCandidate[] = [];
    const seenShortcodes = new Set<string>();

    for (const link of rawLinks) {
      const shortcodeMatch = link.href.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      if (!shortcodeMatch) continue;

      const shortcode = shortcodeMatch[2];
      if (seenShortcodes.has(shortcode)) continue;
      seenShortcodes.add(shortcode);

      // Prefer Reel links; only include /p/ links if they look like video content
      const isReel = shortcodeMatch[1] === 'reel';

      // Extract author from the card text or URL if possible
      const authorMatch = link.cardText.match(/@([A-Za-z0-9._]+)/) ||
                          link.href.match(/instagram\.com\/([A-Za-z0-9._]+)\//);
      const author = authorMatch ? authorMatch[1] : 'unknown';

      // Normalize URL to /reel/ format for consistency
      const url = isReel
        ? link.href
        : link.href.replace(/\/p\//, '/reel/');

      candidates.push({
        index: candidates.length,
        caption: link.cardText.substring(0, 120) || `Reel by @${author}`,
        author,
        url,
        shortcode,
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }

    console.log(`[InstagramSearch] Extracted ${candidates.length} candidates from DOM`);
    return candidates;
  }

  // ─── Private: screenshot ──────────────────────────────────────────────────

  private async captureScreenshot(page: Page, keyword: string): Promise<string> {
    await page.waitForTimeout(500);

    const safeKeyword = keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 40);
    const screenshotPath = path.join(
      os.tmpdir(),
      `instagram_search_${safeKeyword}_${Date.now()}.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[InstagramSearch] Screenshot saved to: ${screenshotPath}`);

    return screenshotPath;
  }

  // ─── Private: Claude Vision selection ────────────────────────────────────

  private async selectWithClaude(
    screenshotPath: string,
    candidates: InstagramReelCandidate[],
    keyword: string,
    reelsToSelect: number
  ): Promise<number[]> {
    const screenshotBase64 = fs.readFileSync(screenshotPath).toString('base64');

    const candidateList = candidates
      .map(c => `[${c.index}] @${c.author}: ${c.caption}`)
      .join('\n');

    const prompt =
      `This is a screenshot of Instagram explore/hashtag results for: "${keyword}".\n\n` +
      `Here are the extracted Reel candidates:\n${candidateList}\n\n` +
      `Please select the ${reelsToSelect} Reels that are MOST relevant to "${keyword}".\n` +
      `Consider: content relevance, visible engagement signals, caption quality, and variety.\n\n` +
      `Return ONLY this JSON — no explanation, no markdown:\n` +
      `{"selected": [0, 2, 4, 6, 8]}\n` +
      `The array must contain exactly ${reelsToSelect} valid index numbers from the list above.`;

    const response = await this.anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    return this.parseClaudeSelection(response, candidates.length, reelsToSelect);
  }

  private parseClaudeSelection(
    response: Anthropic.Message,
    totalCandidates: number,
    reelsToSelect: number
  ): number[] {
    try {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error('No JSON object found in Claude response');

      const parsed = JSON.parse(jsonMatch[0]);
      const rawSelected: unknown[] = parsed.selected ?? [];

      const validIndices = rawSelected.filter(
        (i): i is number =>
          typeof i === 'number' &&
          Number.isInteger(i) &&
          i >= 0 &&
          i < totalCandidates
      );

      if (validIndices.length === 0) {
        throw new Error(`No valid indices found in: ${JSON.stringify(parsed)}`);
      }

      console.log(`[InstagramSearch] Claude selected indices: [${validIndices.join(', ')}]`);
      return validIndices;
    } catch (err) {
      console.warn(
        `[InstagramSearch] Could not parse Claude selection (${err}). ` +
        `Falling back to first ${reelsToSelect} candidates.`
      );
      return Array.from({ length: Math.min(reelsToSelect, totalCandidates) }, (_, i) => i);
    }
  }
}
