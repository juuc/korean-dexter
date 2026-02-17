---
title: "Handle Consolidated vs Separate Financial Statements"
issue: 15
phase: 2-core
priority: high
status: done
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-2-core/06-opendart|OpenDART Client]]"
tags: [financial-data, consolidated, separate, k-ifrs]
estimated_effort: medium
---

# Handle Consolidated vs Separate Financial Statements

This is a fundamental data selection problem unique to Korean (and most non-US) markets. Korean companies publish TWO sets of financial statements: **Consolidated (연결)** and **Separate (별도)**. Choosing the wrong one or mixing them leads to meaningless analysis.

## The Problem

### What are Consolidated vs Separate Statements?

**Consolidated (연결재무제표, CFS)**:
- Parent company + all subsidiaries combined
- Represents entire corporate group as single economic entity
- Reflects true operating scale and market position
- Required for companies with significant subsidiaries

**Separate (별도재무제표, OFS)**:
- Parent company only, standalone
- Subsidiaries are shown as equity investments, not consolidated
- Does NOT reflect actual business operations for holding companies
- Used for legal/regulatory purposes (dividend calculations, etc.)

### Why This Matters: Samsung Example

**Samsung Electronics 2024 Annual Results** (hypothetical):

| Metric | Consolidated (CFS) | Separate (OFS) | Difference |
|--------|-------------------|----------------|------------|
| Revenue | 302조원 | 180조원 | **67% lower!** |
| Operating Income | 54조원 | 35조원 | **35% lower!** |

**Why?** Consolidated includes Samsung Display, Samsung Biologics, Samsung SDI (subsidiaries). Separate is just Samsung Electronics parent operations.

**Comparing Samsung CFS vs SK Hynix OFS is MEANINGLESS.** You're comparing apples to oranges.

## Korean Regulatory Context

- **K-IFRS Requirement**: Companies with subsidiaries MUST publish consolidated statements
- **Small Caps**: Some companies only publish separate (no significant subsidiaries)
- **Financial Sector**: Banks/insurance often have complex subsidiary structures, consolidated is critical
- **User Queries**: Korean users typically expect consolidated data unless explicitly asking for "별도"

## Implementation Strategy

### 1. Default to Consolidated, Fallback to Separate

```typescript
interface StatementRequest {
  corp_code: string;
  bsns_year: string;
  reprt_code: string;
  fs_div?: "CFS" | "OFS"; // Optional, defaults to CFS
}

async function getFinancialStatements(
  request: StatementRequest
): Promise<FinancialStatementResult> {
  const preferredFsDiv = request.fs_div || "CFS"; // Default: consolidated

  try {
    // Try preferred type first
    const result = await opendart.fnlttSinglAcnt(
      request.corp_code,
      request.bsns_year,
      request.reprt_code,
      preferredFsDiv
    );

    if (isOpenDartError(result) && result.status === "013") {
      // No data - try fallback
      const fallbackFsDiv = preferredFsDiv === "CFS" ? "OFS" : "CFS";

      console.log(
        `[Fallback] ${preferredFsDiv} unavailable for ${request.corp_code}, trying ${fallbackFsDiv}`
      );

      const fallbackResult = await opendart.fnlttSinglAcnt(
        request.corp_code,
        request.bsns_year,
        request.reprt_code,
        fallbackFsDiv
      );

      if (isOpenDartError(fallbackResult)) {
        throw new Error(`No financial data available (tried both CFS and OFS)`);
      }

      return {
        success: true,
        data: normalizeFinancialStatements(fallbackResult.list),
        metadata: {
          corp_code: request.corp_code,
          bsns_year: request.bsns_year,
          reprt_code: request.reprt_code,
          fs_div: fallbackFsDiv, // CRITICAL: record which was used
          used_fallback: true
        },
        warnings: [
          getConsolidatedFallbackWarning(preferredFsDiv, fallbackFsDiv, request.corp_code)
        ]
      };
    }

    return {
      success: true,
      data: normalizeFinancialStatements(result.list),
      metadata: {
        corp_code: request.corp_code,
        bsns_year: request.bsns_year,
        reprt_code: request.reprt_code,
        fs_div: preferredFsDiv,
        used_fallback: false
      }
    };
  } catch (error) {
    throw error;
  }
}
```

### 2. Include fs_div in ALL Response Metadata

EVERY financial data response MUST include which statement type was used:

```typescript
interface FinancialStatementResult {
  success: boolean;
  data: NormalizedFinancialAccount[];
  metadata: {
    corp_code: string;
    corp_name: string;
    bsns_year: string;
    reprt_code: string;
    fs_div: "CFS" | "OFS"; // MANDATORY
    used_fallback: boolean;
  };
  warnings?: string[];
}
```

