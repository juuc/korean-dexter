---
title: "Unified Rate Limiter"
issue: 10
phase: 1-foundation
priority: critical
status: planned
type: infra
created: 2026-02-16
depends_on: ["[[phase-1-foundation/03-scaffold]]"]
blocks: ["[[phase-2-core/06-opendart]]", "[[phase-2-core/08-kis]]"]
tags: [infra, rate-limiting, api-management]
estimated_effort: medium
---

# Issue #10: Unified Rate Limiter

## Problem

OpenDART and KIS APIs have strict rate limits. Without rate limiting baked in from day 1:
- Requests fail with 429 errors
- API keys get throttled or banned
- Agent makes wasteful parallel requests that exceed limits
- No visibility into remaining quota

**This MUST be infrastructure from the start, not added later.**

---

## Rate Limits by API

### OpenDART

**Free Tier** (default):
- **Per-second**: ~2 requests/sec (undocumented, observed)
- **Per-minute**: ~60 requests/min (estimated)
- **Daily**: 1,000 requests/day (documented)

**Certified Tier** (requires 공동인증서):
- **Daily**: 10,000 requests/day (documented)

**Headers**: OpenDART does NOT return rate limit headers. Must track client-side.

---

### KIS API

**Per-Endpoint Limits** (varies):
- **Token issuance**: 1/day (access token), refresh max 1/min
- **현재가 시세** (stock price): ~20 requests/sec (paper trading)
- **OHLCV historical**: ~10 requests/sec
- **Investor flow**: ~5 requests/sec

**Headers**: KIS returns rate limit headers:
- `tr_cont`: continuation flag
- (May include quota info - validate during [[phase-1-foundation/01-assumptions|assumptions]])

---

## Token Bucket Algorithm

Classic token bucket for smooth rate limiting with burst capacity.

```typescript
// src/infra/rate-limiter.ts

export type RateLimitConfig = {
  /** Max requests per second */
  requestsPerSecond: number;

  /** Max burst capacity (tokens) */
  burstCapacity: number;

  /** Max requests per minute (optional, separate bucket) */
  requestsPerMinute?: number;

  /** Max requests per day (tracked separately) */
  requestsPerDay?: number;

  /** Warn at X% of daily quota */
  dailyWarnThreshold?: number;
};

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.burstCapacity;
    this.lastRefill = Date.now();
  }

  async consume(tokensRequired: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return;
    }

    // Not enough tokens - calculate wait time
    const tokensNeeded = tokensRequired - this.tokens;
    const waitMs = (tokensNeeded / this.config.requestsPerSecond) * 1000;

    await this.sleep(waitMs);

    // Refill after waiting
    this.refill();
    this.tokens -= tokensRequired;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const tokensToAdd = (elapsedMs / 1000) * this.config.requestsPerSecond;

    this.tokens = Math.min(
      this.tokens + tokensToAdd,
      this.config.burstCapacity
    );
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRemainingTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
```

---

## Unified Rate Limiter

Manages multiple token buckets per API with daily quota tracking.

```typescript
// src/infra/rate-limiter.ts

export type APILimitConfig = {
  perSecond: TokenBucket;
  perMinute?: TokenBucket;
  dailyQuota?: DailyQuotaTracker;
};

export class RateLimiter {
  private limits: Map<string, APILimitConfig> = new Map();
  private quotaFile: string = ".cache/rate-limits.json";

  constructor() {
    this.initializeAPIs();
    this.loadDailyQuotas();
  }

  private initializeAPIs(): void {
    // OpenDART free tier
    this.limits.set("opendart", {
      perSecond: new TokenBucket({
        requestsPerSecond: 2,
        burstCapacity: 5
      }),
      perMinute: new TokenBucket({
        requestsPerSecond: 60 / 60,  // 60/min = 1/sec average
        burstCapacity: 10
      }),
      dailyQuota: new DailyQuotaTracker({
        maxPerDay: 1000,
        warnThreshold: 0.8  // Warn at 800 requests
      })
    });

    // KIS API (현재가 시세 endpoint)
    this.limits.set("kis:stock-price", {
      perSecond: new TokenBucket({
        requestsPerSecond: 20,
        burstCapacity: 30
      })
    });

    // KIS API (historical OHLCV)
    this.limits.set("kis:ohlcv", {
      perSecond: new TokenBucket({
        requestsPerSecond: 10,
        burstCapacity: 15
      })
    });
  }

  async acquire(api: string): Promise<void> {
    const config = this.limits.get(api);
    if (!config) {
      throw new Error(`Unknown API: ${api}`);
    }

    // Check daily quota first
    if (config.dailyQuota) {
      await config.dailyQuota.checkAndIncrement();
    }

    // Acquire from per-second bucket
    await config.perSecond.consume(1);

    // Acquire from per-minute bucket (if configured)
    if (config.perMinute) {
      await config.perMinute.consume(1);
    }
  }

  getRemainingQuota(api: string): {
    perSecond: number;
    daily?: number;
  } {
    const config = this.limits.get(api);
    if (!config) return { perSecond: 0 };

    return {
      perSecond: config.perSecond.getRemainingTokens(),
      daily: config.dailyQuota?.getRemaining()
    };
  }

  private async loadDailyQuotas(): Promise<void> {
    // Load persisted daily counters from disk
    // Reset counters that are from a different day
  }

  async shutdown(): Promise<void> {
    // Persist daily counters to disk
    await this.saveDailyQuotas();
  }
}
```

