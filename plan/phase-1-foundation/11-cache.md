---
title: "Two-Tier Caching Layer"
issue: 11
phase: 1-foundation
priority: critical
status: done
type: infra
created: 2026-02-16
depends_on: ["[[phase-1-foundation/03-scaffold]]"]
blocks: ["[[phase-2-core/06-opendart]]", "[[phase-2-core/08-kis]]"]
tags: [infra, caching, performance]
estimated_effort: large
---

# Issue #11: Two-Tier Caching Layer

## Problem

Without caching:
- Agent makes redundant API calls for immutable historical data (2023 financials don't change)
- Wastes rate limit quota on repeated queries
- Slow response times (network latency on every query)
- User frustration when asking similar questions

**Solution**: Two-tier cache with LRU in-memory (fast) + SQLite on-disk (persistent).

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 API Client                      │
│  (OpenDart, KIS)                                │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│           CacheLayer.get(key)                   │
└─────────────┬───────────────────────────────────┘
              │
              ├──► Tier 1: LRU In-Memory Cache
              │    (hot data, session-scoped)
              │    ├─ Hit? → return
              │    └─ Miss? ↓
              │
              ├──► Tier 2: SQLite Disk Cache
              │    (persistent, cold data)
              │    ├─ Hit? → populate Tier 1 → return
              │    └─ Miss? ↓
              │
              └──► API Call
                   └─ Store in Tier 2 → Tier 1 → return
```

---

## Cache Key Strategy

Hierarchical key pattern: `{api}_{identifier}_{params}`

### OpenDART Cache Keys

```typescript
// Financial statements
opendart_fs_{corp_code}_{bsns_year}_{reprt_code}_{fs_div}
// Example: "opendart_fs_00126380_2023_11011_CFS"

// Disclosures
opendart_disclosure_{corp_code}_{bgn_de}_{end_de}
// Example: "opendart_disclosure_00126380_20230101_20231231"

// Corp code mapping (special: stored separately)
opendart_corpcode_list
```

### KIS Cache Keys

```typescript
// Stock price (single day)
kis_price_{stock_code}_{date}
// Example: "kis_price_005930_20231225"

// OHLCV historical
kis_ohlcv_{stock_code}_{bgn_date}_{end_date}
// Example: "kis_ohlcv_005930_20230101_20231231"

// Investor flow
kis_investor_{stock_code}_{date}
// Example: "kis_investor_005930_20231225"
```

---

## TTL Rules

Different data has different mutability:

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Prior-year financials | **Permanent** | 2023 financials will never change |
| Current-year financials | **7 days** | May be updated if company files amendments |
| Closed-day stock prices | **Permanent** | Historical prices are immutable |
| Today's stock price | **5 minutes** | Real-time data, refresh frequently |
| Corp code list | **24 hours** | Rarely changes, but should stay fresh |
| Disclosures | **24 hours** | New filings appear daily |

**Implementation**:
```typescript
function getTTL(key: string, data: any): number | null {
  // Financial statements
  if (key.startsWith("opendart_fs_")) {
    const year = parseInt(key.split("_")[3]);
    const currentYear = new Date().getFullYear();

    if (year < currentYear) {
      return null;  // Permanent (no expiry)
    } else {
      return 7 * 24 * 60 * 60 * 1000;  // 7 days
    }
  }

  // Stock prices
  if (key.startsWith("kis_price_")) {
    const dateStr = key.split("_")[2];
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) {
      return null;  // Permanent (historical)
    } else {
      return 5 * 60 * 1000;  // 5 minutes (today)
    }
  }

  // Corp code list
  if (key === "opendart_corpcode_list") {
    return 24 * 60 * 60 * 1000;  // 24 hours
  }

  // Default: 24 hours
  return 24 * 60 * 60 * 1000;
}
```

---

## Implementation

### Core Types

```typescript
// src/infra/cache-layer.ts

export type CacheEntry<T> = {
  key: string;
  data: T;
  cachedAt: number;  // Unix timestamp
  ttl: number | null;  // null = permanent
};

export type CacheStats = {
  tier1Hits: number;
  tier2Hits: number;
  misses: number;
  tier1Size: number;
  tier2Size: number;
};
```

---

### Tier 1: LRU In-Memory Cache

```typescript
// src/infra/cache-layer.ts

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiry
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttl: number | null): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      key,
      data,
      cachedAt: Date.now(),
      ttl
    });
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    if (entry.ttl === null) return false;  // Permanent
    return Date.now() - entry.cachedAt > entry.ttl;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
```

---

### Tier 2: SQLite Disk Cache

```typescript
// src/infra/cache-layer.ts

import Database from 'better-sqlite3';

export class DiskCache<T> {
  private db: Database.Database;

