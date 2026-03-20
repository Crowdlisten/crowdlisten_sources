/**
 * Tests for MoltbookAdapter.
 * Covers initialization, search, trending, comments, user content, and cleanup.
 */

import { MoltbookAdapter } from '../../src/platforms/MoltbookAdapter';
import {
  PlatformConfig,
  SocialMediaError,
  NotFoundError,
} from '../../src/core/interfaces/SocialMediaPlatform';
import axios from 'axios';
import { mockAxiosInstance } from '../__mocks__/axios';
import {
  searchResponse,
  commentsResponse,
  trendingResponse,
} from '../fixtures/moltbookResponses';

// Use the manual mock
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MoltbookAdapter', () => {
  let adapter: MoltbookAdapter;
  const config: PlatformConfig = {
    platform: 'moltbook',
    credentials: { apiKey: 'test-moltbook-key' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new MoltbookAdapter(config);
    // Reset the mock instance methods
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
  });

  // ===== initialize =====

  describe('initialize', () => {
    it('sets initialized to true', async () => {
      const result = await adapter.initialize();
      expect(result).toBe(true);
    });

    it('creates axios with correct headers', async () => {
      await adapter.initialize();
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://moltbook.com/api/v1',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-moltbook-key',
          }),
        })
      );
    });
  });

  // ===== getPlatformName =====

  describe('getPlatformName', () => {
    it('returns moltbook', () => {
      expect(adapter.getPlatformName()).toBe('moltbook');
    });
  });

  // ===== searchContent =====

  describe('searchContent', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('returns normalized posts', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: searchResponse });

      const posts = await adapter.searchContent('AI tools', 10);
      expect(posts.length).toBe(2);
      expect(posts[0].platform).toBe('moltbook');
      expect(posts[0].id).toBe('post-001');
      expect(posts[0].author.username).toBe('techfan');
    });

    it('throws on empty query', async () => {
      await expect(adapter.searchContent('', 10)).rejects.toThrow('Search query cannot be empty');
    });

    it('handles API error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        Object.assign(new Error('Server error'), { response: { status: 500 } })
      );

      await expect(adapter.searchContent('test', 10)).rejects.toThrow(SocialMediaError);
    });

    it('throws when not initialized', async () => {
      const uninitAdapter = new MoltbookAdapter(config);
      await expect(uninitAdapter.searchContent('test', 10)).rejects.toThrow(SocialMediaError);
    });
  });

  // ===== getTrendingContent =====

  describe('getTrendingContent', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('returns posts', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: trendingResponse });

      const posts = await adapter.getTrendingContent(5);
      expect(posts.length).toBe(1);
      expect(posts[0].id).toBe('trending-001');
    });

    it('respects limit', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: trendingResponse });

      const posts = await adapter.getTrendingContent(1);
      expect(posts.length).toBeLessThanOrEqual(1);
    });
  });

  // ===== getContentComments =====

  describe('getContentComments', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('flattens nested comments', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: commentsResponse });

      const comments = await adapter.getContentComments('post-001', 50);
      // 2 top-level + 1 reply = 3
      expect(comments.length).toBe(3);
      const usernames = comments.map(c => c.author.username);
      expect(usernames).toContain('replier1');
    });

    it('throws NotFoundError on 404', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      );

      await expect(adapter.getContentComments('nonexistent', 10)).rejects.toThrow(NotFoundError);
    });

    it('validates contentId', async () => {
      await expect(adapter.getContentComments('', 10)).rejects.toThrow(SocialMediaError);
    });
  });

  // ===== getUserContent =====

  describe('getUserContent', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('returns posts for user', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { posts: searchResponse.posts },
      });

      const posts = await adapter.getUserContent('techfan', 10);
      expect(posts.length).toBe(2);
    });

    it('handles 404 as NotFoundError', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      );

      await expect(adapter.getUserContent('nobody', 10)).rejects.toThrow(NotFoundError);
    });
  });

  // ===== cleanup =====

  describe('cleanup', () => {
    it('nullifies client', async () => {
      await adapter.initialize();
      await adapter.cleanup();
      // After cleanup, ensureInitialized should throw
      expect(() => (adapter as any).ensureInitialized()).toThrow();
    });
  });
});
