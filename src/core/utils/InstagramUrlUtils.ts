import axios from 'axios';

/**
 * Shared Instagram URL utilities for detection, redirect resolution, and shortcode extraction.
 */
export class InstagramUrlUtils {
  private static readonly INSTAGRAM_HOST_PATTERN = /(^|\.)instagram\.com$/i;

  static isInstagramUrl(input: string): boolean {
    const parsed = this.tryParseUrl(input);
    if (!parsed) return false;
    return this.INSTAGRAM_HOST_PATTERN.test(parsed.hostname);
  }

  static isReelUrl(input: string): boolean {
    const parsed = this.tryParseUrl(input);
    if (!parsed) return false;
    return /\/(reel|reels)\//i.test(parsed.pathname);
  }

  static async resolveUrl(input: string): Promise<string> {
    const parsed = this.tryParseUrl(input);
    if (!parsed) {
      return input;
    }

    try {
      const response = await axios.get(parsed.toString(), {
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const finalUrl = (response.request as any)?.res?.responseUrl;
      return typeof finalUrl === 'string' && finalUrl.length > 0 ? finalUrl : parsed.toString();
    } catch {
      return parsed.toString();
    }
  }

  static extractShortcode(input: string): string | null {
    const parsed = this.tryParseUrl(input);
    if (!parsed) {
      return null;
    }

    // Match /reel/{shortcode}/ or /p/{shortcode}/ or /reels/{shortcode}/
    const match = parsed.pathname.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
    if (match?.[2]) {
      return match[2];
    }

    return null;
  }

  private static tryParseUrl(input: string): URL | null {
    if (!input || input.trim().length === 0) {
      return null;
    }

    try {
      return new URL(input.trim());
    } catch {
      return null;
    }
  }
}