---

## Daily Quota Tracker

Persists daily usage across restarts.

```typescript
// src/infra/rate-limiter.ts

export type DailyQuotaConfig = {
  maxPerDay: number;
  warnThreshold: number;  // 0.0 - 1.0
};

export class DailyQuotaTracker {
  private count: number = 0;
  private date: string;
  private config: DailyQuotaConfig;
  private warned: boolean = false;

  constructor(config: DailyQuotaConfig) {
    this.config = config;
    this.date = this.getTodayKey();
  }

  async checkAndIncrement(): Promise<void> {
    // Reset if new day
    const today = this.getTodayKey();
    if (today !== this.date) {
      this.count = 0;
      this.date = today;
      this.warned = false;
    }

    // Check if quota exceeded
    if (this.count >= this.config.maxPerDay) {
      throw new Error(
        `Daily quota exceeded: ${this.count}/${this.config.maxPerDay}. ` +
        `Quota resets at midnight KST.`
      );
    }

    // Warn at threshold
    const threshold = Math.floor(this.config.maxPerDay * this.config.warnThreshold);
    if (this.count >= threshold && !this.warned) {
      console.warn(
        `⚠️  Daily quota warning: ${this.count}/${this.config.maxPerDay} ` +
        `(${Math.floor((this.count / this.config.maxPerDay) * 100)}% used)`
      );
      this.warned = true;
    }

    this.count++;
  }

  getRemaining(): number {
    return Math.max(0, this.config.maxPerDay - this.count);
  }

  private getTodayKey(): string {
    // Use KST (Korea Standard Time) for OpenDART quota reset
    const now = new Date();
    const kstOffset = 9 * 60;  // UTC+9
    const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
    return kstTime.toISOString().split("T")[0];  // YYYY-MM-DD
  }

  serialize(): { count: number; date: string } {
    return { count: this.count, date: this.date };
  }

  static deserialize(data: { count: number; date: string }, config: DailyQuotaConfig): DailyQuotaTracker {
    const tracker = new DailyQuotaTracker(config);
    tracker.count = data.count;
    tracker.date = data.date;
    return tracker;
  }
}
```

---

## Persistence

```typescript
// src/infra/rate-limiter.ts

private async saveDailyQuotas(): Promise<void> {
  const quotas: Record<string, { count: number; date: string }> = {};

  for (const [api, config] of this.limits.entries()) {
    if (config.dailyQuota) {
      quotas[api] = config.dailyQuota.serialize();
    }
  }

  await fs.writeFile(
    this.quotaFile,
    JSON.stringify(quotas, null, 2),
    "utf-8"
  );
}

private async loadDailyQuotas(): Promise<void> {
  try {
    const data = await fs.readFile(this.quotaFile, "utf-8");
    const quotas = JSON.parse(data);

    for (const [api, config] of this.limits.entries()) {
      if (config.dailyQuota && quotas[api]) {
        const loaded = DailyQuotaTracker.deserialize(
          quotas[api],
          { maxPerDay: config.dailyQuota["config"].maxPerDay, warnThreshold: config.dailyQuota["config"].warnThreshold }
        );
        config.dailyQuota = loaded;
      }
    }
  } catch (err) {
    // File doesn't exist or parse error - use defaults
    console.log("No existing rate limit data, starting fresh");
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
    private rateLimiter: RateLimiter
  ) {}

  async getFinancialStatement(...params): Promise<FinancialStatement> {
    // Acquire rate limit token BEFORE making request
    await this.rateLimiter.acquire("opendart");

    // Now safe to make request
    const response = await fetch(dartUrl);
    return response.json();
  }
}
```

---

