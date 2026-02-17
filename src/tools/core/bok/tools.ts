/**
 * BOK ECOS API tool implementations.
 * Economic indicators, key statistics, and table search.
 */

import type { ToolResult } from '@/shared/types.js';
import { bokPeriodStringToPeriod, createToolError } from '@/shared/types.js';
import { CACHE_TTL } from '@/infra/cache.js';
import type { BokClientLike } from './client.js';
import type {
  BokStatSearchResponse,
  BokKeyStatListResponse,
  BokTableListResponse,
  BokIndicatorResult,
  BokIndicatorValue,
  BokKeyStatsList,
  BokKeyStatItem,
  BokTableList,
  BokTableInfo,
} from './types.js';

// ---------------------------------------------------------------------------
// getEconomicIndicator
// ---------------------------------------------------------------------------

/**
 * Fetch a specific economic indicator from BOK ECOS.
 *
 * @param client BokClient instance
 * @param tableCode Statistical table code (e.g., '722Y001' for base rate)
 * @param itemCode Item code within the table (e.g., '0101000')
 * @param periodType Period type: 'A' annual, 'Q' quarterly, 'M' monthly, 'D' daily
 * @param startDate Start date matching period type format
 * @param endDate End date matching period type format
 */
export async function getEconomicIndicator(
  client: BokClientLike,
  tableCode: string,
  itemCode: string,
  periodType: string,
  startDate: string,
  endDate: string
): Promise<ToolResult<BokIndicatorResult>> {
  // Determine cache TTL: historical data is more stable
  const isCurrentPeriod = isRecentPeriod(endDate, periodType);
  const ttlMs = isCurrentPeriod ? CACHE_TTL.SHORT : CACHE_TTL.MEDIUM;

  const result = await client.request<BokStatSearchResponse>(
    'StatisticSearch',
    {
      tableCode,
      periodType,
      startDate,
      endDate,
      itemCode1: itemCode,
    },
    { ttlMs }
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to fetch economic indicator',
      'bok',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const data = result.data;
  const rows = data?.StatisticSearch?.row;
  if (!rows?.length) {
    return createToolError(
      'NOT_FOUND',
      `No data found for table ${tableCode}, item ${itemCode}, period ${startDate}-${endDate}`,
      'bok',
      false,
      result.metadata.responseTimeMs
    );
  }

  const firstRow = rows[0];
  const values: BokIndicatorValue[] = rows.map((row) => {
    const numValue = parseFloat(row.DATA_VALUE.replace(/,/g, ''));
    const value = isNaN(numValue) ? null : numValue;
    return {
      period: bokPeriodStringToPeriod(row.TIME),
      value,
      displayValue: value !== null ? row.DATA_VALUE : 'N/A',
    };
  });

  return {
    success: true,
    data: {
      statCode: firstRow.STAT_CODE,
      statName: firstRow.STAT_NAME,
      itemName: firstRow.ITEM_NAME1,
      unit: firstRow.UNIT_NAME,
      values,
    },
    metadata: {
      responseTimeMs: result.metadata.responseTimeMs,
    },
  };
}

// ---------------------------------------------------------------------------
// getKeyStatisticsList
// ---------------------------------------------------------------------------

/**
 * Fetch top 100 frequently accessed key statistics from BOK.
 *
 * @param client BokClient instance
 */
export async function getKeyStatisticsList(
  client: BokClientLike
): Promise<ToolResult<BokKeyStatsList>> {
  const result = await client.request<BokKeyStatListResponse>(
    'KeyStatisticList',
    { startCount: '1', endCount: '100' },
    { ttlMs: CACHE_TTL.SHORT } // Values change daily
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to fetch key statistics',
      'bok',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const data = result.data;
  if (!data) {
    return createToolError(
      'NOT_FOUND',
      'No key statistics returned',
      'bok',
      false,
      result.metadata.responseTimeMs
    );
  }

  const rows = data.KeyStatisticList?.row;
  if (!rows?.length) {
    return createToolError(
      'NOT_FOUND',
      'No key statistics returned',
      'bok',
      false,
      result.metadata.responseTimeMs
    );
  }

  const items: BokKeyStatItem[] = rows.map((row) => ({
    className: row.CLASS_NAME,
    name: row.KEYSTAT_NAME,
    value: row.DATA_VALUE,
    cycle: row.CYCLE,
    unit: row.UNIT_NAME,
    time: row.TIME,
  }));

  return {
    success: true,
    data: {
      items,
      totalCount: data.KeyStatisticList?.list_total_count ?? items.length,
    },
    metadata: {
      responseTimeMs: result.metadata.responseTimeMs,
    },
  };
}

// ---------------------------------------------------------------------------
// searchStatisticTables
// ---------------------------------------------------------------------------

/**
 * Search available statistical tables in BOK ECOS by keyword.
 *
 * @param client BokClient instance
 * @param query Search keyword (Korean or English)
 */
export async function searchStatisticTables(
  client: BokClientLike,
  query: string
): Promise<ToolResult<BokTableList>> {
  const result = await client.request<BokTableListResponse>(
    'StatisticTableList',
    { query },
    { ttlMs: CACHE_TTL.LONG } // Table catalog rarely changes
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to search statistic tables',
      'bok',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const data = result.data;
  if (!data) {
    return createToolError(
      'NOT_FOUND',
      `No tables found matching "${query}"`,
      'bok',
      false,
      result.metadata.responseTimeMs
    );
  }

  const rows = data.StatisticTableList?.row;
  if (!rows?.length) {
    return createToolError(
      'NOT_FOUND',
      `No tables found matching "${query}"`,
      'bok',
      false,
      result.metadata.responseTimeMs
    );
  }

  const tables: BokTableInfo[] = rows.map((row) => ({
    statCode: row.STAT_CODE,
    statName: row.STAT_NAME,
    cycle: row.CYCLE,
    searchable: row.SRCH_YN === 'Y',
    orgName: row.ORG_NAME,
  }));

  return {
    success: true,
    data: {
      tables,
      totalCount: data.StatisticTableList?.list_total_count ?? tables.length,
    },
    metadata: {
      responseTimeMs: result.metadata.responseTimeMs,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if endDate represents a recent period (within current or previous period).
 * Used to determine cache TTL.
 */
function isRecentPeriod(endDate: string, periodType: string): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (periodType === 'A') {
    const year = parseInt(endDate, 10);
    return year >= currentYear - 1;
  }
  if (periodType === 'Q') {
    const year = parseInt(endDate.substring(0, 4), 10);
    return year >= currentYear - 1;
  }
  if (periodType === 'M') {
    const year = parseInt(endDate.substring(0, 4), 10);
    const month = parseInt(endDate.substring(4, 6), 10);
    const endMonths = year * 12 + month;
    const currentMonths = currentYear * 12 + currentMonth;
    return currentMonths - endMonths <= 3;
  }
  // Daily data is always "recent"
  return true;
}
