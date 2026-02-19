/**
 * KOSIS API tool implementations.
 * Statistical data retrieval and table search.
 */

import type { ToolResult } from '@/shared/types.js';
import { createToolError } from '@/shared/types.js';
import { CACHE_TTL } from '@/infra/cache.js';
import type { KosisClientLike } from './client.js';
import type {
  KosisDataRow,
  KosisTableRow,
  KosisDataResult,
  KosisDataItem,
  KosisDataDimension,
  KosisTableList,
  KosisTableInfo,
} from './types.js';

// ---------------------------------------------------------------------------
// getKosisData
// ---------------------------------------------------------------------------

/** Filter options for KOSIS data queries */
export interface KosisDataOptions {
  readonly orgId?: string;
  readonly periodType?: string;
  readonly startPeriod?: string;
  readonly endPeriod?: string;
  readonly itemId?: string;
  readonly objL1?: string;
  readonly objL2?: string;
}

/**
 * Fetch statistical data from KOSIS.
 *
 * @param client KosisClient instance
 * @param tableId KOSIS table ID (e.g., 'DT_1B040A3')
 * @param options Filter options (period, region, category)
 */
export async function getKosisData(
  client: KosisClientLike,
  tableId: string,
  options?: KosisDataOptions
): Promise<ToolResult<KosisDataResult>> {
  const params: Record<string, string> = {
    tblId: tableId,
  };

  if (options?.orgId) params.orgId = options.orgId;
  if (options?.periodType) params.prdSe = options.periodType;
  if (options?.startPeriod) params.startPrdDe = options.startPeriod;
  if (options?.endPeriod) params.endPrdDe = options.endPeriod;
  if (options?.itemId) params.itmId = options.itemId;
  if (options?.objL1) params.objL1 = options.objL1;
  if (options?.objL2) params.objL2 = options.objL2;

  // If no period specified, get recent 5 periods
  if (!options?.startPeriod && !options?.endPeriod) {
    params.newEstPrdCnt = '5';
  }

  // Past periods are immutable facts — cache permanently. Recent data refreshes hourly.
  const isRecent = !options?.endPeriod || isRecentKosisPeriod(options.endPeriod);
  const ttlMs = isRecent ? CACHE_TTL.SHORT : CACHE_TTL.PERMANENT;

  const result = await client.request<readonly KosisDataRow[]>(
    'Stat/getData.do',
    params,
    { ttlMs }
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to fetch KOSIS data',
      'kosis',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const rows = result.data;
  if (!rows?.length) {
    return createToolError(
      'NOT_FOUND',
      `No data found for KOSIS table ${tableId}`,
      'kosis',
      false,
      result.metadata.responseTimeMs
    );
  }

  const tableName = rows[0].TBL_NM;

  const items: KosisDataItem[] = rows.map((row) => {
    const dimensions: KosisDataDimension[] = [];
    if (row.C1_NM && row.C1) {
      dimensions.push({ name: row.C1_NM, code: row.C1 });
    }
    if (row.C2_NM && row.C2) {
      dimensions.push({ name: row.C2_NM, code: row.C2 });
    }
    if (row.C3_NM && row.C3) {
      dimensions.push({ name: row.C3_NM, code: row.C3 });
    }

    return {
      itemName: row.ITM_NM,
      itemCode: row.ITM_ID,
      period: row.PRD_DE,
      periodType: row.PRD_SE,
      value: row.DT,
      unit: row.UNIT_NM,
      dimensions,
    };
  });

  return {
    success: true,
    data: {
      tableId,
      tableName,
      items,
      totalCount: items.length,
    },
    metadata: {
      responseTimeMs: result.metadata.responseTimeMs,
    },
  };
}

// ---------------------------------------------------------------------------
// searchKosisTables
// ---------------------------------------------------------------------------

/**
 * Search available tables in KOSIS by keyword or category.
 *
 * @param client KosisClient instance
 * @param query Search keyword
 * @param orgId Optional organization ID to filter by
 */
export async function searchKosisTables(
  client: KosisClientLike,
  query: string,
  orgId?: string
): Promise<ToolResult<KosisTableList>> {
  const params: Record<string, string> = {
    searchNm: query,
  };

  if (orgId) {
    params.orgId = orgId;
  }

  const result = await client.request<readonly KosisTableRow[]>(
    'Stat/getList.do',
    params,
    { ttlMs: CACHE_TTL.LONG } // Table catalog rarely changes
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to search KOSIS tables',
      'kosis',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const rows = result.data;
  if (!rows?.length) {
    return createToolError(
      'NOT_FOUND',
      `No KOSIS tables found matching "${query}"`,
      'kosis',
      false,
      result.metadata.responseTimeMs
    );
  }

  const tables: KosisTableInfo[] = rows.map((row) => ({
    tableId: row.TBL_ID,
    tableName: row.TBL_NM,
    statId: row.STAT_ID,
    orgId: row.ORG_ID,
    periodType: row.PRD_SE,
  }));

  const totalFromApi = rows[0].LIST_TOTAL_COUNT;
  return {
    success: true,
    data: {
      tables,
      totalCount: totalFromApi ? parseInt(totalFromApi, 10) : tables.length,
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
 * Check if a KOSIS period string represents a recent period.
 */
function isRecentKosisPeriod(period: string): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Period formats: "2024" (annual), "202401" (monthly), "2024Q1" (quarterly)
  const year = parseInt(period.substring(0, 4), 10);
  return year >= currentYear - 1;
}
