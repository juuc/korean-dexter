import { createToolResult, createToolError, type ToolResult } from '@/shared/types.js';
import type { FixtureSet } from './types.js';
import { findFixtureResponse } from './loader.js';
import type { DartClientLike } from '@/tools/core/opendart/client.js';
import type { KisClientLike } from '@/tools/core/kis/client.js';

/**
 * Mock OpenDartClient that returns fixture data instead of making real API calls.
 */
export class MockOpenDartClient implements DartClientLike {
  constructor(private readonly fixtureSets: Map<string, FixtureSet>) {}

  async request<T>(
    endpoint: string,
    params: Record<string, string>,
    _cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string }
  ): Promise<ToolResult<T>> {
    // Extract corp_code from params to find the right fixture set
    const corpCode = params.corp_code;

    if (!corpCode) {
      return createToolError<T>(
        'NOT_FOUND',
        'corp_code parameter is required',
        'opendart',
        false,
        0
      );
    }

    const fixtureSet = this.fixtureSets.get(corpCode);

    if (!fixtureSet) {
      return createToolError<T>(
        'NOT_FOUND',
        `No fixture data found for corp_code: ${corpCode}`,
        'opendart',
        false,
        0
      );
    }

    const response = findFixtureResponse(fixtureSet, endpoint, params);

    if (response === null) {
      return createToolError<T>(
        'NOT_FOUND',
        `No matching fixture response found for endpoint: ${endpoint} with params: ${JSON.stringify(params)}`,
        'opendart',
        false,
        0
      );
    }

    return createToolResult<T>(response as T, { responseTimeMs: 0 });
  }

  close(): void {
    // No-op for mock client
  }

  getRateLimiterStatus() {
    return {
      remainingDaily: 10000,
      remainingPerSecond: 100,
    };
  }
}

/**
 * Mock KISClient that returns fixture data instead of making real API calls.
 */
export class MockKISClient implements KisClientLike {
  constructor(private readonly fixtureSets: Map<string, FixtureSet>) {}

  async request<T>(
    _method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    _options?: {
      readonly trId: string;
      readonly cacheOptions?: { readonly ttlMs: number | null; readonly cacheKey?: string };
    }
  ): Promise<ToolResult<T>> {
    // For KIS, we need to determine corp_code from context
    // In practice, this would come from a ticker symbol lookup
    // For now, we'll check if params contain a stock code
    const stockCode = params.FID_INPUT_ISCD || params.fid_input_iscd;

    if (!stockCode) {
      return createToolError<T>(
        'NOT_FOUND',
        'Stock code parameter is required (FID_INPUT_ISCD or fid_input_iscd)',
        'kis',
        false,
        0
      );
    }

    // Try to find a fixture set that has a matching response for this path
    // This is a simplified approach - in practice, you'd need a mapping from stock codes to corp codes
    let response: unknown = null;

    for (const fixtureSet of this.fixtureSets.values()) {
      const found = findFixtureResponse(fixtureSet, path, params);
      if (found !== null) {
        response = found;
        break;
      }
    }

    if (response === null) {
      return createToolError<T>(
        'NOT_FOUND',
        `No matching fixture response found for path: ${path} with params: ${JSON.stringify(params)}`,
        'kis',
        false,
        0
      );
    }

    return createToolResult<T>(response as T, { responseTimeMs: 0 });
  }

  getAuthManager() {
    return {
      baseUrl: 'https://openapi.koreainvestment.com:9443',
      getAppKey: () => 'mock_app_key',
      getAppSecret: () => 'mock_app_secret',
      getToken: async () => 'mock_token',
      refreshToken: async () => {},
    };
  }
}

/**
 * Create a mock OpenDartClient from fixture sets.
 */
export function createMockOpenDartClient(
  fixtureSets: Map<string, FixtureSet>
): DartClientLike {
  return new MockOpenDartClient(fixtureSets);
}

/**
 * Create a mock KISClient from fixture sets.
 */
export function createMockKISClient(
  fixtureSets: Map<string, FixtureSet>
): KisClientLike {
  return new MockKISClient(fixtureSets);
}
