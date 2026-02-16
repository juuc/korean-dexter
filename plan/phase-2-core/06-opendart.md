---
title: "OpenDART API Client & Financial Statement Tools"
issue: 6
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
  - "[[phase-2-core/09-account-mapper|AccountMapper]]"
  - "[[phase-2-core/15-consolidated|Consolidated vs Separate]]"
  - "[[phase-2-core/07-prompts|Korean Prompts]]"
tags: [api, financial-data, opendart, core]
estimated_effort: xlarge
---

# OpenDART API Client & Financial Statement Tools

OpenDART (opendart.fss.or.kr) is the backbone of Korean Dexter. All financial statements, disclosures, shareholding data come from this single source. This is the most critical and complex API client in the system.

## Background

OpenDART is Korea's DART (Data Analysis, Retrieval and Transfer System) API, provided by the Financial Supervisory Service (FSS). It exposes:
- Financial statements (K-IFRS, key accounts and full XBRL)
- Corporate disclosures (공시)
- Major shareholder information
- Executive information
- Dividend history
- Auditor opinions

**Authentication**: Query parameter `crtfc_key` (get from opendart.fss.or.kr)

**Base URL**: `https://opendart.fss.or.kr/api/`

## API Endpoints

### Tier 1 (MVP - Must Implement)

| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `fnlttSinglAcnt.json` | Key financial accounts (~15-20 items) | corp_code, bsns_year, reprt_code, fs_div |
| `fnlttSinglAcntAll.json` | Full XBRL line items (60-100+ items) | corp_code, bsns_year, reprt_code, fs_div |
| `list.json` | Disclosure search | corp_code, bgn_de, end_de, pblntf_ty |
| `company.json` | Company overview | corp_code |
| `fnlttSinglIndx.json` | Pre-calculated financial ratios | corp_code, bsns_year, reprt_code |

### Tier 2 (Post-MVP)

- `alotMatter.json` — Dividend information
- `hyslrSttus.json` — Major shareholders
- `hyslrChgSttus.json` — Shareholder changes
- `exctvSttus.json` — Executive information
- `accnutAdtorNmNdAdtOpinion.json` — Auditor opinion

## Critical Implementation Details

### 1. Consolidated vs Separate Financial Statements

Korean companies publish TWO sets of financial statements:
- **Consolidated (연결, CFS)**: Parent + subsidiaries
- **Separate (별도, OFS)**: Parent company only

**Parameter**: `fs_div` = "CFS" | "OFS"

**RULE**: ALWAYS request CFS first. If CFS returns empty/no data, fall back to OFS. NEVER silently mix CFS and OFS in the same analysis.

```typescript
interface FinancialStatementRequest {
  corp_code: string;
  bsns_year: string; // "2024"
  reprt_code: string; // "11011" = annual
  fs_div: "CFS" | "OFS";
}

// Always include fs_div in response metadata
interface FinancialStatementResponse {
  accounts: FinancialAccount[];
  metadata: {
    corp_code: string;
    corp_name: string;
    bsns_year: string;
    reprt_code: string;
    fs_div: "CFS" | "OFS"; // CRITICAL
  };
}
```

### 2. Report Period Codes

| Code | Korean | English | Notes |
|------|--------|---------|-------|
| 11013 | 1분기보고서 | Q1 | Jan-Mar |
| 11012 | 반기보고서 | H1 | Jan-Jun |
| 11014 | 3분기보고서 | Q3 | Jan-Sep |
| 11011 | 사업보고서 | Annual | Full year |

**Critical**: Quarterly amounts can be:
- **Cumulative YTD** for income statement items (Q3 revenue = Jan-Sep total)
- **Point-in-time** for balance sheet items (Q3 assets = value on Sep 30)

### 3. Amount Parsing

OpenDART returns amounts as **strings** with:
- Commas: `"1,234,567,890"`
- Negatives: `"-1,234,567"`
- **Empty strings**: `""` (NOT `"0"`, NOT `null`)

**Empty string means NO DATA, not zero.** This is critical for logic.

```typescript
function parseDartAmount(value: string): number | null {
  if (value === "" || value === null || value === undefined) {
    return null; // No data available
  }

  // Remove commas, parse as number
  const cleaned = value.replace(/,/g, "");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}
```

### 4. Rate Limiting

Embed rate limiting directly in the OpenDART client:
- **2 requests/second** (conservative, API limit is likely higher)
- **60 requests/minute**
- **Daily quota**: ~10,000 requests (track and warn at 80%)

