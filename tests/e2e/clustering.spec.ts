import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawnMcpClient, callTool } from './mcp-client';

const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

describe('MCP Server — opinion clustering', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    if (!hasOpenAIKey) return;

    const conn = await spawnMcpClient();
    client = conn.client;
    close = conn.close;
  }, 30_000);

  afterAll(async () => {
    if (close) await close();
  });

  (hasOpenAIKey ? it : it.skip)(
    'cluster_opinions returns clusters from Reddit content',
    async () => {
      // First get a popular post with comments
      const searchResult = await callTool(client, 'search_content', {
        platform: 'reddit',
        query: 'AI opinions debate',
        limit: 1,
      });

      const posts = searchResult.posts;
      expect(Array.isArray(posts)).toBe(true);

      if (posts.length > 0 && posts[0].id) {
        const clustering = await callTool(client, 'cluster_opinions', {
          platform: 'reddit',
          contentId: posts[0].id,
          clusterCount: 3,
        });

        expect(clustering).toBeDefined();
        expect(clustering.analysisType).toBe('opinion_clustering');
        expect(clustering.totalComments).toBeDefined();

        if (clustering.clusters) {
          expect(Array.isArray(clustering.clusters)).toBe(true);
          expect(clustering.clusters.length).toBeGreaterThan(0);

          // Each cluster should have expected structure
          const first = clustering.clusters[0];
          expect(first.clusterId).toBeDefined();
          expect(first.size).toBeGreaterThan(0);
          expect(first.percentage).toBeDefined();
        }
      }
    },
    60_000,
  );

  (hasOpenAIKey ? it : it.skip)(
    'cluster_opinions with no comments returns empty clusters',
    async () => {
      // Use an unlikely-to-have-comments content ID
      const clustering = await callTool(client, 'cluster_opinions', {
        platform: 'reddit',
        contentId: 'nonexistent_post_id_12345',
        clusterCount: 3,
      });

      expect(clustering).toBeDefined();
      // Should either return empty clusters or an error message
      if (clustering.clusters) {
        expect(Array.isArray(clustering.clusters)).toBe(true);
      }
    },
    30_000,
  );
});
