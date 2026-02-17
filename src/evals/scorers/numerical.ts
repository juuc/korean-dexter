import type { Scorer, ScorerResult } from './types';

/**
 * Parsed Korean financial amount.
 */
export interface ParsedAmount {
  /** Raw WON value */
  readonly value: number;
  /** Original text matched */
  readonly displayValue: string;
  /** Unit: 조원, 억원, 만원, 원, %, or 'raw' for bare numbers */
  readonly unit: string;
}

/**
 * Scale multipliers for Korean financial units.
 */
const SCALE_MULTIPLIERS: Record<string, number> = {
  조원: 1_000_000_000_000,
  조: 1_000_000_000_000,
  억원: 100_000_000,
  억: 100_000_000,
  만원: 10_000,
  만: 10_000,
  원: 1,
  배: 1, // PER, PBR, PSR multiples (e.g., "11.2배")
};

/**
 * Parse Korean financial amount from display string to raw WON value.
 *
 * Handles:
 * - Korean units: "67.4조원", "7,730억원", "5,000만원", "1,234원"
 * - Units without 원: "67.4조", "7,730억"
 * - Negative values: "-3.2조원"
 * - Commas in numbers: "1,234.5조원"
 * - Percentages: "12.5%", "-2.3%"
 * - Bare numbers: "67.4", "1234" (treated as raw value)
 *
 * @param text Display string containing amount
 * @returns Parsed amount or null if invalid
 */
export function parseKoreanAmount(text: string): ParsedAmount | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed === '' || trimmed === 'N/A' || trimmed === '없음' || trimmed === '-') {
    return null;
  }

  // Pattern priorities:
  // 1. Korean financial units (조원, 억원, 만원, 원, or without 원)
  // 2. Percentages
  // 3. Bare numbers

  // Match number + Korean unit (highest priority)
  const koreanPattern = /([+-]?[\d,]+\.?\d*)([조억만]원?|배)/g;
  const koreanMatches = Array.from(trimmed.matchAll(koreanPattern));

  if (koreanMatches.length > 0) {
    const match = koreanMatches[0];
    const numberStr = match[1].replace(/,/g, '');
    const unit = match[2];
    const numberValue = parseFloat(numberStr);

    if (!isNaN(numberValue)) {
      const multiplier = SCALE_MULTIPLIERS[unit];
      return {
        value: numberValue * multiplier,
        displayValue: match[0],
        unit,
      };
    }
  }

  // Match 원 (won) separately
  const wonPattern = /([+-]?[\d,]+)원/g;
  const wonMatches = Array.from(trimmed.matchAll(wonPattern));

  if (wonMatches.length > 0) {
    const match = wonMatches[0];
    const numberStr = match[1].replace(/,/g, '');
    const numberValue = parseFloat(numberStr);

    if (!isNaN(numberValue)) {
      return {
        value: numberValue,
        displayValue: match[0],
        unit: '원',
      };
    }
  }

  // Match percentage
  const percentPattern = /([+-]?[\d,]+\.?\d*)%/g;
  const percentMatches = Array.from(trimmed.matchAll(percentPattern));

  if (percentMatches.length > 0) {
    const match = percentMatches[0];
    const numberStr = match[1].replace(/,/g, '');
    const numberValue = parseFloat(numberStr);

    if (!isNaN(numberValue)) {
      return {
        value: numberValue,
        displayValue: match[0],
        unit: '%',
      };
    }
  }

  // Match bare number (lowest priority)
  const barePattern = /([+-]?[\d,]+\.?\d*)/g;
  const bareMatches = Array.from(trimmed.matchAll(barePattern))
    .filter(m => m[1] && m[1].trim() !== '');

  if (bareMatches.length > 0) {
    const match = bareMatches[0];
    const numberStr = match[1].replace(/,/g, '');
    const numberValue = parseFloat(numberStr);

    if (!isNaN(numberValue)) {
      return {
        value: numberValue,
        displayValue: match[0],
        unit: 'raw',
      };
    }
  }

  return null;
}

/**
 * Calculate relative error between two values.
 * Uses epsilon for near-zero comparison to handle floating point precision.
 *
 * @param expected Expected value
 * @param actual Actual value
 * @returns Relative error as a fraction (0.05 = 5% error)
 */
function calculateRelativeError(expected: number, actual: number): number {
  const epsilon = 1e-10;

  // Both values effectively zero
  if (Math.abs(expected) < epsilon && Math.abs(actual) < epsilon) {
    return 0;
  }

  // Expected is zero but actual is not
  if (Math.abs(expected) < epsilon) {
    return Infinity;
  }

  const error = Math.abs((actual - expected) / expected);

  // Treat very small errors as zero (handles floating point precision)
  return error < epsilon ? 0 : error;
}

/**
 * Determine score based on relative error and tolerance.
 *
 * @param relativeError Relative error as a fraction
 * @param tolerance Tolerance threshold as a fraction
 * @returns Score between 0 and 1
 */
function scoreByError(relativeError: number, tolerance: number): number {
  if (relativeError <= tolerance) {
    return 1.0;
  }
  if (relativeError <= tolerance * 5) {
    // 1-5% error
    return 0.5;
  }
  // >5% error
  return 0.25;
}

/**
 * Numerical scorer for Korean financial amounts.
 * Parses Korean display strings and compares with tolerance.
 */
export class NumericalScorer implements Scorer {
  /**
   * Score a numerical answer against expected value.
   *
   * @param expected Expected answer (can be Korean display string or number)
   * @param actual Actual answer from agent (can contain narrative text)
   * @param tolerance Tolerance as a fraction (default: 0.01 = 1%)
   * @returns Scorer result with score and explanation
   */
  score(expected: string, actual: string, tolerance: number = 0.01): ScorerResult {
    const expectedParsed = parseKoreanAmount(expected);
    const actualParsed = parseKoreanAmount(actual);

    // Handle parsing failures
    if (!expectedParsed) {
      return {
        score: 0,
        comment: `Failed to parse expected value: "${expected}"`,
        method: 'numerical',
      };
    }

    if (!actualParsed) {
      return {
        score: 0,
        comment: `Failed to parse actual value: "${actual}"`,
        method: 'numerical',
        hallucination: true,
      };
    }

    // Handle percentage comparison (compare raw values directly)
    if (expectedParsed.unit === '%' || actualParsed.unit === '%') {
      if (expectedParsed.unit !== actualParsed.unit) {
        return {
          score: 0,
          comment: `Unit mismatch: expected ${expectedParsed.unit}, got ${actualParsed.unit}`,
          method: 'numerical',
        };
      }
      const error = calculateRelativeError(expectedParsed.value, actualParsed.value);
      const score = scoreByError(error, tolerance);
      return {
        score,
        comment: `Expected ${expectedParsed.displayValue}, got ${actualParsed.displayValue} (${(error * 100).toFixed(2)}% error)`,
        method: 'numerical',
      };
    }

    // For financial amounts, compare raw WON values
    const error = calculateRelativeError(expectedParsed.value, actualParsed.value);
    const score = scoreByError(error, tolerance);

    // Build explanation
    let comment: string;
    if (score === 1.0) {
      comment = `Exact match: expected ${expectedParsed.displayValue}, got ${actualParsed.displayValue}`;
    } else {
      const errorPct = (error * 100).toFixed(2);
      comment = `Expected ${expectedParsed.displayValue} (${expectedParsed.value.toExponential(2)} WON), got ${actualParsed.displayValue} (${actualParsed.value.toExponential(2)} WON) - ${errorPct}% error`;
    }

    return {
      score,
      comment,
      method: 'numerical',
    };
  }
}
