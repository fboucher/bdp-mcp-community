import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient } from './bdp-client.js';
import type { Config } from './config.js';
import { registerSitesTool } from './tools/sites.js';

export function createServer(config: Config, http: typeof fetch = fetch): McpServer {
  const server = new McpServer({ name: 'bdp-mcp-community', version: '0.1.0' });
  registerSitesTool(server, new BdpClient(config, http));
  return server;
}
