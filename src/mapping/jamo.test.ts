import { describe, test, expect } from 'bun:test';
import {
  decomposeHangul,
  decomposeString,
  jamoLevenshtein,
  jamoSimilarity,
} from './jamo.js';

describe('decomposeHangul', () => {
  test('decomposes syllable with jongseong (final consonant)', () => {
    // 삼 = ㅅ + ㅏ + ㅁ
    expect(decomposeHangul('삼')).toEqual(['ㅅ', 'ㅏ', 'ㅁ']);
    // 한 = ㅎ + ㅏ + ㄴ
    expect(decomposeHangul('한')).toEqual(['ㅎ', 'ㅏ', 'ㄴ']);
    // 글 = ㄱ + ㅡ + ㄹ
    expect(decomposeHangul('글')).toEqual(['ㄱ', 'ㅡ', 'ㄹ']);
  });

  test('decomposes syllable without jongseong', () => {
    // 아 = ㅇ + ㅏ
    expect(decomposeHangul('아')).toEqual(['ㅇ', 'ㅏ']);
    // 나 = ㄴ + ㅏ
    expect(decomposeHangul('나')).toEqual(['ㄴ', 'ㅏ']);
    // 가 = ㄱ + ㅏ
    expect(decomposeHangul('가')).toEqual(['ㄱ', 'ㅏ']);
  });

  test('returns non-Hangul characters as-is', () => {
    expect(decomposeHangul('A')).toEqual(['A']);
    expect(decomposeHangul('1')).toEqual(['1']);
    expect(decomposeHangul(' ')).toEqual([' ']);
    expect(decomposeHangul('!')).toEqual(['!']);
  });

  test('handles double consonants', () => {
    // 쌀 = ㅆ + ㅏ + ㄹ
    expect(decomposeHangul('쌀')).toEqual(['ㅆ', 'ㅏ', 'ㄹ']);
    // 빠 = ㅃ + ㅏ
    expect(decomposeHangul('빠')).toEqual(['ㅃ', 'ㅏ']);
  });

  test('handles complex vowels', () => {
    // 와 = ㅇ + ㅘ
    expect(decomposeHangul('와')).toEqual(['ㅇ', 'ㅘ']);
    // 의 = ㅇ + ㅢ
    expect(decomposeHangul('의')).toEqual(['ㅇ', 'ㅢ']);
  });

  test('handles complex final consonants', () => {
    // 읽 = ㅇ + ㅣ + ㄺ
    expect(decomposeHangul('읽')).toEqual(['ㅇ', 'ㅣ', 'ㄺ']);
    // 삶 = ㅅ + ㅏ + ㄻ
    expect(decomposeHangul('삶')).toEqual(['ㅅ', 'ㅏ', 'ㄻ']);
  });
});

describe('decomposeString', () => {
  test('decomposes Korean word', () => {
    // 삼성 = ㅅㅏㅁ + ㅅㅓㅇ
    expect(decomposeString('삼성')).toEqual([
      'ㅅ', 'ㅏ', 'ㅁ', 'ㅅ', 'ㅓ', 'ㅇ',
    ]);
  });

  test('decomposes mixed Korean and ASCII', () => {
    // SK하이닉스
    expect(decomposeString('SK')).toEqual(['S', 'K']);
    const result = decomposeString('SK하');
    expect(result[0]).toBe('S');
    expect(result[1]).toBe('K');
    expect(result[2]).toBe('ㅎ');
    expect(result[3]).toBe('ㅏ');
  });

  test('handles empty string', () => {
    expect(decomposeString('')).toEqual([]);
  });

  test('decomposes full company name', () => {
    const result = decomposeString('삼성전자');
    // 삼(ㅅㅏㅁ) + 성(ㅅㅓㅇ) + 전(ㅈㅓㄴ) + 자(ㅈㅏ) = 11 jamo
    expect(result.length).toBe(11);
    expect(result[0]).toBe('ㅅ'); // 삼 cho
    expect(result[10]).toBe('ㅏ'); // 자 jung
  });
});

describe('jamoLevenshtein', () => {
  test('identical strings have distance 0', () => {
    expect(jamoLevenshtein('삼성전자', '삼성전자')).toBe(0);
    expect(jamoLevenshtein('', '')).toBe(0);
  });

  test('empty vs non-empty returns jamo length', () => {
    // 삼 = 3 jamo
    expect(jamoLevenshtein('삼', '')).toBe(3);
    expect(jamoLevenshtein('', '삼')).toBe(3);
  });

  test('single jamo difference gives distance 1', () => {
    // 삼성전자 vs 삼성젼자: 전(ㅈㅓㄴ) vs 젼(ㅈㅕㄴ) differ by one vowel
    expect(jamoLevenshtein('삼성전자', '삼성젼자')).toBe(1);
  });

  test('typo in company name gives small distance', () => {
    // 삼성전자 vs 삼선전자: 성(ㅅㅓㅇ) vs 선(ㅅㅓㄴ) differ by one jongseong
    expect(jamoLevenshtein('삼성전자', '삼선전자')).toBe(1);
  });

  test('completely different strings give large distance', () => {
    const dist = jamoLevenshtein('삼성전자', '네이버');
    expect(dist).toBeGreaterThan(5);
  });

  test('handles ASCII strings', () => {
    expect(jamoLevenshtein('abc', 'abc')).toBe(0);
    expect(jamoLevenshtein('abc', 'abd')).toBe(1);
    expect(jamoLevenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('jamoSimilarity', () => {
  test('identical strings return 1.0', () => {
    expect(jamoSimilarity('삼성전자', '삼성전자')).toBe(1.0);
  });

  test('both empty returns 1.0', () => {
    expect(jamoSimilarity('', '')).toBe(1.0);
  });

  test('one empty returns 0.0', () => {
    expect(jamoSimilarity('삼성전자', '')).toBe(0.0);
    expect(jamoSimilarity('', '삼성전자')).toBe(0.0);
  });

  test('similar names return high similarity', () => {
    // Single jamo difference
    const sim = jamoSimilarity('삼성전자', '삼성젼자');
    expect(sim).toBeGreaterThan(0.9);
    expect(sim).toBeLessThan(1.0);
  });

  test('different names return low similarity', () => {
    const sim = jamoSimilarity('삼성전자', '네이버');
    expect(sim).toBeLessThan(0.5);
  });

  test('partial match returns moderate similarity', () => {
    // 삼성 prefix shared
    const sim = jamoSimilarity('삼성전자', '삼성SDI');
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.8);
  });

  test('returns value between 0 and 1', () => {
    const pairs: [string, string][] = [
      ['삼성전자', '삼성SDI'],
      ['현대자동차', '현대모비스'],
      ['카카오', '카카오뱅크'],
      ['LG에너지솔루션', 'LG화학'],
    ];

    for (const [a, b] of pairs) {
      const sim = jamoSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(0.0);
      expect(sim).toBeLessThanOrEqual(1.0);
    }
  });
});
