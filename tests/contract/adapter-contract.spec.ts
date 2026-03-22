/**
 * Adapter Contract Validation Tests
 *
 * Validates that the shared fixture JSON conforms to the TypeScript interfaces
 * defined in SocialMediaPlatform.ts. Both stacks (TypeScript + Python) load
 * the same fixture file, so any shape drift is caught immediately.
 *
 * Fixture location:
 *   project_context/test_fixtures/adapter_contract_v1.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Post,
  User,
  Comment,
  EngagementMetrics,
  PlatformCapabilities,
  PlatformType,
} from '../../src/core/interfaces/SocialMediaPlatform';

// ---------------------------------------------------------------------------
// Load shared fixtures synchronously at module level (required for it.each)
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
  __dirname,
  '..', '..', '..', 'project_context', 'test_fixtures', 'adapter_contract_v1.json',
);

const fixtures: Record<string, any> = JSON.parse(
  fs.readFileSync(FIXTURE_PATH, 'utf-8'),
);

// ---------------------------------------------------------------------------
// Helpers -- runtime type guards (JSON has no Date; we accept ISO strings)
// ---------------------------------------------------------------------------

const VALID_PLATFORMS: PlatformType[] = [
  'tiktok', 'twitter', 'reddit', 'instagram', 'youtube', 'moltbook', 'xiaohongshu',
];

function assertUser(user: any, label: string): void {
  expect(user).toBeDefined();
  expect(typeof user.id).toBe('string');
  expect(typeof user.username).toBe('string');

  // Optional fields -- if present must be the right type
  if (user.displayName !== undefined) expect(typeof user.displayName).toBe('string');
  if (user.followerCount !== undefined) expect(typeof user.followerCount).toBe('number');
  if (user.verified !== undefined) expect(typeof user.verified).toBe('boolean');
  if (user.profileImageUrl !== undefined) expect(typeof user.profileImageUrl).toBe('string');
  if (user.bio !== undefined) expect(typeof user.bio).toBe('string');
}

function assertEngagementMetrics(eng: any, label: string): void {
  expect(eng).toBeDefined();
  expect(typeof eng.likes).toBe('number');
  expect(typeof eng.comments).toBe('number');

  if (eng.shares !== undefined) expect(typeof eng.shares).toBe('number');
  if (eng.views !== undefined) expect(typeof eng.views).toBe('number');
  if (eng.engagementRate !== undefined) expect(typeof eng.engagementRate).toBe('number');
}

function assertCommentEngagement(eng: any, label: string): void {
  if (!eng) return; // entire block is optional
  if (eng.upvotes !== undefined) expect(typeof eng.upvotes).toBe('number');
  if (eng.downvotes !== undefined) expect(typeof eng.downvotes).toBe('number');
  if (eng.shares !== undefined) expect(typeof eng.shares).toBe('number');
  if (eng.views !== undefined) expect(typeof eng.views).toBe('number');
  if (eng.score !== undefined) expect(typeof eng.score).toBe('number');
}

function assertPost(post: any, label: string): void {
  // Required fields
  expect(typeof post.id).toBe('string');
  expect(VALID_PLATFORMS).toContain(post.platform);
  assertUser(post.author, `${label}.author`);
  expect(typeof post.content).toBe('string');
  assertEngagementMetrics(post.engagement, `${label}.engagement`);
  expect(typeof post.timestamp).toBe('string'); // ISO string in JSON
  expect(new Date(post.timestamp).toString()).not.toBe('Invalid Date');
  expect(typeof post.url).toBe('string');

  // Optional fields
  if (post.mediaUrl !== undefined) expect(typeof post.mediaUrl).toBe('string');
  if (post.hashtags !== undefined) {
    expect(Array.isArray(post.hashtags)).toBe(true);
    post.hashtags.forEach((h: any) => expect(typeof h).toBe('string'));
  }
}

function assertComment(comment: any, label: string, depth: number = 0): void {
  // Prevent unbounded recursion in badly shaped fixtures
  if (depth > 10) throw new Error(`Comment nesting exceeds 10 levels at ${label}`);

  expect(typeof comment.id).toBe('string');
  assertUser(comment.author, `${label}.author`);
  expect(typeof comment.text).toBe('string');
  expect(typeof comment.timestamp).toBe('string');
  expect(new Date(comment.timestamp).toString()).not.toBe('Invalid Date');
  expect(typeof comment.likes).toBe('number');

  assertCommentEngagement(comment.engagement, `${label}.engagement`);

  if (comment.replies !== undefined) {
    expect(Array.isArray(comment.replies)).toBe(true);
    comment.replies.forEach((reply: any, i: number) => {
      assertComment(reply, `${label}.replies[${i}]`, depth + 1);
    });
  }
}

function assertPlatformCapabilities(caps: any, label: string): void {
  expect(typeof caps.supportsTrending).toBe('boolean');
  expect(typeof caps.supportsUserContent).toBe('boolean');
  expect(typeof caps.supportsSearch).toBe('boolean');
  expect(typeof caps.supportsComments).toBe('boolean');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Adapter Contract v1 -- Shared Fixture Validation', () => {

  // ---- Fixture meta ----

  it('fixture file loads and has expected top-level keys', () => {
    expect(fixtures.$schema).toBe('adapter_contract_v1');
    expect(fixtures.version).toBe('1.0.0');
    expect(fixtures.posts).toBeDefined();
    expect(fixtures.comments).toBeDefined();
    expect(fixtures.platformCapabilities).toBeDefined();
    expect(fixtures.requiredFields).toBeDefined();
  });

  it('platformTypes lists all supported platforms', () => {
    const declared: string[] = fixtures.platformTypes;
    expect(declared.sort()).toEqual([...VALID_PLATFORMS].sort());
  });

  // ---- Post fixtures ----

  describe('Post fixtures', () => {
    it.each(Object.keys(fixtures.posts))('post "%s" conforms to Post interface', (key) => {
      assertPost(fixtures.posts[key], `posts.${key}`);
    });
  });

  describe('Post edge-case fixtures', () => {
    it.each(Object.keys(fixtures.posts_edge_cases))('edge-case post "%s" conforms to Post interface', (key) => {
      assertPost(fixtures.posts_edge_cases[key], `posts_edge_cases.${key}`);
    });
  });

  // ---- Comment fixtures ----

  describe('Comment fixtures', () => {
    it.each(Object.keys(fixtures.comments))('comment "%s" conforms to Comment interface', (key) => {
      assertComment(fixtures.comments[key], `comments.${key}`);
    });
  });

  describe('Comment edge-case fixtures', () => {
    it.each(Object.keys(fixtures.comments_edge_cases))('edge-case comment "%s" conforms to Comment interface', (key) => {
      assertComment(fixtures.comments_edge_cases[key], `comments_edge_cases.${key}`);
    });
  });

  // ---- PlatformCapabilities ----

  describe('PlatformCapabilities fixtures', () => {
    it.each(VALID_PLATFORMS)('capabilities for "%s" conform to PlatformCapabilities', (platform) => {
      const caps = fixtures.platformCapabilities[platform];
      expect(caps).toBeDefined();
      assertPlatformCapabilities(caps, `platformCapabilities.${platform}`);
    });
  });

  // ---- requiredFields metadata ----

  describe('requiredFields metadata', () => {
    it('post requiredFields match TypeScript interface required properties', () => {
      const meta = fixtures.requiredFields.post;
      expect(meta.required).toEqual(
        expect.arrayContaining(['id', 'platform', 'author', 'content', 'engagement', 'timestamp', 'url']),
      );
      expect(meta.optional).toEqual(
        expect.arrayContaining(['mediaUrl', 'hashtags']),
      );
    });

    it('user requiredFields match TypeScript interface required properties', () => {
      const meta = fixtures.requiredFields.user;
      expect(meta.required).toEqual(
        expect.arrayContaining(['id', 'username']),
      );
    });

    it('engagementMetrics requiredFields match TypeScript interface required properties', () => {
      const meta = fixtures.requiredFields.engagementMetrics;
      expect(meta.required).toEqual(
        expect.arrayContaining(['likes', 'comments']),
      );
    });

    it('comment requiredFields match TypeScript interface required properties', () => {
      const meta = fixtures.requiredFields.comment;
      expect(meta.required).toEqual(
        expect.arrayContaining(['id', 'author', 'text', 'timestamp', 'likes']),
      );
    });

    it('platformCapabilities requiredFields list all four flags', () => {
      const meta = fixtures.requiredFields.platformCapabilities;
      expect(meta.required).toEqual(
        expect.arrayContaining([
          'supportsTrending',
          'supportsUserContent',
          'supportsSearch',
          'supportsComments',
        ]),
      );
    });
  });

  // ---- Cross-stack field mapping ----

  describe('Python consumer field mapping (create_visual_sources)', () => {
    /**
     * visual_extraction_tool.py reads:
     *   post.get("content"), post.get("author", {}), post.get("engagement", {}),
     *   post.get("url"), post.get("timestamp"), post.get("hashtags", [])
     *   author.get("username"), author.get("displayName")
     *   engagement.get("likes"), engagement.get("comments"),
     *   engagement.get("shares"), engagement.get("views")
     *
     * These tests verify every fixture has the keys the Python consumer expects.
     */

    it.each(Object.keys(fixtures.posts))('post "%s" has all keys read by Python create_visual_sources', (key) => {
      const post = fixtures.posts[key];

      // Python reads these with .get() (so they can be absent), but we want
      // the contract to guarantee they exist in well-formed fixtures.
      expect(post).toHaveProperty('content');
      expect(post).toHaveProperty('author');
      expect(post).toHaveProperty('engagement');
      expect(post).toHaveProperty('url');
      expect(post).toHaveProperty('timestamp');

      // Author sub-keys
      expect(post.author).toHaveProperty('username');
      // displayName is optional per TS interface; Python .get("displayName", "") handles absence

      // Engagement sub-keys
      expect(post.engagement).toHaveProperty('likes');
      expect(post.engagement).toHaveProperty('comments');
      // shares, views optional on both sides
    });
  });

  // ---- Engagement value ranges ----

  describe('Engagement value sanity', () => {
    it('no engagement metric is negative', () => {
      const allPosts = [
        ...Object.values(fixtures.posts),
        ...Object.values(fixtures.posts_edge_cases),
      ] as any[];

      for (const post of allPosts) {
        const eng = post.engagement;
        expect(eng.likes).toBeGreaterThanOrEqual(0);
        expect(eng.comments).toBeGreaterThanOrEqual(0);
        if (eng.shares !== undefined) expect(eng.shares).toBeGreaterThanOrEqual(0);
        if (eng.views !== undefined) expect(eng.views).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ---- Platform coverage ----

  describe('Platform coverage', () => {
    it('at least one post fixture exists per major platform', () => {
      const allPosts = [
        ...Object.values(fixtures.posts),
        ...Object.values(fixtures.posts_edge_cases),
      ] as any[];

      const coveredPlatforms = new Set(allPosts.map((p: any) => p.platform));

      // We require coverage for the main platforms used in visual extraction
      const mustCover: PlatformType[] = ['reddit', 'twitter', 'tiktok', 'instagram', 'youtube', 'xiaohongshu'];
      for (const platform of mustCover) {
        expect(coveredPlatforms.has(platform)).toBe(true);
      }
    });
  });
});
