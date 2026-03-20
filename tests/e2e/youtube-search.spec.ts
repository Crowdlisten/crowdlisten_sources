import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawnMcpClient, callTool } from './mcp-client';

const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY;

describe('MCP Server — YouTube search', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    if (!hasYouTubeKey) return;

    const conn = await spawnMcpClient();
    client = conn.client;
    close = conn.close;
  }, 30_000);

  afterAll(async () => {
    if (close) await close();
  });

  (hasYouTubeKey ? it : it.skip)(
    'search_content returns YouTube videos',
    async () => {
      const result = await callTool(client, 'search_content', {
        platform: 'youtube',
        query: 'machine learning tutorial',
        limit: 3,
      });

      expect(result).toBeDefined();
      expect(result.platform).toBe('youtube');
      expect(result.posts).toBeDefined();
      expect(Array.isArray(result.posts)).toBe(true);
    },
  );

  (hasYouTubeKey ? it : it.skip)(
    'get_trending_content returns YouTube videos',
    async () => {
      const result = await callTool(client, 'get_trending_content', {
        platform: 'youtube',
        limit: 3,
      });

      expect(result).toBeDefined();
      expect(result.platform).toBe('youtube');
      expect(result.posts).toBeDefined();
    },
  );

  (hasYouTubeKey ? it : it.skip)(
    'get_content_comments returns YouTube comments',
    async () => {
      // Use a well-known video ID (Rick Astley - Never Gonna Give You Up)
      const result = await callTool(client, 'get_content_comments', {
        platform: 'youtube',
        contentId: 'dQw4w9WgXcQ',
        limit: 5,
      });

      expect(result).toBeDefined();
      expect(result.platform).toBe('youtube');
      expect(result.contentId).toBe('dQw4w9WgXcQ');
      expect(result.comments).toBeDefined();
      expect(Array.isArray(result.comments)).toBe(true);
    },
  );
});
