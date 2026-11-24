# Adding, changing, and removing tools

This example adds a local greeting tool. It makes no BDP requests, so it can be
built and tested without credentials. It is an exercise, not a tool shipped by
the server. Start from the [README quick start](../README.md#quick-start).

## Add a tool

1. Create `src/tools/greeting.ts`. Its Zod input schema validates the argument;
   the handler returns MCP text content. The annotations describe a read-only,
   non-destructive tool that does not interact with an external system.

   ```ts
   import { z } from 'zod';
   import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import type { Config } from '../config.js';
   import { registerSafeTool } from './register-safe-tool.js';

   export function registerGreetingTool(server: McpServer, config: Config): void {
     registerSafeTool(server, config, 'example_greeting', {
       description: 'Greet a person by name.',
       inputSchema: {
         name: z.string().min(1).describe('Name to greet.'),
       },
       annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
     }, async ({ name }) => ({
       content: [{ type: 'text', text: `Hello, ${name}!` }],
     }));
   }
   ```

2. In `src/server.ts`, add an import alongside the other tool imports:

   ```ts
   import { registerGreetingTool } from './tools/greeting.js';
   ```

   Add this registration inside `createServer`, before `return server`:

   ```ts
   registerGreetingTool(server, config);
   ```

3. Create `test/greeting.test.ts`. It exercises discovery, invocation, and
   invalid input over an in-memory MCP connection:

   ```ts
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { describe, expect, it } from 'vitest';
   import { registerGreetingTool } from '../src/tools/greeting.js';

   describe('example greeting tool', () => {
     it('advertises, validates, and calls the tool', async () => {
       const server = new McpServer({ name: 'example-server', version: '1.0.0' });
       const client = new Client({ name: 'example-client', version: '1.0.0' });
       const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
       registerGreetingTool(server, {
         baseUrl: 'https://api.example.com',
         tenantId: 'example-tenant',
         clientId: 'example-client',
         clientSecret: 'example-secret',
         scope: 'example-scope',
         transport: 'stdio',
         httpHost: '127.0.0.1',
         httpPort: 3000,
         readOnly: true,
         allowDestructive: false,
       });
       try {
         await server.connect(serverTransport);
         await client.connect(clientTransport);
         const { tools } = await client.listTools();
         expect(tools.find((tool) => tool.name === 'example_greeting')?.annotations)
           .toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
         const result = await client.callTool({ name: 'example_greeting', arguments: { name: 'Example' } });
         expect(result.isError).not.toBe(true);
         expect(result.content).toEqual([{ type: 'text', text: 'Hello, Example!' }]);
         const invalid = await client.callTool({ name: 'example_greeting', arguments: { name: '' } });
         expect(invalid.isError).toBe(true);
       } finally {
         await client.close();
         await server.close();
       }
     });
   });
   ```

4. Run `npm run lint`, `npm run typecheck`, `npm test -- test/greeting.test.ts`,
   and `npm run build`. Restart the client after rebuilding; it can now discover
   and call `example_greeting` with `{ "name": "Example" }`.

For tools that access BDP, follow the existing registrations: receive the shared
`BdpClient`, validate inputs, use the relevant client method and return MCP
content. Mock HTTP in tests rather than contacting BDP. Classify effects
accurately: `registerSafeTool` uses `readOnlyHint` and `destructiveHint` to
enforce the [safety model](../README.md#safety-model); `openWorldHint`
describes external interaction but is not a safety gate. Test write tools under
each relevant policy and ensure omitted tools cannot be invoked. Do not bypass
the wrapper with `server.registerTool`.

## Change or remove a tool

To change a tool, update its schema, handler, description, and annotations
together; preserve compatibility deliberately and update tests for both valid
and invalid inputs and relevant safety policies. Update user documentation if
the behavior changes.

To remove one, delete its registration call and import from `src/server.ts`,
then remove its implementation if no other code uses it. Update its tests and
documentation, and check that discovery no longer lists it. Re-run the checks
above, using the affected test file or the full test suite.
