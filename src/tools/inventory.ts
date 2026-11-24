import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BdpClient } from '../bdp-client.js';
import { BdpError } from '../bdp-client.js';
import {
  errorContent,
  guidSchema,
  listQuery,
  pagedContent,
  page,
  paginationSchema,
} from './read-tools-common.js';

const parentScopes = {
  buildingId: { route: 'Buildings', description: 'Building to scope the results to.' },
  floorId: { route: 'Floors', description: 'Floor to scope the results to.' },
  spaceId: { route: 'Spaces', description: 'Space to scope the results to.' },
  sourceId: { route: 'Sources', description: 'Source to scope the results to.' },
} as const;

const scopeSchema = {
  buildingId: guidSchema.optional().describe(parentScopes.buildingId.description),
  floorId: guidSchema.optional().describe(parentScopes.floorId.description),
  spaceId: guidSchema.optional().describe(parentScopes.spaceId.description),
  sourceId: guidSchema.optional().describe(parentScopes.sourceId.description),
};

function scopedPath(resource: 'Devices' | 'DeviceGroups', ids: Record<string, string | undefined>): string {
  const selected = Object.entries(parentScopes).filter(([id]) => ids[id] !== undefined);
  if (selected.length !== 1) {
    throw new BdpError('Provide exactly one parent scope: buildingId, floorId, spaceId, or sourceId');
  }
  const [id, scope] = selected[0]!;
  return `/api/${scope.route}/${encodeURIComponent(ids[id]!)}/${resource}`;
}

export function registerInventoryTools(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_list_devices', {
    description: 'List devices within exactly one building, floor, space, or source.',
    inputSchema: {
      ...paginationSchema,
      name: z.string().min(1).optional().describe('Filter by an exact device name.'),
      ...scopeSchema,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name, buildingId, floorId, spaceId, sourceId }) => {
    const request = listQuery(take, skip, { name });
    try {
      const path = scopedPath('Devices', { buildingId, floorId, spaceId, sourceId });
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing devices');
    }
  });

  server.registerTool('bdp_list_device_groups', {
    description: 'List device groups within exactly one building, floor, space, or source.',
    inputSchema: {
      ...paginationSchema,
      name: z.string().min(1).optional().describe('Filter by an exact device group name.'),
      ...scopeSchema,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name, buildingId, floorId, spaceId, sourceId }) => {
    const request = listQuery(take, skip, { name });
    try {
      const path = scopedPath('DeviceGroups', { buildingId, floorId, spaceId, sourceId });
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing device groups');
    }
  });

  server.registerTool('bdp_list_sources', {
    description: 'List sources visible to the configured BDP identity.',
    inputSchema: {
      ...paginationSchema,
      name: z.string().min(1).optional().describe('Filter by an exact source name.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name }) => {
    const request = listQuery(take, skip, { name });
    try {
      return pagedContent(await page(client, '/api/Sources', request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing sources');
    }
  });
}
