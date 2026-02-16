import { type ToolResult, type NormalizedAmount } from '@/shared/types';
import { parseRawAmount, formatAmount } from '@/shared/formatter';
import { CACHE_TTL } from '@/infra/cache';
import { type KISClient } from './client';
import { getPriceCacheTTL, isKRXMarketOpen } from './market-hours';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface StockPriceResult {
  readonly stockCode: string;
  readonly name: string;
  readonly currentPrice: NormalizedAmount;
  readonly change: NormalizedAmount;
  readonly changePercent: number;
  readonly volume: number;
  readonly marketCap: NormalizedAmount;
  readonly high: NormalizedAmount;
  readonly low: NormalizedAmount;
  readonly open: NormalizedAmount;
  readonly isMarketOpen: boolean;
}

export interface DailyPrice {
  readonly date: string; // YYYY-MM-DD
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface HistoricalPriceResult {
  readonly stockCode: string;
  readonly period: 'D' | 'W' | 'M';
  readonly prices: readonly DailyPrice[];
}

export interface MarketIndexResult {
  readonly indexCode: string;
  readonly indexName: string;
  readonly currentValue: number;
  readonly change: number;
  readonly changePercent: number;
  readonly volume: number;
  readonly isMarketOpen: boolean;
}

// ---------------------------------------------------------------------------
// Raw KIS response shapes
// ---------------------------------------------------------------------------

/** Raw output from /uapi/domestic-stock/v1/quotations/inquire-price */
interface KISInquirePriceOutput {
  readonly stck_shrn_iscd: string; // Stock code
  readonly hts_kor_isnm?: string; // Stock name (Korean)
  readonly stck_prpr: string; // Current price
  readonly prdy_vrss: string; // Change from previous day
  readonly prdy_ctrt: string; // Change percent
  readonly acml_vol: string; // Accumulated volume
  readonly hts_avls: string; // Market cap (억원)
  readonly stck_hgpr: string; // High
  readonly stck_lwpr: string; // Low
  readonly stck_oprc: string; // Open
}

/** Raw output item from /uapi/domestic-stock/v1/quotations/inquire-daily-price */
interface KISDailyPriceItem {
  readonly stck_bsop_date: string; // YYYYMMDD
  readonly stck_oprc: string; // Open
  readonly stck_hgpr: string; // High
  readonly stck_lwpr: string; // Low
  readonly stck_clpr: string; // Close
  readonly acml_vol: string; // Volume
}

/** Raw output from /uapi/domestic-stock/v1/quotations/inquire-index-price */
interface KISIndexPriceOutput {
  readonly bstp_nmix_prpr: string; // Current index value
  readonly bstp_nmix_prdy_vrss: string; // Change
  readonly bstp_nmix_prdy_ctrt: string; // Change percent
  readonly acml_vol: string; // Volume
  readonly bstp_cls_code: string; // Index code
  readonly hts_kor_isnm?: string; // Index name
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * Get current stock price from KIS API.
 *
 * Endpoint: GET /uapi/domestic-stock/v1/quotations/inquire-price
 * tr_id: FHKST01010100
 */
export async function getStockPrice(
  client: KISClient,
  stockCode: string
): Promise<ToolResult<StockPriceResult>> {
  const result = await client.request<KISInquirePriceOutput>(
    'GET',
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: stockCode,
    },
    {
      trId: 'FHKST01010100',
      cacheOptions: {
        ttlMs: getPriceCacheTTL(),
      },
    }
  );

  if (!result.success || !result.data) {
    return {
      success: false as const,
      data: null,
      error: result.error,
      metadata: result.metadata,
    };
  }

  const output = result.data;
  const today = new Date().toISOString().split('T')[0];
  const marketOpen = isKRXMarketOpen();

  const parsed: StockPriceResult = {
    stockCode: output.stck_shrn_iscd || stockCode,
    name: output.hts_kor_isnm ?? stockCode,
    currentPrice: buildNormalizedAmount(output.stck_prpr, today),
    change: buildNormalizedAmount(output.prdy_vrss, today),
    changePercent: parseRawAmount(output.prdy_ctrt) ?? 0,
    volume: parseRawAmount(output.acml_vol) ?? 0,
    marketCap: buildMarketCapAmount(output.hts_avls, today),
    high: buildNormalizedAmount(output.stck_hgpr, today),
    low: buildNormalizedAmount(output.stck_lwpr, today),
    open: buildNormalizedAmount(output.stck_oprc, today),
    isMarketOpen: marketOpen,
  };

  return {
    ...result,
    data: parsed,
    metadata: {
      ...result.metadata,
      isMarketOpen: marketOpen,
    },
  };
}

/**
 * Get historical daily prices from KIS API.
 *
 * Endpoint: GET /uapi/domestic-stock/v1/quotations/inquire-daily-price
 * tr_id: FHKST01010400
 */
export async function getHistoricalPrices(
  client: KISClient,
  stockCode: string,
  options?: {
    readonly startDate?: string; // YYYYMMDD
    readonly endDate?: string; // YYYYMMDD
    readonly period?: 'D' | 'W' | 'M';
  }
): Promise<ToolResult<HistoricalPriceResult>> {
  const period = options?.period ?? 'D';
  const endDate = options?.endDate ?? formatDateKIS(new Date());
  const startDate = options?.startDate ?? formatDateKIS(daysAgo(90));

  // Determine cache TTL: historical past dates are permanent, today is live
  const todayStr = formatDateKIS(new Date());
  const isHistorical = endDate < todayStr;
  const ttlMs = isHistorical ? CACHE_TTL.PERMANENT : getPriceCacheTTL();

  const result = await client.request<readonly KISDailyPriceItem[]>(
    'GET',
    '/uapi/domestic-stock/v1/quotations/inquire-daily-price',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: stockCode,
      FID_INPUT_DATE_1: startDate,
      FID_INPUT_DATE_2: endDate,
      FID_PERIOD_DIV_CODE: period,
      FID_ORG_ADJ_PRC: '0',
    },
    {
      trId: 'FHKST01010400',
      cacheOptions: { ttlMs },
    }
  );

