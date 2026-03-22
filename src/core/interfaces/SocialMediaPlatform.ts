/**
 * Core interface that all social media platform adapters must implement.
 * Provides a unified API for content retrieval across different platforms.
 *
 * This is the retrieval contract only. Analysis (sentiment, clustering,
 * enrichment) belongs in the Processing layer (CrowdListen agent API).
 */

/**
 * Contract version shared between the TypeScript and Python stacks.
 * Bump this when the SocialMediaPlatform interface changes shape so
 * both sides can assert they are speaking the same version.
 */
export const ADAPTER_CONTRACT_VERSION = '1.0.0';

export interface Post {
  id: string;
  platform: PlatformType;
  author: User;
  content: string;
  mediaUrl?: string;
  engagement: EngagementMetrics;
  timestamp: Date;
  url: string;
  hashtags?: string[];
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  followerCount?: number;
  verified?: boolean;
  profileImageUrl?: string;
  bio?: string;
}

export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares?: number;
  views?: number;
  engagementRate?: number;
}

export interface Comment {
  id: string;
  author: User;
  text: string;
  timestamp: Date;
  likes: number;
  replies?: Comment[];
  engagement?: {
    upvotes?: number;      // Reddit upvotes
    downvotes?: number;    // Reddit downvotes
    shares?: number;       // Platform shares/retweets
    views?: number;        // View count if available
    score?: number;        // Calculated engagement score
  };
}

export interface TrendingHashtag {
  hashtag: string;
  postCount: number;
  engagementScore: number;
}

export type PlatformType = 'tiktok' | 'twitter' | 'reddit' | 'instagram' | 'youtube' | 'moltbook' | 'xiaohongshu';

export interface PlatformCapabilities {
  supportsTrending: boolean;
  supportsUserContent: boolean;
  supportsSearch: boolean;
  supportsComments: boolean;
}

/**
 * Main interface that all platform adapters must implement.
 * Pure retrieval — no analysis methods.
 */
export interface SocialMediaPlatform {
  getTrendingContent(limit?: number): Promise<Post[]>;
  getUserContent(userId: string, limit?: number): Promise<Post[]>;
  searchContent(query: string, limit?: number): Promise<Post[]>;
  getContentComments(contentId: string, limit?: number): Promise<Comment[]>;
  getPlatformName(): PlatformType;
  getSupportedFeatures(): PlatformCapabilities;
  initialize(): Promise<boolean>;
  cleanup(): Promise<void>;
}

/**
 * Configuration interface for platform adapters
 */
export interface PlatformConfig {
  platform: PlatformType;
  credentials?: Record<string, string>;
  options?: {
    rateLimit?: number;
    timeout?: number;
    retries?: number;
  };
}

/**
 * Error types for unified error handling
 */
export class SocialMediaError extends Error {
  constructor(
    message: string,
    public code: string,
    public platform: PlatformType,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SocialMediaError';
  }
}

export class AuthenticationError extends SocialMediaError {
  constructor(platform: PlatformType, originalError?: Error) {
    super(`Authentication failed for ${platform}`, 'AUTH_ERROR', platform, undefined, originalError);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SocialMediaError {
  constructor(platform: PlatformType, originalError?: Error) {
    super(`Rate limit exceeded for ${platform}`, 'RATE_LIMIT', platform, undefined, originalError);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends SocialMediaError {
  constructor(platform: PlatformType, resource: string, originalError?: Error) {
    super(`${resource} not found on ${platform}`, 'NOT_FOUND', platform, undefined, originalError);
    this.name = 'NotFoundError';
  }
}
