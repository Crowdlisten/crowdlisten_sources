/**
 * RequestInterceptor — captures JSON responses from internal platform API calls.
 * Registers response listeners on a Playwright Page, filters by URL patterns,
 * and stores structured JSON for later retrieval.
 */

import { Page, Response } from 'playwright';

export interface InterceptedResponse {
  url: string;
  status: number;
  data: any;
  timestamp: number;
  matchedPattern: string;
}

export class RequestInterceptor {
  private intercepted: InterceptedResponse[] = [];
  private patterns: string[] = [];
  private seenHashes: Set<string> = new Set();
  private listening: boolean = false;

  /**
   * Set up response interception on a page for the given URL patterns.
   * Patterns are substring-matched against response URLs.
   */
  async setup(page: Page, urlPatterns: string[]): Promise<void> {
    this.patterns = urlPatterns;
    this.intercepted = [];
    this.seenHashes.clear();
    this.listening = true;

    page.on('response', async (response: Response) => {
      if (!this.listening) return;

      const url = response.url();
      const matchedPattern = this.patterns.find(p => url.includes(p));
      if (!matchedPattern) return;

      try {
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('json') && !contentType.includes('javascript')) {
          return;
        }

        const status = response.status();
        if (status < 200 || status >= 400) return;

        const body = await response.json().catch(() => null);
        if (!body) return;

        // Deduplicate by hashing URL + stringified body
        const hash = this.computeHash(url, body);
        if (this.seenHashes.has(hash)) return;
        this.seenHashes.add(hash);

        this.intercepted.push({
          url,
          status,
          data: body,
          timestamp: Date.now(),
          matchedPattern,
        });
      } catch {
        // Non-JSON response or body read failure — skip silently
      }
    });
  }

  /**
   * Get all intercepted responses matching a specific pattern.
   */
  getIntercepted(pattern?: string): InterceptedResponse[] {
    if (!pattern) return [...this.intercepted];
    return this.intercepted.filter(r => r.matchedPattern === pattern || r.url.includes(pattern));
  }

  /**
   * Get all intercepted data payloads (just the JSON bodies).
   */
  getAllData(pattern?: string): any[] {
    return this.getIntercepted(pattern).map(r => r.data);
  }

  /**
   * Wait for a response matching a specific pattern, with timeout.
   */
  async waitForResponse(page: Page, pattern: string, timeout: number = 15000): Promise<InterceptedResponse | null> {
    // Check if we already have it
    const existing = this.intercepted.find(r => r.url.includes(pattern));
    if (existing) return existing;

    return new Promise<InterceptedResponse | null>((resolve) => {
      const startTime = Date.now();

      const check = setInterval(() => {
        const match = this.intercepted.find(r =>
          r.url.includes(pattern) && r.timestamp > startTime
        );
        if (match) {
          clearInterval(check);
          resolve(match);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(check);
          resolve(null);
        }
      }, 200);
    });
  }

  /**
   * Clear all captured data.
   */
  clear(): void {
    this.intercepted = [];
    this.seenHashes.clear();
  }

  /**
   * Stop listening for responses.
   */
  stop(): void {
    this.listening = false;
  }

  get count(): number {
    return this.intercepted.length;
  }

  private computeHash(url: string, body: any): string {
    // Simple hash for deduplication — URL path + first 200 chars of stringified body
    const urlPath = new URL(url).pathname;
    const bodyStr = JSON.stringify(body).substring(0, 200);
    return `${urlPath}::${bodyStr}`;
  }
}
