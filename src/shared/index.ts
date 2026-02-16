/**
 * Shared types and utilities for Korean financial data normalization.
 */

export type {
  NormalizedAmount,
  PeriodRange,
  ToolResult,
} from './types.js';

export {
  dartReprtCodeToPeriod,
  kisDateToPeriod,
  bokPeriodStringToPeriod,
  createToolResult,
  createToolError,
} from './types.js';

export type { FormatOptions } from './formatter.js';

export {
  formatAmount,
  parseRawAmount,
  normalizeKrwAmount,
  formatKrwAmount,
} from './formatter.js';
