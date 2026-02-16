---
title: "Demo Mode with Cached Data"
issue: 19
phase: 4-polish
priority: high
status: planned
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-2-core/07-prompts]]"
  - "[[phase-2-core/08-formatter]]"
blocks: []
tags: [ux, onboarding, demo, cache]
estimated_effort: large
---

# Demo Mode with Cached Data

## Objective

Implement a zero-config demo mode that allows users to try Korean Dexter without API keys or Korean brokerage accounts, using pre-recorded data for 5-10 popular companies.

## Problem Statement

Current onboarding is brutal:
- **OpenDART API key**: Requires registration at opendart.fss.or.kr
- **KIS API key**: Requires Korean brokerage account + app registration
- **Korean identity verification**: Foreign users cannot access KIS

Result: 90%+ bounce rate before even trying the agent.

## Solution

Demo mode with pre-recorded API responses for popular companies. Users can test the agent immediately, see value, then decide whether to invest in API registration.

## Demo Companies

Select 5-10 most-searched Korean stocks:

| Company | Ticker | Rationale |
|---------|--------|-----------|
| 삼성전자 | 005930 | #1 market cap, global recognition |
| SK하이닉스 | 000660 | #2 semiconductor, volatile |
| 현대차 | 005380 | Traditional industry, EV transition |
| 카카오 | 035720 | Tech platform, retail investor favorite |
| 네이버 | 035420 | Tech platform, search dominance |
| LG에너지솔루션 | 373220 | Battery, growth story |
| 삼성바이오로직스 | 207940 | Biotech |
| 포스코홀딩스 | 005490 | Steel, cyclical |

## Pre-recorded Data

For each company, cache:

```
/demo-data/
  2025-01-15/  # date stamp
    samsung-electronics/
      corp-code.json          # Corp code resolution
      financials-2024.json    # Annual financials
      financials-2023.json    # Previous year for comparison
      stock-price-daily.json  # Recent 90 days
      stock-price-minute.json # Intraday for last 5 days
      disclosures.json        # Recent 30 days
      shareholders.json       # Major shareholders
      investor-flow.json      # Foreign/institutional flows
    sk-hynix/
      ...
```

## Activation

### Environment Variable

```bash
DEMO_MODE=true bun run cli "삼성전자 2024년 매출은?"
```

### CLI Flag

```bash
bun run cli --demo "삼성전자 2024년 매출은?"
```

### Automatic Detection

If API keys missing, prompt:

```
⚠️  API keys not found.

Try demo mode with pre-loaded data? [Y/n]
> Y

✓ Demo mode activated (data from 2025-01-15)
  Available companies: 삼성전자, SK하이닉스, 현대차, 카카오, 네이버
```

## Demo Mode UX

### Clear Labeling

Every response shows:

```
🎭 DEMO MODE — Using cached data from 2025-01-15
```

### Limitations Message

On startup:

```
Demo mode limitations:
• Data frozen at 2025-01-15
• Only 8 companies available
• No custom queries to DART/KIS APIs

For live data, register for API keys:
  OpenDART: https://opendart.fss.or.kr/
  KIS: https://www.koreainvestment.com/
```

### Pre-loaded Questions

Show sample questions on startup:

```
Try these questions:
  1. 삼성전자 2024년 매출은?
  2. 삼성전자 vs SK하이닉스 영업이익률 비교
  3. 카카오 최근 주가 흐름
  4. 네이버 최대주주는?
```

## Implementation

### Demo Data Loader

```typescript
class DemoDataLoader {
  private cache: Map<string, any> = new Map();
  private demoDate: string = '2025-01-15';

  constructor() {
    this.loadDemoData();
  }

  private loadDemoData(): void {
    const demoDir = path.join(__dirname, '..', 'demo-data', this.demoDate);
    // Load all JSON files into cache
    // Key format: "{company}/{dataType}"
  }

  getCorpCode(companyName: string): string | null {
    const key = `${companyName}/corp-code`;
    return this.cache.get(key);
  }

  getFinancials(company: string, year: number): any {
    const key = `${company}/financials-${year}`;
    return this.cache.get(key);
  }

  getStockPrice(company: string, period: 'daily' | 'minute'): any {
    const key = `${company}/stock-price-${period}`;
    return this.cache.get(key);
  }

  // ... other getters
}
```

### API Client Wrapper

```typescript
class DARTClientWrapper {
  private realClient: DARTClient;
  private demoLoader: DemoDataLoader;
  private isDemoMode: boolean;

  constructor(apiKey?: string) {
    this.isDemoMode = !apiKey || process.env.DEMO_MODE === 'true';
    if (this.isDemoMode) {
      this.demoLoader = new DemoDataLoader();
    } else {
      this.realClient = new DARTClient(apiKey);
    }
  }

  async getFinancials(corpCode: string, year: number): Promise<any> {
    if (this.isDemoMode) {
      // Map corpCode back to company name
      const company = this.getCompanyFromCorpCode(corpCode);
      return this.demoLoader.getFinancials(company, year);
    }
    return this.realClient.getFinancials(corpCode, year);
  }

  // ... wrapper for all methods
}
```

### Demo Company Detection

```typescript
const DEMO_COMPANIES = [
  { name: '삼성전자', ticker: '005930', corpCode: '00126380' },
  { name: 'SK하이닉스', ticker: '000660', corpCode: '00164779' },
  // ... others
];

function isDemoCompany(query: string): boolean {
  return DEMO_COMPANIES.some(c =>
    query.includes(c.name) || query.includes(c.ticker)
  );
}
```

