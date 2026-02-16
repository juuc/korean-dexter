/**
 * OpenDART API tool implementations.
 * Financial statements, company info, and disclosure search.
 */

import type { NormalizedAmount, PeriodRange, ToolResult } from '@/shared/types.js';
import { dartReprtCodeToPeriod, createToolResult, createToolError } from '@/shared/types.js';
import { parseRawAmount, formatAmount } from '@/shared/formatter.js';
import { normalizeAccountName, type AccountCategory } from './account-mapper.js';
import type { OpenDartClient } from './client.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface FinancialStatementItem {
  readonly accountName: string;
  readonly normalizedCategory: AccountCategory | null;
  readonly currentAmount: NormalizedAmount;
  readonly previousAmount: NormalizedAmount;
}

export interface FinancialStatementResult {
  readonly corpCode: string;
  readonly corpName: string;
  readonly period: PeriodRange;
  readonly fsDiv: 'CFS' | 'OFS';
  readonly items: readonly FinancialStatementItem[];
}

export interface CompanyInfoResult {
  readonly corpCode: string;
  readonly corpName: string;
  readonly corpNameEn: string;
  readonly ceoName: string;
  readonly corpClass: string;
  readonly indutyCode: string;
  readonly establishDate: string;
  readonly accountMonth: string;
}

export interface DisclosureItem {
  readonly rceptNo: string;
  readonly corpName: string;
  readonly rceptDt: string;
  readonly reportNm: string;
  readonly flrNm: string;
}

export interface DisclosureSearchResult {
  readonly totalCount: number;
  readonly pageNo: number;
  readonly items: readonly DisclosureItem[];
}

// ---------------------------------------------------------------------------
// Raw DART response shapes (internal)
// ---------------------------------------------------------------------------

interface DartFinancialItem {
  readonly rcept_no: string;
  readonly corp_code: string;
  readonly corp_name: string;
  readonly stock_code: string;
  readonly reprt_code: string;
  readonly bsns_year: string;
  readonly fs_div: string;
  readonly sj_div: string;
  readonly account_nm: string;
  readonly thstrm_nm: string;
  readonly thstrm_amount: string;
  readonly frmtrm_nm: string;
  readonly frmtrm_amount: string;
  readonly bfefrmtrm_nm: string;
  readonly bfefrmtrm_amount: string;
  readonly ord: string;
}

interface DartFinancialResponse {
  readonly status: string;
  readonly message: string;
  readonly list: readonly DartFinancialItem[];
}

interface DartCompanyResponse {
  readonly status: string;
  readonly message: string;
  readonly corp_code: string;
  readonly corp_name: string;
  readonly corp_name_eng: string;
  readonly ceo_nm: string;
  readonly corp_cls: string;
  readonly induty_code: string;
  readonly est_dt: string;
  readonly acc_mt: string;
}

interface DartDisclosureItem {
  readonly corp_cls: string;
  readonly corp_name: string;
  readonly corp_code: string;
  readonly stock_code: string;
  readonly rcept_no: string;
  readonly rcept_dt: string;
  readonly report_nm: string;
  readonly flr_nm: string;
  readonly rm: string;
}

