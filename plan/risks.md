---
title: "Risk Registry"
status: active
created: 2026-02-16
tags: [risk, cross-cutting]
---

# Risk Registry

Comprehensive risk tracking for Korean Dexter project. Risks identified from ralplan consensus + implementation planning.

## Risk Classification

- **Severity**: CRITICAL (project-blocking), HIGH (major impact), MEDIUM (moderate impact), LOW (minor impact)
- **Likelihood**: CERTAIN (100%), HIGH (>50%), MEDIUM (25-50%), LOW (<25%)
- **Status**: Unvalidated, Designed, Planned, Mitigated, Accepted, Resolved

---

## API & Infrastructure Risks

### 1. OpenDART Rate Limit Exhaustion {#dart-rate-limit}

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Likelihood** | HIGH |
| **Phase** | [[phase-1-foundation/index\|Phase 1]], [[phase-2-core/index\|Phase 2]] |
| **Status** | Designed |

**Description**: OpenDART has strict rate limits (100 req/min, 10K req/day). Naive implementation will exhaust quota quickly, blocking all queries.

**Impact**: Agent becomes unusable during quota exhaustion. Users see "API quota exceeded" errors.

**Mitigation Strategy**:
- Aggressive caching (see [[phase-1-foundation/04-cache\|#4 Cache Layer]])
  - Cache immutable data permanently (prior-year financials, historical disclosures)
  - Cache current-year data for 24 hours
- Request deduplication within 60-second window
- Daily quota display in CLI (`DART: 2,450 / 10,000 requests remaining`)
- Graceful degradation: serve cached data with staleness warning when quota exceeded
- Related: [[phase-1-foundation/10-rate-limiter\|#10 Rate Limiter]]

**Validation Plan**: Load test with 1,000 queries against cached data, verify <100 API calls.

---

### 2. KIS OAuth Token Blocked {#kis-oauth-blocked}

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Designed |

**Description**: KIS access token expires after 24 hours. Concurrent token requests or improper token refresh will trigger account suspension.

**Impact**: Loss of stock price/volume data. Agent cannot answer market-related queries.

**Mitigation Strategy**:
- Singleton auth manager (see [[phase-1-foundation/11-kis\|#11 KIS Client]])
- Disk-persist token with TTL metadata
- File locking to prevent concurrent token refresh
- Token refresh 1 hour before expiration (proactive)
- Never expose token in logs/errors
- Related: [[phase-1-foundation/10-rate-limiter\|#10 Rate Limiter]]

**Validation Plan**: Simulate concurrent agent instances, verify only one token refresh occurs.

---

### 3. BOK Rate Limit Exhaustion {#bok-rate-limit}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | LOW |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: BOK ECOS API has rate limits (assumed 100 req/min, verify). Macro data queries could exhaust quota.

**Impact**: Loss of macro-economic context (interest rates, GDP, CPI).

**Mitigation Strategy**:
- Aggressive caching (see [[phase-4-polish/16-bok\|#16 BOK Integration]])
  - Historical macro data cached permanently
  - Current month data cached for 1 day
- Related: [[phase-1-foundation/10-rate-limiter\|#10 Rate Limiter]]

**Validation Plan**: Monitor BOK API usage in production, tune cache TTL.

---

### 4. KOSIS Rate Limit Exhaustion {#kosis-rate-limit}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | LOW |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: KOSIS API has rate limits (assumed 100 req/min, 5K req/day). Industry stats queries could exhaust quota.

**Impact**: Loss of industry-level context (production indices, sector trends).

**Mitigation Strategy**:
- Aggressive caching (see [[phase-4-polish/17-kosis\|#17 KOSIS Integration]])
  - Historical industry data cached permanently
  - Current month data cached for 7 days
- Pre-select 10-20 datasets to minimize discovery overhead
- Related: [[phase-1-foundation/10-rate-limiter\|#10 Rate Limiter]]

**Validation Plan**: Monitor KOSIS API usage in production, expand dataset mapping as needed.

---

## Data Quality Risks

### 5. Corp Code Resolution Returns Wrong Company {#corp-code-wrong}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | HIGH |
| **Phase** | [[phase-1-foundation/index\|Phase 1]] |
| **Status** | Designed |

**Description**: OpenDART uses 8-digit corp codes, not tickers. Fuzzy name matching ("삼성" matches "삼성전자", "삼성물산", "삼성생명") returns wrong company.

**Impact**: Agent answers questions about Company A using Company B's data. Catastrophic hallucination.

**Mitigation Strategy**:
- Multi-factor resolution (see [[phase-1-foundation/09-dart\|#9 DART Client]]):
  - Corp name fuzzy match with confidence score
  - Stock code verification (if provided)
  - Disambiguate via industry/sector
- User confirmation for ambiguous matches ("Did you mean 삼성전자 or 삼성물산?")
- LLM validates: "Does company name '{resolved}' match user intent '{query}'?"

**Validation Plan**: Test with ambiguous names ("삼성", "현대", "LG"). Verify disambiguation prompts.

---

### 6. K-IFRS Account Name Inconsistency {#kifrs-account-names}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | HIGH |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Designed |

**Description**: DART financial statements use inconsistent account names ("매출액", "영업수익", "수익"). Naive field lookup returns null or wrong value.

**Impact**: Agent cannot find revenue/profit/asset data. Reports "data unavailable" for valid companies.

**Mitigation Strategy**:
- `AccountMapper` with 30+ key metrics (see [[phase-2-core/06-mapper\|#6 Account Mapper]])
- Each metric maps to 2-5 account name variants
- Fallback hierarchy: try variants in order
- Log mapping failures for dataset expansion

**Validation Plan**: Test with 20+ diverse companies (manufacturing, finance, retail). Verify 95%+ mapping success rate.

---

### 7. Korean Number Scale Errors {#korean-number-scale}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Designed |

**Description**: Korean uses 조원 (trillion), 억원 (100M), 만원 (10K) scales. Incorrect conversion produces nonsense answers ("Samsung revenue: 302 trillion won" vs "Samsung revenue: 302조원").

**Impact**: User confusion. Numbers appear incorrect even when mathematically right.

**Mitigation Strategy**:
- `KoreanFinancialFormatter` (see [[phase-2-core/08-formatter\|#8 Korean Financial Formatter]])
- Always use Korean scales (조원/억원/만원) in responses
- Edge case handling:
  - Values <1억: show in 만원 with 1 decimal ("8,500만원")
  - Values ≥1조: show in 조원 with 2 decimals ("302.23조원")
  - Percentages: 1 decimal ("15.2%")
- Never mix scales in same sentence

**Validation Plan**: Test edge cases (negative earnings, very small companies, large conglomerates). Verify formatting consistency.

---

### 8. Fiscal Year Misalignment {#fiscal-year-mismatch}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | HIGH |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Designed |

**Description**: Companies have different fiscal year ends (12/31, 3/31, etc.). "2024 earnings" is ambiguous for March fiscal-year companies.

**Impact**: User asks for "2024" data, agent returns wrong fiscal year. Comparisons are invalid.

**Mitigation Strategy**:
- `PeriodRange` normalization (see [[phase-2-core/06-mapper\|#6 Account Mapper]])
- Always label responses with fiscal period: "2024년 회계연도 (2024.04-2025.03)"
- Detect and warn when comparing companies with different fiscal calendars
- Default to calendar year unless user specifies fiscal period

**Validation Plan**: Test with March fiscal-year companies (e.g., auto manufacturers). Verify correct period labeling.

---

## AI/LLM Risks

### 9. LLM Hallucination of Korean Financial Data {#llm-hallucination}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | HIGH |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Planned |

**Description**: Claude may hallucinate Korean financial data (invented revenue numbers, fake company names) if tools fail or return null.

**Impact**: User trusts hallucinated data. Catastrophic misinformation.

**Mitigation Strategy**:
- System prompt: STRICT tool-use-first policy (see [[phase-2-core/07-prompts\|#7 Korean Prompts]])
  - "NEVER answer financial questions from memory. ALWAYS call tools."
  - "If tool returns null, say 'data unavailable', do NOT guess."
- Validation layer: check if answer contains numbers not present in tool outputs
- Eval dataset includes "data unavailable" cases (see [[phase-3-eval/12-eval-dataset\|#12 Eval Dataset]])

**Validation Plan**: Inject null tool responses, verify agent says "data unavailable" instead of inventing numbers.

---

### 10. Scratchpad Token Overflow (Korean Verbosity) {#scratchpad-overflow}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | HIGH |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Planned |

**Description**: Upstream Dexter's scratchpad threshold (5,000 tokens) is calibrated for English. Korean is 2-3x more verbose (grammatical particles, spacing). Scratchpad overflows earlier, triggering premature answer.

**Impact**: Agent answers before gathering all necessary data. Incomplete analysis.

**Mitigation Strategy**:
- Recalibrate scratchpad threshold for Korean (see [[phase-2-core/07-prompts\|#7 Korean Prompts]])
  - Test threshold: 10,000-15,000 tokens
  - Monitor avg scratchpad length in eval runs
- Compacted scratchpad summaries: "재무 데이터 확보 완료" instead of repeating full JSON
- Tool outputs: return structured data, not verbose natural language

**Validation Plan**: Run eval dataset, measure scratchpad token distribution. Tune threshold to 95th percentile.

---

## Business/Product Risks

### 11. Competitors Already Exist {#competitors-exist}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | CERTAIN |
| **Phase** | [[phase-1-foundation/index\|Phase 1]] |
| **Status** | Acknowledged |

**Description**: Korean market likely has established financial research tools (FnGuide, WiseFn, Bloomberg Korea).

**Impact**: Difficult to acquire users without differentiation.

**Mitigation Strategy**:
- **Differentiate on reasoning, not data access**:
  - Competitors provide data dashboards, not AI reasoning
  - Korean Dexter synthesizes insights ("Why did Samsung's profit margin increase?")
  - Natural language interface (no SQL/dashboard learning curve)
- **Democratize access**:
  - Competitors are expensive (enterprise licenses)
  - Korean Dexter is open-source
- **Demo mode** (see [[phase-4-polish/19-demo-mode\|#19 Demo Mode]]) for zero-friction onboarding

**Validation Plan**: User interviews to identify unmet needs. Iterate on differentiation.

---

### 12. Target User Undefined {#target-user-undefined}

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Likelihood** | Current |
| **Phase** | [[phase-1-foundation/index\|Phase 1]] |
| **Status** | Open |

**Description**: No defined user persona. Building for "retail investors" is too broad (day traders vs long-term value investors have different needs).

**Impact**: Feature creep, unfocused product, user acquisition failure.

**Mitigation Strategy**:
- **Define persona before building** (Week 1):
  - Primary: Individual investor (연봉 5천만원-1억원, 자산 1억-5억원)
  - Use case: Fundamental analysis for 3-12 month holdings
  - Pain point: Information asymmetry vs institutional investors
- **Validate with user interviews**:
  - 5-10 Korean retail investors
  - Ask: "What financial questions do you struggle to answer today?"
- **Constrain scope** to persona's needs

**Validation Plan**: Complete persona definition document by end of Week 1.

---

### 13. API Key Registration Barriers {#api-key-barriers}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | HIGH |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: Onboarding requires 2+ API keys (OpenDART, KIS). KIS requires Korean brokerage account. Foreign users blocked.

**Impact**: 90%+ bounce rate. Users give up before trying the agent.

**Mitigation Strategy**:
- **Demo mode** (see [[phase-4-polish/19-demo-mode\|#19 Demo Mode]]):
  - Zero API keys required
  - Pre-recorded data for 5-10 companies
  - Users see value immediately
  - Clear upgrade path to live data
- **Tiered onboarding**:
  - Step 1: Demo mode (0 effort)
  - Step 2: OpenDART only (basic financials)
  - Step 3: KIS for market data (optional)

**Validation Plan**: Measure demo-to-live conversion rate. Target >20%.

---

## Evaluation Risks

### 14. Eval Dataset Stale Answers {#eval-dataset-stale}

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-3-eval/index\|Phase 3]] |
| **Status** | Planned |

**Description**: Financial data changes (earnings revisions, stock splits, restatements). Eval dataset answers become outdated.

**Impact**: Eval scores decline even if agent improves. False negative signal.

**Mitigation Strategy**:
- **Double verification** (see [[phase-3-eval/12-eval-dataset\|#12 Eval Dataset]]):
  - Author manually verifies answer against DART/KIS web UI
  - Second verifier confirms before adding to dataset
- **Quarterly re-validation**:
  - Re-run dataset questions, verify answers still correct
  - Update stale answers
  - Version dataset with date stamps
- **Fixture replay**: Use dated fixtures, clearly label "Data as of 2025-01-15"

**Validation Plan**: Set calendar reminder for quarterly dataset review.

---

## Technical Debt Risks

### 15. DART Maintenance Windows {#dart-maintenance}

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-2-core/index\|Phase 2]] |
| **Status** | Planned |

**Description**: OpenDART has scheduled maintenance windows (weekends, late night). API returns 503.

**Impact**: Agent fails during maintenance. Users see errors.

**Mitigation Strategy**:
- **Graceful degradation** (see [[phase-1-foundation/09-dart\|#9 DART Client]]):
  - Detect 503 response
  - Serve cached data with staleness warning
  - Message: "DART is under maintenance. Showing cached data from [date]."
- **Cache as fallback**: always serve cached data if API unavailable

**Validation Plan**: Simulate 503 responses, verify graceful fallback.

---

### 16. KOSIS Discovery Challenge {#kosis-discovery}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | HIGH |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: KOSIS has 134,586 datasets. Discovering the right dataset for a query is extremely difficult.

**Impact**: Agent cannot find relevant industry statistics. KOSIS integration underutilized.

**Mitigation Strategy**:
- **Pre-map 10-20 key datasets** (see [[phase-4-polish/17-kosis\|#17 KOSIS Integration]]):
  - Semiconductor production index
  - Auto production/exports
  - Retail sales index
  - Industrial production index
  - Employment by sector
- **Company-to-industry mapping**: suggest datasets based on company
- **LLM-assisted discovery**: Claude reasons about which stats are relevant

**Validation Plan**: User testing with diverse queries. Expand dataset mapping based on gaps.

---

### 17. Company-to-Industry Mapping Errors {#industry-mismatch}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: Hardcoded company-to-industry mapping ("삼성전자" → semiconductor) may be incorrect for conglomerates with diverse businesses.

**Impact**: Agent uses irrelevant industry statistics. Misleading analysis.

**Mitigation Strategy**:
- **Multi-industry mapping** (see [[phase-4-polish/17-kosis\|#17 KOSIS Integration]]):
  - "삼성전자" → [semiconductor, manufacturing]
  - Agent chooses most relevant based on query context
- **Revenue segment data**: Use DART segment reporting to determine primary business
- **LLM reasoning**: Claude selects industry based on query intent

**Validation Plan**: Test conglomerates (Samsung, Hyundai, LG). Verify correct industry selection.

---

### 18. News API Changes {#news-api-changes}

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Likelihood** | LOW |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Planned |

**Description**: BigKinds API may change endpoints, authentication, or data format.

**Impact**: News search breaks. Agent loses event context.

**Mitigation Strategy**:
- **Version pinning**: Use specific API version if available
- **Graceful degradation**: If news API fails, continue with financial data only
- **Monitoring**: Alert on API errors
- **Fallback**: Consider secondary news source (Naver News API)

**Validation Plan**: Monitor BigKinds API stability in production.

---

### 19. Demo Data Staleness {#demo-data-stale}

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Likelihood** | CERTAIN |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Accepted |

**Description**: Demo mode uses cached data. Data becomes stale over time (Q1 2025 data still showing in Q4 2025).

**Impact**: Demo users see outdated data. May not reflect current company situation.

**Mitigation Strategy**:
- **Clear labeling**: "Demo mode — data from 2025-01-15" (see [[phase-4-polish/19-demo-mode\|#19 Demo Mode]])
- **Quarterly refresh**: Update demo data every 3 months
- **Automated refresh script**: `bun run refresh-demo-data`
- **Users understand demo limitations**: Demo is preview, not real-time

**Validation Plan**: Accept risk. Staleness is expected in demo mode.

---

### 20. Sentiment Detection Accuracy {#sentiment-accuracy}

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Accepted |

**Description**: Simple keyword-based sentiment detection (see [[phase-4-polish/18-bigkinds\|#18 BigKinds Integration]]) may misclassify nuanced articles.

**Impact**: Agent reports incorrect sentiment ("positive news" when actually negative).

**Mitigation Strategy**:
- **Use BigKinds built-in sentiment** if available
- **Simple heuristic as fallback**: count positive/negative keywords
- **Hedge in responses**: "뉴스 감성은 대체로 긍정적으로 보입니다" (mostly positive, not definitively)
- **User validation**: show news headlines, let user judge

**Validation Plan**: Manual spot-check sentiment classifications. Accept 70%+ accuracy.

---

### 21. News Paywall Limitations {#news-paywall}

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Likelihood** | MEDIUM |
| **Phase** | [[phase-4-polish/index\|Phase 4]] |
| **Status** | Accepted |

**Description**: BigKinds provides news summaries, not full article text. Paywalled articles have limited content.

**Impact**: Agent cannot extract detailed context from paywalled articles.

**Mitigation Strategy**:
- **Use summaries**: BigKinds summaries are usually sufficient for context
- **Multiple sources**: aggregate insights from multiple articles
- **Accept limitation**: full article access requires premium subscriptions

**Validation Plan**: Accept risk. Summaries are adequate for MVP.

---

## Risk Summary

| Status | Count | Risks |
|--------|-------|-------|
| **Unvalidated** | 1 | #1 |
| **Designed** | 6 | #2, #5, #6, #7, #8, #12 |
| **Planned** | 10 | #3, #4, #9, #10, #13, #14, #15, #16, #17, #18 |
| **Accepted** | 4 | #11, #19, #20, #21 |
| **Open** | 1 | #12 |

### Critical Risks (Immediate Attention Required)

1. [[#target-user-undefined|Target User Undefined]] — MUST define persona in Week 1
2. [[#dart-rate-limit|DART Rate Limit]] — MUST validate caching strategy in Phase 1
3. [[#kis-oauth-blocked|KIS OAuth Token]] — MUST implement singleton auth in Phase 2

### High-Priority Risks (Monitor Closely)

- [[#corp-code-wrong|Corp Code Resolution]]
- [[#kifrs-account-names|K-IFRS Account Names]]
- [[#korean-number-scale|Korean Number Scale]]
- [[#llm-hallucination|LLM Hallucination]]
- [[#scratchpad-overflow|Scratchpad Token Overflow]]

---

## Risk Review Cadence

- **Weekly**: Review CRITICAL and HIGH severity risks
- **Bi-weekly**: Review MEDIUM severity risks
- **Monthly**: Review all risks, update status
- **Post-phase**: Retrospective on phase-specific risks

---

## Risk Escalation

If a risk materializes and mitigation fails:

1. **Document incident**: What happened, impact, root cause
2. **Escalate**: Notify team lead, create GitHub issue
3. **Emergency mitigation**: Implement immediate workaround
4. **Permanent fix**: Design and implement long-term solution
5. **Update risk registry**: Change status to "Mitigated" or "Resolved"

---

*Last updated: 2026-02-16*
