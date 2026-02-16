/** Raw mapping entry from OpenDART corpCode.xml */
export interface CorpMapping {
  readonly corp_code: string;    // 8-digit DART code
  readonly corp_name: string;    // Korean name
  readonly stock_code: string;   // 6-digit ticker (empty string for unlisted)
  readonly modify_date: string;  // Last change date
}

/** Result of corp code resolution with confidence scoring */
export interface CorpCodeResult {
  readonly corp_code: string;
  readonly corp_name: string;
  readonly stock_code: string | null;
  readonly confidence: number;            // 0.0 - 1.0
  readonly matchType: 'exact_ticker' | 'exact_corpcode' | 'exact_name' | 'fuzzy_name';
  readonly alternatives: ReadonlyArray<{
    readonly corp_code: string;
    readonly corp_name: string;
    readonly stock_code: string | null;
    readonly similarity: number;
  }>;
}

/**
 * A company resolved from user input to its canonical identifiers.
 * Used as the common input for all Korean financial API tools.
 */
export interface ResolvedCompany {
  /** OpenDART 8-digit corp code (e.g., "00126380") */
  readonly corpCode: string;
  /** KRX stock code / ticker (6 digits, e.g., "005930"). Null for unlisted companies. */
  readonly stockCode: string | null;
  /** Company name in Korean (e.g., "삼성전자") */
  readonly corpName: string;
  /** Company name in English (optional, e.g., "Samsung Electronics") */
  readonly corpNameEn?: string;
  /** Market listing */
  readonly market: 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'UNLISTED';
  /** Fiscal year end month (1-12) */
  readonly fiscalYearEnd: number;
}
