# BDP MCP community server

A Model Context Protocol (MCP) server for EcoStruxure Building Data Platform
(BDP), with REST read tools, an opt-in dataset creation tool, and GraphQL
schema/query tools. It uses stdio by default and an Entra client-credentials
identity.

## Quick start

Requires Node.js `^22.13.0`, `^24.0.0`, or `>=26.0.0` and npm.

1. Clone this repository, enter its directory, and install and build:

   ```sh
   git clone https://github.com/fboucher/bdp-mcp-community.git
   cd bdp-mcp-community
   npm ci
   npm run build
   ```

2. Obtain an Entra tenant, application credentials, and BDP scope for your
   authorized environment. Configure a client below with the **absolute** path
   to `dist/index.js` and these values. The default BDP endpoint is UAT; set
   `BDP_BASE_URL` explicitly if using another authorized environment.
3. Start or reload the MCP client and connect to `bdp`. Discover its tools and
   call `bdp_list_sites` with `{ "take": 1 }` to check BDP access. A successful
   connection alone does not verify credentials or API access.

Keep secrets in your client's or host's secret storage where supported; never
commit them. The stdio server reserves stdout for MCP and reports startup errors
and effective write status on stderr.

### Client configuration

For VS Code, place the following in `.vscode/mcp.json`. Replace every
placeholder; use an absolute path, and escape Windows backslashes as `\\` in JSON.
Consult your client documentation for its secret-input facilities.

```json
{
  "servers": {
    "bdp": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/bdp-mcp-community/dist/index.js"],
      "env": {
        "BDP_TENANT_ID": "<tenant-id-or-domain>",
        "BDP_CLIENT_ID": "<client-id>",
        "BDP_CLIENT_SECRET": "<client-secret>",
        "BDP_SCOPE": "<bdp-scope>",
        "BDP_BASE_URL": "https://api.example.com"
      }
    }
  }
}
```

For Claude Desktop, use the same command, arguments, and environment under
`mcpServers` in its configuration file:

```json
{
  "mcpServers": {
    "bdp": {
      "command": "node",
      "args": ["/absolute/path/to/bdp-mcp-community/dist/index.js"],
      "env": {
        "BDP_TENANT_ID": "<tenant-id-or-domain>",
        "BDP_CLIENT_ID": "<client-id>",
        "BDP_CLIENT_SECRET": "<client-secret>",
        "BDP_SCOPE": "<bdp-scope>",
        "BDP_BASE_URL": "https://api.example.com"
      }
    }
  }
}
```

The example URL is a placeholder, not a working BDP endpoint. Omit
`BDP_BASE_URL` to use the UAT default. Both examples start the default stdio
transport; client configuration formats and secret management may vary by
client version.

### npm / npx

The proposed package name is `@fboucher/bdp-mcp-community`. Publication and
availability are not verified; a maintainer must reserve the npm scope and
configure publishing credentials before release. After publication, a client
using an `mcpServers` configuration could use:

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

For VS Code, use the same definition under `servers` in `.vscode/mcp.json`
and add `"type": "stdio"`. On Windows, clients that cannot resolve `npx` may
need `npx.cmd`. Use client secret storage where available.

### Container hosting

Build locally with `docker build -t bdp-mcp-community .`. The proposed release
image name is `ghcr.io/fboucher/bdp-mcp-community:v<version>`; publication
has not been verified. The image is configured to run as a non-root user and
defaults to stdio. Attach stdin with `-i` and provide the required BDP variables
through a private env file:

```sh
docker run --rm -i --env-file ./.env.bdp bdp-mcp-community
```

For Streamable HTTP, include the four required `BDP_*` variables and a strong
`MCP_AUTH_TOKEN` in the private env file, then run:

```sh
docker run --rm --env-file ./.env.bdp \
  -e MCP_TRANSPORT=http -e MCP_HTTP_HOST=0.0.0.0 \
  -p 127.0.0.1:3000:3000 bdp-mcp-community
```

Connect to `/mcp` using `Authorization: Bearer <mcp-auth-token>`; `/health` is
public. Binding to `0.0.0.0` inside the container allows port forwarding; the
example exposes the port only on the host's loopback interface. Use a trusted
gateway for TLS and additional access controls, protect the bearer token and
credentials, and do not expose the port directly to untrusted networks.
`.env.bdp` is ignored by Git and excluded from the Docker build context; keep
the file private and never commit credentials.

### Releasing

The tag-triggered workflows publish only from `fboucher/bdp-mcp-community` and
require a tag `v<version>` matching `package.json`. Before release, a maintainer
must reserve the proposed npm scope (or update the package name), configure the
`NPM_TOKEN` repository secret with an npm publishing credential, and ensure the
workflow token can publish packages to GHCR. Verify the published package from a
clean machine after the first release. No package or image is implied to exist
until publication is confirmed.

## Environment reference

Variables are read by the server process, not automatically from a `.env` file.
Required values have no default.

