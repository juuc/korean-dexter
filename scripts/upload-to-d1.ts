#!/usr/bin/env bun
/**
 * Upload local SQLite demo data to Cloudflare D1.
 * Generates a SQL dump file that can be executed via wrangler.
 */

import { Database } from 'bun:sqlite';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(import.meta.dirname, '..', 'data', 'demo.sqlite');
const DUMP_PATH = join(import.meta.dirname, '..', 'data', 'd1-dump.sql');
const BATCH_SIZE = 50;

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

interface ResponseRow {
  key: string;
  data: string;
  source: string;
  created_at: string;
}

interface CorpMappingRow {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

function generateInsertBatches<T>(
  rows: T[],
  table: string,
  columns: (keyof T & string)[]
): string[] {
  const statements: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesList = batch
      .map(
        (row) =>
          `(${columns.map((col) => `'${escapeSql(String(row[col] ?? ''))}'`).join(', ')})`
      )
      .join(',\n  ');

    statements.push(
      `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES\n  ${valuesList};`
    );
  }

  return statements;
}

function main(): void {
  console.log(`Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH, { readonly: true });

  const responses = db.query<ResponseRow, []>('SELECT key, data, source, created_at FROM responses').all();
  const corpMappings = db.query<CorpMappingRow, []>('SELECT corp_code, corp_name, stock_code, modify_date FROM corp_mappings').all();

  console.log(`Found ${responses.length} response rows`);
  console.log(`Found ${corpMappings.length} corp mapping rows`);

  const lines: string[] = [
    '-- Korean Dexter D1 dump',
    `-- Generated: ${new Date().toISOString()}`,
    '',
    '-- Create tables',
    `CREATE TABLE IF NOT EXISTS responses (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);`,
    '',
    `CREATE TABLE IF NOT EXISTS corp_mappings (
  corp_code TEXT PRIMARY KEY,
  corp_name TEXT NOT NULL,
  stock_code TEXT NOT NULL,
  modify_date TEXT NOT NULL
);`,
    '',
    '-- Insert responses',
    ...generateInsertBatches<ResponseRow>(responses, 'responses', ['key', 'data', 'source', 'created_at']),
    '',
    '-- Insert corp_mappings',
    ...generateInsertBatches<CorpMappingRow>(corpMappings, 'corp_mappings', ['corp_code', 'corp_name', 'stock_code', 'modify_date']),
  ];

  const sql = lines.join('\n');
  writeFileSync(DUMP_PATH, sql, 'utf-8');

  console.log(`\nDump written to: ${DUMP_PATH}`);
  console.log('\nNext step — upload to D1:');
  console.log('  cd worker && npx wrangler d1 execute korean-dexter-cache --remote --file=../data/d1-dump.sql');

  db.close();
}

main();
