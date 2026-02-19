import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rate limit configuration for each API with multi-tier token buckets.
 */
export interface RateLimitConfig {
  readonly maxPerSecond: number;
  readonly maxPerMinute: number;
  readonly maxPerDay: number;
  readonly retryAfterMs: number;
  readonly maxRetries: number;
}

/**
 * Predefined rate limit configs for Korean financial APIs.
 */
export const API_RATE_LIMITS: Record<string, RateLimitConfig> = {
  opendart: {
    maxPerSecond: 2,
    maxPerMinute: 60,
    maxPerDay: 20_000,    // actual limit is ~20,000+
    retryAfterMs: 1000,
    maxRetries: 3,
  },
  kis: {
    maxPerSecond: 5,
    maxPerMinute: 100,
    maxPerDay: 100_000,   // no documented daily limit
    retryAfterMs: 200,
    maxRetries: 3,
  },
  bok: {
    maxPerSecond: 2,
    maxPerMinute: 30,
    maxPerDay: 50_000,    // no documented daily limit
    retryAfterMs: 1000,
    maxRetries: 3,
  },
  kosis: {
    maxPerSecond: 1,
    maxPerMinute: 20,
    maxPerDay: 10_000,    // dev accounts: 1,000 traffic refers to data rows, not API calls
    retryAfterMs: 2000,
    maxRetries: 3,
  },
};

/**
 * Daily quota persistence format.
 */
interface DailyQuotaState {
  readonly dailyUsed: number;
  readonly resetAt: string; // ISO 8601 timestamp in KST
}

/**
 * Result returned from acquire() operation.
 */
export interface AcquireResult {
  readonly remainingDaily: number;
}

/**
 * Status information for the rate limiter.
 */
export interface RateLimiterStatus {
  readonly dailyUsed: number;
  readonly dailyRemaining: number;
  readonly dailyPercentUsed: number;
  readonly isNearLimit: boolean;
}

/**
 * Token bucket for rate limiting at a specific tier (second/minute).
 */
class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const intervalsElapsed = Math.floor(elapsed / this.refillIntervalMs);

    if (intervalsElapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + intervalsElapsed);
      this.lastRefillTime = now;
    }
  }

  /**
   * Try to consume a token. Returns true if successful.
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token becomes available.
   */
  timeUntilRefill(): number {
    if (this.tokens > 0) {
      return 0;
    }
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    return Math.max(0, this.refillIntervalMs - elapsed);
  }
}

/**
 * Multi-tier token bucket rate limiter with daily quota persistence.
 */
export class RateLimiter {
  private readonly secondBucket: TokenBucket;
  private readonly minuteBucket: TokenBucket;
  private dailyUsed: number = 0;
  private resetAt: Date;
  private readonly stateFilePath: string;

  constructor(
    private readonly apiName: string,
    private readonly config: RateLimitConfig,
    private readonly customStateDir?: string
  ) {
    // Initialize token buckets
    this.secondBucket = new TokenBucket(config.maxPerSecond, 1000);
    this.minuteBucket = new TokenBucket(config.maxPerMinute, 60000);

    // Setup state file path
    const stateDir =
      customStateDir ?? join(homedir(), '.korean-dexter', 'rate-limits');
    this.stateFilePath = join(stateDir, `${apiName}.json`);

    // Initialize daily quota
    this.resetAt = this.getNextMidnightKST();
    this.loadDailyQuota();
  }

  /**
   * Get next midnight in KST (UTC+9).
   */
  private getNextMidnightKST(): Date {
    const now = new Date();
    const kstOffset = 9 * 60; // KST is UTC+9
    const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
    kstTime.setUTCHours(0, 0, 0, 0);
    kstTime.setUTCDate(kstTime.getUTCDate() + 1);
    return new Date(kstTime.getTime() - kstOffset * 60 * 1000);
  }

  /**
   * Load daily quota from disk.
   */
  private loadDailyQuota(): void {
    try {
      const text = readFileSync(this.stateFilePath, 'utf-8');
      const state = JSON.parse(text) as DailyQuotaState;
      const resetAt = new Date(state.resetAt);

      // Check if quota has reset
      if (resetAt > new Date()) {
        this.dailyUsed = state.dailyUsed;
        this.resetAt = resetAt;
      }
    } catch {
      // File doesn't exist or is invalid, use defaults
    }
  }

