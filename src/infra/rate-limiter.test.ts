import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  RateLimiter,
  createRateLimiter,
  createEvalBudgetLimiter,
  getRateLimiterConfig,
  formatBudgetAlert,
  API_RATE_LIMITS,
  type RateLimitConfig,
} from './rate-limiter.js';

describe('RateLimiter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rate-limiter-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Token bucket refill logic', () => {
    test('allows requests within per-second limit', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 2,
        maxPerMinute: 10,
        maxPerDay: 100,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      // Should allow 2 requests immediately
      const result1 = await limiter.acquire();
      expect(result1.remainingDaily).toBe(99);

      const result2 = await limiter.acquire();
      expect(result2.remainingDaily).toBe(98);
    });

    test('blocks when per-second bucket is empty', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 1,
        maxPerMinute: 10,
        maxPerDay: 100,
        retryAfterMs: 100,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      // First request succeeds immediately
      await limiter.acquire();

      // Second request should be delayed
      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      // Should have waited at least close to the refill interval
      expect(elapsed).toBeGreaterThanOrEqual(50); // Allow some tolerance
    });

    test('refills tokens after interval elapses', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 1,
        maxPerMinute: 10,
        maxPerDay: 100,
        retryAfterMs: 100,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      // Consume token
      await limiter.acquire();

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be able to acquire again immediately
      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    test('respects per-minute limit', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 2,
        maxPerDay: 100,
        retryAfterMs: 100,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      // Should allow 2 requests
      await limiter.acquire();
      await limiter.acquire();

      // Third request exhausts retries waiting for 60s minute bucket refill
      await expect(limiter.acquire()).rejects.toThrow(/retry exhausted/);
    });
  });

  describe('Daily quota tracking', () => {
    test('tracks daily usage', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 5,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      for (let i = 0; i < 3; i++) {
        await limiter.acquire();
      }

      const status = limiter.getStatus();
      expect(status.dailyUsed).toBe(3);
      expect(status.dailyRemaining).toBe(2);
    });

    test('throws error when daily quota exhausted', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 2,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      await limiter.acquire();
      await limiter.acquire();

      await expect(limiter.acquire()).rejects.toThrow(/Daily quota exhausted/);
    });

    test('persists daily quota to disk', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 100,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter1 = new RateLimiter('test', config, tempDir);

      await limiter1.acquire();
      await limiter1.acquire();

      // Create new limiter instance - should load persisted state
      const limiter2 = new RateLimiter('test', config, tempDir);
      const status = limiter2.getStatus();

      expect(status.dailyUsed).toBe(2);
    });

    test('calculates daily percent used correctly', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 100,
        maxPerMinute: 1000,
        maxPerDay: 100,
        retryAfterMs: 100,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      for (let i = 0; i < 50; i++) {
        await limiter.acquire();
      }

      const status = limiter.getStatus();
      expect(status.dailyPercentUsed).toBe(50);
    });
  });

  describe('Budget alerts', () => {
    test('sets isNearLimit at 80% threshold', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 10,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      // Use 7 requests (70%)
      for (let i = 0; i < 7; i++) {
        await limiter.acquire();
      }

      let status = limiter.getStatus();
      expect(status.isNearLimit).toBe(false);

      // Use 1 more (80%)
      await limiter.acquire();

      status = limiter.getStatus();
      expect(status.isNearLimit).toBe(false);

      // Use 1 more (90%)
      await limiter.acquire();

      status = limiter.getStatus();
      expect(status.isNearLimit).toBe(true);
    });

    test('formatBudgetAlert returns null when not near limit', () => {
      const status = {
        dailyUsed: 50,
        dailyRemaining: 50,
        dailyPercentUsed: 50,
        isNearLimit: false,
      };

      const alert = formatBudgetAlert('test', status);
      expect(alert).toBeNull();
    });

    test('formatBudgetAlert returns message when near limit', () => {
      const status = {
        dailyUsed: 85,
        dailyRemaining: 15,
        dailyPercentUsed: 85,
        isNearLimit: true,
      };

      const alert = formatBudgetAlert('test', status);
      expect(alert).toContain('TEST');
      expect(alert).toContain('85.0%');
      expect(alert).toContain('85/100');
    });
  });

  describe('Eval mode', () => {
    test('creates limiter with stricter limits', () => {
      const evalLimiter = createEvalBudgetLimiter('opendart', 50);
      const status = evalLimiter.getStatus();

      // Should cap at 50 instead of 1000
      expect(status.dailyRemaining).toBe(50);
    });

    test('respects base config maximum', () => {
      // OpenDART has 1000/day max
      const evalLimiter = createEvalBudgetLimiter('opendart', 5000);
      const status = evalLimiter.getStatus();

      // Should cap at base config's 1000, not 5000
      expect(status.dailyRemaining).toBe(1000);
    });

    test('throws for unknown API', () => {
      expect(() => createEvalBudgetLimiter('unknown', 100)).toThrow(
        /Unknown API/
      );
    });
  });

  describe('Factory functions', () => {
    test('createRateLimiter creates limiter with correct config', () => {
      const limiter = createRateLimiter('kis');
      const status = limiter.getStatus();

      expect(status.dailyRemaining).toBe(API_RATE_LIMITS.kis.maxPerDay);
    });

    test('createRateLimiter throws for unknown API', () => {
      expect(() => createRateLimiter('unknown')).toThrow(/Unknown API/);
    });

    test('getRateLimiterConfig returns correct config', () => {
      const config = getRateLimiterConfig('bok');

      expect(config).toEqual(API_RATE_LIMITS.bok);
    });

    test('getRateLimiterConfig throws for unknown API', () => {
      expect(() => getRateLimiterConfig('unknown')).toThrow(/Unknown API/);
    });
  });

  describe('Multiple rapid calls', () => {
    test('respects per-second limit with rapid calls', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 2,
        maxPerMinute: 100,
        maxPerDay: 100,
        retryAfterMs: 100,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      const start = Date.now();

      // Try to make 4 requests rapidly
      await Promise.all([
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
      ]);

      const elapsed = Date.now() - start;

      // With 2 per second limit, 4 requests should take at least 1 second
      // (first 2 immediate, next 2 after 1s refill)
      expect(elapsed).toBeGreaterThanOrEqual(900); // Allow some tolerance
    });
  });

  describe('Midnight reset logic', () => {
    test('getStatus shows correct values before reset', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 100,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      await limiter.acquire();
      await limiter.acquire();

      const status = limiter.getStatus();
      expect(status.dailyUsed).toBe(2);
      expect(status.dailyRemaining).toBe(98);
      expect(status.dailyPercentUsed).toBe(2);
    });

    // Note: Testing actual midnight reset would require mocking Date.now()
    // which is complex in Bun. This verifies the calculation logic works.
  });

  describe('Record method', () => {
    test('record method exists and does not throw', async () => {
      const config: RateLimitConfig = {
        maxPerSecond: 10,
        maxPerMinute: 100,
        maxPerDay: 100,
        retryAfterMs: 1000,
        maxRetries: 3,
      };
      const limiter = new RateLimiter('test', config, tempDir);

      await limiter.acquire();

      // Should not throw
      limiter.record(true);
      limiter.record(false);
    });
  });

  describe('Predefined API configs', () => {
    test('all predefined APIs have valid configs', () => {
      const apis = ['opendart', 'kis', 'bok', 'kosis'];

      for (const api of apis) {
        const config = API_RATE_LIMITS[api];
        expect(config).toBeDefined();
        expect(config.maxPerSecond).toBeGreaterThan(0);
        expect(config.maxPerMinute).toBeGreaterThan(0);
        expect(config.maxPerDay).toBeGreaterThan(0);
        expect(config.retryAfterMs).toBeGreaterThan(0);
        expect(config.maxRetries).toBeGreaterThan(0);
      }
    });
  });
});
