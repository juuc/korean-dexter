/**
 * Account name normalization for OpenDART financial statements.
 * Maps Korean K-IFRS account name variants to standardized categories.
 *
 * Supports 30+ financial concepts across Income Statement (IS),
 * Balance Sheet (BS), Cash Flow (CF), ratios, and per-share metrics.
 */

export type AccountCategory =
  // Income Statement (IS)
  | 'revenue'
  | 'operating_income'
  | 'net_income'
  | 'cost_of_sales'
  | 'gross_profit'
  | 'operating_expense'
  | 'net_income_parent'
  | 'interest_expense'
  | 'interest_income'
  | 'other_income'
  | 'other_expense'
  | 'income_tax_expense'
  // Balance Sheet (BS)
  | 'total_assets'
  | 'total_liabilities'
  | 'total_equity'
  | 'current_assets'
  | 'non_current_assets'
  | 'cash_and_equivalents'
  | 'trade_receivables'
  | 'inventories'
  | 'current_liabilities'
  | 'non_current_liabilities'
  | 'borrowings'
  | 'trade_payables'
  | 'retained_earnings'
  | 'equity_parent'
  | 'capital_stock'
  // Cash Flow (CF)
  | 'operating_cash_flow'
  | 'investing_cash_flow'
  | 'financing_cash_flow'
  | 'capex'
  | 'free_cash_flow'
  // Per-share
  | 'eps'
  | 'bps'
  | 'dividends_per_share'
  // Other
  | 'ebitda'
  // Ratios
  | 'debt_ratio'
  | 'roe'
  | 'roa'
  | 'operating_margin'
  | 'net_margin'
  | 'current_ratio';

export type MappingCategory = 'income' | 'balance' | 'cashflow' | 'ratio' | 'per_share';

export type StatementType = 'IS' | 'BS' | 'CF';

export interface AccountMapping {
  readonly conceptId: AccountCategory;
  readonly koreanNames: readonly string[];
  readonly englishName: string;
  readonly labelKo: string;
  readonly category: MappingCategory;
  readonly statementType?: StatementType;
}

/**
 * Complete K-IFRS account mappings with 30+ financial concepts.
 * Each entry maps Korean name variants to a canonical concept ID.
 */
