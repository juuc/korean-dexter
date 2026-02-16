---
title: "BOK Economic Statistics Integration (v1.1)"
issue: 16
phase: 4-polish
priority: medium
status: planned
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-1-foundation/03-scaffold]]"
  - "[[phase-1-foundation/10-rate-limiter]]"
blocks: []
tags: [v1.1, bok, macro, economics, api]
estimated_effort: medium
---

# BOK Economic Statistics Integration (v1.1)

## Objective

Integrate Bank of Korea (BOK) ECOS API to provide macro-economic context for company analysis, enabling the agent to reference base rates, exchange rates, GDP, and inflation when reasoning about financial performance.

## Problem Statement

Current agent analyzes companies in isolation without macro context. Real financial analysis requires understanding:
- **Interest rate environment**: "기준금리 인하 환경에서 삼성전자 차입 비용 감소 예상"
- **Currency movements**: "원/달러 환율 상승으로 수출 기업 실적 개선"
- **Economic cycle**: "GDP 성장률 둔화로 소비재 기업 리스크"
- **Inflation pressure**: "CPI 상승으로 원자재 비용 증가"

## BOK ECOS API

### Base URL
```
https://ecos.bok.or.kr/api/
```

### Authentication
API key-based. Registration: https://ecos.bok.or.kr/api/#/

### Key Tables

| Table Code | Description | Frequency | Use Case |
|------------|-------------|-----------|----------|
| 722Y001 | 한국은행 기준금리 | Irregular | Interest rate environment |
| 731Y003 | 주요국 환율 (원/달러) | Daily | Currency exposure analysis |
| 200Y002 | GDP 성장률 | Quarterly | Economic cycle context |
| 021Y126 | 소비자물가지수 (CPI) | Monthly | Inflation pressure |

### API Format

```
GET /StatisticSearch/{API_KEY}/{format}/{language}/{start_date}/{end_date}/{table_code}/{cycle}/{item_code1}/{item_code2}
```

Example:
```bash
# Get base rate for last 12 months
curl "https://ecos.bok.or.kr/api/StatisticSearch/YOUR_KEY/json/kr/20240101/20241231/722Y001/D/0101000"
```

## New Tools

### 1. getBaseInterestRate

```typescript
interface BaseInterestRateTool {
  name: 'get_base_interest_rate';
  description: '한국은행 기준금리를 조회합니다. 금리 환경 분석에 사용.';
  parameters: {
    startDate?: string; // YYYYMMDD, default: 1 year ago
    endDate?: string;   // YYYYMMDD, default: today
  };
  returns: {
    date: string;       // YYYYMMDD
    rate: number;       // percentage, e.g., 3.5
  }[];
}
```

Example usage:
```typescript
const rates = await getBaseInterestRate({
  startDate: '20240101',
  endDate: '20241231'
});
// [{ date: '20240101', rate: 3.5 }, { date: '20240725', rate: 3.5 }, ...]
```

### 2. getExchangeRate

```typescript
interface ExchangeRateTool {
  name: 'get_exchange_rate';
  description: '원/달러 환율을 조회합니다. 수출입 기업 분석에 사용.';
  parameters: {
    startDate?: string; // YYYYMMDD, default: 90 days ago
    endDate?: string;   // YYYYMMDD, default: today
    currency?: string;  // USD (default), EUR, JPY, CNY
  };
  returns: {
    date: string;       // YYYYMMDD
    rate: number;       // KRW per 1 foreign currency
  }[];
}
```

Example usage:
```typescript
const usdKrw = await getExchangeRate({
  startDate: '20240101',
  currency: 'USD'
});
// [{ date: '20240101', rate: 1320.50 }, ...]
```

### 3. getGDPGrowth

```typescript
interface GDPGrowthTool {
  name: 'get_gdp_growth';
  description: 'GDP 성장률을 조회합니다. 경기 사이클 분석에 사용.';
  parameters: {
    startQuarter?: string; // YYYYQN, e.g., "2024Q1", default: 4 quarters ago
    endQuarter?: string;   // YYYYQN, default: latest available
  };
  returns: {
    quarter: string;    // YYYYQN
    growth: number;     // YoY percentage, e.g., 2.3
  }[];
}
```

