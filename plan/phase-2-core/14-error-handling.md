---
title: "Error Handling & Graceful Degradation"
issue: 14
phase: 2-core
priority: high
status: planned
type: infra
created: 2026-02-16
depends_on:
  - "[[phase-2-core/06-opendart|OpenDART Client]]"
  - "[[phase-2-core/08-kis|KIS Client]]"
tags: [error-handling, resilience, reliability]
estimated_effort: medium
---

# Error Handling & Graceful Degradation

Korean APIs have specific failure modes that require specialized error handling. The goal: NEVER fail silently, ALWAYS tell the agent WHY a tool failed, and gracefully degrade when primary data sources are unavailable.

## Korean API Failure Modes

### OpenDART Specific Errors

| Error Condition | HTTP Code | Response | Recovery Strategy |
|-----------------|-----------|----------|-------------------|
| Invalid API key | 200 | `{"status":"013","message":"000"}` | Fatal - check environment config |
| Rate limit exceeded | 429 | Too Many Requests | Exponential backoff, warn at 80% quota |
| Invalid corp_code | 200 | `{"status":"013","message":"..."}` | Retry with corp_code resolution |
| No data for period | 200 | `{"status":"013","message":"..."}` | Try previous period or separate statements |
| Maintenance window | 503 | Service Unavailable | Retry after delay, notify user |
| Daily quota exceeded | 200 | Status code in JSON | Stop requests, use cached data only |
| Network timeout | - | Connection timeout | Retry with exponential backoff (max 3) |

**Critical**: OpenDART returns HTTP 200 even for errors. Must parse JSON `status` field.

```typescript
interface OpenDartResponse {
  status: string; // "000" = success, "013" = error, "020" = no data
  message: string;
  list?: any[];
}

function isOpenDartError(response: OpenDartResponse): boolean {
  return response.status !== "000";
}

function parseOpenDartError(response: OpenDartResponse): Error {
  const errorCodes: Record<string, string> = {
    "010": "정상 (Normal)",
    "011": "개발자 등록키가 정상적으로 부여되지 않았습니다 (Invalid API key)",
    "012": "조회기간은 3개월을 넘을수 없습니다 (Date range > 3 months)",
    "013": "제공되는 데이터가 없습니다 (No data available)",
    "014": "사용기간 만료 (API key expired)",
    "020": "요청 변수 오류 (Invalid parameters)",
    "021": "일일 요청 한도 초과 (Daily quota exceeded)"
  };

  const koreanMessage = errorCodes[response.status] || response.message;
  return new Error(`OpenDART Error [${response.status}]: ${koreanMessage}`);
}
```

### KIS API Specific Errors

| Error Condition | HTTP Code | Response | Recovery Strategy |
|-----------------|-----------|----------|-------------------|
| OAuth token expired | 401 | Unauthorized | Auto-refresh token, retry request |
| Invalid token issuance | 401 | JSON error | Check credentials, notify user |
| Rate limit exceeded | 429 | Too Many Requests | Exponential backoff |
| Daily quota exceeded | 403 | Forbidden | Stop requests, notify user |
| Market closed | 200 | JSON status | Use cached data, explain market hours |
| Invalid ticker | 200 | JSON error | Retry with ticker resolution |
| Paper trading error | 200 | JSON error | Check KIS_PAPER_TRADING config |

**Critical**: KIS uses OAuth tokens that expire mid-session (24h). Must auto-refresh.

```typescript
async function handleKISRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error.status === 401) {
      // Token expired - refresh and retry
      console.log("[KIS] Token expired, refreshing...");
      await refreshOAuthToken();
      return await request(); // Retry once
    }

    if (error.status === 429) {
      // Rate limit - exponential backoff
      throw new Error("KIS API 요청 한도 초과. 잠시 후 다시 시도합니다.");
    }

    if (error.status === 403) {
      throw new Error("KIS API 일일 할당량 초과. 내일 다시 시도해주세요.");
    }

    throw error;
  }
}
```

## Error Communication Strategy

Errors must be communicated to the agent in a way that enables intelligent recovery.

### 1. Structured Error Objects

```typescript
interface ToolError {
  tool_name: string;
  error_type: ErrorType;
  message: string; // User-facing Korean message
  details: string; // Technical details for logging
  recoverable: boolean;
  suggested_action?: string; // What the agent should try next
}

type ErrorType =
  | "rate_limit"
  | "quota_exceeded"
  | "no_data"
  | "invalid_input"
  | "authentication"
  | "network"
  | "maintenance"
  | "unknown";

function createToolError(
  toolName: string,
  type: ErrorType,
  message: string,
  details: string,
  recoverable: boolean = true,
  suggestedAction?: string
): ToolError {
  return {
    tool_name: toolName,
    error_type: type,
    message,
    details,
    recoverable,
    suggested_action: suggestedAction
  };
}
```

