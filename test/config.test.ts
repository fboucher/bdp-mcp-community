import { describe, expect, it } from 'vitest';
import { loadConfig, UAT_BASE_URL, writeSafetyStatus } from '../src/config.js';

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
    expect(loadConfig(env)).toMatchObject({
      baseUrl: UAT_BASE_URL,
      transport: 'stdio',
      httpHost: '127.0.0.1',
      httpPort: 3000,
      readOnly: true,
      allowDestructive: false,
    });
    expect(loadConfig({ ...env, BDP_BASE_URL: 'https://example.test/' }).baseUrl).toBe('https://example.test');
  });

  it('configures HTTP transport and its optional access token', () => {
    expect(loadConfig({
      ...env,
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '0.0.0.0',
      MCP_HTTP_PORT: '8080',
      MCP_AUTH_TOKEN: 'secret-token',
    })).toMatchObject({
      transport: 'http',
      httpHost: '0.0.0.0',
      httpPort: 8080,
      authToken: 'secret-token',
    });
  });

  it('configures read-only and destructive write gates independently', () => {
    expect(loadConfig({
      ...env,
      MCP_READ_ONLY: 'false',
      MCP_ALLOW_DESTRUCTIVE: 'true',
    })).toMatchObject({ readOnly: false, allowDestructive: true });
    expect(loadConfig({ ...env, MCP_READ_ONLY: 'false' }))
      .toMatchObject({ readOnly: false, allowDestructive: false });
  });

  it.each([
    ['MCP_READ_ONLY', 'maybe'],
    ['MCP_ALLOW_DESTRUCTIVE', 'yes'],
  ])('rejects invalid %s values', (name, value) => {
    expect(() => loadConfig({ ...env, [name]: value })).toThrow(`${name} must be either true or false`);
  });

  it('reports effective write status without configuration secrets', () => {
    expect(writeSafetyStatus({ readOnly: true, allowDestructive: true }))
      .toBe('MCP write safety: writes disabled (read-only mode); destructive operations disabled');
    expect(writeSafetyStatus({ readOnly: false, allowDestructive: true }))
      .toBe('MCP write safety: writes enabled; destructive operations enabled');
  });

  it('rejects bearer tokens that cannot be sent in an Authorization header', () => {
    expect(() => loadConfig({ ...env, MCP_AUTH_TOKEN: 'bad token' }))
      .toThrow('MCP_AUTH_TOKEN must');
  });

  it.each(['tcp', '-1', '65536', '1.5'])( 'rejects invalid HTTP configuration %s', (value) => {
    expect(() => loadConfig({ ...env, MCP_TRANSPORT: value })).toThrow('MCP_TRANSPORT must');
    expect(() => loadConfig({ ...env, MCP_HTTP_PORT: value })).toThrow('MCP_HTTP_PORT must');
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
