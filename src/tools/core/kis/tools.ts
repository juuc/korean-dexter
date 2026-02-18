import { type ToolResult, type NormalizedAmount } from '@/shared/types';
import { parseRawAmount, formatAmount, type FormatOptions } from '@/shared/formatter';
import { CACHE_TTL } from '@/infra/cache';
import type { KisClientLike } from './client';
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
  readonly tradingValue: NormalizedAmount;
  readonly marketCap: NormalizedAmount;
  readonly high: NormalizedAmount;
  readonly low: NormalizedAmount;
  readonly open: NormalizedAmount;
  readonly w52High: NormalizedAmount;
  readonly w52HighDate: string;
  readonly w52Low: NormalizedAmount;
  readonly w52LowDate: string;
  readonly per: number;
  readonly pbr: number;
  readonly eps: number;
  readonly bps: number;
  readonly foreignOwnershipRate: number;
  readonly foreignNetBuy: number;
  readonly institutionalNetBuy: number;
  readonly isMarketOpen: boolean;
  /** Less-frequently-used fields, available when users ask specific questions */
  readonly details: StockPriceDetails;
}

export interface StockPriceDetails {
  readonly industry: string;
  readonly market: string;
  readonly listedShares: number;
  readonly foreignHoldings: number;
  readonly faceValue: number;
  readonly volumeTurnoverRate: number;
  readonly creditBalanceRate: number;
  readonly ytdHigh: NormalizedAmount;
  readonly ytdHighDate: string;
  readonly ytdLow: NormalizedAmount;
  readonly ytdLowDate: string;
  readonly upperLimit: NormalizedAmount;
  readonly lowerLimit: NormalizedAmount;
  readonly basePrice: NormalizedAmount;
  readonly newHighLowFlag: string;
  readonly investmentCaution: boolean;
  readonly marketWarning: boolean;
  readonly shortTermOverheat: boolean;
  readonly viTriggered: boolean;
  readonly shortSellingAvailable: boolean;
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
  readonly prdy_vrss_sign: string; // Change sign (1=상한,2=상승,3=보합,4=하한,5=하락)
  readonly prdy_ctrt: string; // Change percent
  readonly acml_vol: string; // Accumulated volume
  readonly acml_tr_pbmn: string; // Accumulated trading value (원)
  readonly hts_avls: string; // Market cap (억원)
  readonly stck_hgpr: string; // High (today)
  readonly stck_lwpr: string; // Low (today)
  readonly stck_oprc: string; // Open (today)
  readonly stck_mxpr: string; // Upper limit price (상한가)
  readonly stck_llam: string; // Lower limit price (하한가)
  readonly stck_sdpr: string; // Base price (기준가)
  readonly w52_hgpr: string; // 52-week high
  readonly w52_hgpr_date: string; // 52-week high date (YYYYMMDD)
  readonly w52_lwpr: string; // 52-week low
  readonly w52_lwpr_date: string; // 52-week low date (YYYYMMDD)
  readonly stck_dryy_hgpr: string; // YTD high (연중최고)
  readonly dryy_hgpr_date: string; // YTD high date
  readonly stck_dryy_lwpr: string; // YTD low (연중최저)
  readonly dryy_lwpr_date: string; // YTD low date
  readonly per: string; // PER
  readonly pbr: string; // PBR
  readonly eps: string; // EPS
  readonly bps: string; // BPS (Book value Per Share)
  readonly hts_frgn_ehrt: string; // Foreign ownership rate (%)
  readonly frgn_ntby_qty: string; // Foreign net buy quantity
  readonly frgn_hldn_qty: string; // Foreign holding quantity
  readonly pgtr_ntby_qty: string; // Institutional net buy quantity
  readonly lstn_stcn: string; // Listed shares count
  readonly bstp_kor_isnm: string; // Industry name (업종명)
  readonly rprs_mrkt_kor_name: string; // Representative market (대표시장)
  readonly vol_tnrt: string; // Volume turnover rate (거래회전율)
  readonly whol_loan_rmnd_rate: string; // Credit balance rate (신용잔고율)
  readonly stck_fcam: string; // Face value (액면가)
  readonly new_hgpr_lwpr_cls_code: string; // New high/low flag (신고/신저 구분)
  readonly invt_caful_yn: string; // Investment caution (투자주의)
  readonly mrkt_warn_cls_code: string; // Market warning code (시장경고)
  readonly short_over_yn: string; // Short-term overheating (단기과열)
  readonly vi_cls_code: string; // VI triggered (VI발동)
  readonly ssts_yn: string; // Short selling available (공매도가능)
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
  client: KisClientLike,
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

