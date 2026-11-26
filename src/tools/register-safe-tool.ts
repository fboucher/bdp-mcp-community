import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config.js';

type InputSchema = undefined | ZodRawShapeCompat | AnySchema;
type OutputSchema = ZodRawShapeCompat | AnySchema;

type SafeToolConfig<
  InputArgs extends InputSchema,
  OutputArgs extends OutputSchema,
> = {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: OutputArgs;
  annotations: ToolAnnotations & {
    readOnlyHint: boolean;
    destructiveHint: boolean;
  };
  _meta?: Record<string, unknown>;
};

export function registerSafeTool<
  OutputArgs extends OutputSchema = AnySchema,
  InputArgs extends InputSchema = undefined,
>(
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  config: Pick<Config, 'readOnly' | 'allowDestructive'>,
  name: string,
  toolConfig: SafeToolConfig<InputArgs, OutputArgs>,
  handler: ToolCallback<InputArgs>,
): RegisteredTool | undefined {
  const { readOnlyHint, destructiveHint } = toolConfig.annotations;
  if (readOnlyHint && destructiveHint) {
    throw new Error(`Tool ${name} cannot be both read-only and destructive`);
  }
  if (config.readOnly && !readOnlyHint) return undefined;
  if (destructiveHint && (config.readOnly || !config.allowDestructive)) return undefined;
  return server.registerTool(name, toolConfig, handler);
}
