import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type RateLimiter,
  createRateLimiter,
} from '@/infra/rate-limiter';
import {
  LRUCache,
  DiskCache,
  cachedApiCall,
  buildCacheKey,
} from '@/infra/cache';
import {
  type ToolResult,
  createToolResult,
  createToolError,
} from '@/shared/types';
import { KISAuthManager } from './auth';

/**
 * KIS API error response shape.
 */
interface KISApiResponse<T = unknown> {
  readonly rt_cd: string; // "0" = success, "1" = error
  readonly msg_cd: string;
  readonly msg1: string;
  readonly output?: T;
  readonly output1?: T; // Some endpoints use output1
  readonly output2?: readonly Record<string, string>[]; // List endpoints
}

/**
 * Cache options for a KIS request.
 */
interface CacheOptions {
  readonly ttlMs: number | null;
  readonly cacheKey?: string;
}

export interface KisClientLike {
  request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    options?: {
      readonly trId: string;
      readonly cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string };
    }
  ): Promise<ToolResult<T>>;
}

/**
 * Base HTTP client for KIS API.
 *
 * Handles authentication headers, rate limiting, two-tier caching,
 * error normalization, and automatic 401 retry.
 */
export class KISClient {
  private readonly auth: KISAuthManager;
  private readonly rateLimiter: RateLimiter;
  private readonly lruCache: LRUCache<unknown>;
  private readonly diskCache: DiskCache;

  constructor(options?: {
    readonly appKey?: string;
    readonly appSecret?: string;
    readonly paperTrading?: boolean;
    readonly cacheDbPath?: string;
  }) {
    this.auth = new KISAuthManager({
      appKey: options?.appKey,
      appSecret: options?.appSecret,
      paperTrading: options?.paperTrading,
    });

    this.rateLimiter = createRateLimiter('kis');
    this.lruCache = new LRUCache<unknown>(500);

    const dbPath =
      options?.cacheDbPath ??
      join(homedir(), '.korean-dexter', 'kis-cache.sqlite');
    this.diskCache = new DiskCache(dbPath);
  }

