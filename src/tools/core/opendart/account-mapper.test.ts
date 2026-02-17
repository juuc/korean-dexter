import { describe, test, expect, beforeEach } from 'bun:test';
import {
  normalizeAccountName,
  getAccountLabel,
  ACCOUNT_MAPPINGS,
  AccountMapper,
  accountMapper,
  type AccountCategory,
  type AccountMapping,
} from './account-mapper.js';

// ---------------------------------------------------------------------------
// 1. AccountMapper.normalize() — concept normalization
// ---------------------------------------------------------------------------
describe('AccountMapper.normalize()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  // --- Income Statement (IS) ---
  test('revenue variants', () => {
    expect(mapper.normalize('매출액')).toBe('revenue');
    expect(mapper.normalize('영업수익')).toBe('revenue');
    expect(mapper.normalize('수익(매출액)')).toBe('revenue');
    expect(mapper.normalize('매출')).toBe('revenue');
    expect(mapper.normalize('순매출액')).toBe('revenue');
  });

  test('operating_income variants', () => {
    expect(mapper.normalize('영업이익')).toBe('operating_income');
    expect(mapper.normalize('영업이익(손실)')).toBe('operating_income');
  });

  test('net_income variants', () => {
    expect(mapper.normalize('당기순이익')).toBe('net_income');
    expect(mapper.normalize('당기순이익(손실)')).toBe('net_income');
    expect(mapper.normalize('분기순이익')).toBe('net_income');
    expect(mapper.normalize('반기순이익')).toBe('net_income');
  });

  test('cost_of_sales variants', () => {
    expect(mapper.normalize('매출원가')).toBe('cost_of_sales');
    expect(mapper.normalize('영업비용')).toBe('cost_of_sales');
  });

  test('gross_profit variant', () => {
    expect(mapper.normalize('매출총이익')).toBe('gross_profit');
  });

  test('operating_expense variants', () => {
    expect(mapper.normalize('판매비와관리비')).toBe('operating_expense');
    expect(mapper.normalize('판매비와일반관리비')).toBe('operating_expense');
  });

  test('net_income_parent variants', () => {
    expect(mapper.normalize('지배기업소유주지분순이익')).toBe('net_income_parent');
    expect(mapper.normalize('지배주주순이익')).toBe('net_income_parent');
  });

  test('interest_expense variants', () => {
    expect(mapper.normalize('이자비용')).toBe('interest_expense');
    expect(mapper.normalize('금융비용')).toBe('interest_expense');
  });

  test('interest_income variants', () => {
    expect(mapper.normalize('이자수익')).toBe('interest_income');
    expect(mapper.normalize('금융수익')).toBe('interest_income');
  });

  test('other_income variants', () => {
    expect(mapper.normalize('기타수익')).toBe('other_income');
    expect(mapper.normalize('영업외수익')).toBe('other_income');
  });

  test('other_expense variants', () => {
    expect(mapper.normalize('기타비용')).toBe('other_expense');
    expect(mapper.normalize('영업외비용')).toBe('other_expense');
  });

  test('income_tax_expense variant', () => {
    expect(mapper.normalize('법인세비용')).toBe('income_tax_expense');
  });

  // --- Balance Sheet (BS) ---
  test('total_assets variant', () => {
    expect(mapper.normalize('자산총계')).toBe('total_assets');
  });

  test('total_liabilities variant', () => {
    expect(mapper.normalize('부채총계')).toBe('total_liabilities');
  });

  test('total_equity variant', () => {
    expect(mapper.normalize('자본총계')).toBe('total_equity');
  });

  test('current_assets variant', () => {
    expect(mapper.normalize('유동자산')).toBe('current_assets');
  });

  test('non_current_assets variant', () => {
    expect(mapper.normalize('비유동자산')).toBe('non_current_assets');
  });

  test('cash_and_equivalents variant', () => {
    expect(mapper.normalize('현금및현금성자산')).toBe('cash_and_equivalents');
  });

  test('trade_receivables variants', () => {
    expect(mapper.normalize('매출채권')).toBe('trade_receivables');
    expect(mapper.normalize('매출채권및기타유동채권')).toBe('trade_receivables');
  });

  test('inventories variant', () => {
    expect(mapper.normalize('재고자산')).toBe('inventories');
  });

  test('current_liabilities variant', () => {
    expect(mapper.normalize('유동부채')).toBe('current_liabilities');
  });

  test('non_current_liabilities variant', () => {
    expect(mapper.normalize('비유동부채')).toBe('non_current_liabilities');
  });

  test('borrowings variants', () => {
    expect(mapper.normalize('차입금')).toBe('borrowings');
    expect(mapper.normalize('단기차입금')).toBe('borrowings');
    expect(mapper.normalize('장기차입금')).toBe('borrowings');
  });

  test('trade_payables variants', () => {
    expect(mapper.normalize('매입채무')).toBe('trade_payables');
    expect(mapper.normalize('매입채무및기타유동채무')).toBe('trade_payables');
  });

  test('retained_earnings variants', () => {
    expect(mapper.normalize('이익잉여금')).toBe('retained_earnings');
    expect(mapper.normalize('이익잉여금(결손금)')).toBe('retained_earnings');
  });

  test('equity_parent variants', () => {
    expect(mapper.normalize('지배기업소유주지분')).toBe('equity_parent');
    expect(mapper.normalize('지배주주지분')).toBe('equity_parent');
  });

  test('capital_stock variant', () => {
    expect(mapper.normalize('자본금')).toBe('capital_stock');
  });

  // --- Cash Flow (CF) ---
  test('operating_cash_flow variants', () => {
    expect(mapper.normalize('영업활동현금흐름')).toBe('operating_cash_flow');
    expect(mapper.normalize('영업활동으로인한현금흐름')).toBe('operating_cash_flow');
    expect(mapper.normalize('영업활동으로 인한 현금흐름')).toBe('operating_cash_flow');
  });

  test('investing_cash_flow variants', () => {
    expect(mapper.normalize('투자활동현금흐름')).toBe('investing_cash_flow');
    expect(mapper.normalize('투자활동으로인한현금흐름')).toBe('investing_cash_flow');
    expect(mapper.normalize('투자활동으로 인한 현금흐름')).toBe('investing_cash_flow');
  });

  test('financing_cash_flow variants', () => {
    expect(mapper.normalize('재무활동현금흐름')).toBe('financing_cash_flow');
    expect(mapper.normalize('재무활동으로인한현금흐름')).toBe('financing_cash_flow');
    expect(mapper.normalize('재무활동으로 인한 현금흐름')).toBe('financing_cash_flow');
  });

  test('capex variants', () => {
    expect(mapper.normalize('자본적지출')).toBe('capex');
    expect(mapper.normalize('유형자산의취득')).toBe('capex');
    expect(mapper.normalize('유형자산취득')).toBe('capex');
  });

  test('free_cash_flow variant', () => {
    expect(mapper.normalize('잉여현금흐름')).toBe('free_cash_flow');
  });

  // --- Per-share & Ratios ---
  test('eps variants', () => {
    expect(mapper.normalize('기본주당이익')).toBe('eps');
    expect(mapper.normalize('기본주당순이익')).toBe('eps');
    expect(mapper.normalize('주당순이익')).toBe('eps');
    expect(mapper.normalize('주당이익')).toBe('eps');
  });

  test('bps variants', () => {
    expect(mapper.normalize('주당순자산')).toBe('bps');
    expect(mapper.normalize('주당순자산가치')).toBe('bps');
  });

  test('dividends_per_share variants', () => {
    expect(mapper.normalize('주당배당금')).toBe('dividends_per_share');
    expect(mapper.normalize('주당현금배당금')).toBe('dividends_per_share');
    expect(mapper.normalize('보통주주당배당금')).toBe('dividends_per_share');
  });

  test('ebitda variant', () => {
    expect(mapper.normalize('EBITDA')).toBe('ebitda');
  });

  test('ratio concepts', () => {
    expect(mapper.normalize('부채비율')).toBe('debt_ratio');
    expect(mapper.normalize('자기자본이익률')).toBe('roe');
    expect(mapper.normalize('자기자본순이익률')).toBe('roe');
    expect(mapper.normalize('총자산이익률')).toBe('roa');
    expect(mapper.normalize('총자산순이익률')).toBe('roa');
    expect(mapper.normalize('영업이익률')).toBe('operating_margin');
    expect(mapper.normalize('순이익률')).toBe('net_margin');
    expect(mapper.normalize('당기순이익률')).toBe('net_margin');
    expect(mapper.normalize('유동비율')).toBe('current_ratio');
  });

  // --- Edge cases ---
  test('unknown names return null', () => {
    expect(mapper.normalize('알수없는계정')).toBeNull();
    expect(mapper.normalize('unknown')).toBeNull();
    expect(mapper.normalize('')).toBeNull();
  });

  test('handles leading/trailing whitespace', () => {
    expect(mapper.normalize('  매출액  ')).toBe('revenue');
    expect(mapper.normalize(' 영업이익 ')).toBe('operating_income');
  });

  test('handles whitespace-stripped matching', () => {
    expect(mapper.normalize('영업활동으로 인한 현금흐름')).toBe('operating_cash_flow');
  });
});

