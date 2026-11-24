import { describe, expect, it } from 'vitest';
import { loadConfig, UAT_BASE_URL } from '../src/config.js';

const env = {
  BDP_TENANT_ID: 'example-tenant',
  BDP_CLIENT_ID: 'example-client',
  BDP_CLIENT_SECRET: 'example-secret',
  BDP_SCOPE: 'example-scope',
};

describe('configuration', () => {
  it('reports all missing variables without exposing values', () => {
    expect(() => loadConfig({ BDP_CLIENT_SECRET: 'example-secret' }))
      .toThrow('Missing required environment variables: BDP_TENANT_ID, BDP_CLIENT_ID, BDP_SCOPE');
  });

  it('defaults to UAT and allows an explicit HTTPS endpoint', () => {
    expect(loadConfig(env).baseUrl).toBe(UAT_BASE_URL);
    expect(loadConfig({ ...env, BDP_BASE_URL: 'https://example.test/' }).baseUrl).toBe('https://example.test');
  });

  it.each(['http://example.test', 'https://user:password@example.test', 'not a url', 'https://example.test/?x=1'])(
    'rejects unsafe base URL %s', (baseUrl) => {
      expect(() => loadConfig({ ...env, BDP_BASE_URL: baseUrl })).toThrow('BDP_BASE_URL must');
    },
  );

  it('rejects a tenant that could alter the token URL', () => {
    expect(() => loadConfig({ ...env, BDP_TENANT_ID: '../bad' })).toThrow('BDP_TENANT_ID must');
  });
});
