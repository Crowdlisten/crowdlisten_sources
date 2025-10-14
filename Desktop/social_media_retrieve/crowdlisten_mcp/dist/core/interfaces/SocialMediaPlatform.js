/**
 * Core interface that all social media platform adapters must implement
 * Provides a unified API for content retrieval across different platforms
 */
/**
 * Error types for unified error handling
 */
export class SocialMediaError extends Error {
    code;
    platform;
    statusCode;
    originalError;
    constructor(message, code, platform, statusCode, originalError) {
        super(message);
        this.code = code;
        this.platform = platform;
        this.statusCode = statusCode;
        this.originalError = originalError;
        this.name = 'SocialMediaError';
    }
}
export class AuthenticationError extends SocialMediaError {
    constructor(platform, originalError) {
        super(`Authentication failed for ${platform}`, 'AUTH_ERROR', platform, undefined, originalError);
        this.name = 'AuthenticationError';
    }
}
export class RateLimitError extends SocialMediaError {
    constructor(platform, originalError) {
        super(`Rate limit exceeded for ${platform}`, 'RATE_LIMIT', platform, undefined, originalError);
        this.name = 'RateLimitError';
    }
}
export class NotFoundError extends SocialMediaError {
    constructor(platform, resource, originalError) {
        super(`${resource} not found on ${platform}`, 'NOT_FOUND', platform, undefined, originalError);
        this.name = 'NotFoundError';
    }
}
