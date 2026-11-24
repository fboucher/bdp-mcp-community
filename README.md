# BDP MCP community server

A Model Context Protocol (MCP) server for EcoStruxure Building Data Platform
(BDP), with REST read tools and GraphQL schema/query tools. It uses stdio by
default and an Entra client-credentials identity. Read-only mode is enabled by
default; write tools are exposed only when explicitly enabled.

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
| `MCP_TRANSPORT` | Optional `stdio` (default) or `http` transport |
| `MCP_HTTP_HOST` | Optional HTTP bind address; defaults to `127.0.0.1` |
| `MCP_HTTP_PORT` | Optional HTTP port; defaults to `3000` |
| `MCP_AUTH_TOKEN` | Optional bearer token required by the HTTP MCP endpoint |
| `MCP_READ_ONLY` | Optional `true` (default) or `false`; when false, registered non-destructive write tools may be exposed |
| `MCP_ALLOW_DESTRUCTIVE` | Optional `false` (default) or `true`; enables registered destructive tools only when read-only mode is disabled |

Start with `npm start`, or configure an MCP client to execute `node` with the
absolute path to `dist/index.js` as its argument and the above environment
variables. Supply secrets through your client or host's secret storage; do not
commit them. The server uses stdout exclusively for MCP and writes startup
errors to stderr.

### npm / npx

The proposed package name is `@fboucher/bdp-mcp-community`. It is not yet
published: a maintainer must reserve the npm scope and configure publishing
credentials first. After publication, Claude Desktop and other clients using
an `mcpServers` configuration can use:

```json
{
  "mcpServers": {
    "bdp": {
      "command": "npx",
      "args": ["-y", "@fboucher/bdp-mcp-community"],
      "env": {
        "BDP_TENANT_ID": "<tenant-id>",
        "BDP_CLIENT_ID": "<client-id>",
        "BDP_CLIENT_SECRET": "<client-secret>",
        "BDP_SCOPE": "<bdp-scope>"
      }
    }
  }
}
```

For VS Code, use the same server definition under `servers` in `.vscode/mcp.json`
and add `"type": "stdio"` to it. On Windows, clients that cannot resolve `npx`
may need `npx.cmd` as the command. Use the client's secret storage where
available instead of saving credentials in a shared configuration file.

### Container hosting

Build locally with `docker build -t bdp-mcp-community .`. The proposed release
image is `ghcr.io/fboucher/bdp-mcp-community:v<version>` after publication. The
image runs as a non-root user and defaults to stdio; attach stdin with `-i`
and pass the required BDP variables via a private env file:

```sh
docker run --rm -i --env-file ./bdp.env bdp-mcp-community
```

For Streamable HTTP, put the four required `BDP_*` variables above and a
strong `MCP_AUTH_TOKEN` in that private env file, then run:

```sh
docker run --rm --env-file ./bdp.env \
  -e MCP_TRANSPORT=http -e MCP_HTTP_HOST=0.0.0.0 \
  -p 127.0.0.1:3000:3000 bdp-mcp-community
```

Connect to `/mcp` using `Authorization: Bearer <mcp-auth-token>`; `/health` is
public. Binding to `0.0.0.0` inside the container is needed for port forwarding;
the example exposes the port only on the host's loopback interface. Put a
trusted gateway in front for TLS, authentication and any additional access
controls, and protect the bearer token and BDP credentials. Do not expose the
container port directly to untrusted networks.

### Releasing

The tag-triggered workflows publish only from `fboucher/bdp-mcp-community` and
require a tag `v<version>` matching `package.json`. Before release, a maintainer
must reserve the proposed npm scope (or update the package name), configure the
`NPM_TOKEN` repository secret with an npm publishing credential, and ensure the
workflow token can publish packages to GHCR. Verify the published package from a
clean machine after the first release. No package or image is implied to exist
until those steps and publication are complete.

All tools currently exposed by this server are read-only. The write-safety
settings are enforced when tools are registered: read-only mode omits write
tools from both discovery and invocation, while destructive tools require both
`MCP_READ_ONLY=false` and `MCP_ALLOW_DESTRUCTIVE=true`. Startup reports the
effective write status to stderr without printing credentials.

Set `MCP_TRANSPORT=http` to serve MCP Streamable HTTP at `/mcp`; the `/health`
endpoint is public and does not contact BDP. Configure `MCP_AUTH_TOKEN` to
require a bearer token. The HTTP server binds to loopback by default. For
production, expose it only through a trusted gateway that handles TLS and any
additional access controls.

`bdp_list_sites` accepts optional integer `take` (default 20, capped at 100)
and `skip` (default 0). `bdp_graphql_schema` returns a compact schema summary,
and `bdp_graphql_query` accepts GraphQL query documents and optional variables.
Mutation and subscription operations are rejected. GraphQL requests use
`<BDP_BASE_URL>/graphql`, standard JSON request/response bodies, and the API
version header `3.0`; responses are limited to 64 KiB and schema summaries to
32 KiB. A 401 triggers one token renewal and retry.

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
and dataset measurement-value routes used here. The nested device/device-group
routes, generic entity route mapping, historical-value path and query parameter
names, and exact-name filters remain implementation assumptions pending access
to the canonical OpenAPI bundle. These are isolated in the tool registrations.

For BDP access and scope setup, see the
[public BDP documentation](https://github.com/SchneiderElectricBuildings/BuildingDataPlatform).
Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` locally;
tests use fictional data and mocked HTTP and require no BDP credentials.
