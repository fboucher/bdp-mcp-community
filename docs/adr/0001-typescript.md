# ADR 0001: TypeScript and project tooling

Status: Accepted

## Context

The project is a small, customizable MCP server for the BDP REST and GraphQL APIs. Contributors need a consistent way to describe and validate tool inputs and test behavior.

## Decision

Use TypeScript, the official MCP SDK, Zod schemas for validation, and Vitest for tests. Keep tool groups in separate files, with shared client functionality separate from individual tools.

## Consequences

TypeScript and schemas provide type checking and runtime input validation, while the shared toolchain adds dependencies and requires maintenance. This records the intended architecture; implementation is tracked separately.
