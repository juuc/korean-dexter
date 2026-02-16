---
title: "BigKinds Korean News Search Integration (v1.1)"
issue: 18
phase: 4-polish
priority: medium
status: planned
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-1-foundation/03-scaffold]]"
blocks: []
tags: [v1.1, bigkinds, news, korean, search]
estimated_effort: medium
---

# BigKinds Korean News Search Integration (v1.1)

## Objective

Integrate BigKinds (빅카인즈) Korean news search to provide real-time news context for company analysis, replacing Exa/Tavily which have limited Korean coverage.

## Problem Statement

Current upstream Dexter uses Exa for web search. For Korean Dexter:
- **Exa/Tavily have poor Korean coverage**: Major Korean news sources not indexed
- **Language barrier**: English-first search engines miss Korean financial news
- **Local context missing**: M&A rumors, regulatory changes, earnings announcements only appear in Korean media

## BigKinds Overview

### What is BigKinds?

BigKinds (빅카인즈) is a Korean news big data analysis service from 한국언론진흥재단 (Korea Press Foundation).

- **Coverage**: 54 major Korean media outlets
- **Archive**: News articles from 1990s to present
- **Features**: Search, keyword trends, sentiment analysis, topic clustering
- **Access**: Free tier available, API key required

### Base URL
```
https://tools.kinds.or.kr/
```

### Registration
https://www.bigkinds.or.kr/ (Korean identity verification NOT required for API)

## New Tools

### 1. searchKoreanNews

```typescript
interface SearchKoreanNewsTool {
  name: 'search_korean_news';
  description: '한국 언론사 뉴스를 검색합니다. 기업 공시, M&A, 규제 변화 등을 파악할 때 사용.';
  parameters: {
    query: string;              // Search query in Korean
    dateRange?: {
      start: string;            // YYYY-MM-DD
      end: string;              // YYYY-MM-DD
    };
    category?: NewsCategory;    // Filter by news category
    limit?: number;             // Max results, default 10
  };
  returns: {
    articles: {
      title: string;            // Article headline
      summary: string;          // Article summary
      source: string;           // Media outlet (조선일보, 한국경제, etc.)
      publishedAt: string;      // YYYY-MM-DD HH:mm
      url: string;              // Article URL
      sentiment?: 'positive' | 'negative' | 'neutral';
    }[];
    total: number;              // Total matching articles
  };
}

type NewsCategory =
  | 'economy'      // 경제
  | 'industry'     // 산업
  | 'finance'      // 금융
  | 'stock'        // 증권
  | 'all';         // 전체
```

Example usage:
```typescript
const news = await searchKoreanNews({
  query: '삼성전자 실적',
  dateRange: { start: '2024-10-01', end: '2024-12-31' },
  category: 'economy',
  limit: 10
});
// Returns recent Samsung earnings news from major Korean outlets
```

### 2. getNewsAnalysis

```typescript
interface NewsAnalysisTool {
  name: 'get_news_analysis';
  description: '뉴스 키워드 트렌드와 감성 분석을 제공합니다. 특정 기업/이슈에 대한 언론 분위기 파악에 사용.';
  parameters: {
    query: string;              // Analysis topic
    dateRange: {
      start: string;            // YYYY-MM-DD
      end: string;              // YYYY-MM-DD
    };
  };
  returns: {
    keywords: {
      word: string;             // Keyword
      frequency: number;        // Mention count
      trend: 'rising' | 'falling' | 'stable';
    }[];
    sentiment: {
      positive: number;         // Percentage
      negative: number;         // Percentage
      neutral: number;          // Percentage
    };
    topicClusters: {
      topic: string;            // Topic label (e.g., "반도체 수출 급증")
      articleCount: number;     // Articles in this cluster
    }[];
  };
}
```

Example usage:
```typescript
const analysis = await getNewsAnalysis({
  query: 'SK하이닉스',
  dateRange: { start: '2024-10-01', end: '2024-12-31' }
});
// Returns keyword trends, sentiment breakdown, and topic clusters
```

## Implementation

### BigKinds Client

