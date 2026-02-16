import { CACHE_TTL } from '@/infra/cache';

/**
 * KRX market hours: Monday-Friday, 09:00-15:30 KST.
 * Does not account for Korean holidays (would need a holiday calendar).
 */

/**
 * Check if KRX (Korea Exchange) is currently open.
 * Market hours: Mon-Fri 09:00-15:30 KST.
 */
export function isKRXMarketOpen(): boolean {
  const now = getCurrentTimeKST();
  return isMarketOpenAt(now);
}

/**
 * Get current market status with next open time hint.
 */
export function getMarketStatus(): {
  readonly isOpen: boolean;
  readonly nextOpenTime: string | null; // ISO 8601
  readonly currentTimeKST: string; // HH:mm format
} {
  const now = getCurrentTimeKST();
  const isOpen = isMarketOpenAt(now);

  const hours = now.getUTCHours().toString().padStart(2, '0');
  const minutes = now.getUTCMinutes().toString().padStart(2, '0');
  const currentTimeKST = `${hours}:${minutes}`;

  const nextOpenTime = isOpen ? null : calculateNextOpenTime(now);

  return { isOpen, nextOpenTime, currentTimeKST };
}

/**
 * Determine cache TTL based on market status.
 * Market open: 30 seconds (CACHE_TTL.LIVE)
 * Market closed: 1 hour (CACHE_TTL.AFTER_HOURS)
 */
export function getPriceCacheTTL(): number {
  return isKRXMarketOpen() ? CACHE_TTL.LIVE : CACHE_TTL.AFTER_HOURS;
}

/**
 * Get current time in KST as a Date (using UTC methods to represent KST).
 * The returned Date has UTC fields set to KST values.
 */
function getCurrentTimeKST(): Date {
  const now = new Date();
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffsetMs);
}

/**
 * Check if a given KST time (encoded in UTC fields) falls within market hours.
 */
function isMarketOpenAt(kstDate: Date): boolean {
  const dayOfWeek = kstDate.getUTCDay(); // 0=Sun, 6=Sat

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  const hour = kstDate.getUTCHours();
  const minute = kstDate.getUTCMinutes();
  const timeMinutes = hour * 60 + minute;

  // Market hours: 09:00 (540) to 15:30 (930) KST
  const marketOpen = 9 * 60; // 540
  const marketClose = 15 * 60 + 30; // 930

  return timeMinutes >= marketOpen && timeMinutes < marketClose;
}

/**
 * Calculate next market open time from a given KST time.
 * Returns ISO 8601 string.
 */
function calculateNextOpenTime(kstDate: Date): string {
  const dayOfWeek = kstDate.getUTCDay();
  const hour = kstDate.getUTCHours();
  const minute = kstDate.getUTCMinutes();
  const timeMinutes = hour * 60 + minute;

  const marketOpen = 9 * 60; // 09:00

  // Start from a copy
  const next = new Date(kstDate.getTime());
  next.setUTCHours(9, 0, 0, 0);

  if (dayOfWeek >= 1 && dayOfWeek <= 5 && timeMinutes < marketOpen) {
    // Today is a weekday and before 09:00 — next open is today at 09:00
    // next is already set correctly
  } else if (dayOfWeek === 5) {
    // Friday after/during hours — next Monday
    next.setUTCDate(next.getUTCDate() + 3);
  } else if (dayOfWeek === 6) {
    // Saturday — next Monday
    next.setUTCDate(next.getUTCDate() + 2);
  } else if (dayOfWeek === 0) {
    // Sunday — next Monday
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    // Weekday after/during hours — next weekday at 09:00
    next.setUTCDate(next.getUTCDate() + 1);
  }

  // Convert back from KST to UTC for ISO string
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const utcTime = new Date(next.getTime() - kstOffsetMs);
  return utcTime.toISOString();
}