export const ACCOUNT_MAPPINGS: readonly AccountMapping[] = [
  // =========================================================================
  // Income Statement (IS)
  // =========================================================================
  {
    conceptId: 'revenue',
    koreanNames: ['매출액', '영업수익', '수익(매출액)', '매출', '순매출액'],
    englishName: 'Revenue',
    labelKo: '매출액',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'cost_of_sales',
    koreanNames: ['매출원가', '영업비용'],
    englishName: 'Cost of Sales',
    labelKo: '매출원가',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'gross_profit',
    koreanNames: ['매출총이익'],
    englishName: 'Gross Profit',
    labelKo: '매출총이익',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'operating_expense',
    koreanNames: ['판매비와관리비', '판매비와일반관리비'],
    englishName: 'Operating Expense',
    labelKo: '판매비와관리비',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'operating_income',
    koreanNames: ['영업이익', '영업이익(손실)'],
    englishName: 'Operating Income',
    labelKo: '영업이익',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'interest_income',
    koreanNames: ['이자수익', '금융수익'],
    englishName: 'Interest Income',
    labelKo: '이자수익',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'interest_expense',
    koreanNames: ['이자비용', '금융비용'],
    englishName: 'Interest Expense',
    labelKo: '이자비용',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'other_income',
    koreanNames: ['기타수익', '영업외수익'],
    englishName: 'Other Income',
    labelKo: '기타수익',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'other_expense',
    koreanNames: ['기타비용', '영업외비용'],
    englishName: 'Other Expense',
    labelKo: '기타비용',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'income_tax_expense',
    koreanNames: ['법인세비용'],
    englishName: 'Income Tax Expense',
    labelKo: '법인세비용',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'net_income',
    koreanNames: ['당기순이익', '당기순이익(손실)', '분기순이익', '반기순이익'],
    englishName: 'Net Income',
    labelKo: '당기순이익',
    category: 'income',
    statementType: 'IS',
  },
  {
    conceptId: 'net_income_parent',
    koreanNames: ['지배기업소유주지분순이익', '지배주주순이익'],
    englishName: 'Net Income (Parent)',
    labelKo: '지배기업소유주지분순이익',
    category: 'income',
    statementType: 'IS',
  },

  // =========================================================================
  // Balance Sheet (BS)
  // =========================================================================
  {
    conceptId: 'current_assets',
    koreanNames: ['유동자산'],
    englishName: 'Current Assets',
    labelKo: '유동자산',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'cash_and_equivalents',
    koreanNames: ['현금및현금성자산'],
    englishName: 'Cash and Equivalents',
    labelKo: '현금및현금성자산',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'trade_receivables',
    koreanNames: ['매출채권', '매출채권및기타유동채권'],
    englishName: 'Trade Receivables',
    labelKo: '매출채권',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'inventories',
    koreanNames: ['재고자산'],
    englishName: 'Inventories',
    labelKo: '재고자산',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'non_current_assets',
    koreanNames: ['비유동자산'],
    englishName: 'Non-Current Assets',
    labelKo: '비유동자산',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'total_assets',
    koreanNames: ['자산총계'],
    englishName: 'Total Assets',
    labelKo: '자산총계',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'current_liabilities',
    koreanNames: ['유동부채'],
    englishName: 'Current Liabilities',
    labelKo: '유동부채',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'trade_payables',
    koreanNames: ['매입채무', '매입채무및기타유동채무'],
    englishName: 'Trade Payables',
    labelKo: '매입채무',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'borrowings',
    koreanNames: ['차입금', '단기차입금', '장기차입금'],
    englishName: 'Borrowings',
    labelKo: '차입금',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'non_current_liabilities',
    koreanNames: ['비유동부채'],
    englishName: 'Non-Current Liabilities',
    labelKo: '비유동부채',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'total_liabilities',
    koreanNames: ['부채총계'],
    englishName: 'Total Liabilities',
    labelKo: '부채총계',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'capital_stock',
    koreanNames: ['자본금'],
    englishName: 'Capital Stock',
    labelKo: '자본금',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'retained_earnings',
    koreanNames: ['이익잉여금', '이익잉여금(결손금)'],
    englishName: 'Retained Earnings',
    labelKo: '이익잉여금',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'equity_parent',
    koreanNames: ['지배기업소유주지분', '지배주주지분'],
    englishName: 'Equity (Parent)',
    labelKo: '지배기업소유주지분',
    category: 'balance',
    statementType: 'BS',
  },
  {
    conceptId: 'total_equity',
    koreanNames: ['자본총계'],
    englishName: 'Total Equity',
    labelKo: '자본총계',
    category: 'balance',
    statementType: 'BS',
  },

  // =========================================================================
  // Cash Flow (CF)
  // =========================================================================
  {
    conceptId: 'operating_cash_flow',
    koreanNames: ['영업활동현금흐름', '영업활동으로인한현금흐름', '영업활동으로 인한 현금흐름'],
    englishName: 'Operating Cash Flow',
    labelKo: '영업활동현금흐름',
    category: 'cashflow',
    statementType: 'CF',
  },
  {
    conceptId: 'investing_cash_flow',
    koreanNames: ['투자활동현금흐름', '투자활동으로인한현금흐름', '투자활동으로 인한 현금흐름'],
    englishName: 'Investing Cash Flow',
    labelKo: '투자활동현금흐름',
    category: 'cashflow',
    statementType: 'CF',
  },
  {
    conceptId: 'financing_cash_flow',
    koreanNames: ['재무활동현금흐름', '재무활동으로인한현금흐름', '재무활동으로 인한 현금흐름'],
    englishName: 'Financing Cash Flow',
    labelKo: '재무활동현금흐름',
    category: 'cashflow',
    statementType: 'CF',
  },
  {
    conceptId: 'capex',
    koreanNames: ['자본적지출', '유형자산의취득', '유형자산취득'],
    englishName: 'Capital Expenditures',
    labelKo: '자본적지출',
    category: 'cashflow',
    statementType: 'CF',
  },
  {
    conceptId: 'free_cash_flow',
    koreanNames: ['잉여현금흐름'],
    englishName: 'Free Cash Flow',
    labelKo: '잉여현금흐름',
    category: 'cashflow',
    statementType: 'CF',
  },

  // =========================================================================
  // Per-share metrics (no statement type)
  // =========================================================================
  {
    conceptId: 'eps',
    koreanNames: ['기본주당이익', '기본주당순이익', '주당순이익', '주당이익'],
    englishName: 'Earnings Per Share',
    labelKo: '기본주당이익',
    category: 'per_share',
  },
  {
    conceptId: 'bps',
    koreanNames: ['주당순자산', '주당순자산가치'],
    englishName: 'Book Value Per Share',
    labelKo: '주당순자산',
    category: 'per_share',
  },
  {
    conceptId: 'dividends_per_share',
    koreanNames: ['주당배당금', '주당현금배당금', '보통주주당배당금'],
    englishName: 'Dividends Per Share',
    labelKo: '주당배당금',
    category: 'per_share',
  },

  // =========================================================================
  // Other metrics (no statement type)
  // =========================================================================
  {
    conceptId: 'ebitda',
    koreanNames: ['EBITDA'],
    englishName: 'EBITDA',
    labelKo: 'EBITDA',
    category: 'income',
    statementType: 'IS',
  },

  // =========================================================================
  // Ratios (no statement type)
  // =========================================================================
  {
    conceptId: 'debt_ratio',
    koreanNames: ['부채비율'],
    englishName: 'Debt Ratio',
    labelKo: '부채비율',
    category: 'ratio',
  },
  {
    conceptId: 'roe',
    koreanNames: ['자기자본이익률', '자기자본순이익률'],
    englishName: 'Return on Equity',
    labelKo: '자기자본이익률',
    category: 'ratio',
  },
  {
    conceptId: 'roa',
    koreanNames: ['총자산이익률', '총자산순이익률'],
    englishName: 'Return on Assets',
    labelKo: '총자산이익률',
    category: 'ratio',
  },
  {
    conceptId: 'operating_margin',
    koreanNames: ['영업이익률'],
    englishName: 'Operating Margin',
    labelKo: '영업이익률',
    category: 'ratio',
  },
  {
    conceptId: 'net_margin',
    koreanNames: ['순이익률', '당기순이익률'],
    englishName: 'Net Margin',
    labelKo: '순이익률',
    category: 'ratio',
  },
  {
    conceptId: 'current_ratio',
    koreanNames: ['유동비율'],
    englishName: 'Current Ratio',
    labelKo: '유동비율',
    category: 'ratio',
  },
] as const;

