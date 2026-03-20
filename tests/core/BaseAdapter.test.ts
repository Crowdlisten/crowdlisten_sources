/**
 * Tests for BaseAdapter validation methods.
 * Uses a concrete TestAdapter to exercise the abstract base class.
 */

import { BaseAdapter } from '../../src/core/base/BaseAdapter';
import {
  Post,
  Comment,
  PlatformType,
  PlatformCapabilities,
  PlatformConfig,
  SocialMediaError,
} from '../../src/core/interfaces/SocialMediaPlatform';

// Concrete adapter for testing abstract base class
class TestAdapter extends BaseAdapter {
  constructor() {
    const config: PlatformConfig = {
      platform: 'moltbook',
      credentials: { apiKey: 'test-key' },
    };
    super(config);
  }

  async initialize(): Promise<boolean> {
    this.isInitialized = true;
    return true;
  }

  async getTrendingContent(limit?: number): Promise<Post[]> {
    return [];
  }

  async getUserContent(userId: string, limit?: number): Promise<Post[]> {
    return [];
  }

  async searchContent(query: string, limit?: number): Promise<Post[]> {
    return [];
  }

  async getContentComments(contentId: string, limit?: number): Promise<Comment[]> {
    return [];
  }

  getPlatformName(): PlatformType {
    return 'moltbook';
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
}

describe('BaseAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  // ===== validateUserId =====

  describe('validateUserId', () => {
    it('throws on empty string', () => {
      expect(() => (adapter as any).validateUserId('')).toThrow(SocialMediaError);
    });

    it('throws on whitespace-only string', () => {
      expect(() => (adapter as any).validateUserId('   ')).toThrow(SocialMediaError);
    });

    it('passes for valid user ID', () => {
      expect(() => (adapter as any).validateUserId('user123')).not.toThrow();
    });
  });

  // ===== validateContentId =====

  describe('validateContentId', () => {
    it('throws on empty string', () => {
      expect(() => (adapter as any).validateContentId('')).toThrow(SocialMediaError);
    });

    it('passes for valid content ID', () => {
      expect(() => (adapter as any).validateContentId('post-001')).not.toThrow();
    });
  });

  // ===== validateLimit =====

  describe('validateLimit', () => {
    it('throws on 0', () => {
      expect(() => (adapter as any).validateLimit(0)).toThrow(SocialMediaError);
    });

    it('throws on 1001', () => {
      expect(() => (adapter as any).validateLimit(1001)).toThrow(SocialMediaError);
    });

    it('passes for valid limit', () => {
      expect(() => (adapter as any).validateLimit(50)).not.toThrow();
      expect(() => (adapter as any).validateLimit(1)).not.toThrow();
      expect(() => (adapter as any).validateLimit(1000)).not.toThrow();
    });
  });

  // ===== ensureInitialized =====

  describe('ensureInitialized', () => {
    it('throws when not initialized', () => {
      expect(() => (adapter as any).ensureInitialized()).toThrow(SocialMediaError);
    });

    it('passes after initialization', async () => {
      await adapter.initialize();
      expect(() => (adapter as any).ensureInitialized()).not.toThrow();
    });
  });
});
