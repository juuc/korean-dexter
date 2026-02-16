---
title: "KOSIS National Statistics Integration (v1.1)"
issue: 17
phase: 4-polish
priority: medium
status: planned
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-1-foundation/03-scaffold]]"
  - "[[phase-1-foundation/10-rate-limiter]]"
blocks: []
tags: [v1.1, kosis, statistics, industry, api]
estimated_effort: medium
---

# KOSIS National Statistics Integration (v1.1)

## Objective

Integrate KOSIS (Korean Statistical Information Service) to provide industry-level context for company analysis, enabling the agent to reference production indices, sector trends, and employment statistics when reasoning about business performance.

## Problem Statement

Current agent analyzes companies without industry context. Real financial analysis requires understanding:
- **Industry trends**: "반도체 생산지수 20% 증가, SK하이닉스 실적 개선 예상"
- **Sector dynamics**: "자동차 수출 급증, 현대차 수혜"
- **Employment signals**: "IT 고용 증가, 네이버/카카오 채용 확대 시기"
- **Retail sentiment**: "소매판매 감소, 유통 기업 역풍"

## KOSIS API

### Base URL
```
https://kosis.kr/openapi/
```

### Authentication
API key-based. Registration: https://kosis.kr/openapi/

### Challenge: Discovery

KOSIS has **134,586 datasets**. The primary challenge is DISCOVERY — knowing which dataset to query.

**Approach**: Pre-select 10-20 most useful industry-level statistics and create semantic mapping.

## Pre-selected Datasets

| Dataset ID | Description | Frequency | Use Case |
|------------|-------------|-----------|----------|
| 901Y009 | 반도체 생산지수 | Monthly | Samsung, SK Hynix analysis |
| 901Y010 | 자동차 생산/수출 | Monthly | Hyundai, Kia analysis |
| 901Y015 | 소매판매액지수 | Monthly | Retail companies (Lotte, Shinsegae) |
| 901Y001 | 산업생산지수 (전체) | Monthly | General economic activity |
| 136Y001 | 제조업 고용 | Monthly | Labor market pressure |
| 101Y003 | IT 서비스 산업 매출 | Quarterly | Naver, Kakao sector health |
| 902Y015 | 건설수주액 | Monthly | Construction companies |
| 901Y020 | 화학제품 생산지수 | Monthly | LG Chem, SK Innovation |

## New Tool

### getIndustryStats

```typescript
interface IndustryStatsTool {
  name: 'get_industry_stats';
  description: '산업별 통계를 조회합니다. 업종 트렌드 분석에 사용.';
  parameters: {
    industry: IndustryCode; // Semantic codes mapped to KOSIS dataset IDs
    startPeriod?: string;   // YYYYMM or YYYYQN
    endPeriod?: string;     // YYYYMM or YYYYQN
  };
  returns: {
    period: string;         // YYYYMM or YYYYQN
    index: number;          // Production index (base 100)
    yoyChange: number;      // Year-over-year percentage change
    momChange: number;      // Month-over-month percentage change
  }[];
}

type IndustryCode =
  | 'semiconductor'       // 반도체
  | 'automobile'          // 자동차
  | 'retail'              // 소매
  | 'construction'        // 건설
  | 'chemical'            // 화학
  | 'it-service'          // IT서비스
  | 'manufacturing'       // 제조업 전체
  | 'employment-mfg';     // 제조업 고용
```

Example usage:
```typescript
const semiStats = await getIndustryStats({
  industry: 'semiconductor',
  startPeriod: '202401',
  endPeriod: '202412'
});
// [
//   { period: '202401', index: 112.5, yoyChange: 15.2, momChange: 2.1 },
//   { period: '202402', index: 115.3, yoyChange: 18.7, momChange: 2.5 },
//   ...
// ]
```

## Implementation

### Industry Mapping

```typescript
const INDUSTRY_MAPPING: Record<IndustryCode, KOSISDatasetConfig> = {
  semiconductor: {
    datasetId: '901Y009',
    tableName: '반도체 생산지수',
    frequency: 'monthly',
    baseYear: 2020,
  },
  automobile: {
    datasetId: '901Y010',
    tableName: '자동차 생산/수출',
    frequency: 'monthly',
    baseYear: 2020,
  },
  retail: {
    datasetId: '901Y015',
    tableName: '소매판매액지수',
    frequency: 'monthly',
    baseYear: 2020,
  },
  // ... others
};
```

### KOSIS Client