  /**
   * Make a request to KIS API with full middleware stack:
   * rate limiting -> caching -> auth headers -> error handling -> 401 retry.
   */
  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    options?: {
      readonly trId: string;
      readonly cacheOptions?: CacheOptions;
    }
  ): Promise<ToolResult<T>> {
    const startTime = Date.now();
    const trId = options?.trId ?? '';
    const cacheOpts = options?.cacheOptions;

    // Build cache key if caching is requested
    const cacheKey =
      cacheOpts?.cacheKey ?? buildCacheKey('kis', path, params);

    // If caching enabled, try cache-through pattern
    if (cacheOpts) {
      try {
        const cached = await cachedApiCall<T>(
          cacheKey,
          cacheOpts.ttlMs,
          async () => {
            return this.executeRequest<T>(method, path, params, trId);
          },
          {
            lruCache: this.lruCache as LRUCache<T>,
            diskCache: this.diskCache,
          }
        );

        const elapsed = Date.now() - startTime;
        return createToolResult(cached.data, {
          responseTimeMs: elapsed,
        });
      } catch (error) {
        return this.handleError<T>(error, startTime);
      }
    }

    // No caching — direct request with rate limiting
    try {
      const data = await this.executeRequest<T>(method, path, params, trId);
      const elapsed = Date.now() - startTime;
      return createToolResult(data, { responseTimeMs: elapsed });
    } catch (error) {
      return this.handleError<T>(error, startTime);
    }
  }

  /**
   * Get the auth manager (for tools that need base URL or credentials).
   */
  getAuthManager(): KISAuthManager {
    return this.auth;
  }

  /**
   * Execute a single HTTP request to KIS API with rate limiting.
   * Retries once on 401 (token expired).
   */
  private async executeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    trId: string
  ): Promise<T> {
    // Acquire rate limit token
    await this.rateLimiter.acquire();

    const result = await this.doFetch<T>(method, path, params, trId);

    // If 401, refresh token and retry once
    if (result.httpStatus === 401) {
      await this.auth.refreshToken();
      await this.rateLimiter.acquire();
      const retryResult = await this.doFetch<T>(method, path, params, trId);

      if (retryResult.httpStatus === 401) {
        throw new KISApiError(
          'AUTH_EXPIRED',
          'Token refresh failed. Check KIS_APP_KEY and KIS_APP_SECRET.',
          false
        );
      }

      return this.extractData<T>(retryResult);
    }

    return this.extractData<T>(result);
  }

  /**
   * Perform the actual HTTP fetch to KIS API.
   */
  private async doFetch<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    trId: string
  ): Promise<KISFetchResult<T>> {
    const token = await this.auth.getToken();
    const baseUrl = this.auth.baseUrl;

    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      appkey: this.auth.getAppKey(),
      appsecret: this.auth.getAppSecret(),
      tr_id: trId,
      'content-type': 'application/json; charset=utf-8',
    };

    let url: string;
    let fetchOptions: RequestInit;

    if (method === 'GET') {
      const queryString = new URLSearchParams(params).toString();
      url = queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;
      fetchOptions = { method, headers };
    } else {
      url = `${baseUrl}${path}`;
      fetchOptions = {
        method,
        headers,
        body: JSON.stringify(params),
      };
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok && response.status === 401) {
      return { httpStatus: 401, body: null };
    }

    if (!response.ok) {
      const body = await response.text();

      // KIS returns HTTP 500 (not 401) for token lifecycle errors.
      // Treat as 401 so executeRequest retries with a refreshed token.
      // Official error codes: https://apiportal.koreainvestment.com/faq-error-code
      if (
        body.includes('EGW00121') || // 유효하지 않은 token
        body.includes('EGW00122') || // token을 찾을 수 없습니다
        body.includes('EGW00123')    // 기간이 만료된 token
      ) {
        return { httpStatus: 401, body: null };
      }

      throw new KISApiError(
        'API_ERROR',
        `KIS API returned HTTP ${response.status}: ${body}`,
        response.status >= 500
      );
    }

    const body = (await response.json()) as KISApiResponse<T>;
    return { httpStatus: response.status, body };
  }

  /**
   * Extract data from a KIS API response, checking rt_cd for errors.
   */
  private extractData<T>(result: KISFetchResult<T>): T {
    const body = result.body;

    if (!body) {
      throw new KISApiError(
        'API_ERROR',
        'Empty response from KIS API',
        true
      );
    }

    // KIS uses rt_cd "0" for success
    if (body.rt_cd !== '0') {
      const isRateLimited =
        body.msg_cd === 'EGW00201' || body.msg1?.includes('초과');
      const errorCode = isRateLimited ? 'RATE_LIMITED' : 'API_ERROR';

      throw new KISApiError(
        errorCode,
        `KIS API error [${body.msg_cd}]: ${body.msg1}`,
        isRateLimited
      );
    }

    // Return the appropriate output field
    const data = body.output ?? body.output1;
    if (data === undefined) {
      throw new KISApiError(
        'PARSE_ERROR',
        `KIS API response missing output field. msg: ${body.msg1}`,
        false
      );
    }

    return data;
  }

  /**
   * Convert caught errors into ToolResult error responses.
   */
  private handleError<T>(error: unknown, startTime: number): ToolResult<T> {
    const elapsed = Date.now() - startTime;

    if (error instanceof KISApiError) {
      return createToolError<T>(
        error.code,
        error.message,
        'kis',
        error.retryable,
        elapsed
      );
    }

    // Network errors
    if (error instanceof TypeError && String(error.message).includes('fetch')) {
      return createToolError<T>(
        'NETWORK_ERROR',
        `Network error calling KIS API: ${error.message}`,
        'kis',
        true,
        elapsed
      );
    }

    // Unknown errors
    const message =
      error instanceof Error ? error.message : String(error);
    return createToolError<T>(
      'API_ERROR',
      `Unexpected KIS API error: ${message}`,
      'kis',
      false,
      elapsed
    );
  }
}

/**
 * Internal fetch result before error extraction.
 */
interface KISFetchResult<T> {
  readonly httpStatus: number;
  readonly body: KISApiResponse<T> | null;
}

/**
 * Typed error for KIS API failures.
 */
class KISApiError extends Error {
  constructor(
    readonly code:
      | 'RATE_LIMITED'
      | 'AUTH_EXPIRED'
      | 'NOT_FOUND'
      | 'API_ERROR'
      | 'NETWORK_ERROR'
      | 'PARSE_ERROR',
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'KISApiError';
  }
}
