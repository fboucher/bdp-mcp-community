import { getIntrospectionQuery, parse } from 'graphql';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BdpClient, BdpError } from '../bdp-client.js';

export const MAX_GRAPHQL_RESPONSE_BYTES = 64 * 1024;
export const MAX_GRAPHQL_SCHEMA_BYTES = 32 * 1024;
const MAX_SCHEMA_TYPES = 500;
const MAX_TYPE_FIELDS = 50;
const MAX_TYPE_MEMBERS = 100;
const MAX_FIELD_ARGUMENTS = 20;

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function typeName(value: unknown): string {
  const ref = record(value);
  if (!ref) return '?';
  if (ref.kind === 'NON_NULL') return `${typeName(ref.ofType)}!`;
  if (ref.kind === 'LIST') return `[${typeName(ref.ofType)}]`;
  return stringValue(ref.name) ?? '?';
}

function compactArguments(value: unknown): JsonObject[] {
  return arrayValue(value).slice(0, MAX_FIELD_ARGUMENTS).flatMap((argument) => {
    const item = record(argument);
    const name = item && stringValue(item.name);
    if (!item || !name) return [];
    return [{ name, type: typeName(item.type) }];
  });
}

function compactType(value: unknown): JsonObject | undefined {
  const item = record(value);
  const kind = item && stringValue(item.kind);
  const name = item && stringValue(item.name);
  if (!item || !kind || !name) return undefined;

  const compact: JsonObject = { kind, name };
  if (Array.isArray(item.fields)) {
    compact.fields = item.fields.slice(0, MAX_TYPE_FIELDS).flatMap((field) => {
      const fieldRecord = record(field);
      const fieldName = fieldRecord && stringValue(fieldRecord.name);
      if (!fieldRecord || !fieldName) return [];
      return [{
        name: fieldName,
        type: typeName(fieldRecord.type),
        args: compactArguments(fieldRecord.args),
      }];
    });
  }
  if (Array.isArray(item.inputFields)) {
    compact.inputFields = item.inputFields.slice(0, MAX_TYPE_FIELDS).flatMap((field) => {
      const fieldRecord = record(field);
      const fieldName = fieldRecord && stringValue(fieldRecord.name);
      if (!fieldRecord || !fieldName) return [];
      return [{ name: fieldName, type: typeName(fieldRecord.type) }];
    });
  }
  if (Array.isArray(item.enumValues)) {
    compact.enumValues = item.enumValues.slice(0, MAX_TYPE_MEMBERS).flatMap((enumValue) => {
      const enumRecord = record(enumValue);
      const enumName = enumRecord && stringValue(enumRecord.name);
      return enumName ? [enumName] : [];
    });
  }
  if (Array.isArray(item.possibleTypes)) {
    compact.possibleTypes = item.possibleTypes.slice(0, MAX_TYPE_MEMBERS).flatMap((possibleType) => {
      const possibleRecord = record(possibleType);
      const possibleName = possibleRecord && stringValue(possibleRecord.name);
      return possibleName ? [possibleName] : [];
    });
  }
  return compact;
}

function typeWasTruncated(value: unknown): boolean {
  const item = record(value);
  if (!item) return false;
  const fields = arrayValue(item.fields);
  return fields.length > MAX_TYPE_FIELDS ||
    fields.some((field) => arrayValue(record(field)?.args).length > MAX_FIELD_ARGUMENTS) ||
    arrayValue(item.inputFields).length > MAX_TYPE_FIELDS ||
    arrayValue(item.enumValues).length > MAX_TYPE_MEMBERS ||
    arrayValue(item.possibleTypes).length > MAX_TYPE_MEMBERS;
}

function serializedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function compactSchema(body: unknown): JsonObject | undefined {
  const data = record(record(body)?.data);
  const schema = record(data?.__schema);
  if (!schema) return undefined;

  const sourceTypes = arrayValue(schema.types)
    .filter((type) => !stringValue(record(type)?.name)?.startsWith('__'));
  const selectedTypes = sourceTypes.slice(0, MAX_SCHEMA_TYPES);
  const types = selectedTypes.flatMap((type) => {
    const compact = compactType(type);
    return compact ? [compact] : [];
  });

  const summary: JsonObject = {
    queryType: stringValue(record(schema.queryType)?.name) ?? null,
    mutationType: stringValue(record(schema.mutationType)?.name) ?? null,
    subscriptionType: stringValue(record(schema.subscriptionType)?.name) ?? null,
    types,
    truncated: sourceTypes.length > types.length || selectedTypes.some(typeWasTruncated),
  };
  while (serializedSize(summary) > MAX_GRAPHQL_SCHEMA_BYTES && types.length > 0) {
    types.pop();
    summary.truncated = true;
  }
  return summary;
}

function hasGraphqlErrors(body: unknown): boolean {
  return arrayValue(record(body)?.errors).length > 0;
}

function boundedText(value: unknown, limit = MAX_GRAPHQL_RESPONSE_BYTES): string | undefined {
  const text = JSON.stringify(value);
  return Buffer.byteLength(text, 'utf8') <= limit ? text : undefined;
}

function errorResult(message: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function responseResult(status: number, body: unknown): {
  isError?: boolean;
  content: [{ type: 'text'; text: string }];
} {
  const output = status < 200 || status >= 300 ? { httpStatus: status, body } : body;
  const text = boundedText(output);
  if (!text) return errorResult(`GraphQL response exceeded the ${MAX_GRAPHQL_RESPONSE_BYTES}-byte limit`);
  return {
    ...(status < 200 || status >= 300 || hasGraphqlErrors(body) ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

async function runGraphql(
  client: BdpClient,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
): Promise<{ status: number; body: unknown }> {
  return client.graphqlRequest(query, variables, operationName);
}

export function registerGraphqlTools(server: McpServer, client: BdpClient): void {
  server.registerTool('bdp_graphql_schema', {
    description: 'Return a compact, size-bounded summary of the BDP GraphQL schema.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async () => {
    try {
      const { status, body } = await runGraphql(client, getIntrospectionQuery({
        descriptions: false,
        typeDepth: 5,
      }));
      if (status < 200 || status >= 300 || hasGraphqlErrors(body)) {
        return responseResult(status, body);
      }
      const schema = compactSchema(body);
      if (!schema) return errorResult('GraphQL introspection response did not contain data.__schema');
      const text = boundedText(schema, MAX_GRAPHQL_SCHEMA_BYTES);
      if (!text) return errorResult(`GraphQL schema exceeded the ${MAX_GRAPHQL_SCHEMA_BYTES}-byte limit`);
      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      return errorResult(error instanceof BdpError ? error.message : 'Unexpected error while reading the GraphQL schema');
    }
  });

  server.registerTool('bdp_graphql_query', {
    description: 'Run a read-only GraphQL query against BDP. Mutation and subscription operations are rejected.',
    inputSchema: {
      query: z.string().min(1).describe('A GraphQL query document.'),
      variables: z.record(z.string(), z.unknown()).optional().describe('Optional GraphQL variables.'),
      operationName: z.string().optional().describe('Optional operation name for a multi-operation document.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ query, variables, operationName }) => {
    let document;
    try {
      document = parse(query);
    } catch (error) {
      return errorResult(error instanceof Error ? `Invalid GraphQL document: ${error.message}` : 'Invalid GraphQL document');
    }
    const operations = document.definitions.filter((definition) => definition.kind === 'OperationDefinition');
    if (
      operations.length === 0 ||
      document.definitions.some(
        (definition) => definition.kind !== 'OperationDefinition' && definition.kind !== 'FragmentDefinition',
      ) ||
      operations.some((definition) => definition.operation !== 'query')
    ) {
      return errorResult('Only GraphQL query operations are allowed');
    }

    try {
      const { status, body } = await runGraphql(client, query, variables, operationName);
      return responseResult(status, body);
    } catch (error) {
      return errorResult(error instanceof BdpError ? error.message : 'Unexpected error while running the GraphQL query');
    }
  });
}
