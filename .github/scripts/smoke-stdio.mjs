import assert from 'node:assert/strict';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Provide a command to start the server');

const client = new Client({ name: 'distribution-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command,
  args,
  env: {
    ...process.env,
    BDP_TENANT_ID: 'example-tenant',
    BDP_CLIENT_ID: 'example-client',
    BDP_CLIENT_SECRET: 'example-secret',
    BDP_SCOPE: 'example-scope',
    MCP_TRANSPORT: 'stdio',
  },
  stderr: 'inherit',
});

try {
  await client.connect(transport, { timeout: 15_000 });
  const { tools } = await client.listTools(undefined, { timeout: 15_000 });
  assert(tools.some(({ name }) => name === 'bdp_list_sites'));
} finally {
  await client.close();
}
