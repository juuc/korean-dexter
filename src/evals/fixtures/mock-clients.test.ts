import { describe, test, expect } from 'bun:test';
import {
  MockOpenDartClient,
  MockKISClient,
  createMockOpenDartClient,
  createMockKISClient,
} from './mock-clients.js';
import type { FixtureSet } from './types.js';

describe('MockOpenDartClient', () => {
  test('satisfies DartClientLike interface', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: 'fnlttSinglAcnt',
          params: { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' },
          response: { status: '000', message: 'success', list: [] },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockOpenDartClient(fixtureSets);

    // Test request method - this is the only method required by DartClientLike
    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: '000', message: 'success', list: [] });
  });

  test('returns correct fixture data when fixture exists', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: 'fnlttSinglAcnt',
          params: { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' },
          response: { status: '000', message: 'success', list: [{ account: 'revenue', value: '1000' }] },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockOpenDartClient(fixtureSets);

    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      status: '000',
      message: 'success',
      list: [{ account: 'revenue', value: '1000' }],
    });
  });

  test('returns NOT_FOUND error when no fixture matches', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: 'fnlttSinglAcnt',
          params: { corp_code: '00126380', bsns_year: '2024', reprt_code: '11011', fs_div: 'CFS' },
          response: { status: '000', message: 'success', list: [] },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockOpenDartClient(fixtureSets);

    // Request with different params that don't match the fixture
    const result = await client.request('fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2023', // Different year
      reprt_code: '11011',
      fs_div: 'CFS',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('returns NOT_FOUND error when corp_code is missing', async () => {
    const fixtureSets = new Map<string, FixtureSet>();
    const client = new MockOpenDartClient(fixtureSets);

    const result = await client.request('fnlttSinglAcnt', {
      bsns_year: '2024',
      reprt_code: '11011',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toContain('corp_code parameter is required');
  });
});

describe('MockKISClient', () => {
  test('satisfies KisClientLike interface', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
          params: { FID_INPUT_ISCD: '005930' },
          response: { rt_cd: '0', msg_cd: '0', output: { stck_prpr: '70000' } },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockKISClient(fixtureSets);

    // Test request method - this is the only method required by KisClientLike
    const result = await client.request(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      { FID_INPUT_ISCD: '005930' },
      { trId: 'FHKST01010100' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rt_cd: '0', msg_cd: '0', output: { stck_prpr: '70000' } });
  });

  test('returns correct fixture data when fixture exists', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
          params: { FID_INPUT_ISCD: '005930' },
          response: { rt_cd: '0', msg_cd: '0', output: { stck_prpr: '70000', prdy_vrss: '1000' } },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockKISClient(fixtureSets);

    const result = await client.request(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      { FID_INPUT_ISCD: '005930' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      rt_cd: '0',
      msg_cd: '0',
      output: { stck_prpr: '70000', prdy_vrss: '1000' },
    });
  });

  test('returns NOT_FOUND error when no fixture matches', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
          params: { FID_INPUT_ISCD: '005930' },
          response: { rt_cd: '0', msg_cd: '0', output: { stck_prpr: '70000' } },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = new MockKISClient(fixtureSets);

    // Request with different stock code
    const result = await client.request(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      { FID_INPUT_ISCD: '000660' } // Different stock code
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('returns NOT_FOUND error when stock code is missing', async () => {
    const fixtureSets = new Map<string, FixtureSet>();
    const client = new MockKISClient(fixtureSets);

    const result = await client.request(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      {} // No stock code
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toContain('Stock code parameter is required');
  });
});

describe('Factory functions', () => {
  test('createMockOpenDartClient returns interface-compatible object', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: 'company',
          params: { corp_code: '00126380' },
          response: { status: '000', corp_name: '삼성전자' },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = createMockOpenDartClient(fixtureSets);

    // Should have DartClientLike request method
    const result = await client.request('company', { corp_code: '00126380' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: '000', corp_name: '삼성전자' });
  });

  test('createMockKISClient returns interface-compatible object', async () => {
    const mockFixtureSet: FixtureSet = {
      corpCode: '00126380',
      corpName: '삼성전자',
      recordedAt: '2025-01-01T00:00:00Z',
      responses: [
        {
          endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
          params: { FID_INPUT_ISCD: '005930' },
          response: { rt_cd: '0', output: {} },
        },
      ],
    };

    const fixtureSets = new Map<string, FixtureSet>();
    fixtureSets.set('00126380', mockFixtureSet);

    const client = createMockKISClient(fixtureSets);

    // Should have KisClientLike request method
    const result = await client.request(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      { FID_INPUT_ISCD: '005930' }
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rt_cd: '0', output: {} });
  });
});
