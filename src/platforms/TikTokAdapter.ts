/**
 * TikTok Platform Adapter
 *
 * Provides TikTok content retrieval through two complementary strategies:
 *
 *   searchContent()      → TikTokBrowserSearchService (Playwright + Claude Vision)
 *                          Launches a real browser, navigates to TikTok search,
 *                          and uses Claude to select the most relevant videos.
 *
 *   getTrendingContent() → HTTP fallback against TikTok's internal API.
 *   getUserContent()     → HTTP fallback (limited without advanced API access).
 *   getContentComments() → HTTP fallback against TikTok's comment API.
 *
 * The browser-based search approach replaces the previous searchViaHttp()
 * implementation, which could not reliably sign TikTok's internal API requests.
 */

import axios from 'axios';
import { BaseAdapter } from '../core/base/BaseAdapter.js';
import { DataNormalizer } from '../core/utils/DataNormalizer.js';
import { TikTokCommentAnalysisService } from '../core/utils/TikTokCommentAnalysis.js';
import { TikTokBrowserSearchService } from '../core/utils/TikTokBrowserSearch.js';
import { TikTokUrlUtils } from '../core/utils/TikTokUrlUtils.js';
import {
  ContentAnalysis,
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
} from '../core/interfaces/SocialMediaPlatform.js';

export class TikTokAdapter extends BaseAdapter {
  private msToken?: string;
  private commentAnalysisService: TikTokCommentAnalysisService;

  constructor(config: PlatformConfig) {
    super(config);
    this.msToken = config.credentials?.ms_token;
    this.commentAnalysisService = new TikTokCommentAnalysisService();
    // Conservative rate limiting — TikTok's APIs are sensitive to high request volume
    this.maxRequestsPerWindow = 30;
  }

  async initialize(): Promise<boolean> {
    try {
      this.log('Initializing TikTok adapter...', 'info');

      if (this.msToken) {
        this.log('TikTok ms_token available — enhanced HTTP functionality enabled', 'info');
      } else {
        this.log('No ms_token provided — HTTP endpoints will have limited functionality', 'warn');
      }

      this.isInitialized = true;
      this.log('TikTok adapter initialized successfully', 'info');
      return true;
    } catch (error) {
      this.log(`Failed to initialize TikTok adapter: ${error}`, 'error');
      this.isInitialized = false;
      return false;
    }
  }

