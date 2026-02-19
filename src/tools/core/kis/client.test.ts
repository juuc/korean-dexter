import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { KISClient } from './client';
import type { KISToken } from './auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assign a mock to globalThis.fetch (Bun's fetch type requires preconnect not needed in tests) */
function setFetchMock<T extends object>(mockFn: T): T {
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  return mockFn;
}

/**
 * Create a valid token file so KISClient skips real token issuance.
 */
function seedTokenFile(tokenPath: string): void {
  const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const token: KISToken = {
    accessToken: 'test-access-token',
    tokenType: 'Bearer',
    expiresAt: futureDate.toISOString(),
    issuedAt: new Date().toISOString(),
    environment: 'production',
  };
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

/**
 * Build a mock KIS API success response.
 */
function kisSuccessResponse<T>(output: T): string {
  return JSON.stringify({
    rt_cd: '0',
    msg_cd: 'MCA00000',
    msg1: '정상처리 되었습니다.',
    output,
  });
}

/**
 * Build a mock KIS API error response.
 */
function kisErrorResponse(msgCd: string, msg1: string): string {
  return JSON.stringify({
    rt_cd: '1',
    msg_cd: msgCd,
    msg1,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KISClient', () => {
  let tempDir: string;
  let tokenPath: string;
  let cacheDbPath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kis-client-test-'));
    tokenPath = join(tempDir, 'kis-token.json');
    cacheDbPath = join(tempDir, 'kis-cache.sqlite');
    seedTokenFile(tokenPath);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  function createClient(): KISClient {
    return new KISClient({
      appKey: 'test-app-key',
      appSecret: 'test-app-secret',
      paperTrading: false,
      cacheDbPath,
      tokenCachePath: tokenPath,
    });
  }

  function createClientWithToken(): KISClient {
    return new KISClient({
      appKey: 'test-app-key',
      appSecret: 'test-app-secret',
      paperTrading: false,
      cacheDbPath,
      tokenCachePath: tokenPath,
    });
  }

  describe('request headers', () => {
    test('includes all required KIS headers', async () => {
      const fetchMock = mock((url: string, options: RequestInit) => {
        // First call might be token issuance, second is the actual API call
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        // Verify headers on the actual API request
        const headers = options.headers as Record<string, string>;
        expect(headers.authorization).toContain('Bearer');
        expect(headers.appkey).toBe('test-app-key');
        expect(headers.appsecret).toBe('test-app-secret');
        expect(headers.tr_id).toBe('FHKST01010100');
        expect(headers['content-type']).toBe('application/json; charset=utf-8');

        return Promise.resolve(
          new Response(
            kisSuccessResponse({ stck_prpr: '74800' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      });
      setFetchMock(fetchMock);

      const client = createClientWithToken();
      await client.request(
        'GET',
        '/uapi/domestic-stock/v1/quotations/inquire-price',
        { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: '005930' },
        { trId: 'FHKST01010100' }
      );
    });
  });

  describe('GET request', () => {
    test('appends query params to URL', async () => {
      let capturedUrl = '';

      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        capturedUrl = urlStr;
        return Promise.resolve(
          new Response(
            kisSuccessResponse({ value: 'test' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      await client.request(
        'GET',
        '/api/test',
        { param1: 'value1', param2: 'value2' },
        { trId: 'TEST' }
      );

      expect(capturedUrl).toContain('param1=value1');
      expect(capturedUrl).toContain('param2=value2');
    });
  });

  describe('error handling', () => {
    test('handles KIS rt_cd "1" error response', async () => {
      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        return Promise.resolve(
          new Response(
            kisErrorResponse('EGW00123', '종목코드가 유효하지 않습니다.'),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      const result = await client.request(
        'GET',
        '/api/test',
        { FID_INPUT_ISCD: 'INVALID' },
        { trId: 'TEST' }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('API_ERROR');
      expect(result.error?.message).toContain('EGW00123');
      expect(result.error?.apiSource).toBe('kis');
    });

    test('handles KIS rate limit error (EGW00201)', async () => {
      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        return Promise.resolve(
          new Response(
            kisErrorResponse('EGW00201', '초당 거래건수를 초과하였습니다.'),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      const result = await client.request(
        'GET',
        '/api/test',
        {},
        { trId: 'TEST' }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMITED');
      expect(result.error?.retryable).toBe(true);
    });

    test('retries once on HTTP 401 (token expired)', async () => {
      let callCount = 0;

      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'refreshed-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        callCount++;
        if (callCount === 1) {
          // First call returns 401
          return Promise.resolve(new Response('Unauthorized', { status: 401 }));
        }

        // Retry succeeds
        return Promise.resolve(
          new Response(
            kisSuccessResponse({ data: 'success' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      const result = await client.request<{ data: string }>(
        'GET',
        '/api/test',
        {},
        { trId: 'TEST' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.data).toBe('success');
      expect(callCount).toBe(2); // First 401 + retry
    });
  });

  describe('success response', () => {
    test('returns ToolResult with data on success', async () => {
      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        return Promise.resolve(
          new Response(
            kisSuccessResponse({
              stck_prpr: '74800',
              prdy_vrss: '-200',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      const result = await client.request<{ stck_prpr: string; prdy_vrss: string }>(
        'GET',
        '/api/price',
        { symbol: '005930' },
        { trId: 'FHKST01010100' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.stck_prpr).toBe('74800');
      expect(result.data?.prdy_vrss).toBe('-200');
      expect(result.metadata.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('caching', () => {
    test('caches response and returns from cache on second call', async () => {
      let apiCallCount = 0;

      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'mock-token',
                access_token_token_expired: '2030-12-31 23:59:59',
                token_type: 'Bearer',
                expires_in: 86400,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }

        apiCallCount++;
        return Promise.resolve(
          new Response(
            kisSuccessResponse({ value: 'cached-data' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }));

      const client = createClientWithToken();
      const cacheOptions = { ttlMs: 60000 };

      // First call — cache miss
      const result1 = await client.request(
        'GET',
        '/api/test',
        { param: 'value' },
        { trId: 'TEST', cacheOptions }
      );
      expect(result1.success).toBe(true);

      // Second call — should come from cache
      const result2 = await client.request(
        'GET',
        '/api/test',
        { param: 'value' },
        { trId: 'TEST', cacheOptions }
      );
      expect(result2.success).toBe(true);

      // Only 1 API call (token issuance calls don't count)
      expect(apiCallCount).toBe(1);
    });
  });
});
