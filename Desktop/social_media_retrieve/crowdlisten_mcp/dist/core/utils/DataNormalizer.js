/**
 * Data normalization utilities for converting platform-specific data
 * into standardized formats
 */
/**
 * Normalize user data from different platforms
 */
export class DataNormalizer {
    /**
     * Normalize a post from any platform to standard format
     */
    static normalizePost(rawData, platform, baseUrl = '') {
        switch (platform) {
            case 'tiktok':
                return this.normalizeTikTokPost(rawData);
            case 'twitter':
                return this.normalizeTwitterPost(rawData);
            case 'reddit':
                return this.normalizeRedditPost(rawData);
            case 'instagram':
                return this.normalizeInstagramPost(rawData);
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    /**
     * Normalize user data from any platform
     */
    static normalizeUser(rawData, platform) {
        switch (platform) {
            case 'tiktok':
                return this.normalizeTikTokUser(rawData);
            case 'twitter':
                return this.normalizeTwitterUser(rawData);
            case 'reddit':
                return this.normalizeRedditUser(rawData);
            case 'instagram':
                return this.normalizeInstagramUser(rawData);
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    /**
     * Normalize comment data from any platform
     */
    static normalizeComment(rawData, platform) {
        switch (platform) {
            case 'tiktok':
                return this.normalizeTikTokComment(rawData);
            case 'twitter':
                return this.normalizeTwitterComment(rawData);
            case 'reddit':
                return this.normalizeRedditComment(rawData);
            case 'instagram':
                return this.normalizeInstagramComment(rawData);
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    // TikTok normalization methods
    static normalizeTikTokPost(data) {
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
    static normalizeTikTokUser(data) {
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
    static normalizeTikTokComment(data) {
        return {
            id: data.cid || data.comment_id || '',
            author: this.normalizeTikTokUser(data.user || {}),
            text: data.text || '',
            timestamp: new Date((data.create_time || Date.now() / 1000) * 1000),
            likes: data.digg_count || 0,
            replies: data.reply_comment?.map((reply) => this.normalizeTikTokComment(reply)) || []
        };
    }
    // Twitter normalization methods
    static normalizeTwitterPost(data) {
        return {
            id: data.id || data.id_str || '',
            platform: 'twitter',
            author: this.normalizeTwitterUser(data.author || data.user || {}),
            content: data.text || data.full_text || '',
            mediaUrl: data.attachments?.media_keys?.[0] || '',
            engagement: {
                likes: data.public_metrics?.like_count || data.favorite_count || 0,
                comments: data.public_metrics?.reply_count || data.reply_count || 0,
                shares: data.public_metrics?.retweet_count || data.retweet_count || 0,
                views: data.public_metrics?.impression_count || 0
            },
            timestamp: new Date(data.created_at || Date.now()),
            url: `https://twitter.com/${data.author?.username || 'user'}/status/${data.id}`,
            hashtags: this.extractHashtags(data.text || data.full_text || '')
        };
    }
    static normalizeTwitterUser(data) {
        return {
            id: data.id || data.id_str || '',
            username: data.username || data.screen_name || '',
            displayName: data.name || '',
            followerCount: data.public_metrics?.followers_count || data.followers_count || 0,
            verified: data.verified || false,
            profileImageUrl: data.profile_image_url || '',
            bio: data.description || ''
        };
    }
    static normalizeTwitterComment(data) {
        // Twitter doesn't have traditional comments, this is for replies
        return {
            id: data.id || '',
            author: this.normalizeTwitterUser(data.author || {}),
            text: data.text || '',
            timestamp: new Date(data.created_at || Date.now()),
            likes: data.public_metrics?.like_count || 0,
            replies: []
        };
    }
    // Reddit normalization methods
    static normalizeRedditPost(data) {
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
    static normalizeRedditUser(data) {
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
    static normalizeRedditComment(data) {
        return {
            id: data.id || '',
            author: this.normalizeRedditUser(data.author_display_name || data.author || ''),
            text: data.body || '',
            timestamp: new Date((data.created_utc || Date.now() / 1000) * 1000),
            likes: data.score || data.ups || 0,
            replies: data.replies?.children?.map((reply) => this.normalizeRedditComment(reply.data)) || []
        };
    }
    // Instagram normalization methods
    static normalizeInstagramPost(data) {
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
    static normalizeInstagramUser(data) {
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
    static normalizeInstagramComment(data) {
        return {
            id: data.pk || data.id || '',
            author: this.normalizeInstagramUser(data.user || {}),
            text: data.text || '',
            timestamp: new Date((data.created_at || data.created_at_utc || Date.now() / 1000) * 1000),
            likes: data.comment_like_count || 0,
            replies: data.child_comment_count ? [] : [] // Instagram API complex for replies
        };
    }
    /**
     * Extract hashtags from text
     */
    static extractHashtags(text) {
        const hashtagRegex = /#[\w\u00c0-\u024f\u1e00-\u1eff]+/gi;
        const matches = text.match(hashtagRegex);
        return matches ? matches.map(tag => tag.toLowerCase()) : [];
    }
    /**
     * Calculate engagement rate
     */
    static calculateEngagementRate(likes, comments, shares = 0, followerCount) {
        if (followerCount === 0)
            return 0;
        return ((likes + comments + shares) / followerCount) * 100;
    }
    /**
     * Sanitize and validate text content
     */
    static sanitizeText(text) {
        if (!text)
            return '';
        return text
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
            .trim()
            .substring(0, 2000); // Limit length
    }
    /**
     * Normalize timestamp from various formats
     */
    static normalizeTimestamp(timestamp) {
        if (!timestamp)
            return new Date();
        if (timestamp instanceof Date)
            return timestamp;
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
