/**
 * A company resolved from user input to its canonical identifiers.
 * Used as the common input for all Korean financial API tools.
 */
export interface ResolvedCompany {
  /** Company name in Korean (e.g., "삼성전자") */
  readonly nameKo: string;
  /** Company name in English (e.g., "Samsung Electronics") */
  readonly nameEn: string;
  /** OpenDART 8-digit corp code (e.g., "00126380") */
  readonly corpCode: string;
  /** KRX stock code / ticker (e.g., "005930") */
  readonly stockCode: string;
  /** Market: KOSPI | KOSDAQ | KONEX */
  readonly market: 'KOSPI' | 'KOSDAQ' | 'KONEX';
}
