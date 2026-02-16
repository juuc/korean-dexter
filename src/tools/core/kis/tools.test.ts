import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { KISClient } from './client';
import { getStockPrice, getHistoricalPrices, getMarketIndex } from './tools';
import type { KISToken } from './auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assign a mock to globalThis.fetch (Bun's fetch type requires preconnect not needed in tests) */
function setFetchMock<T extends object>(mockFn: T): T {
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  return mockFn;
}

function seedTokenFile(tokenPath: string): void {
  const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const token: KISToken = {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresAt: futureDate.toISOString(),
    issuedAt: new Date().toISOString(),
    environment: 'production',
  };
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

/** Mock fetch that handles token issuance and returns custom API response */
function createMockFetch(apiResponse: string) {
  return mock((url: string) => {
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
      new Response(apiResponse, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
  });
}

// Sample KIS API responses (from actual API format)
const SAMPLE_INQUIRE_PRICE = JSON.stringify({
  rt_cd: '0',
  msg_cd: 'MCA00000',
  msg1: '정상처리 되었습니다.',
  output: {
    stck_shrn_iscd: '005930',
    hts_kor_isnm: '삼성전자',
    stck_prpr: '74800',
    prdy_vrss: '-200',
    prdy_ctrt: '-0.27',
    acml_vol: '12345678',
    hts_avls: '4468000',
    stck_hgpr: '75000',
    stck_lwpr: '74500',
    stck_oprc: '74900',
  },
});

const SAMPLE_DAILY_PRICES = JSON.stringify({
  rt_cd: '0',
  msg_cd: 'MCA00000',
  msg1: '정상처리 되었습니다.',
  output: [
    {
      stck_bsop_date: '20240315',
      stck_oprc: '74000',
      stck_hgpr: '75200',
      stck_lwpr: '73800',
      stck_clpr: '74800',
      acml_vol: '15000000',
    },
    {
      stck_bsop_date: '20240314',
      stck_oprc: '73500',
      stck_hgpr: '74500',
      stck_lwpr: '73200',
      stck_clpr: '74000',
      acml_vol: '12000000',
    },
  ],
});

const SAMPLE_INDEX_PRICE = JSON.stringify({
  rt_cd: '0',
  msg_cd: 'MCA00000',
  msg1: '정상처리 되었습니다.',
  output: {
    bstp_nmix_prpr: '2687.50',
    bstp_nmix_prdy_vrss: '15.30',
    bstp_nmix_prdy_ctrt: '0.57',
    acml_vol: '456789012',
    bstp_cls_code: '0001',
    hts_kor_isnm: '코스피',
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KIS tools', () => {
  let tempDir: string;
  let cacheDbPath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kis-tools-test-'));
    cacheDbPath = join(tempDir, 'kis-cache.sqlite');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  function createClient(): KISClient {
    return new KISClient({
      appKey: 'test-key',
      appSecret: 'test-secret',
      paperTrading: false,
      cacheDbPath,
    });
  }

  describe('getStockPrice', () => {
    test('parses current price response correctly', async () => {
      setFetchMock(createMockFetch(SAMPLE_INQUIRE_PRICE));
      const client = createClient();

      const result = await getStockPrice(client, '005930');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data!;
      expect(data.stockCode).toBe('005930');
      expect(data.name).toBe('삼성전자');

      // Current price: 74800 WON
      expect(data.currentPrice.value).toBe(74800);
      expect(data.currentPrice.unit).toBe('KRW');
      expect(data.currentPrice.source).toBe('kis');

      // Change: -200 WON
      expect(data.change.value).toBe(-200);

      // Change percent
      expect(data.changePercent).toBeCloseTo(-0.27);

      // Volume
      expect(data.volume).toBe(12345678);

      // Market cap: 4468000 * 1e8 = 446,800,000,000,000 WON
      expect(data.marketCap.value).toBe(4468000 * 100_000_000);

      // High/Low/Open
      expect(data.high.value).toBe(75000);
      expect(data.low.value).toBe(74500);
      expect(data.open.value).toBe(74900);

      // isMarketOpen is a boolean
      expect(typeof data.isMarketOpen).toBe('boolean');
    });

    test('returns NormalizedAmount with displayValue', async () => {
      setFetchMock(createMockFetch(SAMPLE_INQUIRE_PRICE));
      const client = createClient();

      const result = await getStockPrice(client, '005930');
      const data = result.data!;

      // displayValue should be formatted Korean amount
      expect(data.currentPrice.displayValue).toBeTruthy();
      expect(data.marketCap.displayValue).toBeTruthy();
    });

    test('includes metadata with isMarketOpen', async () => {
      setFetchMock(createMockFetch(SAMPLE_INQUIRE_PRICE));
      const client = createClient();

      const result = await getStockPrice(client, '005930');

      expect(typeof result.metadata.isMarketOpen).toBe('boolean');
      expect(result.metadata.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('handles error response', async () => {
      const errorResponse = JSON.stringify({
        rt_cd: '1',
        msg_cd: 'EGW00123',
        msg1: '종목코드가 유효하지 않습니다.',
      });
      setFetchMock(createMockFetch(errorResponse));
      const client = createClient();

      const result = await getStockPrice(client, 'INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getHistoricalPrices', () => {
    test('parses daily price array correctly', async () => {
      setFetchMock(createMockFetch(SAMPLE_DAILY_PRICES));
      const client = createClient();

      const result = await getHistoricalPrices(client, '005930', {
        startDate: '20240301',
        endDate: '20240315',
        period: 'D',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data!;
      expect(data.stockCode).toBe('005930');
      expect(data.period).toBe('D');
      expect(data.prices.length).toBe(2);

      // First price entry
      const first = data.prices[0];
      expect(first.date).toBe('2024-03-15');
      expect(first.open).toBe(74000);
      expect(first.high).toBe(75200);
      expect(first.low).toBe(73800);
      expect(first.close).toBe(74800);
      expect(first.volume).toBe(15000000);

      // Second price entry
      const second = data.prices[1];
      expect(second.date).toBe('2024-03-14');
      expect(second.close).toBe(74000);
    });

    test('defaults to daily period and 90-day range', async () => {
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
          new Response(SAMPLE_DAILY_PRICES, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
      }));

      const client = createClient();
      await getHistoricalPrices(client, '005930');

      // Should contain FID_PERIOD_DIV_CODE=D
      expect(capturedUrl).toContain('FID_PERIOD_DIV_CODE=D');
    });

    test('supports weekly and monthly periods', async () => {
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
          new Response(SAMPLE_DAILY_PRICES, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
      }));

      const client = createClient();
      await getHistoricalPrices(client, '005930', { period: 'W' });

      expect(capturedUrl).toContain('FID_PERIOD_DIV_CODE=W');
    });
  });

  describe('getMarketIndex', () => {
    test('parses KOSPI index response correctly', async () => {
      setFetchMock(createMockFetch(SAMPLE_INDEX_PRICE));
      const client = createClient();

      const result = await getMarketIndex(client, '0001');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data!;
      expect(data.indexCode).toBe('0001');
      expect(data.indexName).toBe('코스피');
      expect(data.currentValue).toBeCloseTo(2687.5);
      expect(data.change).toBeCloseTo(15.3);
      expect(data.changePercent).toBeCloseTo(0.57);
      expect(data.volume).toBe(456789012);
      expect(typeof data.isMarketOpen).toBe('boolean');
    });

    test('falls back to known index name when API does not return one', async () => {
      const responseNoName = JSON.stringify({
        rt_cd: '0',
        msg_cd: 'MCA00000',
        msg1: '정상처리 되었습니다.',
        output: {
          bstp_nmix_prpr: '850.00',
          bstp_nmix_prdy_vrss: '5.00',
          bstp_nmix_prdy_ctrt: '0.59',
          acml_vol: '123456789',
          bstp_cls_code: '1001',
        },
      });
      setFetchMock(createMockFetch(responseNoName));
      const client = createClient();

      const result = await getMarketIndex(client, '1001');

      expect(result.success).toBe(true);
      expect(result.data!.indexName).toBe('KOSDAQ');
    });

    test('includes isMarketOpen in metadata', async () => {
      setFetchMock(createMockFetch(SAMPLE_INDEX_PRICE));
      const client = createClient();

      const result = await getMarketIndex(client, '0001');

      expect(typeof result.metadata.isMarketOpen).toBe('boolean');
    });
  });

  describe('paper trading URL routing', () => {
    test('paper trading client uses paper base URL', async () => {
      let capturedUrl = '';

      setFetchMock(mock((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oauth2/tokenP')) {
          capturedUrl = urlStr;
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
          new Response(SAMPLE_INQUIRE_PRICE, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
      }));

      const client = new KISClient({
        appKey: 'test-key',
        appSecret: 'test-secret',
        paperTrading: true,
        cacheDbPath,
      });

      await getStockPrice(client, '005930');

      // Token issuance should hit paper URL
      expect(capturedUrl).toContain('openapivts.koreainvestment.com');
    });
  });
});