```typescript
class BigKindsClient {
  private apiKey: string;
  private baseUrl = 'https://tools.kinds.or.kr/api';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchNews(
    query: string,
    dateRange: { start: string; end: string },
    category: NewsCategory = 'all',
    limit: number = 10
  ): Promise<SearchKoreanNewsResult> {
    const params = {
      access_key: this.apiKey,
      argument: {
        query: query,
        published_at: {
          from: dateRange.start,
          until: dateRange.end,
        },
        provider: this.getCategoryProviders(category),
        sort: { date: 'desc' },
        return_from: 0,
        return_size: limit,
      },
    };

    const response = await fetch(`${this.baseUrl}/news/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`BigKinds API error: ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseSearchResults(data);
  }

  async getAnalysis(
    query: string,
    dateRange: { start: string; end: string }
  ): Promise<NewsAnalysisResult> {
    // BigKinds provides built-in analytics via separate endpoint
    const params = {
      access_key: this.apiKey,
      argument: {
        query: query,
        published_at: {
          from: dateRange.start,
          until: dateRange.end,
        },
        analysis: ['keywords', 'sentiment', 'topics'],
      },
    };

    const response = await fetch(`${this.baseUrl}/news/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`BigKinds API error: ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseAnalysisResults(data);
  }

  private getCategoryProviders(category: NewsCategory): string[] {
    const CATEGORY_MAPPING: Record<NewsCategory, string[]> = {
      economy: ['한국경제', '매일경제', '서울경제', '헤럴드경제', '아시아경제'],
      industry: ['전자신문', 'IT조선', '디지털타임스'],
      finance: ['한국경제', '매일경제', '머니투데이', '이데일리'],
      stock: ['한국경제', '매일경제', '이투데이', '파이낸셜뉴스'],
      all: [], // Empty array = all providers
    };
    return CATEGORY_MAPPING[category];
  }

  private parseSearchResults(data: any): SearchKoreanNewsResult {
    return {
      articles: data.documents.map((doc: any) => ({
        title: doc.title,
        summary: doc.content.substring(0, 200) + '...',
        source: doc.provider,
        publishedAt: doc.published_at,
        url: doc.url,
        sentiment: this.detectSentiment(doc.content),
      })),
      total: data.total,
    };
  }

  private detectSentiment(content: string): 'positive' | 'negative' | 'neutral' {
    // BigKinds may provide sentiment, or use simple heuristic
    const positiveWords = ['상승', '증가', '성장', '호조', '개선', '확대'];
    const negativeWords = ['하락', '감소', '부진', '악화', '우려', '위기'];

    const positiveCount = positiveWords.filter(w => content.includes(w)).length;
    const negativeCount = negativeWords.filter(w => content.includes(w)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
}
```

### No Rate Limiting Required

BigKinds typically has generous free tier limits. Monitor and add rate limiting if needed.

### Caching Strategy

News is time-sensitive but historical news never changes:

| Data Type | Cache Duration | Rationale |
|-----------|----------------|-----------|
| News articles >7 days old | Permanent | Historical news immutable |
| News articles <7 days old | 6 hours | Recent news may be updated/corrected |
| News analysis | 24 hours | Analytics updated daily |

## System Prompt Integration

```markdown
## Korean News Context

You have access to BigKinds Korean news search:
- search_korean_news: Search Korean news articles
- get_news_analysis: Get keyword trends, sentiment, topics

Use news search when:
- User asks about recent events (실적 발표, M&A, 규제 변화)
- Investigating price movements without clear fundamental cause
- Understanding market sentiment
- Finding context for disclosure events

Example reasoning:
"삼성전자 주가가 최근 급등한 이유를 파악하기 위해 뉴스를 검색하겠습니다."
[calls search_korean_news({ query: '삼성전자', dateRange: { start: '2024-12-01', end: '2024-12-31' } })]
"최근 삼성전자가 AI 반도체 대규모 수주 소식이 보도되었습니다. 이것이 주가 상승의 촉매로 보입니다."
```

## Example Queries

### Query 1: Price Movement Context

**User**: "삼성전자 주가 왜 올랐어?"

**Agent reasoning**:
1. Get recent stock price from KIS
2. Search news with `search_korean_news` for recent Samsung news
3. Correlate news events with price movement

**Response**:
```
삼성전자 주가가 최근 5일간 8% 상승했습니다. 주요 뉴스를 확인한 결과:
- 12월 15일: "삼성전자, AI 반도체 엔비디아 대량 수주" (한국경제)
- 12월 17일: "삼성전자 HBM3E 양산 성공" (매일경제)
AI 반도체 수주와 HBM 양산 성공이 주가 상승의 주요 원인으로 보입니다.
```

### Query 2: Sentiment Analysis

**User**: "카카오 최근 이슈 뭐야?"

**Agent reasoning**:
1. Get news analysis with `get_news_analysis`
2. Identify top keywords and sentiment
3. Summarize key issues

**Response**:
```
카카오의 최근 30일 뉴스 분석 결과:
- 주요 키워드: "네이버 경쟁", "AI 챗봇", "광고 매출", "주가 하락"
- 감성 분석: 부정 55%, 중립 30%, 긍정 15%
- 주요 이슈: 네이버와의 AI 서비스 경쟁 심화, 광고 매출 둔화 우려

전반적으로 부정적 뉴스가 우세하며, AI 경쟁 및 매출 둔화가 주가 부진의 원인으로 보입니다.
```

