import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCacheKey } from './cache.js';

// The demo.sqlite path used by demo-client.ts
const DEMO_DB_PATH = join(import.meta.dir, '..', '..', 'data', 'demo.sqlite');

const SAMPLE_COMPANY = {
  corp_code: '00126380',
  corp_name: '삼성전자',
  stock_code: '005930',
};

const SAMPLE_RESPONSE_DATA = {
  corpCode: '00126380',
  corpName: '삼성전자',
  revenue: '258.9조원',
};

function setupTestDb(): void {
  mkdirSync(join(import.meta.dir, '..', '..', 'data'), { recursive: true });

  const db = new Database(DEMO_DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS responses (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS corp_mappings (
      corp_code TEXT PRIMARY KEY,
      corp_name TEXT NOT NULL,
      stock_code TEXT NOT NULL,
      modify_date TEXT NOT NULL
    )
  `);

  // Insert sample OpenDART response
  const dartKey = buildCacheKey('opendart', '/api/company.json', { corp_code: '00126380' });
  db.run(
    'INSERT OR REPLACE INTO responses (key, data, source, created_at) VALUES (?, ?, ?, ?)',
    [dartKey, JSON.stringify(SAMPLE_RESPONSE_DATA), 'opendart', new Date().toISOString()]
  );

  // Insert sample KIS response
  const kisKey = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-price', {
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: '005930',
  });
  db.run(
    'INSERT OR REPLACE INTO responses (key, data, source, created_at) VALUES (?, ?, ?, ?)',
    [kisKey, JSON.stringify({ stockCode: '005930', name: '삼성전자' }), 'kis', new Date().toISOString()]
  );

  // Insert BOK response
  const bokKey = buildCacheKey('bok', 'StatisticSearch', {
    table_code: '722Y001',
    item_code: '0101000',
    period_type: 'A',
    start_date: '2020',
    end_date: '2024',
  });
  db.run(
    'INSERT OR REPLACE INTO responses (key, data, source, created_at) VALUES (?, ?, ?, ?)',
    [bokKey, JSON.stringify({ statCode: '722Y001', statName: '기준금리' }), 'bok', new Date().toISOString()]
  );

  // Insert KOSIS response
  const kosisKey = buildCacheKey('kosis', 'Stat/getData.do', {
    orgId: '101',
    tblId: 'DT_1B040A3',
  });
  db.run(
    'INSERT OR REPLACE INTO responses (key, data, source, created_at) VALUES (?, ?, ?, ?)',
    [kosisKey, JSON.stringify({ tableId: 'DT_1B040A3', tableName: '인구총조사' }), 'kosis', new Date().toISOString()]
  );

  // Insert corp mappings
  db.run(
    'INSERT OR REPLACE INTO corp_mappings (corp_code, corp_name, stock_code, modify_date) VALUES (?, ?, ?, ?)',
    [SAMPLE_COMPANY.corp_code, SAMPLE_COMPANY.corp_name, SAMPLE_COMPANY.stock_code, '20240101']
  );
  db.run(
    'INSERT OR REPLACE INTO corp_mappings (corp_code, corp_name, stock_code, modify_date) VALUES (?, ?, ?, ?)',
    ['00164742', 'SK하이닉스', '000660', '20240101']
  );

  db.close();
}

function cleanupTestDb(): void {
  if (existsSync(DEMO_DB_PATH)) {
    rmSync(DEMO_DB_PATH);
  }
}

describe('demo-client', () => {
  beforeAll(() => {
    setupTestDb();
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe('isDemoDbAvailable', () => {
    test('returns true when demo.sqlite exists', async () => {
      const { isDemoDbAvailable } = await import('./demo-client.js');
      expect(isDemoDbAvailable()).toBe(true);
    });
  });

  describe('DemoDartClient', () => {
    test('returns cached data for known key', async () => {
      const { DemoDartClient } = await import('./demo-client.js');
      const client = new DemoDartClient();
      const result = await client.request<typeof SAMPLE_RESPONSE_DATA>(
        '/api/company.json',
        { corp_code: '00126380' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(SAMPLE_RESPONSE_DATA);
      expect(result.metadata.responseTimeMs).toBe(0);
    });

    test('returns NOT_FOUND for unknown key', async () => {
      const { DemoDartClient } = await import('./demo-client.js');
      const client = new DemoDartClient();
      const result = await client.request('/api/company.json', { corp_code: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
      expect(result.error?.apiSource).toBe('opendart');
    });
  });

  describe('DemoKisClient', () => {
    test('returns cached data ignoring method and trId', async () => {
      const { DemoKisClient } = await import('./demo-client.js');
      const client = new DemoKisClient();
      const result = await client.request(
        'GET',
        '/uapi/domestic-stock/v1/quotations/inquire-price',
        { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: '005930' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ stockCode: '005930', name: '삼성전자' });
    });

    test('POST method also works (method is ignored)', async () => {
      const { DemoKisClient } = await import('./demo-client.js');
      const client = new DemoKisClient();
      const result = await client.request(
        'POST',
        '/uapi/domestic-stock/v1/quotations/inquire-price',
        { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: '005930' }
      );
      expect(result.success).toBe(true);
    });
  });

  describe('DemoBokClient', () => {
    test('returns cached data for known key', async () => {
      const { DemoBokClient } = await import('./demo-client.js');
      const client = new DemoBokClient();
      const result = await client.request('StatisticSearch', {
        table_code: '722Y001',
        item_code: '0101000',
        period_type: 'A',
        start_date: '2020',
        end_date: '2024',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ statCode: '722Y001', statName: '기준금리' });
    });
  });

  describe('DemoKosisClient', () => {
    test('returns cached data for known key', async () => {
      const { DemoKosisClient } = await import('./demo-client.js');
      const client = new DemoKosisClient();
      const result = await client.request('Stat/getData.do', {
        orgId: '101',
        tblId: 'DT_1B040A3',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ tableId: 'DT_1B040A3', tableName: '인구총조사' });
    });
  });

  describe('loadDemoCorpCodes', () => {
    test('returns all corp mappings from demo DB', async () => {
      const { loadDemoCorpCodes } = await import('./demo-client.js');
      const codes = loadDemoCorpCodes();
      expect(codes.length).toBe(2);
      expect(codes).toContainEqual({
        corp_code: '00126380',
        corp_name: '삼성전자',
        stock_code: '005930',
      });
      expect(codes).toContainEqual({
        corp_code: '00164742',
        corp_name: 'SK하이닉스',
        stock_code: '000660',
      });
    });
  });
});
