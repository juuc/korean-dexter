/**
 * OpenDART API HTTP client with rate limiting, caching, and error handling.
 * Base client for all OpenDART API interactions.
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
  type ToolError,
} from '@/shared/types.js';
import { getOpenDartApiKey } from '@/utils/env.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Raw DART API response envelope.
 * All DART endpoints return this shape.
 */
interface DartApiResponse {
  readonly status: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

/**
 * Map DART error status codes to ToolError codes.
 */
function mapDartStatusToErrorCode(
  status: string
): { code: ToolError['code']; retryable: boolean } | null {
  switch (status) {
    case '000':
      return null; // Success
    case '010':
      return { code: 'AUTH_EXPIRED', retryable: false };
    case '011':
      return { code: 'NOT_FOUND', retryable: false };
    case '013':
      return { code: 'NOT_FOUND', retryable: false };
    case '020':
      return { code: 'RATE_LIMITED', retryable: true };
    case '800':
      return { code: 'API_ERROR', retryable: true };
    default:
      return { code: 'API_ERROR', retryable: false };
  }
}

/**
 * DART status code descriptions for error messages.
 */
function getDartStatusMessage(status: string, fallbackMessage: string): string {
  switch (status) {
    case '010':
      return 'No registered API key (DART status 010)';
    case '011':
      return 'No matching data found (DART status 011)';
    case '013':
      return 'No data available for the requested period (DART status 013)';
    case '020':
      return 'API request limit exceeded (DART status 020)';
    case '800':
      return 'DART system error (status 800)';
    default:
      return `DART API error: ${fallbackMessage} (status ${status})`;
  }
}

export interface OpenDartClientOptions {
  readonly apiKey?: string;
  readonly cacheDbPath?: string;
}

/**
 * OpenDART API client with built-in rate limiting, two-tier caching, and error handling.
 *
 * Usage:
 * ```ts
 * const client = new OpenDartClient();
 * const result = await client.request<SomeType>('fnlttSinglAcnt', {
 *   corp_code: '00126380',
 *   bsns_year: '2024',
 *   reprt_code: '11011',
 * });
 * ```
 */
export class OpenDartClient {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;
  private readonly lruCache: LRUCache<unknown>;
  private readonly diskCache: DiskCache;
  private readonly baseUrl = 'https://opendart.fss.or.kr/api';

  constructor(options?: OpenDartClientOptions) {
    const key = options?.apiKey ?? getOpenDartApiKey();
    if (!key) {
      throw new Error(
        'OpenDART API key is required. Set OPENDART_API_KEY environment variable or pass apiKey option.'
      );
    }
    this.apiKey = key;
    this.rateLimiter = createRateLimiter('opendart');

    const dbPath =
      options?.cacheDbPath ??
      join(homedir(), '.korean-dexter', 'opendart-cache.sqlite');
    this.lruCache = new LRUCache<unknown>(500);
    this.diskCache = new DiskCache(dbPath);
  }

  /**
   * Make a request to the OpenDART API with rate limiting, caching, and error handling.
   *
   * @param endpoint API endpoint name (e.g., 'fnlttSinglAcnt', 'company.json')
   * @param params Query parameters (crtfc_key is auto-injected)
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
      buildCacheKey('opendart', endpoint, params);

    try {
      // Use cache-through wrapper
      const cached = await cachedApiCall<ToolResult<T>>(
        cacheKey,
        ttlMs,
        async () => {
          // Acquire rate limit token
          const acquireResult = await this.rateLimiter.acquire();

          // Build URL with all params + API key
          const url = new URL(`${this.baseUrl}/${endpoint}.json`);
          url.searchParams.set('crtfc_key', this.apiKey);
          for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
          }

          // Make HTTP request
          const fetchStart = Date.now();
          const response = await fetch(url.toString());
          const responseTimeMs = Date.now() - fetchStart;

          if (!response.ok) {
            return createToolError<T>(
              'NETWORK_ERROR',
              `HTTP ${response.status}: ${response.statusText}`,
              'opendart',
              response.status >= 500,
              responseTimeMs
            );
          }

          // Parse response
          const rawBody: unknown = await response.json();
          const body = rawBody as DartApiResponse;

          // Check DART-specific error codes
          const errorMapping = mapDartStatusToErrorCode(body.status);
          if (errorMapping !== null) {
            return createToolError<T>(
              errorMapping.code,
              getDartStatusMessage(body.status, body.message),
              'opendart',
              errorMapping.retryable,
              responseTimeMs
            );
          }

          // Success — return the full response body as data
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

      // If result came from cache, update response time to reflect cache hit
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

      // Rate limiter errors
      if (message.includes('quota exhausted') || message.includes('retry exhausted')) {
        return createToolError<T>(
          'RATE_LIMITED',
          message,
          'opendart',
          true,
          responseTimeMs
        );
      }

      return createToolError<T>(
        'NETWORK_ERROR',
        message,
        'opendart',
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
