import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawnMcpClient, callTool } from './mcp-client';

describe('MCP Server — Reddit search (no API key needed)', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const conn = await spawnMcpClient();
    client = conn.client;
    close = conn.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it('search_content returns Reddit posts', async () => {
    const result = await callTool(client, 'search_content', {
      platform: 'reddit',
      query: 'artificial intelligence',
      limit: 5,
    });

    expect(result).toBeDefined();
    expect(result.platform).toBe('reddit');
    expect(result.query).toBe('artificial intelligence');
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
  });

  it('get_trending_content returns Reddit content', async () => {
    const result = await callTool(client, 'get_trending_content', {
      platform: 'reddit',
      limit: 5,
    });

    expect(result).toBeDefined();
    expect(result.platform).toBe('reddit');
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
  });

  it('get_content_comments returns comments for a Reddit post', async () => {
    // First search for a post to get a valid ID
    const searchResult = await callTool(client, 'search_content', {
      platform: 'reddit',
      query: 'technology',
      limit: 1,
    });

    const posts = searchResult.posts;
    expect(Array.isArray(posts)).toBe(true);

    if (posts.length > 0 && posts[0].id) {
      const comments = await callTool(client, 'get_content_comments', {
        platform: 'reddit',
        contentId: posts[0].id,
        limit: 5,
      });

      expect(comments).toBeDefined();
      expect(comments.platform).toBe('reddit');
      expect(comments.contentId).toBe(posts[0].id);
      expect(comments.comments).toBeDefined();
      expect(Array.isArray(comments.comments)).toBe(true);
    }
  });

  it('analyze_content returns analysis with metadata', async () => {
    // Get a post to analyze
    const searchResult = await callTool(client, 'search_content', {
      platform: 'reddit',
      query: 'programming',
      limit: 1,
    });

    const posts = searchResult.posts;
    expect(Array.isArray(posts)).toBe(true);

    if (posts.length > 0 && posts[0].id) {
      const analysis = await callTool(client, 'analyze_content', {
        platform: 'reddit',
        contentId: posts[0].id,
        analysisDepth: 'surface',
        enableClustering: false,
      });

      expect(analysis).toBeDefined();
      // The handler always returns analysisMetadata when successful
      if (analysis.analysisMetadata) {
        expect(analysis.analysisMetadata.completenessScore).toBeDefined();
        expect(analysis.analysisMetadata.analysisDepth).toBe('surface');
        expect(analysis.analysisMetadata.verticalSliceApproach).toBe(true);
      }
    }
  });

  it('get_user_content returns posts for a Reddit user', async () => {
    const result = await callTool(client, 'get_user_content', {
      platform: 'reddit',
      userId: 'spez',
      limit: 3,
    });

    expect(result).toBeDefined();
    expect(result.platform).toBe('reddit');
    expect(result.userId).toBe('spez');
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
  });
});
