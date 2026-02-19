#!/usr/bin/env bun
/**
 * Incremental quarterly financial statement update.
 * Usage: bun run seed:update-quarterly [--year 2025] [--report 11014] [--output data/demo.sqlite]
 *
 * Reads existing corp_mappings, fetches missing financial statements
 * for the specified year/report, and checkpoints each fetch.
 */

import { buildCacheKey } from '../src/infra/cache.js';
import { getFinancialStatements } from '../src/tools/core/opendart/tools.js';
import { config } from 'dotenv';
import {
  openSeedDb,
  storeResponse,
  loadCorpMappings,
  createSeedClients,
  isSeeded,
  markSeeded,
  defaultDbPath,
} from './seed-utils.js';

config({ quiet: true });

function parseArgs(): { year: number; report: string; output: string } {
  const args = process.argv.slice(2);
  const currentYear = new Date().getFullYear();

  // Determine latest completed quarter from current month
  const month = new Date().getMonth() + 1; // 1-12
  let defaultReport = '11011'; // annual
  if (month >= 5 && month <= 7) defaultReport = '11013';      // Q1 (May filing)
  else if (month >= 8 && month <= 10) defaultReport = '11012'; // Q2 (Aug filing)
  else if (month >= 11) defaultReport = '11014';               // Q3 (Nov filing)

  let year = currentYear - 1;
  let report = defaultReport;
  let output = defaultDbPath();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) year = parseInt(args[i + 1]!, 10);
    if (args[i] === '--report' && args[i + 1]) report = args[i + 1]!;
    if (args[i] === '--output' && args[i + 1]) output = args[i + 1]!;
  }

  return { year, report, output };
}

async function main(): Promise<void> {
  const { year, report, output } = parseArgs();

  const REPORT_LABELS: Record<string, string> = {
    '11011': 'annual',
    '11012': 'Q2(semi-annual)',
    '11013': 'Q1',
    '11014': 'Q3',
  };
  const label = REPORT_LABELS[report] ?? report;

  console.log(`Updating quarterly financials: year=${year} report=${label} (${report})`);
  console.log(`Database: ${output}`);

  const db = openSeedDb(output);
  const corps = loadCorpMappings(db);

  if (corps.length === 0) {
    console.error('No corp_mappings found. Run seed:demo first.');
    db.close();
    process.exit(1);
  }

  console.log(`Found ${corps.length} companies in DB`);

  const { dartClient } = createSeedClients({ quiet: true });

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  const bsnsYear = String(year);

  for (let i = 0; i < corps.length; i++) {
    const corp = corps[i]!;

    if (isSeeded(db, corp.corp_code, report, bsnsYear)) {
      skipped++;
      continue;
    }

    try {
      const fsResult = await getFinancialStatements(dartClient, corp.corp_code, bsnsYear, report);
      if (fsResult.success && fsResult.data) {
        const key = buildCacheKey('opendart', 'fnlttSinglAcnt', {
          bsns_year: bsnsYear,
          corp_code: corp.corp_code,
          fs_div: fsResult.data.fsDiv,
          reprt_code: report,
        });
        storeResponse(db, key, fsResult.data, 'opendart');
      }
      markSeeded(db, corp.corp_code, report, bsnsYear);
      fetched++;
    } catch {
      failed++;
    }

    if ((i + 1) % 100 === 0 || i + 1 === corps.length) {
      const pct = (((i + 1) / corps.length) * 100).toFixed(1);
      console.log(`[${i + 1}/${corps.length}] ${pct}% — fetched=${fetched} skipped=${skipped} failed=${failed}`);
    }
  }

  db.close();
  console.log(`\nDone. fetched=${fetched} skipped=${skipped} failed=${failed}`);
}

main().catch((err: unknown) => {
  console.error('Update failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
