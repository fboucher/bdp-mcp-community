import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient, BdpError } from '../bdp-client.js';

export const MAX_TAKE = 100;
const DEFAULT_TAKE = 20;

export function registerSitesTool(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_list_sites', {
    description: 'List sites visible to the configured BDP identity.',
    inputSchema: {
      take: z.number().int().positive().optional().describe('Maximum sites to return (capped at 100; default 20).'),
      skip: z.number().int().nonnegative().optional().describe('Number of sites to skip (default 0).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ take = DEFAULT_TAKE, skip = 0 }) => {
    try {
      const sites = await client.listSites(Math.min(take, MAX_TAKE), skip);
      return { content: [{ type: 'text', text: JSON.stringify(sites) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof BdpError ? error.message : 'Unexpected error while listing sites' }],
      };
    }
  });
}
