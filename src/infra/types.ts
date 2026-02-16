/**
 * Rate limiter configuration for Korean financial APIs.
 * Implemented in rate-limiter.ts with multi-tier token buckets.
 */
export type { RateLimitConfig } from './rate-limiter.js';

/**
 * Cache configuration for financial data.
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds (0 = permanent for immutable data) */
  readonly ttlMs: number;
  /** Maximum number of entries */
  readonly maxEntries: number;
  /** Cache storage strategy */
  readonly storage: 'memory' | 'disk';
}