// ---------------------------------------------------------------------------
// AccountMapper class
// ---------------------------------------------------------------------------

/**
 * Stateful mapper for K-IFRS account name normalization.
 * Tracks unknown account names for future mapping improvements.
 *
 * Use `AccountMapper.create()` to get a fresh instance, or import
 * the `accountMapper` singleton for shared use.
 */
export class AccountMapper {
  private readonly variantToConceptId: ReadonlyMap<string, AccountCategory>;
  private readonly variantToMapping: ReadonlyMap<string, AccountMapping>;
  private readonly conceptIdToMapping: ReadonlyMap<AccountCategory, AccountMapping>;
  private readonly unknowns: Set<string> = new Set();

  private constructor(mappings: readonly AccountMapping[]) {
    const variantToConceptId = new Map<string, AccountCategory>();
    const variantToMapping = new Map<string, AccountMapping>();
    const conceptIdToMapping = new Map<AccountCategory, AccountMapping>();

    for (const mapping of mappings) {
      conceptIdToMapping.set(mapping.conceptId, mapping);
      for (const name of mapping.koreanNames) {
        variantToConceptId.set(name, mapping.conceptId);
        variantToMapping.set(name, mapping);
        // Also add whitespace-stripped version for matching
        const stripped = name.replace(/\s/g, '');
        if (stripped !== name) {
          variantToConceptId.set(stripped, mapping.conceptId);
          variantToMapping.set(stripped, mapping);
        }
      }
    }

    this.variantToConceptId = variantToConceptId;
    this.variantToMapping = variantToMapping;
    this.conceptIdToMapping = conceptIdToMapping;
  }

  /** Create a fresh AccountMapper instance with default mappings. */
  static create(): AccountMapper {
    return new AccountMapper(ACCOUNT_MAPPINGS);
  }

