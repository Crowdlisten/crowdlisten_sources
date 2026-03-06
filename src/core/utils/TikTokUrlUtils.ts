import axios from 'axios';

/**
 * Shared TikTok URL utilities for detection, redirect resolution, and video ID extraction.
 */
export class TikTokUrlUtils {
  private static readonly TIKTOK_HOST_PATTERN = /(^|\.)tiktok\.com$/i;

  static isTikTokUrl(input: string): boolean {
    const parsed = this.tryParseUrl(input);
    if (!parsed) return false;
    return this.TIKTOK_HOST_PATTERN.test(parsed.hostname);
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

  static extractVideoId(input: string): string | null {
    const parsed = this.tryParseUrl(input);
    if (!parsed) {
      return null;
    }

    const pathMatch = parsed.pathname.match(/\/video\/(\d+)/);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }

    const itemId = parsed.searchParams.get('item_id') || parsed.searchParams.get('aweme_id');
    if (itemId && /^\d+$/.test(itemId)) {
      return itemId;
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
