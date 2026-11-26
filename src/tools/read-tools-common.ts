import { z } from 'zod';
import type { BdpClient, BdpResponse, QueryParameters } from '../bdp-client.js';
import { BdpError } from '../bdp-client.js';
import { formatPagedResponse } from './paged-response.js';

export const DEFAULT_TAKE = 20;
export const MAX_TAKE = 100;
export const guidSchema = z.string().uuid();

export const paginationSchema = {
  take: z.number().int().positive().optional()
    .describe('Maximum records to request (capped at 100; default 20).'),
  skip: z.number().int().nonnegative().optional()
    .describe('Number of records to skip (default 0).'),
};

export function listQuery(
  take: number | undefined,
  skip: number | undefined,
  filters: QueryParameters = {},
): { query: QueryParameters; take: number; skip: number } {
  const boundedTake = Math.min(take ?? DEFAULT_TAKE, MAX_TAKE);
  const offset = skip ?? 0;
  return { query: { ...filters, take: boundedTake, skip: offset }, take: boundedTake, skip: offset };
}

export async function page(
  client: BdpClient,
  path: string,
  query: QueryParameters,
  take: number,
  skip: number,
): Promise<BdpResponse> {
  return client.getJson(path, { ...query, take, skip });
}

export function pagedContent(response: BdpResponse, skip: number, take: number) {
  return { content: [{ type: 'text' as const, text: formatPagedResponse(response, skip, take) }] };
}

export function errorContent(error: unknown, fallback: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: error instanceof BdpError ? error.message : fallback }],
  };
}
