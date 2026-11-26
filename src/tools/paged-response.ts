import type { BdpResponse } from '../bdp-client.js';

export const MAX_TOOL_RESPONSE_BYTES = 24 * 1024;

interface Pagination {
  skip: number;
  take: number;
  returned: number;
  total?: number;
  hasMore: boolean | null;
  nextSkip?: number;
}

function integerHeader(headers: Headers, ...names: string[]): number | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null && /^\d+$/.test(value)) return Number(value);
  }
  return undefined;
}

function getHeaderPagination(headers: Headers): { total?: number; nextSkip?: number } {
  const total = integerHeader(headers, 'x-total-count', 'total-count');
  const nextSkip = integerHeader(headers, 'x-next-skip', 'x-next-offset');
  const contentRange = headers.get('content-range');
  const rangeMatch = contentRange?.match(/^\w+\s+(\d+)-(\d+)\/(\d+|\*)$/);
  if (rangeMatch) {
    return {
      total: total ?? (rangeMatch[3] === '*' ? undefined : Number(rangeMatch[3])),
      nextSkip: nextSkip ?? Number(rangeMatch[2]) + 1,
    };
  }
  const link = headers.get('link');
  const nextLink = link?.match(/<([^>]+)>\s*;\s*rel="?next"?/i)?.[1];
  if (nextLink) {
    try {
      const url = new URL(nextLink, 'https://pagination.invalid');
      const offset = url.searchParams.get('skip') ?? url.searchParams.get('offset');
      if (offset !== null && /^\d+$/.test(offset)) {
        return { total, nextSkip: nextSkip ?? Number(offset) };
      }
    } catch {
      return { total, nextSkip };
    }
  }
  return { total, nextSkip };
}

function paginationFor(
  response: BdpResponse,
  skip: number,
  take: number,
  returned: number,
  truncated: boolean,
): Pagination {
  const header = getHeaderPagination(response.headers);
  const hasMore = truncated
    ? true
    : header.nextSkip !== undefined
      ? true
      : header.total !== undefined
        ? skip + returned < header.total
        : Array.isArray(response.data) && returned === take
          ? true
          : null;
  const nextSkip = truncated
    ? skip + returned
    : header.nextSkip ?? (hasMore ? skip + returned : undefined);
  return {
    skip,
    take,
    returned,
    ...(header.total === undefined ? {} : { total: header.total }),
    hasMore,
    ...(nextSkip === undefined ? {} : { nextSkip }),
  };
}

function responseText(
  items: unknown,
  pagination: Pagination,
  truncated: boolean,
): string {
  const hint = truncated
    ? `The response was truncated; reduce take or request skip=${pagination.nextSkip ?? pagination.skip + pagination.returned} to continue.`
    : pagination.hasMore
      ? `More data is available; request skip=${pagination.nextSkip ?? pagination.skip + pagination.returned} to continue.`
      : undefined;
  return JSON.stringify({
    items,
    pagination,
    ...(truncated ? { truncated: true } : {}),
    ...(hint ? { hint } : {}),
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function formatPagedResponse(
  response: BdpResponse,
  skip: number,
  take: number,
): string {
  const originalItems = response.data;
  const rowCount = Array.isArray(originalItems) ? originalItems.length : 1;
  const text = responseText(originalItems, paginationFor(response, skip, take, rowCount, false), false);
  if (byteLength(text) <= MAX_TOOL_RESPONSE_BYTES) return text;

  if (Array.isArray(originalItems)) {
    let low = 0;
    let high = originalItems.length;
    let best = responseText([], paginationFor(response, skip, take, 0, true), true);
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const pagination = paginationFor(response, skip, take, middle, true);
      const candidate = responseText(originalItems.slice(0, middle), pagination, true);
      if (byteLength(candidate) <= MAX_TOOL_RESPONSE_BYTES) {
        best = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return best;
  }

  return JSON.stringify({
    items: '[Omitted: this single resource exceeded the response size limit]',
    pagination: { skip, take, returned: 1, hasMore: null },
    truncated: true,
    hint: 'This single resource exceeded the response size limit; it has no offset continuation.',
  });
}

