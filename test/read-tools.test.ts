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

const id = '123e4567-e89b-42d3-a456-426614174000';
const fixture = { id, name: 'Fictional resource' };

async function callTool(
  name: string,
  args: Record<string, unknown>,
  apiResponse: (url: URL) => Response = () => Response.json([fixture], {
    headers: { 'X-Total-Count': '1' },
  }),
) {
  const apiRequests: URL[] = [];
  const http = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'login.microsoftonline.com') {
      return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    }
    apiRequests.push(url);
    return apiResponse(url);
  });
  const server = createServer(config, http);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name, arguments: args });
    return { result, apiRequests };
  } finally {
    await client.close();
    await server.close();
  }
}

function resultText(result: Awaited<ReturnType<typeof callTool>>['result']): string {
  if (!Array.isArray(result.content)) throw new Error('Expected text tool result');
  const first: unknown = result.content[0];
  if (
    typeof first !== 'object' || first === null ||
    !('type' in first) || first.type !== 'text' ||
    !('text' in first) || typeof first.text !== 'string'
  ) {
    throw new Error('Expected text tool result');
  }
  return first.text;
}

describe('REST read tools over an in-memory MCP connection', () => {
  it.each([
    ['bdp_list_organizations', {}, '/api/Organizations'],
    ['bdp_list_buildings', { siteId: id }, '/api/Buildings'],
    ['bdp_list_floors', { buildingId: id }, `/api/Buildings/${id}/Floors`],
    ['bdp_list_spaces', { floorId: id }, `/api/Floors/${id}/Spaces`],
    ['bdp_get_entity', { entityType: 'Building', id }, `/api/Buildings/${id}`],
    ['bdp_list_devices', { spaceId: id }, `/api/Spaces/${id}/Devices`],
    ['bdp_list_device_groups', { sourceId: id }, `/api/Sources/${id}/DeviceGroups`],
    ['bdp_list_sources', {}, '/api/Sources'],
    ['bdp_list_datasets', {}, '/api/DataSets'],
    ['bdp_get_dataset', { datasetId: id }, `/api/DataSets/${id}`],
    ['bdp_get_dataset_measurement_values', { datasetId: id }, `/api/DataSets/${id}/MeasurementValues`],
    ['bdp_get_measurement_values', { deviceId: id }, `/api/Devices/${id}/MeasurementValues`],
    [
      'bdp_get_historical_values',
      { measurementValueId: id, startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-02T00:00:00Z' },
      `/api/MeasurementValues/${id}/HistoricalValues`,
    ],
  ])('calls the expected endpoint for %s', async (tool, args, expectedPath) => {
    const { result, apiRequests } = await callTool(tool, { ...args, take: 1000, skip: 3 });
    expect(result.isError).not.toBe(true);
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0]?.pathname).toBe(expectedPath);
    if (tool !== 'bdp_get_entity' && tool !== 'bdp_get_dataset') {
      expect(apiRequests[0]?.searchParams.get('take')).toBe('100');
      expect(apiRequests[0]?.searchParams.get('skip')).toBe('3');
    }
  });

  it('returns response-header pagination and a continuation offset', async () => {
    const { result } = await callTool(
      'bdp_list_organizations',
      { take: 2, skip: 0 },
      () => Response.json([fixture, { ...fixture, id: '00000000-0000-0000-0000-000000000002' }], {
        headers: { 'Content-Range': 'items 0-1/5' },
      }),
    );
    const page = JSON.parse(resultText(result));
    expect(page.pagination).toEqual({ skip: 0, take: 2, returned: 2, total: 5, hasMore: true, nextSkip: 2 });
    expect(page.hint).toContain('skip=2');
  });

  it('does not advertise offset pagination for a single dataset response', async () => {
    const { result } = await callTool('bdp_get_dataset', { datasetId: id }, () => Response.json(fixture));
    const response = JSON.parse(resultText(result));
    expect(response.items).toEqual(fixture);
    expect(response.pagination.hasMore).toBeNull();
    expect(response.pagination.nextSkip).toBeUndefined();
  });

  it('truncates oversized pages at a valid item boundary and preserves the next offset', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      description: 'fixture '.repeat(100),
    }));
    const { result } = await callTool('bdp_list_organizations', { take: 100 }, () =>
      Response.json(rows, { headers: { 'X-Total-Count': '100' } }),
    );
    const text = resultText(result);
    const page = JSON.parse(text);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(24 * 1024);
    expect(page.truncated).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThan(rows.length);
    expect(page.pagination.nextSkip).toBe(page.items.length);
    expect(page.hint).toContain('response was truncated');
  });

  it('rejects invalid GUIDs and conflicting parent scopes before making an API request', async () => {
    const invalidGuid = await callTool('bdp_list_floors', { buildingId: 'not-a-guid' });
    expect(invalidGuid.result.isError).toBe(true);
    expect(invalidGuid.apiRequests).toHaveLength(0);

    const conflictingScopes = await callTool('bdp_list_devices', { buildingId: id, spaceId: id });
    expect(conflictingScopes.result.isError).toBe(true);
    expect(resultText(conflictingScopes.result)).toContain('exactly one parent scope');
    expect(conflictingScopes.apiRequests).toHaveLength(0);
  });

  it.each([
    ['bdp_list_organizations', {}],
    ['bdp_list_buildings', { siteId: id }],
    ['bdp_list_floors', { buildingId: id }],
    ['bdp_list_spaces', { floorId: id }],
    ['bdp_get_entity', { entityType: 'Building', id }],
  ])('reports a spatial 404 without leaking the response body (%s)', async (tool, args) => {
    const { result } = await callTool(tool, args, () => Response.json({ secret: 'private fixture' }, { status: 404 }));
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('HTTP 404');
    expect(resultText(result)).not.toContain('private fixture');
  });

  it('returns an empty measurement page and handles 413 and 424 explicitly', async () => {
    const empty = await callTool('bdp_get_measurement_values', { buildingId: id }, () => Response.json([]));
    expect(JSON.parse(resultText(empty.result)).items).toEqual([]);

    for (const [status, message] of [[413, 'reduce take'], [424, 'upstream resource']] as const) {
      const { result } = await callTool('bdp_get_historical_values', {
        measurementValueId: id,
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-02T00:00:00Z',
      }, () => Response.json({ detail: 'private fixture' }, { status }));
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain(message);
      expect(resultText(result)).not.toContain('private fixture');
    }
  });

  it('rejects non-UTC, invalid, and decreasing historical ranges without calling BDP', async () => {
    for (const range of [
      ['2025-01-01T00:00:00+00:00', '2025-01-02T00:00:00Z'],
      ['2025-02-31T00:00:00Z', '2025-03-01T00:00:00Z'],
      ['2025-01-02T00:00:00Z', '2025-01-01T00:00:00Z'],
    ]) {
      const { result, apiRequests } = await callTool('bdp_get_historical_values', {
        measurementValueId: id,
        startTime: range[0],
        endTime: range[1],
      });
      expect(result.isError).toBe(true);
      expect(apiRequests).toHaveLength(0);
    }
  });
});
