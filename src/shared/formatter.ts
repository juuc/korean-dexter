import type { NormalizedAmount } from './types.js';

/**
 * Normalize a raw KRW amount to human-readable Korean scale.
 * Follows the convention: 조원 for trillions, 억원 for hundred millions, 만원 for smaller.
 */
export function normalizeKrwAmount(rawKrw: number): NormalizedAmount {
  const abs = Math.abs(rawKrw);

  if (abs >= 1_000_000_000_000) {
    return { value: rawKrw / 1_000_000_000_000, scale: '조원', rawKrw };
  }
  if (abs >= 100_000_000) {
    return { value: rawKrw / 100_000_000, scale: '억원', rawKrw };
  }
  return { value: rawKrw / 10_000, scale: '만원', rawKrw };
}

/**
 * Format a NormalizedAmount to a display string.
 * Example: { value: 74.8, scale: '조원' } → "74.8조원"
 */
export function formatKrwAmount(amount: NormalizedAmount): string {
  const formatted = Number.isInteger(amount.value)
    ? amount.value.toString()
    : amount.value.toFixed(1);
  return `${formatted}${amount.scale}`;
}
