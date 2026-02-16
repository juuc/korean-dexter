/**
 * Standardized financial amount across all APIs.
 * All monetary values are normalized through this type to ensure consistency.
 */
export interface NormalizedAmount {
  /** Raw value in WON (원). Null if data unavailable. */
  readonly value: number | null;
  /** Korean-formatted display value (e.g., "258.9조원", "7,730억원") */
  readonly displayValue: string;
  /** Unit: "KRW", "USD", "%", "index", etc. */
  readonly unit: string;
  /** Display scale used for formatting */
  readonly scale: 'won' | 'man' | 'eok' | 'jo';
  /** True if this value was interpolated or estimated */
  readonly isEstimate: boolean;
  /** Data source: "opendart" | "kis" | "bok" | "kosis" */
  readonly source: string;
  /** ISO 8601 date (YYYY-MM-DD) */
  readonly asOfDate: string;
}

/**
 * Normalized time period across different API date formats.
 * Handles annual, semi-annual, quarterly, monthly, and daily periods.
 */
export interface PeriodRange {
  /** Period type */
  readonly type: 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'daily';
  /** Calendar year */
  readonly year: number;
  /** Quarter (1-4) if applicable */
  readonly quarter?: 1 | 2 | 3 | 4;
  /** Month (1-12) if applicable */
  readonly month?: number;
  /** Period start date (YYYY-MM-DD) */
  readonly startDate: string;
  /** Period end date (YYYY-MM-DD) */
  readonly endDate: string;
  /** OpenDART report code if applicable: "11011" (annual), "11013" (Q1), "11012" (H1), "11014" (Q3) */
  readonly dartReprtCode?: string;
  /** Korean label (e.g., "2024년 3분기") */
  readonly label: string;
  /** English label (e.g., "Q3 2024") */
  readonly labelEn: string;
}

/**
 * Error details for failed API tool responses.
 */
export interface ToolError {
  /** Error classification */
  readonly code:
    | 'RATE_LIMITED'
    | 'AUTH_EXPIRED'
    | 'NOT_FOUND'
    | 'API_ERROR'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR';
  /** Human-readable error message */
  readonly message: string;
  /** True if operation can be retried */
  readonly retryable: boolean;
  /** Source API that generated this error */
  readonly apiSource: 'opendart' | 'kis' | 'bok' | 'kosis';
}

/**
 * Unified result wrapper for all API tool responses.
 * Provides consistent error handling and metadata across APIs.
 */
export interface ToolResult<T = unknown> {
  /** True if operation succeeded */
  readonly success: boolean;
  /** Result data (null on error) */
  readonly data: T | null;
  /** Error details if success=false */
  readonly error?: ToolError;
  /** Response metadata */
  readonly metadata: {
    /** Remaining daily API quota (if applicable) */
    readonly remainingDailyQuota?: number;
    /** Data as-of date (YYYY-MM-DD) */
    readonly dataAsOfDate?: string;
    /** True if market is currently open (for KIS real-time data) */
    readonly isMarketOpen?: boolean;
    /** Financial statement division: CFS (Consolidated) or OFS (Separate) */
    readonly fsDiv?: 'CFS' | 'OFS';
    /** API response time in milliseconds */
    readonly responseTimeMs: number;
  };
}

/**
 * Convert OpenDART report code to PeriodRange.
 * @param bsns_year Business year (e.g., "2024")
 * @param reprt_code Report code: "11011" (annual), "11013" (Q1), "11012" (H1), "11014" (Q3)
 */
