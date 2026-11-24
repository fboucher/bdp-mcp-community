export interface Config {
  baseUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  transport: 'stdio' | 'http';
  httpHost: string;
  httpPort: number;
  authToken?: string;
  readOnly: boolean;
  allowDestructive: boolean;
}

export const UAT_BASE_URL = 'https://ecostruxure-building-platform-api-uat.se.app';

function booleanSetting(env: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

export function writeSafetyStatus(config: Pick<Config, 'readOnly' | 'allowDestructive'>): string {
  const writes = config.readOnly ? 'disabled (read-only mode)' : 'enabled';
  const destructive = !config.readOnly && config.allowDestructive ? 'enabled' : 'disabled';
  return `MCP write safety: writes ${writes}; destructive operations ${destructive}`;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const required = ['BDP_TENANT_ID', 'BDP_CLIENT_ID', 'BDP_CLIENT_SECRET', 'BDP_SCOPE'] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const tenantId = env.BDP_TENANT_ID!.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(tenantId)) {
    throw new Error('BDP_TENANT_ID must be a tenant ID or domain');
  }

  let url: URL;
  try {
    url = new URL(env.BDP_BASE_URL?.trim() || UAT_BASE_URL);
  } catch {
    throw new Error('BDP_BASE_URL must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('BDP_BASE_URL must be an HTTPS URL without credentials, query, or fragment');
  }

  const transport = env.MCP_TRANSPORT?.trim() || 'stdio';
  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error('MCP_TRANSPORT must be either stdio or http');
  }

  const portValue = env.MCP_HTTP_PORT?.trim() || '3000';
  if (!/^\d+$/.test(portValue) || Number(portValue) > 65535) {
    throw new Error('MCP_HTTP_PORT must be an integer between 0 and 65535');
  }

  const authToken = env.MCP_AUTH_TOKEN;
  if (authToken !== undefined && !/^[\x21-\x7e]+$/.test(authToken)) {
    throw new Error('MCP_AUTH_TOKEN must be a non-empty bearer token without whitespace');
  }
  const readOnly = booleanSetting(env, 'MCP_READ_ONLY', true);
  const allowDestructive = booleanSetting(env, 'MCP_ALLOW_DESTRUCTIVE', false);

  return {
    baseUrl: url.href.replace(/\/+$/, ''),
    tenantId,
    clientId: env.BDP_CLIENT_ID!.trim(),
    clientSecret: env.BDP_CLIENT_SECRET!,
    scope: env.BDP_SCOPE!.trim(),
    transport,
    httpHost: env.MCP_HTTP_HOST?.trim() || '127.0.0.1',
    httpPort: Number(portValue),
    authToken,
    readOnly,
    allowDestructive,
  };
}
