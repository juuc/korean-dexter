/**
 * Account name normalization for OpenDART financial statements.
 * Maps Korean account name variants to standardized categories.
 */

export type AccountCategory =
  | 'revenue'
  | 'operating_income'
  | 'net_income'
  | 'total_assets'
  | 'total_liabilities'
  | 'total_equity'
  | 'operating_cash_flow'
  | 'investing_cash_flow'
  | 'financing_cash_flow'
  | 'eps'
  | 'bps'
  | 'dividends_per_share'
  | 'debt_ratio'
  | 'roe'
  | 'roa'
  | 'operating_margin'
  | 'net_margin'
  | 'current_ratio'
  | 'retained_earnings'
  | 'capex'
  | 'ebitda';

interface AccountMapping {
  readonly category: AccountCategory;
  readonly variants: readonly string[];
  readonly labelKo: string;
  readonly labelEn: string;
}

/**
 * Mappings from Korean account name variants to standardized categories.
 * Each entry contains 2-5 common Korean name variants found in DART data.
 */
export const ACCOUNT_MAPPINGS: readonly AccountMapping[] = [
  {
    category: 'revenue',
    variants: ['매출액', '영업수익', '수익(매출액)', '매출', '순매출액'],
    labelKo: '매출액',
    labelEn: 'Revenue',
  },
  {
    category: 'operating_income',
    variants: ['영업이익', '영업이익(손실)'],
    labelKo: '영업이익',
    labelEn: 'Operating Income',
  },
  {
    category: 'net_income',
    variants: ['당기순이익', '당기순이익(손실)', '분기순이익', '반기순이익'],
    labelKo: '당기순이익',
    labelEn: 'Net Income',
  },
  {
    category: 'total_assets',
    variants: ['자산총계'],
    labelKo: '자산총계',
    labelEn: 'Total Assets',
  },
  {
    category: 'total_liabilities',
    variants: ['부채총계'],
    labelKo: '부채총계',
    labelEn: 'Total Liabilities',
  },
  {
    category: 'total_equity',
    variants: ['자본총계'],
    labelKo: '자본총계',
    labelEn: 'Total Equity',
  },
  {
    category: 'operating_cash_flow',
    variants: ['영업활동현금흐름', '영업활동으로인한현금흐름', '영업활동으로 인한 현금흐름'],
    labelKo: '영업활동현금흐름',
    labelEn: 'Operating Cash Flow',
  },
  {
    category: 'investing_cash_flow',
    variants: ['투자활동현금흐름', '투자활동으로인한현금흐름', '투자활동으로 인한 현금흐름'],
    labelKo: '투자활동현금흐름',
    labelEn: 'Investing Cash Flow',
  },
  {
    category: 'financing_cash_flow',
    variants: ['재무활동현금흐름', '재무활동으로인한현금흐름', '재무활동으로 인한 현금흐름'],
    labelKo: '재무활동현금흐름',
    labelEn: 'Financing Cash Flow',
  },
  {
    category: 'eps',
    variants: ['기본주당이익', '기본주당순이익', '주당순이익', '주당이익'],
    labelKo: '기본주당이익',
    labelEn: 'Earnings Per Share',
  },
  {
    category: 'bps',
    variants: ['주당순자산', '주당순자산가치'],
    labelKo: '주당순자산',
    labelEn: 'Book Value Per Share',
  },
  {
    category: 'dividends_per_share',
    variants: ['주당배당금', '주당현금배당금', '보통주주당배당금'],
    labelKo: '주당배당금',
    labelEn: 'Dividends Per Share',
  },
  {
    category: 'debt_ratio',
    variants: ['부채비율'],
    labelKo: '부채비율',
    labelEn: 'Debt Ratio',
  },
  {
    category: 'roe',
    variants: ['자기자본이익률', '자기자본순이익률'],
    labelKo: '자기자본이익률',
    labelEn: 'Return on Equity',
  },
  {
    category: 'roa',
    variants: ['총자산이익률', '총자산순이익률'],
    labelKo: '총자산이익률',
    labelEn: 'Return on Assets',
  },
  {
    category: 'operating_margin',
    variants: ['영업이익률'],
    labelKo: '영업이익률',
    labelEn: 'Operating Margin',
  },
  {
    category: 'net_margin',
    variants: ['순이익률', '당기순이익률'],
    labelKo: '순이익률',
    labelEn: 'Net Margin',
  },
  {
    category: 'current_ratio',
    variants: ['유동비율'],
    labelKo: '유동비율',
    labelEn: 'Current Ratio',
  },
  {
    category: 'retained_earnings',
    variants: ['이익잉여금', '이익잉여금(결손금)'],
    labelKo: '이익잉여금',
    labelEn: 'Retained Earnings',
  },
  {
    category: 'capex',
    variants: ['자본적지출', '유형자산의취득', '유형자산취득'],
    labelKo: '자본적지출',
    labelEn: 'Capital Expenditures',
  },
  {
    category: 'ebitda',
    variants: ['EBITDA'],
    labelKo: 'EBITDA',
    labelEn: 'EBITDA',
  },
] as const;

/**
 * Pre-built lookup map for O(1) exact match lookups.
 * Maps each variant (and its whitespace-stripped form) to its category.
 */
const variantToCategory: ReadonlyMap<string, AccountCategory> = (() => {
  const map = new Map<string, AccountCategory>();
  for (const mapping of ACCOUNT_MAPPINGS) {
    for (const variant of mapping.variants) {
      map.set(variant, mapping.category);
      // Also add whitespace-stripped version
      const stripped = variant.replace(/\s/g, '');
      if (stripped !== variant) {
        map.set(stripped, mapping.category);
      }
    }
  }
  return map;
})();

/**
 * Pre-built lookup map for category to labels.
 */
const categoryToLabels: ReadonlyMap<
  AccountCategory,
  { readonly labelKo: string; readonly labelEn: string }
> = (() => {
  const map = new Map<
    AccountCategory,
    { readonly labelKo: string; readonly labelEn: string }
  >();
  for (const mapping of ACCOUNT_MAPPINGS) {
    map.set(mapping.category, {
      labelKo: mapping.labelKo,
      labelEn: mapping.labelEn,
    });
  }
  return map;
})();

/**
 * Normalize a raw Korean account name to a standardized category.
 * Tries exact match first, then trimmed/whitespace-stripped match.
 *
 * @param rawName Raw account name from DART API response
 * @returns Matched category, or null if no mapping found
 */
export function normalizeAccountName(rawName: string): AccountCategory | null {
  // Exact match
  const exact = variantToCategory.get(rawName);
  if (exact !== undefined) {
    return exact;
  }

  // Trimmed match
  const trimmed = rawName.trim();
  if (trimmed !== rawName) {
    const trimmedMatch = variantToCategory.get(trimmed);
    if (trimmedMatch !== undefined) {
      return trimmedMatch;
    }
  }

  // Whitespace-stripped match
  const stripped = trimmed.replace(/\s/g, '');
  if (stripped !== trimmed) {
    const strippedMatch = variantToCategory.get(stripped);
    if (strippedMatch !== undefined) {
      return strippedMatch;
    }
  }

  return null;
}

/**
 * Get the display label for a normalized account category.
 *
 * @param category Normalized account category
 * @param lang Language for label: 'ko' (default) or 'en'
 * @returns Display label string
 */
export function getAccountLabel(
  category: AccountCategory,
  lang: 'ko' | 'en' = 'ko'
): string {
  const labels = categoryToLabels.get(category);
  if (!labels) {
    return category;
  }
  return lang === 'ko' ? labels.labelKo : labels.labelEn;
}
