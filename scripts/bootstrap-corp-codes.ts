#!/usr/bin/env bun
/**
 * Bootstrap script: Downloads corp code data from OpenDART and caches it.
 * Usage: bun run scripts/bootstrap-corp-codes.ts
 */
import { config } from 'dotenv';
config({ quiet: true });

import { createCorpCodeResolver } from '../src/mapping/corp-code-resolver.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_PATH = join(homedir(), '.korean-dexter', 'corp-codes.json');
const apiKey = process.env.OPENDART_API_KEY;

if (!apiKey) {
  console.error('OPENDART_API_KEY not found in .env');
  process.exit(1);
}

console.log('Downloading corp codes from OpenDART...');

const resolver = createCorpCodeResolver();
await resolver.loadFromApi(apiKey);

console.log(`Loaded ${resolver.count} companies`);

await resolver.saveToCache(CACHE_PATH);
console.log(`Saved to ${CACHE_PATH}`);

// Quick sanity check
const samsung = resolver.resolve('삼성전자');
if (samsung) {
  console.log(`Sanity check: 삼성전자 -> corp_code=${samsung.corp_code}, stock_code=${samsung.stock_code}`);
} else {
  console.error('WARNING: Could not resolve 삼성전자');
}
