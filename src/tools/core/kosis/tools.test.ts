import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KosisClient } from './client.js';
import { getKosisData, searchKosisTables } from './tools.js';

/**
 * Assign a mock to globalThis.fetch (Bun's fetch type requires preconnect not needed in tests)
 */
function setFetchMock<T extends object>(mockFn: T): T {
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  return mockFn;
}

/**
 * Create a mock fetch that returns the given body.
 */
function setupMockFetch(body: unknown, status = 200) {
  setFetchMock(mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  ));
}

// ---------------------------------------------------------------------------
// getKosisData
// ---------------------------------------------------------------------------

describe('getKosisData', () => {
  let client: KosisClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleDataResponse = [
    {
      TBL_NM: '인구총조사',
      TBL_ID: 'DT_1B040A3',
      PRD_DE: '2023',
      PRD_SE: 'Y',
      ITM_NM: '총인구',
      ITM_ID: 'T10',
      UNIT_NM: '명',
      DT: '51,740,000',
      C1_NM: '전국',
      C1: '00',
    },
    {
      TBL_NM: '인구총조사',
      TBL_ID: 'DT_1B040A3',
      PRD_DE: '2022',
      PRD_SE: 'Y',
      ITM_NM: '총인구',
      ITM_ID: 'T10',
      UNIT_NM: '명',
      DT: '51,628,000',
      C1_NM: '전국',
      C1: '00',
    },
  ];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kosis-data-test-'));
    client = new KosisClient({
      apiKey: 'test-kosis-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses data response correctly', async () => {
    setupMockFetch(sampleDataResponse);

    const result = await getKosisData(client, 'DT_1B040A3', {
      periodType: 'Y',
      startPeriod: '2022',
      endPeriod: '2023',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.tableId).toBe('DT_1B040A3');
    expect(data.tableName).toBe('인구총조사');
    expect(data.items).toHaveLength(2);
    expect(data.totalCount).toBe(2);
  });

  test('parses items with dimensions correctly', async () => {
    setupMockFetch(sampleDataResponse);

    const result = await getKosisData(client, 'DT_1B040A3');

    const item = result.data!.items[0];
    expect(item.itemName).toBe('총인구');
    expect(item.itemCode).toBe('T10');
    expect(item.period).toBe('2023');
    expect(item.periodType).toBe('Y');
    expect(item.value).toBe('51,740,000');
    expect(item.unit).toBe('명');
    expect(item.dimensions).toHaveLength(1);
    expect(item.dimensions[0].name).toBe('전국');
    expect(item.dimensions[0].code).toBe('00');
  });

  test('handles empty array response (no data)', async () => {
    setupMockFetch([]);

    const result = await getKosisData(client, 'DT_NONEXISTENT');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('handles KOSIS error response', async () => {
    setupMockFetch({
      err: 'AUTH',
      errMsg: 'apiKey 인증 오류입니다.',
    });

    const result = await getKosisData(client, 'DT_1B040A3');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_EXPIRED');
  });

  test('passes query parameters correctly', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify(sampleDataResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));

    await getKosisData(client, 'DT_1B040A3', {
      orgId: '101',
      periodType: 'Y',
      startPeriod: '2020',
      endPeriod: '2024',
    });

    expect(capturedUrl).toContain('tblId=DT_1B040A3');
    expect(capturedUrl).toContain('orgId=101');
    expect(capturedUrl).toContain('prdSe=Y');
    expect(capturedUrl).toContain('startPrdDe=2020');
    expect(capturedUrl).toContain('endPrdDe=2024');
    expect(capturedUrl).toContain('format=json');
  });

  test('defaults to newEstPrdCnt when no period specified', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify(sampleDataResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));

    await getKosisData(client, 'DT_1B040A3');

    expect(capturedUrl).toContain('newEstPrdCnt=5');
  });

  test('handles items without C2/C3 dimensions', async () => {
    setupMockFetch([{
      TBL_NM: '테스트',
      TBL_ID: 'DT_TEST',
      PRD_DE: '2024',
      PRD_SE: 'Y',
      ITM_NM: '항목',
      ITM_ID: 'T01',
      UNIT_NM: '건',
      DT: '100',
    }]);

    const result = await getKosisData(client, 'DT_TEST');

    expect(result.success).toBe(true);
    expect(result.data!.items[0].dimensions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// searchKosisTables
// ---------------------------------------------------------------------------

describe('searchKosisTables', () => {
  let client: KosisClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleTableListResponse = [
    {
      TBL_NM: '인구총조사',
      TBL_ID: 'DT_1B040A3',
      STAT_ID: '101',
      ORG_ID: '101',
      PRD_SE: 'Y',
      LIST_TOTAL_COUNT: '3',
    },
    {
      TBL_NM: '인구동향조사',
      TBL_ID: 'DT_1B8000F',
      STAT_ID: '101',
      ORG_ID: '101',
      PRD_SE: 'M',
      LIST_TOTAL_COUNT: '3',
    },
  ];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kosis-tables-test-'));
    client = new KosisClient({
      apiKey: 'test-kosis-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses table list response correctly', async () => {
    setupMockFetch(sampleTableListResponse);

    const result = await searchKosisTables(client, '인구');

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.totalCount).toBe(3);
    expect(data.tables).toHaveLength(2);

    expect(data.tables[0].tableId).toBe('DT_1B040A3');
    expect(data.tables[0].tableName).toBe('인구총조사');
    expect(data.tables[0].orgId).toBe('101');
    expect(data.tables[0].periodType).toBe('Y');
  });

  test('handles empty results', async () => {
    setupMockFetch([]);

    const result = await searchKosisTables(client, 'xyznonexistent');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('passes orgId filter', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify(sampleTableListResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));

    await searchKosisTables(client, '인구', '101');

    expect(capturedUrl).toContain('orgId=101');
    expect(capturedUrl).toContain('searchNm=');
  });
});