### 3. Agent Must Track Statement Types Across Queries

When comparing multiple companies, agent must ensure consistency:

```typescript
// In agent prompt / system instructions:
const CONSOLIDATED_POLICY = `
When comparing multiple companies:

1. Check the fs_div for each company's data
2. If ALL companies have CFS → use CFS for all
3. If some have only OFS → decide:
   a) Use OFS for ALL companies (consistent but less representative), OR
   b) Exclude companies without CFS and note the limitation

4. NEVER mix CFS and OFS in the same comparison table

5. If you must mix, show separate sections:
   - "연결재무제표 기준 (Consolidated)": [companies with CFS]
   - "별도재무제표 기준 (Separate)": [companies with OFS only]
   - Explicitly warn: "⚠️ 연결과 별도 재무제표를 혼합하여 비교할 수 없습니다."
`;
```

### 4. Warning Messages for Users

When fallback occurs or mixing is detected, warn the user:

```typescript
function getConsolidatedFallbackWarning(
  requested: "CFS" | "OFS",
  used: "CFS" | "OFS",
  corpCode: string
): string {
  if (requested === "CFS" && used === "OFS") {
    return `⚠️ 연결재무제표를 찾을 수 없어 별도재무제표를 사용했습니다. 이 회사는 자회사가 없거나 연결재무제표를 공시하지 않는 것으로 보입니다. 별도재무제표는 지주회사의 실제 영업 실적을 반영하지 않을 수 있습니다.`;
  }

  if (requested === "OFS" && used === "CFS") {
    return `별도재무제표를 요청했으나 데이터를 찾을 수 없어 연결재무제표를 사용했습니다.`;
  }

  return "";
}

function getMixedStatementWarning(): string {
  return `⚠️ 경고: 비교 대상 기업들이 서로 다른 재무제표 유형(연결/별도)을 사용하고 있습니다. 직접 비교는 의미가 없을 수 있습니다.`;
}
```

### 5. User Intent Detection

Detect when user explicitly requests separate statements:

```typescript
function detectFsDivIntent(query: string): "CFS" | "OFS" | "auto" {
  const lowerQuery = query.toLowerCase();

  // Explicit requests for separate
  if (
    lowerQuery.includes("별도") ||
    lowerQuery.includes("별도재무제표") ||
    lowerQuery.includes("개별재무제표")
  ) {
    return "OFS";
  }

  // Explicit requests for consolidated
  if (
    lowerQuery.includes("연결") ||
    lowerQuery.includes("연결재무제표") ||
    lowerQuery.includes("consolidated")
  ) {
    return "CFS";
  }

  // Default: auto (prefer CFS)
  return "auto";
}
```

## Edge Cases

### 1. Holding Companies

**Challenge**: For pure holding companies (투자회사), separate statements show mostly "investments in subsidiaries", very little operating revenue.

**Example**: Kakao Corp (pure holding), Kakao Bank/Kakao Pay/Kakao Games are subsidiaries.

**Solution**: ALWAYS use consolidated for holding companies. Detect via business type or warn if separate revenue << consolidated revenue.

```typescript
function isProbableHoldingCompany(
  cfsRevenue: number,
  ofsRevenue: number
): boolean {
  // If separate revenue is < 10% of consolidated, likely a holding company
  if (ofsRevenue < cfsRevenue * 0.1) {
    return true;
  }
  return false;
}
```

### 2. Financial Sector (Banks, Insurance)

**Challenge**: Financial companies have unique subsidiary structures. Consolidated is almost always required for meaningful analysis.

**Solution**: Detect financial sector companies (via industry code or company name) and enforce CFS.

```typescript
const FINANCIAL_SECTOR_KEYWORDS = [
  "은행", "금융", "증권", "보험", "카드", "캐피탈", "자산운용"
];

function isFinancialSector(corpName: string): boolean {
  return FINANCIAL_SECTOR_KEYWORDS.some(keyword => corpName.includes(keyword));
}

// In getFinancialStatements():
if (isFinancialSector(corpName) && preferredFsDiv === "OFS") {
  warnings.push(
    "⚠️ 금융기관의 경우 연결재무제표 사용을 권장합니다. 별도재무제표는 영업 실적을 정확히 반영하지 않을 수 있습니다."
  );
}
```

### 3. Small Caps with No Consolidated

**Challenge**: Some small companies don't publish consolidated (no subsidiaries).

**Solution**: Gracefully fall back to separate, note the limitation.

```typescript
// Already handled in fallback logic above
// Key: ALWAYS record which was used in metadata
```

### 4. Fiscal Year Alignment

**Challenge**: Some companies have different fiscal years (Samsung: Dec, Shinhan: Mar).

