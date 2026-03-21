/**
 * Core interface that all social media platform adapters must implement
 * Provides a unified API for content retrieval across different platforms
 *
 * Analysis types (EnrichedComment, OpinionUnit, etc.) have been moved to
 * the CrowdListen API. This file now only contains retrieval types.
 */

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

export interface ContentAnalysis {
  postId: string;
  platform: PlatformType;
  sentiment?: 'positive' | 'negative' | 'neutral';
  themes?: string[];
  summary?: string;
  commentCount: number;
  topComments: Comment[];
  analysisMetadata?: Record<string, unknown>;
}

export interface CommentCluster {
  id: number;
  theme: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  comments: Comment[];
  summary: string;
  size: number;
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
  supportsAnalysis: boolean;
}

/**
 * Main interface that all platform adapters must implement
 */
export interface SocialMediaPlatform {
  getTrendingContent(limit?: number): Promise<Post[]>;
  getUserContent(userId: string, limit?: number): Promise<Post[]>;
  searchContent(query: string, limit?: number): Promise<Post[]>;
  getContentComments(contentId: string, limit?: number): Promise<Comment[]>;
  analyzeContent(contentId: string, enableClustering?: boolean): Promise<ContentAnalysis>;
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