export function dartReprtCodeToPeriod(
  bsns_year: string,
  reprt_code: string
): PeriodRange {
  const year = parseInt(bsns_year, 10);

  // Annual report: 11011
  if (reprt_code === '11011') {
    return {
      type: 'annual',
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      dartReprtCode: reprt_code,
      label: `${year}년`,
      labelEn: `${year}`,
    };
  }

  // 1st half (semi-annual): 11012
  if (reprt_code === '11012') {
    return {
      type: 'semi_annual',
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-06-30`,
      dartReprtCode: reprt_code,
      label: `${year}년 상반기`,
      labelEn: `H1 ${year}`,
    };
  }

  // Q1: 11013
  if (reprt_code === '11013') {
    return {
      type: 'quarterly',
      year,
      quarter: 1,
      startDate: `${year}-01-01`,
      endDate: `${year}-03-31`,
      dartReprtCode: reprt_code,
      label: `${year}년 1분기`,
      labelEn: `Q1 ${year}`,
    };
  }

  // Q3: 11014
  if (reprt_code === '11014') {
    return {
      type: 'quarterly',
      year,
      quarter: 3,
      startDate: `${year}-07-01`,
      endDate: `${year}-09-30`,
      dartReprtCode: reprt_code,
      label: `${year}년 3분기`,
      labelEn: `Q3 ${year}`,
    };
  }

  throw new Error(`Unknown OpenDART reprt_code: ${reprt_code}`);
}

/**
 * Convert KIS date string to PeriodRange.
 * @param date Date string in YYYYMMDD format
 * @param type Period type (defaults to 'daily')
 */
export function kisDateToPeriod(
  date: string,
  type: PeriodRange['type'] = 'daily'
): PeriodRange {
  const year = parseInt(date.substring(0, 4), 10);
  const month = parseInt(date.substring(4, 6), 10);
  const day = parseInt(date.substring(6, 8), 10);

  const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  return {
    type,
    year,
    month,
    startDate: formattedDate,
    endDate: formattedDate,
    label: `${year}년 ${month}월 ${day}일`,
    labelEn: formattedDate,
  };
}

/**
 * Convert BOK period string to PeriodRange.
 * BOK uses formats like: "2024Q3", "202406", "2024"
 * @param period BOK period string
 */
export function bokPeriodStringToPeriod(period: string): PeriodRange {
  // Annual: "2024"
  if (/^\d{4}$/.test(period)) {
    const year = parseInt(period, 10);
    return {
      type: 'annual',
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: `${year}년`,
      labelEn: `${year}`,
    };
  }

  // Quarterly: "2024Q3"
  const quarterMatch = period.match(/^(\d{4})Q([1-4])$/);
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1], 10);
    const quarter = parseInt(quarterMatch[2], 10) as 1 | 2 | 3 | 4;

    const quarterDates = {
      1: { start: '01-01', end: '03-31', labelKo: '1분기' },
      2: { start: '04-01', end: '06-30', labelKo: '2분기' },
      3: { start: '07-01', end: '09-30', labelKo: '3분기' },
      4: { start: '10-01', end: '12-31', labelKo: '4분기' },
    };

    const dates = quarterDates[quarter];
    return {
      type: 'quarterly',
      year,
      quarter,
      startDate: `${year}-${dates.start}`,
      endDate: `${year}-${dates.end}`,
      label: `${year}년 ${dates.labelKo}`,
      labelEn: `Q${quarter} ${year}`,
    };
  }

  // Monthly: "202406"
  const monthMatch = period.match(/^(\d{4})(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);

    // Calculate last day of month
    const lastDay = new Date(year, month, 0).getDate();

    return {
      type: 'monthly',
      year,
      month,
      startDate: `${year}-${month.toString().padStart(2, '0')}-01`,
      endDate: `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`,
      label: `${year}년 ${month}월`,
      labelEn: `${year}-${month.toString().padStart(2, '0')}`,
    };
  }

  throw new Error(`Unknown BOK period format: ${period}`);
}

/**
 * Create a successful ToolResult.
 */
export function createToolResult<T>(
  data: T,
  metadata: ToolResult<T>['metadata']
): ToolResult<T> {
  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Create a failed ToolResult with error details.
 */
export function createToolError<T = unknown>(
  code: ToolError['code'],
  message: string,
  apiSource: ToolError['apiSource'],
  retryable: boolean,
  responseTimeMs: number
): ToolResult<T> {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      retryable,
      apiSource,
    },
    metadata: {
      responseTimeMs,
    },
  };
}