  /**
   * Resolve a raw Korean name to its canonical key.
   * Returns the trimmed name used for lookup (after whitespace handling).
   */
  private resolveKey(rawName: string): string | null {
    // Exact match
    if (this.variantToConceptId.has(rawName)) {
      return rawName;
    }

    // Trimmed match
    const trimmed = rawName.trim();
    if (trimmed !== rawName && this.variantToConceptId.has(trimmed)) {
      return trimmed;
    }

    // Whitespace-stripped match
    const stripped = trimmed.replace(/\s/g, '');
    if (stripped !== trimmed && this.variantToConceptId.has(stripped)) {
      return stripped;
    }

    return null;
  }

  /**
   * Normalize a raw Korean account name to a standardized category.
   * Tracks unrecognized names (non-empty) for future mapping improvements.
   *
   * @param rawName Raw account name from DART API response
   * @returns Matched AccountCategory, or null if no mapping found
   */
  normalize(rawName: string): AccountCategory | null {
    const key = this.resolveKey(rawName);
    if (key !== null) {
      return this.variantToConceptId.get(key) ?? null;
    }

    // Track unknown (non-empty) account names
    const trimmed = rawName.trim();
    if (trimmed.length > 0) {
      this.unknowns.add(trimmed);
    }

    return null;
  }

  /**
   * Translate a Korean account name to its English equivalent.
   *
   * @param rawName Raw Korean account name
   * @returns English name, or null if not recognized
   */
  toEnglish(rawName: string): string | null {
    const key = this.resolveKey(rawName);
    if (key === null) {
      return null;
    }
    return this.variantToMapping.get(key)?.englishName ?? null;
  }

  /**
   * Get the full mapping definition for a concept ID.
   *
   * @param conceptId Canonical concept identifier (e.g. 'revenue')
   * @returns Full AccountMapping, or null if not found
   */
  getMapping(conceptId: AccountCategory): AccountMapping | null {
    return this.conceptIdToMapping.get(conceptId) ?? null;
  }

  /**
   * Check whether a Korean account name is recognized.
   *
   * @param rawName Raw Korean account name
   * @returns true if the name maps to a known concept
   */
  isRecognized(rawName: string): boolean {
    return this.resolveKey(rawName) !== null;
  }

  /**
   * Get all concepts belonging to a mapping category.
   *
   * @param category One of 'income', 'balance', 'cashflow', 'ratio', 'per_share'
   * @returns Array of matching AccountMapping objects
   */
  getConceptsByCategory(category: MappingCategory): readonly AccountMapping[] {
    return ACCOUNT_MAPPINGS.filter((m) => m.category === category);
  }

  /**
   * Get all concepts belonging to a financial statement type.
   *
   * @param statementType One of 'IS', 'BS', 'CF'
   * @returns Array of matching AccountMapping objects
   */
  getConceptsByStatementType(statementType: StatementType): readonly AccountMapping[] {
    return ACCOUNT_MAPPINGS.filter((m) => m.statementType === statementType);
  }

  /**
   * Get all unknown account names encountered during normalize() calls.
   * Useful for identifying DART data variants not yet mapped.
   *
   * @returns Array of unrecognized Korean account names (deduplicated)
   */
  getUnknownAccounts(): readonly string[] {
    return [...this.unknowns];
  }
}

/** Shared singleton instance for convenience. */
export const accountMapper = AccountMapper.create();

// ---------------------------------------------------------------------------
// Backward-compatible free functions
// ---------------------------------------------------------------------------

/**
 * Normalize a raw Korean account name to a standardized category.
 * Backward-compatible wrapper around AccountMapper.
 *
 * @param rawName Raw account name from DART API response
 * @returns Matched category, or null if no mapping found
 */
export function normalizeAccountName(rawName: string): AccountCategory | null {
  // Use a dedicated instance to avoid polluting the singleton's unknown tracking
  return backwardCompatMapper.normalize(rawName);
}

/**
 * Get the display label for a normalized account category.
 * Backward-compatible wrapper around AccountMapper.
 *
 * @param category Normalized account category
 * @param lang Language for label: 'ko' (default) or 'en'
 * @returns Display label string
 */
export function getAccountLabel(
  category: AccountCategory,
  lang: 'ko' | 'en' = 'ko'
): string {
  const mapping = backwardCompatMapper.getMapping(category);
  if (!mapping) {
    return category;
  }
  return lang === 'ko' ? mapping.labelKo : mapping.englishName;
}

/** Internal mapper instance for backward-compatible free functions. */
const backwardCompatMapper = AccountMapper.create();
