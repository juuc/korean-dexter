import { describe, test, expect } from 'bun:test';
import { formatAmount, parseRawAmount } from './formatter.js';
import {
  dartReprtCodeToPeriod,
  kisDateToPeriod,
  bokPeriodStringToPeriod,
} from './types.js';

describe('KoreanFinancialFormatter', () => {
  describe('formatAmount', () => {
    test('formats 조원 (trillion) scale correctly', () => {
      expect(formatAmount(300_000_000_000_000)).toBe('300.0조원');
      expect(formatAmount(85_630_541_000_000)).toBe('85.6조원');
      expect(formatAmount(7_730_000_000_000)).toBe('7.7조원');
    });

    test('formats 억원 (hundred million) scale correctly', () => {
      expect(formatAmount(856_000_000_000)).toBe('8,560.0억원');
      expect(formatAmount(123_456_789_000)).toBe('1,234.6억원');
    });

    test('formats 만원 (ten thousand) scale correctly', () => {
      expect(formatAmount(50_000_000)).toBe('5,000만원');
    });

    test('formats 원 scale for small amounts', () => {
      expect(formatAmount(3_500)).toBe('3,500원');
    });

    test('handles zero', () => {
      expect(formatAmount(0)).toBe('0원');
    });

    test('handles negative values', () => {
      expect(formatAmount(-7_700_000_000_000)).toBe('-7.7조원');
      expect(formatAmount(-856_000_000_000)).toBe('-8,560.0억원');
    });

    test('handles null', () => {
      expect(formatAmount(null)).toBe('N/A');
    });

    test('respects preferredScale option', () => {
      expect(formatAmount(50_000_000, { preferredScale: 'eok' })).toBe(
        '0.5억원'
      );
      expect(formatAmount(1_000_000_000_000, { preferredScale: 'eok' })).toBe(
        '10,000.0억원'
      );
    });

    test('respects precision option', () => {
      expect(formatAmount(85_630_541_000_000, { precision: 2 })).toBe(
        '85.63조원'
      );
      expect(formatAmount(85_630_541_000_000, { precision: 0 })).toBe(
        '86조원'
      );
    });

    test('respects showSign option', () => {
      expect(formatAmount(1_000_000_000_000, { showSign: true })).toBe(
        '+1.0조원'
      );
      expect(formatAmount(-1_000_000_000_000, { showSign: true })).toBe(
        '-1.0조원'
      );
    });

    test('respects showUnit option', () => {
      expect(formatAmount(1_000_000_000_000, { showUnit: false })).toBe('1.0');
    });
  });

  describe('parseRawAmount', () => {
    test('parses numeric input', () => {
      expect(parseRawAmount(123456789)).toBe(123456789);
      expect(parseRawAmount(0)).toBe(0);
      expect(parseRawAmount(-500)).toBe(-500);
    });

    test('parses string with commas', () => {
      expect(parseRawAmount('1,234,567')).toBe(1234567);
      expect(parseRawAmount('85,630,541,000,000')).toBe(85630541000000);
    });

    test('parses string without commas', () => {
      expect(parseRawAmount('123456789')).toBe(123456789);
    });

    test('handles empty string as null', () => {
      expect(parseRawAmount('')).toBe(null);
      expect(parseRawAmount('   ')).toBe(null);
    });

    test('handles dash as null', () => {
      expect(parseRawAmount('-')).toBe(null);
    });

    test('handles null and undefined', () => {
      expect(parseRawAmount(null)).toBe(null);
      expect(parseRawAmount(undefined)).toBe(null);
    });

    test('handles NaN', () => {
      expect(parseRawAmount(NaN)).toBe(null);
      expect(parseRawAmount('not a number')).toBe(null);
    });
  });
});

