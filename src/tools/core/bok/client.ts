/**
 * BOK ECOS API HTTP client with rate limiting, caching, and error handling.
 * Bank of Korea Economic Statistics System.
 *
 * URL pattern: {baseUrl}/{endpoint}/{apiKey}/json/kr/{startCount}/{endCount}/{params...}
 * Auth: API key as URL path segment (not query parameter).
 */

import { createRateLimiter, type RateLimiter } from '@/infra/rate-limiter.js';
import {
  LRUCache,
  DiskCache,
  cachedApiCall,
  buildCacheKey,
} from '@/infra/cache.js';
import {
  createToolResult,
  createToolError,
  type ToolResult,
} from '@/shared/types.js';
import { getBokApiKey } from '@/utils/env.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BokClientOptions {
  readonly apiKey?: string;
  readonly cacheDbPath?: string;
}

export interface BokClientLike {
  request<T>(
    endpoint: string,
    params: Record<string, string>,
    cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string }
  ): Promise<ToolResult<T>>;
}

/**
 * Map BOK RESULT.CODE to ToolError codes.
 */
function mapBokResultCode(
  code: string
): { code: 'NOT_FOUND' | 'AUTH_EXPIRED' | 'RATE_LIMITED' | 'API_ERROR'; retryable: boolean } {
  if (code === 'INFO-200') {
    return { code: 'NOT_FOUND', retryable: false };
  }
  if (code === 'ERROR-500') {
    return { code: 'AUTH_EXPIRED', retryable: false };
  }
  if (code === 'ERROR-600') {
    return { code: 'RATE_LIMITED', retryable: true };
  }
  return { code: 'API_ERROR', retryable: false };
}

/**
 * BOK ECOS API client with built-in rate limiting, two-tier caching, and error handling.
 *
 * Usage:
 * ```ts
 * const client = new BokClient();
 * const result = await client.request<BokStatSearchResponse>('StatisticSearch', {
 *   tableCode: '722Y001',
 *   periodType: 'M',
 *   startDate: '202301',
 *   endDate: '202312',
 *   itemCode1: '0101000',
 * });
 * ```
 */
export class BokClient implements BokClientLike {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;
  private readonly lruCache: LRUCache<unknown>;
  private readonly diskCache: DiskCache;
  private readonly baseUrl = 'https://ecos.bok.or.kr/api';

  constructor(options?: BokClientOptions) {
    const key = options?.apiKey ?? getBokApiKey();
    if (!key) {
      throw new Error(
        'BOK API key is required. Set BOK_API_KEY environment variable or pass apiKey option.'
      );
    }
    this.apiKey = key;
    this.rateLimiter = createRateLimiter('bok');

    const dbPath =
      options?.cacheDbPath ??
      join(homedir(), '.korean-dexter', 'bok-cache.sqlite');
    this.lruCache = new LRUCache<unknown>(500);
    this.diskCache = new DiskCache(dbPath);
  }

  /**
   * Build URL for BOK ECOS API endpoint.
   * BOK uses path segments instead of query parameters.
   */
  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const start = params.startCount ?? '1';
    const end = params.endCount ?? '100';
    const base = `${this.baseUrl}/${endpoint}/${this.apiKey}/json/kr/${start}/${end}`;

    if (endpoint === 'StatisticSearch') {
      const segments = [
        params.tableCode ?? '',
        params.periodType ?? '',
        params.startDate ?? '',
        params.endDate ?? '',
        params.itemCode1 ?? '',
        params.itemCode2 ?? '',
        params.itemCode3 ?? '',
        params.itemCode4 ?? '',
      ];
      // Trim trailing empty segments
      while (segments.length > 0 && segments[segments.length - 1] === '') {
        segments.pop();
      }
      return segments.length > 0 ? `${base}/${segments.join('/')}` : base;
    }

    if (endpoint === 'StatisticTableList') {
      const query = params.query ?? '';
      return query ? `${base}/${encodeURIComponent(query)}` : base;
    }

    // KeyStatisticList and other endpoints: no additional path segments
    return base;
  }

  /**
   * Make a request to the BOK ECOS API with rate limiting, caching, and error handling.
   *
   * @param endpoint API endpoint name (e.g., 'StatisticSearch', 'KeyStatisticList')
   * @param params Path segment parameters (endpoint-specific)
   * @param cacheOptions Cache TTL and optional custom cache key
   * @returns ToolResult wrapping the parsed response data
   */
  async request<T>(
    endpoint: string,
    params: Record<string, string>,
    cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string }
  ): Promise<ToolResult<T>> {
    const startTime = Date.now();
    const ttlMs = cacheOptions?.ttlMs ?? null;
    const cacheKey =
      cacheOptions?.cacheKey ??
      buildCacheKey('bok', endpoint, params);

    try {
      const cached = await cachedApiCall<ToolResult<T>>(
        cacheKey,
        ttlMs,
        async () => {
          const acquireResult = await this.rateLimiter.acquire();
          const url = this.buildUrl(endpoint, params);

          const fetchStart = Date.now();
          const response = await fetch(url);
          const responseTimeMs = Date.now() - fetchStart;

          if (!response.ok) {
            return createToolError<T>(
              'NETWORK_ERROR',
              `HTTP ${response.status}: ${response.statusText}`,
              'bok',
              response.status >= 500,
              responseTimeMs
            );
          }

          const rawBody: unknown = await response.json();
          const body = rawBody as Record<string, unknown>;

          // Check BOK-specific error codes in RESULT field
          const result = body.RESULT as { CODE: string; MESSAGE: string } | undefined;
          if (result?.CODE && !result.CODE.startsWith('000')) {
            const errorMapping = mapBokResultCode(result.CODE);
            return createToolError<T>(
              errorMapping.code,
              `BOK API: ${result.MESSAGE} (${result.CODE})`,
              'bok',
              errorMapping.retryable,
              responseTimeMs
            );
          }

          return createToolResult<T>(rawBody as T, {
            responseTimeMs,
            remainingDailyQuota: acquireResult.remainingDaily,
          });
        },
        {
          lruCache: this.lruCache as LRUCache<ToolResult<T>>,
          diskCache: this.diskCache,
        }
      );

      if (cached.fromCache) {
        const responseTimeMs = Date.now() - startTime;
        return {
          ...cached.data,
          metadata: {
            ...cached.data.metadata,
            responseTimeMs,
          },
        };
      }

      return cached.data;
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('quota exhausted') || message.includes('retry exhausted')) {
        return createToolError<T>(
          'RATE_LIMITED',
          message,
          'bok',
          true,
          responseTimeMs
        );
      }

      return createToolError<T>(
        'NETWORK_ERROR',
        message,
        'bok',
        true,
        responseTimeMs
      );
    }
  }

  /**
   * Get rate limiter status for quota monitoring.
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Close underlying resources (disk cache DB).
   */
  close(): void {
    this.diskCache.close();
  }
}