interface DartDisclosureResponse {
  readonly status: string;
  readonly message: string;
  readonly page_no: number;
  readonly page_count: number;
  readonly total_count: number;
  readonly list: readonly DartDisclosureItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a NormalizedAmount from a raw DART amount string.
 */
function buildNormalizedAmount(
  raw: string | null | undefined,
  source: string,
  asOfDate: string
): NormalizedAmount {
  const value = parseRawAmount(raw);
  return {
    value,
    displayValue: formatAmount(value),
    unit: 'KRW',
    scale: determineScale(value),
    isEstimate: false,
    source,
    asOfDate,
  };
}

/**
 * Determine the display scale for a value.
 */
function determineScale(value: number | null): NormalizedAmount['scale'] {
  if (value === null) return 'won';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return 'jo';
  if (abs >= 100_000_000) return 'eok';
  if (abs >= 10_000) return 'man';
  return 'won';
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * Get key financial statement items (revenue, OI, NI, assets, etc.) from DART.
 *
 * Uses the `fnlttSinglAcnt` endpoint for single-company financial highlights.
 * Defaults to consolidated (CFS); falls back to separate (OFS) if no CFS data.
 *
 * @param client OpenDartClient instance
 * @param corpCode 8-digit DART corp code
 * @param year Business year (e.g., "2024")
 * @param reportCode DART report code: "11011" annual, "11012" H1, "11013" Q1, "11014" Q3
 * @param fsDiv Financial statement division; defaults to 'CFS', falls back to 'OFS'
 */
export async function getFinancialStatements(
  client: OpenDartClient,
  corpCode: string,
  year: string,
  reportCode: string,
  fsDiv?: 'CFS' | 'OFS'
): Promise<ToolResult<FinancialStatementResult>> {
  const requestedFsDiv = fsDiv ?? 'CFS';

  const result = await client.request<DartFinancialResponse>(
    'fnlttSinglAcnt',
    {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
      fs_div: requestedFsDiv,
    },
    { ttlMs: null } // Financial data is immutable once published
  );

  // If CFS returned no data and we haven't tried OFS yet, fall back
  if (
    !result.success &&
    result.error?.code === 'NOT_FOUND' &&
    requestedFsDiv === 'CFS' &&
    fsDiv === undefined
  ) {
    const ofsResult = await client.request<DartFinancialResponse>(
      'fnlttSinglAcnt',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reportCode,
        fs_div: 'OFS',
      },
      { ttlMs: null }
    );

    if (!ofsResult.success) {
      return createToolError(
        ofsResult.error?.code ?? 'API_ERROR',
        ofsResult.error?.message ?? 'Failed to fetch financial statements (OFS fallback)',
        'opendart',
        ofsResult.error?.retryable ?? false,
        ofsResult.metadata.responseTimeMs
      );
    }

    return parseFinancialResponse(ofsResult.data, corpCode, year, reportCode, 'OFS', ofsResult.metadata.responseTimeMs);
  }

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to fetch financial statements',
      'opendart',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  return parseFinancialResponse(result.data, corpCode, year, reportCode, requestedFsDiv, result.metadata.responseTimeMs);
}

/**
 * Parse raw DART financial response into structured result.
 */
function parseFinancialResponse(
  data: DartFinancialResponse | null,
  corpCode: string,
  year: string,
  reportCode: string,
  fsDiv: 'CFS' | 'OFS',
  responseTimeMs: number
): ToolResult<FinancialStatementResult> {
  if (!data?.list?.length) {
    return createToolError(
      'NOT_FOUND',
      'No financial statement items returned',
      'opendart',
      false,
      responseTimeMs
    );
  }

  const period = dartReprtCodeToPeriod(year, reportCode);
  const asOfDate = period.endDate;
  const corpName = data.list[0].corp_name;

  const items: FinancialStatementItem[] = data.list.map((item) => ({
    accountName: item.account_nm,
    normalizedCategory: normalizeAccountName(item.account_nm),
    currentAmount: buildNormalizedAmount(item.thstrm_amount, 'opendart', asOfDate),
    previousAmount: buildNormalizedAmount(item.frmtrm_amount, 'opendart', asOfDate),
  }));

  return createToolResult<FinancialStatementResult>(
    {
      corpCode,
      corpName,
      period,
      fsDiv,
      items,
    },
    {
      responseTimeMs,
      fsDiv,
    }
  );
}

/**
 * Get company overview information from DART.
 *
 * @param client OpenDartClient instance
 * @param corpCode 8-digit DART corp code
 */
export async function getCompanyInfo(
  client: OpenDartClient,
  corpCode: string
): Promise<ToolResult<CompanyInfoResult>> {
  const result = await client.request<DartCompanyResponse>(
    'company',
    { corp_code: corpCode },
    { ttlMs: 30 * 24 * 60 * 60 * 1000 } // 30 days — company info changes rarely
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to fetch company info',
      'opendart',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const data = result.data;
  if (!data) {
    return createToolError(
      'PARSE_ERROR',
      'Empty response from company endpoint',
      'opendart',
      false,
      result.metadata.responseTimeMs
    );
  }

  return createToolResult<CompanyInfoResult>(
    {
      corpCode: data.corp_code,
      corpName: data.corp_name,
      corpNameEn: data.corp_name_eng,
      ceoName: data.ceo_nm,
      corpClass: data.corp_cls,
      indutyCode: data.induty_code ?? '',
      establishDate: data.est_dt,
      accountMonth: data.acc_mt,
    },
    {
      responseTimeMs: result.metadata.responseTimeMs,
    }
  );
}

export interface DisclosureSearchOptions {
  readonly startDate?: string;
  readonly endDate?: string;
  readonly type?: string;
  readonly page?: number;
}

/**
 * Search disclosures filed with DART.
 *
 * @param client OpenDartClient instance
 * @param corpCode 8-digit DART corp code
 * @param options Search filters (date range, type, pagination)
 */
export async function getDisclosures(
  client: OpenDartClient,
  corpCode: string,
  options?: DisclosureSearchOptions
): Promise<ToolResult<DisclosureSearchResult>> {
  const params: Record<string, string> = {
    corp_code: corpCode,
  };

  if (options?.startDate) {
    params.bgn_de = options.startDate;
  }
  if (options?.endDate) {
    params.end_de = options.endDate;
  }
  if (options?.type) {
    params.pblntf_ty = options.type;
  }
  if (options?.page) {
    params.page_no = String(options.page);
  }

  const result = await client.request<DartDisclosureResponse>(
    'list',
    params,
    { ttlMs: 60 * 60 * 1000 } // 1 hour — disclosures update frequently
  );

  if (!result.success) {
    return createToolError(
      result.error?.code ?? 'API_ERROR',
      result.error?.message ?? 'Failed to search disclosures',
      'opendart',
      result.error?.retryable ?? false,
      result.metadata.responseTimeMs
    );
  }

  const data = result.data;
  if (!data) {
    return createToolError(
      'PARSE_ERROR',
      'Empty response from disclosure search endpoint',
      'opendart',
      false,
      result.metadata.responseTimeMs
    );
  }

  const items: DisclosureItem[] = (data.list ?? []).map((item) => ({
    rceptNo: item.rcept_no,
    corpName: item.corp_name,
    rceptDt: item.rcept_dt,
    reportNm: item.report_nm,
    flrNm: item.flr_nm,
  }));

  return createToolResult<DisclosureSearchResult>(
    {
      totalCount: data.total_count,
      pageNo: data.page_no,
      items,
    },
    {
      responseTimeMs: result.metadata.responseTimeMs,
    }
  );
}
