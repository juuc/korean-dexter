/**
 * Korean financial amount with scale.
 * Raw amounts from APIs are normalized to human-readable Korean scales.
 */
export interface NormalizedAmount {
  /** Numeric value in the given scale */
  readonly value: number;
  /** Scale unit: 조원 (trillion), 억원 (hundred million), 만원 (ten thousand) */
  readonly scale: '조원' | '억원' | '만원';
  /** Original raw amount in KRW (원) */
  readonly rawKrw: number;
}

/**
 * Financial period range for queries.
 */
export interface PeriodRange {
  /** Start year (e.g., 2020) */
  readonly startYear: number;
  /** End year (e.g., 2024) */
  readonly endYear: number;
  /** Quarter filter: 1Q, 2Q, 3Q, 4Q, or 'annual' */
  readonly quarter: '1Q' | '2Q' | '3Q' | '4Q' | 'annual';
}
