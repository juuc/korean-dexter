/**
 * BOK ECOS API types for raw responses and parsed results.
 * Bank of Korea Economic Statistics System.
 */

import type { PeriodRange } from '@/shared/types.js';

// ---------------------------------------------------------------------------
// Raw BOK API response shapes (internal)
// ---------------------------------------------------------------------------

/** Raw row from StatisticSearch endpoint */
export interface BokStatRow {
  readonly STAT_CODE: string;
  readonly STAT_NAME: string;
  readonly ITEM_CODE1: string;
  readonly ITEM_NAME1: string;
  readonly ITEM_CODE2: string;
  readonly ITEM_NAME2: string;
  readonly ITEM_CODE3: string;
  readonly ITEM_NAME3: string;
  readonly ITEM_CODE4: string;
  readonly ITEM_NAME4: string;
  readonly UNIT_NAME: string;
  readonly TIME: string;
  readonly DATA_VALUE: string;
}

/** Response envelope for StatisticSearch */
export interface BokStatSearchResponse {
  readonly StatisticSearch?: {
    readonly list_total_count: number;
    readonly row: readonly BokStatRow[];
  };
  readonly RESULT?: {
    readonly CODE: string;
    readonly MESSAGE: string;
  };
}

/** Raw row from KeyStatisticList endpoint */
export interface BokKeyStatRow {
  readonly CLASS_NAME: string;
  readonly KEYSTAT_NAME: string;
  readonly DATA_VALUE: string;
  readonly CYCLE: string;
  readonly UNIT_NAME: string;
  readonly TIME: string;
}

/** Response envelope for KeyStatisticList */
export interface BokKeyStatListResponse {
  readonly KeyStatisticList?: {
    readonly list_total_count: number;
    readonly row: readonly BokKeyStatRow[];
  };
  readonly RESULT?: {
    readonly CODE: string;
    readonly MESSAGE: string;
  };
}

/** Raw row from StatisticTableList endpoint */
export interface BokTableRow {
  readonly STAT_CODE: string;
  readonly STAT_NAME: string;
  readonly CYCLE: string;
  readonly SRCH_YN: string;
  readonly ORG_NAME: string;
}

/** Response envelope for StatisticTableList */
export interface BokTableListResponse {
  readonly StatisticTableList?: {
    readonly list_total_count: number;
    readonly row: readonly BokTableRow[];
  };
  readonly RESULT?: {
    readonly CODE: string;
    readonly MESSAGE: string;
  };
}

// ---------------------------------------------------------------------------
// Parsed result types (public)
// ---------------------------------------------------------------------------

/** Single data point from BOK economic indicator */
export interface BokIndicatorValue {
  readonly period: PeriodRange;
  readonly value: number | null;
  readonly displayValue: string;
}

/** Parsed result from getEconomicIndicator */
export interface BokIndicatorResult {
  readonly statCode: string;
  readonly statName: string;
  readonly itemName: string;
  readonly unit: string;
  readonly values: readonly BokIndicatorValue[];
}

/** Single key statistic item */
export interface BokKeyStatItem {
  readonly className: string;
  readonly name: string;
  readonly value: string;
  readonly cycle: string;
  readonly unit: string;
  readonly time: string;
}

/** Parsed result from getKeyStatisticsList */
export interface BokKeyStatsList {
  readonly items: readonly BokKeyStatItem[];
  readonly totalCount: number;
}

/** Single table info item */
export interface BokTableInfo {
  readonly statCode: string;
  readonly statName: string;
  readonly cycle: string;
  readonly searchable: boolean;
  readonly orgName: string;
}

/** Parsed result from searchStatisticTables */
export interface BokTableList {
  readonly tables: readonly BokTableInfo[];
  readonly totalCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pre-mapped common BOK indicators for zero-config usability */
export const BOK_INDICATORS = {
  BASE_RATE: { table: '722Y001', item: '0101000', name: '기준금리' },
  USD_KRW: { table: '731Y003', item: '0000001', name: '원/달러 환율' },
  GDP_GROWTH: { table: '200Y002', item: '10111', name: 'GDP 성장률' },
  CPI: { table: '021Y126', item: '*', name: '소비자물가지수' },
  M2: { table: '102Y004', item: '*', name: '광의통화(M2)' },
} as const;