```typescript
class KOSISClient {
  private apiKey: string;
  private baseUrl = 'https://kosis.kr/openapi';
  private rateLimiter: RateLimiter;

  constructor(apiKey: string, rateLimiter: RateLimiter) {
    this.apiKey = apiKey;
    this.rateLimiter = rateLimiter;
  }

  async getStatistic(
    datasetId: string,
    startPeriod: string,
    endPeriod: string
  ): Promise<any[]> {
    await this.rateLimiter.acquire('kosis');

    const url = `${this.baseUrl}/Param/statisticsParameterData.do`;
    const params = new URLSearchParams({
      method: 'getList',
      apiKey: this.apiKey,
      format: 'json',
      jsonVD: 'Y',
      orgId: '101',  // Statistics Korea
      tblId: datasetId,
      prdSe: 'M',    // Monthly
      startPrdDe: startPeriod,
      endPrdDe: endPeriod,
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`KOSIS API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  async getIndustryStats(
    industry: IndustryCode,
    startPeriod: string,
    endPeriod: string
  ): Promise<IndustryStatsResult[]> {
    const config = INDUSTRY_MAPPING[industry];
    if (!config) {
      throw new Error(`Unknown industry: ${industry}`);
    }

    const rawData = await this.getStatistic(
      config.datasetId,
      startPeriod,
      endPeriod
    );

    return this.parseIndustryStats(rawData, config);
  }

  private parseIndustryStats(
    rawData: any[],
    config: KOSISDatasetConfig
  ): IndustryStatsResult[] {
    return rawData.map(row => ({
      period: row.PRD_DE,
      index: parseFloat(row.DT),
      yoyChange: this.calculateYoY(row, rawData),
      momChange: this.calculateMoM(row, rawData),
    }));
  }
}
```

### Company-to-Industry Mapping

LLM-assisted discovery using company context:

```typescript
const COMPANY_TO_INDUSTRY: Record<string, IndustryCode[]> = {
  '삼성전자': ['semiconductor', 'manufacturing'],
  'SK하이닉스': ['semiconductor', 'manufacturing'],
  '현대차': ['automobile', 'manufacturing'],
  '카카오': ['it-service'],
  '네이버': ['it-service'],
  'LG화학': ['chemical', 'manufacturing'],
  '롯데쇼핑': ['retail'],
  // ... others
};

function suggestIndustryStats(companyName: string): IndustryCode[] {
  return COMPANY_TO_INDUSTRY[companyName] || ['manufacturing'];
}
```

### Rate Limiting

KOSIS API limits (conservative estimate, verify with API docs):
- 100 requests/minute
- 5,000 requests/day

```typescript
const KOSIS_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 100,
  requestsPerDay: 5000,
  burstAllowance: 10,
};
```

### Caching Strategy

Industry statistics are relatively stable:

| Data Type | Cache Duration | Rationale |
|-----------|----------------|-----------|
| Historical monthly data (>2 months old) | Permanent | Past indices never change |
| Historical quarterly data (>1 quarter old) | Permanent | Past indices never change |
| Current/recent month | 7 days | Updated mid-month |

## System Prompt Integration

```markdown
## Industry Context

You have access to KOSIS industry statistics via get_industry_stats:

Available industries:
- semiconductor: 반도체 생산지수
- automobile: 자동차 생산/수출
- retail: 소매판매액지수
- it-service: IT서비스 산업
- manufacturing: 제조업 전체
- chemical: 화학제품 생산
- construction: 건설수주액
- employment-mfg: 제조업 고용

Use industry stats when:
- Analyzing sector leaders (Samsung → semiconductor)
- Discussing industry trends
- Comparing company performance to sector average
- Identifying structural headwinds/tailwinds

