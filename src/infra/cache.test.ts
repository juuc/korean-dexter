import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LRUCache,
  DiskCache,
  cachedApiCall,
  buildCacheKey,
  CACHE_TTL,
} from './cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  test('get/set/has/delete basics', () => {
    cache.set('key1', 'value1', 1000);
    expect(cache.has('key1')).toBe(true);
    expect(cache.get('key1')).toBe('value1');
    expect(cache.size).toBe(1);

    cache.delete('key1');
    expect(cache.has('key1')).toBe(false);
    expect(cache.get('key1')).toBe(null);
    expect(cache.size).toBe(0);
  });

  test('TTL expiry', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    expect(cache.get('key1')).toBe('value1');

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBe(null);
    expect(cache.has('key1')).toBe(false);
  });

  test('LRU eviction when at max size', () => {
    cache.set('key1', 'value1', 10000);
    cache.set('key2', 'value2', 10000);
    cache.set('key3', 'value3', 10000);
    expect(cache.size).toBe(3);

    // Adding 4th entry should evict oldest (key1)
    cache.set('key4', 'value4', 10000);
    expect(cache.size).toBe(3);
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
    expect(cache.has('key3')).toBe(true);
    expect(cache.has('key4')).toBe(true);
  });

  test('Access order - get() refreshes position', () => {
    cache.set('key1', 'value1', 10000);
    cache.set('key2', 'value2', 10000);
    cache.set('key3', 'value3', 10000);

    // Access key1 to move it to end
    cache.get('key1');

    // Now add key4 - should evict key2 (least recently used)
    cache.set('key4', 'value4', 10000);
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(true);
    expect(cache.has('key4')).toBe(true);
  });

  test('clear() empties cache', () => {
    cache.set('key1', 'value1', 10000);
    cache.set('key2', 'value2', 10000);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
  });

  test('Permanent entries (ttlMs = 0) never expire', async () => {
    cache.set('key1', 'value1', 0); // Permanent
    expect(cache.get('key1')).toBe('value1');

    // Wait beyond normal expiry time
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  test('Permanent entries (negative ttlMs) never expire', async () => {
    cache.set('key1', 'value1', -1); // Permanent
    expect(cache.get('key1')).toBe('value1');

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  test('handles complex object values', () => {
    interface TestData {
      readonly id: number;
      readonly name: string;
      readonly nested: { readonly value: string };
    }

    const objCache = new LRUCache<TestData>(3);
    const testData: TestData = {
      id: 1,
      name: 'test',
      nested: { value: 'nested' },
    };

    objCache.set('key1', testData, 10000);
    const result = objCache.get('key1');

    expect(result).toEqual(testData);
    expect(result?.nested.value).toBe('nested');
  });
});

describe('DiskCache', () => {
  let cache: DiskCache;
  let dbPath: string;

  beforeEach(() => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cache-test-'));
    dbPath = join(tmpDir, 'test.sqlite');
    cache = new DiskCache(dbPath);
  });

  afterEach(() => {
    cache.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore if already deleted
    }
  });

  test('get/set/has/delete basics', () => {
    cache.set('key1', 'value1', 10000);
    expect(cache.has('key1')).toBe(true);
    expect(cache.get<string>('key1')).toBe('value1');

    cache.delete('key1');
    expect(cache.has('key1')).toBe(false);
    expect(cache.get<string>('key1')).toBe(null);
  });

  test('TTL expiry', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    expect(cache.get<string>('key1')).toBe('value1');

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get<string>('key1')).toBe(null);
    expect(cache.has('key1')).toBe(false);
  });

  test('Permanent entries (ttlMs = null)', async () => {
    cache.set('key1', 'value1', null); // Permanent
    expect(cache.get<string>('key1')).toBe('value1');

    // Wait beyond normal expiry time
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get<string>('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  test('invalidateByPrefix removes matching entries', () => {
    cache.set('opendart:api1:param1', 'data1', 10000);
    cache.set('opendart:api1:param2', 'data2', 10000);
    cache.set('opendart:api2:param1', 'data3', 10000);
    cache.set('kis:api1:param1', 'data4', 10000);

    const removed = cache.invalidateByPrefix('opendart:api1');
    expect(removed).toBe(2);

    expect(cache.has('opendart:api1:param1')).toBe(false);
    expect(cache.has('opendart:api1:param2')).toBe(false);
    expect(cache.has('opendart:api2:param1')).toBe(true);
    expect(cache.has('kis:api1:param1')).toBe(true);
  });

  test('prune() removes expired entries', async () => {
    cache.set('key1', 'value1', 100); // Expires in 100ms
    cache.set('key2', 'value2', null); // Permanent
    cache.set('key3', 'value3', 100); // Expires in 100ms

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    const pruned = cache.prune();
    expect(pruned).toBe(2);

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
    expect(cache.has('key3')).toBe(false);
  });

  test('getStats() returns correct entry count and hit count', () => {
    cache.set('key1', 'value1', 10000);
    cache.set('key2', 'value2', 10000);

    let stats = cache.getStats();
    expect(stats.entries).toBe(2);
    expect(stats.hitCount).toBe(0);

    // Access entries to increment hit count
    cache.get<string>('key1');
    cache.get<string>('key1');
    cache.get<string>('key2');

    stats = cache.getStats();
    expect(stats.entries).toBe(2);
    expect(stats.hitCount).toBe(3);
  });

  test('JSON serialization of complex objects', () => {
    interface TestData {
      readonly id: number;
      readonly name: string;
      readonly items: readonly string[];
      readonly nested: { readonly value: number };
    }

    const testData: TestData = {
      id: 42,
      name: 'test',
      items: ['a', 'b', 'c'],
      nested: { value: 123 },
    };

    cache.set('key1', testData, 10000);
    const result = cache.get<TestData>('key1');

    expect(result).toEqual(testData);
    expect(result?.items).toEqual(['a', 'b', 'c']);
    expect(result?.nested.value).toBe(123);
  });

  test('set() updates existing entry', () => {
    cache.set('key1', 'value1', 10000);
    expect(cache.get<string>('key1')).toBe('value1');

    cache.set('key1', 'value2', 10000);
    expect(cache.get<string>('key1')).toBe('value2');

    const stats = cache.getStats();
    expect(stats.entries).toBe(1); // Should only have one entry
  });
});

