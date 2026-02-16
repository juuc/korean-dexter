---
title: "KIS API Client with OAuth Token Lifecycle"
issue: 8
phase: 2-core
priority: critical
status: done
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-1-foundation/03-scaffold|Fork & Scaffold]]"
  - "[[phase-1-foundation/04-corp-resolver|Corp Code Resolver]]"
  - "[[phase-1-foundation/05-data-model|Data Model]]"
  - "[[phase-1-foundation/10-rate-limiter|Rate Limiter]]"
  - "[[phase-1-foundation/11-cache|Cache]]"
blocks:
  - "[[phase-2-core/07-prompts|Korean Prompts]]"
tags: [api, market-data, kis, oauth, core]
estimated_effort: large
---

# KIS API Client with OAuth Token Lifecycle

KIS (Korea Investment & Securities, 한국투자증권) API provides real-time stock prices, OHLCV historical data, foreign/institutional investor flows, and market indices. The complexity is in the OAuth2 token lifecycle management.

## Background

**API Provider**: Korea Investment & Securities (koreainvestment.com)
**Base URL**: `https://openapi.koreainvestment.com:9443`
**Paper Trading URL**: `https://openapivts.koreainvestment.com:29443`
**Authentication**: OAuth2 Bearer tokens (24h expiry)
**Registration**: https://apiportal.koreainvestment.com/ (requires Korean ID or business registration)

## OAuth Token Lifecycle (THE HARD PART)

### Token Characteristics

- **Issuance**: POST `/oauth2/tokenP` with `appkey` + `appsecret`
- **Expiry**: 24 hours from issuance
- **Re-issuance Rate Limit**: ~1 token per day (exact limit unclear, but frequent re-issuance = account suspension)
- **Critical**: Token must be persisted to disk and reused across sessions

### Disk Persistence Strategy

**Token Storage**: `~/.korean-dexter/token.json`

```typescript
interface KISToken {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // seconds (86400 for 24h)
  issued_at: number; // Unix timestamp (ms)
}

function isTokenValid(token: KISToken): boolean {
  const now = Date.now();
  const expiresAt = token.issued_at + token.expires_in * 1000;
  const bufferMs = 5 * 60 * 1000; // 5 minutes safety buffer
  return now < expiresAt - bufferMs;
}
```

### Single-Writer Pattern with File Locking

Multiple concurrent agent instances could try to refresh token simultaneously. Use file locking:

```typescript
import { open } from "node:fs/promises";

async function getOrRefreshToken(): Promise<string> {
  const tokenPath = path.join(os.homedir(), ".korean-dexter", "token.json");

  // Try to read existing token
  let token = await readTokenFromDisk(tokenPath);

  if (token && isTokenValid(token)) {
    return token.access_token;
  }

  // Need to refresh - acquire lock
  const lockPath = `${tokenPath}.lock`;
  const lockFile = await open(lockPath, "wx"); // Exclusive create

  try {
    // Double-check after acquiring lock (another process may have refreshed)
    token = await readTokenFromDisk(tokenPath);
    if (token && isTokenValid(token)) {
      return token.access_token;
    }

    // Issue new token
    const newToken = await issueNewToken();
    await writeTokenToDisk(tokenPath, newToken);
    return newToken.access_token;
  } finally {
    await lockFile.close();
    await fs.unlink(lockPath); // Release lock
  }
}
```

### Token Refresh Flow

```
Startup:
  1. Check if ~/.korean-dexter/token.json exists
  2. If yes, read token
  3. If isTokenValid(token), use it
  4. If no/expired, issue new token (with lock)
  5. Write to disk

Every API Request:
  1. Check if current token is still valid
  2. If invalid, refresh (with lock)
  3. Use token in Authorization header
```

## API Endpoints

### Core Tools (MVP)

| Endpoint | tr_id | Purpose |
|----------|-------|---------|
| `/uapi/domestic-stock/v1/quotations/inquire-price` | FHKST01010100 | Current stock price |
| `/uapi/domestic-stock/v1/quotations/inquire-daily-price` | FHKST01010400 | OHLCV daily data |
| `/uapi/domestic-stock/v1/quotations/inquire-investor` | FHKST01010900 | Foreign/institutional flows |
| `/uapi/domestic-stock/v1/quotations/search-stock-info` | CTPF1002R | PER, PBR, EPS, sector |
| `/uapi/domestic-stock/v1/quotations/inquire-index-price` | FHKUP03500100 | KOSPI/KOSDAQ indices |

### Required Headers

Every request must include:

```typescript
{
  "authorization": `Bearer ${access_token}`,
  "appkey": process.env.KIS_APP_KEY,
  "appsecret": process.env.KIS_APP_SECRET,
  "tr_id": "<endpoint-specific-tr-id>",
  "custtype": "P" // P = personal, B = business
}
```

### Example: Get Current Price

```
GET /uapi/domestic-stock/v1/quotations/inquire-price
  ?FID_COND_MRKT_DIV_CODE=J
  &FID_INPUT_ISCD=005930

Headers:
  authorization: Bearer <token>
  appkey: <app_key>
  appsecret: <app_secret>
  tr_id: FHKST01010100
```

**Response** (simplified):

