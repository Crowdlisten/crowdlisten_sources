import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Spawns the CrowdListen MCP server as a child process and connects
 * an MCP Client over stdio transport.
 *
 * The caller is responsible for calling `close()` when done (typically
 * in an `afterAll` hook).
 */
export async function spawnMcpClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cwd: process.cwd(),
    // Forward the full environment so API keys (YOUTUBE_API_KEY,
    // OPENAI_API_KEY, etc.) reach the server process.
    env: { ...process.env } as Record<string, string>,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'e2e-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Convenience wrapper: calls a tool on the MCP server and parses the
 * JSON text content from the response.
 */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const result = await client.callTool({ name, arguments: args });

  // MCP tool results return a `content` array; we look for the first
  // text entry and JSON-parse it.
  const textContent = result.content as Array<{ type: string; text: string }>;
  const text = textContent.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error(`No text content in response for tool "${name}"`);
  }

  return JSON.parse(text);
}
