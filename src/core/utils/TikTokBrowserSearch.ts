/**
 * TikTokBrowserSearch - Playwright-based TikTok search with multi-provider vision selection
 *
 * This module implements Module 1 of the CrowdListen video pipeline.
 * It drives a real browser to perform a TikTok keyword search, extracts video
 * candidates from the DOM, captures a screenshot of the results page, then uses
 * a vision model to intelligently select the most relevant videos.
 *
 * Vision provider fallback order:
 *   1. Claude Vision (ANTHROPIC_API_KEY) — best quality for this task
 *   2. Gemini Vision (GEMINI_API_KEY) — good alternative
 *   3. OpenAI GPT-4o (OPENAI_API_KEY) — widely available
 *   4. First N candidates (no vision model available)
 *
 * Pipeline position:
 *   [TikTokBrowserSearch] → VideoDownloader → VideoUnderstanding → CommentEnricher
 */

import type { BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single TikTok video candidate extracted from the search results page.
 * index is used by the vision model to refer back to specific videos in its selection.
 */
export interface TikTokVideoCandidate {
  index: number;   // 0-based position in the candidates array
  title: string;   // Caption / description text (truncated to 120 chars)
  author: string;  // TikTok username extracted from the video URL
  url: string;     // Full TikTok video URL: https://www.tiktok.com/@user/video/ID
}

/**
 * The result of a browser search + vision selection pass.
 */
export interface BrowserSearchResult {
  searchQuery: string;
  /** Videos selected by the vision model as most relevant to the keyword */
  selectedVideos: TikTokVideoCandidate[];
  /** Total candidates extracted from the page before selection */
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
 * Keeping this reasonable prevents the prompt from becoming too long
 * while still giving the model enough choice for good selection.
 */
const MAX_CANDIDATES = 40;

/**
 * Extra wait after page load for TikTok's React app to finish rendering.
 * TikTok is heavily JS-driven; networkidle alone is not always sufficient.
 */
const POST_LOAD_WAIT_MS = 1500;

// ─── Service class ────────────────────────────────────────────────────────────

export class TikTokBrowserSearchService {
  /**
   * Path to a persistent Playwright Chromium profile directory.
   * When set, Playwright reuses the existing TikTok login session, avoiding
   * login walls and bot-detection challenges.
   *
   * Set via env var: TIKTOK_CHROME_PROFILE_PATH
   */
  private readonly chromiumProfilePath: string | undefined;

  constructor() {
    // No longer requires any specific API key at construction time.
    // Vision provider is selected at runtime based on available keys.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      console.warn(
        '[TikTokSearch] No vision API key found (ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY). ' +
        'Video selection will fall back to returning first N candidates.'
      );
    }
    this.chromiumProfilePath = process.env.TIKTOK_CHROME_PROFILE_PATH;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Search TikTok for a keyword, then use a vision model to select the most
   * relevant videos from the results page.
   *
   * Steps:
   *   1. Launch browser (persistent profile or fresh headless)
   *   2. Navigate to TikTok search and wait for results to render
   *   3. Extract video candidates from the DOM (URLs + metadata)
   *   4. Capture a screenshot of the results page
   *   5. Ask a vision model to select the best N candidates
   *   6. Return selected videos
   */
  async searchAndSelect(
    keyword: string,
    videosToSelect: number = DEFAULT_VIDEOS_TO_SELECT
  ): Promise<BrowserSearchResult> {
    let context: BrowserContext | null = null;

    try {
      context = await this.launchBrowser();
      const page = await context.newPage();

      // IO stub — belt-and-suspenders for any remaining IO-driven thumbnail logic.
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

      // Capture screenshot so the vision model can see the visual layout
      const screenshotPath = await this.captureScreenshot(page, keyword);

      // Ask a vision model to pick the most relevant videos
      const selectedIndices = await this.selectVideos(
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
   *   2. Fresh headless context (fallback)
   */
  private async launchBrowser(): Promise<BrowserContext> {
    const { chromium } = await import('playwright');

    const commonArgs = [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--ignore-certificate-errors',
    ];

    if (this.chromiumProfilePath) {
      console.log(`[TikTokSearch] Using persistent Chrome profile: ${this.chromiumProfilePath}`);

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

    console.log('[TikTokSearch] No Chrome profile set — launching fresh headless browser');
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

  /**
   * Navigate to TikTok search, wait for the page to fully render,
   * and extract video candidates from the DOM.
   */
  private async loadSearchResults(
    page: Page,
    keyword: string
  ): Promise<TikTokVideoCandidate[]> {
    const searchUrl = `${TIKTOK_SEARCH_URL}${encodeURIComponent(keyword)}`;
    console.log(`[TikTokSearch] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(POST_LOAD_WAIT_MS);

    let candidates = await this.extractCandidatesFromDOM(page);

    // If no candidates and we're in headed mode (profile path set), TikTok is
    // likely showing a login wall. Wait up to 3 minutes for the user to log in.
    if (candidates.length === 0 && this.chromiumProfilePath) {
      console.log('[TikTokSearch] No results — TikTok may be showing a login wall.');
      console.log('[TikTokSearch] Please log in to TikTok in the opened browser.');
      console.log('[TikTokSearch] Will retry automatically once login is detected (timeout: 3 min)...');

      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline && candidates.length === 0) {
        await page.waitForTimeout(5_000);
        if (!page.url().includes('/search/')) {
          await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(POST_LOAD_WAIT_MS);
        }
        candidates = await this.extractCandidatesFromDOM(page);
      }

      if (candidates.length > 0) {
        console.log('[TikTokSearch] Login detected — continuing with search results.');
      }
    }

    return candidates;
  }

  /**
   * Extract video metadata from all TikTok video card links on the page.
   */
  private async extractCandidatesFromDOM(page: Page): Promise<TikTokVideoCandidate[]> {
    const rawLinks = await page.$$eval('a[href*="/video/"]', (anchors) =>
      anchors.map((a) => {
        const anchor = a as any;
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
      if (!link.href.includes('/video/') || seenUrls.has(link.href)) continue;
      seenUrls.add(link.href);

      const authorMatch = link.href.match(/\/@([^/]+)\/video\//);
      const author = authorMatch ? authorMatch[1] : 'unknown';

      candidates.push({
        index: candidates.length,
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
   * Capture a viewport screenshot of the search results page.
   */
  private async captureScreenshot(page: Page, keyword: string): Promise<string> {
    await page.waitForTimeout(500);

    const safeKeyword = keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 40);
    const screenshotPath = path.join(
      os.tmpdir(),
      `tiktok_search_${safeKeyword}_${Date.now()}.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[TikTokSearch] Screenshot saved to: ${screenshotPath}`);

    return screenshotPath;
  }

  // ─── Private: multi-provider vision selection ──────────────────────────────

  /**
   * Build the prompt text shared across all vision providers.
   */
  private buildSelectionPrompt(
    candidates: TikTokVideoCandidate[],
    keyword: string,
    videosToSelect: number
  ): string {
    const candidateList = candidates
      .map(c => `[${c.index}] @${c.author}: ${c.title}`)
      .join('\n');

    return (
      `This is a screenshot of TikTok search results for the keyword: "${keyword}".\n\n` +
      `Here are the extracted video candidates:\n${candidateList}\n\n` +
      `Please select the ${videosToSelect} videos that are MOST relevant to "${keyword}".\n` +
      `Consider: content relevance, visible engagement signals, caption quality, and variety.\n\n` +
      `Return ONLY this JSON — no explanation, no markdown:\n` +
      `{"selected": [0, 2, 4, 6, 8]}\n` +
      `The array must contain exactly ${videosToSelect} valid index numbers from the list above.`
    );
  }

  /**
   * Parse a JSON response from any vision model to extract selected indices.
   * Falls back to first N candidates if parsing fails.
   */
  private parseSelectionResponse(
    text: string,
    totalCandidates: number,
    videosToSelect: number,
    provider: string
  ): number[] {
    try {
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');

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

      console.log(`[TikTokSearch] ${provider} selected indices: [${validIndices.join(', ')}]`);
      return validIndices;
    } catch (err) {
      console.warn(
        `[TikTokSearch] Could not parse ${provider} selection (${err}). ` +
        `Falling back to first ${videosToSelect} candidates.`
      );
      return Array.from({ length: Math.min(videosToSelect, totalCandidates) }, (_, i) => i);
    }
  }

  /**
   * Try vision providers in order of preference, falling back through the chain.
   * Last resort: return first N candidates without any vision analysis.
   */
  private async selectVideos(
    screenshotPath: string,
    candidates: TikTokVideoCandidate[],
    keyword: string,
    videosToSelect: number
  ): Promise<number[]> {
    const screenshotBase64 = fs.readFileSync(screenshotPath).toString('base64');
    const prompt = this.buildSelectionPrompt(candidates, keyword, videosToSelect);

    // 1. Claude Vision (best quality for this task)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        return await this.selectWithClaude(screenshotBase64, prompt, candidates.length, videosToSelect);
      } catch (err) {
        console.warn(`[TikTokSearch] Claude Vision failed: ${err}. Trying next provider...`);
      }
    }

    // 2. Gemini Vision
    if (process.env.GEMINI_API_KEY) {
      try {
        return await this.selectWithGemini(screenshotBase64, prompt, candidates.length, videosToSelect);
      } catch (err) {
        console.warn(`[TikTokSearch] Gemini Vision failed: ${err}. Trying next provider...`);
      }
    }

    // 3. OpenAI GPT-4o
    if (process.env.OPENAI_API_KEY) {
      try {
        return await this.selectWithOpenAI(screenshotBase64, prompt, candidates.length, videosToSelect);
      } catch (err) {
        console.warn(`[TikTokSearch] OpenAI Vision failed: ${err}. Using fallback.`);
      }
    }

    // 4. Last resort: first N candidates
    console.warn(`[TikTokSearch] No vision model available — returning first ${videosToSelect} candidates.`);
    return Array.from({ length: Math.min(videosToSelect, candidates.length) }, (_, i) => i);
  }

  /**
   * Select videos using Claude Vision (claude-sonnet-4-6).
   */
  private async selectWithClaude(
    screenshotBase64: string,
    prompt: string,
    totalCandidates: number,
    videosToSelect: number
  ): Promise<number[]> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
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

    const text = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    return this.parseSelectionResponse(text, totalCandidates, videosToSelect, 'Claude');
  }

  /**
   * Select videos using Gemini Vision (gemini-2.5-flash).
   */
  private async selectWithGemini(
    screenshotBase64: string,
    prompt: string,
    totalCandidates: number,
    videosToSelect: number
  ): Promise<number[]> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/png',
          data: screenshotBase64,
        },
      },
      { text: prompt },
    ]);

    const text = result.response.text();
    return this.parseSelectionResponse(text, totalCandidates, videosToSelect, 'Gemini');
  }

  /**
   * Select videos using OpenAI GPT-4o.
   */
  private async selectWithOpenAI(
    screenshotBase64: string,
    prompt: string,
    totalCandidates: number,
    videosToSelect: number
  ): Promise<number[]> {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshotBase64}`,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    return this.parseSelectionResponse(text, totalCandidates, videosToSelect, 'OpenAI');
  }
}