describe('PeriodRange converters', () => {
  describe('dartReprtCodeToPeriod', () => {
    test('converts annual report (11011)', () => {
      const period = dartReprtCodeToPeriod('2024', '11011');
      expect(period.type).toBe('annual');
      expect(period.year).toBe(2024);
      expect(period.startDate).toBe('2024-01-01');
      expect(period.endDate).toBe('2024-12-31');
      expect(period.dartReprtCode).toBe('11011');
      expect(period.label).toBe('2024년');
      expect(period.labelEn).toBe('2024');
    });

    test('converts semi-annual report (11012)', () => {
      const period = dartReprtCodeToPeriod('2024', '11012');
      expect(period.type).toBe('semi_annual');
      expect(period.year).toBe(2024);
      expect(period.startDate).toBe('2024-01-01');
      expect(period.endDate).toBe('2024-06-30');
      expect(period.dartReprtCode).toBe('11012');
      expect(period.label).toBe('2024년 상반기');
      expect(period.labelEn).toBe('H1 2024');
    });

    test('converts Q1 report (11013)', () => {
      const period = dartReprtCodeToPeriod('2024', '11013');
      expect(period.type).toBe('quarterly');
      expect(period.year).toBe(2024);
      expect(period.quarter).toBe(1);
      expect(period.startDate).toBe('2024-01-01');
      expect(period.endDate).toBe('2024-03-31');
      expect(period.dartReprtCode).toBe('11013');
      expect(period.label).toBe('2024년 1분기');
      expect(period.labelEn).toBe('Q1 2024');
    });

    test('converts Q3 report (11014)', () => {
      const period = dartReprtCodeToPeriod('2024', '11014');
      expect(period.type).toBe('quarterly');
      expect(period.year).toBe(2024);
      expect(period.quarter).toBe(3);
      expect(period.startDate).toBe('2024-07-01');
      expect(period.endDate).toBe('2024-09-30');
      expect(period.dartReprtCode).toBe('11014');
      expect(period.label).toBe('2024년 3분기');
      expect(period.labelEn).toBe('Q3 2024');
    });

    test('throws on unknown report code', () => {
      expect(() => dartReprtCodeToPeriod('2024', '99999')).toThrow(
        'Unknown OpenDART reprt_code: 99999'
      );
    });
  });

  describe('kisDateToPeriod', () => {
    test('converts KIS date to daily period', () => {
      const period = kisDateToPeriod('20240315');
      expect(period.type).toBe('daily');
      expect(period.year).toBe(2024);
      expect(period.month).toBe(3);
      expect(period.startDate).toBe('2024-03-15');
      expect(period.endDate).toBe('2024-03-15');
      expect(period.label).toBe('2024년 3월 15일');
      expect(period.labelEn).toBe('2024-03-15');
    });

    test('respects custom period type', () => {
      const period = kisDateToPeriod('20240315', 'monthly');
      expect(period.type).toBe('monthly');
      expect(period.year).toBe(2024);
      expect(period.month).toBe(3);
    });
  });

  describe('bokPeriodStringToPeriod', () => {
    test('converts annual period (2024)', () => {
      const period = bokPeriodStringToPeriod('2024');
      expect(period.type).toBe('annual');
      expect(period.year).toBe(2024);
      expect(period.startDate).toBe('2024-01-01');
      expect(period.endDate).toBe('2024-12-31');
      expect(period.label).toBe('2024년');
      expect(period.labelEn).toBe('2024');
    });

    test('converts quarterly period (2024Q3)', () => {
      const period = bokPeriodStringToPeriod('2024Q3');
      expect(period.type).toBe('quarterly');
      expect(period.year).toBe(2024);
      expect(period.quarter).toBe(3);
      expect(period.startDate).toBe('2024-07-01');
      expect(period.endDate).toBe('2024-09-30');
      expect(period.label).toBe('2024년 3분기');
      expect(period.labelEn).toBe('Q3 2024');
    });

    test('converts Q1 period', () => {
      const period = bokPeriodStringToPeriod('2024Q1');
      expect(period.type).toBe('quarterly');
      expect(period.quarter).toBe(1);
      expect(period.startDate).toBe('2024-01-01');
      expect(period.endDate).toBe('2024-03-31');
    });

    test('converts Q2 period', () => {
      const period = bokPeriodStringToPeriod('2024Q2');
      expect(period.quarter).toBe(2);
      expect(period.startDate).toBe('2024-04-01');
      expect(period.endDate).toBe('2024-06-30');
    });

    test('converts Q4 period', () => {
      const period = bokPeriodStringToPeriod('2024Q4');
      expect(period.quarter).toBe(4);
      expect(period.startDate).toBe('2024-10-01');
      expect(period.endDate).toBe('2024-12-31');
    });

    test('converts monthly period (202406)', () => {
      const period = bokPeriodStringToPeriod('202406');
      expect(period.type).toBe('monthly');
      expect(period.year).toBe(2024);
      expect(period.month).toBe(6);
      expect(period.startDate).toBe('2024-06-01');
      expect(period.endDate).toBe('2024-06-30');
      expect(period.label).toBe('2024년 6월');
      expect(period.labelEn).toBe('2024-06');
    });

    test('handles February in leap year', () => {
      const period = bokPeriodStringToPeriod('202402');
      expect(period.endDate).toBe('2024-02-29'); // 2024 is a leap year
    });

    test('handles February in non-leap year', () => {
      const period = bokPeriodStringToPeriod('202302');
      expect(period.endDate).toBe('2023-02-28');
    });

    test('throws on unknown format', () => {
      expect(() => bokPeriodStringToPeriod('invalid')).toThrow(
        'Unknown BOK period format: invalid'
      );
    });
  });
});
