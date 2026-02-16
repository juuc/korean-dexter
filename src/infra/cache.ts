import { Database } from 'bun:sqlite';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LRU (Least Recently Used) in-memory cache with TTL support.
 * O(1) get/set operations using Map with access-order tracking.
 */
export class LRUCache<T> {
  private readonly cache: Map<string, CacheEntry<T>> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check TTL expiry
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Delete existing entry if present
    this.cache.delete(key);

    // Evict least recently used if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = ttlMs <= 0 ? null : Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt, key });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number | null;
  readonly key: string;
}

/**
 * SQLite-backed disk cache with TTL support.
 * Stores JSON-serialized data with hit count tracking.
 */
export class DiskCache {
  private readonly db: Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = join(dbPath, '..');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        hit_count INTEGER DEFAULT 0
      )
    `);

    // Index for prefix-based invalidation
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_key_prefix ON cache_entries(key)
    `);

    // Index for pruning expired entries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_expires_at ON cache_entries(expires_at)
    `);
  }

  get<T>(key: string): T | null {
    const stmt = this.db.prepare(
      'SELECT data, expires_at FROM cache_entries WHERE key = ?'
    );

    const row = stmt.get(key) as
      | { data: string; expires_at: string | null }
      | undefined;
    if (!row) {
      return null;
    }

    // Check expiry
    if (row.expires_at !== null && new Date(row.expires_at) < new Date()) {
      this.delete(key);
      return null;
    }

    // Increment hit count
    const updateStmt = this.db.prepare(
      'UPDATE cache_entries SET hit_count = hit_count + 1 WHERE key = ?'
    );
    updateStmt.run(key);

    return JSON.parse(row.data) as T;
  }

  set<T>(key: string, data: T, ttlMs: number | null): void {
    const createdAt = new Date().toISOString();
    const expiresAt =
      ttlMs === null ? null : new Date(Date.now() + ttlMs).toISOString();
    const dataJson = JSON.stringify(data);

    const stmt = this.db.prepare(`
      INSERT INTO cache_entries (key, data, created_at, expires_at, hit_count)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(key) DO UPDATE SET
        data = excluded.data,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        hit_count = 0
    `);

    stmt.run(key, dataJson, createdAt, expiresAt);
  }

  has(key: string): boolean {
    const stmt = this.db.prepare(
      'SELECT expires_at FROM cache_entries WHERE key = ?'
    );

    const row = stmt.get(key) as { expires_at: string | null } | undefined;
    if (!row) {
      return false;
    }

    if (row.expires_at !== null && new Date(row.expires_at) < new Date()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const stmt = this.db.prepare('DELETE FROM cache_entries WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  invalidateByPrefix(prefix: string): number {
    const stmt = this.db.prepare(
      'DELETE FROM cache_entries WHERE key LIKE ?'
    );
    const result = stmt.run(`${prefix}%`);
    return result.changes;
  }

  getStats(): CacheStats {
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM cache_entries'
    );
    const countRow = countStmt.get() as { count: number } | undefined;
    const entries = countRow?.count ?? 0;

    const sizeStmt = this.db.prepare(
      'SELECT SUM(LENGTH(data)) as total FROM cache_entries'
    );
    const sizeRow = sizeStmt.get() as { total: number | null } | undefined;
    const sizeBytes = sizeRow?.total ?? 0;

    const hitsStmt = this.db.prepare(
      'SELECT SUM(hit_count) as total FROM cache_entries'
    );
    const hitsRow = hitsStmt.get() as { total: number | null } | undefined;
    const hitCount = hitsRow?.total ?? 0;

    // missCount is not tracked in DB, would require additional state
    const missCount = 0;

    return { entries, sizeBytes, hitCount, missCount };
  }

  prune(): number {
    const stmt = this.db.prepare(
      'DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at < ?'
    );
    const result = stmt.run(new Date().toISOString());
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

interface CacheStats {
  readonly entries: number;
  readonly sizeBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
}

/**
 * Cache-through wrapper for API calls with two-tier caching (LRU + disk).
 * Checks LRU first, then disk, then calls API if both miss.
 */
export async function cachedApiCall<T>(
  key: string,
  ttlMs: number | null,
  apiFn: () => Promise<T>,
  options?: {
    lruCache?: LRUCache<T>;
    diskCache?: DiskCache;
    forceRefresh?: boolean;
  }
): Promise<CachedApiResult<T>> {
  const { lruCache, diskCache, forceRefresh = false } = options ?? {};

  // Check LRU first (if not forcing refresh)
  if (!forceRefresh && lruCache) {
    const lruResult = lruCache.get(key);
    if (lruResult !== null) {
      return {
        data: lruResult,
        fromCache: true,
        cacheLayer: 'memory',
      };
    }
  }

  // Check disk (if not forcing refresh)
  if (!forceRefresh && diskCache) {
    const diskResult = diskCache.get<T>(key);
    if (diskResult !== null) {
      // Populate LRU for future hits
      if (lruCache && ttlMs !== null) {
        lruCache.set(key, diskResult, ttlMs);
      }
      return {
        data: diskResult,
        fromCache: true,
        cacheLayer: 'disk',
      };
    }
  }

  // Cache miss or force refresh - call API
  const data = await apiFn();

  // Store in both caches
  if (lruCache && ttlMs !== null) {
    lruCache.set(key, data, ttlMs);
  }
  if (diskCache) {
    diskCache.set(key, data, ttlMs);
  }

  return {
    data,
    fromCache: false,
  };
}

interface CachedApiResult<T> {
  readonly data: T;
  readonly fromCache: boolean;
  readonly cacheLayer?: 'memory' | 'disk';
}

/**
 * Build deterministic cache key from API parameters.
 * Format: "{api}:{endpoint}:{sorted_params_hash}"
 */
export function buildCacheKey(
  api: string,
  endpoint: string,
  params: Record<string, string | number>
): string {
  // Sort params alphabetically for deterministic keys
  const sortedKeys = Object.keys(params).sort();
  const paramValues = sortedKeys.map((k) => params[k]).join('_');
  return `${api}:${endpoint}:${paramValues}`;
}

/**
 * TTL constants for different types of financial data.
 */
export const CACHE_TTL = {
  /** Prior-year financials, closed-day prices - immutable */
  PERMANENT: null,
  /** Company info - 30 days */
  LONG: 30 * 24 * 60 * 60 * 1000,
  /** Current-year financials - 7 days */
  MEDIUM: 7 * 24 * 60 * 60 * 1000,
  /** Disclosure search results - 1 hour */
  SHORT: 60 * 60 * 1000,
  /** Current stock price (market hours) - 30 seconds */
  LIVE: 30 * 1000,
  /** Current stock price (after hours) - 1 hour */
  AFTER_HOURS: 60 * 60 * 1000,
  /** Corp code mapping - 24 hours */
  CORP_CODE: 24 * 60 * 60 * 1000,
} as const;

/**
 * Create default cache instances with standard configuration.
 */
export function createDefaultCaches(dbPath?: string): {
  lru: LRUCache<unknown>;
  disk: DiskCache;
} {
  const defaultDbPath =
    dbPath ?? join(homedir(), '.korean-dexter', 'cache.sqlite');
  return {
    lru: new LRUCache<unknown>(500),
    disk: new DiskCache(defaultDbPath),
  };
}