## Implementation Steps

### 1. BigKinds Client Implementation (Day 1)

- [ ] Implement `BigKindsClient` class
- [ ] Implement `searchNews` method
- [ ] Implement `getAnalysis` method
- [ ] Add caching with TTL logic
- [ ] Write unit tests

### 2. Tool Definitions (Day 2)

- [ ] Define `search_korean_news` tool schema
- [ ] Define `get_news_analysis` tool schema
- [ ] Implement tool handlers
- [ ] Add error handling
- [ ] Test tool invocations

### 3. System Prompt Updates (Day 3)

- [ ] Add news search usage guidance
- [ ] Add example reasoning patterns
- [ ] Test agent's news context usage

### 4. Documentation (Day 3)

- [ ] Document BigKinds API registration
- [ ] Document tool usage examples
- [ ] Add to README

## Acceptance Criteria

- [ ] `search_korean_news` returns relevant Korean news articles
- [ ] `get_news_analysis` provides keyword trends and sentiment
- [ ] Caching reduces redundant API calls
- [ ] Historical news cached permanently
- [ ] System prompt guides appropriate usage
- [ ] Agent uses news context for price movements and events
- [ ] Documentation complete

## Dependencies

- [[phase-1-foundation/03-scaffold|#3 Fork & Scaffold]] — tool infrastructure

## Testing

### Unit Tests

```typescript
describe('BigKindsClient', () => {
  it('should search Korean news', async () => {
    const client = new BigKindsClient(apiKey);
    const results = await client.searchNews(
      '삼성전자',
      { start: '2024-12-01', end: '2024-12-31' },
      'economy',
      10
    );
    expect(results.articles.length).toBeGreaterThan(0);
    expect(results.articles[0]).toHaveProperty('title');
    expect(results.articles[0]).toHaveProperty('source');
  });

  it('should analyze news sentiment', async () => {
    const client = new BigKindsClient(apiKey);
    const analysis = await client.getAnalysis(
      'SK하이닉스',
      { start: '2024-10-01', end: '2024-12-31' }
    );
    expect(analysis.keywords.length).toBeGreaterThan(0);
    expect(analysis.sentiment).toHaveProperty('positive');
    expect(analysis.sentiment).toHaveProperty('negative');
    expect(analysis.sentiment).toHaveProperty('neutral');
  });

  it('should cache historical news', async () => {
    const cache = new BigKindsCache();
    const results1 = await client.searchNews(
      '삼성전자',
      { start: '2024-01-01', end: '2024-01-31' }
    );
    const results2 = await client.searchNews(
      '삼성전자',
      { start: '2024-01-01', end: '2024-01-31' }
    );
    expect(cache.hitRate).toBe(1.0);
  });
});
```

### Integration Tests

```typescript
describe('BigKinds Tools', () => {
  it('should provide news context for price movements', async () => {
    const agent = new Agent({ tools: [...defaultTools, ...bigkindsTools] });
    const response = await agent.query('삼성전자 주가 왜 올랐어?');
    expect(response).toMatch(/뉴스|보도|발표/);
  });

  it('should analyze sentiment for company', async () => {
    const agent = new Agent({ tools: [...defaultTools, ...bigkindsTools] });
    const response = await agent.query('카카오 최근 이슈는?');
    expect(response).toMatch(/키워드|감성|분석/);
  });
});
```

## Related Risks

- [[risks#news-api-changes|BigKinds API changes]] — monitor API stability
- [[risks#news-paywall|News paywall limitations]] — BigKinds provides summaries, not full text
- [[risks#sentiment-accuracy|Sentiment detection accuracy]] — simple heuristic may misclassify

## Why BigKinds over Exa/Tavily?

| Feature | BigKinds | Exa/Tavily |
|---------|----------|------------|
| Korean coverage | Excellent (54 major outlets) | Poor (limited Korean indexing) |
| Financial news | Strong (경제지 전문) | Generic web search |
| Historical archive | 1990s to present | Limited historical |
| Built-in analytics | Yes (keywords, sentiment) | No |
| Korean language | Native | Translation layer |
| Cost | Free tier available | Paid |

## Future Enhancements

- Real-time alerts for breaking news on watchlist companies
- News-to-stock correlation analysis
- Multi-company comparison (which company has more positive coverage?)
- Automated news summarization using Claude

## Notes

- BigKinds is THE authoritative source for Korean news big data
- Registration is straightforward (no Korean ID required for API)
- This is v1.1 feature — not required for MVP
- News context significantly improves event-driven analysis
- Replaces Exa/Tavily entirely for Korean queries
