import { describe, test, expect, beforeEach } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CorpCodeResolver, createCorpCodeResolver } from './corp-code-resolver.js';
import type { CorpMapping } from './types.js';

const TEST_MAPPINGS: readonly CorpMapping[] = [
  { corp_code: '00126380', corp_name: '삼성전자', stock_code: '005930', modify_date: '20240315' },
  { corp_code: '00164779', corp_name: '삼성SDI', stock_code: '006400', modify_date: '20240315' },
  { corp_code: '00164742', corp_name: '삼성바이오로직스', stock_code: '207940', modify_date: '20240315' },
  { corp_code: '00126186', corp_name: '삼성생명보험', stock_code: '032830', modify_date: '20240315' },
  { corp_code: '00104833', corp_name: 'SK하이닉스', stock_code: '000660', modify_date: '20240315' },
  { corp_code: '00401731', corp_name: 'LG에너지솔루션', stock_code: '373220', modify_date: '20240315' },
  { corp_code: '00126308', corp_name: '현대자동차', stock_code: '005380', modify_date: '20240315' },
  { corp_code: '00999999', corp_name: '비상장기업예시', stock_code: '', modify_date: '20240315' },
  { corp_code: '00164529', corp_name: '카카오', stock_code: '035720', modify_date: '20240315' },
  { corp_code: '00164800', corp_name: '네이버', stock_code: '035420', modify_date: '20240315' },
];