describe('cachedApiCall', () => {
  let lruCache: LRUCache<string>;
  let diskCache: DiskCache;
  let dbPath: string;
  let apiCallCount: number;

  const mockApiFn = async (): Promise<string> => {
    apiCallCount++;
    return 'api-result';
  };

  beforeEach(() => {
    lruCache = new LRUCache<string>(3);
    const tmpDir = mkdtempSync(join(tmpdir(), 'cache-test-'));
    dbPath = join(tmpDir, 'test.sqlite');
    diskCache = new DiskCache(dbPath);
    apiCallCount = 0;
  });

  afterEach(() => {
    diskCache.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore
    }
  });

  test('Cache miss - calls API and stores result', async () => {
    const result = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
      diskCache,
    });

    expect(result.data).toBe('api-result');
    expect(result.fromCache).toBe(false);
    expect(result.cacheLayer).toBeUndefined();
    expect(apiCallCount).toBe(1);

    // Verify stored in both caches
    expect(lruCache.get('key1')).toBe('api-result');
    expect(diskCache.get<string>('key1')).toBe('api-result');
  });

  test('LRU hit - returns from memory, does not call API', async () => {
    // Populate LRU
    lruCache.set('key1', 'cached-value', 10000);

    const result = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
      diskCache,
    });

    expect(result.data).toBe('cached-value');
    expect(result.fromCache).toBe(true);
    expect(result.cacheLayer).toBe('memory');
    expect(apiCallCount).toBe(0);
  });

  test('Disk hit - returns from disk when LRU misses', async () => {
    // Populate only disk cache
    diskCache.set('key1', 'disk-cached-value', 10000);

    const result = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
      diskCache,
    });

    expect(result.data).toBe('disk-cached-value');
    expect(result.fromCache).toBe(true);
    expect(result.cacheLayer).toBe('disk');
    expect(apiCallCount).toBe(0);

    // Verify LRU was populated
    expect(lruCache.get('key1')).toBe('disk-cached-value');
  });

  test('forceRefresh - bypasses cache, calls API, updates cache', async () => {
    // Populate both caches
    lruCache.set('key1', 'old-lru-value', 10000);
    diskCache.set('key1', 'old-disk-value', 10000);

    const result = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
      diskCache,
      forceRefresh: true,
    });

    expect(result.data).toBe('api-result');
    expect(result.fromCache).toBe(false);
    expect(apiCallCount).toBe(1);

    // Verify caches were updated
    expect(lruCache.get('key1')).toBe('api-result');
    expect(diskCache.get<string>('key1')).toBe('api-result');
  });

  test('Permanent cache (ttlMs = null) - stores in disk only', async () => {
    const result = await cachedApiCall('key1', null, mockApiFn, {
      lruCache,
      diskCache,
    });

    expect(result.data).toBe('api-result');
    expect(apiCallCount).toBe(1);

    // LRU should not have it (ttl is null)
    expect(lruCache.get('key1')).toBe(null);
    // Disk should have it
    expect(diskCache.get<string>('key1')).toBe('api-result');
  });

  test('Works without caches provided', async () => {
    const result = await cachedApiCall('key1', 10000, mockApiFn);

    expect(result.data).toBe('api-result');
    expect(result.fromCache).toBe(false);
    expect(apiCallCount).toBe(1);
  });

  test('Works with only LRU cache', async () => {
    const result1 = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
    });
    expect(result1.fromCache).toBe(false);
    expect(apiCallCount).toBe(1);

    const result2 = await cachedApiCall('key1', 10000, mockApiFn, {
      lruCache,
    });
    expect(result2.fromCache).toBe(true);
    expect(result2.cacheLayer).toBe('memory');
    expect(apiCallCount).toBe(1); // Should not increment
  });

  test('Works with only disk cache', async () => {
    const result1 = await cachedApiCall('key1', 10000, mockApiFn, {
      diskCache,
    });
    expect(result1.fromCache).toBe(false);
    expect(apiCallCount).toBe(1);

    const result2 = await cachedApiCall('key1', 10000, mockApiFn, {
      diskCache,
    });
    expect(result2.fromCache).toBe(true);
    expect(result2.cacheLayer).toBe('disk');
    expect(apiCallCount).toBe(1);
  });
});