Example usage:
```typescript
const gdp = await getGDPGrowth({
  startQuarter: '2023Q1',
  endQuarter: '2024Q4'
});
// [{ quarter: '2023Q1', growth: 1.4 }, { quarter: '2023Q2', growth: 0.9 }, ...]
```

### 4. getConsumerPriceIndex

```typescript
interface CPITool {
  name: 'get_consumer_price_index';
  description: '소비자물가지수(CPI)를 조회합니다. 인플레이션 분석에 사용.';
  parameters: {
    startMonth?: string; // YYYYMM, default: 12 months ago
    endMonth?: string;   // YYYYMM, default: latest available
  };
  returns: {
    month: string;      // YYYYMM
    index: number;      // Base 100 (2020=100)
    yoyChange: number;  // Year-over-year percentage change
  }[];
}
```

Example usage:
```typescript
const cpi = await getConsumerPriceIndex({
  startMonth: '202401',
  endMonth: '202412'
});
// [{ month: '202401', index: 110.5, yoyChange: 3.2 }, ...]
```

## Implementation

### BOK Client

```typescript
class BOKClient {
  private apiKey: string;
  private baseUrl = 'https://ecos.bok.or.kr/api';
  private rateLimiter: RateLimiter;

  constructor(apiKey: string, rateLimiter: RateLimiter) {
    this.apiKey = apiKey;
    this.rateLimiter = rateLimiter;
  }

  async getStatistic(
    tableCode: string,
    startDate: string,
    endDate: string,
    itemCode: string
  ): Promise<any[]> {
    await this.rateLimiter.acquire('bok');

    const url = `${this.baseUrl}/StatisticSearch/${this.apiKey}/json/kr/${startDate}/${endDate}/${tableCode}/D/${itemCode}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`BOK API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.StatisticSearch?.row || [];
  }

  async getBaseRate(startDate: string, endDate: string): Promise<any[]> {
    return this.getStatistic('722Y001', startDate, endDate, '0101000');
  }

  async getExchangeRate(
    startDate: string,
    endDate: string,
    currency: string = 'USD'
  ): Promise<any[]> {
    const itemCodes: Record<string, string> = {
      USD: '0000001', // 원/달러
      EUR: '0000002', // 원/유로
      JPY: '0000003', // 원/100엔
      CNY: '0000004', // 원/위안
    };
    return this.getStatistic('731Y003', startDate, endDate, itemCodes[currency]);
  }

  // ... similar methods for GDP, CPI
}
```

### Rate Limiting

BOK API limits (assumed conservative, verify with API docs):
- 100 requests/minute
- 10,000 requests/day

```typescript
// In rate-limiter.ts
const BOK_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 100,
  requestsPerDay: 10000,
  burstAllowance: 10,
};
```

### Caching Strategy

Macro data is relatively stable and historical data is immutable:

| Data Type | Cache Duration | Rationale |
|-----------|----------------|-----------|
| Historical base rate | Permanent | Past rates never change |
| Historical exchange rate | Permanent | Past rates never change |
| Historical GDP | Permanent | GDP revisions are rare |
| Historical CPI | Permanent | CPI revisions are rare |
| Current month data | 1 day | Updated infrequently |

```typescript
class BOKCache {
  async getCached(key: string): Promise<any | null> {
    const cached = await this.cacheStore.get(key);
    if (!cached) return null;

    // Historical data (>30 days old) never expires
    if (this.isHistorical(cached.date)) {
      return cached.value;
    }

    // Current data expires after 1 day
    if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return cached.value;
    }

    return null;
  }
}
```

## System Prompt Integration

Guide the agent when to use macro data:

```markdown
## Macro-Economic Context

You have access to Bank of Korea (BOK) economic statistics:
- Base interest rate (get_base_interest_rate)
- Exchange rates (get_exchange_rate)
- GDP growth (get_gdp_growth)
- Consumer price index (get_consumer_price_index)

Use macro data when:
- Analyzing financial companies (interest rate sensitivity)
- Analyzing exporters (currency exposure)
- Discussing economic cycle impacts
- Assessing inflation pressure on costs

Example reasoning:
"삼성전자의 2024년 실적을 분석합니다. 먼저 환율 추이를 확인하겠습니다."
[calls get_exchange_rate]
"원/달러 환율이 1,300원대에서 1,400원대로 상승했습니다. 삼성전자는 수출 비중이 높아 환율 상승이 실적에 긍정적입니다."
```