// ---------------------------------------------------------------------------
// 2. AccountMapper.toEnglish() — Korean to English translation
// ---------------------------------------------------------------------------
describe('AccountMapper.toEnglish()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('resolves Korean variants to English names', () => {
    expect(mapper.toEnglish('매출액')).toBe('Revenue');
    expect(mapper.toEnglish('영업이익')).toBe('Operating Income');
    expect(mapper.toEnglish('당기순이익')).toBe('Net Income');
    expect(mapper.toEnglish('자산총계')).toBe('Total Assets');
    expect(mapper.toEnglish('부채총계')).toBe('Total Liabilities');
    expect(mapper.toEnglish('자본총계')).toBe('Total Equity');
    expect(mapper.toEnglish('기본주당이익')).toBe('Earnings Per Share');
  });

  test('resolves new IS concepts', () => {
    expect(mapper.toEnglish('매출원가')).toBe('Cost of Sales');
    expect(mapper.toEnglish('매출총이익')).toBe('Gross Profit');
    expect(mapper.toEnglish('판매비와관리비')).toBe('Operating Expense');
    expect(mapper.toEnglish('지배기업소유주지분순이익')).toBe('Net Income (Parent)');
    expect(mapper.toEnglish('이자비용')).toBe('Interest Expense');
    expect(mapper.toEnglish('이자수익')).toBe('Interest Income');
    expect(mapper.toEnglish('기타수익')).toBe('Other Income');
    expect(mapper.toEnglish('기타비용')).toBe('Other Expense');
    expect(mapper.toEnglish('법인세비용')).toBe('Income Tax Expense');
  });

  test('resolves new BS concepts', () => {
    expect(mapper.toEnglish('유동자산')).toBe('Current Assets');
    expect(mapper.toEnglish('비유동자산')).toBe('Non-Current Assets');
    expect(mapper.toEnglish('현금및현금성자산')).toBe('Cash and Equivalents');
    expect(mapper.toEnglish('매출채권')).toBe('Trade Receivables');
    expect(mapper.toEnglish('재고자산')).toBe('Inventories');
    expect(mapper.toEnglish('유동부채')).toBe('Current Liabilities');
    expect(mapper.toEnglish('비유동부채')).toBe('Non-Current Liabilities');
    expect(mapper.toEnglish('차입금')).toBe('Borrowings');
    expect(mapper.toEnglish('매입채무')).toBe('Trade Payables');
    expect(mapper.toEnglish('지배기업소유주지분')).toBe('Equity (Parent)');
    expect(mapper.toEnglish('자본금')).toBe('Capital Stock');
  });

  test('resolves new CF concepts', () => {
    expect(mapper.toEnglish('잉여현금흐름')).toBe('Free Cash Flow');
  });

  test('unknown names return null', () => {
    expect(mapper.toEnglish('알수없는계정')).toBeNull();
    expect(mapper.toEnglish('')).toBeNull();
  });

  test('handles whitespace in input', () => {
    expect(mapper.toEnglish('  매출액  ')).toBe('Revenue');
  });
});

