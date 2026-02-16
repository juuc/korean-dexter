import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { KISAuthManager, type KISToken } from './auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assign a mock to globalThis.fetch (Bun's fetch type requires preconnect not needed in tests) */
function setFetchMock<T extends object>(mockFn: T): T {
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  return mockFn;
}

function createMockTokenResponse(overrides?: {
  readonly accessToken?: string;
  readonly expiresIn?: number;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (overrides?.expiresIn ?? 86400) * 1000);
  // KIS format: "YYYY-MM-DD HH:mm:ss" in KST
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstExpires = new Date(expiresAt.getTime() + kstOffset);
  const expiredStr = kstExpires.toISOString().replace('T', ' ').substring(0, 19);

  return {
    access_token: overrides?.accessToken ?? 'test-access-token-xyz',
    access_token_token_expired: expiredStr,
    token_type: 'Bearer',
    expires_in: overrides?.expiresIn ?? 86400,
  };
}

function createExpiredTokenFile(tokenCachePath: string): void {
  const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
  const token: KISToken = {
    accessToken: 'expired-token',
    tokenType: 'Bearer',
    expiresAt: pastDate.toISOString(),
    issuedAt: new Date(Date.now() - 86400 * 1000).toISOString(),
    environment: 'production',
  };
  writeFileSync(tokenCachePath, JSON.stringify(token, null, 2));
}