Example reasoning:
"SK하이닉스의 실적을 분석하기 위해 반도체 업황을 확인하겠습니다."
[calls get_industry_stats({ industry: 'semiconductor' })]
"반도체 생산지수가 전년 대비 18% 증가했습니다. SK하이닉스 매출 증가는 업황 개선에 기인합니다."
```

## Example Queries

### Query 1: Sector Trend

**User**: "SK하이닉스 실적 좋아진 이유는?"

**Agent reasoning**:
1. Get SK Hynix financials
2. Get semiconductor industry stats with `get_industry_stats({ industry: 'semiconductor' })`
3. Correlate company performance with sector trend

**Response**:
```
SK하이닉스의 2024년 매출이 전년 대비 25% 증가했습니다. 같은 기간 반도체 생산지수가 18% 증가하여
업황 개선이 실적 호전의 주요 원인입니다. SK하이닉스는 업황 상승 대비 더 높은 성장률을 기록했습니다.
```

### Query 2: Retail Context

**User**: "롯데쇼핑 주가 왜 떨어졌어?"

**Agent reasoning**:
1. Get Lotte Shopping financials
2. Get retail sales index with `get_industry_stats({ industry: 'retail' })`
3. Identify headwinds

**Response**:
```
소매판매액지수가 최근 3개월간 전년 대비 -2.3% 감소했습니다. 소비 위축으로 유통 업종 전반이 부진합니다.
롯데쇼핑의 매출 감소는 업황 악화에 기인하며, 주가 하락은 펀더멘털을 반영한 것으로 보입니다.
```

## Implementation Steps

### 1. Dataset Selection & Mapping (Day 1)

- [ ] Research KOSIS datasets
- [ ] Select 10-20 most useful industry statistics
- [ ] Create `INDUSTRY_MAPPING` config
- [ ] Create `COMPANY_TO_INDUSTRY` mapping

### 2. KOSIS Client Implementation (Day 2)

- [ ] Implement `KOSISClient` class
- [ ] Implement `getIndustryStats` method
- [ ] Add rate limiting
- [ ] Add caching
- [ ] Write unit tests

### 3. Tool Definition (Day 3)

- [ ] Define `get_industry_stats` tool schema
- [ ] Implement tool handler
- [ ] Add error handling
- [ ] Test tool invocations

### 4. System Prompt Updates (Day 3)

- [ ] Add industry stats usage guidance
- [ ] Add company-to-industry suggestions
- [ ] Test agent's industry context usage

### 5. Documentation (Day 3)

- [ ] Document KOSIS API registration
- [ ] Document available industries
- [ ] Add usage examples to README

## Acceptance Criteria

- [ ] `get_industry_stats` works for all mapped industries
- [ ] Rate limiting prevents quota exhaustion
- [ ] Caching reduces redundant API calls
- [ ] Historical data cached permanently
- [ ] System prompt guides appropriate usage
- [ ] Agent uses industry stats in relevant contexts
- [ ] Company-to-industry mapping covers top 50 companies
- [ ] Documentation complete

## Dependencies

- [[phase-1-foundation/03-scaffold|#3 Fork & Scaffold]] — tool infrastructure
- [[phase-1-foundation/10-rate-limiter|#10 Rate Limiter]] — prevent quota exhaustion

## Testing

### Unit Tests

```typescript
describe('KOSISClient', () => {
  it('should fetch semiconductor production index', async () => {
    const client = new KOSISClient(apiKey, rateLimiter);
    const stats = await client.getIndustryStats('semiconductor', '202401', '202412');
    expect(stats.length).toBeGreaterThan(0);
    expect(stats[0]).toHaveProperty('period');
    expect(stats[0]).toHaveProperty('index');
    expect(stats[0]).toHaveProperty('yoyChange');
  });

  it('should cache historical data permanently', async () => {
    const cache = new KOSISCache();
    const stats = await client.getIndustryStats('automobile', '202301', '202312');
    const statsCached = await client.getIndustryStats('automobile', '202301', '202312');
    expect(cache.hitRate).toBe(1.0);
  });
});
```

### Integration Tests

```typescript
describe('KOSIS Tools', () => {
  it('should provide sector context in analysis', async () => {
    const agent = new Agent({ tools: [...defaultTools, ...kosisTools] });
    const response = await agent.query('SK하이닉스 실적 좋아진 이유는?');
    expect(response).toContain('반도체 생산지수');
    expect(response).toContain('%');
  });

  it('should suggest relevant industries for company', () => {
    const industries = suggestIndustryStats('삼성전자');
    expect(industries).toContain('semiconductor');
  });
});
```

## Related Risks

- [[risks#kosis-discovery|KOSIS discovery challenge]] — mitigated by pre-mapping
- [[risks#kosis-rate-limit|KOSIS rate limit exhaustion]] — mitigated by caching
- [[risks#industry-mismatch|Company-to-industry mapping errors]] — validated through testing

## Future Enhancements

- Expand to 50+ industry datasets based on user queries
- Automated dataset discovery using LLM + KOSIS metadata search
- Industry benchmarking (company vs sector average)
- Visual comparison charts (company performance overlaid on sector index)

## Notes

- Discovery is the hard part — 134K datasets requires careful curation
- Pre-mapping 10-20 industries covers 80% of use cases
- KOSIS registration is straightforward (no Korean ID required)
- This is v1.1 feature — not required for MVP
- Industry context adds significant analytical credibility
