# ADR 0004: Read-only and destructive-operation controls

Status: Accepted

## Context

MCP clients may invoke tools against live BDP data. Tool annotations help clients communicate risk, but they are not an enforcement mechanism.

## Decision

Annotate every tool with MCP `readOnlyHint` and `destructiveHint`. When `BDP_READ_ONLY=true`, do not register write tools, so they are neither listed nor callable. Destructive operations, including dataset deletion, require a separate explicit opt-in in addition to writes being enabled. The destructive flag's configuration name is to be defined by its implementation.

The general `bdp_graphql_query` tool parses GraphQL documents and rejects mutations, including documents with multiple operations. Writes are available only through annotated write tools subject to the same controls. Default to the non-production environment; using production requires an explicit `BDP_BASE_URL`.

## Consequences

Read-only and destructive controls must be enforced server-side and tested independently; annotations alone cannot prevent writes. The service identity's BDP permissions remain an additional boundary. This records the intended safety model, not an assertion that the controls have already been implemented.
