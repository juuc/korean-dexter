#!/usr/bin/env bun
/**
 * Seed demo SQLite database with real API data.
 * Usage: bun run scripts/seed-demo-data.ts [--companies 200] [--years 3] [--output data/demo.sqlite]
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildCacheKey } from '../src/infra/cache.js';
import { CorpCodeResolver } from '../src/mapping/corp-code-resolver.js';
import { OpenDartClient } from '../src/tools/core/opendart/client.js';
import { getCompanyInfo, getFinancialStatements } from '../src/tools/core/opendart/tools.js';
import { KISClient } from '../src/tools/core/kis/client.js';
import { getStockPrice, getHistoricalPrices, getMarketIndex } from '../src/tools/core/kis/tools.js';
import { BokClient } from '../src/tools/core/bok/client.js';
import { getEconomicIndicator } from '../src/tools/core/bok/tools.js';
import { BOK_INDICATORS } from '../src/tools/core/bok/types.js';
import { KosisClient } from '../src/tools/core/kosis/client.js';
import { getKosisData } from '../src/tools/core/kosis/tools.js';
import { KOSIS_TABLES } from '../src/tools/core/kosis/types.js';
import type { CorpMapping } from '../src/mapping/types.js';
import { config } from 'dotenv';

config({ quiet: true });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { companies: number; years: number; output: string } {
  const args = process.argv.slice(2);
  let companies = 200;
  let years = 3;
  let output = new URL('../data/demo.sqlite', import.meta.url).pathname;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--companies' && args[i + 1]) companies = parseInt(args[i + 1]!, 10);
    if (args[i] === '--years' && args[i + 1]) years = parseInt(args[i + 1]!, 10);
    if (args[i] === '--output' && args[i + 1]) output = args[i + 1]!;
  }

  return { companies, years, output };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function initDb(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS responses (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE TABLE IF NOT EXISTS corp_mappings (
    corp_code TEXT PRIMARY KEY,
    corp_name TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    modify_date TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_responses_source ON responses(source)`);
}

function storeResponse(
  db: Database,
  key: string,
  data: unknown,
  source: string
): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO responses (key, data, source, created_at) VALUES (?, ?, ?, ?)`
  );
  stmt.run(key, JSON.stringify(data), source, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDateKIS(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { companies: maxCompanies, years, output } = parseArgs();

  console.log(`Seeding demo data: top ${maxCompanies} companies, ${years} years`);
  console.log(`Output: ${output}`);

  // Ensure output directory exists
  mkdirSync(dirname(output), { recursive: true });

  const db = new Database(output);
  initDb(db);

  // ---------------------------------------------------------------------------
  // Step 1: Load corp codes
  // ---------------------------------------------------------------------------
  const opendartKey = process.env.OPENDART_API_KEY;
  if (!opendartKey) throw new Error('OPENDART_API_KEY is required for seeding');

  console.log('Loading corp code list from OpenDART...');
  const resolver = new CorpCodeResolver();
  await resolver.loadFromApi(opendartKey);
  console.log(`Loaded ${resolver.count} total corp codes`);

  // Filter to listed companies (non-empty stock_code)
  // Access internal mappings via searchByPrefix trick: search all by empty prefix won't work.
  // Instead resolve all by getting them from the resolver via a workaround:
  // We use loadFromApi which populates internal mappings. We need all listed ones.
  // The resolver doesn't expose mappings directly, so use a temporary JSON cache approach.
  // Save to temp, reload as JSON, filter.
  const tempPath = `${output}.corps.tmp.json`;
  await resolver.saveToCache(tempPath);
  const raw = await Bun.file(tempPath).json() as CorpMapping[];
  try { rmSync(tempPath); } catch { /* ignore */ }

  const listed = raw.filter((m) => m.stock_code.trim() !== '').slice(0, maxCompanies);
  console.log(`Found ${listed.length} listed companies (capped at ${maxCompanies})`);

  // Store corp mappings
  const insertCorp = db.prepare(
    `INSERT OR REPLACE INTO corp_mappings (corp_code, corp_name, stock_code, modify_date) VALUES (?, ?, ?, ?)`
  );
  for (const m of listed) {
    insertCorp.run(m.corp_code, m.corp_name, m.stock_code, m.modify_date);
  }
  console.log(`Stored ${listed.length} corp mappings`);

  // ---------------------------------------------------------------------------
  // Step 2: Init clients
  // ---------------------------------------------------------------------------
  const dartClient = new OpenDartClient({ apiKey: opendartKey });

  let kisClient: KISClient | null = null;
  if (process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET) {
    kisClient = new KISClient({
      appKey: process.env.KIS_APP_KEY,
      appSecret: process.env.KIS_APP_SECRET,
    });
  } else {
    console.log('KIS_APP_KEY/KIS_APP_SECRET not set — skipping KIS data');
  }

  let bokClient: BokClient | null = null;
  if (process.env.BOK_API_KEY) {
    bokClient = new BokClient({ apiKey: process.env.BOK_API_KEY });
  } else {
    console.log('BOK_API_KEY not set — skipping BOK data');
  }

  let kosisClient: KosisClient | null = null;
  if (process.env.KOSIS_API_KEY) {
    kosisClient = new KosisClient({ apiKey: process.env.KOSIS_API_KEY });
  } else {
    console.log('KOSIS_API_KEY not set — skipping KOSIS data');
  }

  const currentYear = new Date().getFullYear();

  // ---------------------------------------------------------------------------
  // Step 3: Per-company data
  // ---------------------------------------------------------------------------
  for (let i = 0; i < listed.length; i++) {
    const corp = listed[i]!;
    const prefix = `[${i + 1}/${listed.length}] ${corp.corp_name} (${corp.stock_code})`;

    // Company info
    try {
      const companyResult = await getCompanyInfo(dartClient, corp.corp_code);
      if (companyResult.success && companyResult.data) {
        const key = buildCacheKey('opendart', 'company', { corp_code: corp.corp_code });
        storeResponse(db, key, companyResult.data, 'opendart');
      }
    } catch {
      console.log(`  ${prefix} company info FAILED`);
    }

    // Financial statements: years prior to current (e.g., 2024, 2023, 2022)
    for (let y = 1; y <= years; y++) {
      const bsnsYear = String(currentYear - y);
      try {
        const fsResult = await getFinancialStatements(
          dartClient,
          corp.corp_code,
          bsnsYear,
          '11011' // annual CFS
        );
        if (fsResult.success && fsResult.data) {
          // Store with CFS params (primary attempt)
          const key = buildCacheKey('opendart', 'fnlttSinglAcnt', {
            bsns_year: bsnsYear,
            corp_code: corp.corp_code,
            fs_div: fsResult.data.fsDiv,
            reprt_code: '11011',
          });
          storeResponse(db, key, fsResult.data, 'opendart');
        }
      } catch {
        // Skip silently
      }
    }

    // KIS: stock price and historical prices
    if (kisClient) {
      try {
        const priceResult = await getStockPrice(kisClient, corp.stock_code);
        if (priceResult.success && priceResult.data) {
          const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-price', {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD: corp.stock_code,
          });
          storeResponse(db, key, priceResult.data, 'kis');
        }
      } catch {
        // Skip silently
      }

      try {
        const endDate = formatDateKIS(new Date());
        const startDate = formatDateKIS(daysAgo(365));
        const histResult = await getHistoricalPrices(kisClient, corp.stock_code, {
          startDate,
          endDate,
          period: 'D',
        });
        if (histResult.success && histResult.data) {
          const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-daily-price', {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_DATE_1: startDate,
            FID_INPUT_DATE_2: endDate,
            FID_INPUT_ISCD: corp.stock_code,
            FID_ORG_ADJ_PRC: '0',
            FID_PERIOD_DIV_CODE: 'D',
          });
          storeResponse(db, key, histResult.data, 'kis');
        }
      } catch {
        // Skip silently
      }
    }

    console.log(`${prefix} done`);
  }

  // ---------------------------------------------------------------------------
  // Step 4: Market indices
  // ---------------------------------------------------------------------------
  if (kisClient) {
    for (const indexCode of ['0001', '1001']) {
      try {
        const result = await getMarketIndex(kisClient, indexCode);
        if (result.success && result.data) {
          const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-index-price', {
            FID_COND_MRKT_DIV_CODE: 'U',
            FID_INPUT_ISCD: indexCode,
          });
          storeResponse(db, key, result.data, 'kis');
          console.log(`Market index ${indexCode} stored`);
        }
      } catch {
        console.log(`Market index ${indexCode} FAILED`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5: BOK indicators
  // ---------------------------------------------------------------------------
  if (bokClient) {
    const bokYearsBack = 5;
    const bokEndYear = currentYear;
    const bokStartYear = bokEndYear - bokYearsBack;

    for (const [name, indicator] of Object.entries(BOK_INDICATORS)) {
      // Skip wildcard items (CPI, M2 use '*' which needs special handling)
      if (indicator.item === '*') {
        console.log(`BOK ${name} skipped (wildcard item)`);
        continue;
      }
      try {
        const result = await getEconomicIndicator(
          bokClient,
          indicator.table,
          indicator.item,
          'A',
          String(bokStartYear),
          String(bokEndYear)
        );
        if (result.success && result.data) {
          const key = buildCacheKey('bok', 'StatisticSearch', {
            endDate: String(bokEndYear),
            itemCode1: indicator.item,
            periodType: 'A',
            startDate: String(bokStartYear),
            tableCode: indicator.table,
          });
          storeResponse(db, key, result.data, 'bok');
          console.log(`BOK ${name} stored`);
        }
      } catch {
        console.log(`BOK ${name} FAILED`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 6: KOSIS tables
  // ---------------------------------------------------------------------------
  if (kosisClient) {
    for (const [name, table] of Object.entries(KOSIS_TABLES)) {
      try {
        const result = await getKosisData(kosisClient, table.id);
        if (result.success && result.data) {
          const key = buildCacheKey('kosis', 'Stat/getData.do', {
            newEstPrdCnt: '5',
            tblId: table.id,
          });
          storeResponse(db, key, result.data, 'kosis');
          console.log(`KOSIS ${name} stored`);
        }
      } catch {
        console.log(`KOSIS ${name} FAILED`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 7: Finalize
  // ---------------------------------------------------------------------------
  db.run('VACUUM');
  db.close();

  const fileSize = Bun.file(output).size;
  const sizeMb = (fileSize / 1024 / 1024).toFixed(2);
  console.log(`\nDone. Database size: ${sizeMb} MB at ${output}`);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
