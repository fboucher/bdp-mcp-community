import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

try {
  const config = loadConfig(process.env);
  await createServer(config).connect(new StdioServerTransport());
} catch (error) {
  const message = error instanceof Error && (
    error.message.startsWith('Missing required environment variables:') ||
    error.message.startsWith('BDP_TENANT_ID must') ||
    error.message.startsWith('BDP_BASE_URL must')
  ) ? error.message : 'Failed to start the MCP server';
  console.error(message);
  process.exitCode = 1;
}
