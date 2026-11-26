#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, writeSafetyStatus } from './config.js';
import { startHttpTransport } from './http-transport.js';
import { createServer } from './server.js';

try {
  const config = loadConfig(process.env);
  if (config.transport === 'http') {
    const transport = await startHttpTransport(() => createServer(config), config);
    console.error(writeSafetyStatus(config));
    transport.httpServer.on('error', (error) => {
      console.error('MCP HTTP server error', error);
      process.exitCode = 1;
    });
    process.once('SIGTERM', () => {
      void transport.close().catch((error: unknown) => {
        console.error('Failed to shut down the MCP HTTP server cleanly', error);
        process.exitCode = 1;
      });
    });
  } else {
    const server = createServer(config);
    await server.connect(new StdioServerTransport());
    console.error(writeSafetyStatus(config));
    process.once('SIGTERM', () => {
      void server.close().catch((error: unknown) => {
        console.error('Failed to shut down the MCP stdio server cleanly', error);
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  const message = error instanceof Error && (
    error.message.startsWith('Missing required environment variables:') ||
    error.message.startsWith('BDP_TENANT_ID must') ||
    error.message.startsWith('BDP_BASE_URL must') ||
    error.message.startsWith('MCP_TRANSPORT must') ||
    error.message.startsWith('MCP_HTTP_PORT must') ||
    error.message.startsWith('MCP_AUTH_TOKEN must') ||
    error.message.startsWith('MCP_READ_ONLY must') ||
    error.message.startsWith('MCP_ALLOW_DESTRUCTIVE must')
  ) ? error.message : 'Failed to start the MCP server';
  console.error(message);
  process.exitCode = 1;
}
