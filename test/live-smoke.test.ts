import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UAT_BASE_URL, loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';

const credentialVariables = [
  'BDP_TENANT_ID',
  'BDP_CLIENT_ID',
  'BDP_CLIENT_SECRET',
  'BDP_SCOPE',
] as const;

const baseEnvironment: NodeJS.ProcessEnv = {
  BDP_TENANT_ID: 'example-tenant',
  BDP_CLIENT_ID: 'example-client',
  BDP_CLIENT_SECRET: 'example-secret',
  BDP_SCOPE: 'example-scope',
  BDP_BASE_URL: UAT_BASE_URL,
  BDP_LIVE_SMOKE: '1',
  BDP_LIVE_SMOKE_CONFIRM_NON_PROD: 'I_CONFIRM_UAT_ONLY',
};

function liveSmokeConfig(env: NodeJS.ProcessEnv) {
  if (
    env.CI ||
    env.GITHUB_ACTIONS === 'true' ||
    env.BDP_LIVE_SMOKE !== '1' ||
    env.BDP_LIVE_SMOKE_CONFIRM_NON_PROD !== 'I_CONFIRM_UAT_ONLY' ||
    !credentialVariables.every((name) => env[name]?.trim()) ||
    !env.BDP_BASE_URL?.trim()
  ) {
    return undefined;
  }

  try {
    if (new URL(env.BDP_BASE_URL).href.replace(/\/+$/, '') !== UAT_BASE_URL) return undefined;
  } catch {
    return undefined;
  }

  return loadConfig(env);
}

describe('live smoke safety gates', () => {
  it('stays disabled without explicit opt-in', () => {
    const env = { ...baseEnvironment };
    delete env.BDP_LIVE_SMOKE;
    expect(liveSmokeConfig(env)).toBeUndefined();
  });

  it('stays disabled when credentials are missing', () => {
    const env = { ...baseEnvironment };
    delete env.BDP_CLIENT_SECRET;
    expect(liveSmokeConfig(env)).toBeUndefined();
  });

  it('stays disabled in CI, even when fully configured', () => {
    expect(liveSmokeConfig({ ...baseEnvironment, CI: 'true', GITHUB_ACTIONS: 'true' })).toBeUndefined();
  });

  it('requires explicit confirmation and the exact UAT endpoint', () => {
    expect(liveSmokeConfig({
      ...baseEnvironment,
      BDP_LIVE_SMOKE_CONFIRM_NON_PROD: undefined,
    })).toBeUndefined();
    expect(liveSmokeConfig({
      ...baseEnvironment,
      BDP_BASE_URL: 'https://production.example.com',
    })).toBeUndefined();
  });

  it('enables only with the opt-in, credentials, confirmation, and UAT endpoint', () => {
    expect(liveSmokeConfig(baseEnvironment)?.baseUrl).toBe(UAT_BASE_URL);
  });
});

const config = liveSmokeConfig(process.env);

if (config) {
  describe('live BDP read-only smoke tests', () => {
    const server = createServer(config);
    const client = new Client({ name: 'live-smoke-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    beforeAll(async () => {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
    });

    afterAll(async () => {
      await client.close();
      await server.close();
    });

    it('lists sites using the spatial read tool', async () => {
      const tools = await client.listTools();
      const tool = tools.tools.find(({ name }) => name === 'bdp_list_sites');
      expect(tool?.annotations?.readOnlyHint).toBe(true);

      const result = await client.callTool({ name: 'bdp_list_sites', arguments: { take: 1 } });
      if (result.isError) throw new Error('The live spatial read smoke test failed');
    });

    it('executes a GraphQL read query', async () => {
      const tools = await client.listTools();
      const tool = tools.tools.find(({ name }) => name === 'bdp_graphql_query');
      expect(tool?.annotations?.readOnlyHint).toBe(true);

      const result = await client.callTool({
        name: 'bdp_graphql_query',
        arguments: { query: '{ __typename }' },
      });
      if (result.isError) throw new Error('The live GraphQL read smoke test failed');
    });
  });
} else {
  describe.skip('live BDP read-only smoke tests', () => {
    it('requires explicit opt-in, credentials, and confirmed UAT configuration', () => {});
  });
}