## Quota Visibility for Agent

Expose remaining quota so agent can reason about it.

```typescript
// Add to scratchpad context
const quotaInfo = rateLimiter.getRemainingQuota("opendart");

scratchpad.addContext(`
Rate Limits:
- OpenDART: ${quotaInfo.daily} / 1000 requests remaining today
- Current burst capacity: ${quotaInfo.perSecond} tokens

If quota is low, prefer cached results or limit query scope.
`);
```

**Agent Reasoning**: If quota < 100, LLM might decide to:
- Use cached data instead of fresh queries
- Reduce number of companies in comparison
- Warn user about approaching limit

---

## Test Cases

```typescript
// tests/unit/rate-limiter.test.ts

describe("TokenBucket", () => {
  it("allows burst up to capacity", async () => {
    const bucket = new TokenBucket({
      requestsPerSecond: 2,
      burstCapacity: 5
    });

    // Should allow 5 immediate requests
    for (let i = 0; i < 5; i++) {
      await bucket.consume(1);  // Should not block
    }
  });

  it("throttles when bucket empty", async () => {
    const bucket = new TokenBucket({
      requestsPerSecond: 2,
      burstCapacity: 2
    });

    // Consume burst
    await bucket.consume(2);

    // Next consume should wait
    const start = Date.now();
    await bucket.consume(1);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(400);  // ~500ms wait for 1 token at 2/sec
  });
});

describe("DailyQuotaTracker", () => {
  it("resets at midnight KST", async () => {
    const tracker = new DailyQuotaTracker({
      maxPerDay: 1000,
      warnThreshold: 0.8
    });

    // Simulate usage
    for (let i = 0; i < 10; i++) {
      await tracker.checkAndIncrement();
    }
    expect(tracker.getRemaining()).toBe(990);

    // Simulate date change
    tracker["date"] = "2025-01-01";
    await tracker.checkAndIncrement();
    expect(tracker.getRemaining()).toBe(999);  // Reset
  });

  it("throws when quota exceeded", async () => {
    const tracker = new DailyQuotaTracker({
      maxPerDay: 5,
      warnThreshold: 0.8
    });

    for (let i = 0; i < 5; i++) {
      await tracker.checkAndIncrement();
    }

    await expect(tracker.checkAndIncrement()).rejects.toThrow("Daily quota exceeded");
  });
});

describe("RateLimiter integration", () => {
  it("enforces both per-second and daily limits", async () => {
    const limiter = new RateLimiter();

    // Should allow requests up to burst capacity
    for (let i = 0; i < 5; i++) {
      await limiter.acquire("opendart");
    }

    // Next request should throttle
    const start = Date.now();
    await limiter.acquire("opendart");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(400);
  });
});
```

---

## Acceptance Criteria

- [ ] `TokenBucket` class implemented with refill logic
- [ ] `DailyQuotaTracker` implemented with KST reset logic
- [ ] `RateLimiter` manages multiple APIs (opendart, kis:stock-price, kis:ohlcv)
- [ ] Daily quota persists to `.cache/rate-limits.json`
- [ ] Daily quota resets at midnight KST
- [ ] Warning logged at 80% daily quota
- [ ] Error thrown when daily quota exceeded
- [ ] `getRemainingQuota()` returns accurate counts
- [ ] Unit tests pass for all components
- [ ] TypeScript strict mode with no `any` types

---

## Deliverables

1. `src/infra/rate-limiter.ts` - TokenBucket, DailyQuotaTracker, RateLimiter
2. `tests/unit/rate-limiter.test.ts` - Comprehensive test suite
3. `.cache/rate-limits.json` - Persisted daily quotas (gitignored)

---

## Timeline

**Effort**: Medium (1-2 days)
**Parallelizable**: Yes (can work in parallel with [[phase-1-foundation/05-data-model|data model]] and [[phase-1-foundation/11-cache|cache]])

---

## Dependencies

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] - need project structure

---

## Blocks

- [[phase-2-core/06-opendart|OpenDART Client]] - must acquire rate limit before every request
- [[phase-2-core/08-kis|KIS Client]] - must acquire rate limit before every request

---

## Notes

- **Bake this in from day 1**. Adding rate limiting later is painful (every call site must be updated).
- **KST timezone matters**: OpenDART quota resets at midnight Korea time, not UTC.
- **Agent visibility**: Expose remaining quota to LLM so it can adapt behavior.
- **Per-endpoint configs**: KIS has different limits per endpoint. Use separate buckets.
- Consider adding retry logic with exponential backoff for transient failures (separate from rate limiting).
