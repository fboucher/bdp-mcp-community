import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient } from '../bdp-client.js';
import { DEFAULT_TAKE, errorContent, listQuery, pagedContent } from './read-tools-common.js';

export function registerSitesTool(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_list_sites', {
    description: 'List sites visible to the configured BDP identity.',
    inputSchema: {
      take: z.number().int().positive().optional().describe('Maximum sites to return (capped at 100; default 20).'),
      skip: z.number().int().nonnegative().optional().describe('Number of sites to skip (default 0).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take = DEFAULT_TAKE, skip = 0 }) => {
    const request = listQuery(take, skip);
    try {
      const response = await client.getJson('/api/Sites', request.query);
      return pagedContent(response, request.skip, request.take);
    } catch (error) {
      return errorContent(error, 'Unexpected error while listing sites');
    }
  });
}
