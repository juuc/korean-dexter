import { describe, test, expect } from 'bun:test';
import {
  normalizeAccountName,
  getAccountLabel,
  ACCOUNT_MAPPINGS,
  type AccountCategory,
} from './account-mapper.js';

describe('normalizeAccountName', () => {
  test('revenue variants resolve correctly', () => {
    expect(normalizeAccountName('매출액')).toBe('revenue');
    expect(normalizeAccountName('영업수익')).toBe('revenue');
    expect(normalizeAccountName('수익(매출액)')).toBe('revenue');
    expect(normalizeAccountName('매출')).toBe('revenue');
    expect(normalizeAccountName('순매출액')).toBe('revenue');
  });

  test('operating income variants resolve correctly', () => {
    expect(normalizeAccountName('영업이익')).toBe('operating_income');
    expect(normalizeAccountName('영업이익(손실)')).toBe('operating_income');
  });

  test('net income variants resolve correctly', () => {
    expect(normalizeAccountName('당기순이익')).toBe('net_income');
    expect(normalizeAccountName('당기순이익(손실)')).toBe('net_income');
    expect(normalizeAccountName('분기순이익')).toBe('net_income');
  });

  test('balance sheet items resolve correctly', () => {
    expect(normalizeAccountName('자산총계')).toBe('total_assets');
    expect(normalizeAccountName('부채총계')).toBe('total_liabilities');
    expect(normalizeAccountName('자본총계')).toBe('total_equity');
  });

  test('cash flow items resolve correctly', () => {
    expect(normalizeAccountName('영업활동현금흐름')).toBe('operating_cash_flow');
    expect(normalizeAccountName('영업활동으로인한현금흐름')).toBe('operating_cash_flow');
    expect(normalizeAccountName('투자활동현금흐름')).toBe('investing_cash_flow');
    expect(normalizeAccountName('재무활동현금흐름')).toBe('financing_cash_flow');
  });

  test('EPS variants resolve correctly', () => {
    expect(normalizeAccountName('기본주당이익')).toBe('eps');
    expect(normalizeAccountName('기본주당순이익')).toBe('eps');
    expect(normalizeAccountName('주당순이익')).toBe('eps');
    expect(normalizeAccountName('주당이익')).toBe('eps');
  });

  test('other per-share items resolve correctly', () => {
    expect(normalizeAccountName('주당순자산')).toBe('bps');
    expect(normalizeAccountName('주당배당금')).toBe('dividends_per_share');
  });

  test('ratio items resolve correctly', () => {
    expect(normalizeAccountName('부채비율')).toBe('debt_ratio');
    expect(normalizeAccountName('자기자본이익률')).toBe('roe');
    expect(normalizeAccountName('총자산이익률')).toBe('roa');
    expect(normalizeAccountName('영업이익률')).toBe('operating_margin');
    expect(normalizeAccountName('순이익률')).toBe('net_margin');
    expect(normalizeAccountName('유동비율')).toBe('current_ratio');
  });

  test('other items resolve correctly', () => {
    expect(normalizeAccountName('이익잉여금')).toBe('retained_earnings');
    expect(normalizeAccountName('이익잉여금(결손금)')).toBe('retained_earnings');
    expect(normalizeAccountName('유형자산의취득')).toBe('capex');
    expect(normalizeAccountName('EBITDA')).toBe('ebitda');
  });

  test('unknown names return null', () => {
    expect(normalizeAccountName('알수없는계정')).toBe(null);
    expect(normalizeAccountName('unknown')).toBe(null);
    expect(normalizeAccountName('')).toBe(null);
  });

  test('handles trimmed whitespace', () => {
    expect(normalizeAccountName('  매출액  ')).toBe('revenue');
    expect(normalizeAccountName(' 영업이익 ')).toBe('operating_income');
  });

  test('handles whitespace-stripped matching', () => {
    // Variant with spaces should match stripped version
    expect(normalizeAccountName('영업활동으로 인한 현금흐름')).toBe('operating_cash_flow');
  });
});

describe('getAccountLabel', () => {
  test('returns Korean label by default', () => {
    expect(getAccountLabel('revenue')).toBe('매출액');
    expect(getAccountLabel('operating_income')).toBe('영업이익');
    expect(getAccountLabel('net_income')).toBe('당기순이익');
    expect(getAccountLabel('total_assets')).toBe('자산총계');
    expect(getAccountLabel('eps')).toBe('기본주당이익');
  });

  test('returns English label when lang is en', () => {
    expect(getAccountLabel('revenue', 'en')).toBe('Revenue');
    expect(getAccountLabel('operating_income', 'en')).toBe('Operating Income');
    expect(getAccountLabel('net_income', 'en')).toBe('Net Income');
    expect(getAccountLabel('total_assets', 'en')).toBe('Total Assets');
    expect(getAccountLabel('eps', 'en')).toBe('Earnings Per Share');
  });

  test('returns Korean label explicitly', () => {
    expect(getAccountLabel('revenue', 'ko')).toBe('매출액');
    expect(getAccountLabel('roe', 'ko')).toBe('자기자본이익률');
  });

  test('all categories have labels', () => {
    const allCategories: AccountCategory[] = [
      'revenue', 'operating_income', 'net_income', 'total_assets',
      'total_liabilities', 'total_equity', 'operating_cash_flow',
      'investing_cash_flow', 'financing_cash_flow', 'eps', 'bps',
      'dividends_per_share', 'debt_ratio', 'roe', 'roa',
      'operating_margin', 'net_margin', 'current_ratio',
      'retained_earnings', 'capex', 'ebitda',
    ];

    for (const category of allCategories) {
      const koLabel = getAccountLabel(category, 'ko');
      const enLabel = getAccountLabel(category, 'en');
      expect(koLabel.length).toBeGreaterThan(0);
      expect(enLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('ACCOUNT_MAPPINGS', () => {
  test('has at least 20 mappings', () => {
    expect(ACCOUNT_MAPPINGS.length).toBeGreaterThanOrEqual(20);
  });

  test('each mapping has required fields', () => {
    for (const mapping of ACCOUNT_MAPPINGS) {
      expect(mapping.category.length).toBeGreaterThan(0);
      expect(mapping.variants.length).toBeGreaterThanOrEqual(1);
      expect(mapping.labelKo.length).toBeGreaterThan(0);
      expect(mapping.labelEn.length).toBeGreaterThan(0);
    }
  });

  test('no duplicate categories', () => {
    const categories = ACCOUNT_MAPPINGS.map((m) => m.category);
    const unique = new Set(categories);
    expect(unique.size).toBe(categories.length);
  });

  test('no duplicate variants across mappings', () => {
    const allVariants: string[] = [];
    for (const mapping of ACCOUNT_MAPPINGS) {
      for (const variant of mapping.variants) {
        allVariants.push(variant);
      }
    }
    const unique = new Set(allVariants);
    expect(unique.size).toBe(allVariants.length);
  });
});
