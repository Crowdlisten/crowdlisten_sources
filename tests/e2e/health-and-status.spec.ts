import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawnMcpClient, callTool } from './mcp-client';

describe('MCP Server — health and status', () => {
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

  it('health_check returns healthy status', async () => {
    const result = await callTool(client, 'health_check');

    expect(result).toBeDefined();
    expect(result.healthStatus).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it('get_platform_status returns available platforms', async () => {
    const result = await callTool(client, 'get_platform_status');

    expect(result).toBeDefined();
    expect(result.availablePlatforms).toBeDefined();
    expect(result.totalPlatforms).toBeGreaterThanOrEqual(1);
  });

  it('listTools returns registered tools', async () => {
    const toolsResult = await client.listTools();

    expect(toolsResult.tools).toBeInstanceOf(Array);
    expect(toolsResult.tools.length).toBeGreaterThanOrEqual(8);

    const toolNames = toolsResult.tools.map((t: any) => t.name);
    expect(toolNames).toContain('health_check');
    expect(toolNames).toContain('search_content');
    expect(toolNames).toContain('get_trending_content');
    expect(toolNames).toContain('get_content_comments');
    expect(toolNames).toContain('analyze_content');
    expect(toolNames).toContain('cluster_opinions');
    expect(toolNames).toContain('get_user_content');
    expect(toolNames).toContain('get_platform_status');
  });
});
