/**
 * TikTokBrowserSearch - Playwright-based TikTok search with Claude Vision selection
 *
 * This module implements Module 1 of the CrowdListen video pipeline.
 * It drives a real browser to perform a TikTok keyword search, extracts video
 * candidates from the DOM, captures a screenshot of the results page, then uses
 * Claude Vision to intelligently select the most relevant videos.
 *
 * Why browser automation instead of the TikTok HTTP API?
 *   TikTok's internal search API (searchViaHttp) requires signed request parameters
 *   that change frequently and are hard to replicate outside a real browser session.
 *   Playwright with a real Chrome profile (including the user's TikTok login cookies)
 *   is the most reliable way to get search results consistently.
 *
 * Why Claude Vision for selection instead of just taking the top N results?
 *   TikTok's ranking algorithm does not sort by topical relevance — it interleaves
 *   sponsored content, algorithmic recommendations, and loosely related videos.
 *   Claude Vision reads the thumbnails, captions, and engagement signals visible
 *   in the screenshot to select genuinely relevant content.
 *
 * Pipeline position:
 *   [TikTokBrowserSearch] → VideoDownloader → VideoUnderstanding → CommentEnricher
 */

import { chromium, BrowserContext, Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single TikTok video candidate extracted from the search results page.
 * index is used by Claude to refer back to specific videos in its selection.
 */
export interface TikTokVideoCandidate {
  index: number;   // 0-based position in the candidates array
  title: string;   // Caption / description text (truncated to 120 chars)
  author: string;  // TikTok username extracted from the video URL
  url: string;     // Full TikTok video URL: https://www.tiktok.com/@user/video/ID
}

/**
 * The result of a browser search + Claude Vision selection pass.
 */
export interface BrowserSearchResult {
  searchQuery: string;
  /** Videos selected by Claude as most relevant to the keyword */
  selectedVideos: TikTokVideoCandidate[];
  /** Total candidates extracted from the page before Claude's selection */
  totalCandidates: number;
  /** Absolute path to the saved screenshot (kept for debugging / audit) */
  screenshotPath: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

/** Base URL for TikTok video search. */
const TIKTOK_SEARCH_URL = 'https://www.tiktok.com/search/video?q=';

/** Default number of videos to select per search. */
const DEFAULT_VIDEOS_TO_SELECT = 5;

/**
 * Maximum video candidates to extract from the DOM.
 * Keeping this reasonable prevents the Claude prompt from becoming too long
 * while still giving Claude enough choice for good selection.
 */
const MAX_CANDIDATES = 20;

/**
 * Extra wait after page load for TikTok's React app to finish rendering.
 * TikTok is heavily JS-driven; networkidle alone is not always sufficient.
 */
const POST_LOAD_WAIT_MS = 4000;

/**
 * Claude model used for visual selection.
 * claude-sonnet-4-6 has strong vision capabilities and low latency.
 */
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// ─── Service class ────────────────────────────────────────────────────────────

export class TikTokBrowserSearchService {
  private readonly anthropic: Anthropic;

  /**
   * Path to a persistent Chromium/Chrome profile directory.
   * When set, Playwright reuses the existing TikTok login session, avoiding
   * login walls and bot-detection challenges.
   *
   * macOS default: ~/Library/Application Support/Google/Chrome/Default
   * Set via env var: TIKTOK_CHROME_PROFILE_PATH
   */
  private readonly chromiumProfilePath: string | undefined;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for browser search');
    }
    this.anthropic = new Anthropic({ apiKey });
    this.chromiumProfilePath = process.env.TIKTOK_CHROME_PROFILE_PATH;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Search TikTok for a keyword, then use Claude Vision to select the most
   * relevant videos from the results page.
   *
   * Steps:
   *   1. Launch browser (persistent profile or fresh headless)
   *   2. Navigate to TikTok search and wait for results to render
   *   3. Extract video candidates from the DOM (URLs + metadata)
   *   4. Capture a screenshot of the results page
   *   5. Ask Claude Vision to select the best N candidates
   *   6. Return selected videos
   *
   * @param keyword         Search term to query on TikTok
   * @param videosToSelect  How many videos Claude should select (default: 5)
   */
  async searchAndSelect(
    keyword: string,
    videosToSelect: number = DEFAULT_VIDEOS_TO_SELECT
  ): Promise<BrowserSearchResult> {
    let context: BrowserContext | null = null;

    try {
      context = await this.launchBrowser();
      const page = await context.newPage();

      // Load the TikTok search page and extract video candidates from the DOM
      const candidates = await this.loadSearchResults(page, keyword);

      if (candidates.length === 0) {
        console.warn('[TikTokSearch] No video candidates found — page may require login');
        return {
          searchQuery: keyword,
          selectedVideos: [],
          totalCandidates: 0,
          screenshotPath: '',
        };
      }

      // Capture screenshot so Claude can see the visual layout of the results
      const screenshotPath = await this.captureScreenshot(page, keyword);

      // Ask Claude Vision to pick the most relevant videos
      const selectedIndices = await this.selectWithClaude(
        screenshotPath,
        candidates,
        keyword,
        videosToSelect
      );

      // Map selected indices back to full candidate objects
      const selectedVideos = selectedIndices
        .filter(i => i >= 0 && i < candidates.length)
        .map(i => candidates[i]);

      console.log(
        `[TikTokSearch] Selected ${selectedVideos.length}/${candidates.length} ` +
        `candidates for keyword: "${keyword}"`
      );

      return {
        searchQuery: keyword,
        selectedVideos,
        totalCandidates: candidates.length,
        screenshotPath,
      };
    } finally {
      // Always close the browser context to free resources
      if (context) await context.close();
    }
  }

  // ─── Private: browser ─────────────────────────────────────────────────────

  /**
   * Launch a Playwright browser context.
   *
   * Priority:
   *   1. Persistent Chrome profile (TIKTOK_CHROME_PROFILE_PATH is set)
   *      → Reuses existing TikTok login; headed mode required for real profiles.
   *   2. Fresh headless context (fallback)
   *      → No login session; TikTok may show a login wall or limited results.
   *
   * The AutomationControlled flag is disabled to reduce bot-detection likelihood.
   */
  private async launchBrowser(): Promise<BrowserContext> {
    const commonArgs = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ];

    if (this.chromiumProfilePath) {
      console.log(`[TikTokSearch] Using persistent Chrome profile: ${this.chromiumProfilePath}`);
      // launchPersistentContext manages both launch + context in one call
      return chromium.launchPersistentContext(this.chromiumProfilePath, {
        headless: false, // Must be headed when reusing a real Chrome profile
        viewport: { width: 1280, height: 900 },
        args: commonArgs,
      });
    }

    console.log('[TikTokSearch] No Chrome profile set — launching fresh headless browser');
    const browser = await chromium.launch({
      headless: true,
      args: commonArgs,
    });
    return browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Realistic user-agent reduces TikTok bot-detection triggers
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
  }

  // ─── Private: DOM extraction ──────────────────────────────────────────────

  /**
   * Navigate to TikTok search, wait for the page to fully render,
   * and extract video candidates from the DOM.
   */
  private async loadSearchResults(
    page: Page,
    keyword: string
  ): Promise<TikTokVideoCandidate[]> {
    const url = `${TIKTOK_SEARCH_URL}${encodeURIComponent(keyword)}`;
    console.log(`[TikTokSearch] Navigating to: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // TikTok's React app needs extra time to populate the video grid
    await page.waitForTimeout(POST_LOAD_WAIT_MS);

    return this.extractCandidatesFromDOM(page);
  }

  /**
   * Extract video metadata from all TikTok video card links on the page.
   *
   * Strategy: anchor elements whose href contains "/video/" are the most
   * reliable cross-version selector on TikTok's frequently-changing DOM.
   * Author username is parsed directly from the URL pattern /@username/video/.
   * Card text (caption) is scraped from the closest container element.
   *
   * Deduplication by URL ensures each video appears only once even if multiple
   * anchor elements link to the same video (thumbnail + title link pattern).
   */
  private async extractCandidatesFromDOM(page: Page): Promise<TikTokVideoCandidate[]> {
    // page.$$eval runs entirely in the browser context (serializable return value only)
    const rawLinks = await page.$$eval('a[href*="/video/"]', (anchors) =>
      anchors.map((a) => {
        // Cast to any — HTMLAnchorElement is a DOM type not available in lib: ["ES2020"].
        // This callback runs in the browser context anyway; the cast is only for tsc.
        const anchor = a as any;
        // Walk up the DOM to find the video card container and grab its text
        const card = anchor.closest(
          '[class*="Container"], [class*="Item"], [class*="Card"], [class*="wrapper"]'
        );
        return {
          href: anchor.href as string,
          cardText: ((card?.textContent ?? anchor.textContent ?? '') as string).trim(),
        };
      })
    );

    const candidates: TikTokVideoCandidate[] = [];
    const seenUrls = new Set<string>();

    for (const link of rawLinks) {
      // Skip non-video links and duplicates
      if (!link.href.includes('/video/') || seenUrls.has(link.href)) continue;
      seenUrls.add(link.href);

      // Extract the username from the URL: /@username/video/12345
      const authorMatch = link.href.match(/\/@([^/]+)\/video\//);
      const author = authorMatch ? authorMatch[1] : 'unknown';

      candidates.push({
        index: candidates.length,
        // Truncate long captions to keep the Claude prompt manageable
        title: link.cardText.substring(0, 120) || `Video by @${author}`,
        author,
        url: link.href,
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }

    console.log(`[TikTokSearch] Extracted ${candidates.length} candidates from DOM`);
    return candidates;
  }

  // ─── Private: screenshot ──────────────────────────────────────────────────

  /**
   * Capture a viewport screenshot of the current page state.
   * The screenshot is saved to the OS temp directory and its path is returned.
   * The file is kept after the search for audit / debugging purposes.
   */
  private async captureScreenshot(page: Page, keyword: string): Promise<string> {
    // Build a filesystem-safe filename from the keyword
    const safeKeyword = keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 40);
    const screenshotPath = path.join(
      os.tmpdir(),
      `tiktok_search_${safeKeyword}_${Date.now()}.png`
    );

    // fullPage: false — capture only the visible viewport (what a user sees)
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[TikTokSearch] Screenshot saved to: ${screenshotPath}`);

    return screenshotPath;
  }

  // ─── Private: Claude Vision selection ────────────────────────────────────

  /**
   * Send the search results screenshot and candidate list to Claude Vision.
   *
   * Claude receives:
   *   - The screenshot image (so it can see thumbnails, engagement numbers, visual context)
   *   - The text list of candidates with their indices (so it can reference them by number)
   *   - The search keyword (to judge relevance)
   *
   * Claude returns a JSON object with a "selected" array of candidate indices.
   * The response is parsed by parseClaudeSelection(), which falls back to the
   * first N candidates if parsing fails.
   *
   * @returns Array of selected candidate indices
   */
  private async selectWithClaude(
    screenshotPath: string,
    candidates: TikTokVideoCandidate[],
    keyword: string,
    videosToSelect: number
  ): Promise<number[]> {
    const screenshotBase64 = fs.readFileSync(screenshotPath).toString('base64');

    // Build a numbered list of candidates for the text part of the prompt
    const candidateList = candidates
      .map(c => `[${c.index}] @${c.author}: ${c.title}`)
      .join('\n');

    const prompt =
      `This is a screenshot of TikTok search results for the keyword: "${keyword}".\n\n` +
      `Here are the extracted video candidates:\n${candidateList}\n\n` +
      `Please select the ${videosToSelect} videos that are MOST relevant to "${keyword}".\n` +
      `Consider: content relevance, visible engagement signals, caption quality, and variety.\n\n` +
      `Return ONLY this JSON — no explanation, no markdown:\n` +
      `{"selected": [0, 2, 4, 6, 8]}\n` +
      `The array must contain exactly ${videosToSelect} valid index numbers from the list above.`;

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

    return this.parseClaudeSelection(response, candidates.length, videosToSelect);
  }

  /**
   * Parse Claude's JSON response to extract the array of selected indices.
   *
   * Validates that:
   *   - The response contains a JSON object with a "selected" array
   *   - All indices are integers within the valid range
   *
   * Falls back to the first N candidates if the response cannot be parsed,
   * so the pipeline can continue even if Claude returns an unexpected format.
   */
  private parseClaudeSelection(
    response: Anthropic.Message,
    totalCandidates: number,
    videosToSelect: number
  ): number[] {
    try {
      // Concatenate all text blocks from the response
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Extract the first JSON object from the response
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error('No JSON object found in Claude response');

      const parsed = JSON.parse(jsonMatch[0]);
      const rawSelected: unknown[] = parsed.selected ?? [];

      // Validate: keep only integer indices within the valid candidate range
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

      console.log(`[TikTokSearch] Claude selected indices: [${validIndices.join(', ')}]`);
      return validIndices;
    } catch (err) {
      console.warn(
        `[TikTokSearch] Could not parse Claude selection (${err}). ` +
        `Falling back to first ${videosToSelect} candidates.`
      );
      // Fallback: return first N candidates in order
      return Array.from({ length: Math.min(videosToSelect, totalCandidates) }, (_, i) => i);
    }
  }
}
