/**
 * Base adapter class providing common functionality for all social media platforms
 * Implements shared features like rate limiting, error handling, and logging
 *
 * Analysis (clustering, enrichment) has been moved to the CrowdListen API.
 * This class now only handles data retrieval.
 */

import {
  SocialMediaPlatform,
  PlatformType,
  PlatformConfig,
  PlatformCapabilities,
  Post,
  User,
  Comment,
  ContentAnalysis,
  SocialMediaError,
  RateLimitError
} from '../interfaces/SocialMediaPlatform.js';

export abstract class BaseAdapter implements SocialMediaPlatform {
  protected config: PlatformConfig;
  protected isInitialized: boolean = false;
  protected lastRequestTime: number = 0;
  protected requestCount: number = 0;
  protected rateLimitWindow: number = 60000; // 1 minute window
  protected maxRequestsPerWindow: number = 30; // Max 30 requests per minute

  constructor(config: PlatformConfig) {
    this.config = config;
  }

  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset request count if window has passed
    if (timeSinceLastRequest > this.rateLimitWindow) {
      this.requestCount = 0;
    }

    // If we've hit the rate limit, wait
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.rateLimitWindow - timeSinceLastRequest;
      if (waitTime > 0) {
        this.log(`Rate limit reached. Waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
        this.requestCount = 0;
      }
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected handleError(error: any, operation: string): never {
    this.log(`Error in ${operation}: ${error.message || error}`, 'error');

    if (this.isRateLimitError(error)) {
      throw new RateLimitError(
        this.getPlatformName(),
        error
      );
    }

    if (this.isAuthError(error)) {
      throw new SocialMediaError(
        `Authentication failed during ${operation}`,
        'authentication_error',
        this.getPlatformName(),
        error.statusCode
      );
    }

    if (this.isNotFoundError(error)) {
      throw new SocialMediaError(
        `Resource not found during ${operation}`,
        'not_found',
        this.getPlatformName(),
        error.statusCode
      );
    }

    throw new SocialMediaError(
      `Operation ${operation} failed: ${error.message || error}`,
      'unknown_error',
      this.getPlatformName(),
      error.statusCode
    );
  }

  protected isRateLimitError(error: any): boolean {
    return error.statusCode === 429 || error.code === 'rate_limit_exceeded';
  }

  protected isAuthError(error: any): boolean {
    return error.statusCode === 401 || error.statusCode === 403;
  }

  protected isNotFoundError(error: any): boolean {
    return error.statusCode === 404;
  }

  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const platformName = this.getPlatformName();
    const prefix = `[${timestamp}] [${platformName.toUpperCase()}]`;

    switch (level) {
      case 'error':
        console.error(`${prefix} ERROR: ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} WARN: ${message}`);
        break;
      default:
        console.log(`${prefix} INFO: ${message}`);
    }
  }

  protected validateUserId(userId: string): void {
    if (!userId || userId.trim().length === 0) {
      throw new SocialMediaError(
        'User ID cannot be empty',
        'validation_error',
        this.getPlatformName()
      );
    }
  }

  protected validateContentId(contentId: string): void {
    if (!contentId || contentId.trim().length === 0) {
      throw new SocialMediaError(
        'Content ID cannot be empty',
        'validation_error',
        this.getPlatformName()
      );
    }
  }

  protected validateLimit(limit: number): void {
    if (limit < 1 || limit > 1000) {
      throw new SocialMediaError(
        'Limit must be between 1 and 1000',
        'validation_error',
        this.getPlatformName()
      );
    }
  }

  async analyzeContent(contentId: string, enableClustering: boolean = true): Promise<ContentAnalysis> {
    this.validateContentId(contentId);

    try {
      await this.enforceRateLimit();
      const comments = await this.getContentComments(contentId, 200);

      // Return basic post metadata only — analysis is handled by the CrowdListen API
      const analysis: ContentAnalysis = {
        postId: contentId,
        platform: this.getPlatformName(),
        sentiment: 'neutral',
        themes: ['general'],
        summary: `Retrieved ${comments.length} comments for ${contentId}. Use analyze_content with CROWDLISTEN_API_KEY for full analysis.`,
        commentCount: comments.length,
        topComments: comments.slice(0, 5),
      };

      return analysis;
    } catch (error) {
      this.handleError(error, 'analyzeContent');
    }
  }

  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new SocialMediaError(
        'Adapter not initialized. Call initialize() first.',
        'initialization_error',
        this.getPlatformName()
      );
    }
  }

  // Abstract methods that must be implemented by specific platform adapters
  abstract getTrendingContent(limit?: number): Promise<Post[]>;
  abstract getUserContent(userId: string, limit?: number): Promise<Post[]>;
  abstract searchContent(query: string, limit?: number): Promise<Post[]>;
  abstract getContentComments(contentId: string, limit?: number): Promise<Comment[]>;
  abstract getPlatformName(): PlatformType;
  abstract getSupportedFeatures(): PlatformCapabilities;
  abstract initialize(): Promise<boolean>;

  async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.log('Adapter cleaned up');
  }
}
