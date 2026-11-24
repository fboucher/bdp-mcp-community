# BDP MCP community server

A read-only MCP server for querying EcoStruxure Building Data Platform (BDP)
through stdio and an Entra client-credentials identity.

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

The server exposes `bdp_list_sites`, spatial organization/building/floor/space
tools, device and source listing, dataset retrieval, and current or historical
measurement-value tools. List tools accept offset pagination (`take`, default
20, capped at 100; `skip`, default 0) and return an `items` plus `pagination`
JSON envelope. Recognized response headers (`Content-Range`, `X-Total-Count`,
`Link: rel="next"`, `X-Next-Skip`, and `X-Next-Offset`) provide continuation
metadata. When those headers are absent, `hasMore` is unknown unless a full
page was returned. Oversized array responses are shortened at an item boundary
and include a continuation hint.

All tools validate GUID inputs and surface HTTP errors without exposing
response bodies. A 401 causes one token renewal and retry; 404, 413, 424, 403,
and server failures become explicit tool errors. The API version header is
always `3.0`.

The public starter examples confirm the organization, building, floor, space,
and dataset measurement-value routes used here. The following routes or
parameters are implementation assumptions pending access to the canonical
OpenAPI bundle: nested device/device-group routes, the generic entity route
mapping, historical-value path and query parameter names, and exact-name
filters. These are isolated in the tool registrations so they can be aligned
with the bundle without changing the shared client.

For BDP access and scope setup, see the
[public BDP documentation](https://github.com/SchneiderElectricBuildings/BuildingDataPlatform).
Run `npm run lint`, `npm run typecheck`, and `npm test` locally; tests use
fictional data and mocked HTTP and require no BDP credentials.
