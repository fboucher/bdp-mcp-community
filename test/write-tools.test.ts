import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import type { Config } from '../src/config.js';

const id = '123e4567-e89b-42d3-a456-426614174000';
const validInput = {
  name: 'Fictional dataset',
  expiresOn: '2099-12-31T23:59:59Z',
  members: { buildings: [id] },
};

async function connect(readOnly: boolean, apiStatus = 200) {
  const config: Config = {
    baseUrl: 'https://example.test',
    tenantId: 'example-tenant',
    clientId: 'example-client',
    clientSecret: 'example-secret',
    scope: 'example-scope',
    transport: 'stdio',
    httpHost: '127.0.0.1',
    httpPort: 3000,
    readOnly,
    allowDestructive: false,
  };
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const http = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'login.microsoftonline.com') {
      return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    }
    requests.push({ url, init });
    return Response.json({ id, ...validInput }, { status: apiStatus });
  });
  const server = createServer(config, http);
  const client = new Client({ name: 'write-tools-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, requests };
}

describe('dataset creation over an in-memory MCP connection', () => {
  it('is hidden in read-only mode', async () => {
    const { client, server } = await connect(true);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === 'bdp_create_dataset')).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('posts the validated dataset document when writes are enabled', async () => {
    const { client, server, requests } = await connect(false);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === 'bdp_create_dataset')).toBe(true);
      const result = await client.callTool({ name: 'bdp_create_dataset', arguments: validInput });
      expect(result.isError).not.toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url.pathname).toBe('/api/DataSets');
      expect(requests[0]?.init?.method).toBe('POST');
      expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(validInput);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    { ...validInput, name: '   ' },
    { ...validInput, expiresOn: '2000-01-01T00:00:00Z' },
    { ...validInput, members: { buildings: ['not-a-guid'] } },
    { ...validInput, members: { unknownType: [id] } },
  ])('rejects invalid dataset input before making an API request', async (input) => {
    const { client, server, requests } = await connect(false);
    try {
      const result = await client.callTool({ name: 'bdp_create_dataset', arguments: input });
      expect(result.isError).toBe(true);
      expect(requests).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    [400, 'check the request fields'],
    [403, 'not authorized'],
    [404, 'not found'],
    [424, 'upstream resource'],
  ])('maps HTTP %i to a clear MCP tool error', async (status, message) => {
    const { client, server } = await connect(false, status);
    try {
      const result = await client.callTool({ name: 'bdp_create_dataset', arguments: validInput });
      expect(result.isError).toBe(true);
      expect(result.content).toContainEqual(expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(message),
      }));
    } finally {
      await client.close();
      await server.close();
    }
  });
});