| Variable | Default | Example | Meaning |
| --- | --- | --- | --- |
| `BDP_TENANT_ID` | Required | `example-tenant` | Entra tenant ID or domain. |
| `BDP_CLIENT_ID` | Required | `<client-id>` | Entra application client ID. |
| `BDP_CLIENT_SECRET` | Required | `<client-secret>` | Entra client secret. |
| `BDP_SCOPE` | Required | `<bdp-scope>` | Client-credentials scope supplied for BDP. |
| `BDP_BASE_URL` | `https://ecostruxure-building-platform-api-uat.se.app` | `https://api.example.com` | HTTPS API base URL without credentials, query, or fragment. |
| `MCP_TRANSPORT` | `stdio` | `http` | `stdio` or Streamable HTTP. |
| `MCP_HTTP_HOST` | `127.0.0.1` | `127.0.0.1` | HTTP bind address. |
| `MCP_HTTP_PORT` | `3000` | `3000` | HTTP port, integer 0–65535; 0 selects an ephemeral port. |
| `MCP_AUTH_TOKEN` | Unset | `<bearer-token>` | If set, requires this nonempty, whitespace-free bearer token on `/mcp`. |
| `MCP_READ_ONLY` | `true` | `false` | Omit tools not annotated read-only when true. |
| `MCP_ALLOW_DESTRUCTIVE` | `false` | `true` | Allow destructive tools only when read-only is also false. |

Boolean values are `true` or `false`, case-insensitive. HTTP settings only
affect HTTP transport. With `MCP_TRANSPORT=http`, the MCP endpoint is `/mcp`
and `GET /health` is public and does not contact BDP. Without
`MCP_AUTH_TOKEN`, `/mcp` is unauthenticated. HTTP binds to loopback by default;
expose it only through a trusted gateway providing TLS and any additional
access controls.

The optional live test also reads the following variables; it is not part of
server configuration. See [Contributing](CONTRIBUTING.md) for its safety gates.

| Variable | Default | Example | Meaning |
| --- | --- | --- | --- |
| `BDP_LIVE_SMOKE` | Unset | `1` | Explicitly opt in to live smoke tests. |
| `BDP_LIVE_SMOKE_CONFIRM_NON_PROD` | Unset | `I_CONFIRM_UAT_ONLY` | Confirm the UAT-only target after human verification. |
| `CI` | Unset | `true` | Any nonempty value disables live tests. |
| `GITHUB_ACTIONS` | Unset | `true` | The exact value `true` disables live tests. |

## Safety model

Tools must be registered through `registerSafeTool` with explicit
`readOnlyHint` and `destructiveHint` annotations. The server trusts these
annotations; authors must classify handlers accurately. A tool cannot be both
read-only and destructive.

| `MCP_READ_ONLY` | `MCP_ALLOW_DESTRUCTIVE` | Tools registered |
| --- | --- | --- |
| `true` | either | Read-only only; all write tools are omitted. |
| `false` | `false` | Read-only and non-destructive writes; destructive tools are omitted. |
| `false` | `true` | Read-only, non-destructive write, and destructive tools. |

Omitted tools are unavailable for both discovery and invocation. These gates
are not a replacement for BDP permissions or client-side approval. The
non-destructive write tool `bdp_create_dataset` is omitted by default; enabling
writes exposes it. No destructive tools are currently registered. GraphQL
mutations and subscriptions are rejected independently of the flags.

## Tools and development

The server exposes `bdp_list_sites`, spatial organization/building/floor/space
tools, device and source listing, dataset retrieval, current and historical
measurement-value tools, `bdp_graphql_schema`, and `bdp_graphql_query`.
When writes are enabled, `bdp_create_dataset` accepts a non-empty `name`, a
future UTC `expiresOn` timestamp, and `members` containing optional GUID arrays
for `buildings`, `floors`, `spaces`, `devices`, or `measurementValues`.
List tools accept offset pagination (`take`, default 20, capped at 100; `skip`,
default 0) and return an `items` plus `pagination` JSON envelope. Recognized
response headers provide continuation metadata; otherwise `hasMore` is unknown
unless a full page was returned. Oversized array responses are shortened at an
item boundary and include a continuation hint.

GraphQL requests use `<BDP_BASE_URL>/graphql`, API version `3.0`, and bounded
responses. A 401 triggers one token renewal and retry. Errors are surfaced
without exposing HTTP response bodies. Some REST routes and filters remain
implementation assumptions pending access to the canonical OpenAPI bundle; see
the tool registrations before relying on them.

See the [public BDP documentation](https://github.com/SchneiderElectricBuildings/BuildingDataPlatform)
for API and access resources, and the [tool development guide](docs/adding-a-tool.md)
for a worked example of adding, changing, and removing tools.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
The default tests use fictional data and mocked HTTP and require no BDP
credentials. The opt-in live tests are described in [Contributing](CONTRIBUTING.md).
