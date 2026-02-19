#!/usr/bin/env bun
/**
 * Refresh current stock prices and historical prices for all companies.
 * Usage: bun run seed:update-prices [--output data/demo.sqlite]
 *
 * Updates current price + 1-year historical for every company in corp_mappings.
 * Also refreshes KOSPI (0001) and KOSDAQ (1001) index prices.
 */

import { buildCacheKey } from '../src/infra/cache.js';
import {
  getStockPrice,
  getHistoricalPrices,
  getMarketIndex,
} from '../src/tools/core/kis/tools.js';
import { config } from 'dotenv';
import {
  openSeedDb,
  storeResponse,
  loadCorpMappings,
  createSeedClients,
  formatDateKIS,
  daysAgo,
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

  console.log('Refreshing stock prices');
  console.log(`Database: ${output}`);

  const db = openSeedDb(output);
  const corps = loadCorpMappings(db);

  if (corps.length === 0) {
    console.error('No corp_mappings found. Run seed:demo first.');
    db.close();
    process.exit(1);
  }

  const { kisClient } = createSeedClients();
  if (!kisClient) {
    console.error('KIS credentials required for price updates.');
    db.close();
    process.exit(1);
  }

  console.log(`Found ${corps.length} companies`);

  const endDate = formatDateKIS(new Date());
  const startDate = formatDateKIS(daysAgo(365));

  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < corps.length; i++) {
    const corp = corps[i]!;

    // Current price
    try {
      const priceResult = await getStockPrice(kisClient, corp.stock_code);
      if (priceResult.success && priceResult.data) {
        const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-price', {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: corp.stock_code,
        });
        storeResponse(db, key, priceResult.data, 'kis');
        fetched++;
      }
    } catch {
      failed++;
    }

    // Historical prices
    try {
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
      // Skip silently — current price is more important
    }

    if ((i + 1) % 100 === 0 || i + 1 === corps.length) {
      const pct = (((i + 1) / corps.length) * 100).toFixed(1);
      console.log(`[${i + 1}/${corps.length}] ${pct}% — fetched=${fetched} failed=${failed}`);
    }
  }

  // Market indices
  for (const indexCode of ['0001', '1001']) {
    try {
      const result = await getMarketIndex(kisClient, indexCode);
      if (result.success && result.data) {
        const key = buildCacheKey('kis', '/uapi/domestic-stock/v1/quotations/inquire-index-price', {
          FID_COND_MRKT_DIV_CODE: 'U',
          FID_INPUT_ISCD: indexCode,
        });
        storeResponse(db, key, result.data, 'kis');
        console.log(`Market index ${indexCode} updated`);
      }
    } catch {
      console.log(`Market index ${indexCode} FAILED`);
    }
  }

  db.close();
  console.log(`\nDone. fetched=${fetched} failed=${failed}`);
}

main().catch((err: unknown) => {
  console.error('Price update failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
