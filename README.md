# BDP MCP community server

A minimal, read-only MCP server for listing EcoStruxure Building Data Platform
(BDP) sites. It uses stdio and an Entra client-credentials identity.

## Setup

Requires Node.js 22.13 or newer (or Node.js 24 or newer). Clone the repository, then run `npm ci` and
`npm run build`. Set the following environment variables in the process that
starts the server:

| Variable | Description |
| --- | --- |
| `BDP_TENANT_ID` | Entra tenant ID or domain |
| `BDP_CLIENT_ID` | Entra application client ID |
| `BDP_CLIENT_SECRET` | Entra client secret; keep private |
| `BDP_SCOPE` | BDP client-credentials scope from your credentials |
| `BDP_BASE_URL` | Optional HTTPS BDP API base URL; defaults to `https://ecostruxure-building-platform-api-uat.se.app` (UAT). Set explicitly for another environment. |

Start with `npm start`, or configure an MCP client to execute `node` with the
absolute path to `dist/index.js` as its argument and the above environment
variables. Supply secrets through your client or host's secret storage; do not
commit them. The server uses stdout exclusively for MCP and writes startup
errors to stderr.

`bdp_list_sites` accepts optional integer `take` (default 20, capped at 100)
and `skip` (default 0). It returns the BDP JSON response. A 401 causes one
token renewal and retry; 401, 403, and server failures are returned as tool
errors. The API version header is always `3.0`.

For BDP access and scope setup, see the
[public BDP documentation](https://github.com/SchneiderElectricBuildings/BuildingDataPlatform).
Run `npm run lint`, `npm run typecheck`, and `npm test` locally; tests use
fictional data and mocked HTTP and require no BDP credentials.
