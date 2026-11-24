import { describe, expect, it, vi } from 'vitest';
import { BdpClient } from '../src/bdp-client.js';
import type { Config } from '../src/config.js';

const config: Config = {
  baseUrl: 'https://example.test',
  tenantId: 'example-tenant',
  clientId: 'example-client',
  clientSecret: 'example-secret',
  scope: 'example-scope',
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('BDP client', () => {
  it('caches a token and refreshes it before expiry', async () => {
    let now = 0;
    let tokenRequests = 0;
    const http = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('login.microsoftonline.com')) {
        tokenRequests++;
        expect(init?.redirect).toBe('error');
        expect((init?.body as URLSearchParams).get('grant_type')).toBe('client_credentials');
        return json({ access_token: `example-token-${tokenRequests}`, expires_in: 1000 });
      }
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Api-Version')).toBe('3.0');
      expect(headers.get('Authorization')).toBe(`Bearer example-token-${tokenRequests}`);
      return json([{ name: 'Example Site' }]);
    });
    const client = new BdpClient(config, http, () => now);
    await client.listSites(5, 0);
    now = 939_999;
    await client.listSites(5, 0);
    expect(tokenRequests).toBe(1);
    now = 940_000;
    await client.listSites(5, 0);
    expect(tokenRequests).toBe(2);
  });

  it('re-authenticates once on 401 and uses the new token', async () => {
    const tokens: string[] = [];
    let authCalls = 0;
    const http = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('login.microsoftonline.com')) {
        return json({ access_token: `token-${++authCalls}`, expires_in: 3600 });
      }
      tokens.push(new Headers(init?.headers).get('Authorization') ?? '');
      return tokens.length === 1 ? json({}, 401) : json([{ name: 'Example Site' }]);
    });
    const client = new BdpClient(config, http);
    expect(await client.listSites(1, 0)).toEqual([{ name: 'Example Site' }]);
    expect(authCalls).toBe(2);
    expect(tokens).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('stops after the second 401', async () => {
    let authCalls = 0;
    let apiCalls = 0;
    const http = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('login.microsoftonline.com')) {
        authCalls++;
        return json({ access_token: `token-${authCalls}`, expires_in: 3600 });
      }
      apiCalls++;
      return json({ secret: 'do not expose' }, 401);
    });
    await expect(new BdpClient(config, http).listSites(1, 0)).rejects.toThrow('HTTP 401 after re-authentication');
    expect([authCalls, apiCalls]).toEqual([2, 2]);
  });

  it('coalesces concurrent token requests', async () => {
    let authCalls = 0;
    const http = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('login.microsoftonline.com')) {
        authCalls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return json({ access_token: 'example-token', expires_in: 3600 });
      }
      return json([]);
    });
    const client = new BdpClient(config, http);
    await Promise.all([client.listSites(1, 0), client.listSites(1, 1)]);
    expect(authCalls).toBe(1);
  });

  it.each([[403, 'HTTP 403'], [500, 'HTTP 500'], [503, 'HTTP 503']])(
    'reports HTTP %i without exposing response bodies', async (status, message) => {
      const http = vi.fn<typeof fetch>(async (input) =>
        String(input).includes('login.microsoftonline.com')
          ? json({ access_token: 'example-token', expires_in: 3600 })
          : json({ secret: 'do not expose' }, status));
      await expect(new BdpClient(config, http).listSites(1, 0)).rejects.toThrow(message);
      await expect(new BdpClient(config, http).listSites(1, 0)).rejects.not.toThrow('do not expose');
    },
  );

  it('does not expose failed token response bodies', async () => {
    const http = vi.fn<typeof fetch>(async () => json({ error: 'example-secret' }, 400));
    await expect(new BdpClient(config, http).listSites(1, 0))
      .rejects.toThrow('Entra token request failed (HTTP 400)');
  });
});