  if (!result.success || !result.data) {
    return {
      success: false as const,
      data: null,
      error: result.error,
      metadata: result.metadata,
    };
  }

  const items = Array.isArray(result.data) ? result.data : [];

  const prices: readonly DailyPrice[] = items
    .filter((item) => item.stck_bsop_date)
    .map((item) => ({
      date: formatKISDate(item.stck_bsop_date),
      open: parseRawAmount(item.stck_oprc) ?? 0,
      high: parseRawAmount(item.stck_hgpr) ?? 0,
      low: parseRawAmount(item.stck_lwpr) ?? 0,
      close: parseRawAmount(item.stck_clpr) ?? 0,
      volume: parseRawAmount(item.acml_vol) ?? 0,
    }));

  const parsed: HistoricalPriceResult = {
    stockCode,
    period,
    prices,
  };

  return { ...result, data: parsed };
}

/**
 * Get market index (KOSPI/KOSDAQ) from KIS API.
 *
 * Endpoint: GET /uapi/domestic-stock/v1/quotations/inquire-index-price
 * tr_id: FHPUP02100000
 *
 * Index codes: "0001" = KOSPI, "1001" = KOSDAQ
 */
export async function getMarketIndex(
  client: KISClient,
  indexCode: string
): Promise<ToolResult<MarketIndexResult>> {
  const result = await client.request<KISIndexPriceOutput>(
    'GET',
    '/uapi/domestic-stock/v1/quotations/inquire-index-price',
    {
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: indexCode,
    },
    {
      trId: 'FHPUP02100000',
      cacheOptions: {
        ttlMs: getPriceCacheTTL(),
      },
    }
  );

  if (!result.success || !result.data) {
    return {
      success: false as const,
      data: null,
      error: result.error,
      metadata: result.metadata,
    };
  }

  const output = result.data;
  const marketOpen = isKRXMarketOpen();

  const indexNames: Record<string, string> = {
    '0001': 'KOSPI',
    '1001': 'KOSDAQ',
  };

  const parsed: MarketIndexResult = {
    indexCode,
    indexName: output.hts_kor_isnm ?? indexNames[indexCode] ?? indexCode,
    currentValue: parseRawAmount(output.bstp_nmix_prpr) ?? 0,
    change: parseRawAmount(output.bstp_nmix_prdy_vrss) ?? 0,
    changePercent: parseRawAmount(output.bstp_nmix_prdy_ctrt) ?? 0,
    volume: parseRawAmount(output.acml_vol) ?? 0,
    isMarketOpen: marketOpen,
  };

  return {
    ...result,
    data: parsed,
    metadata: {
      ...result.metadata,
      isMarketOpen: marketOpen,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a NormalizedAmount from a raw KIS price string (in WON).
 */
function buildNormalizedAmount(
  rawValue: string,
  asOfDate: string
): NormalizedAmount {
  const value = parseRawAmount(rawValue);
  const displayValue = formatAmount(value);
  const abs = Math.abs(value ?? 0);

  let scale: NormalizedAmount['scale'];
  if (abs >= 1_000_000_000_000) {
    scale = 'jo';
  } else if (abs >= 100_000_000) {
    scale = 'eok';
  } else if (abs >= 10_000) {
    scale = 'man';
  } else {
    scale = 'won';
  }

  return {
    value,
    displayValue,
    unit: 'KRW',
    scale,
    isEstimate: false,
    source: 'kis',
    asOfDate,
  };
}

/**
 * Build NormalizedAmount for market cap.
 * KIS returns hts_avls in 억원 (hundred million WON), so multiply by 1e8.
 */
function buildMarketCapAmount(
  rawEokValue: string,
  asOfDate: string
): NormalizedAmount {
  const eokValue = parseRawAmount(rawEokValue);
  const wonValue = eokValue !== null ? eokValue * 100_000_000 : null;
  const displayValue = formatAmount(wonValue);
  const abs = Math.abs(wonValue ?? 0);

  let scale: NormalizedAmount['scale'];
  if (abs >= 1_000_000_000_000) {
    scale = 'jo';
  } else if (abs >= 100_000_000) {
    scale = 'eok';
  } else if (abs >= 10_000) {
    scale = 'man';
  } else {
    scale = 'won';
  }

  return {
    value: wonValue,
    displayValue,
    unit: 'KRW',
    scale,
    isEstimate: false,
    source: 'kis',
    asOfDate,
  };
}

/**
 * Format a Date to KIS date format (YYYYMMDD).
 */
function formatDateKIS(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Convert KIS date (YYYYMMDD) to ISO format (YYYY-MM-DD).
 */
function formatKISDate(kisDate: string): string {
  return `${kisDate.substring(0, 4)}-${kisDate.substring(4, 6)}-${kisDate.substring(6, 8)}`;
}

/**
 * Get a Date that is N days ago.
 */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
