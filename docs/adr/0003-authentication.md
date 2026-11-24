# ADR 0003: Authentication model

Status: Accepted

## Context

The server accesses BDP as a service rather than on behalf of individual MCP users. HTTP hosting also needs a way to restrict access to the server.

## Decision

Use one Microsoft Entra ID client-credentials identity configured through environment variables for BDP access. Cache access tokens and refresh them before expiry; do not use refresh tokens. Do not log secrets or tokens.

For Streamable HTTP, support an optional static bearer token configured through `MCP_AUTH_TOKEN`. When configured, reject missing or incorrect tokens and compare tokens in constant time. The health endpoint does not require the MCP token and does not contact BDP. For production hosting, place a gateway or OAuth proxy in front of the server; a shared static token is not per-user identity or full MCP OAuth.

## Consequences

All BDP requests use the same service identity and its permissions; callers are not individually identified to BDP. Operators are responsible for protecting credentials, controlling access to HTTP deployments, and granting the service identity only the permissions it needs. Authentication implementation is tracked separately.
