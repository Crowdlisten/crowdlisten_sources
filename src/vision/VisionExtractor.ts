/**
 * VisionExtractor — standalone vision-based content extraction.
 *
 * Given any URL, opens a browser, takes a screenshot, sends to an LLM
 * (Claude → Gemini → OpenAI fallback), and returns structured Post[] or Comment[].
 *
 * This is NOT a filter/verifier — it's a full extractor that reads the screenshot
 * and returns structured data directly.
 *
 * Usage:
 *   const vision = new VisionExtractor();
 *   const result = await vision.extract('https://tiktok.com/...', { mode: 'posts' });
 */

import { Post, Comment } from '../core/interfaces/SocialMediaPlatform.js';
import { getBrowserPool } from '../browser/BrowserPool.js';

export interface VisionExtractionOptions {
  mode: 'posts' | 'comments' | 'raw';
  limit?: number;
  scrollCount?: number;
}

export interface VisionExtractionResult {
  posts?: Post[];
  comments?: Comment[];
  raw?: string;
  provider: string;
  url: string;
}

export class VisionExtractor {
  /**
   * Check if any vision provider is configured.
   */
  isAvailable(): boolean {
    return !!(
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }

  /**
   * Extract structured content from any URL using vision.
   */
  async extract(url: string, options: VisionExtractionOptions): Promise<VisionExtractionResult> {
    const { mode, limit = 10, scrollCount = 3 } = options;

    if (!this.isAvailable()) {
      throw new Error(
        'Vision extraction requires at least one LLM API key.\n' +
        'Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.'
      );
    }

    const pool = getBrowserPool();
    const platform = this.detectPlatform(url);
    const page = await pool.acquire(platform);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Wait for content to load
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch {
        // networkidle timeout is non-fatal
      }

      // Scroll to load more content
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
      }

      // Take full-page screenshot
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      const screenshotBase64 = screenshotBuffer.toString('base64');

      const prompt = this.buildPrompt(mode, url, limit);
      const { text, provider } = await this.askLLM(screenshotBase64, prompt);

      return this.parseResponse(text, provider, url, mode);
    } finally {
      await pool.release(page);
    }
  }

  private detectPlatform(url: string): string {
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('x.com') || url.includes('twitter.com')) return 'twitter';
    if (url.includes('xiaohongshu.com')) return 'xiaohongshu';
    if (url.includes('reddit.com')) return 'reddit';
    if (url.includes('youtube.com')) return 'youtube';
    return 'twitter'; // default profile
  }

  private buildPrompt(mode: 'posts' | 'comments' | 'raw', url: string, limit: number): string {
    if (mode === 'raw') {
      return (
        `This is a screenshot of ${url}.\n\n` +
        `Extract ALL visible text content from this page. Return it as plain text, preserving the structure ` +
        `(headings, paragraphs, lists). Do not add interpretation — just extract what you see.`
      );
    }

    if (mode === 'comments') {
      return (
        `This is a screenshot of ${url}.\n\n` +
        `Extract up to ${limit} visible comments/replies from this page.\n` +
        `Return ONLY this JSON — no explanation, no markdown:\n` +
        `{"comments": [\n` +
        `  {"id": "1", "author": "username", "text": "comment text", "likes": 0},\n` +
        `  ...\n` +
        `]}\n\n` +
        `For each comment, extract the author username, full comment text, and like count (0 if not visible).` +
        ` Return exactly the JSON format above.`
      );
    }

    // mode === 'posts'
    return (
      `This is a screenshot of ${url}.\n\n` +
      `Extract up to ${limit} visible posts/content items from this page.\n` +
      `Return ONLY this JSON — no explanation, no markdown:\n` +
      `{"posts": [\n` +
      `  {"id": "1", "author": "username", "content": "post text", "likes": 0, "comments": 0, "shares": 0, "url": ""},\n` +
      `  ...\n` +
      `]}\n\n` +
      `For each post, extract: author username, content/caption text, engagement metrics (likes, comments, shares — 0 if not visible), ` +
      `and URL if visible. Return exactly the JSON format above.`
    );
  }

  /**
   * Try LLM providers in order: Claude → Gemini → OpenAI
   */
  private async askLLM(screenshotBase64: string, prompt: string): Promise<{ text: string; provider: string }> {
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const text = await this.askClaude(screenshotBase64, prompt);
        return { text, provider: 'claude' };
      } catch (err) {
        console.warn(`[VisionExtractor] Claude failed: ${err}. Trying next...`);
      }
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const text = await this.askGemini(screenshotBase64, prompt);
        return { text, provider: 'gemini' };
      } catch (err) {
        console.warn(`[VisionExtractor] Gemini failed: ${err}. Trying next...`);
      }
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        const text = await this.askOpenAI(screenshotBase64, prompt);
        return { text, provider: 'openai' };
      } catch (err) {
        console.warn(`[VisionExtractor] OpenAI failed: ${err}`);
      }
    }

    throw new Error('All vision providers failed. Check API keys and try again.');
  }

  private async askClaude(screenshotBase64: string, prompt: string): Promise<string> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    return response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }

  private async askGemini(screenshotBase64: string, prompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/png', data: screenshotBase64 } },
      { text: prompt },
    ]);

    return result.response.text();
  }

  private async askOpenAI(screenshotBase64: string, prompt: string): Promise<string> {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    return response.choices[0]?.message?.content || '';
  }

  private parseResponse(
    text: string,
    provider: string,
    url: string,
    mode: 'posts' | 'comments' | 'raw'
  ): VisionExtractionResult {
    if (mode === 'raw') {
      return { raw: text, provider, url };
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`[VisionExtractor] No JSON found in ${provider} response. Returning raw.`);
        return { raw: text, provider, url };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const platform = this.detectPlatform(url);

      if (mode === 'comments' && Array.isArray(parsed.comments)) {
        const comments: Comment[] = parsed.comments.map((c: any, i: number) => ({
          id: c.id || `vision_comment_${i}`,
          author: {
            id: c.author || '',
            username: c.author || '',
            displayName: c.author || '',
          },
          text: c.text || '',
          timestamp: new Date(),
          likes: c.likes || 0,
        }));
        return { comments, provider, url };
      }

      if (mode === 'posts' && Array.isArray(parsed.posts)) {
        const posts: Post[] = parsed.posts.map((p: any, i: number) => ({
          id: p.id || `vision_post_${i}`,
          platform: platform as any,
          author: {
            id: p.author || '',
            username: p.author || '',
            displayName: p.author || '',
          },
          content: p.content || '',
          engagement: {
            likes: p.likes || 0,
            comments: p.comments || 0,
            shares: p.shares || 0,
            views: p.views || 0,
          },
          timestamp: new Date(),
          url: p.url || url,
          hashtags: (p.content || '').match(/#\w+/g)?.map((h: string) => h.slice(1)) || [],
        }));
        return { posts, provider, url };
      }
    } catch (err) {
      console.warn(`[VisionExtractor] Failed to parse ${provider} response as JSON:`, err);
    }

    return { raw: text, provider, url };
  }
}