**Related but Separate Issue**: When comparing across companies with different fiscal years, align to calendar year or clearly label.

```typescript
interface FiscalYearInfo {
  fiscal_year: string; // "2024"
  fiscal_year_end: string; // "2024-12-31" or "2024-03-31"
  calendar_year: string; // "2024" (for alignment)
}

function normalizeFiscalYear(
  bsnsYear: string,
  fiscalYearEnd: string
): FiscalYearInfo {
  // If fiscal year ends in Mar/Jun, it spans two calendar years
  // Example: FY2024 ending Mar 2024 covers Apr 2023 - Mar 2024

  return {
    fiscal_year: bsnsYear,
    fiscal_year_end: fiscalYearEnd,
    calendar_year: bsnsYear // Simplified: use report year
  };
}
```

## Implementation Tasks

1. **Update OpenDART Client**
   - Add `fs_div` parameter to all statement requests (default: "CFS")
   - Implement fallback logic (CFS → OFS or OFS → CFS)
   - Include `fs_div` in response metadata
   - Add warning messages for fallback

2. **Add User Intent Detection**
   - Parse user query for "연결" or "별도" keywords
   - Pass intent to OpenDART client as `fs_div` preference

3. **Implement Consistency Checks**
   - In multi-company queries, collect all `fs_div` values
   - Detect mixed statement types
   - Return warning if mixed

4. **Add Warning Generators**
   - `getConsolidatedFallbackWarning()`
   - `getMixedStatementWarning()`
   - `getHoldingCompanyWarning()` (if separate used for holding company)

5. **Update Agent Prompts**
   - Add consolidated-first policy to system prompt
   - Instruct agent to check `fs_div` metadata
   - Instruct agent to warn users when mixing statement types

6. **Testing**
   - Test Samsung (has both CFS and OFS) → should use CFS by default
   - Test small cap with OFS only → should fall back gracefully
   - Test comparison: Samsung + Hyundai → both CFS, no warning
   - Test comparison: Samsung (CFS) + Small Cap (OFS only) → warning issued
   - Test user query "삼성전자 별도재무제표" → should use OFS

## Success Criteria

- [ ] Default request uses CFS, falls back to OFS if unavailable
- [ ] All responses include `fs_div` in metadata
- [ ] Fallback to OFS generates Korean warning message
- [ ] Multi-company query with mixed statement types generates warning
- [ ] User query "별도" correctly sets `fs_div = "OFS"`
- [ ] Samsung comparison (CFS vs CFS) works without warnings
- [ ] Samsung vs small cap (CFS vs OFS) generates mixed-type warning

## Example Agent Behavior

### Good: Consistent Statement Types

```
User: "삼성전자와 SK하이닉스 2024년 매출 비교해줘"

Agent:
1. Fetch Samsung 2024 CFS → metadata.fs_div = "CFS"
2. Fetch SK Hynix 2024 CFS → metadata.fs_div = "CFS"
3. Both CFS → comparison valid ✓
4. Present table:

| 회사 | 매출 (조원) | 비고 |
|------|-------------|------|
| 삼성전자 | 302.2 | 연결재무제표 |
| SK하이닉스 | 45.8 | 연결재무제표 |
```

### Warning: Mixed Statement Types

```
User: "삼성전자와 XYZ소형주 매출 비교해줘"

Agent:
1. Fetch Samsung 2024 CFS → metadata.fs_div = "CFS"
2. Fetch XYZ 2024 CFS → returns error "013"
3. Fallback to XYZ 2024 OFS → metadata.fs_div = "OFS"
4. Detect mixed types (CFS vs OFS) → issue warning ⚠️

⚠️ 경고: 삼성전자는 연결재무제표, XYZ는 별도재무제표를 사용하여 직접 비교가 어렵습니다.

| 회사 | 매출 (조원) | 재무제표 유형 |
|------|-------------|---------------|
| 삼성전자 | 302.2 | 연결 (CFS) |
| XYZ | 0.8 | 별도 (OFS) |
```

### Explicit User Request for Separate

```
User: "삼성전자 별도재무제표로 순이익 보여줘"

Agent:
1. Detect intent: fs_div = "OFS"
2. Fetch Samsung 2024 OFS → metadata.fs_div = "OFS"
3. Present data with clear label:

삼성전자 2024년 별도재무제표 기준:
- 당기순이익: 180조원

참고: 연결재무제표 기준 당기순이익은 약 302조원입니다.
```

## References

- K-IFRS Consolidated Standards: https://www.kasb.or.kr/
- OpenDART API: [[phase-2-core/06-opendart|Issue #6]]
- Error Handling: [[phase-2-core/14-error-handling|Issue #14]]
- Agent Prompts: [[phase-2-core/07-prompts|Issue #7]]
