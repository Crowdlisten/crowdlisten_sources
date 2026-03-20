/**
 * Factory functions for creating test comments, users, and posts.
 */

import { Comment, User, Post } from '../../src/core/interfaces/SocialMediaPlatform';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    username: 'testuser',
    displayName: 'Test User',
    followerCount: 100,
    verified: false,
    ...overrides,
  };
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-001',
    author: makeUser(),
    text: 'This is a test comment.',
    timestamp: new Date('2025-12-01T10:00:00Z'),
    likes: 10,
    ...overrides,
  };
}

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-001',
    platform: 'moltbook',
    author: makeUser(),
    content: 'This is a test post about AI tools.',
    engagement: {
      likes: 42,
      comments: 15,
      shares: 5,
      views: 1000,
    },
    timestamp: new Date('2025-12-01T10:00:00Z'),
    url: 'https://moltbook.com/m/technology/posts/post-001',
    hashtags: ['ai', 'tools'],
    ...overrides,
  };
}

/**
 * Create a batch of comments with varying engagement levels.
 */
export function makeCommentBatch(count: number): Comment[] {
  return Array.from({ length: count }, (_, i) =>
    makeComment({
      id: `comment-${String(i + 1).padStart(3, '0')}`,
      text: `Test comment number ${i + 1}`,
      likes: Math.floor(Math.random() * 100),
      timestamp: new Date(Date.now() - i * 3600000), // 1 hour apart
      author: makeUser({ id: `user-${i}`, username: `user${i}` }),
    })
  );
}