function createValidTokenFile(tokenCachePath: string): void {
  const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
  const token: KISToken = {
    accessToken: 'valid-cached-token',
    tokenType: 'Bearer',
    expiresAt: futureDate.toISOString(),
    issuedAt: new Date().toISOString(),
    environment: 'production',
  };
  writeFileSync(tokenCachePath, JSON.stringify(token, null, 2));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KISAuthManager', () => {
  let tempDir: string;
  let tokenCachePath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kis-auth-test-'));
    tokenCachePath = join(tempDir, 'kis-token.json');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    test('throws when credentials are missing', () => {
      // Temporarily clear env vars so constructor can't fall back to them
      const origKey = process.env.KIS_APP_KEY;
      const origSecret = process.env.KIS_APP_SECRET;
      delete process.env.KIS_APP_KEY;
      delete process.env.KIS_APP_SECRET;

      try {
        expect(
          () =>
            new KISAuthManager({
              appKey: undefined,
              appSecret: undefined,
              tokenCachePath,
            })
        ).toThrow(/KIS credentials not found/);
      } finally {
        if (origKey !== undefined) process.env.KIS_APP_KEY = origKey;
        if (origSecret !== undefined) process.env.KIS_APP_SECRET = origSecret;
      }
    });

    test('creates instance with explicit credentials', () => {
      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth).toBeDefined();
      expect(auth.getAppKey()).toBe('test-key');
      expect(auth.getAppSecret()).toBe('test-secret');
    });

    test('loads valid token from disk on construction', () => {
      createValidTokenFile(tokenCachePath);

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(true);
    });

    test('ignores expired token from disk', () => {
      createExpiredTokenFile(tokenCachePath);

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(false);
    });

    test('ignores token file for wrong environment', () => {
      // Write a paper trading token
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const token: KISToken = {
        accessToken: 'paper-token',
        tokenType: 'Bearer',
        expiresAt: futureDate.toISOString(),
        issuedAt: new Date().toISOString(),
        environment: 'paper',
      };
      writeFileSync(tokenCachePath, JSON.stringify(token, null, 2));

      // Create production auth manager — should not load paper token
      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        paperTrading: false,
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(false);
    });
  });

  describe('baseUrl', () => {
    test('returns production URL by default', () => {
      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.baseUrl).toBe(
        'https://openapi.koreainvestment.com:9443'
      );
    });

    test('returns paper trading URL when enabled', () => {
      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        paperTrading: true,
        tokenCachePath,
      });

      expect(auth.baseUrl).toBe(
        'https://openapivts.koreainvestment.com:29443'
      );
    });
  });

  describe('isTokenValid', () => {
    test('returns false when no token exists', () => {
      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(false);
    });

    test('returns true for token with >5 min remaining', () => {
      createValidTokenFile(tokenCachePath);

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(true);
    });

    test('returns false for token with <5 min remaining', () => {
      // Token expiring in 3 minutes
      const almostExpired = new Date(Date.now() + 3 * 60 * 1000);
      const token: KISToken = {
        accessToken: 'almost-expired-token',
        tokenType: 'Bearer',
        expiresAt: almostExpired.toISOString(),
        issuedAt: new Date().toISOString(),
        environment: 'production',
      };
      writeFileSync(tokenCachePath, JSON.stringify(token, null, 2));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth.isTokenValid()).toBe(false);
    });
  });

  describe('getToken', () => {
    test('returns cached token when valid', async () => {
      createValidTokenFile(tokenCachePath);

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      const token = await auth.getToken();
      expect(token).toBe('valid-cached-token');
    });

    test('issues new token when none cached', async () => {
      const mockResponse = createMockTokenResponse({
        accessToken: 'fresh-token-123',
      });

      setFetchMock(mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      ));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      const token = await auth.getToken();
      expect(token).toBe('fresh-token-123');
    });

    test('saves issued token to disk', async () => {
      const mockResponse = createMockTokenResponse({
        accessToken: 'persisted-token',
      });

      setFetchMock(mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      ));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      await auth.getToken();

      // Wait a tick for async disk write
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Read back from disk
      const saved = JSON.parse(
        readFileSync(tokenCachePath, 'utf-8')
      ) as KISToken;

      expect(saved.accessToken).toBe('persisted-token');
      expect(saved.tokenType).toBe('Bearer');
      expect(saved.environment).toBe('production');
    });
  });

  describe('refreshToken', () => {
    test('issues new token via POST /oauth2/tokenP', async () => {
      const mockResponse = createMockTokenResponse({
        accessToken: 'refreshed-token',
      });

      const fetchMock = mock((_url: string, _init?: RequestInit) =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      );
      setFetchMock(fetchMock);

      const auth = new KISAuthManager({
        appKey: 'my-app-key',
        appSecret: 'my-app-secret',
        tokenCachePath,
      });

      await auth.refreshToken();
      expect(auth.isTokenValid()).toBe(true);

      // Verify fetch was called with correct body
      const calls = fetchMock.mock.calls;
      expect(calls.length).toBe(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/oauth2/tokenP');
      expect(options).toBeDefined();
      expect(options!.method).toBe('POST');

      const body = JSON.parse(options!.body as string) as Record<string, string>;
      expect(body.grant_type).toBe('client_credentials');
      expect(body.appkey).toBe('my-app-key');
      expect(body.appsecret).toBe('my-app-secret');
    });

    test('throws on HTTP error with retry guidance', async () => {
      setFetchMock(mock(() =>
        Promise.resolve(
          new Response('Rate limited', { status: 429 })
        )
      ));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      await expect(auth.refreshToken()).rejects.toThrow(/token issuance failed/i);
    });

    test('throws on empty access_token in response', async () => {
      setFetchMock(mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: '',
              access_token_token_expired: '2024-03-15 12:00:00',
              token_type: 'Bearer',
              expires_in: 86400,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      ));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      await expect(auth.refreshToken()).rejects.toThrow(/empty token/i);
    });

    test('sets paper environment when paperTrading is true', async () => {
      const mockResponse = createMockTokenResponse({
        accessToken: 'paper-token',
      });

      setFetchMock(mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      ));

      const auth = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        paperTrading: true,
        tokenCachePath,
      });

      await auth.refreshToken();

      // Wait for disk write
      await new Promise((resolve) => setTimeout(resolve, 50));

      const saved = JSON.parse(
        readFileSync(tokenCachePath, 'utf-8')
      ) as KISToken;
      expect(saved.environment).toBe('paper');
    });
  });

  describe('token reuse across instances', () => {
    test('second instance loads token saved by first', async () => {
      const mockResponse = createMockTokenResponse({
        accessToken: 'shared-token',
      });

      setFetchMock(mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      ));

      // First instance issues token
      const auth1 = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });
      await auth1.getToken();

      // Wait for disk write
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second instance should load from disk
      const auth2 = new KISAuthManager({
        appKey: 'test-key',
        appSecret: 'test-secret',
        tokenCachePath,
      });

      expect(auth2.isTokenValid()).toBe(true);
      const token = await auth2.getToken();
      expect(token).toBe('shared-token');
    });
  });
});
