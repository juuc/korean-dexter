/**
 * Rate limiter configuration for Korean financial APIs.
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  readonly maxRequests: number;
  /** Window duration in milliseconds */
  readonly windowMs: number;
  /** Optional: minimum delay between requests in ms */
  readonly minDelayMs?: number;
}

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
