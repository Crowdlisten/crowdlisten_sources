/**
 * Tests for CommentClusteringService.
 * Covers math utilities, engagement scoring, comment selection, and full pipeline.
 */

import { CommentClusteringService } from '../../src/core/utils/CommentClustering';
import { Comment } from '../../src/core/interfaces/SocialMediaPlatform';
import { makeComment, makeCommentBatch } from '../fixtures/comments';

// Mock openai module
jest.mock('openai', () => {
  const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
    data: Array.from({ length: 20 }, () => ({
      embedding: Array.from({ length: 5 }, () => Math.random()),
    })),
  });

  const mockChatCompletionsCreate = jest.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: 'Cluster analysis: Theme 1 discusses positive aspects. Theme 2 covers criticism.',
        },
      },
    ],
  });

  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      embeddings: { create: mockEmbeddingsCreate },
      chat: { completions: { create: mockChatCompletionsCreate } },
    })),
    __mockEmbeddingsCreate: mockEmbeddingsCreate,
    __mockChatCompletionsCreate: mockChatCompletionsCreate,
  };
});

describe('CommentClusteringService', () => {
  let service: CommentClusteringService;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    service = new CommentClusteringService();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  // ===== cosineSimilarity =====

  describe('cosineSimilarity', () => {
    const cosine = (a: number[], b: number[]) =>
      (service as any).cosineSimilarity(a, b);

    it('returns 1 for identical vectors', () => {
      expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosine([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    it('returns -1 for opposite vectors', () => {
      expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    it('returns 0 for empty vectors', () => {
      expect(cosine([], [])).toBe(0);
    });

    it('returns 0 for mismatched lengths', () => {
      expect(cosine([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  // ===== calculateVariance =====

  describe('calculateVariance', () => {
    const variance = (nums: number[]) =>
      (service as any).calculateVariance(nums);

    it('returns 0 for same values', () => {
      expect(variance([5, 5, 5, 5])).toBeCloseTo(0);
    });

    it('returns correct variance for known values', () => {
      // [1, 2, 3, 4, 5]: mean=3, variance=2
      expect(variance([1, 2, 3, 4, 5])).toBeCloseTo(2.0);
    });

    it('returns 0 for single value', () => {
      expect(variance([7])).toBeCloseTo(0);
    });
  });

  // ===== calculateSingleEngagementScore =====

  describe('calculateSingleEngagementScore', () => {
    const score = (comment: Comment) =>
      (service as any).calculateSingleEngagementScore(comment);

    it('scores based on likes', () => {
      const c = makeComment({ likes: 50 });
      const result = score(c);
      expect(result).toBeGreaterThan(0.1);
    });

    it('accounts for upvotes and downvotes', () => {
      const c = makeComment({
        likes: 0,
        engagement: { upvotes: 20, downvotes: 5 },
      });
      const result = score(c);
      expect(result).toBeGreaterThan(0.1);
    });

    it('weights shares at 3x', () => {
      const withShares = makeComment({
        likes: 0,
        engagement: { shares: 10 },
      });
      const withoutShares = makeComment({
        likes: 0,
        engagement: { shares: 0 },
      });
      expect(score(withShares)).toBeGreaterThan(score(withoutShares));
    });

    it('enforces minimum score of 0.1', () => {
      const c = makeComment({ likes: 0 });
      expect(score(c)).toBeGreaterThanOrEqual(0.1);
    });
  });

  // ===== calculateEngagementWeights =====

  describe('calculateEngagementWeights', () => {
    const calcWeights = (comments: Comment[], logs: string[]) =>
      (service as any).calculateEngagementWeights(comments, logs);

    it('normalizes weights to [0.1, 3.0] range', () => {
      const comments = [
        makeComment({ likes: 100 }),
        makeComment({ likes: 1 }),
        makeComment({ likes: 50 }),
      ];
      const logs: string[] = [];
      const weights = calcWeights(comments, logs);

      weights.forEach((w: number) => {
        expect(w).toBeGreaterThanOrEqual(0.09); // small float tolerance
        expect(w).toBeLessThanOrEqual(3.01);
      });
    });

    it('returns 1.0 for equal engagement', () => {
      const comments = [
        makeComment({ likes: 10 }),
        makeComment({ likes: 10 }),
        makeComment({ likes: 10 }),
      ];
      const logs: string[] = [];
      const weights = calcWeights(comments, logs);

      weights.forEach((w: number) => {
        expect(w).toBeCloseTo(1.0);
      });
    });

    it('returns same length as input', () => {
      const comments = makeCommentBatch(5);
      const logs: string[] = [];
      const weights = calcWeights(comments, logs);
      expect(weights.length).toBe(5);
    });
  });

  // ===== selectCommentsForAnalysis =====

  describe('selectCommentsForAnalysis', () => {
    const select = (comments: Comment[], max: number, logs: string[]) =>
      (service as any).selectCommentsForAnalysis(comments, max, logs);

    it('returns all when under limit', () => {
      const comments = makeCommentBatch(3);
      const logs: string[] = [];
      const result = select(comments, 10, logs);
      expect(result.length).toBe(3);
    });

    it('trims to maxComments when over limit', () => {
      const comments = makeCommentBatch(20);
      const logs: string[] = [];
      const result = select(comments, 5, logs);
      expect(result.length).toBe(5);
    });

    it('selects highest engagement comments', () => {
      const comments = [
        makeComment({ id: 'low', likes: 1 }),
        makeComment({ id: 'high', likes: 1000 }),
        makeComment({ id: 'mid', likes: 50 }),
      ];
      const logs: string[] = [];
      const result = select(comments, 1, logs);
      expect(result[0].id).toBe('high');
    });
  });

  // ===== clusterComments (full pipeline) =====

  describe('clusterComments', () => {
    it('returns error when no API key', async () => {
      delete process.env.OPENAI_API_KEY;
      const noKeyService = new CommentClusteringService();
      const comments = makeCommentBatch(5);

      const result = await noKeyService.clusterComments(comments);
      expect(result.clustersCount).toBe(0);
      expect(result.overallAnalysis).toContain('failed');
    });

    it('returns error for empty comments', async () => {
      const result = await service.clusterComments([]);
      expect(result.clustersCount).toBe(0);
      expect(result.overallAnalysis).toContain('failed');
    });

    it('runs full pipeline with mocked OpenAI', async () => {
      const comments = makeCommentBatch(15);

      const result = await service.clusterComments(comments);

      expect(result.totalComments).toBe(15);
      expect(result.clustersCount).toBeGreaterThanOrEqual(0);
      expect(result.logs.length).toBeGreaterThan(0);
    });
  });

  // ===== isClusteringAvailable =====

  describe('isClusteringAvailable', () => {
    it('returns true with key, false without', () => {
      expect(service.isClusteringAvailable()).toBe(true);

      delete process.env.OPENAI_API_KEY;
      const noKeyService = new CommentClusteringService();
      expect(noKeyService.isClusteringAvailable()).toBe(false);
    });
  });
});
