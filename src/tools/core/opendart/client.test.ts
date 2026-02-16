import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenDartClient } from './client.js';

/**
 * Create a mock fetch response.
 */
function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Assign a mock to globalThis.fetch (Bun's fetch type requires preconnect not needed in tests)
 */
function setFetchMock<T extends object>(mockFn: T): T {
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  return mockFn;
}

describe('OpenDartClient', () => {
  let client: OpenDartClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opendart-test-'));
    client = new OpenDartClient({
      apiKey: 'test-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('constructor throws without API key', () => {
    // Temporarily clear the env var
    const origKey = process.env.OPENDART_API_KEY;
    delete process.env.OPENDART_API_KEY;

    try {
      expect(() => new OpenDartClient()).toThrow('OpenDART API key is required');
    } finally {
      if (origKey !== undefined) {
        process.env.OPENDART_API_KEY = origKey;
      }
    }
  });

  test('successful response (status 000) returns data', async () => {
    const mockBody = {
      status: '000',
      message: '정상',
      list: [{ account_nm: '매출액', thstrm_amount: '1,000,000' }],
    };

    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request<typeof mockBody>(
      'fnlttSinglAcnt',
      { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' }
    );

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);
    expect(result.data?.status).toBe('000');
    expect(result.data?.list).toHaveLength(1);
    expect(result.metadata.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('DART error 010 maps to AUTH_EXPIRED', async () => {
    const mockBody = { status: '010', message: '등록되지 않은 인증키' };
    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_EXPIRED');
    expect(result.error?.retryable).toBe(false);
    expect(result.error?.apiSource).toBe('opendart');
  });

  test('DART error 011 maps to NOT_FOUND', async () => {
    const mockBody = { status: '011', message: '조회된 데이터가 없습니다' };
    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '99999999',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.retryable).toBe(false);
  });

  test('DART error 013 maps to NOT_FOUND', async () => {
    const mockBody = { status: '013', message: '해당 기간 데이터 없음' };
    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2030',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.retryable).toBe(false);
  });

  test('DART error 020 maps to RATE_LIMITED (retryable)', async () => {
    const mockBody = { status: '020', message: '요청 제한 초과' };
    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMITED');
    expect(result.error?.retryable).toBe(true);
  });

  test('DART error 800 maps to API_ERROR (retryable)', async () => {
    const mockBody = { status: '800', message: '시스템 오류' };
    setFetchMock(mock(() => Promise.resolve(mockFetchResponse(mockBody))));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('API_ERROR');
    expect(result.error?.retryable).toBe(true);
  });

  test('HTTP error returns NETWORK_ERROR', async () => {
    setFetchMock(mock(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    ));

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(result.error?.retryable).toBe(true);
  });

  test('API key is injected into request URL', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        mockFetchResponse({ status: '000', message: '정상', list: [] })
      );
    }));

    await client.request('company', { corp_code: '00126380' });

    expect(capturedUrl).toContain('crtfc_key=test-api-key');
    expect(capturedUrl).toContain('corp_code=00126380');
    expect(capturedUrl).toContain('/api/company.json');
  });

  test('caching returns cached result on second call', async () => {
    let fetchCount = 0;
    const mockBody = {
      status: '000',
      message: '정상',
      list: [{ account_nm: '매출액' }],
    };

    setFetchMock(mock(() => {
      fetchCount++;
      return Promise.resolve(mockFetchResponse(mockBody));
    }));

    // First call — cache miss
    const result1 = await client.request(
      'fnlttSinglAcnt',
      { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' },
      { ttlMs: 60_000 }
    );
    expect(result1.success).toBe(true);
    expect(fetchCount).toBe(1);

    // Second call — cache hit (fetch should not be called again)
    const result2 = await client.request(
      'fnlttSinglAcnt',
      { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' },
      { ttlMs: 60_000 }
    );
    expect(result2.success).toBe(true);
    expect(fetchCount).toBe(1); // Still 1 — served from cache
  });

  test('network failure returns NETWORK_ERROR', async () => {
    setFetchMock(mock(() =>
      Promise.reject(new Error('Network connection failed'))
    ));

    const result = await client.request('company', { corp_code: '00126380' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(result.error?.message).toContain('Network connection failed');
  });

  test('getRateLimiterStatus returns status object', () => {
    const status = client.getRateLimiterStatus();
    expect(status.dailyUsed).toBeGreaterThanOrEqual(0);
    expect(status.dailyRemaining).toBeGreaterThan(0);
    expect(typeof status.dailyPercentUsed).toBe('number');
    expect(typeof status.isNearLimit).toBe('boolean');
  });
});