// ---------------------------------------------------------------------------
// 3. AccountMapper.getMapping() — full mapping by conceptId
// ---------------------------------------------------------------------------
describe('AccountMapper.getMapping()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('returns complete mapping for known concept', () => {
    const mapping = mapper.getMapping('revenue');
    expect(mapping).not.toBeNull();
    expect(mapping!.conceptId).toBe('revenue');
    expect(mapping!.koreanNames).toContain('매출액');
    expect(mapping!.englishName).toBe('Revenue');
    expect(mapping!.labelKo).toBe('매출액');
    expect(mapping!.category).toBe('income');
    expect(mapping!.statementType).toBe('IS');
  });

  test('returns complete mapping for balance sheet concept', () => {
    const mapping = mapper.getMapping('total_assets');
    expect(mapping).not.toBeNull();
    expect(mapping!.conceptId).toBe('total_assets');
    expect(mapping!.category).toBe('balance');
    expect(mapping!.statementType).toBe('BS');
  });

  test('returns complete mapping for cash flow concept', () => {
    const mapping = mapper.getMapping('operating_cash_flow');
    expect(mapping).not.toBeNull();
    expect(mapping!.conceptId).toBe('operating_cash_flow');
    expect(mapping!.category).toBe('cashflow');
    expect(mapping!.statementType).toBe('CF');
  });

  test('returns complete mapping for ratio concept', () => {
    const mapping = mapper.getMapping('roe');
    expect(mapping).not.toBeNull();
    expect(mapping!.conceptId).toBe('roe');
    expect(mapping!.category).toBe('ratio');
    // ratios have no statement type
    expect(mapping!.statementType).toBeUndefined();
  });

  test('returns complete mapping for per-share concept', () => {
    const mapping = mapper.getMapping('eps');
    expect(mapping).not.toBeNull();
    expect(mapping!.conceptId).toBe('eps');
    expect(mapping!.category).toBe('per_share');
    expect(mapping!.statementType).toBeUndefined();
  });

  test('returns null for unknown concept', () => {
    expect(mapper.getMapping('nonexistent' as AccountCategory)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. AccountMapper.isRecognized() — boolean check
// ---------------------------------------------------------------------------
describe('AccountMapper.isRecognized()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('returns true for all known Korean variants', () => {
    expect(mapper.isRecognized('매출액')).toBe(true);
    expect(mapper.isRecognized('영업이익')).toBe(true);
    expect(mapper.isRecognized('당기순이익')).toBe(true);
    expect(mapper.isRecognized('자산총계')).toBe(true);
    expect(mapper.isRecognized('영업활동현금흐름')).toBe(true);
    expect(mapper.isRecognized('매출원가')).toBe(true);
    expect(mapper.isRecognized('유동자산')).toBe(true);
    expect(mapper.isRecognized('잉여현금흐름')).toBe(true);
  });

  test('returns false for unknown names', () => {
    expect(mapper.isRecognized('알수없는계정')).toBe(false);
    expect(mapper.isRecognized('unknown')).toBe(false);
    expect(mapper.isRecognized('')).toBe(false);
  });

  test('handles whitespace', () => {
    expect(mapper.isRecognized('  매출액  ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. AccountMapper.getConceptsByCategory() — filter by category
// ---------------------------------------------------------------------------
describe('AccountMapper.getConceptsByCategory()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('returns income category concepts', () => {
    const income = mapper.getConceptsByCategory('income');
    expect(income.length).toBeGreaterThanOrEqual(10);
    for (const mapping of income) {
      expect(mapping.category).toBe('income');
    }
    const ids = income.map((m) => m.conceptId);
    expect(ids).toContain('revenue');
    expect(ids).toContain('operating_income');
    expect(ids).toContain('net_income');
    expect(ids).toContain('cost_of_sales');
    expect(ids).toContain('gross_profit');
  });

  test('returns balance category concepts', () => {
    const balance = mapper.getConceptsByCategory('balance');
    expect(balance.length).toBeGreaterThanOrEqual(10);
    for (const mapping of balance) {
      expect(mapping.category).toBe('balance');
    }
    const ids = balance.map((m) => m.conceptId);
    expect(ids).toContain('total_assets');
    expect(ids).toContain('total_liabilities');
    expect(ids).toContain('total_equity');
    expect(ids).toContain('current_assets');
    expect(ids).toContain('inventories');
  });

  test('returns cashflow category concepts', () => {
    const cashflow = mapper.getConceptsByCategory('cashflow');
    expect(cashflow.length).toBeGreaterThanOrEqual(4);
    for (const mapping of cashflow) {
      expect(mapping.category).toBe('cashflow');
    }
    const ids = cashflow.map((m) => m.conceptId);
    expect(ids).toContain('operating_cash_flow');
    expect(ids).toContain('investing_cash_flow');
    expect(ids).toContain('financing_cash_flow');
    expect(ids).toContain('capex');
    expect(ids).toContain('free_cash_flow');
  });

  test('returns ratio category concepts', () => {
    const ratios = mapper.getConceptsByCategory('ratio');
    expect(ratios.length).toBeGreaterThanOrEqual(6);
    for (const mapping of ratios) {
      expect(mapping.category).toBe('ratio');
    }
  });

  test('returns per_share category concepts', () => {
    const perShare = mapper.getConceptsByCategory('per_share');
    expect(perShare.length).toBeGreaterThanOrEqual(3);
    for (const mapping of perShare) {
      expect(mapping.category).toBe('per_share');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. AccountMapper.getConceptsByStatementType() — filter by statement type
// ---------------------------------------------------------------------------
describe('AccountMapper.getConceptsByStatementType()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('returns IS (Income Statement) concepts', () => {
    const is = mapper.getConceptsByStatementType('IS');
    expect(is.length).toBeGreaterThanOrEqual(10);
    for (const mapping of is) {
      expect(mapping.statementType).toBe('IS');
    }
  });

  test('returns BS (Balance Sheet) concepts', () => {
    const bs = mapper.getConceptsByStatementType('BS');
    expect(bs.length).toBeGreaterThanOrEqual(10);
    for (const mapping of bs) {
      expect(mapping.statementType).toBe('BS');
    }
  });

  test('returns CF (Cash Flow) concepts', () => {
    const cf = mapper.getConceptsByStatementType('CF');
    expect(cf.length).toBeGreaterThanOrEqual(4);
    for (const mapping of cf) {
      expect(mapping.statementType).toBe('CF');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. AccountMapper.getUnknownAccounts() — unknown tracking
// ---------------------------------------------------------------------------
describe('AccountMapper.getUnknownAccounts()', () => {
  let mapper: AccountMapper;

  beforeEach(() => {
    mapper = AccountMapper.create();
  });

  test('empty initially', () => {
    expect(mapper.getUnknownAccounts()).toEqual([]);
  });

  test('tracks names that failed normalize()', () => {
    mapper.normalize('알수없는계정A');
    mapper.normalize('알수없는계정B');
    const unknowns = mapper.getUnknownAccounts();
    expect(unknowns).toContain('알수없는계정A');
    expect(unknowns).toContain('알수없는계정B');
  });

  test('does not track known names', () => {
    mapper.normalize('매출액');
    mapper.normalize('영업이익');
    expect(mapper.getUnknownAccounts()).toEqual([]);
  });

  test('does not duplicate unknown names', () => {
    mapper.normalize('알수없는계정');
    mapper.normalize('알수없는계정');
    const unknowns = mapper.getUnknownAccounts();
    expect(unknowns.filter((n) => n === '알수없는계정')).toHaveLength(1);
  });

  test('does not track empty strings', () => {
    mapper.normalize('');
    expect(mapper.getUnknownAccounts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. Backward compatibility — normalizeAccountName() and getAccountLabel()
// ---------------------------------------------------------------------------
describe('Backward compatibility', () => {
  test('normalizeAccountName() still works', () => {
    expect(normalizeAccountName('매출액')).toBe('revenue');
    expect(normalizeAccountName('영업이익')).toBe('operating_income');
    expect(normalizeAccountName('당기순이익')).toBe('net_income');
    expect(normalizeAccountName('자산총계')).toBe('total_assets');
    expect(normalizeAccountName('영업활동현금흐름')).toBe('operating_cash_flow');
    expect(normalizeAccountName('알수없는계정')).toBeNull();
    expect(normalizeAccountName('  매출액  ')).toBe('revenue');
    expect(normalizeAccountName('영업활동으로 인한 현금흐름')).toBe('operating_cash_flow');
  });

  test('normalizeAccountName() recognizes new concepts too', () => {
    expect(normalizeAccountName('매출원가')).toBe('cost_of_sales');
    expect(normalizeAccountName('유동자산')).toBe('current_assets');
    expect(normalizeAccountName('잉여현금흐름')).toBe('free_cash_flow');
  });

  test('getAccountLabel() returns Korean label by default', () => {
    expect(getAccountLabel('revenue')).toBe('매출액');
    expect(getAccountLabel('operating_income')).toBe('영업이익');
    expect(getAccountLabel('net_income')).toBe('당기순이익');
    expect(getAccountLabel('total_assets')).toBe('자산총계');
    expect(getAccountLabel('eps')).toBe('기본주당이익');
  });

  test('getAccountLabel() returns English label', () => {
    expect(getAccountLabel('revenue', 'en')).toBe('Revenue');
    expect(getAccountLabel('operating_income', 'en')).toBe('Operating Income');
    expect(getAccountLabel('net_income', 'en')).toBe('Net Income');
    expect(getAccountLabel('total_assets', 'en')).toBe('Total Assets');
    expect(getAccountLabel('eps', 'en')).toBe('Earnings Per Share');
  });

  test('getAccountLabel() works for new categories', () => {
    expect(getAccountLabel('cost_of_sales')).toBe('매출원가');
    expect(getAccountLabel('cost_of_sales', 'en')).toBe('Cost of Sales');
    expect(getAccountLabel('current_assets')).toBe('유동자산');
    expect(getAccountLabel('current_assets', 'en')).toBe('Current Assets');
  });
});

// ---------------------------------------------------------------------------
// 9. Mapping integrity
// ---------------------------------------------------------------------------
describe('Mapping integrity', () => {
  test('has at least 30 mappings', () => {
    expect(ACCOUNT_MAPPINGS.length).toBeGreaterThanOrEqual(30);
  });

  test('each mapping has all required fields', () => {
    for (const mapping of ACCOUNT_MAPPINGS) {
      expect(mapping.conceptId.length).toBeGreaterThan(0);
      expect(mapping.koreanNames.length).toBeGreaterThanOrEqual(1);
      expect(mapping.englishName.length).toBeGreaterThan(0);
      expect(mapping.labelKo.length).toBeGreaterThan(0);
      expect(['income', 'balance', 'cashflow', 'ratio', 'per_share']).toContain(
        mapping.category
      );
    }
  });

  test('no duplicate conceptIds', () => {
    const ids = ACCOUNT_MAPPINGS.map((m) => m.conceptId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('no duplicate Korean name variants across mappings', () => {
    const allVariants: string[] = [];
    for (const mapping of ACCOUNT_MAPPINGS) {
      for (const name of mapping.koreanNames) {
        allVariants.push(name);
      }
    }
    const unique = new Set(allVariants);
    expect(unique.size).toBe(allVariants.length);
  });

  test('all IS/BS/CF concepts have statementType set', () => {
    for (const mapping of ACCOUNT_MAPPINGS) {
      if (['income', 'balance', 'cashflow'].includes(mapping.category)) {
        expect(mapping.statementType).toBeDefined();
      }
    }
  });

  test('ratio and per_share concepts have no statementType', () => {
    for (const mapping of ACCOUNT_MAPPINGS) {
      if (['ratio', 'per_share'].includes(mapping.category)) {
        expect(mapping.statementType).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Singleton export
// ---------------------------------------------------------------------------
describe('accountMapper singleton', () => {
  test('is an instance of AccountMapper', () => {
    expect(accountMapper).toBeInstanceOf(AccountMapper);
  });

  test('normalize works on singleton', () => {
    expect(accountMapper.normalize('매출액')).toBe('revenue');
  });
});
