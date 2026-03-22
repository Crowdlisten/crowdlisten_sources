/**
 * CrowdListen Service Configuration
 * Shared service factory used by MCP and CLI entry points.
 */

import * as dotenv from 'dotenv';
import { UnifiedSocialMediaService, UnifiedServiceConfig } from './services/UnifiedSocialMediaService.js';

dotenv.config();

export function createServiceConfig(): UnifiedServiceConfig {
  const config: UnifiedServiceConfig = {
    platforms: {},
    globalOptions: {
      timeout: 30000,
      retries: 3,
      fallbackStrategy: 'continue',
    },
  };

  // Twitter — uses twitter-scraper, needs TWITTER_USERNAME + TWITTER_PASSWORD
  config.platforms.twitter = {
    platform: 'twitter',
    credentials: {},
  };

  // TikTok — browser adapter
  config.platforms.tiktok = {
    platform: 'tiktok',
    credentials: {},
  };

  // Instagram — browser adapter
  config.platforms.instagram = {
    platform: 'instagram',
    credentials: {},
  };

  // Xiaohongshu — browser adapter
  config.platforms.xiaohongshu = {
    platform: 'xiaohongshu',
    credentials: {},
  };

  // Reddit (no credentials needed for public content)
  config.platforms.reddit = {
    platform: 'reddit',
    credentials: {},
  };

  // YouTube
  if (process.env.YOUTUBE_API_KEY) {
    config.platforms.youtube = {
      platform: 'youtube',
      credentials: { apiKey: process.env.YOUTUBE_API_KEY },
    };
  }

  // Moltbook
  if (process.env.MOLTBOOK_API_KEY) {
    config.platforms.moltbook = {
      platform: 'moltbook',
      credentials: { apiKey: process.env.MOLTBOOK_API_KEY },
    };
  }

  return config;
}

export function createService(): UnifiedSocialMediaService {
  return new UnifiedSocialMediaService(createServiceConfig());
}
