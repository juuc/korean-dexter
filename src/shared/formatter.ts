/**
 * Options for formatting Korean financial amounts.
 */
export interface FormatOptions {
  /** Preferred scale: 'auto' selects based on magnitude */
  readonly preferredScale?: 'auto' | 'won' | 'man' | 'eok' | 'jo';
  /** Decimal precision (default: 1 for jo/eok, 0 for man/won) */
  readonly precision?: number;
  /** Show + sign for positive values (default: false) */
  readonly showSign?: boolean;
  /** Show unit suffix (default: true) */
  readonly showUnit?: boolean;
}

/**
 * Parse raw amount from API responses.
 * Handles various input formats: numbers, strings with commas, nullish values, dashes.
 *
 * @param raw Raw value from API (number, string, null, undefined)
 * @returns Parsed number in WON, or null if unavailable
 */
export function parseRawAmount(
  raw: string | number | null | undefined
): number | null {
  // Handle nullish values
  if (raw === null || raw === undefined) {
    return null;
  }

  // Handle numeric input
  if (typeof raw === 'number') {
    return isNaN(raw) ? null : raw;
  }

  // Handle string input
  const trimmed = raw.trim();

  // Empty string or dash indicates missing data
  if (trimmed === '' || trimmed === '-') {
    return null;
  }

  // Remove commas and parse
  const cleaned = trimmed.replace(/,/g, '');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Format a raw WON amount to Korean financial display format.
 * Auto-scales to appropriate unit: 조원 (trillion), 억원 (hundred million), 만원 (ten thousand), 원.
 *
 * @param value Raw value in WON (원)
 * @param options Formatting options
 * @returns Formatted string (e.g., "85.6조원", "7,730억원", "5,000만원")
 */
export function formatAmount(
  value: number | null,
  options: FormatOptions = {}
): string {
  // Handle null/undefined
  if (value === null) {
    return 'N/A';
  }

  const {
    preferredScale = 'auto',
    precision,
    showSign = false,
    showUnit = true,
  } = options;

  const abs = Math.abs(value);
  const isNegative = value < 0;

  // Determine scale
  let scale: 'won' | 'man' | 'eok' | 'jo';
  let scaledValue: number;
  let unitSuffix: string;

  if (preferredScale !== 'auto') {
    scale = preferredScale;
  } else {
    // Auto-scale based on magnitude
    if (abs >= 1_000_000_000_000) {
      // >= 1조
      scale = 'jo';
    } else if (abs >= 100_000_000) {
      // >= 1억
      scale = 'eok';
    } else if (abs >= 10_000) {
      // >= 1만
      scale = 'man';
    } else {
      scale = 'won';
    }
  }

  // Apply scale
  switch (scale) {
    case 'jo':
      scaledValue = value / 1_000_000_000_000;
      unitSuffix = '조원';
      break;
    case 'eok':
      scaledValue = value / 100_000_000;
      unitSuffix = '억원';
      break;
    case 'man':
      scaledValue = value / 10_000;
      unitSuffix = '만원';
      break;
    case 'won':
      scaledValue = value;
      unitSuffix = '원';
      break;
  }

  // Determine precision
  let finalPrecision = precision;
  if (finalPrecision === undefined) {
    // Default precision: 1 for jo/eok, 0 for man/won
    finalPrecision = scale === 'jo' || scale === 'eok' ? 1 : 0;
  }

  // Format number
  const absScaled = Math.abs(scaledValue);
  let formatted: string;

  if (finalPrecision === 0) {
    // Integer formatting with thousands separators
    const rounded = Math.round(absScaled);
    formatted = rounded.toLocaleString('en-US');
  } else {
    // Decimal formatting with thousands separators
    formatted = absScaled.toLocaleString('en-US', {
      minimumFractionDigits: finalPrecision,
      maximumFractionDigits: finalPrecision,
    });
  }

  // Add sign
  let result = formatted;
  if (isNegative) {
    result = `-${result}`;
  } else if (showSign && value > 0) {
    result = `+${result}`;
  }

  // Add unit
  if (showUnit) {
    result = `${result}${unitSuffix}`;
  }

  return result;
}

/**
 * Legacy compatibility: normalizeKrwAmount
 * @deprecated Use formatAmount instead
 */
export function normalizeKrwAmount(rawKrw: number): {
  readonly value: number;
  readonly scale: '조원' | '억원' | '만원';
  readonly rawKrw: number;
} {
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
 * Legacy compatibility: formatKrwAmount
 * @deprecated Use formatAmount instead
 */
export function formatKrwAmount(amount: {
  readonly value: number;
  readonly scale: '조원' | '억원' | '만원';
}): string {
  const formatted = Number.isInteger(amount.value)
    ? amount.value.toString()
    : amount.value.toFixed(1);
  return `${formatted}${amount.scale}`;
}