### 2. Agent-Facing Error Messages

Errors returned to agent should be actionable in Korean:

```typescript
// Good: Actionable Korean message
{
  error: "OpenDART에서 삼성전자의 2024년 1분기 데이터를 찾을 수 없습니다. 반기 데이터나 연간 데이터를 요청해보세요.",
  suggested_action: "Try requesting H1 or annual data instead"
}

// Bad: Generic technical error
{
  error: "HTTP 200 status 013"
}
```

### 3. Error Severity Levels

| Level | When to Use | Agent Action |
|-------|-------------|--------------|
| **Warning** | Partial data, used fallback | Continue with caveat |
| **Error** | Tool failed, retry possible | Try alternative tool or parameters |
| **Fatal** | Unrecoverable, config issue | Stop, notify user |

```typescript
interface ToolResult {
  success: boolean;
  data?: any;
  error?: ToolError;
  warnings?: string[]; // Non-blocking issues
}

// Example: Consolidated data unavailable, fell back to separate
{
  success: true,
  data: { /* separate statement data */ },
  warnings: [
    "연결재무제표를 찾을 수 없어 별도재무제표를 사용했습니다. 지주회사의 경우 별도재무제표는 실제 영업 실적을 반영하지 않을 수 있습니다."
  ]
}
```

## Graceful Degradation Strategies

### 1. OpenDART → Web Search Fallback

If OpenDART fails completely (maintenance, quota exceeded):

```typescript
async function getCompanyFinancials(corpCode: string, year: string) {
  try {
    return await opendart.getFinancialStatements(corpCode, year, "11011", "CFS");
  } catch (error) {
    if (error.error_type === "quota_exceeded" || error.error_type === "maintenance") {
      console.warn("[Degradation] OpenDART unavailable, trying web search");

      return {
        success: false,
        error: createToolError(
          "getFinancialStatements",
          error.error_type,
          "OpenDART 서비스를 일시적으로 사용할 수 없습니다. 웹 검색을 통해 대략적인 정보를 제공할 수 있습니다.",
          error.details,
          true,
          "Use web_search for approximate financial data from news/reports"
        )
      };
    }
    throw error;
  }
}
```

### 2. KIS → Cached Data Fallback

If KIS is unavailable (market closed, API down), use cached prices:

```typescript
async function getCurrentPrice(ticker: string) {
  const cacheKey = `kis:price:${ticker}`;
  const cached = await cache.get(cacheKey);

  try {
    const livePrice = await kis.inquirePrice(ticker);
    await cache.set(cacheKey, livePrice, 1000); // 1 second TTL
    return { success: true, data: livePrice, cached: false };
  } catch (error) {
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const ageMinutes = Math.floor(age / 60000);

      return {
        success: true,
        data: cached.data,
        cached: true,
        warnings: [
          `실시간 시세를 가져올 수 없어 ${ageMinutes}분 전 캐시 데이터를 사용합니다. 시장이 종료되었거나 API에 일시적인 문제가 있을 수 있습니다.`
        ]
      };
    }

    throw error; // No fallback available
  }
}
```

### 3. Consolidated → Separate Fallback