```json
{
  "output": {
    "stck_prpr": "71000", // Current price
    "prdy_vrss": "1000",   // Change from previous day
    "prdy_ctrt": "1.43",   // Change %
    "acml_vol": "12345678" // Accumulated volume
  }
}
```

## Paper Trading Support

KIS provides a separate environment for testing without real money:

**Base URL**: `https://openapivts.koreainvestment.com:29443`
**Separate Credentials**: Different appkey/appsecret

**Configuration**:

```typescript
const baseUrl = process.env.KIS_PAPER_TRADING === "true"
  ? "https://openapivts.koreainvestment.com:29443"
  : "https://openapi.koreainvestment.com:9443";
```

## Implementation Tasks

1. **OAuth Token Management**
   - Create `src/clients/kis/auth.ts`
   - Implement `issueNewToken()`
   - Implement `getOrRefreshToken()` with file locking
   - Token persistence to `~/.korean-dexter/token.json`
   - Unit tests for token validation and refresh logic

2. **Base HTTP Client**
   - Create `src/clients/kis/client.ts`
   - Embed OAuth token in every request
   - Required headers (authorization, appkey, appsecret, tr_id)
   - Error handling (401 = token expired, 429 = rate limit)

3. **Rate Limiting**
   - KIS has per-second and daily limits (exact limits unclear)
   - Conservative: 2 req/sec, track daily quota
   - Use RateLimiter from [[phase-1-foundation/10-rate-limiter|Issue #10]]

4. **Caching Strategy**
   - **Current prices**: Cache for 1 second (near real-time)
   - **Daily OHLCV**: Cache by date, permanent for closed days
   - **Investor flows**: Cache for 1 minute (updates intraday)
   - **Market indices**: Cache for 5 seconds

   ```typescript
   // Cache key examples
   "kis:price:005930" // TTL: 1s
   "kis:daily:005930:2024-01-15" // TTL: permanent (closed day)
   "kis:investor:005930" // TTL: 60s
   ```

5. **Implement Core Tools**

   ```typescript
   // Sub-tools for korean_financial_metrics meta-tool

   async function getCurrentPrice(ticker: string): Promise<StockPrice> {
     // inquire-price endpoint
   }

   async function getDailyPrices(
     ticker: string,
     startDate: string,
     endDate: string
   ): Promise<DailyPrice[]> {
     // inquire-daily-price endpoint
     // Returns OHLCV data
   }

   async function getInvestorTrading(ticker: string): Promise<InvestorFlow> {
     // inquire-investor endpoint
     // Foreign/institutional buy/sell volumes
   }

   async function getStockInfo(ticker: string): Promise<StockInfo> {
     // search-stock-info endpoint
     // PER, PBR, EPS, market cap, sector
   }

   async function getMarketIndex(
     indexCode: string // "0001" = KOSPI, "1001" = KOSDAQ
   ): Promise<IndexPrice> {
     // inquire-index-price endpoint
   }
   ```

6. **Ticker ↔ Corp Code Mapping**
   - KIS uses ticker symbols (005930)
   - OpenDART uses corp_code (00126380)
   - Use CorpCodeResolver from [[phase-1-foundation/04-corp-resolver|Issue #4]]

7. **Meta-Tool: korean_financial_metrics**

   ```typescript
   {
     name: "korean_financial_metrics",
     description: `Get real-time stock prices, OHLCV data, investor flows,
       market indices from Korean stock market (KOSPI/KOSDAQ).`,
     parameters: {
       query: "Natural language query",
       ticker: "6-digit ticker (optional, can resolve from company name)",
       period: "Date range for historical data (optional)"
     }
   }
   ```

   Inner LLM routes to KIS sub-tools, executes in parallel.

8. **Unit Tests**
   - Mock OAuth token responses
   - Test token refresh logic
   - Test file locking (concurrent access)
   - Test cache key generation
   - Test each sub-tool with fixtures

9. **Integration Test**
   - "Get Samsung Electronics (005930) current stock price"
   - Should: get valid token → call inquire-price → parse response → return price

## Success Criteria

- [ ] OAuth token issued and persisted to disk
- [ ] Token reused across multiple requests (no re-issuance)
- [ ] Token auto-refreshes when expired
- [ ] File locking prevents concurrent token refresh
- [ ] Can get Samsung current price
- [ ] Can get Samsung daily OHLCV for past 30 days
- [ ] Can get Samsung investor flows (foreign/institutional)
- [ ] Can get KOSPI index price
- [ ] Paper trading mode works (separate credentials)
- [ ] Integration test passes

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| 401 Unauthorized | Token expired | Refresh token and retry |
| 429 Too Many Requests | Rate limit | Exponential backoff |
| 500 Internal Server Error | KIS server issue | Retry with backoff, max 3 attempts |
| Market closed | Outside trading hours | Clear error message, use cached data |
| Daily quota exceeded | Too many requests | Stop issuing requests, notify user |

See [[phase-2-core/14-error-handling|Issue #14]] for detailed error handling strategy.

## References

- KIS API Portal: https://apiportal.koreainvestment.com/
- KIS API Docs: https://apiportal.koreainvestment.com/apiservice/
- OAuth2 RFC: https://datatracker.ietf.org/doc/html/rfc6749
