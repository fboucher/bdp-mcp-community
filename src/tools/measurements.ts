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

const measurementScopes = {
  buildingId: { route: 'Buildings', description: 'Building to scope the results to.' },
  floorId: { route: 'Floors', description: 'Floor to scope the results to.' },
  spaceId: { route: 'Spaces', description: 'Space to scope the results to.' },
  deviceId: { route: 'Devices', description: 'Device to scope the results to.' },
  deviceGroupId: { route: 'DeviceGroups', description: 'Device group to scope the results to.' },
} as const;

const measurementScopeSchema = {
  buildingId: guidSchema.optional().describe(measurementScopes.buildingId.description),
  floorId: guidSchema.optional().describe(measurementScopes.floorId.description),
  spaceId: guidSchema.optional().describe(measurementScopes.spaceId.description),
  deviceId: guidSchema.optional().describe(measurementScopes.deviceId.description),
  deviceGroupId: guidSchema.optional().describe(measurementScopes.deviceGroupId.description),
};

function measurementPath(ids: Record<string, string | undefined>): string {
  const selected = Object.entries(measurementScopes).filter(([id]) => ids[id] !== undefined);
  if (selected.length !== 1) {
    throw new BdpError('Provide exactly one scope: buildingId, floorId, spaceId, deviceId, or deviceGroupId');
  }
  const [id, scope] = selected[0]!;
  return `/api/${scope.route}/${encodeURIComponent(ids[id]!)}/MeasurementValues`;
}

function isUtcTimestamp(value: string): boolean {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?Z$/);
  if (!match) return false;
  const parsed = new Date(`${match[1]}Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === match[1];
}

export function registerMeasurementTools(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_get_measurement_values', {
    description: 'List current measurement values for exactly one building, floor, space, device, or device group.',
    inputSchema: {
      ...paginationSchema,
      ...measurementScopeSchema,
      commissionedStatus: z.string().min(1).optional()
        .describe('Optionally filter by the BDP commissioned status.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, buildingId, floorId, spaceId, deviceId, deviceGroupId, commissionedStatus }) => {
    const request = listQuery(take, skip, { commissionedStatus });
    try {
      const path = measurementPath({ buildingId, floorId, spaceId, deviceId, deviceGroupId });
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while retrieving measurement values');
    }
  });

  server.registerTool('bdp_get_historical_values', {
    description: 'Retrieve time-ordered historical values for one measurement GUID within a UTC time range.',
    inputSchema: {
      measurementValueId: guidSchema.describe('GUID of the measurement value.'),
      startTime: z.string().describe('Inclusive UTC timestamp in ISO 8601 form, ending in Z.'),
      endTime: z.string().describe('Exclusive UTC timestamp in ISO 8601 form, ending in Z.'),
      order: z.enum(['asc', 'desc']).optional().describe('Timestamp ordering (default asc).'),
      ...paginationSchema,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, measurementValueId, startTime, endTime, order = 'asc' }) => {
    if (!isUtcTimestamp(startTime) || !isUtcTimestamp(endTime) || Date.parse(startTime) >= Date.parse(endTime)) {
      return errorContent(new BdpError('startTime and endTime must be valid, increasing ISO-8601 UTC timestamps ending in Z'), 'Invalid time range');
    }
    const request = listQuery(take, skip, { startTime, endTime, order });
    try {
      const path = `/api/MeasurementValues/${encodeURIComponent(measurementValueId)}/HistoricalValues`;
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while retrieving historical values');
    }
  });
}
