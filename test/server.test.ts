import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import type { Config } from '../src/config.js';

const config: Config = {
  baseUrl: 'https://example.test',
  tenantId: 'example-tenant',
  clientId: 'example-client',
  clientSecret: 'example-secret',
  scope: 'example-scope',
};

describe('MCP server', () => {
  it('lists and calls the site tool using mocked HTTP', async () => {
    const sites = [{ id: '00000000-0000-0000-0000-000000000001', name: 'Example Site' }];
    const http = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('login.microsoftonline.com')) {
        return Response.json({ access_token: 'example-token', expires_in: 3600 });
      }
      const url = new URL(String(input));
      expect(url.pathname).toBe('/api/Sites');
      expect(url.searchParams.get('take')).toBe('100');
      expect(url.searchParams.get('skip')).toBe('3');
      expect(new Headers(init?.headers).get('X-Api-Version')).toBe('3.0');
      return Response.json(sites);
    });
    const server = createServer(config, http);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('bdp_list_sites');
      expect(tools.tools.find((tool) => tool.name === 'bdp_list_sites')?.annotations?.readOnlyHint).toBe(true);
      const result = await client.callTool({ name: 'bdp_list_sites', arguments: { take: 1000, skip: 3 } });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: 'text',
        text: JSON.stringify({
          items: sites,
          pagination: { skip: 3, take: 100, returned: 1, hasMore: null },
        }),
      }]);
      expect(http).toHaveBeenCalledTimes(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns a clear MCP tool error for a forbidden response', async () => {
    const http = vi.fn<typeof fetch>(async (input) => String(input).includes('login.microsoftonline.com')
      ? Response.json({ access_token: 'example-token', expires_in: 3600 })
      : Response.json({ detail: 'private' }, { status: 403 }));
    const server = createServer(config, http);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: 'bdp_list_sites', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('HTTP 403') }]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
