/**
 * Base adapter class providing common functionality for all social media platforms
 * Implements shared features like rate limiting, error handling, and logging
 */
import { SocialMediaError, RateLimitError } from '../interfaces/SocialMediaPlatform.js';
import { CommentClusteringService } from '../utils/CommentClustering.js';
export class BaseAdapter {
    config;
    isInitialized = false;
    lastRequestTime = 0;
    requestCount = 0;
    rateLimitWindow = 60000; // 1 minute window
    maxRequestsPerWindow = 30; // Max 30 requests per minute
    clusteringService;
    constructor(config) {
        this.config = config;
        this.clusteringService = new CommentClusteringService();
    }
    async enforceRateLimit() {
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
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    handleError(error, operation) {
        this.log(`Error in ${operation}: ${error.message || error}`, 'error');
        if (this.isRateLimitError(error)) {
            throw new RateLimitError(this.getPlatformName(), error);
        }
        if (this.isAuthError(error)) {
            throw new SocialMediaError(`Authentication failed during ${operation}`, 'authentication_error', this.getPlatformName(), error.statusCode);
        }
        if (this.isNotFoundError(error)) {
            throw new SocialMediaError(`Resource not found during ${operation}`, 'not_found', this.getPlatformName(), error.statusCode);
        }
        throw new SocialMediaError(`Operation ${operation} failed: ${error.message || error}`, 'unknown_error', this.getPlatformName(), error.statusCode);
    }
    isRateLimitError(error) {
        return error.statusCode === 429 || error.code === 'rate_limit_exceeded';
    }
    isAuthError(error) {
        return error.statusCode === 401 || error.statusCode === 403;
    }
    isNotFoundError(error) {
        return error.statusCode === 404;
    }
    log(message, level = 'info') {
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
    validateUserId(userId) {
        if (!userId || userId.trim().length === 0) {
            throw new SocialMediaError('User ID cannot be empty', 'validation_error', this.getPlatformName());
        }
    }
    validateContentId(contentId) {
        if (!contentId || contentId.trim().length === 0) {
            throw new SocialMediaError('Content ID cannot be empty', 'validation_error', this.getPlatformName());
        }
    }
    validateLimit(limit) {
        if (limit < 1 || limit > 1000) {
            throw new SocialMediaError('Limit must be between 1 and 1000', 'validation_error', this.getPlatformName());
        }
    }
    async analyzeContent(contentId, enableClustering = true) {
        this.validateContentId(contentId);
        try {
            await this.enforceRateLimit();
            const comments = await this.getContentComments(contentId, 200); // Get more comments for clustering
            const analysis = {
                postId: contentId,
                platform: this.getPlatformName(),
                sentiment: 'neutral', // Basic implementation
                themes: ['general'],
                summary: `Analysis for ${contentId}`,
                commentCount: comments.length,
                topComments: comments.slice(0, 5)
            };
            // Add clustering analysis if enabled and clustering service is available
            if (enableClustering && this.clusteringService.isClusteringAvailable() && comments.length > 0) {
                this.log(`Performing clustering analysis on ${comments.length} comments`);
                analysis.clustering = await this.clusteringService.clusterComments(comments);
            }
            else if (enableClustering && !this.clusteringService.isClusteringAvailable()) {
                this.log('Clustering requested but OpenAI API key not available', 'warn');
            }
            return analysis;
        }
        catch (error) {
            this.handleError(error, 'analyzeContent');
        }
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new SocialMediaError('Adapter not initialized. Call initialize() first.', 'initialization_error', this.getPlatformName());
        }
    }
    async cleanup() {
        this.isInitialized = false;
        this.log('Adapter cleaned up');
    }
}
