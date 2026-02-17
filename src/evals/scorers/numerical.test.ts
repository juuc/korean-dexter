import { describe, test, expect } from 'bun:test';
import { parseKoreanAmount, NumericalScorer } from './numerical';

describe('parseKoreanAmount', () => {
  describe('basic units', () => {
    test('parses 조원 (trillion won)', () => {
      const result = parseKoreanAmount('67.4조원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(67.4 * 1_000_000_000_000);
      expect(result!.unit).toBe('조원');
      expect(result!.displayValue).toBe('67.4조원');
    });

    test('parses 억원 (hundred million won)', () => {
      const result = parseKoreanAmount('7,730억원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(7730 * 100_000_000);
      expect(result!.unit).toBe('억원');
    });

    test('parses 만원 (ten thousand won)', () => {
      const result = parseKoreanAmount('5,000만원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(5000 * 10_000);
      expect(result!.unit).toBe('만원');
    });

    test('parses 원 (won)', () => {
      const result = parseKoreanAmount('1,234원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1234);
      expect(result!.unit).toBe('원');
    });
  });

  describe('negative values', () => {
    test('parses negative 조원', () => {
      const result = parseKoreanAmount('-3.2조원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(-3.2 * 1_000_000_000_000);
      expect(result!.unit).toBe('조원');
    });

    test('parses negative percentage', () => {
      const result = parseKoreanAmount('-2.3%');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(-2.3);
      expect(result!.unit).toBe('%');
    });
  });

  describe('commas in numbers', () => {
    test('parses number with comma and decimal', () => {
      const result = parseKoreanAmount('1,234.5조원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1234.5 * 1_000_000_000_000);
    });

    test('parses large number with multiple commas', () => {
      const result = parseKoreanAmount('302,230억원');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(302230 * 100_000_000);
    });
  });

  describe('units without 원', () => {
    test('parses 조 without 원', () => {
      const result = parseKoreanAmount('67.4조');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(67.4 * 1_000_000_000_000);
      expect(result!.unit).toBe('조');
    });

    test('parses 억 without 원', () => {
      const result = parseKoreanAmount('7,730억');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(7730 * 100_000_000);
      expect(result!.unit).toBe('억');
    });

    test('parses 만 without 원', () => {
      const result = parseKoreanAmount('5,000만');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(5000 * 10_000);
      expect(result!.unit).toBe('만');
    });
  });

  describe('percentages', () => {
    test('parses positive percentage', () => {
      const result = parseKoreanAmount('12.5%');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(12.5);
      expect(result!.unit).toBe('%');
    });

    test('parses percentage with comma', () => {
      const result = parseKoreanAmount('1,234.5%');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1234.5);
      expect(result!.unit).toBe('%');
    });
  });

  describe('bare numbers', () => {
    test('parses decimal number without unit', () => {
      const result = parseKoreanAmount('67.4');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(67.4);
      expect(result!.unit).toBe('raw');
    });

    test('parses integer without unit', () => {
      const result = parseKoreanAmount('1234');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1234);
      expect(result!.unit).toBe('raw');
    });

    test('parses number with comma but no unit', () => {
      const result = parseKoreanAmount('1,234.5');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1234.5);
      expect(result!.unit).toBe('raw');
    });
  });

  describe('invalid inputs', () => {
    test('returns null for empty string', () => {
      expect(parseKoreanAmount('')).toBeNull();
    });

    test('returns null for N/A', () => {
      expect(parseKoreanAmount('N/A')).toBeNull();
    });

    test('returns null for 없음', () => {
      expect(parseKoreanAmount('없음')).toBeNull();
    });

    test('returns null for dash', () => {
      expect(parseKoreanAmount('-')).toBeNull();
    });

    test('returns null for text without numbers', () => {
      expect(parseKoreanAmount('no numbers here')).toBeNull();
    });
  });

  describe('extraction from natural language', () => {
    test('extracts amount from Korean sentence', () => {
      const result = parseKoreanAmount('삼성전자의 2024년 매출액은 302.23조원입니다.');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(302.23 * 1_000_000_000_000);
      expect(result!.unit).toBe('조원');
    });

    test('extracts amount with 약 prefix', () => {
      const result = parseKoreanAmount('약 67조원 정도입니다');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(67 * 1_000_000_000_000);
      expect(result!.unit).toBe('조원');
    });

    test('extracts first number from sentence with multiple amounts', () => {
      const result = parseKoreanAmount('매출액은 302.23조원이고 영업이익은 6.57조원입니다');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(302.23 * 1_000_000_000_000);
      expect(result!.unit).toBe('조원');
      expect(result!.displayValue).toBe('302.23조원');
    });

    test('extracts percentage from sentence', () => {
      const result = parseKoreanAmount('영업이익률은 12.5%입니다');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(12.5);
      expect(result!.unit).toBe('%');
    });
  });
});

describe('NumericalScorer', () => {
  const scorer = new NumericalScorer();

  describe('exact matches', () => {
    test('scores exact match as 1.0', () => {
      const result = scorer.score('302.23조원', '302.23조원');
      expect(result.score).toBe(1.0);
      expect(result.method).toBe('numerical');
      expect(result.comment).toContain('Exact match');
    });

    test('scores exact percentage match as 1.0', () => {
      const result = scorer.score('12.5%', '12.5%');
      expect(result.score).toBe(1.0);
      expect(result.method).toBe('numerical');
    });
  });

  describe('within tolerance', () => {
    test('scores value within 1% tolerance as 1.0', () => {
      const result = scorer.score('302.23조원', '303조원', 0.01);
      expect(result.score).toBe(1.0);
      expect(result.method).toBe('numerical');
    });

    test('scores value at exactly 1% tolerance as 1.0', () => {
      // 302.23 * 1.01 = 305.2523
      const result = scorer.score('302.23조원', '305.25조원', 0.01);
      expect(result.score).toBe(1.0);
    });
  });

  describe('unit equivalence', () => {
    test('scores same value in different units as 1.0', () => {
      // 67.4조원 = 674,000억원
      const result = scorer.score('67.4조원', '674000억원');
      expect(result.score).toBe(1.0);
    });

    test('scores 302.23조원 = 3,022,300억원 as 1.0', () => {
      // 302.23조 = 302.23 × 10,000억 = 3,022,300억
      const result = scorer.score('302.23조원', '3022300억원');
      expect(result.score).toBe(1.0);
    });

    test('scores 1조원 = 10,000억원 as 1.0', () => {
      const result = scorer.score('1조원', '10000억원');
      expect(result.score).toBe(1.0);
    });
  });

  describe('moderate errors (1-5%)', () => {
    test('scores 2.3% error as 0.5', () => {
      // 302조원 vs 295조원 = 2.3% error
      const result = scorer.score('302조원', '295조원', 0.01);
      expect(result.score).toBe(0.5);
      expect(result.comment).toContain('2.32% error');
    });

    test('scores 4.9% error as 0.5', () => {
      // 100조원 vs 95.1조원 = 4.9% error
      const result = scorer.score('100조원', '95.1조원', 0.01);
      expect(result.score).toBe(0.5);
    });
  });

  describe('significant errors (>5%)', () => {
    test('scores 17.2% error as 0.25', () => {
      // 302조원 vs 250조원 = 17.2% error
      const result = scorer.score('302조원', '250조원', 0.01);
      expect(result.score).toBe(0.25);
      expect(result.comment).toContain('17.22% error');
    });

    test('scores 50% error as 0.25', () => {
      const result = scorer.score('100조원', '50조원', 0.01);
      expect(result.score).toBe(0.25);
    });
  });

  describe('natural language extraction', () => {
    test('extracts and scores from Korean sentence', () => {
      const result = scorer.score(
        '302.23조원',
        '삼성전자의 2024년 매출액은 302.23조원입니다.'
      );
      expect(result.score).toBe(1.0);
    });

    test('extracts and scores approximate value', () => {
      const result = scorer.score('67조원', '약 67조원 정도입니다');
      expect(result.score).toBe(1.0);
    });

    test('extracts first value from multiple amounts', () => {
      const result = scorer.score(
        '302.23조원',
        '매출액은 302.23조원이고 영업이익은 6.57조원입니다'
      );
      expect(result.score).toBe(1.0);
    });
  });

  describe('parsing failures', () => {
    test('scores 0 when expected value is invalid', () => {
      const result = scorer.score('invalid', '302조원');
      expect(result.score).toBe(0);
      expect(result.comment).toContain('Failed to parse expected');
    });

    test('scores 0 and marks hallucination when actual value is invalid', () => {
      const result = scorer.score('302조원', '없음');
      expect(result.score).toBe(0);
      expect(result.comment).toContain('Failed to parse actual');
      expect(result.hallucination).toBe(true);
    });

    test('scores 0 when actual is N/A', () => {
      const result = scorer.score('302조원', 'N/A');
      expect(result.score).toBe(0);
      expect(result.hallucination).toBe(true);
    });
  });

  describe('percentage scoring', () => {
    test('scores exact percentage match as 1.0', () => {
      const result = scorer.score('12.5%', '12.5%');
      expect(result.score).toBe(1.0);
    });

    test('scores percentage within tolerance as 1.0', () => {
      const result = scorer.score('12.5%', '12.6%', 0.01);
      expect(result.score).toBe(1.0);
    });

    test('scores percentage unit mismatch as 0', () => {
      const result = scorer.score('12.5%', '12.5조원');
      expect(result.score).toBe(0);
      expect(result.comment).toContain('Unit mismatch');
    });

    test('scores percentage moderate error as 0.5', () => {
      const result = scorer.score('10%', '10.3%', 0.01);
      expect(result.score).toBe(0.5);
    });
  });

  describe('custom tolerance', () => {
    test('accepts value within 5% tolerance', () => {
      const result = scorer.score('100조원', '104조원', 0.05);
      expect(result.score).toBe(1.0);
    });

    test('rejects value outside 5% tolerance', () => {
      const result = scorer.score('100조원', '106조원', 0.05);
      expect(result.score).toBe(0.5);
    });

    test('uses 0.1% tolerance for high precision', () => {
      const result = scorer.score('100조원', '100.05조원', 0.001);
      expect(result.score).toBe(1.0);
    });
  });

  describe('edge cases', () => {
    test('scores zero vs zero as 1.0', () => {
      const result = scorer.score('0원', '0원');
      expect(result.score).toBe(1.0);
    });

    test('handles negative values correctly', () => {
      const result = scorer.score('-3.2조원', '-3.2조원');
      expect(result.score).toBe(1.0);
    });

    test('scores negative vs positive as 0.25', () => {
      const result = scorer.score('3.2조원', '-3.2조원');
      expect(result.score).toBe(0.25);
    });
  });
});