## Example Queries

### Query 1: Interest Rate Environment

**User**: "삼성전자 차입금 부담 어때?"

**Agent reasoning**:
1. Get Samsung's debt from financials
2. Get current base rate with `get_base_interest_rate`
3. Analyze interest expense sensitivity

**Response**:
```
삼성전자의 2024년 차입금은 85조원입니다. 한국은행 기준금리가 3.5%로 2023년 대비 0.5%p 인하되었습니다.
이자비용 부담이 연간 약 4,250억원 감소할 것으로 예상됩니다.
```

### Query 2: Currency Impact

**User**: "현대차 환율 영향 분석해줘"

**Agent reasoning**:
1. Get Hyundai's export revenue ratio
2. Get USD/KRW rate trend with `get_exchange_rate`
3. Calculate currency impact

**Response**:
```
현대차의 해외 매출 비중은 78%입니다. 최근 6개월간 원/달러 환율이 1,320원에서 1,380원으로 4.5% 상승했습니다.
환율 상승으로 수출 경쟁력이 개선되어 영업이익률이 약 1.2%p 증가할 것으로 추정됩니다.
```

## Implementation Steps

### 1. BOK Client Implementation (Day 1)

- [ ] Implement `BOKClient` class
- [ ] Implement all 4 statistic methods
- [ ] Add rate limiting
- [ ] Add caching with historical data optimization
- [ ] Write unit tests

### 2. Tool Definitions (Day 2)

- [ ] Define 4 tool schemas for Claude
- [ ] Implement tool handler functions
- [ ] Add error handling
- [ ] Test tool invocations

### 3. System Prompt Updates (Day 3)

- [ ] Add macro data usage guidance
- [ ] Add example reasoning patterns
- [ ] Test agent's macro data usage

### 4. Documentation (Day 3)

- [ ] Document BOK API registration
- [ ] Document tool usage examples
- [ ] Add to README

## Acceptance Criteria

- [ ] All 4 BOK tools work correctly
- [ ] Rate limiting prevents API quota exhaustion
- [ ] Caching reduces redundant API calls
- [ ] Historical data cached permanently
- [ ] System prompt guides appropriate tool usage
- [ ] Agent uses macro data in relevant contexts
- [ ] Documentation complete

## Dependencies

- [[phase-1-foundation/03-scaffold|#3 Fork & Scaffold]] — tool infrastructure
- [[phase-1-foundation/10-rate-limiter|#10 Rate Limiter]] — prevent quota exhaustion

## Testing

### Unit Tests

```typescript
describe('BOKClient', () => {
  it('should fetch base rate history', async () => {
    const client = new BOKClient(apiKey, rateLimiter);
    const rates = await client.getBaseRate('20240101', '20241231');
    expect(rates.length).toBeGreaterThan(0);
    expect(rates[0]).toHaveProperty('date');
    expect(rates[0]).toHaveProperty('rate');
  });

  it('should cache historical data permanently', async () => {
    const cache = new BOKCache();
    const rates = await client.getBaseRate('20230101', '20230131');
    // Second call should use cache
    const ratesCached = await client.getBaseRate('20230101', '20230131');
    expect(cache.hitRate).toBe(1.0);
  });
});
```

### Integration Tests

```typescript
describe('BOK Tools', () => {
  it('should provide macro context in analysis', async () => {
    const agent = new Agent({ tools: [...defaultTools, ...bokTools] });
    const response = await agent.query('삼성전자 차입금 부담은?');
    expect(response).toContain('기준금리');
    expect(response).toContain('%');
  });
});
```

## Related Risks

- [[risks#bok-rate-limit|BOK rate limit exhaustion]] — mitigated by caching
- [[risks#macro-data-stale|Macro data staleness]] — acceptable for historical analysis

## Future Enhancements

- Add more BOK tables (M2 money supply, trade balance)
- Automated macro context injection for relevant queries
- Macro data visualization (rate trend charts)

## Notes

- BOK registration is simpler than DART/KIS — no Korean ID required
- Macro data adds significant analytical depth
- Historical caching dramatically reduces API load
- This is v1.1 feature — not required for MVP
