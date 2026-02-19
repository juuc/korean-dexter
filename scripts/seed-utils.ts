/**
 * Shared utilities for seed scripts.
 * Extracted from seed-demo-data.ts for reuse across incremental update scripts.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OpenDartClient } from '../src/tools/core/opendart/client.js';
import { KISClient } from '../src/tools/core/kis/client.js';
import { BokClient } from '../src/tools/core/bok/client.js';
import { KosisClient } from '../src/tools/core/kosis/client.js';
import type { CorpMapping } from '../src/mapping/types.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initDb(db: Database): void {
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

// ---------------------------------------------------------------------------
// DB factory
// ---------------------------------------------------------------------------

export function openSeedDb(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  initDb(db);
  return db;
}

// ---------------------------------------------------------------------------
// Response storage
// ---------------------------------------------------------------------------

export function storeResponse(
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
// Corp mappings
// ---------------------------------------------------------------------------

export function loadCorpMappings(db: Database): CorpMapping[] {
  return db.prepare(
    'SELECT corp_code, corp_name, stock_code, modify_date FROM corp_mappings ORDER BY corp_code'
  ).all() as CorpMapping[];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function formatDateKIS(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export interface SeedClients {
  dartClient: OpenDartClient;
  kisClient: KISClient | null;
  bokClient: BokClient | null;
  kosisClient: KosisClient | null;
}

export function createSeedClients(options?: { quiet?: boolean }): SeedClients {
  const quiet = options?.quiet ?? false;

  const opendartKey = process.env.OPENDART_API_KEY;
  if (!opendartKey) throw new Error('OPENDART_API_KEY is required');
  const dartClient = new OpenDartClient({ apiKey: opendartKey });

  let kisClient: KISClient | null = null;
  if (process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET) {
    kisClient = new KISClient({
      appKey: process.env.KIS_APP_KEY,
      appSecret: process.env.KIS_APP_SECRET,
    });
  } else if (!quiet) {
    console.log('KIS_APP_KEY/KIS_APP_SECRET not set — skipping KIS data');
  }

  let bokClient: BokClient | null = null;
  if (process.env.BOK_API_KEY) {
    bokClient = new BokClient({ apiKey: process.env.BOK_API_KEY });
  } else if (!quiet) {
    console.log('BOK_API_KEY not set — skipping BOK data');
  }

  let kosisClient: KosisClient | null = null;
  if (process.env.KOSIS_API_KEY) {
    kosisClient = new KosisClient({ apiKey: process.env.KOSIS_API_KEY });
  } else if (!quiet) {
    console.log('KOSIS_API_KEY not set — skipping KOSIS data');
  }

  return { dartClient, kisClient, bokClient, kosisClient };
}

// ---------------------------------------------------------------------------
// Checkpoint helpers (re-exported for scripts that need them)
// ---------------------------------------------------------------------------

export function isSeeded(db: Database, corpCode: string, reportCode: string, year: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM seed_progress WHERE corp_code = ? AND report_code = ? AND year = ?'
  ).get(corpCode, reportCode, year);
  return row !== null;
}

export function markSeeded(db: Database, corpCode: string, reportCode: string, year: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO seed_progress (corp_code, report_code, year, status, seeded_at) VALUES (?, ?, ?, 'done', ?)`
  ).run(corpCode, reportCode, year, new Date().toISOString());
}

export function setMeta(db: Database, key: string, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO seed_meta (key, value) VALUES (?, ?)`).run(key, value);
}

export function getMeta(db: Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM seed_meta WHERE key = ?').get(key) as
    | { value: string }
    | null;
  return row?.value;
}

// ---------------------------------------------------------------------------
// Default DB path
// ---------------------------------------------------------------------------

export function defaultDbPath(): string {
  return new URL('../data/demo.sqlite', import.meta.url).pathname;
}