  /**
   * Save daily quota to disk.
   */
  private async saveDailyQuota(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = this.stateFilePath.substring(
        0,
        this.stateFilePath.lastIndexOf('/')
      );
      await mkdir(dir, { recursive: true });

      const state: DailyQuotaState = {
        dailyUsed: this.dailyUsed,
        resetAt: this.resetAt.toISOString(),
      };

      await Bun.write(this.stateFilePath, JSON.stringify(state, null, 2));
    } catch (error) {
      // Silent failure for non-critical persistence
      console.warn(
        `Failed to save rate limit state for ${this.apiName}:`,
        error
      );
    }
  }

  /**
   * Check if daily quota needs reset.
   */
  private checkDailyReset(): void {
    if (new Date() >= this.resetAt) {
      this.dailyUsed = 0;
      this.resetAt = this.getNextMidnightKST();
    }
  }

  /**
   * Acquire a token, blocking if rate limited.
   * @returns Remaining daily quota
   */
  async acquire(): Promise<AcquireResult> {
    this.checkDailyReset();

    // Check daily quota first
    if (this.dailyUsed >= this.config.maxPerDay) {
      throw new Error(
        `Daily quota exhausted for ${this.apiName} (${this.config.maxPerDay} requests/day)`
      );
    }

    let retries = 0;

    while (retries < this.config.maxRetries) {
      // Try to consume from second bucket
      if (!this.secondBucket.tryConsume()) {
        // Per-second bucket refills quickly (~1s), wait for it
        const waitTime = this.secondBucket.timeUntilRefill();
        await this.sleep(waitTime);
        retries++;
        continue;
      }

      // Try to consume from minute bucket
      if (!this.minuteBucket.tryConsume()) {
        // Per-minute bucket could need up to 60s — cap at retryAfterMs
        const waitTime = Math.min(
          this.minuteBucket.timeUntilRefill(),
          this.config.retryAfterMs
        );
        await this.sleep(waitTime);
        retries++;
        continue;
      }

      // Success - increment daily counter
      this.dailyUsed++;
      await this.saveDailyQuota();

      return {
        remainingDaily: this.config.maxPerDay - this.dailyUsed,
      };
    }

    throw new Error(
      `Rate limit retry exhausted for ${this.apiName} after ${this.config.maxRetries} attempts`
    );
  }

  /**
   * Record a completed request (for tracking purposes).
   */
  record(_success: boolean): void {
    // Currently a no-op, but could be extended for analytics
  }

  /**
   * Get current rate limiter status.
   */
  getStatus(): RateLimiterStatus {
    this.checkDailyReset();

    const dailyRemaining = Math.max(
      0,
      this.config.maxPerDay - this.dailyUsed
    );
    const dailyPercentUsed =
      (this.dailyUsed / this.config.maxPerDay) * 100;
    const isNearLimit = dailyPercentUsed > 80;

    return {
      dailyUsed: this.dailyUsed,
      dailyRemaining,
      dailyPercentUsed,
      isNearLimit,
    };
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Format a budget alert message if near daily limit.
 * @returns Alert message or null if not near limit
 */
export function formatBudgetAlert(
  apiName: string,
  status: RateLimiterStatus
): string | null {
  if (!status.isNearLimit) {
    return null;
  }

  return `⚠️  ${apiName.toUpperCase()} API quota at ${status.dailyPercentUsed.toFixed(1)}% (${status.dailyUsed}/${status.dailyUsed + status.dailyRemaining} used)`;
}

/**
 * Create a rate limiter for eval mode with stricter limits.
 */
export function createEvalBudgetLimiter(
  apiName: string,
  maxRequests: number
): RateLimiter {
  const baseConfig = API_RATE_LIMITS[apiName];
  if (!baseConfig) {
    throw new Error(`Unknown API: ${apiName}`);
  }

  const evalConfig: RateLimitConfig = {
    ...baseConfig,
    maxPerDay: Math.min(maxRequests, baseConfig.maxPerDay),
  };

  return new RateLimiter(`${apiName}-eval`, evalConfig);
}

/**
 * Create a rate limiter for the specified API.
 */
export function createRateLimiter(apiName: string): RateLimiter {
  const config = API_RATE_LIMITS[apiName];
  if (!config) {
    throw new Error(`Unknown API: ${apiName}`);
  }

  return new RateLimiter(apiName, config);
}

/**
 * Get rate limiter config for an API.
 */
export function getRateLimiterConfig(apiName: string): RateLimitConfig {
  const config = API_RATE_LIMITS[apiName];
  if (!config) {
    throw new Error(`Unknown API: ${apiName}`);
  }

  return config;
}