## Demo Data Recording

Script to capture real API responses:

```bash
bun run record-demo-data --date 2025-01-15 --companies samsung,skhynix,hyundai,kakao,naver
```

```typescript
async function recordDemoData(date: string, companies: string[]) {
  const dartClient = new DARTClient(process.env.OPENDART_API_KEY!);
  const kisClient = new KISClient(/* ... */);

  for (const company of companies) {
    const corpCode = await dartClient.resolveCorpCode(company);

    // Record corp code resolution
    await saveJSON(`${company}/corp-code.json`, corpCode);

    // Record financials for last 2 years
    const fin2024 = await dartClient.getFinancials(corpCode, 2024);
    await saveJSON(`${company}/financials-2024.json`, fin2024);

    const fin2023 = await dartClient.getFinancials(corpCode, 2023);
    await saveJSON(`${company}/financials-2023.json`, fin2023);

    // Record stock prices
    const dailyPrices = await kisClient.getDailyPrices(ticker, 90);
    await saveJSON(`${company}/stock-price-daily.json`, dailyPrices);

    // Record disclosures
    const disclosures = await dartClient.getDisclosures(corpCode, 30);
    await saveJSON(`${company}/disclosures.json`, disclosures);

    // ... other data
  }
}
```

## Fallback Behavior

If user asks about a company NOT in demo data:

```
🎭 DEMO MODE

"LG전자" is not available in demo mode.

Available companies:
  • 삼성전자  • SK하이닉스  • 현대차
  • 카카오    • 네이버      • LG에너지솔루션
  • 삼성바이오로직스  • 포스코홀딩스

For live data on all companies, register for API keys.
```

## Testing

### Manual Test Cases

1. Start with no API keys → should auto-prompt for demo mode
2. Query demo company → should return cached data
3. Query non-demo company → should show limitation message
4. Check labeling → every response shows "DEMO MODE" badge
5. Exit and restart → demo mode persists if env var set

### Automated Tests

```typescript
describe('DemoMode', () => {
  it('should load cached data for demo companies', () => {
    const loader = new DemoDataLoader();
    const financials = loader.getFinancials('삼성전자', 2024);
    expect(financials).toBeDefined();
    expect(financials.revenue).toBeGreaterThan(0);
  });

  it('should return null for non-demo companies', () => {
    const loader = new DemoDataLoader();
    const corpCode = loader.getCorpCode('LG전자');
    expect(corpCode).toBeNull();
  });

  it('should show demo mode label in responses', () => {
    const agent = new Agent({ demoMode: true });
    const response = agent.query('삼성전자 2024년 매출은?');
    expect(response).toContain('🎭 DEMO MODE');
  });
});
```

## Implementation Steps

### 1. Demo Data Recording (Week 8, Day 1)

- [ ] Implement `record-demo-data` script
- [ ] Record data for 8 companies
- [ ] Verify data completeness
- [ ] Version with date stamp (2025-01-15)

### 2. Demo Data Loader (Week 8, Day 2)

- [ ] Implement `DemoDataLoader` class
- [ ] Load all JSON files on init
- [ ] Implement getter methods for each data type
- [ ] Test data access

### 3. API Client Wrappers (Week 8, Days 3-4)

- [ ] Wrap `DARTClient` with demo mode detection
- [ ] Wrap `KISClient` with demo mode detection
- [ ] Implement fallback messages for non-demo companies
- [ ] Test both demo and live modes

### 4. UX Polish (Week 8, Day 5)

- [ ] Add demo mode labeling to all responses
- [ ] Implement auto-prompt for demo mode
- [ ] Add pre-loaded sample questions
- [ ] Add limitations message on startup

### 5. Documentation (Week 8, Day 5)

- [ ] Document demo mode activation
- [ ] Document limitations
- [ ] Document how to transition to live mode

## Acceptance Criteria

- [ ] Demo mode works with zero API keys
- [ ] All 8 companies have complete cached data
- [ ] `DEMO_MODE=true` and `--demo` both work
- [ ] Auto-prompt for demo mode when keys missing
- [ ] Clear labeling on all responses
- [ ] Fallback message for non-demo companies
- [ ] Pre-loaded sample questions on startup
- [ ] Documentation complete

## Dependencies

- [[phase-2-core/07-prompts|#7 Korean Prompts]] — working agent
- [[phase-2-core/08-formatter|#8 Korean Financial Formatter]] — consistent output
- [[phase-1-foundation/09-dart|#9 DART Client]] — to record demo data
- [[phase-1-foundation/11-kis|#11 KIS Client]] — to record demo data

## Related Risks

- [[risks#api-key-barriers|API key registration barriers]] — directly mitigated
- [[risks#demo-data-stale|Demo data staleness]] — refresh quarterly

## Future Enhancements

- Demo data refresh automation (quarterly cron job)
- Expand to 15-20 companies based on user requests
- Demo mode analytics (which companies users query most)
- Seamless upgrade path from demo to live mode

## Notes

- Demo data can be repurposed as eval fixtures for [[phase-3-eval/12-eval-dataset|#12]]
- Demo mode is the primary user acquisition strategy
- Data freshness matters less in demo mode — users understand it's a preview
