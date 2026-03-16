/**
 * Data normalization utilities for converting platform-specific data
 * into standardized formats
 */

import {
  Post,
  User,
  Comment,
  EngagementMetrics,
  PlatformType
} from '../interfaces/SocialMediaPlatform.js';

/**
 * Normalize user data from different platforms
 */
export class DataNormalizer {
  
  /**
   * Normalize a post from any platform to standard format
   */
  static normalizePost(
    rawData: any,
    platform: PlatformType,
    baseUrl: string = ''
  ): Post {
    switch (platform) {
      case 'tiktok':
        return this.normalizeTikTokPost(rawData);
      case 'twitter':
        return this.normalizeTwitterPost(rawData);
      case 'reddit':
        return this.normalizeRedditPost(rawData);
      case 'instagram':
        return this.normalizeInstagramPost(rawData);
      case 'youtube':
        return this.normalizeYouTubePost(rawData);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Normalize user data from any platform
   */
  static normalizeUser(
    rawData: any,
    platform: PlatformType
  ): User {
    switch (platform) {
      case 'tiktok':
        return this.normalizeTikTokUser(rawData);
      case 'twitter':
        return this.normalizeTwitterUser(rawData);
      case 'reddit':
        return this.normalizeRedditUser(rawData);
      case 'instagram':
        return this.normalizeInstagramUser(rawData);
      case 'youtube':
        return this.normalizeYouTubeUser(rawData);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Normalize comment data from any platform
   */
  static normalizeComment(
    rawData: any,
    platform: PlatformType
  ): Comment {
    switch (platform) {
      case 'tiktok':
        return this.normalizeTikTokComment(rawData);
      case 'twitter':
        return this.normalizeTwitterComment(rawData);
      case 'reddit':
        return this.normalizeRedditComment(rawData);
      case 'instagram':
        return this.normalizeInstagramComment(rawData);
      case 'youtube':
        return this.normalizeYouTubeComment(rawData);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // TikTok normalization methods
  private static normalizeTikTokPost(data: any): Post {
    return {
      id: data.id || data.aweme_id || '',
      platform: 'tiktok',
      author: this.normalizeTikTokUser(data.author || {}),
      content: data.desc || data.description || '',
      mediaUrl: data.video?.play_addr?.url_list?.[0] || '',
      engagement: {
        likes: data.stats?.diggCount || data.statistics?.digg_count || 0,
        comments: data.stats?.commentCount || data.statistics?.comment_count || 0,
        shares: data.stats?.shareCount || data.statistics?.share_count || 0,
        views: data.stats?.playCount || data.statistics?.play_count || 0
      },
      timestamp: new Date((data.createTime || data.create_time || Date.now() / 1000) * 1000),
      url: data.webVideoUrl || `https://www.tiktok.com/@${data.author?.uniqueId}/video/${data.id}`,
      hashtags: this.extractHashtags(data.desc || data.description || '')
    };
  }

  private static normalizeTikTokUser(data: any): User {
    return {
      id: data.id || data.uid || '',
      username: data.uniqueId || data.unique_id || '',
      displayName: data.nickname || data.nick_name || '',
      followerCount: data.followerCount || data.follower_count || 0,
      verified: data.verified || false,
      profileImageUrl: data.avatarLarger || data.avatar_larger || '',
      bio: data.signature || ''
    };
  }

  private static normalizeTikTokComment(data: any): Comment {
    return {
      id: data.cid || data.comment_id || '',
      author: this.normalizeTikTokUser(data.user || {}),
      text: data.text || '',
      timestamp: new Date((data.create_time || Date.now() / 1000) * 1000),
      likes: data.digg_count || 0,
      replies: data.reply_comment?.map((reply: any) => this.normalizeTikTokComment(reply)) || []
    };
  }

  // Twitter normalization methods (agent-twitter-client Tweet shape)
  private static normalizeTwitterPost(data: any): Post {
    return {
      id: data.id || '',
      platform: 'twitter',
      author: this.normalizeTwitterUser(data),
      content: data.text || '',
      mediaUrl: data.photos?.[0]?.url || data.videos?.[0]?.preview || '',
      engagement: {
        likes: data.likes || 0,
        comments: data.replies || 0,
        shares: data.retweets || 0,
        views: data.views || 0
      },
      timestamp: data.timeParsed ? new Date(data.timeParsed) :
                 data.timestamp ? new Date(data.timestamp * 1000) : new Date(),
      url: data.permanentUrl || `https://twitter.com/${data.username || 'user'}/status/${data.id}`,
      hashtags: data.hashtags || this.extractHashtags(data.text || '')
    };
  }

  private static normalizeTwitterUser(data: any): User {
    return {
      id: data.userId || data.id || '',
      username: data.username || '',
      displayName: data.name || '',
      followerCount: 0,
      verified: false,
      profileImageUrl: '',
      bio: ''
    };
  }

  private static normalizeTwitterComment(data: any): Comment {
    // Twitter replies normalized as comments
    return {
      id: data.id || '',
      author: this.normalizeTwitterUser(data),
      text: data.text || '',
      timestamp: data.timeParsed ? new Date(data.timeParsed) :
                 data.timestamp ? new Date(data.timestamp * 1000) : new Date(),
      likes: data.likes || 0,
      replies: []
    };
  }

  // Reddit normalization methods
  private static normalizeRedditPost(data: any): Post {
    return {
      id: data.id || '',
      platform: 'reddit',
      author: this.normalizeRedditUser(data.author_display_name || data.author || ''),
      content: data.selftext || data.title || '',
      mediaUrl: data.url_overridden_by_dest || data.url || '',
      engagement: {
        likes: data.score || data.ups || 0,
        comments: data.num_comments || data.comment_count || 0,
        shares: 0, // Reddit doesn't have shares
        views: 0 // Reddit doesn't track views publicly
      },
      timestamp: new Date((data.created_utc || data.created || Date.now() / 1000) * 1000),
      url: `https://reddit.com${data.permalink}`,
      hashtags: []
    };
  }

  private static normalizeRedditUser(data: any): User {
    if (typeof data === 'string') {
      return {
        id: data,
        username: data,
        displayName: data
      };
    }
    
    return {
      id: data.id || data.name || '',
      username: data.name || data.display_name || '',
      displayName: data.display_name || data.name || '',
      followerCount: 0, // Reddit doesn't expose follower counts
      verified: data.is_gold || false,
      profileImageUrl: data.icon_img || '',
      bio: data.public_description || ''
    };
  }

  private static normalizeRedditComment(data: any): Comment {
    // Reddit nests replies as a Listing: replies.data.children[]
    // replies can also be an empty string when there are no replies
    const replyChildren = data.replies?.data?.children || [];
    const replies = replyChildren
      .filter((child: any) => child.kind === 't1' && child.data)
      .map((child: any) => this.normalizeRedditComment(child.data));

    return {
      id: data.id || '',
      author: this.normalizeRedditUser(data.author_display_name || data.author || ''),
      text: data.body || '',
      timestamp: new Date((data.created_utc || Date.now() / 1000) * 1000),
      likes: data.score || data.ups || 0,
      replies
    };
  }

  // Instagram normalization methods
  private static normalizeInstagramPost(data: any): Post {
    return {
      id: data.id || data.pk || '',
      platform: 'instagram',
      author: this.normalizeInstagramUser(data.user || data.owner || {}),
      content: data.caption?.text || data.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      mediaUrl: data.image_versions2?.candidates?.[0]?.url || data.display_url || '',
      engagement: {
        likes: data.like_count || data.edge_media_preview_like?.count || 0,
        comments: data.comment_count || data.edge_media_to_comment?.count || 0,
        shares: 0, // Instagram doesn't expose shares
        views: data.view_count || data.video_view_count || 0
      },
      timestamp: new Date((data.taken_at || data.taken_at_timestamp || Date.now() / 1000) * 1000),
      url: `https://www.instagram.com/p/${data.code || data.shortcode}/`,
      hashtags: this.extractHashtags(data.caption?.text || '')
    };
  }

  private static normalizeInstagramUser(data: any): User {
    return {
      id: data.pk || data.id || '',
      username: data.username || '',
      displayName: data.full_name || data.username || '',
      followerCount: data.follower_count || data.edge_followed_by?.count || 0,
      verified: data.is_verified || false,
      profileImageUrl: data.profile_pic_url || data.profile_pic_url_hd || '',
      bio: data.biography || data.bio || ''
    };
  }

  private static normalizeInstagramComment(data: any): Comment {
    return {
      id: data.pk || data.id || '',
      author: this.normalizeInstagramUser(data.user || {}),
      text: data.text || '',
      timestamp: new Date((data.created_at || data.created_at_utc || Date.now() / 1000) * 1000),
      likes: data.comment_like_count || 0,
      replies: data.child_comment_count ? [] : [] // Instagram API complex for replies
    };
  }

  // YouTube normalization methods
  private static normalizeYouTubePost(data: any): Post {
    const snippet = data.snippet || {};
    const stats = data.statistics || {};
    const videoId = data.id?.videoId || data.id || '';
    return {
      id: videoId,
      platform: 'youtube',
      author: this.normalizeYouTubeUser(snippet),
      content: snippet.title || '',
      mediaUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
      engagement: {
        likes: parseInt(stats.likeCount || '0', 10),
        comments: parseInt(stats.commentCount || '0', 10),
        shares: 0,
        views: parseInt(stats.viewCount || '0', 10)
      },
      timestamp: new Date(snippet.publishedAt || Date.now()),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      hashtags: this.extractHashtags(snippet.title || '')
    };
  }

  private static normalizeYouTubeUser(data: any): User {
    return {
      id: data.channelId || '',
      username: data.channelTitle || '',
      displayName: data.channelTitle || '',
      followerCount: 0,
      verified: false,
      profileImageUrl: '',
      bio: ''
    };
  }

  private static normalizeYouTubeComment(data: any): Comment {
    const topLevel = data.snippet?.topLevelComment?.snippet || {};
    const replies: Comment[] = (data.replies?.comments || []).map((reply: any) => {
      const rs = reply.snippet || {};
      return {
        id: reply.id || '',
        author: {
          id: rs.authorChannelId?.value || '',
          username: rs.authorDisplayName || '',
          displayName: rs.authorDisplayName || ''
        },
        text: rs.textDisplay || rs.textOriginal || '',
        timestamp: new Date(rs.publishedAt || Date.now()),
        likes: rs.likeCount || 0,
        replies: []
      } as Comment;
    });

    return {
      id: data.id || '',
      author: {
        id: topLevel.authorChannelId?.value || '',
        username: topLevel.authorDisplayName || '',
        displayName: topLevel.authorDisplayName || ''
      },
      text: topLevel.textDisplay || topLevel.textOriginal || '',
      timestamp: new Date(topLevel.publishedAt || Date.now()),
      likes: topLevel.likeCount || 0,
      replies
    };
  }

  /**
   * Extract hashtags from text
   */
  private static extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w\u00c0-\u024f\u1e00-\u1eff]+/gi;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map(tag => tag.toLowerCase()) : [];
  }

  /**
   * Calculate engagement rate
   */
  static calculateEngagementRate(
    likes: number,
    comments: number,
    shares: number = 0,
    followerCount: number
  ): number {
    if (followerCount === 0) return 0;
    return ((likes + comments + shares) / followerCount) * 100;
  }

  /**
   * Sanitize and validate text content
   */
  static sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim()
      .substring(0, 2000); // Limit length
  }

  /**
   * Normalize timestamp from various formats
   */
  static normalizeTimestamp(timestamp: any): Date {
    if (!timestamp) return new Date();
    
    if (timestamp instanceof Date) return timestamp;
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    if (typeof timestamp === 'number') {
      // Handle both seconds and milliseconds
      return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    }
    
    return new Date();
  }
}