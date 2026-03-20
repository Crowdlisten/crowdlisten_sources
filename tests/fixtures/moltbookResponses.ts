/**
 * Raw Moltbook API response fixtures for testing.
 */

export const searchResponse = {
  posts: [
    {
      id: 'post-001',
      title: 'Best AI tools for research',
      body: 'A comprehensive review of AI-powered research tools available today.',
      created_at: '2025-12-01T10:00:00Z',
      community: { name: 'technology' },
      author: { id: 'u1', username: 'techfan', display_name: 'Tech Fan', verified: false },
      score: 42,
      comment_count: 15,
      url: 'https://moltbook.com/m/technology/posts/post-001',
      tags: ['ai', 'research'],
    },
    {
      id: 'post-002',
      title: 'ML model comparison',
      body: 'Comparing different ML models for various NLP tasks.',
      created_at: '2025-11-28T08:00:00Z',
      community: { name: 'machinelearning' },
      author: { id: 'u2', username: 'mlresearcher', display_name: 'ML Researcher', verified: true },
      score: 78,
      comment_count: 30,
      url: 'https://moltbook.com/m/machinelearning/posts/post-002',
      tags: ['ml', 'nlp'],
    },
  ],
};

export const commentsResponse = {
  comments: [
    {
      id: 'c1',
      body: 'Great analysis, I really like the comparison.',
      created_at: '2025-12-01T11:00:00Z',
      author: { id: 'u3', username: 'commenter1', display_name: 'Commenter 1' },
      score: 10,
      upvotes: 12,
      downvotes: 2,
      replies: [
        {
          id: 'c1-r1',
          body: 'Agreed, very thorough.',
          created_at: '2025-12-01T12:00:00Z',
          author: { id: 'u4', username: 'replier1', display_name: 'Replier 1' },
          score: 3,
          upvotes: 3,
          downvotes: 0,
          replies: [],
        },
      ],
    },
    {
      id: 'c2',
      body: 'I think the methodology could be improved.',
      created_at: '2025-12-01T13:00:00Z',
      author: { id: 'u5', username: 'commenter2', display_name: 'Commenter 2' },
      score: 5,
      upvotes: 7,
      downvotes: 2,
      replies: [],
    },
  ],
};

export const trendingResponse = {
  posts: [
    {
      id: 'trending-001',
      title: 'Hot topic today',
      body: 'This is the hottest topic on Moltbook right now.',
      created_at: '2025-12-07T08:00:00Z',
      community: { name: 'trending' },
      author: { id: 'u10', username: 'hotposter', display_name: 'Hot Poster' },
      score: 250,
      comment_count: 100,
      url: 'https://moltbook.com/m/trending/posts/trending-001',
    },
  ],
};

export const emptySearchResponse = {
  posts: [],
};

export const notFoundResponse = {
  error: 'Post not found',
  status: 404,
};
