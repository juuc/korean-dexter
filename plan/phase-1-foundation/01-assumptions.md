---
title: "Validate 7 Critical Assumptions"
issue: 1
phase: 1-foundation
priority: critical
status: planned
type: research
created: 2026-02-16
depends_on: []
blocks: ["[[phase-1-foundation/03-scaffold]]"]
tags: [research, validation, api-limits]
estimated_effort: medium
---

# Issue #1: Validate 7 Critical Assumptions

## Problem

Before investing weeks in development, we must validate fundamental assumptions about API availability, data quality, LLM capabilities, and international access.

## 7 Assumptions to Validate

### 1. OpenDART Daily API Limit Sufficient

**Assumption**: Free tier ~1000/day is sufficient for MVP usage.

**Validation Steps**:
1. Register for OpenDART API key at https://opendart.fss.or.kr/
2. Test actual API calls and inspect response headers for rate limit info
3. Calculate: 1 agent query = how many DART calls?
   - Example: "삼성전자 2023년 재무제표" = 1 corp lookup + 1 financial statement call = 2 DART calls
   - Complex query with 5 companies + 3 years = 15+ calls
4. Determine: can we serve 50-100 queries/day on free tier?
5. Document certified API key process (공동인증서 required?)

**Expected Outcome**: Document actual rate limits, calculate max queries/day, decide if certification is needed.

**Blocker Risk**: HIGH if free tier insufficient and certification requires Korean residency.

### 2. KIS API Works with Paper Trading Account

**Assumption**: 모의투자 (paper trading) account supports all MVP endpoints.

**Validation Steps**:
1. Register at https://apiportal.koreainvestment.com/
2. Get 모의투자 (APP_KEY, APP_SECRET) credentials
3. Test OAuth2 token flow (`/oauth2/tokenP`)
4. Test key endpoint: 현재가 시세 (stock price)
5. Measure token issuance limits (docs say 1/day, refresh 1/min)
6. Verify mock account works for:
   - Real-time prices
   - Historical OHLCV
   - Investor flow data (외국인/기관 매매)

**Expected Outcome**: Confirm paper account covers MVP scope, document token refresh strategy.

**Blocker Risk**: MEDIUM if paper account has restricted endpoints.

### 3. corpCode.xml Format is Stable

**Assumption**: OpenDART's corp code mapping file is reliable and complete.

**Validation Steps**:
1. Download ZIP from https://opendart.fss.or.kr/api/corpCode.xml
2. Parse XML structure
3. Count total entries (~90,000 expected)
4. Check fields: corp_code (8 digits), corp_name, stock_code (6 digits?), modify_date
5. Cross-reference KOSPI/KOSDAQ coverage:
   - Sample 30 major companies (Samsung, SK, Hyundai, etc.)
   - Verify stock_code field presence and format
6. Check for edge cases: delisted companies, holding companies, subsidiaries

**Expected Outcome**: Document XML schema, confirm stock_code mapping quality, identify gaps.

**Blocker Risk**: MEDIUM if stock_code field is missing or unreliable.

### 4. LLM Reasons Accurately About Korean Financial Data

**Assumption**: Claude/GPT can understand Korean financial statements and reason correctly.

**Validation Steps**:
1. Prepare 20 test questions:
   - "삼성전자 2023년 영업이익은?" (operating profit)
   - "현대차와 기아의 ROE 비교" (ratio comparison)
   - "NAVER 연결재무제표와 별도재무제표 차이" (consolidated vs separate)
   - "SK하이닉스 부채비율 추이" (debt ratio trend)
2. Test models:
   - Claude Opus 4.6
   - Claude Sonnet 4.5
   - GPT-4o
3. Measure:
   - Factual accuracy (can it read Korean numbers correctly?)
   - Consolidated vs Separate confusion rate
   - Scale handling (조원/억원)
   - Financial term understanding (영업이익 vs 당기순이익)
4. Identify systematic failures

**Expected Outcome**: Model comparison matrix, accuracy benchmark, known failure modes.

**Blocker Risk**: LOW (can iterate on prompting) but CRITICAL for MVP quality.

### 5. Dexter's Scratchpad Handles Korean Data Volume

**Assumption**: Scratchpad token pruning works with Korean text (2-3x more verbose than English).

**Validation Steps**:
1. Measure tokenization overhead:
   - Sample OpenDART response (재무제표)
   - Count tokens in Korean vs hypothetical English equivalent
   - Typical Korean financial statement response = ? tokens
2. Test scratchpad with realistic Korean data:
   - Load 5 companies' financial data
   - Simulate multi-turn conversation
   - Check if pruning logic maintains critical context
3. Identify if token counter needs adjustment for Korean

**Expected Outcome**: Confirm scratchpad capacity, adjust pruning strategy if needed.

**Blocker Risk**: LOW (engineering challenge, not a fundamental blocker).

### 6. Non-Korean Users Can Register for APIs

**Assumption**: International users can access OpenDART and KIS APIs.

**Validation Steps**:
1. Test OpenDART registration without Korean resident number (주민등록번호)
2. Test KIS API registration from outside Korea
3. Document requirements:
   - Phone verification?
   - Business registration number (사업자등록번호)?
   - Bank account verification?
4. Identify barriers for international persona

**Expected Outcome**: Document registration requirements, assess international accessibility.

**Blocker Risk**: HIGH if APIs require Korean residency (impacts [[phase-1-foundation/20-user-persona|user persona]] decision).

### 7. Consolidated Financial Statements Available

**Assumption**: Most Korean companies publish consolidated (연결) financial statements, not just separate (별도).

**Validation Steps**:
1. Query 30 diverse companies:
   - 10 large-cap (Samsung, SK, Hyundai, etc.)
   - 10 mid-cap
   - 10 small-cap / KOSDAQ
2. Request with `fs_div=CFS` (consolidated)
3. Measure:
   - Coverage rate (% with consolidated statements)
   - Fallback to `fs_div=OFS` (separate) when needed
4. Document:
   - Which companies only have separate statements?
   - Are holding companies different?

**Expected Outcome**: Confirm consolidated statement coverage, define fallback strategy.

**Blocker Risk**: LOW (can fallback to separate) but affects accuracy for conglomerate analysis.

## Acceptance Criteria

- [ ] All 7 assumptions documented with evidence in `docs/assumptions-validation.md`
- [ ] Each assumption marked: ✅ VALIDATED | ⚠️ NEEDS MITIGATION | ❌ BLOCKER
- [ ] Go/no-go decision per assumption
- [ ] Risk mitigation strategies documented for ⚠️ cases
- [ ] Hard blockers escalated immediately

## Deliverable

`docs/assumptions-validation.md` with structured evidence for each assumption.

## Timeline

**Effort**: Medium (1-2 days)
**Parallelizable**: Yes (can validate all assumptions concurrently)

## Dependencies

None. This is the starting point.

## Blocks

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] — don't start coding until assumptions validated
