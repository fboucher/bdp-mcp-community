import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient } from './bdp-client.js';
import type { Config } from './config.js';
import { registerGraphqlTools } from './tools/graphql.js';
import { registerDatasetTools } from './tools/datasets.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerMeasurementTools } from './tools/measurements.js';
import { registerSitesTool } from './tools/sites.js';
import { registerSpatialTools } from './tools/spatial.js';

export function createServer(config: Config, http: typeof fetch = fetch): McpServer {
  const server = new McpServer({ name: 'bdp-mcp-community', version: '0.1.0' });
  const client = new BdpClient(config, http);
  registerSitesTool(server, client);
  registerGraphqlTools(server, client);
  registerSpatialTools(server, client);
  registerInventoryTools(server, client);
  registerDatasetTools(server, client);
  registerMeasurementTools(server, client);
  return server;
}