Use the RateLimiter built in [[phase-1-foundation/10-rate-limiter|Issue #10]].

### 5. Caching Strategy

Use the Cache built in [[phase-1-foundation/11-cache|Issue #11]].

**Cache Key**: `opendart:{corp_code}:{bsns_year}:{reprt_code}:{fs_div}`

**TTL**:
- Current year data: **7 days** (may be amended)
- Prior year data: **permanent** (immutable historical data)

```typescript
function getCacheTTL(bsns_year: string): number {
  const currentYear = new Date().getFullYear();
  const dataYear = parseInt(bsns_year, 10);

  if (dataYear < currentYear) {
    return Infinity; // Never expires
  } else {
    return 7 * 24 * 60 * 60 * 1000; // 7 days
  }
}
```

## Two-Layer Tool Architecture

Follow Dexter's pattern: create a **meta-tool** that uses an inner LLM call to route to atomic sub-tools.

### Meta-Tool: korean_financial_search

```typescript
{
  name: "korean_financial_search",
  description: `Search Korean financial data from OpenDART.
    Can fetch: financial statements (key accounts or full XBRL),
    company info, disclosures, pre-calculated ratios.
    Always prefer consolidated (연결) statements unless explicitly requested otherwise.`,
  parameters: {
    query: "Natural language query in Korean or English",
    corp_code: "8-digit OpenDART corp_code (required)",
    year: "Fiscal year (optional, defaults to latest)",
    period: "annual | Q1 | Q2 | Q3 (optional, defaults to annual)"
  }
}
```

**Inner LLM routing logic**:
1. Parse user query
2. Determine which sub-tools to call (can be multiple in parallel)
3. Execute sub-tools with appropriate parameters
4. Consolidate results and return to agent

### Sub-Tools

```typescript
// Tier 1 - MVP
getFinancialStatements(corp_code, bsns_year, reprt_code, fs_div = "CFS")
getFullFinancialStatements(corp_code, bsns_year, reprt_code, fs_div = "CFS")
getDisclosures(corp_code, bgn_de, end_de, pblntf_ty?)
getCompanyInfo(corp_code)
getFinancialIndicators(corp_code, bsns_year, reprt_code)

// Tier 2 - Post-MVP
getDividendInfo(corp_code, bsns_year)
getMajorShareholders(corp_code, bsns_year)
getShareholderChanges(corp_code, bsns_year)
getExecutiveInfo(corp_code, bsns_year)
getAuditorOpinion(corp_code, bsns_year, reprt_code)
```

## Implementation Tasks

1. **Base HTTP Client**
   - Create `src/clients/opendart.ts`
   - Auth via `crtfc_key` query parameter
   - Embed RateLimiter and Cache
   - Error handling (see [[phase-2-core/14-error-handling|Issue #14]])

2. **Implement Tier 1 Sub-Tools**
   - `getFinancialStatements()` — fnlttSinglAcnt
   - `getFullFinancialStatements()` — fnlttSinglAcntAll
   - `getDisclosures()` — list
   - `getCompanyInfo()` — company
   - `getFinancialIndicators()` — fnlttSinglIndx

3. **Consolidated/Separate Fallback Logic**
   - Try CFS first
   - If empty response, retry with OFS
   - Include `fs_div` in metadata
   - Log when fallback occurs

4. **Amount Parsing**
   - Implement `parseDartAmount()`
   - Handle commas, negatives, empty strings
   - Unit tests for edge cases

5. **Meta-Tool Routing**
   - Create `korean_financial_search` meta-tool
   - Inner LLM prompt for routing
   - Execute selected sub-tools in parallel
   - Consolidate results

6. **Unit Tests**
   - Mock responses with realistic Korean data
   - Test amount parsing edge cases
   - Test CFS/OFS fallback
   - Test cache key generation and TTL

7. **Integration Test**
   - "Get Samsung Electronics (005930) 2024 annual revenue"
   - Should resolve corp_code, fetch CFS, parse amount, return in 억원

## Success Criteria

- [ ] Can fetch Samsung 2024 annual key accounts (CFS)
- [ ] Can fetch Samsung 2024 annual full XBRL (CFS)
- [ ] Can fetch Samsung recent disclosures (past 30 days)
- [ ] CFS/OFS fallback works (test with company that has OFS only)
- [ ] Empty string amounts return `null`, not `0`
- [ ] Rate limiter prevents API throttling
- [ ] Cache hits for repeat requests
- [ ] Integration test passes

## References

- OpenDART API Docs: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001
- K-IFRS Account Names: See [[phase-2-core/09-account-mapper|Issue #9]]
- Consolidated Logic: See [[phase-2-core/15-consolidated|Issue #15]]
