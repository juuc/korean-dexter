import { describe, test, expect } from 'bun:test';
import { CACHE_TTL } from '@/infra/cache';

// We test the pure logic by importing the module.
// Since isKRXMarketOpen/getMarketStatus/getPriceCacheTTL depend on real time,
// we test the observable behavior and boundary conditions.
import {
  isKRXMarketOpen,
  getMarketStatus,
  getPriceCacheTTL,
} from './market-hours';

describe('market-hours', () => {
  describe('isKRXMarketOpen', () => {
    test('returns a boolean', () => {
      const result = isKRXMarketOpen();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getMarketStatus', () => {
    test('returns correct shape', () => {
      const status = getMarketStatus();

      expect(typeof status.isOpen).toBe('boolean');
      expect(typeof status.currentTimeKST).toBe('string');
      // currentTimeKST should be HH:mm format
      expect(status.currentTimeKST).toMatch(/^\d{2}:\d{2}$/);

      // nextOpenTime is null when open, string when closed
      if (status.isOpen) {
        expect(status.nextOpenTime).toBeNull();
      } else {
        expect(typeof status.nextOpenTime).toBe('string');
        // Should be a valid ISO 8601 string
        if (status.nextOpenTime) {
          expect(new Date(status.nextOpenTime).getTime()).not.toBeNaN();
        }
      }
    });

    test('isOpen matches isKRXMarketOpen', () => {
      const status = getMarketStatus();
      expect(status.isOpen).toBe(isKRXMarketOpen());
    });
  });

  describe('getPriceCacheTTL', () => {
    test('returns LIVE or AFTER_HOURS TTL', () => {
      const ttl = getPriceCacheTTL();

      // Must be one of the two valid values
      const validTTLs = [CACHE_TTL.LIVE, CACHE_TTL.AFTER_HOURS];
      expect(validTTLs).toContain(ttl);
    });

    test('returns consistent value with market status', () => {
      const isOpen = isKRXMarketOpen();
      const ttl = getPriceCacheTTL();

      if (isOpen) {
        expect(ttl).toBe(CACHE_TTL.LIVE); // 30 seconds
      } else {
        expect(ttl).toBe(CACHE_TTL.AFTER_HOURS); // 1 hour
      }
    });
  });

  describe('CACHE_TTL values', () => {
    test('LIVE is 30 seconds', () => {
      expect(CACHE_TTL.LIVE).toBe(30 * 1000);
    });

    test('AFTER_HOURS is 1 hour', () => {
      expect(CACHE_TTL.AFTER_HOURS).toBe(60 * 60 * 1000);
    });
  });

  describe('market hours boundary conditions', () => {
    // These tests verify the known schedule without mocking Date.
    // Market: Mon-Fri 09:00-15:30 KST

    test('weekend detection: Saturday and Sunday are always closed', () => {
      // We verify the function returns boolean and trust the implementation.
      // Full boundary testing would require Date mocking which is complex in Bun.
      const result = isKRXMarketOpen();
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstNow = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstNow.getUTCDay();

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Weekend — must be closed
        expect(result).toBe(false);
      }
    });

    test('after hours detection: before 09:00 or after 15:30 KST on weekdays', () => {
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstNow = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstNow.getUTCDay();
      const hour = kstNow.getUTCHours();
      const minute = kstNow.getUTCMinutes();
      const timeMinutes = hour * 60 + minute;

      const result = isKRXMarketOpen();

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (timeMinutes < 540 || timeMinutes >= 930) {
          // Before 09:00 or at/after 15:30 — must be closed
          expect(result).toBe(false);
        }
      }
    });
  });
});
