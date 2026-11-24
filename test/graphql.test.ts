import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { MAX_GRAPHQL_RESPONSE_BYTES, MAX_GRAPHQL_SCHEMA_BYTES } from '../src/tools/graphql.js';
import { createServer } from '../src/server.js';
import type { Config } from '../src/config.js';

const config: Config = {
  baseUrl: 'https://example.test',
  tenantId: 'example-tenant',
  clientId: 'example-client',
  clientSecret: 'example-secret',
  scope: 'example-scope',
  transport: 'stdio',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  readOnly: true,
  allowDestructive: false,
};

async function connectServer(http: typeof fetch) {
  const server = createServer(config, http);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe('GraphQL tools', () => {
  it('returns a compact schema through mocked HTTP', async () => {
    const schema = {
      data: {
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          subscriptionType: null,
          types: [
            { kind: 'OBJECT', name: 'Query', fields: [{ name: 'sites', type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Site' } }, args: [] }] },
            { kind: 'OBJECT', name: '__Schema', fields: [] },
          ],
        },
      },
    };
    const http = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('login.microsoftonline.com')) {
        return Response.json({ access_token: 'example-token', expires_in: 3600 });
      }
      const url = new URL(String(input));
      expect(url.pathname).toBe('/graphql');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer example-token');
      expect(new Headers(init?.headers).get('X-Api-Version')).toBe('3.0');
      expect(JSON.parse(String(init?.body)).query).toContain('__schema');
      return Response.json(schema);
    });
    const { client, server } = await connectServer(http);
    try {
      const result = await client.callTool({ name: 'bdp_graphql_schema', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: 'text',
        text: JSON.stringify({
          queryType: 'Query',
          mutationType: null,
          subscriptionType: null,
          types: [{
            kind: 'OBJECT',
            name: 'Query',
            fields: [{ name: 'sites', type: '[Site]', args: [] }],
          }],
          truncated: false,
        }),
      }]);
      expect(Buffer.byteLength(JSON.stringify(result.content))).toBeLessThanOrEqual(MAX_GRAPHQL_SCHEMA_BYTES + 32);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    ['aliased mutation with fragment', 'mutation Change { alias: updateSite { ...SiteFields } } fragment SiteFields on Site { id }'],
    ['mutation in a multi-operation document', 'query Read { sites { id } } mutation Change { updateSite { id } }'],
    ['subscription operation', 'subscription Watch { siteChanged { id } }'],
    ['schema definition without an operation', 'type Query { field: String }'],
  ])('rejects %s without making an HTTP request', async (_label, query) => {
    const http = vi.fn<typeof fetch>();
    const { client, server } = await connectServer(http);
    try {
      const result = await client.callTool({ name: 'bdp_graphql_query', arguments: { query } });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: 'text',
        text: 'Only GraphQL query operations are allowed',
      }]);
      expect(http).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each(['UNAUTHENTICATED', 'FORBIDDEN'])('surfaces GraphQL %s errors', async (code) => {
    const http = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('login.microsoftonline.com')) {
        return Response.json({ access_token: 'example-token', expires_in: 3600 });
      }
      expect(JSON.parse(String(init?.body))).toEqual({
        query: 'query Read($id: ID!) { site(id: $id) { id } }',
        variables: { id: 'site-1' },
        operationName: 'Read',
      });
      return Response.json({
        errors: [{ message: 'Access denied', extensions: { code } }],
      });
    });
    const { client, server } = await connectServer(http);
    try {
      const result = await client.callTool({
        name: 'bdp_graphql_query',
        arguments: {
          query: 'query Read($id: ID!) { site(id: $id) { id } }',
          variables: { id: 'site-1' },
          operationName: 'Read',
        },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(code);
      expect(JSON.stringify(result.content)).toContain('Access denied');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('bounds schema output and indicates omitted types', async () => {
    const http = vi.fn<typeof fetch>(async (input) => String(input).includes('login.microsoftonline.com')
      ? Response.json({ access_token: 'example-token', expires_in: 3600 })
      : Response.json({
        data: {
          __schema: {
            queryType: { name: 'Query' },
            mutationType: null,
            subscriptionType: null,
            types: Array.from({ length: 100 }, (_, index) => ({
              kind: 'OBJECT',
              name: `Type${index}`,
              fields: Array.from({ length: 50 }, (_, fieldIndex) => ({
                name: `field${fieldIndex}`,
                type: { kind: 'SCALAR', name: 'String' },
                args: [],
              })),
            })),
          },
        },
      }));
    const { client, server } = await connectServer(http);
    try {
      const result = await client.callTool({ name: 'bdp_graphql_schema', arguments: {} });
      const content = JSON.parse(JSON.stringify(result.content)) as Array<{ text: string }>;
      expect(Buffer.byteLength(content[0].text)).toBeLessThanOrEqual(MAX_GRAPHQL_SCHEMA_BYTES);
      expect(content[0].text).toContain('"truncated":true');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('rejects GraphQL results above the response size cap', async () => {
    const http = vi.fn<typeof fetch>(async (input) => String(input).includes('login.microsoftonline.com')
      ? Response.json({ access_token: 'example-token', expires_in: 3600 })
      : Response.json({ data: { value: 'x'.repeat(MAX_GRAPHQL_RESPONSE_BYTES) } }));
    const { client, server } = await connectServer(http);
    try {
      const result = await client.callTool({
        name: 'bdp_graphql_query',
        arguments: { query: '{ value }' },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('exceeded the 65536-byte limit');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
