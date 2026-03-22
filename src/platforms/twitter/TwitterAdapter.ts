/**
 * Twitter/X Platform Adapter
 * Uses @the-convocation/twitter-scraper for HTTP-only access to Twitter's
 * internal API via cookie auth. No browser needed.
 *
 * Auth: TWITTER_USERNAME + TWITTER_PASSWORD env vars, or stored cookies.
 */

import { Scraper, SearchMode } from '@the-convocation/twitter-scraper';
import { BaseAdapter } from '../../core/base/BaseAdapter.js';
import {
  Post,
  Comment,
  PlatformCapabilities,
  PlatformType,
  PlatformConfig,
} from '../../core/interfaces/SocialMediaPlatform.js';

export class TwitterAdapter extends BaseAdapter {
  private scraper: Scraper;

  constructor(config: PlatformConfig) {
    super(config);
    this.scraper = new Scraper();
    this.maxRequestsPerWindow = 20;
  }

  async initialize(): Promise<boolean> {
    try {
      const username = process.env.TWITTER_USERNAME;
      const password = process.env.TWITTER_PASSWORD;

      if (username && password) {
        await this.scraper.login(username, password);
      }

      const loggedIn = await this.scraper.isLoggedIn();
      if (!loggedIn) {
        this.log('Twitter scraper not logged in — some features may be limited', 'warn');
        // Still usable for public content without login
      }

      this.isInitialized = true;
      this.log(`Twitter adapter initialized (logged in: ${loggedIn})`);
      return true;
    } catch (error: any) {
      this.log(`Failed to initialize Twitter adapter: ${error.message}`, 'error');
      // Initialize anyway — scraper can still fetch some public content
      this.isInitialized = true;
      return true;
    }
  }

  async searchContent(query: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }
    await this.enforceRateLimit();

    const posts: Post[] = [];
    const tweets = this.scraper.searchTweets(query, limit, SearchMode.Latest);

    for await (const tweet of tweets) {
      if (posts.length >= limit) break;
      const post = this.normalizeTweet(tweet);
      if (post) posts.push(post);
    }

    this.log(`Found ${posts.length} tweets for query: ${query}`);
    return posts;
  }

  async getTrendingContent(limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateLimit(limit);
    await this.enforceRateLimit();

    try {
      const trends = await this.scraper.getTrends();
      if (!trends || trends.length === 0) {
        return [];
      }

      // Search for the top trend to get actual posts
      const topTrend = trends[0];
      return this.searchContent(topTrend, limit);
    } catch (error) {
      this.handleError(error, 'getTrendingContent');
    }
  }

  async getUserContent(userId: string, limit: number = 10): Promise<Post[]> {
    this.ensureInitialized();
    this.validateUserId(userId);
    this.validateLimit(limit);
    await this.enforceRateLimit();

    const username = userId.replace(/^@/, '');
    const posts: Post[] = [];
    const tweets = this.scraper.getTweets(username, limit);

    for await (const tweet of tweets) {
      if (posts.length >= limit) break;
      const post = this.normalizeTweet(tweet);
      if (post) posts.push(post);
    }

    this.log(`Retrieved ${posts.length} tweets from user @${username}`);
    return posts;
  }

  async getContentComments(contentId: string, limit: number = 20): Promise<Comment[]> {
    this.ensureInitialized();
    this.validateContentId(contentId);
    this.validateLimit(limit);
    await this.enforceRateLimit();

    // Extract tweet ID from URL if needed
    let tweetId = contentId;
    const idMatch = contentId.match(/\/status\/(\d+)/);
    if (idMatch) tweetId = idMatch[1];

    try {
      const tweet = await this.scraper.getTweet(tweetId);
      if (!tweet) {
        this.log(`Tweet ${tweetId} not found`, 'warn');
        return [];
      }

      // Get replies by searching for replies to the tweet
      const comments: Comment[] = [];
      const username = tweet.username || '';
      const replyQuery = `to:${username} conversation_id:${tweetId}`;
      const replies = this.scraper.searchTweets(replyQuery, limit, SearchMode.Latest);

      for await (const reply of replies) {
        if (comments.length >= limit) break;
        const comment = this.normalizeTweetAsComment(reply);
        if (comment) comments.push(comment);
      }

      this.log(`Retrieved ${comments.length} replies for tweet ${tweetId}`);
      return comments;
    } catch (error) {
      this.handleError(error, `getContentComments(${tweetId})`);
    }
  }

  // ── Normalization ──────────────────────────────────────────────────────

  private normalizeTweet(tweet: any): Post | null {
    try {
      const id = tweet.id || '';
      if (!id) return null;

      return {
        id,
        platform: 'twitter',
        author: {
          id: tweet.userId || tweet.username || '',
          username: tweet.username || '',
          displayName: tweet.name || tweet.username || '',
          followerCount: tweet.followersCount,
          verified: tweet.isVerified || tweet.isBlueVerified,
          profileImageUrl: tweet.profileImageUrl,
        },
        content: tweet.text || '',
        mediaUrl: tweet.photos?.[0]?.url || tweet.videos?.[0]?.preview || '',
        engagement: {
          likes: tweet.likes || 0,
          comments: tweet.replies || 0,
          shares: tweet.retweets || 0,
          views: tweet.views || 0,
        },
        timestamp: tweet.timeParsed ? new Date(tweet.timeParsed) : new Date(),
        url: tweet.permanentUrl || `https://x.com/${tweet.username || 'user'}/status/${id}`,
        hashtags: tweet.hashtags || [],
      };
    } catch {
      return null;
    }
  }

  private normalizeTweetAsComment(tweet: any): Comment | null {
    try {
      const id = tweet.id || '';
      if (!id) return null;

      return {
        id,
        author: {
          id: tweet.userId || tweet.username || '',
          username: tweet.username || '',
          displayName: tweet.name || tweet.username || '',
          verified: tweet.isVerified || tweet.isBlueVerified,
        },
        text: tweet.text || '',
        timestamp: tweet.timeParsed ? new Date(tweet.timeParsed) : new Date(),
        likes: tweet.likes || 0,
        engagement: {
          shares: tweet.retweets || 0,
          views: tweet.views || 0,
        },
      };
    } catch {
      return null;
    }
  }

  // ── Platform identity ──────────────────────────────────────────────────

  getPlatformName(): PlatformType {
    return 'twitter';
  }

  getSupportedFeatures(): PlatformCapabilities {
    return {
      supportsTrending: true,
      supportsUserContent: true,
      supportsSearch: true,
      supportsComments: true,
      supportsAnalysis: true,
    };
  }

  async cleanup(): Promise<void> {
    try {
      await this.scraper.logout();
    } catch {
      // Ignore logout errors
    }
    await super.cleanup();
  }
}