describe('buildCacheKey', () => {
  test('Returns correct format', () => {
    const key = buildCacheKey('opendart', 'fnlttSinglAcnt', {
      corp_code: '00126380',
      bsns_year: '2024',
      reprt_code: '11011',
    });

    expect(key).toContain('opendart:fnlttSinglAcnt:');
  });

  test('Deterministic regardless of param order', () => {
    const key1 = buildCacheKey('api', 'endpoint', {
      b: 'value2',
      a: 'value1',
      c: 'value3',
    });

    const key2 = buildCacheKey('api', 'endpoint', {
      c: 'value3',
      a: 'value1',
      b: 'value2',
    });

    expect(key1).toBe(key2);
  });

  test('Handles numeric parameters', () => {
    const key = buildCacheKey('kis', 'price', {
      symbol: '005930',
      date: 20240101,
    });

    expect(key).toContain('kis:price:');
  });

  test('Different parameters produce different keys', () => {
    const key1 = buildCacheKey('api', 'endpoint', { param: 'value1' });
    const key2 = buildCacheKey('api', 'endpoint', { param: 'value2' });

    expect(key1).not.toBe(key2);
  });

  test('Empty params', () => {
    const key = buildCacheKey('api', 'endpoint', {});
    expect(key).toBe('api:endpoint:');
  });
});

describe('CACHE_TTL constants', () => {
  test('PERMANENT is null', () => {
    expect(CACHE_TTL.PERMANENT).toBe(null);
  });

  test('LONG is 30 days in ms', () => {
    expect(CACHE_TTL.LONG).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('MEDIUM is 7 days in ms', () => {
    expect(CACHE_TTL.MEDIUM).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('SHORT is 1 hour in ms', () => {
    expect(CACHE_TTL.SHORT).toBe(60 * 60 * 1000);
  });

  test('LIVE is 30 seconds in ms', () => {
    expect(CACHE_TTL.LIVE).toBe(30 * 1000);
  });

  test('AFTER_HOURS is 1 hour in ms', () => {
    expect(CACHE_TTL.AFTER_HOURS).toBe(60 * 60 * 1000);
  });

  test('CORP_CODE is 24 hours in ms', () => {
    expect(CACHE_TTL.CORP_CODE).toBe(24 * 60 * 60 * 1000);
  });
});
