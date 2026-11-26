# ADR 0002: MCP transports

Status: Accepted

## Context

Local MCP clients need a simple process-based connection, while hosted deployments need a network transport.

## Decision

Use stdio by default and offer Streamable HTTP as an optional transport. In stdio mode, reserve stdout for MCP protocol messages and send logs to stderr. HTTP deployments should be placed behind a gateway or OAuth proxy appropriate to their environment.

## Consequences

Local users do not need an HTTP service, but hosted deployments must secure and operate a network endpoint. HTTP authentication is described in ADR 0003. Transport implementation is tracked separately.
