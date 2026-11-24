import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient } from './bdp-client.js';
import type { Config } from './config.js';
import { registerGraphqlTools } from './tools/graphql.js';
import { registerSitesTool } from './tools/sites.js';

export function createServer(config: Config, http: typeof fetch = fetch): McpServer {
  const server = new McpServer({ name: 'bdp-mcp-community', version: '0.1.0' });
  const client = new BdpClient(config, http);
  registerSitesTool(server, client);
  registerGraphqlTools(server, client);
  return server;
}
