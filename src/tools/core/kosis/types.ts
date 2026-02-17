/**
 * KOSIS API types for raw responses and parsed results.
 * Korean Statistical Information Service (통계청 국가통계포털).
 */

// ---------------------------------------------------------------------------
// Raw KOSIS API response shapes (internal)
// ---------------------------------------------------------------------------

/** Raw row from Stat/getList.do endpoint */
export interface KosisTableRow {
  readonly TBL_NM: string;
  readonly TBL_ID: string;
  readonly STAT_ID: string;
  readonly ORG_ID: string;
  readonly PRD_SE: string;
  readonly LIST_TOTAL_COUNT?: string;
}

/** Raw row from Stat/getData.do endpoint */
export interface KosisDataRow {
  readonly TBL_NM: string;
  readonly TBL_ID: string;
  readonly PRD_DE: string;
  readonly PRD_SE: string;
  readonly ITM_NM: string;
  readonly ITM_ID: string;
  readonly UNIT_NM: string;
  readonly DT: string;
  readonly C1_NM?: string;
  readonly C1?: string;
  readonly C2_NM?: string;
  readonly C2?: string;
  readonly C3_NM?: string;
  readonly C3?: string;
}

/** KOSIS error response shape */
export interface KosisErrorResponse {
  readonly err: string;
  readonly errMsg: string;
}

// ---------------------------------------------------------------------------
// Parsed result types (public)
// ---------------------------------------------------------------------------

/** Dimension (classification) of a KOSIS data item */
export interface KosisDataDimension {
  readonly name: string;
  readonly code: string;
}

/** Single parsed data item from KOSIS */
export interface KosisDataItem {
  readonly itemName: string;
  readonly itemCode: string;
  readonly period: string;
  readonly periodType: string;
  readonly value: string;
  readonly unit: string;
  readonly dimensions: readonly KosisDataDimension[];
}

/** Parsed result from getKosisData */
export interface KosisDataResult {
  readonly tableId: string;
  readonly tableName: string;
  readonly items: readonly KosisDataItem[];
  readonly totalCount: number;
}

/** Single table info from KOSIS search */
export interface KosisTableInfo {
  readonly tableId: string;
  readonly tableName: string;
  readonly statId: string;
  readonly orgId: string;
  readonly periodType: string;
}

/** Parsed result from searchKosisTables */
export interface KosisTableList {
  readonly tables: readonly KosisTableInfo[];
  readonly totalCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pre-mapped common KOSIS tables for financial analysis */
export const KOSIS_TABLES = {
  POPULATION: { id: 'DT_1B040A3', name: '인구총조사' },
  INDUSTRY_OUTPUT: { id: 'DT_1F01006', name: '광업제조업동향조사' },
  EMPLOYMENT: { id: 'DT_1D07002S', name: '경제활동인구조사' },
  TRADE: { id: 'DT_1B67001', name: '무역통계' },
} as const;
