import type { Config } from './config.js';

export class BdpError extends Error {}

interface Token {
  value: string;
  expiresAt: number;
}

export class BdpClient {
  private token?: Token;
  private pendingToken?: Promise<Token>;

  constructor(
    private readonly config: Config,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async getToken(): Promise<Token> {
    if (this.token && this.now() < this.token.expiresAt) return this.token;
    if (!this.pendingToken) {
      this.pendingToken = this.acquireToken().finally(() => {
        this.pendingToken = undefined;
      });
    }
    return this.pendingToken;
  }

  private async acquireToken(): Promise<Token> {
    const requestedAt = this.now();
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: this.config.scope,
      grant_type: 'client_credentials',
    });
    let response: Response;
    try {
      response = await this.http(
        `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
        { method: 'POST', body, redirect: 'error' },
      );
    } catch {
      throw new BdpError('Entra token request failed; check connectivity');
    }
    if (!response.ok) {
      throw new BdpError(`Entra token request failed (HTTP ${response.status}); check credentials and scope`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BdpError('Entra returned an invalid token response');
    }
    if (
      typeof payload !== 'object' || payload === null ||
      !('access_token' in payload) || typeof payload.access_token !== 'string' || !payload.access_token ||
      !('expires_in' in payload) || typeof payload.expires_in !== 'number' ||
      !Number.isFinite(payload.expires_in) || payload.expires_in <= 0
    ) {
      throw new BdpError('Entra returned an invalid token response');
    }
    const lifetime = payload.expires_in * 1000;
    const token = {
      value: payload.access_token,
      expiresAt: requestedAt + lifetime - Math.min(60_000, lifetime * 0.1),
    };
    this.token = token;
    return token;
  }

  async listSites(take: number, skip: number): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}/api/Sites`);
    url.searchParams.set('take', String(take));
    url.searchParams.set('skip', String(skip));
    let token = await this.getToken();
    let response = await this.request(url, token);
    if (response.status === 401) {
      if (this.token === token) this.token = undefined;
      token = await this.getToken();
      response = await this.request(url, token);
    }
    if (!response.ok) {
      if (response.status === 401) throw new BdpError('BDP returned HTTP 401 after re-authentication');
      if (response.status === 403) throw new BdpError('BDP returned HTTP 403; the identity is not authorized to access sites');
      if (response.status >= 500) throw new BdpError(`BDP service failed (HTTP ${response.status}); try again later`);
      throw new BdpError(`BDP request failed (HTTP ${response.status})`);
    }
    try {
      return await response.json();
    } catch {
      throw new BdpError('BDP returned invalid JSON');
    }
  }

  async graphqlRequest(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(`${this.config.baseUrl}/graphql`);
    const payload: { query: string; variables?: Record<string, unknown>; operationName?: string } = { query };
    if (variables !== undefined) payload.variables = variables;
    if (operationName !== undefined) payload.operationName = operationName;
    let token = await this.getToken();
    let response = await this.request(url, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      if (this.token === token) this.token = undefined;
      token = await this.getToken();
      response = await this.request(url, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BdpError('BDP returned invalid GraphQL JSON');
    }
    return { status: response.status, body };
  }

  private async request(url: URL, token: Token, options: RequestInit = {}): Promise<Response> {
    try {
      return await this.http(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token.value}`,
          'X-Api-Version': '3.0',
          Accept: 'application/json',
        },
        redirect: 'error',
      });
    } catch {
      throw new BdpError('BDP request failed; check connectivity');
    }
  }
}
