import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getKisAppKey, getKisAppSecret } from '@/utils/env';

/**
 * KIS OAuth token stored on disk and in memory.
 */
export interface KISToken {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresAt: string; // ISO 8601
  readonly issuedAt: string; // ISO 8601
  readonly environment: 'production' | 'paper';
}

/**
 * Raw token response from KIS /oauth2/tokenP endpoint.
 */
interface KISTokenResponse {
  readonly access_token: string;
  readonly access_token_token_expired: string; // "YYYY-MM-DD HH:mm:ss"
  readonly token_type: string;
  readonly expires_in: number;
}

const PRODUCTION_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const PAPER_BASE_URL = 'https://openapivts.koreainvestment.com:29443';

/** Minimum remaining validity before refreshing (5 minutes). */
const TOKEN_VALIDITY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Manages KIS OAuth token lifecycle: issuance, caching, validation, and refresh.
 *
 * Token flow:
 * 1. getToken() checks in-memory cache first
 * 2. Falls back to disk cache (~/.korean-dexter/kis-token.json)
 * 3. If no valid token, issues new one via POST /oauth2/tokenP
 * 4. Persists new token to disk for cross-process reuse
 */
export class KISAuthManager {
  private token: KISToken | null = null;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly paperTrading: boolean;
  private readonly tokenCachePath: string;

  constructor(options?: {
    readonly appKey?: string;
    readonly appSecret?: string;
    readonly paperTrading?: boolean;
    readonly tokenCachePath?: string;
  }) {
    const resolvedAppKey = options?.appKey ?? getKisAppKey();
    const resolvedAppSecret = options?.appSecret ?? getKisAppSecret();

    if (!resolvedAppKey || !resolvedAppSecret) {
      throw new Error(
        'KIS credentials not found. Set KIS_APP_KEY and KIS_APP_SECRET environment variables.'
      );
    }

    this.appKey = resolvedAppKey;
    this.appSecret = resolvedAppSecret;
    this.paperTrading = options?.paperTrading ?? false;
    this.tokenCachePath =
      options?.tokenCachePath ??
      join(homedir(), '.korean-dexter', 'kis-token.json');

    // Load cached token from disk synchronously at construction
    this.loadTokenFromDisk();
  }

  /**
   * Get a valid access token string. Issues new token if needed.
   */
  async getToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.token!.accessToken;
    }

    await this.refreshToken();
    return this.token!.accessToken;
  }

  /**
   * Check if the current in-memory token is valid (>5 min remaining).
   */
  isTokenValid(): boolean {
    if (!this.token) {
      return false;
    }

    const expiresAt = new Date(this.token.expiresAt).getTime();
    const now = Date.now();

    return expiresAt - now > TOKEN_VALIDITY_BUFFER_MS;
  }

  /**
   * Force-issue a new token from KIS API and persist to disk.
   */
  async refreshToken(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.appKey,
        appsecret: this.appSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `KIS token issuance failed (HTTP ${response.status}): ${body}. ` +
          'Token issuance is rate-limited to 1/min. Wait and retry.'
      );
    }

    const data = (await response.json()) as KISTokenResponse;

    if (!data.access_token) {
      throw new Error(
        `KIS token issuance returned empty token. Response: ${JSON.stringify(data)}`
      );
    }

    const environment: KISToken['environment'] = this.paperTrading
      ? 'paper'
      : 'production';

    // Parse KIS expiry format "YYYY-MM-DD HH:mm:ss" as KST (UTC+9)
    const expiresAt = parseKisDatetimeToISO(data.access_token_token_expired);

    this.token = {
      accessToken: data.access_token,
      tokenType: 'Bearer',
      expiresAt,
      issuedAt: new Date().toISOString(),
      environment,
    };

    await this.saveTokenToDisk();
  }

  /**
   * Get base URL based on trading environment.
   */
  get baseUrl(): string {
    return this.paperTrading ? PAPER_BASE_URL : PRODUCTION_BASE_URL;
  }

  /**
   * Get the app key (needed for KIS request headers).
   */
  getAppKey(): string {
    return this.appKey;
  }

  /**
   * Get the app secret (needed for KIS request headers).
   */
  getAppSecret(): string {
    return this.appSecret;
  }

  /**
   * Load token from disk cache. Sync read at construction time.
   */
  private loadTokenFromDisk(): void {
    try {
      const text = readFileSync(this.tokenCachePath, 'utf-8');
      const cached = JSON.parse(text) as KISToken;

      // Validate structure before accepting
      if (
        cached.accessToken &&
        cached.expiresAt &&
        cached.tokenType === 'Bearer'
      ) {
        // Only accept if environment matches
        const expectedEnv = this.paperTrading ? 'paper' : 'production';
        if (cached.environment === expectedEnv) {
          this.token = cached;
        }
      }
    } catch {
      // File doesn't exist or is invalid — will issue fresh token on demand
    }
  }

  /**
   * Save current token to disk for cross-process reuse.
   */
  private async saveTokenToDisk(): Promise<void> {
    if (!this.token) {
      return;
    }

    try {
      const dir = this.tokenCachePath.substring(
        0,
        this.tokenCachePath.lastIndexOf('/')
      );
      await mkdir(dir, { recursive: true });
      await Bun.write(
        this.tokenCachePath,
        JSON.stringify(this.token, null, 2)
      );
    } catch (error) {
      // Non-critical: token still works in memory
      console.warn('Failed to save KIS token to disk:', error);
    }
  }
}

/**
 * Parse KIS datetime string "YYYY-MM-DD HH:mm:ss" (KST) to ISO 8601.
 * KST is UTC+9.
 */
function parseKisDatetimeToISO(kisDatetime: string): string {
  // KIS returns "2024-03-15 12:00:00" in KST
  const isoLike = kisDatetime.replace(' ', 'T');
  // Append KST offset
  return `${isoLike}+09:00`;
}
