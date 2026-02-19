import { describe, test, expect } from 'bun:test';
import { renderSparkline } from './sparkline.js';

describe('renderSparkline', () => {
  test('returns empty string for empty array', () => {
    expect(renderSparkline([])).toBe('');
  });

  test('returns middle-height char for single value', () => {
    const result = renderSparkline([100]);
    expect(result).toHaveLength(1);
    expect(result).toBe('\u2585'); // ▅
  });

  test('returns uniform bars for flat data', () => {
    const result = renderSparkline([50, 50, 50, 50]);
    expect(result).toHaveLength(4);
    // All same character
    expect(new Set(result.split('')).size).toBe(1);
  });

  test('ascending values produce ascending bars', () => {
    const result = renderSparkline([10, 20, 30, 40, 50]);
    // Each character should be >= the previous one
    for (let i = 1; i < result.length; i++) {
      expect(result.charCodeAt(i)).toBeGreaterThanOrEqual(result.charCodeAt(i - 1));
    }
  });

  test('descending values produce descending bars', () => {
    const result = renderSparkline([50, 40, 30, 20, 10]);
    // Each character should be <= the previous one
    for (let i = 1; i < result.length; i++) {
      expect(result.charCodeAt(i)).toBeLessThanOrEqual(result.charCodeAt(i - 1));
    }
  });

  test('min value gets lowest bar, max gets highest', () => {
    const result = renderSparkline([10, 50, 30]);
    expect(result[0]).toBe('\u2581'); // ▁ (lowest)
    expect(result[1]).toBe('\u2588'); // █ (highest)
  });

  test('handles negative values', () => {
    const result = renderSparkline([-10, -5, 0, 5, 10]);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('\u2581'); // ▁ (min = -10)
    expect(result[4]).toBe('\u2588'); // █ (max = 10)
  });

  test('handles very large numbers (stock prices in won)', () => {
    const prices = [178_000, 180_500, 175_200, 182_000, 179_000];
    const result = renderSparkline(prices);
    expect(result).toHaveLength(5);
  });

  test('V-shape recovery pattern', () => {
    const result = renderSparkline([100, 80, 60, 40, 60, 80, 100]);
    // First and last should be same (both are max)
    expect(result[0]).toBe(result[6]);
    // Middle should be lowest
    expect(result[3]).toBe('\u2581'); // ▁
  });

  test('downsamples long arrays to maxWidth', () => {
    const longData = Array.from({ length: 200 }, (_, i) => i);
    const result = renderSparkline(longData, 50);
    expect(result).toHaveLength(50);
  });

  test('does not downsample when under maxWidth', () => {
    const data = [10, 20, 30, 40, 50];
    const result = renderSparkline(data, 60);
    expect(result).toHaveLength(5);
  });

  test('preserves first and last values after downsampling', () => {
    // 0, 1, 2, ... 99 — first is min, last is max
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = renderSparkline(data, 10);
    expect(result[0]).toBe('\u2581'); // ▁ (first = 0 = min)
    expect(result[result.length - 1]).toBe('\u2588'); // █ (last = 99 = max)
  });

  test('uses only valid Unicode block characters', () => {
    const validChars = new Set([
      '\u2581', '\u2582', '\u2583', '\u2584',
      '\u2585', '\u2586', '\u2587', '\u2588',
    ]);
    const data = [1, 5, 3, 8, 2, 7, 4, 6, 9, 0];
    const result = renderSparkline(data);
    for (const char of result) {
      expect(validChars.has(char)).toBe(true);
    }
  });

  test('two values: min gets lowest, max gets highest', () => {
    const result = renderSparkline([100, 200]);
    expect(result).toBe('\u2581\u2588'); // ▁█
  });
});