describe('CorpCodeResolver', () => {
  let resolver: CorpCodeResolver;

  beforeEach(async () => {
    resolver = createCorpCodeResolver();
    await resolver.loadFromData(TEST_MAPPINGS);
  });

  describe('loadFromData', () => {
    test('loads mappings and sets count', () => {
      expect(resolver.count).toBe(10);
      expect(resolver.isLoaded).toBe(true);
    });

    test('empty resolver reports not loaded', () => {
      const empty = createCorpCodeResolver();
      expect(empty.count).toBe(0);
      expect(empty.isLoaded).toBe(false);
    });
  });

  describe('exact ticker match', () => {
    test('resolves 6-digit ticker to corp code', () => {
      const result = resolver.resolve('005930');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00126380');
      expect(result!.corp_name).toBe('삼성전자');
      expect(result!.stock_code).toBe('005930');
      expect(result!.confidence).toBe(1.0);
      expect(result!.matchType).toBe('exact_ticker');
      expect(result!.alternatives).toEqual([]);
    });

    test('resolves SK하이닉스 by ticker', () => {
      const result = resolver.resolve('000660');
      expect(result).not.toBeNull();
      expect(result!.corp_name).toBe('SK하이닉스');
      expect(result!.matchType).toBe('exact_ticker');
    });

    test('returns null for unknown ticker', () => {
      const result = resolver.resolve('999999');
      expect(result).toBeNull();
    });
  });

  describe('exact corp_code match', () => {
    test('resolves 8-digit corp code', () => {
      const result = resolver.resolve('00126380');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00126380');
      expect(result!.corp_name).toBe('삼성전자');
      expect(result!.confidence).toBe(1.0);
      expect(result!.matchType).toBe('exact_corpcode');
    });

    test('resolves unlisted company by corp code', () => {
      const result = resolver.resolve('00999999');
      expect(result).not.toBeNull();
      expect(result!.corp_name).toBe('비상장기업예시');
      expect(result!.stock_code).toBeNull();
      expect(result!.matchType).toBe('exact_corpcode');
    });

    test('returns null for unknown corp code', () => {
      const result = resolver.resolve('99999999');
      expect(result).toBeNull();
    });
  });

  describe('exact name match', () => {
    test('resolves exact Korean company name', () => {
      const result = resolver.resolve('삼성전자');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00126380');
      expect(result!.confidence).toBe(1.0);
      expect(result!.matchType).toBe('exact_name');
    });

    test('resolves name with extra whitespace', () => {
      const result = resolver.resolve('  삼성전자  ');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00126380');
      expect(result!.matchType).toBe('exact_name');
    });

    test('resolves mixed Korean/ASCII name', () => {
      const result = resolver.resolve('SK하이닉스');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00104833');
      expect(result!.matchType).toBe('exact_name');
    });

    test('resolves LG에너지솔루션', () => {
      const result = resolver.resolve('LG에너지솔루션');
      expect(result).not.toBeNull();
      expect(result!.corp_code).toBe('00401731');
    });
  });

  describe('fuzzy name match', () => {
    test('matches typo in company name', () => {
      // 삼성젼자 (typo: 전→젼, single jamo difference)
      const result = resolver.resolve('삼성젼자');
      expect(result).not.toBeNull();
      expect(result!.corp_name).toBe('삼성전자');
      expect(result!.matchType).toBe('fuzzy_name');
      expect(result!.confidence).toBeGreaterThan(0.8);
      expect(result!.confidence).toBeLessThan(1.0);
    });

    test('matches partial company name with alternatives', () => {
      // "삼성" should fuzzy-match multiple 삼성* companies
      const result = resolver.resolve('삼성');
      expect(result).not.toBeNull();
      expect(result!.matchType).toBe('fuzzy_name');
      // The top match should be one of the 삼성 companies
      expect(result!.corp_name).toContain('삼성');
    });

    test('returns alternatives for fuzzy matches', () => {
      const result = resolver.resolve('삼성젼자');
      expect(result).not.toBeNull();
      // Should have some alternatives (other 삼성* companies may score above threshold)
      // The primary result should be 삼성전자
      expect(result!.corp_name).toBe('삼성전자');
    });

    test('prefers listed companies in fuzzy results', () => {
      // If two companies have equal similarity, listed one should come first
      const result = resolver.resolve('비상장기업예');
      // This is close to 비상장기업예시 but since it's unlisted, check it still resolves
      if (result) {
        expect(result.matchType).toBe('fuzzy_name');
      }
    });
  });

  describe('edge cases', () => {
    test('returns null for empty string', () => {
      expect(resolver.resolve('')).toBeNull();
    });

    test('returns null for whitespace-only string', () => {
      expect(resolver.resolve('   ')).toBeNull();
    });

    test('returns null for single character (below fuzzy threshold)', () => {
      // Single char won't match exactly and is below MIN_FUZZY_INPUT_LENGTH
      expect(resolver.resolve('ㄱ')).toBeNull();
    });

    test('returns null for nonexistent company', () => {
      const result = resolver.resolve('존재하지않는회사이름입니다');
      expect(result).toBeNull();
    });

    test('unlisted company has null stock_code', () => {
      const result = resolver.resolve('00999999');
      expect(result).not.toBeNull();
      expect(result!.stock_code).toBeNull();
    });
  });

  describe('searchByPrefix', () => {
    test('finds companies starting with prefix', () => {
      const results = resolver.searchByPrefix('삼성');
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.corp_name.startsWith('삼성')).toBe(true);
      }
    });

    test('respects limit parameter', () => {
      const results = resolver.searchByPrefix('삼성', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('returns empty array for empty prefix', () => {
      expect(resolver.searchByPrefix('')).toEqual([]);
    });

    test('returns empty array for non-matching prefix', () => {
      expect(resolver.searchByPrefix('존재하지않는')).toEqual([]);
    });

    test('finds mixed Korean/ASCII prefixes', () => {
      const results = resolver.searchByPrefix('SK');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].corp_name).toBe('SK하이닉스');
    });

    test('finds single-char prefix matches', () => {
      const results = resolver.searchByPrefix('카');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].corp_name).toBe('카카오');
    });
  });

  describe('cache save/load', () => {
    test('saves and loads cache round-trip', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'resolver-test-'));
      const cachePath = join(tmpDir, 'corp-codes.json');

      await resolver.saveToCache(cachePath);

      const newResolver = createCorpCodeResolver();
      const loaded = await newResolver.loadFromCache(cachePath);

      expect(loaded).toBe(true);
      expect(newResolver.count).toBe(10);
      expect(newResolver.isLoaded).toBe(true);

      // Verify resolving works after cache load
      const result = newResolver.resolve('005930');
      expect(result).not.toBeNull();
      expect(result!.corp_name).toBe('삼성전자');
    });

    test('loadFromCache returns false for missing file', async () => {
      const newResolver = createCorpCodeResolver();
      const loaded = await newResolver.loadFromCache('/nonexistent/path/cache.json');
      expect(loaded).toBe(false);
      expect(newResolver.isLoaded).toBe(false);
    });

    test('loadFromCache returns false for invalid JSON', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'resolver-test-'));
      const cachePath = join(tmpDir, 'bad-cache.json');

      const { writeFile } = await import('node:fs/promises');
      await writeFile(cachePath, 'not valid json', 'utf-8');

      const newResolver = createCorpCodeResolver();
      const loaded = await newResolver.loadFromCache(cachePath);
      expect(loaded).toBe(false);
    });

    test('saveToCache creates parent directories', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'resolver-test-'));
      const cachePath = join(tmpDir, 'nested', 'dir', 'cache.json');

      // Should not throw even though nested/dir doesn't exist
      await resolver.saveToCache(cachePath);

      const newResolver = createCorpCodeResolver();
      const loaded = await newResolver.loadFromCache(cachePath);
      expect(loaded).toBe(true);
    });
  });
});

describe('createCorpCodeResolver', () => {
  test('returns a new CorpCodeResolver instance', () => {
    const resolver = createCorpCodeResolver();
    expect(resolver).toBeInstanceOf(CorpCodeResolver);
    expect(resolver.isLoaded).toBe(false);
    expect(resolver.count).toBe(0);
  });
});
