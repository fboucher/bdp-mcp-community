import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, vi } from 'vitest';
import { startHttpTransport } from '../src/http-transport.js';
import { createServer } from '../src/server.js';
import type { Config } from '../src/config.js';

const config: Config = {
  baseUrl: 'https://example.test',
  tenantId: 'example-tenant',
  clientId: 'example-client',
  clientSecret: 'example-secret',
  scope: 'example-scope',
  transport: 'http',
  httpHost: '127.0.0.1',
  httpPort: 0,
  authToken: 'test-bearer-token',
  readOnly: true,
  allowDestructive: false,
};

describe('Streamable HTTP transport', () => {
  it('keeps health public and requires a valid bearer token for MCP', async () => {
    const bdpHttp = vi.fn<typeof fetch>();
    const handle = await startHttpTransport(() => createServer(config, bdpHttp), config);
    const address = handle.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not bind to a TCP port');
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    try {
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });

      const missingToken = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
      expect(missingToken.status).toBe(401);
      const wrongToken = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      });
      expect(wrongToken.status).toBe(401);
      expect(bdpHttp).not.toHaveBeenCalled();

      const client = new Client({ name: 'http-test-client', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: 'Bearer test-bearer-token' } },
      });
      try {
        await client.connect(transport);
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toContain('bdp_graphql_query');
        expect(bdpHttp).not.toHaveBeenCalled();
      } finally {
        await client.close();
      }
    } finally {
      await handle.close();
    }
  });
});
