import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCacheKey } from './cache.js';
import type { ToolResult } from '@/shared/types.js';
import type { DartClientLike } from '@/tools/core/opendart/client.js';
import type { KisClientLike } from '@/tools/core/kis/client.js';
import type { BokClientLike } from '@/tools/core/bok/client.js';
import type { KosisClientLike } from '@/tools/core/kosis/client.js';

const DEMO_DB_PATH = join(import.meta.dir, '..', '..', 'data', 'demo.sqlite');

let _db: Database | null = null;

function getDemoDb(): Database | null {
  if (!existsSync(DEMO_DB_PATH)) return null;
  if (_db === null) {
    _db = new Database(DEMO_DB_PATH, { readonly: true });
  }
  return _db;
}

function lookupResponse<T>(
  api: 'opendart' | 'kis' | 'bok' | 'kosis',
  endpoint: string,
  params: Record<string, string>
): ToolResult<T> {
  const db = getDemoDb();
  const key = buildCacheKey(api, endpoint, params);

  if (db !== null) {
    // Type-safe SQLite row access via explicit cast
    const row = db.query<{ data: string }, [string]>(
      'SELECT data FROM responses WHERE key = ?'
    ).get(key);

    if (row !== null) {
      return {
        success: true,
        data: JSON.parse(row.data) as T,
        metadata: { responseTimeMs: 0 },
      };
    }
  }

  return {
    success: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      message: 'Demo data not available for this query. Set API keys for live data.',
      retryable: false,
      apiSource: api,
    },
    metadata: { responseTimeMs: 0 },
  };
}

export class DemoDartClient implements DartClientLike {
  request<T>(
    endpoint: string,
    params: Record<string, string>
  ): Promise<ToolResult<T>> {
    return Promise.resolve(lookupResponse<T>('opendart', endpoint, params));
  }
}

export class DemoKisClient implements KisClientLike {
  request<T>(
    _method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>
  ): Promise<ToolResult<T>> {
    return Promise.resolve(lookupResponse<T>('kis', path, params));
  }
}

export class DemoBokClient implements BokClientLike {
  request<T>(
    endpoint: string,
    params: Record<string, string>
  ): Promise<ToolResult<T>> {
    return Promise.resolve(lookupResponse<T>('bok', endpoint, params));
  }
}

export class DemoKosisClient implements KosisClientLike {
  request<T>(
    endpoint: string,
    params: Record<string, string>
  ): Promise<ToolResult<T>> {
    return Promise.resolve(lookupResponse<T>('kosis', endpoint, params));
  }
}

export function loadDemoCorpCodes(): Array<{
  corp_code: string;
  corp_name: string;
  stock_code: string;
}> {
  const db = getDemoDb();
  if (db === null) return [];
  return db
    .query<{ corp_code: string; corp_name: string; stock_code: string }, []>(
      'SELECT corp_code, corp_name, stock_code FROM corp_mappings'
    )
    .all();
}

export function isDemoDbAvailable(): boolean {
  return existsSync(DEMO_DB_PATH);
}
