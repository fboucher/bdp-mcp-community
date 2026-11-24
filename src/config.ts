export interface Config {
  baseUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export const UAT_BASE_URL = 'https://ecostruxure-building-platform-api-uat.se.app';

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

  return {
    baseUrl: url.href.replace(/\/+$/, ''),
    tenantId,
    clientId: env.BDP_CLIENT_ID!.trim(),
    clientSecret: env.BDP_CLIENT_SECRET!,
    scope: env.BDP_SCOPE!.trim(),
  };
}