  // ─── SocialMediaPlatform interface ───────────────────────────────────────

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();
      const videos = await this.getTrendingViaHttp(limit);
      this.log(`Retrieved ${videos.length} trending TikTok videos`, 'info');
      return videos.map(video => DataNormalizer.normalizePost(video, 'tiktok'));
    } catch (error) {
      this.handleError(error, 'getTrendingContent');
    }
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();
      const videos = await this.getUserViaHttp(userId, limit);
      this.log(`Retrieved ${videos.length} videos from TikTok user @${userId}`, 'info');
      return videos.map(video => DataNormalizer.normalizePost(video, 'tiktok'));
    } catch (error) {
      this.handleError(error, 'getUserContent');
    }
  }

  /**
   * Search TikTok by keyword using browser automation + Claude Vision selection.
   *
   * This method drives a real Chromium browser to perform the search, extracts
   * video candidates from the DOM, then asks Claude Vision to select the most
   * relevant results. The selected videos are mapped to the standard Post format.
   *
   * The limit parameter is passed as the target number of videos Claude should
   * select (capped at 5 to keep browser sessions fast and costs low).
   */
  async searchContent(query: string, limit: number = 5): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    try {
      await this.enforceRateLimit();

      const trimmedQuery = query.trim();
      if (TikTokUrlUtils.isTikTokUrl(trimmedQuery)) {
        const urlPosts = await this.getVideoByUrl(trimmedQuery);
        this.log(`Resolved TikTok URL query to ${urlPosts.length} video(s)`, 'info');
        return urlPosts.slice(0, limit);
      }

      const searcher = new TikTokBrowserSearchService();
      // Cap at 5 — browser sessions are slow; more videos come from multiple searches
      const videosToSelect = Math.min(limit, 5);

      const result = await searcher.searchAndSelect(trimmedQuery, videosToSelect);

      // Convert TikTokVideoCandidate objects to standard Post format
      const posts: Post[] = result.selectedVideos.map(candidate =>
        this.candidateToPost(candidate)
      );

      this.log(
        `Browser search for "${query}" returned ${posts.length} selected videos ` +
        `(from ${result.totalCandidates} candidates)`,
        'info'
      );

      return posts;
    } catch (error) {
      this.handleError(error, 'searchContent');
    }
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    this.validateLimit(limit);

    try {
      await this.enforceRateLimit();
      const comments = await this.getCommentsViaHttp(contentId, limit);
      this.log(`Retrieved ${comments.length} comments for TikTok video ${contentId}`, 'info');
      return comments.map(comment => DataNormalizer.normalizeComment(comment, 'tiktok'));
    } catch (error) {
      this.handleError(error, 'getContentComments');
    }
  }

  async analyzeContent(contentId: string, enableClustering: boolean = true): Promise<ContentAnalysis> {
    this.ensureInitialized();
    this.validateContentId(contentId);

    try {
      let normalizedContentId = contentId;
      let post: Post | undefined;

      // Canonicalize URLs to a stable video ID so comment retrieval and video
      // understanding both operate on the same TikTok asset.
      if (TikTokUrlUtils.isTikTokUrl(contentId)) {
        const resolvedUrl = await TikTokUrlUtils.resolveUrl(contentId);
        const extractedId = TikTokUrlUtils.extractVideoId(resolvedUrl);
        if (!extractedId) {
          throw new Error(`Unable to extract TikTok video ID from URL: ${contentId}`);
        }
        normalizedContentId = extractedId;
        const posts = await this.getVideoByUrl(resolvedUrl);
        post = posts[0];
      }

      const comments = await this.getContentComments(normalizedContentId, 200);
      // TikTok uses the richer comment+video analysis path instead of the
      // generic BaseAdapter summary flow.
      const analysis = await this.commentAnalysisService.analyzeVideo({
        contentId: post?.url || contentId,
        comments,
        post,
        searchKeyword: post?.content,
        maxComments: 200,
      });

      if (!enableClustering) {
        return {
          ...analysis,
          clustering: undefined,
          localClusters: undefined,
          metaClusters: undefined,
          insights: undefined,
          askLayerIndex: undefined,
        };
      }

      return analysis;
    } catch (error) {
      this.handleError(error, 'analyzeContent');
    }
  }

  getPlatformName(): PlatformType {
    return 'tiktok';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,    // Browser-based search via TikTokBrowserSearchService
      supportsComments: true,
      supportsAnalysis: true,
    };
  }

  async cleanup(): Promise<void> {
    try {
      await super.cleanup();
    } catch (error) {
      this.log(`Error during TikTok cleanup: ${error}`, 'warn');
    }
  }

  // ─── Private: HTTP fallbacks ──────────────────────────────────────────────

  /**
   * Fetch trending videos from TikTok's internal recommendation API.
   * Returns an empty array if the request fails — callers handle degraded state.
   */
  private async getTrendingViaHttp(limit: number): Promise<any[]> {
    const url =
      `https://www.tiktok.com/api/recommend/item_list/` +
      `?aid=1988&count=${limit}&app_language=en&device_platform=web_pc`;

    try {
      const response = await axios.get(url, { headers: this.buildHttpHeaders() });
      return response.data?.itemList || response.data?.items || [];
    } catch (error) {
      this.log(`HTTP trending request failed: ${error}`, 'warn');
    }
    return [];
  }

  /**
   * Fetch a user's recent videos from TikTok's internal API.
   * Note: this endpoint requires advanced API access; returns empty array otherwise.
   */
  private async getUserViaHttp(userId: string, limit: number): Promise<any[]> {
    this.log(
      `TikTok user content for @${userId} requires advanced API access — ` +
      `returning empty. Limit requested: ${limit}`,
      'warn'
    );
    return [];
  }

  /**
   * Fetch comments for a video from TikTok's comment API.
   * Returns an empty array if the request fails.
   */
  private async getCommentsViaHttp(videoId: string, limit: number): Promise<any[]> {
    const url =
      `https://www.tiktok.com/api/comment/list/` +
      `?aid=1988&aweme_id=${videoId}&count=${limit}&cursor=0`;

    try {
      const response = await axios.get(url, { headers: this.buildHttpHeaders() });
      return response.data?.comments || [];
    } catch (error) {
      this.log(`HTTP comments request failed for video ${videoId}: ${error}`, 'warn');
    }
    return [];
  }

  /**
   * Build HTTP request headers that mimic a real browser session.
   * Includes msToken cookie when available for authenticated requests.
   */
  private buildHttpHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.tiktok.com/',
      'Origin': 'https://www.tiktok.com',
    };

    if (this.msToken) {
      headers['Cookie'] = `msToken=${this.msToken}`;
    }

    return headers;
  }

  // ─── Private: data conversion ─────────────────────────────────────────────

  /**
   * Convert a TikTokVideoCandidate (from browser search) into a standard Post object.
   *
   * Browser-extracted candidates have limited metadata compared to API responses
   * (no engagement counts, no timestamps), so those fields are set to zero/now.
   * The video ID and URL are always available via URL parsing.
   */
  private candidateToPost(candidate: {
    title: string;
    author: string;
    url: string;
  }): Post {
    const videoId = TikTokUrlUtils.extractVideoId(candidate.url) || candidate.url;

    return {
      id: videoId,
      platform: 'tiktok',
      author: {
        id: candidate.author,
        username: candidate.author,
        displayName: candidate.author,
      },
      content: candidate.title,
      mediaUrl: '',
      // Engagement metrics are not available from browser-scraped search results
      engagement: {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
      },
      timestamp: new Date(),
      url: candidate.url,
      hashtags: [],
    };
  }

  private async getVideoByUrl(url: string): Promise<Post[]> {
    const resolvedUrl = await TikTokUrlUtils.resolveUrl(url);
    const videoId = TikTokUrlUtils.extractVideoId(resolvedUrl);

    if (!videoId) {
      throw new Error(`Unable to extract TikTok video id from URL: ${url}`);
    }

    const metadata = await this.getVideoMetadataViaOEmbed(resolvedUrl);

    return [
      {
        id: videoId,
        platform: 'tiktok',
        author: {
          id: metadata.authorName || 'unknown',
          username: metadata.authorName || 'unknown',
          displayName: metadata.authorName || 'unknown',
        },
        content: metadata.title || `TikTok video ${videoId}`,
        mediaUrl: metadata.thumbnailUrl || '',
        engagement: {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        },
        timestamp: new Date(),
        url: resolvedUrl,
        hashtags: [],
      },
    ];
  }

  private async getVideoMetadataViaOEmbed(url: string): Promise<{
    title?: string;
    authorName?: string;
    thumbnailUrl?: string;
  }> {
    try {
      const response = await axios.get('https://www.tiktok.com/oembed', {
        params: { url },
        timeout: 10000,
      });

      return {
        title: response.data?.title,
        authorName: response.data?.author_name,
        thumbnailUrl: response.data?.thumbnail_url,
      };
    } catch (error) {
      this.log(`TikTok oEmbed lookup failed for ${url}: ${error}`, 'warn');
      return {};
    }
  }


  // ─── Protected: error detection (overrides BaseAdapter) ──────────────────

  protected isRateLimitError(error: any): boolean {
    return (
      error.message?.includes('rate limit') ||
      error.status === 429
    );
  }

  protected isAuthError(error: any): boolean {
    return (
      error.message?.includes('authentication') ||
      error.status === 401 ||
      error.status === 403
    );
  }

  protected isNotFoundError(error: any): boolean {
    return (
      error.status === 404 ||
      error.message?.includes('not found')
    );
  }
}
