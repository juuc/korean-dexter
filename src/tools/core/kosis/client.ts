/**
 * KOSIS API HTTP client with rate limiting, caching, and error handling.
 * Korean Statistical Information Service (통계청 국가통계포털).
 *
 * Auth: apiKey as query parameter.
 * Endpoints: Stat/getList.do, Stat/getData.do
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
import { getKosisApiKey } from '@/utils/env.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface KosisClientOptions {
  readonly apiKey?: string;
  readonly cacheDbPath?: string;
}

export interface KosisClientLike {
  request<T>(
    endpoint: string,
    params: Record<string, string>,
    cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string }
  ): Promise<ToolResult<T>>;
}

/**
 * KOSIS API client with built-in rate limiting, two-tier caching, and error handling.
 *
 * Usage:
 * ```ts
 * const client = new KosisClient();
 * const result = await client.request<KosisDataRow[]>('Stat/getData.do', {
 *   orgId: '101',
 *   tblId: 'DT_1B040A3',
 *   prdSe: 'Y',
 *   startPrdDe: '2020',
 *   endPrdDe: '2024',
 * });
 * ```
 */
export class KosisClient implements KosisClientLike {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;
  private readonly lruCache: LRUCache<unknown>;
  private readonly diskCache: DiskCache;
  private readonly baseUrl = 'https://kosis.kr/openapi';

  constructor(options?: KosisClientOptions) {
    const key = options?.apiKey ?? getKosisApiKey();
    if (!key) {
      throw new Error(
        'KOSIS API key is required. Set KOSIS_API_KEY environment variable or pass apiKey option.'
      );
    }
    this.apiKey = key;
    this.rateLimiter = createRateLimiter('kosis');

    const dbPath =
      options?.cacheDbPath ??
      join(homedir(), '.korean-dexter', 'kosis-cache.sqlite');
    this.lruCache = new LRUCache<unknown>(500);
    this.diskCache = new DiskCache(dbPath);
  }

  /**
   * Make a request to the KOSIS API with rate limiting, caching, and error handling.
   *
   * @param endpoint API endpoint path (e.g., 'Stat/getList.do', 'Stat/getData.do')
   * @param params Query parameters (apiKey is auto-injected)
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
      buildCacheKey('kosis', endpoint, params);

    try {
      const cached = await cachedApiCall<ToolResult<T>>(
        cacheKey,
        ttlMs,
        async () => {
          const acquireResult = await this.rateLimiter.acquire();

          // Build URL with query parameters
          const url = new URL(`${this.baseUrl}/${endpoint}`);
          url.searchParams.set('apiKey', this.apiKey);
          url.searchParams.set('format', 'json');
          url.searchParams.set('jsonVD', 'Y');
          for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
          }

          const fetchStart = Date.now();
          const response = await fetch(url.toString());
          const responseTimeMs = Date.now() - fetchStart;

          if (!response.ok) {
            return createToolError<T>(
              'NETWORK_ERROR',
              `HTTP ${response.status}: ${response.statusText}`,
              'kosis',
              response.status >= 500,
              responseTimeMs
            );
          }

          const rawBody: unknown = await response.json();

          // Check for KOSIS error response: { err: "...", errMsg: "..." }
          if (
            rawBody !== null &&
            typeof rawBody === 'object' &&
            !Array.isArray(rawBody) &&
            'err' in rawBody
          ) {
            const errBody = rawBody as { err: string; errMsg: string };
            const isAuth = errBody.err === 'AUTH' || errBody.errMsg?.includes('인증');
            const isRateLimit = errBody.err === 'RATE_LIMIT' || errBody.errMsg?.includes('초과');

            if (isAuth) {
              return createToolError<T>(
                'AUTH_EXPIRED',
                `KOSIS API: ${errBody.errMsg} (${errBody.err})`,
                'kosis',
                false,
                responseTimeMs
              );
            }
            if (isRateLimit) {
              return createToolError<T>(
                'RATE_LIMITED',
                `KOSIS API: ${errBody.errMsg} (${errBody.err})`,
                'kosis',
                true,
                responseTimeMs
              );
            }

            return createToolError<T>(
              'API_ERROR',
              `KOSIS API: ${errBody.errMsg} (${errBody.err})`,
              'kosis',
              false,
              responseTimeMs
            );
          }

          // Empty array = no data found
          if (Array.isArray(rawBody) && rawBody.length === 0) {
            return createToolError<T>(
              'NOT_FOUND',
              'No data returned from KOSIS API',
              'kosis',
              false,
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
          'kosis',
          true,
          responseTimeMs
        );
      }

      return createToolError<T>(
        'NETWORK_ERROR',
        message,
        'kosis',
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
