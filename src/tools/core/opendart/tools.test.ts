import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenDartClient } from './client.js';
import {
  getFinancialStatements,
  getCompanyInfo,
  getDisclosures,
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

/**
 * Create a mock fetch that returns different responses based on call order.
 */
function setupSequentialMockFetch(responses: readonly unknown[]) {
  let callIndex = 0;
  setFetchMock(mock(() => {
    const body = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }));
}

describe('getFinancialStatements', () => {
  let client: OpenDartClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleDartResponse = {
    status: '000',
    message: '정상',
    list: [
      {
        rcept_no: '20240315000123',
        corp_code: '00126380',
        corp_name: '삼성전자',
        stock_code: '005930',
        reprt_code: '11011',
        bsns_year: '2024',
        fs_div: 'CFS',
        sj_div: 'IS',
        account_nm: '매출액',
        thstrm_nm: '제 56 기',
        thstrm_amount: '258,935,543,000,000',
        frmtrm_nm: '제 55 기',
        frmtrm_amount: '258,168,553,000,000',
        bfefrmtrm_nm: '제 54 기',
        bfefrmtrm_amount: '302,231,350,000,000',
        ord: '1',
      },
      {
        rcept_no: '20240315000123',
        corp_code: '00126380',
        corp_name: '삼성전자',
        stock_code: '005930',
        reprt_code: '11011',
        bsns_year: '2024',
        fs_div: 'CFS',
        sj_div: 'IS',
        account_nm: '영업이익',
        thstrm_nm: '제 56 기',
        thstrm_amount: '6,566,979,000,000',
        frmtrm_nm: '제 55 기',
        frmtrm_amount: '36,838,261,000,000',
        bfefrmtrm_nm: '제 54 기',
        bfefrmtrm_amount: '51,630,000,000,000',
        ord: '2',
      },
      {
        rcept_no: '20240315000123',
        corp_code: '00126380',
        corp_name: '삼성전자',
        stock_code: '005930',
        reprt_code: '11011',
        bsns_year: '2024',
        fs_div: 'CFS',
        sj_div: 'BS',
        account_nm: '자산총계',
        thstrm_nm: '제 56 기',
        thstrm_amount: '455,905,309,000,000',
        frmtrm_nm: '제 55 기',
        frmtrm_amount: '426,612,596,000,000',
        bfefrmtrm_nm: '제 54 기',
        bfefrmtrm_amount: '448,401,579,000,000',
        ord: '3',
      },
    ],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opendart-tools-test-'));
    client = new OpenDartClient({
      apiKey: 'test-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses sample financial response correctly', async () => {
    setupMockFetch(sampleDartResponse);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.corpCode).toBe('00126380');
    expect(data.corpName).toBe('삼성전자');
    expect(data.fsDiv).toBe('CFS');
    expect(data.items).toHaveLength(3);

    // Check period
    expect(data.period.type).toBe('annual');
    expect(data.period.year).toBe(2024);
    expect(data.period.startDate).toBe('2024-01-01');
    expect(data.period.endDate).toBe('2024-12-31');
  });

  test('normalizes account names in items', async () => {
    setupMockFetch(sampleDartResponse);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    const data = result.data!;

    // Revenue
    expect(data.items[0].accountName).toBe('매출액');
    expect(data.items[0].normalizedCategory).toBe('revenue');

    // Operating Income
    expect(data.items[1].accountName).toBe('영업이익');
    expect(data.items[1].normalizedCategory).toBe('operating_income');

    // Total Assets
    expect(data.items[2].accountName).toBe('자산총계');
    expect(data.items[2].normalizedCategory).toBe('total_assets');
  });

  test('parses NormalizedAmount values correctly', async () => {
    setupMockFetch(sampleDartResponse);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    const revenueItem = result.data!.items[0];

    // Current amount: 258,935,543,000,000 WON
    expect(revenueItem.currentAmount.value).toBe(258_935_543_000_000);
    expect(revenueItem.currentAmount.unit).toBe('KRW');
    expect(revenueItem.currentAmount.scale).toBe('jo');
    expect(revenueItem.currentAmount.source).toBe('opendart');
    expect(revenueItem.currentAmount.isEstimate).toBe(false);
    expect(revenueItem.currentAmount.displayValue).toContain('조원');

    // Previous amount: 258,168,553,000,000 WON
    expect(revenueItem.previousAmount.value).toBe(258_168_553_000_000);
    expect(revenueItem.previousAmount.scale).toBe('jo');
  });

  test('consolidated fallback: CFS empty -> OFS returned', async () => {
    const cfsNotFound = { status: '013', message: '해당 기간 데이터 없음' };
    const ofsResponse = {
      ...sampleDartResponse,
      list: sampleDartResponse.list.map((item) => ({
        ...item,
        fs_div: 'OFS',
      })),
    };

    setupSequentialMockFetch([cfsNotFound, ofsResponse]);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    expect(result.success).toBe(true);
    expect(result.data?.fsDiv).toBe('OFS');
    expect(result.metadata.fsDiv).toBe('OFS');
  });

  test('explicit OFS does not fall back to CFS', async () => {
    const ofsNotFound = { status: '013', message: '해당 기간 데이터 없음' };
    setupMockFetch(ofsNotFound);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011', 'OFS'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('handles empty list in response', async () => {
    setupMockFetch({ status: '000', message: '정상', list: [] });

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('metadata includes fsDiv', async () => {
    setupMockFetch(sampleDartResponse);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    expect(result.metadata.fsDiv).toBe('CFS');
  });

  test('handles null/missing amounts gracefully', async () => {
    const responseWithNulls = {
      status: '000',
      message: '정상',
      list: [
        {
          rcept_no: '20240315000123',
          corp_code: '00126380',
          corp_name: '삼성전자',
          stock_code: '005930',
          reprt_code: '11011',
          bsns_year: '2024',
          fs_div: 'CFS',
          sj_div: 'IS',
          account_nm: '매출액',
          thstrm_nm: '제 56 기',
          thstrm_amount: '',
          frmtrm_nm: '제 55 기',
          frmtrm_amount: '-',
          bfefrmtrm_nm: '제 54 기',
          bfefrmtrm_amount: '',
          ord: '1',
        },
      ],
    };

    setupMockFetch(responseWithNulls);

    const result = await getFinancialStatements(
      client, '00126380', '2024', '11011'
    );

    expect(result.success).toBe(true);
    const item = result.data!.items[0];
    expect(item.currentAmount.value).toBe(null);
    expect(item.currentAmount.displayValue).toBe('N/A');
    expect(item.previousAmount.value).toBe(null);
    expect(item.previousAmount.displayValue).toBe('N/A');
  });
});

describe('getCompanyInfo', () => {
  let client: OpenDartClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleCompanyResponse = {
    status: '000',
    message: '정상',
    corp_code: '00126380',
    corp_name: '삼성전자',
    corp_name_eng: 'SAMSUNG ELECTRONICS CO.,LTD',
    ceo_nm: '한종희',
    corp_cls: 'Y',
    induty_code: '264',
    est_dt: '19690113',
    acc_mt: '12',
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opendart-company-test-'));
    client = new OpenDartClient({
      apiKey: 'test-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses company info response correctly', async () => {
    setupMockFetch(sampleCompanyResponse);

    const result = await getCompanyInfo(client, '00126380');

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.corpCode).toBe('00126380');
    expect(data.corpName).toBe('삼성전자');
    expect(data.corpNameEn).toBe('SAMSUNG ELECTRONICS CO.,LTD');
    expect(data.ceoName).toBe('한종희');
    expect(data.corpClass).toBe('Y');
    expect(data.indutyCode).toBe('264');
    expect(data.establishDate).toBe('19690113');
    expect(data.accountMonth).toBe('12');
  });

  test('handles API error', async () => {
    setupMockFetch({ status: '011', message: '조회된 데이터가 없습니다' });

    const result = await getCompanyInfo(client, '99999999');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

describe('getDisclosures', () => {
  let client: OpenDartClient;
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  const sampleDisclosureResponse = {
    status: '000',
    message: '정상',
    page_no: 1,
    page_count: 10,
    total_count: 42,
    list: [
      {
        corp_cls: 'Y',
        corp_name: '삼성전자',
        corp_code: '00126380',
        stock_code: '005930',
        rcept_no: '20240315000456',
        rcept_dt: '20240315',
        report_nm: '사업보고서 (2023.12)',
        flr_nm: '삼성전자',
        rm: '',
      },
      {
        corp_cls: 'Y',
        corp_name: '삼성전자',
        corp_code: '00126380',
        stock_code: '005930',
        rcept_no: '20240201000789',
        rcept_dt: '20240201',
        report_nm: '주요사항보고서(자기주식취득결정)',
        flr_nm: '삼성전자',
        rm: '',
      },
    ],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opendart-disc-test-'));
    client = new OpenDartClient({
      apiKey: 'test-api-key',
      cacheDbPath: join(tmpDir, 'test-cache.sqlite'),
    });
  });

  afterEach(() => {
    client.close();
    globalThis.fetch = originalFetch;
  });

  test('parses disclosure search results correctly', async () => {
    setupMockFetch(sampleDisclosureResponse);

    const result = await getDisclosures(client, '00126380');

    expect(result.success).toBe(true);
    expect(result.data).not.toBe(null);

    const data = result.data!;
    expect(data.totalCount).toBe(42);
    expect(data.pageNo).toBe(1);
    expect(data.items).toHaveLength(2);

    expect(data.items[0].rceptNo).toBe('20240315000456');
    expect(data.items[0].corpName).toBe('삼성전자');
    expect(data.items[0].rceptDt).toBe('20240315');
    expect(data.items[0].reportNm).toBe('사업보고서 (2023.12)');
    expect(data.items[0].flrNm).toBe('삼성전자');

    expect(data.items[1].rceptNo).toBe('20240201000789');
    expect(data.items[1].reportNm).toBe('주요사항보고서(자기주식취득결정)');
  });

  test('passes search options as params', async () => {
    let capturedUrl = '';
    setFetchMock(mock((url: string | URL | Request) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return Promise.resolve(
        new Response(JSON.stringify(sampleDisclosureResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));

    await getDisclosures(client, '00126380', {
      startDate: '20240101',
      endDate: '20241231',
      type: 'A',
      page: 2,
    });

    expect(capturedUrl).toContain('bgn_de=20240101');
    expect(capturedUrl).toContain('end_de=20241231');
    expect(capturedUrl).toContain('pblntf_ty=A');
    expect(capturedUrl).toContain('page_no=2');
  });

  test('handles API error', async () => {
    setupMockFetch({ status: '011', message: '조회된 데이터가 없습니다' });

    const result = await getDisclosures(client, '99999999');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('handles empty disclosure list', async () => {
    setupMockFetch({
      status: '000',
      message: '정상',
      page_no: 1,
      page_count: 0,
      total_count: 0,
      list: [],
    });

    const result = await getDisclosures(client, '00126380');

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(0);
    expect(result.data?.items).toHaveLength(0);
  });
});
