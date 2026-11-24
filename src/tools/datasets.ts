import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BdpClient } from '../bdp-client.js';
import type { Config } from '../config.js';
import {
  errorContent,
  guidSchema,
  listQuery,
  pagedContent,
  page,
  paginationSchema,
} from './read-tools-common.js';
import { registerSafeTool } from './register-safe-tool.js';

export function registerDatasetTools(server: McpServer, client: BdpClient, config: Config): void {
  registerSafeTool(server, config, 'bdp_list_datasets', {
    description: 'List datasets visible to the configured BDP identity.',
    inputSchema: {
      ...paginationSchema,
      name: z.string().min(1).optional().describe('Filter by an exact dataset name.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, name }) => {
    const request = listQuery(take, skip, { name });
    try {
      return pagedContent(await page(client, '/api/DataSets', request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing datasets');
    }
  });

  registerSafeTool(server, config, 'bdp_get_dataset', {
    description: 'Retrieve one dataset by its GUID.',
    inputSchema: { datasetId: guidSchema.describe('GUID of the dataset.') },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ datasetId }) => {
    try {
      const response = await client.getJson(`/api/DataSets/${encodeURIComponent(datasetId)}`);
      return pagedContent(response, 0, 1);
    } catch (error) {
      return errorContent(error, 'Unexpected error while retrieving the dataset');
    }
  });

  registerSafeTool(server, config, 'bdp_get_dataset_measurement_values', {
    description: 'Retrieve a bounded page of measurement values included in a dataset.',
    inputSchema: {
      ...paginationSchema,
      datasetId: guidSchema.describe('GUID of the dataset.'),
      commissionedStatus: z.string().min(1).optional()
        .describe('Optionally filter by the BDP commissioned status.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take, skip, datasetId, commissionedStatus }) => {
    const request = listQuery(take, skip, { commissionedStatus });
    try {
      const path = `/api/DataSets/${encodeURIComponent(datasetId)}/MeasurementValues`;
      return pagedContent(await page(client, path, request.query, request.take, request.skip), request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while retrieving dataset measurement values');
    }
  });
}