If consolidated statements unavailable, try separate (see [[phase-2-core/15-consolidated|Issue #15]]):

```typescript
async function getFinancialStatements(
  corpCode: string,
  year: string,
  reportCode: string,
  preferredFsDiv: "CFS" | "OFS" = "CFS"
) {
  try {
    const result = await opendart.fnlttSinglAcnt(corpCode, year, reportCode, preferredFsDiv);

    if (isOpenDartError(result) && result.status === "013") {
      // No data - try fallback
      const fallbackFsDiv = preferredFsDiv === "CFS" ? "OFS" : "CFS";
      console.log(`[Fallback] ${preferredFsDiv} not available, trying ${fallbackFsDiv}`);

      const fallbackResult = await opendart.fnlttSinglAcnt(corpCode, year, reportCode, fallbackFsDiv);

      if (isOpenDartError(fallbackResult)) {
        throw parseOpenDartError(fallbackResult);
      }

      return {
        success: true,
        data: fallbackResult,
        warnings: [
          `${preferredFsDiv === "CFS" ? "연결" : "별도"}재무제표를 찾을 수 없어 ${fallbackFsDiv === "CFS" ? "연결" : "별도"}재무제표를 사용했습니다.`
        ]
      };
    }

    return { success: true, data: result };
  } catch (error) {
    throw error;
  }
}
```

## Retry Logic with Exponential Backoff

For transient errors (network issues, 500s):

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break; // No more retries
      }

      // Don't retry non-transient errors
      if (
        error.error_type === "authentication" ||
        error.error_type === "invalid_input" ||
        error.error_type === "quota_exceeded"
      ) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
```

## Rate Limit Warnings

Warn the agent BEFORE hitting rate limits:

```typescript
class RateLimitTracker {
  private dailyQuota = 10000; // OpenDART daily limit
  private requestCount = 0;
  private lastReset = Date.now();

  trackRequest() {
    // Reset counter at midnight KST
    const now = Date.now();
    if (now - this.lastReset > 24 * 60 * 60 * 1000) {
      this.requestCount = 0;
      this.lastReset = now;
    }

    this.requestCount++;

    // Warn at 80% quota
    if (this.requestCount >= this.dailyQuota * 0.8) {
      console.warn(
        `[OpenDART] Daily quota at ${Math.round((this.requestCount / this.dailyQuota) * 100)}%`
      );

      return {
        warning: `OpenDART 일일 할당량의 ${Math.round((this.requestCount / this.dailyQuota) * 100)}%를 사용했습니다. 요청을 신중하게 사용해주세요.`
      };
    }

    return null;
  }
}
```

## User-Facing Error Messages (Korean)

All errors presented to the end user MUST be in clear Korean:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  // OpenDART
  opendart_no_data: "요청하신 기간의 데이터를 찾을 수 없습니다. 다른 기간을 시도해보세요.",
  opendart_invalid_corp: "회사 코드를 찾을 수 없습니다. 회사명이나 종목코드를 확인해주세요.",
  opendart_quota: "OpenDART API 일일 할당량을 초과했습니다. 내일 다시 시도해주세요.",
  opendart_maintenance: "OpenDART 서비스가 점검 중입니다. 잠시 후 다시 시도해주세요.",

  // KIS
  kis_token_expired: "KIS API 인증 토큰이 만료되었습니다. 자동으로 갱신 중입니다...",
  kis_market_closed: "현재 시장이 마감되었습니다. 가장 최근 종가 데이터를 제공합니다.",
  kis_invalid_ticker: "종목코드를 찾을 수 없습니다. 6자리 종목코드를 확인해주세요.",
  kis_quota: "KIS API 일일 할당량을 초과했습니다. 내일 다시 시도해주세요.",

  // General
  network_error: "네트워크 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.",
  unknown_error: "예상치 못한 오류가 발생했습니다. 관리자에게 문의해주세요."
};
```

## Implementation Tasks

1. **Create Error Types & Utilities**
   - Define `ToolError` interface
   - Implement `createToolError()` helper
   - Define Korean error message constants

2. **OpenDART Error Handling**
   - Implement `isOpenDartError()` and `parseOpenDartError()`
   - Add rate limit tracking
   - Implement consolidated → separate fallback
   - Add retry logic for transient errors

3. **KIS Error Handling**
   - Implement OAuth token auto-refresh on 401
   - Add market hours detection
   - Implement cached data fallback
   - Add retry logic for transient errors

4. **Graceful Degradation**
   - OpenDART → web search fallback
   - KIS → cached data fallback
   - Clear warning messages to agent

5. **Testing**
   - Unit tests for error parsing
   - Integration tests simulating API failures
   - Test retry logic with mock delays
   - Test fallback strategies

6. **Monitoring**
   - Log all errors with context
   - Track error rates by type
   - Alert on quota warnings (>80%)
   - Dashboard for API health

## Success Criteria

- [ ] OpenDART errors are parsed and returned in Korean
- [ ] KIS OAuth token auto-refreshes on expiry
- [ ] Rate limit warnings appear at 80% quota
- [ ] Consolidated → separate fallback works automatically
- [ ] Retry logic works for network errors (max 3 attempts)
- [ ] Cached data is used when live data unavailable (with clear warning)
- [ ] All user-facing errors are in Korean
- [ ] Agent receives actionable error messages with suggested actions

## Testing Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| OpenDART returns status "013" | Parse error, return Korean message, suggest alternative |
| OpenDART maintenance (503) | Retry with backoff, eventually suggest web_search |
| KIS token expired (401) | Auto-refresh token, retry request once |
| Market closed outside hours | Return cached price with timestamp and warning |
| Daily quota exceeded | Stop requests, return cached data only, notify user |
| Invalid corp_code | Return clear error, suggest corp_code_resolver |
| Network timeout | Retry 3x with exponential backoff, then fail with Korean message |

## References

- OpenDART API Docs: Error code reference
- KIS API Docs: OAuth token lifecycle
- [[phase-2-core/06-opendart|OpenDART Client]]
- [[phase-2-core/08-kis|KIS Client]]
- [[phase-2-core/15-consolidated|Consolidated vs Separate]]