  // Per-share prices: show exact won with commas, not auto-scaled 만원
  const priceFormat: FormatOptions = { preferredScale: 'won' };

  const parsed: StockPriceResult = {
    stockCode: output.stck_shrn_iscd || stockCode,
    name: output.hts_kor_isnm ?? stockCode,
    currentPrice: buildNormalizedAmount(output.stck_prpr, today, priceFormat),
    change: buildNormalizedAmount(output.prdy_vrss, today, { preferredScale: 'won', showSign: true }),
    changePercent: parseRawAmount(output.prdy_ctrt) ?? 0,
    volume: parseRawAmount(output.acml_vol) ?? 0,
    tradingValue: buildNormalizedAmount(output.acml_tr_pbmn, today),
    marketCap: buildMarketCapAmount(output.hts_avls, today),
    high: buildNormalizedAmount(output.stck_hgpr, today, priceFormat),
    low: buildNormalizedAmount(output.stck_lwpr, today, priceFormat),
    open: buildNormalizedAmount(output.stck_oprc, today, priceFormat),
    w52High: buildNormalizedAmount(output.w52_hgpr, today, priceFormat),
    w52HighDate: formatKISDate(output.w52_hgpr_date || ''),
    w52Low: buildNormalizedAmount(output.w52_lwpr, today, priceFormat),
    w52LowDate: formatKISDate(output.w52_lwpr_date || ''),
    per: parseRawAmount(output.per) ?? 0,
    pbr: parseRawAmount(output.pbr) ?? 0,
    eps: parseRawAmount(output.eps) ?? 0,
    bps: parseRawAmount(output.bps) ?? 0,
    foreignOwnershipRate: parseRawAmount(output.hts_frgn_ehrt) ?? 0,
    foreignNetBuy: parseRawAmount(output.frgn_ntby_qty) ?? 0,
    institutionalNetBuy: parseRawAmount(output.pgtr_ntby_qty) ?? 0,
    isMarketOpen: marketOpen,
    details: {
      industry: output.bstp_kor_isnm ?? '',
      market: output.rprs_mrkt_kor_name ?? '',
      listedShares: parseRawAmount(output.lstn_stcn) ?? 0,
      foreignHoldings: parseRawAmount(output.frgn_hldn_qty) ?? 0,
      faceValue: parseRawAmount(output.stck_fcam) ?? 0,
      volumeTurnoverRate: parseRawAmount(output.vol_tnrt) ?? 0,
      creditBalanceRate: parseRawAmount(output.whol_loan_rmnd_rate) ?? 0,
      ytdHigh: buildNormalizedAmount(output.stck_dryy_hgpr, today, priceFormat),
      ytdHighDate: formatKISDate(output.dryy_hgpr_date || ''),
      ytdLow: buildNormalizedAmount(output.stck_dryy_lwpr, today, priceFormat),
      ytdLowDate: formatKISDate(output.dryy_lwpr_date || ''),
      upperLimit: buildNormalizedAmount(output.stck_mxpr, today, priceFormat),
      lowerLimit: buildNormalizedAmount(output.stck_llam, today, priceFormat),
      basePrice: buildNormalizedAmount(output.stck_sdpr, today, priceFormat),
      newHighLowFlag: output.new_hgpr_lwpr_cls_code ?? '',
      investmentCaution: output.invt_caful_yn === 'Y',
      marketWarning: output.mrkt_warn_cls_code !== '00' && output.mrkt_warn_cls_code !== '',
      shortTermOverheat: output.short_over_yn === 'Y',
      viTriggered: output.vi_cls_code !== 'N' && output.vi_cls_code !== '',
      shortSellingAvailable: output.ssts_yn === 'Y',
    },
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
  client: KisClientLike,
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
  client: KisClientLike,
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
 * Pass formatOptions to control display formatting (e.g., preferredScale: 'won' for stock prices).
 */
function buildNormalizedAmount(
  rawValue: string,
  asOfDate: string,
  formatOptions?: FormatOptions
): NormalizedAmount {
  const value = parseRawAmount(rawValue);
  const displayValue = formatAmount(value, formatOptions);
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
