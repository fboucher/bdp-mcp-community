import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { registerSafeTool } from '../src/tools/register-safe-tool.js';

async function connectWithPolicy(readOnly: boolean, allowDestructive: boolean) {
  const server = new McpServer({ name: 'write-safety-test', version: '1.0.0' });
  const client = new Client({ name: 'write-safety-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const writeHandler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'updated' }] }));
  const destructiveHandler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'deleted' }] }));

  registerSafeTool(server, { readOnly, allowDestructive }, 'read', {
    description: 'A read-only fixture.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async () => ({ content: [{ type: 'text' as const, text: 'read' }] }));
  registerSafeTool(server, { readOnly, allowDestructive }, 'write', {
    description: 'A non-destructive write fixture.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, writeHandler);
  registerSafeTool(server, { readOnly, allowDestructive }, 'destructive', {
    description: 'A destructive write fixture.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, destructiveHandler);

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, writeHandler, destructiveHandler };
}

describe('write-safety registration', () => {
  it.each([
    { readOnly: true, allowDestructive: false, expectedTools: ['read'] },
    { readOnly: false, allowDestructive: false, expectedTools: ['read', 'write'] },
    { readOnly: false, allowDestructive: true, expectedTools: ['read', 'write', 'destructive'] },
    { readOnly: true, allowDestructive: true, expectedTools: ['read'] },
  ])(
    'lists and permits only gated tools (readOnly=$readOnly, allowDestructive=$allowDestructive)',
    async ({ readOnly, allowDestructive, expectedTools }) => {
      const { client, server, writeHandler, destructiveHandler } =
        await connectWithPolicy(readOnly, allowDestructive);
      try {
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toEqual(expectedTools);

        for (const [name, handler] of [
          ['write', writeHandler],
          ['destructive', destructiveHandler],
        ] as const) {
          if (expectedTools.includes(name)) {
            const result = await client.callTool({ name, arguments: {} });
            expect(result.isError).not.toBe(true);
            expect(handler).toHaveBeenCalledOnce();
          } else {
            const result = await client.callTool({ name, arguments: {} });
            expect(result.isError).toBe(true);
            expect(handler).not.toHaveBeenCalled();
          }
        }
      } finally {
        await client.close();
        await server.close();
      }
    },
  );

  it('rejects contradictory read-only and destructive annotations', () => {
    const server = new McpServer({ name: 'write-safety-test', version: '1.0.0' });
    expect(() => registerSafeTool(server, { readOnly: false, allowDestructive: true }, 'invalid', {
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: true },
    }, async () => ({ content: [{ type: 'text', text: 'invalid' }] })))
      .toThrow('cannot be both read-only and destructive');
  });
});
