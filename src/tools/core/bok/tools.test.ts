import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BokClient } from './client.js';
import {
  getEconomicIndicator,
  getKeyStatisticsList,
  searchStatisticTables,
} from './tools.js';

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
// getEconomicIndicator
// ---------------------------------------------------------------------------

describe('getEconomicIndicator', () => {
  let client: BokClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleStatResponse = {
    StatisticSearch: {
      list_total_count: 3,
      row: [
        {
          STAT_CODE: '722Y001',
          STAT_NAME: '한국은행 기준금리',
          ITEM_CODE1: '0101000',
          ITEM_NAME1: '한국은행 기준금리',
          ITEM_CODE2: '',
          ITEM_NAME2: '',
          ITEM_CODE3: '',
          ITEM_NAME3: '',
          ITEM_CODE4: '',
          ITEM_NAME4: '',
          UNIT_NAME: '% ',
          TIME: '202401',
          DATA_VALUE: '3.50',
        },
        {
          STAT_CODE: '722Y001',
          STAT_NAME: '한국은행 기준금리',
          ITEM_CODE1: '0101000',
          ITEM_NAME1: '한국은행 기준금리',
          ITEM_CODE2: '',
          ITEM_NAME2: '',
          ITEM_CODE3: '',
          ITEM_NAME3: '',
          ITEM_CODE4: '',
          ITEM_NAME4: '',
          UNIT_NAME: '% ',
          TIME: '202402',
          DATA_VALUE: '3.50',
        },
        {
          STAT_CODE: '722Y001',
          STAT_NAME: '한국은행 기준금리',
          ITEM_CODE1: '0101000',
          ITEM_NAME1: '한국은행 기준금리',
          ITEM_CODE2: '',
          ITEM_NAME2: '',
          ITEM_CODE3: '',
          ITEM_NAME3: '',
          ITEM_CODE4: '',
          ITEM_NAME4: '',
          UNIT_NAME: '% ',
          TIME: '202403',
          DATA_VALUE: '3.50',
        },
      ],
    },
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bok-tools-test-'));
    client = new BokClient({
      apiKey: 'test-bok-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses indicator response correctly', async () => {
    setupMockFetch(sampleStatResponse);

    const result = await getEconomicIndicator(
      client, '722Y001', '0101000', 'M', '202401', '202403'
    );

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.statCode).toBe('722Y001');
    expect(data.statName).toBe('한국은행 기준금리');
    expect(data.itemName).toBe('한국은행 기준금리');
    expect(data.unit).toBe('% ');
    expect(data.values).toHaveLength(3);
  });

  test('parses time series values correctly', async () => {
    setupMockFetch(sampleStatResponse);

    const result = await getEconomicIndicator(
      client, '722Y001', '0101000', 'M', '202401', '202403'
    );

    const values = result.data!.values;

    expect(values[0].value).toBe(3.5);
    expect(values[0].displayValue).toBe('3.50');
    expect(values[0].period.type).toBe('monthly');
    expect(values[0].period.year).toBe(2024);
    expect(values[0].period.month).toBe(1);

    expect(values[2].period.month).toBe(3);
  });

  test('handles BOK error response (no data)', async () => {
    setupMockFetch({
      RESULT: {
        CODE: 'INFO-200',
        MESSAGE: '해당하는 데이터가 없습니다.',
      },
    });

    const result = await getEconomicIndicator(
      client, '999Y999', '0000000', 'M', '202401', '202403'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('handles empty row array', async () => {
    setupMockFetch({
      StatisticSearch: {
        list_total_count: 0,
        row: [],
      },
    });

    const result = await getEconomicIndicator(
      client, '722Y001', '0101000', 'M', '202401', '202403'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('handles non-numeric DATA_VALUE', async () => {
    setupMockFetch({
      StatisticSearch: {
        list_total_count: 1,
        row: [{
          STAT_CODE: '722Y001',
          STAT_NAME: '한국은행 기준금리',
          ITEM_CODE1: '0101000',
          ITEM_NAME1: '한국은행 기준금리',
          ITEM_CODE2: '',
          ITEM_NAME2: '',
          ITEM_CODE3: '',
          ITEM_NAME3: '',
          ITEM_CODE4: '',
          ITEM_NAME4: '',
          UNIT_NAME: '%',
          TIME: '202401',
          DATA_VALUE: '-',
        }],
      },
    });

    const result = await getEconomicIndicator(
      client, '722Y001', '0101000', 'M', '202401', '202401'
    );

    expect(result.success).toBe(true);
    expect(result.data!.values[0].value).toBe(null);
    expect(result.data!.values[0].displayValue).toBe('N/A');
  });

  test('builds URL with correct path segments', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify(sampleStatResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));

    await getEconomicIndicator(
      client, '722Y001', '0101000', 'M', '202401', '202403'
    );

    expect(capturedUrl).toContain('/StatisticSearch/');
    expect(capturedUrl).toContain('/json/kr/');
    expect(capturedUrl).toContain('/722Y001/M/202401/202403/0101000');
  });
});

// ---------------------------------------------------------------------------
// getKeyStatisticsList
// ---------------------------------------------------------------------------

describe('getKeyStatisticsList', () => {
  let client: BokClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleKeyStatsResponse = {
    KeyStatisticList: {
      list_total_count: 2,
      row: [
        {
          CLASS_NAME: '금리',
          KEYSTAT_NAME: '한국은행 기준금리',
          DATA_VALUE: '3.50',
          CYCLE: 'D',
          UNIT_NAME: '%',
          TIME: '20240301',
        },
        {
          CLASS_NAME: '환율',
          KEYSTAT_NAME: '원/달러 환율',
          DATA_VALUE: '1,330.50',
          CYCLE: 'D',
          UNIT_NAME: '원',
          TIME: '20240301',
        },
      ],
    },
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bok-keystats-test-'));
    client = new BokClient({
      apiKey: 'test-bok-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses key statistics response correctly', async () => {
    setupMockFetch(sampleKeyStatsResponse);

    const result = await getKeyStatisticsList(client);

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.totalCount).toBe(2);
    expect(data.items).toHaveLength(2);

    expect(data.items[0].className).toBe('금리');
    expect(data.items[0].name).toBe('한국은행 기준금리');
    expect(data.items[0].value).toBe('3.50');
    expect(data.items[0].unit).toBe('%');

    expect(data.items[1].className).toBe('환율');
    expect(data.items[1].name).toBe('원/달러 환율');
  });

  test('handles error response', async () => {
    setupMockFetch({
      RESULT: {
        CODE: 'ERROR-500',
        MESSAGE: '인증키가 유효하지 않습니다.',
      },
    });

    const result = await getKeyStatisticsList(client);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// searchStatisticTables
// ---------------------------------------------------------------------------

describe('searchStatisticTables', () => {
  let client: BokClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleTableListResponse = {
    StatisticTableList: {
      list_total_count: 2,
      row: [
        {
          STAT_CODE: '722Y001',
          STAT_NAME: '한국은행 기준금리',
          CYCLE: 'DD',
          SRCH_YN: 'Y',
          ORG_NAME: '한국은행',
        },
        {
          STAT_CODE: '731Y003',
          STAT_NAME: '주요국 통화의 대원화환율',
          CYCLE: 'DD',
          SRCH_YN: 'Y',
          ORG_NAME: '한국은행',
        },
      ],
    },
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bok-tables-test-'));
    client = new BokClient({
      apiKey: 'test-bok-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses table list response correctly', async () => {
    setupMockFetch(sampleTableListResponse);

    const result = await searchStatisticTables(client, '금리');

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.totalCount).toBe(2);
    expect(data.tables).toHaveLength(2);

    expect(data.tables[0].statCode).toBe('722Y001');
    expect(data.tables[0].statName).toBe('한국은행 기준금리');
    expect(data.tables[0].searchable).toBe(true);
    expect(data.tables[0].orgName).toBe('한국은행');
  });

  test('handles no results', async () => {
    setupMockFetch({
      RESULT: {
        CODE: 'INFO-200',
        MESSAGE: '해당하는 데이터가 없습니다.',
      },
    });

    const result = await searchStatisticTables(client, 'xyznonexistent');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('URL-encodes Korean search query', async () => {
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

    await searchStatisticTables(client, '금리');

    expect(capturedUrl).toContain('/StatisticTableList/');
    expect(capturedUrl).toContain(encodeURIComponent('금리'));
  });
});
