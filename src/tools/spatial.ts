import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BdpClient } from '../bdp-client.js';
import {
  DEFAULT_TAKE,
  errorContent,
  guidSchema,
  listQuery,
  pagedContent,
  page,
  paginationSchema,
} from './read-tools-common.js';

const filters = {
  name: z.string().min(1).optional().describe('Filter by an exact resource name.'),
};

const entityTypes = {
  Organization: 'Organizations',
  Site: 'Sites',
  Building: 'Buildings',
  Floor: 'Floors',
  Space: 'Spaces',
  Device: 'Devices',
  DeviceGroup: 'DeviceGroups',
  Source: 'Sources',
  DataSet: 'DataSets',
  MeasurementValue: 'MeasurementValues',
} as const;

export function registerSpatialTools(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_list_organizations', {
    description: 'List organizations available to the configured BDP identity.',
    inputSchema: { ...paginationSchema, ...filters },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name }) => {
    const request = listQuery(take, skip, { name });
    try {
      return pagedContent(await page(client, '/api/Organizations', request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing organizations');
    }
  });

  server.registerTool('bdp_list_buildings', {
    description: 'List buildings, optionally scoped to a site and filtered by name.',
    inputSchema: {
      ...paginationSchema,
      ...filters,
      siteId: guidSchema.optional().describe('Limit results to the specified site.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name, siteId }) => {
    const request = listQuery(take, skip, { name, siteId });
    try {
      return pagedContent(await page(client, '/api/Buildings', request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing buildings');
    }
  });

  server.registerTool('bdp_list_floors', {
    description: 'List floors belonging to a building.',
    inputSchema: {
      ...paginationSchema,
      ...filters,
      buildingId: guidSchema.describe('Building that contains the floors.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name, buildingId }) => {
    const request = listQuery(take, skip, { name });
    try {
      const path = `/api/Buildings/${encodeURIComponent(buildingId)}/Floors`;
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing floors');
    }
  });

  server.registerTool('bdp_list_spaces', {
    description: 'List spaces belonging to a floor.',
    inputSchema: {
      ...paginationSchema,
      ...filters,
      floorId: guidSchema.describe('Floor that contains the spaces.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name, floorId }) => {
    const request = listQuery(take, skip, { name });
    try {
      const path = `/api/Floors/${encodeURIComponent(floorId)}/Spaces`;
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing spaces');
    }
  });

  server.registerTool('bdp_get_entity', {
    description: 'Retrieve one organization, site, building, floor, space, device, group, source, dataset, or measurement by its ID.',
    inputSchema: {
      entityType: z.enum(Object.keys(entityTypes) as [keyof typeof entityTypes, ...(keyof typeof entityTypes)[]])
        .describe('Type of entity to retrieve.'),
      id: guidSchema.describe('GUID of the entity.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ entityType, id }) => {
    try {
      const response = await client.getJson(`/api/${entityTypes[entityType]}/${encodeURIComponent(id)}`);
      return pagedContent(response, 0, DEFAULT_TAKE);
    } catch (error) {
      return errorContent(error, 'Unexpected error while retrieving the entity');
    }
  });
}
