#!/usr/bin/env bun
/**
 * Seed demo SQLite database with real API data.
 * Usage: bun run scripts/seed-demo-data.ts [--companies N] [--years 3] [--output data/demo.sqlite]
 *        bun run scripts/seed-demo-data.ts --status   # show progress
 *        bun run scripts/seed-demo-data.ts --reset    # wipe progress and start fresh
 *
 * Supports resumable crawl: progress is checkpointed per (corp_code, report_code, year).
 * Interrupt with Ctrl-C to stop gracefully; re-run to resume where you left off.
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

interface SeedArgs {
  companies: number;
  years: number;
  output: string;
  reset: boolean;
  status: boolean;
}

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);
  let companies = Infinity;
  let years = 3;
  let output = new URL('../data/demo.sqlite', import.meta.url).pathname;
  let reset = false;
  let status = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--companies' && args[i + 1]) companies = parseInt(args[i + 1]!, 10);
    if (args[i] === '--years' && args[i + 1]) years = parseInt(args[i + 1]!, 10);
    if (args[i] === '--output' && args[i + 1]) output = args[i + 1]!;
    if (args[i] === '--reset') reset = true;
    if (args[i] === '--status') status = true;
  }

  return { companies, years, output, reset, status };
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

  db.run(`
    CREATE TABLE IF NOT EXISTS seed_progress (
      corp_code TEXT NOT NULL,
      report_code TEXT NOT NULL,
      year TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'done',
      seeded_at TEXT NOT NULL,
      PRIMARY KEY (corp_code, report_code, year)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
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
// Checkpoint helpers
// ---------------------------------------------------------------------------

function isSeeded(db: Database, corpCode: string, reportCode: string, year: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM seed_progress WHERE corp_code = ? AND report_code = ? AND year = ?'
  ).get(corpCode, reportCode, year);
  return row !== null;
}

function markSeeded(db: Database, corpCode: string, reportCode: string, year: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO seed_progress (corp_code, report_code, year, status, seeded_at) VALUES (?, ?, ?, 'done', ?)`
  ).run(corpCode, reportCode, year, new Date().toISOString());
}

function setMeta(db: Database, key: string, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO seed_meta (key, value) VALUES (?, ?)`).run(key, value);
}

function getMeta(db: Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM seed_meta WHERE key = ?').get(key) as
    | { value: string }
    | null;
  return row?.value;
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
// --status handler
// ---------------------------------------------------------------------------

function showStatus(db: Database): void {
  const totalRow = db.prepare('SELECT value FROM seed_meta WHERE key = ?').get('total_companies') as
    | { value: string }
    | null;
  const total = totalRow ? parseInt(totalRow.value, 10) : 0;

  const doneRow = db.prepare(
    "SELECT COUNT(DISTINCT corp_code) AS cnt FROM seed_progress WHERE report_code = 'company'"
  ).get() as { cnt: number };
  const done = doneRow.cnt;

  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '0.0';

  const lastSeed = getMeta(db, 'seed_started_at') ?? 'never';
  const lastResume = getMeta(db, 'last_resumed_at') ?? 'never';

  console.log('=== Seed Progress ===');
  console.log(`Total companies: ${total}`);
  console.log(`Completed:       ${done} (${pct}%)`);
  console.log(`Last started:    ${lastSeed}`);
  console.log(`Last resumed:    ${lastResume}`);
}

// ---------------------------------------------------------------------------
// --reset handler
// ---------------------------------------------------------------------------

function resetProgress(db: Database): void {
  db.run('DROP TABLE IF EXISTS seed_progress');
  db.run('DROP TABLE IF EXISTS seed_meta');
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_progress (
      corp_code TEXT NOT NULL,
      report_code TEXT NOT NULL,
      year TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'done',
      seeded_at TEXT NOT NULL,
      PRIMARY KEY (corp_code, report_code, year)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  console.log('Progress reset. Run again to start fresh seed.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { companies, years, output, reset, status } = parseArgs();

  // Ensure output directory exists
  mkdirSync(dirname(output), { recursive: true });

  const db = new Database(output);
  initDb(db);

  // Handle --status
  if (status) {
    showStatus(db);
    db.close();
    return;
  }

  // Handle --reset
  if (reset) {
    resetProgress(db);
    db.close();
    return;
  }

  // ---------------------------------------------------------------------------
  // Graceful interrupt
  // ---------------------------------------------------------------------------
  let interrupted = false;
  process.on('SIGINT', () => {
    console.log('\nInterrupt received. Finishing current company...');
    interrupted = true;
  });

  // ---------------------------------------------------------------------------
  // Step 1: Load corp codes
  // ---------------------------------------------------------------------------
  const opendartKey = process.env.OPENDART_API_KEY;
  if (!opendartKey) throw new Error('OPENDART_API_KEY is required for seeding');

  console.log('Loading corp code list from OpenDART...');
  const resolver = new CorpCodeResolver();
  await resolver.loadFromApi(opendartKey);
  console.log(`Loaded ${resolver.count} total corp codes`);

  const tempPath = `${output}.corps.tmp.json`;
  await resolver.saveToCache(tempPath);
  const raw = await Bun.file(tempPath).json() as CorpMapping[];
  try { rmSync(tempPath); } catch { /* ignore */ }

  const allListed = raw.filter((m) => m.stock_code.trim() !== '');
  const listed = companies === Infinity ? allListed : allListed.slice(0, companies);
  console.log(`Found ${allListed.length} listed companies${companies !== Infinity ? ` (limited to ${companies})` : ''}`);
  console.log(`Output: ${output}`);

  // Store corp mappings
  const insertCorp = db.prepare(
    `INSERT OR REPLACE INTO corp_mappings (corp_code, corp_name, stock_code, modify_date) VALUES (?, ?, ?, ?)`
  );
  for (const m of listed) {
    insertCorp.run(m.corp_code, m.corp_name, m.stock_code, m.modify_date);
  }
  console.log(`Stored ${listed.length} corp mappings`);

  // ---------------------------------------------------------------------------
  // Detect resume vs fresh start
  // ---------------------------------------------------------------------------
  const existingProgress = db.prepare('SELECT COUNT(*) AS cnt FROM seed_progress').get() as { cnt: number };
  const isResume = existingProgress.cnt > 0;

  if (isResume) {
    setMeta(db, 'last_resumed_at', new Date().toISOString());
    const doneCorps = (
      db.prepare("SELECT COUNT(DISTINCT corp_code) AS cnt FROM seed_progress WHERE report_code = 'company'").get() as { cnt: number }
    ).cnt;
    console.log(`Resuming from company ${doneCorps + 1}/${listed.length}...`);
  } else {
    setMeta(db, 'seed_started_at', new Date().toISOString());
  }
  setMeta(db, 'total_companies', String(listed.length));

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
  let apiCalls = 0;

  // ---------------------------------------------------------------------------
  // Step 3: Per-company data
  // ---------------------------------------------------------------------------
  for (let i = 0; i < listed.length; i++) {
    if (interrupted) break;

    const corp = listed[i]!;
    const prefix = `[${i + 1}/${listed.length}]`;

    // Company info
    if (!isSeeded(db, corp.corp_code, 'company', '')) {
      try {
        const companyResult = await getCompanyInfo(dartClient, corp.corp_code);
        apiCalls++;
        if (companyResult.success && companyResult.data) {
          const key = buildCacheKey('opendart', 'company', { corp_code: corp.corp_code });
          storeResponse(db, key, companyResult.data, 'opendart');
        }
        markSeeded(db, corp.corp_code, 'company', '');
      } catch {
        console.log(`  ${prefix} ${corp.corp_name} company info FAILED`);
      }
    }

    // Financial statements: annual + quarterly for each year
    const reportCodes = [
      { code: '11011', label: 'annual' },
      { code: '11014', label: 'Q3' },
      { code: '11012', label: 'Q2' },
      { code: '11013', label: 'Q1' },
    ] as const;

    for (let y = 1; y <= years; y++) {
      const bsnsYear = String(currentYear - y);
      for (const report of reportCodes) {
        if (isSeeded(db, corp.corp_code, report.code, bsnsYear)) continue;
        try {
          const fsResult = await getFinancialStatements(
            dartClient,
            corp.corp_code,
            bsnsYear,
            report.code
          );
          apiCalls++;
          if (fsResult.success && fsResult.data) {
            const key = buildCacheKey('opendart', 'fnlttSinglAcnt', {
              bsns_year: bsnsYear,
              corp_code: corp.corp_code,
              fs_div: fsResult.data.fsDiv,
              reprt_code: report.code,
            });
            storeResponse(db, key, fsResult.data, 'opendart');
          }
          markSeeded(db, corp.corp_code, report.code, bsnsYear);
        } catch {
          // Skip silently
        }
      }
    }

    // KIS: stock price and historical prices
    if (kisClient) {
      if (!isSeeded(db, corp.corp_code, 'price', 'current')) {
        try {
          const priceResult = await getStockPrice(kisClient, corp.stock_code);
          apiCalls++;
          if (priceResult.success && priceResult.data) {
            const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-price', {
              FID_COND_MRKT_DIV_CODE: 'J',
              FID_INPUT_ISCD: corp.stock_code,
            });
            storeResponse(db, key, priceResult.data, 'kis');
          }
          markSeeded(db, corp.corp_code, 'price', 'current');
        } catch {
          // Skip silently
        }
      }

      if (!isSeeded(db, corp.corp_code, 'historical', 'current')) {
        try {
          const endDate = formatDateKIS(new Date());
          const startDate = formatDateKIS(daysAgo(365));
          const histResult = await getHistoricalPrices(kisClient, corp.stock_code, {
            startDate,
            endDate,
            period: 'D',
          });
          apiCalls++;
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
          markSeeded(db, corp.corp_code, 'historical', 'current');
        } catch {
          // Skip silently
        }
      }
    }

    // Progress display every 50 companies
    if ((i + 1) % 50 === 0 || i + 1 === listed.length) {
      const pct = ((i + 1) / listed.length * 100).toFixed(1);
      console.log(`${prefix} ${pct}% complete — ${apiCalls.toLocaleString()} API calls so far`);
    }
  }

  if (interrupted) {
    const done = (
      db.prepare("SELECT COUNT(DISTINCT corp_code) AS cnt FROM seed_progress WHERE report_code = 'company'").get() as { cnt: number }
    ).cnt;
    console.log(`\nInterrupted at company ${done}/${listed.length}. Run again to resume.`);
  }

  // ---------------------------------------------------------------------------
  // Step 4: Market indices
  // ---------------------------------------------------------------------------
  if (kisClient && !interrupted) {
    for (const indexCode of ['0001', '1001']) {
      try {
        const result = await getMarketIndex(kisClient, indexCode);
        apiCalls++;
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
  if (bokClient && !interrupted) {
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
        apiCalls++;
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
  if (kosisClient && !interrupted) {
    for (const [name, table] of Object.entries(KOSIS_TABLES)) {
      try {
        const result = await getKosisData(kosisClient, table.id);
        apiCalls++;
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
  console.log(`Total API calls: ${apiCalls.toLocaleString()}`);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
