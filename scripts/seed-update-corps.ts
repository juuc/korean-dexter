#!/usr/bin/env bun
/**
 * Download fresh corp codes from OpenDART and seed new companies.
 * Usage: bun run seed:update-corps [--output data/demo.sqlite]
 *
 * Downloads the latest corp code list, compares with existing corp_mappings,
 * and seeds company info + financials for newly listed companies.
 */

import { rmSync } from 'node:fs';
import { buildCacheKey } from '../src/infra/cache.js';
import { CorpCodeResolver } from '../src/mapping/corp-code-resolver.js';
import { getCompanyInfo, getFinancialStatements } from '../src/tools/core/opendart/tools.js';
import type { CorpMapping } from '../src/mapping/types.js';
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

function parseArgs(): { output: string } {
  const args = process.argv.slice(2);
  let output = defaultDbPath();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) output = args[i + 1]!;
  }
  return { output };
}

async function main(): Promise<void> {
  const { output } = parseArgs();

  console.log('Updating corp codes from OpenDART...');
  console.log(`Database: ${output}`);

  const opendartKey = process.env.OPENDART_API_KEY;
  if (!opendartKey) throw new Error('OPENDART_API_KEY is required');

  const db = openSeedDb(output);

  // Load existing corp codes
  const existing = new Set(loadCorpMappings(db).map((m) => m.corp_code));
  console.log(`Existing companies in DB: ${existing.size}`);

  // Download fresh corp list
  const resolver = new CorpCodeResolver();
  await resolver.loadFromApi(opendartKey);
  console.log(`Downloaded ${resolver.count} total corp codes from OpenDART`);

  const tempPath = `${output}.corps-update.tmp.json`;
  await resolver.saveToCache(tempPath);
  const raw = await Bun.file(tempPath).json() as CorpMapping[];
  try { rmSync(tempPath); } catch { /* ignore */ }

  const allListed = raw.filter((m) => m.stock_code.trim() !== '');
  const newCorps = allListed.filter((m) => !existing.has(m.corp_code));

  console.log(`Listed companies: ${allListed.length}`);
  console.log(`New companies to seed: ${newCorps.length}`);

  if (newCorps.length === 0) {
    console.log('No new companies found. DB is up to date.');
    db.close();
    return;
  }

  // Store new corp mappings
  const insertCorp = db.prepare(
    `INSERT OR REPLACE INTO corp_mappings (corp_code, corp_name, stock_code, modify_date) VALUES (?, ?, ?, ?)`
  );
  for (const m of newCorps) {
    insertCorp.run(m.corp_code, m.corp_name, m.stock_code, m.modify_date);
  }
  console.log(`Inserted ${newCorps.length} new corp mappings`);

  const { dartClient } = createSeedClients({ quiet: true });
  const currentYear = new Date().getFullYear();
  const reportCodes = ['11011', '11014', '11012', '11013'] as const;
  const yearsBack = 3;

  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < newCorps.length; i++) {
    const corp = newCorps[i]!;
    const prefix = `[${i + 1}/${newCorps.length}] ${corp.corp_name}`;

    // Company info
    if (!isSeeded(db, corp.corp_code, 'company', '')) {
      try {
        const result = await getCompanyInfo(dartClient, corp.corp_code);
        if (result.success && result.data) {
          const key = buildCacheKey('opendart', 'company', { corp_code: corp.corp_code });
          storeResponse(db, key, result.data, 'opendart');
        }
        markSeeded(db, corp.corp_code, 'company', '');
        fetched++;
      } catch {
        console.log(`  ${prefix} company info FAILED`);
        failed++;
      }
    }

    // Financial statements for last N years
    for (let y = 1; y <= yearsBack; y++) {
      const bsnsYear = String(currentYear - y);
      for (const report of reportCodes) {
        if (isSeeded(db, corp.corp_code, report, bsnsYear)) continue;
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
      }
    }

    console.log(`${prefix} done`);
  }

  db.close();
  console.log(`\nDone. fetched=${fetched} failed=${failed}`);
}

main().catch((err: unknown) => {
  console.error('Corp update failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