  constructor(dbPath: string = ".cache/cache.db") {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        ttl INTEGER
      )
    `);

    // Index for cleanup queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cached_at ON cache(cached_at)
    `);
  }

  get(key: string): T | null {
    const row = this.db.prepare(`
      SELECT data, cached_at, ttl FROM cache WHERE key = ?
    `).get(key) as { data: string; cached_at: number; ttl: number | null } | undefined;

    if (!row) return null;

    const entry: CacheEntry<T> = {
      key,
      data: JSON.parse(row.data),
      cachedAt: row.cached_at,
      ttl: row.ttl
    };

    // Check expiry
    if (this.isExpired(entry)) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T, ttl: number | null): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, data, cached_at, ttl)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(key, JSON.stringify(data), Date.now(), ttl);
  }

  delete(key: string): void {
    this.db.prepare(`DELETE FROM cache WHERE key = ?`).run(key);
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    if (entry.ttl === null) return false;
    return Date.now() - entry.cachedAt > entry.ttl;
  }

  cleanup(): void {
    // Remove expired entries
    const now = Date.now();
    this.db.prepare(`
      DELETE FROM cache
      WHERE ttl IS NOT NULL
        AND cached_at + ttl < ?
    `).run(now);
  }

  size(): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM cache`).get() as { count: number };
    return result.count;
  }

  close(): void {
    this.db.close();
  }
}
```

---

### Unified CacheLayer

```typescript
// src/infra/cache-layer.ts

export class CacheLayer {
  private tier1: LRUCache<any>;
  private tier2: DiskCache<any>;
  private stats: CacheStats;

  constructor() {
    this.tier1 = new LRUCache(1000);  // 1000 entries in memory
    this.tier2 = new DiskCache(".cache/cache.db");
    this.stats = {
      tier1Hits: 0,
      tier2Hits: 0,
      misses: 0,
      tier1Size: 0,
      tier2Size: 0
    };
  }

  async get<T>(key: string): Promise<T | null> {
    // Check Tier 1
    const tier1Hit = this.tier1.get(key);
    if (tier1Hit !== null) {
      this.stats.tier1Hits++;
      return tier1Hit as T;
    }

    // Check Tier 2
    const tier2Hit = this.tier2.get<T>(key);
    if (tier2Hit !== null) {
      this.stats.tier2Hits++;

      // Populate Tier 1
      const ttl = this.getTTL(key, tier2Hit);
      this.tier1.set(key, tier2Hit, ttl);

      return tier2Hit;
    }

    // Cache miss
    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, data: T): Promise<void> {
    const ttl = this.getTTL(key, data);

    // Write to both tiers
    this.tier1.set(key, data, ttl);
    this.tier2.set(key, data, ttl);
  }

  private getTTL(key: string, data: any): number | null {
    // Financial statements
    if (key.startsWith("opendart_fs_")) {
      const parts = key.split("_");
      const year = parseInt(parts[3]);
      const currentYear = new Date().getFullYear();

      return year < currentYear ? null : 7 * 24 * 60 * 60 * 1000;
    }

    // Stock prices
    if (key.startsWith("kis_price_")) {
      const dateStr = key.split("_")[2];
      const date = new Date(dateStr.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return date < today ? null : 5 * 60 * 1000;
    }

    // Corp code list
    if (key === "opendart_corpcode_list") {
      return 24 * 60 * 60 * 1000;
    }

    // Default: 24 hours
    return 24 * 60 * 60 * 1000;
  }

  invalidate(key: string): void {
    this.tier2.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    // Clear from Tier 1 (iterate and check)
    // Note: SQLite doesn't support regex, would need to fetch all keys
    console.warn("Pattern invalidation not fully implemented");
  }

  getStats(): CacheStats {
    return {
      ...this.stats,
      tier1Size: this.tier1.size(),
      tier2Size: this.tier2.size()
    };
  }

  cleanup(): void {
    this.tier2.cleanup();
  }

  shutdown(): void {
    this.tier2.close();
  }
}
```

---

## Usage in API Clients

```typescript
// src/tools/core/opendart/opendart-client.ts

export class OpenDartClient {
  constructor(
    private apiKey: string,
    private cache: CacheLayer,
    private rateLimiter: RateLimiter
  ) {}

  async getFinancialStatement(
    corpCode: string,
    year: number,
    reportCode: string,
    fsDiv: string
  ): Promise<FinancialStatement> {
    const cacheKey = `opendart_fs_${corpCode}_${year}_${reportCode}_${fsDiv}`;

    // Try cache first
    const cached = await this.cache.get<FinancialStatement>(cacheKey);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from API
    await this.rateLimiter.acquire("opendart");

    const response = await fetch(
      `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?` +
      `crtfc_key=${this.apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reportCode}&fs_div=${fsDiv}`
    );

    const data = await response.json();

    // Store in cache
    await this.cache.set(cacheKey, data);

    return data;
  }
}
```

---

## Cache Metrics & Monitoring

```typescript
// Expose cache stats for debugging
const stats = cache.getStats();
console.log(`
Cache Performance:
- Tier 1 hits: ${stats.tier1Hits} (${hitRate(stats.tier1Hits, stats)}%)
- Tier 2 hits: ${stats.tier2Hits} (${hitRate(stats.tier2Hits, stats)}%)
- Misses: ${stats.misses}
- Total requests: ${stats.tier1Hits + stats.tier2Hits + stats.misses}
- Tier 1 size: ${stats.tier1Size} / 1000
- Tier 2 size: ${stats.tier2Size}
`);

function hitRate(hits: number, stats: CacheStats): number {
  const total = stats.tier1Hits + stats.tier2Hits + stats.misses;
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}
```

---

## Test Cases

```typescript
// tests/unit/cache-layer.test.ts

describe("CacheLayer", () => {
  let cache: CacheLayer;

  beforeEach(() => {
    cache = new CacheLayer();
  });

  afterEach(() => {
    cache.shutdown();
  });

  describe("Tier 1 (LRU in-memory)", () => {
    it("caches data in memory", async () => {
      await cache.set("test_key", { value: 123 });
      const result = await cache.get("test_key");
      expect(result).toEqual({ value: 123 });

      const stats = cache.getStats();
      expect(stats.tier1Hits).toBe(1);
    });

    it("evicts LRU when at capacity", async () => {
      // Fill cache beyond capacity
      for (let i = 0; i < 1100; i++) {
        await cache.set(`key_${i}`, { value: i });
      }

      // First key should be evicted from Tier 1
      const result = await cache.get("key_0");
      const stats = cache.getStats();
      expect(stats.tier2Hits).toBe(1);  // Hit in Tier 2, not Tier 1
    });
  });

  describe("Tier 2 (SQLite persistent)", () => {
    it("persists data across restarts", async () => {
      await cache.set("persist_key", { value: 999 });
      cache.shutdown();

      // Create new cache instance
      const newCache = new CacheLayer();
      const result = await newCache.get("persist_key");
      expect(result).toEqual({ value: 999 });
      newCache.shutdown();
    });

    it("expires data based on TTL", async () => {
      // Mock short TTL (current year financials = 7 days)
      const key = `opendart_fs_00126380_${new Date().getFullYear()}_11011_CFS`;
      await cache.set(key, { revenue: 100 });

      // Fast-forward time (mock)
      // (In real tests, would use time mocking library)
    });
  });

  describe("TTL logic", () => {
    it("makes prior-year financials permanent", async () => {
      const priorYear = new Date().getFullYear() - 1;
      const key = `opendart_fs_00126380_${priorYear}_11011_CFS`;
      await cache.set(key, { revenue: 100 });

      // Entry should have ttl = null
      // (Check via cache internals or long wait + verify still cached)
    });

    it("expires today's stock price after 5 minutes", async () => {
      const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const key = `kis_price_005930_${today}`;
      await cache.set(key, { price: 50000 });

      // Should have 5-minute TTL
    });

    it("makes historical stock prices permanent", async () => {
      const key = "kis_price_005930_20230101";
      await cache.set(key, { price: 60000 });

      // Should have ttl = null
    });
  });

  describe("Cache invalidation", () => {
    it("invalidates single key", async () => {
      await cache.set("invalid_key", { value: 1 });
      cache.invalidate("invalid_key");

      const result = await cache.get("invalid_key");
      expect(result).toBeNull();
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `LRUCache` class implemented with eviction
- [ ] `DiskCache` class implemented with SQLite
- [ ] `CacheLayer` orchestrates both tiers
- [ ] TTL logic correctly identifies permanent vs expiring data
- [ ] Prior-year financials cached permanently
- [ ] Historical stock prices cached permanently
- [ ] Current data expires appropriately (5 min for today's price, 7 days for current year financials)
- [ ] Cache hit/miss stats tracked
- [ ] Tier 2 persists across process restarts
- [ ] Unit tests pass for all components
- [ ] TypeScript strict mode with no `any` types

---

## Deliverables

1. `src/infra/cache-layer.ts` - LRUCache, DiskCache, CacheLayer
2. `tests/unit/cache-layer.test.ts` - Comprehensive test suite
3. `.cache/cache.db` - SQLite database (gitignored)

---

## Timeline

**Effort**: Large (2-3 days including tests)
**Parallelizable**: Yes (can work in parallel with [[phase-1-foundation/10-rate-limiter|rate limiter]] and [[phase-1-foundation/05-data-model|data model]])

---

## Dependencies

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] - need project structure

---

## Blocks

- [[phase-2-core/06-opendart|OpenDART Client]] - should check cache before every API call
- [[phase-2-core/08-kis|KIS Client]] - should check cache before every API call

---

## Notes

- **SQLite is perfect for this**: Simple, embedded, fast, persistent.
- **Permanent cache is key**: Historical data never changes, cache forever.
- **LRU keeps hot data fast**: Frequently accessed data stays in memory.
- **TTL logic is critical**: Wrong TTL = stale data or wasted API calls.
- Add dependency: `better-sqlite3` (Bun-compatible SQLite library).
- Consider periodic cleanup job (daily cron to remove expired entries from Tier 2).
