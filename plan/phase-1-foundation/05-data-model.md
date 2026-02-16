---
title: "Cross-API Data Model"
issue: 5
phase: 1-foundation
priority: critical
status: done
type: infra
created: 2026-02-16
depends_on: ["[[phase-1-foundation/03-scaffold]]"]
blocks: ["[[phase-1-foundation/04-corp-resolver]]", "[[phase-2-core/06-opendart]]", "[[phase-2-core/08-kis]]"]
tags: [infra, data-model, types]
estimated_effort: large
---

# Issue #5: Cross-API Data Model

## Problem

OpenDART and KIS API use different identifiers and data formats. We need a unified data model that bridges these APIs and provides Korean-native formatting.

## Core Types

### 1. ResolvedCompany

**Purpose**: Unified company identity across APIs.

OpenDART uses `corp_code` (8 digits), KIS uses `stock_code` (6 digits). Tools need both.

```typescript
// src/shared/types.ts

export type ResolvedCompany = {
  /** OpenDART corp_code (8 digits, e.g., "00126380") */
  corpCode: string;

  /** Company name in Korean (e.g., "삼성전자") */
  corpName: string;

  /** KRX stock code (6 digits, e.g., "005930") - optional for unlisted companies */
  stockCode?: string;

  /** CEO name */
  ceoName?: string;

  /** Industry code from DART */
  indutyCode?: string;

  /** Establishment date (YYYYMMDD) */
  estDate?: string;

  /** Market: "KOSPI" | "KOSDAQ" | "KONEX" | "NONE" (unlisted) */
  market?: "KOSPI" | "KOSDAQ" | "KONEX" | "NONE";
};
```

**Usage**:
```typescript
const company = await corpCodeResolver.resolve("삼성전자");
// { corpCode: "00126380", corpName: "삼성전자", stockCode: "005930", market: "KOSPI" }

// Pass to OpenDART
const financials = await dartClient.getFinancialStatement(company.corpCode, ...);

// Pass to KIS
const price = await kisClient.getStockPrice(company.stockCode, ...);
```

---

### 2. NormalizedAmount

**Purpose**: Korean financial amounts with proper scale formatting.

Korean financial reporting uses 조원/억원/만원 scales, NEVER raw WON for large amounts.

```typescript
// src/shared/types.ts

export type NormalizedAmount = {
  /** Raw value in WON */
  raw: number;

  /** Formatted with Korean scale (조원/억원/만원) */
  formatted: string;

  /** Scale used: "trillion" | "hundredMillion" | "tenThousand" | "won" */
  scale: "trillion" | "hundredMillion" | "tenThousand" | "won";
};
```

**Formatting Rules**:
- `>= 1,000,000,000,000` (1조) → `"X.X조원"`
- `>= 100,000,000` (1억) → `"X,XXX억원"`
- `>= 10,000` (1만) → `"X만원"`
- `< 10,000` → `"X원"`

**Example**:
```typescript
const revenue: NormalizedAmount = {
  raw: 302231000000000,  // 302조 2310억
  formatted: "302.2조원",
  scale: "trillion"
};
```

---

### 3. PeriodRange

**Purpose**: Fiscal year and quarter handling across different year-end companies.

Samsung (Dec year-end) vs Shinhan Financial (Mar year-end) require different period logic.

```typescript
// src/shared/types.ts

export type PeriodRange = {
  /** Fiscal year (e.g., 2023) */
  year: number;

  /** Quarter (1-4) - omit for annual reports */
  quarter?: 1 | 2 | 3 | 4;

  /**
   * OpenDART report code:
   * - 11011: Annual (사업보고서)
   * - 11012: Semi-annual (반기보고서)
   * - 11013: Q1 (1분기보고서)
   * - 11014: Q3 (3분기보고서)
   */
  reportCode: "11011" | "11012" | "11013" | "11014";

  /**
   * Financial statement division:
   * - CFS: Consolidated (연결)
   * - OFS: Separate (별도)
   */
  fsDiv: "CFS" | "OFS";

  /** Human-readable label (e.g., "2023년 연결 연간") */
  periodLabel: string;
};
```

**Usage**:
```typescript
const period: PeriodRange = {
  year: 2023,
  quarter: undefined,  // Annual
  reportCode: "11011",
  fsDiv: "CFS",
  periodLabel: "2023년 연결 연간"
};
```

**Note**: OpenDART has no Q2/Q4 reports (uses semi-annual and annual instead). Q2 data = semi-annual, Q4 data = annual.

---

### 4. KoreanFinancialFormatter

**Purpose**: Utility class for formatting Korean financial data.

```typescript
// src/shared/formatter.ts

export class KoreanFinancialFormatter {
  /**
   * Format amount with Korean scale
   * @param amount - Raw amount in WON
   * @param decimalPlaces - Decimal precision (default: 1 for 조원, 0 for 억원)
   */
  static formatAmount(amount: number, decimalPlaces?: number): NormalizedAmount {
    const absAmount = Math.abs(amount);

    if (absAmount >= 1_000_000_000_000) {
      // 조원 (trillion)
      const value = amount / 1_000_000_000_000;
      const precision = decimalPlaces ?? 1;
      return {
        raw: amount,
        formatted: `${value.toFixed(precision)}조원`,
        scale: "trillion"
      };
    } else if (absAmount >= 100_000_000) {
      // 억원 (hundred million)
      const value = amount / 100_000_000;
      const precision = decimalPlaces ?? 0;
      return {
        raw: amount,
        formatted: `${value.toLocaleString('ko-KR')}억원`,
        scale: "hundredMillion"
      };
    } else if (absAmount >= 10_000) {
      // 만원 (ten thousand)
      const value = amount / 10_000;
      return {
        raw: amount,
        formatted: `${value.toLocaleString('ko-KR')}만원`,
        scale: "tenThousand"
      };
    } else {
      // 원
      return {
        raw: amount,
        formatted: `${amount.toLocaleString('ko-KR')}원`,
        scale: "won"
      };
    }
  }

  /**
   * Format period for display
   */
  static formatPeriod(period: PeriodRange): string {
    const fsType = period.fsDiv === "CFS" ? "연결" : "별도";
    const periodType = period.quarter
      ? `${period.quarter}분기`
      : "연간";

    return `${period.year}년 ${fsType} ${periodType}`;
  }

  /**
   * Format ratio as percentage
   * @param ratio - Ratio value (e.g., 0.15 for 15%)
   * @param decimalPlaces - Decimal precision (default: 2)
   */
  static formatRatio(ratio: number, decimalPlaces: number = 2): string {
    return `${(ratio * 100).toFixed(decimalPlaces)}%`;
  }

  /**
   * Format ROE, ROA, profit margin, etc.
   */
  static formatFinancialRatio(
    name: string,
    ratio: number,
    unit: "%" | "배" = "%"
  ): string {
    if (unit === "%") {
      return `${name}: ${this.formatRatio(ratio)}`;
    } else {
      return `${name}: ${ratio.toFixed(2)}배`;
    }
  }
}
```

**Usage Examples**:
```typescript
// Amount formatting
const revenue = KoreanFinancialFormatter.formatAmount(302_231_000_000_000);
// { raw: 302231000000000, formatted: "302.2조원", scale: "trillion" }

const smallAmount = KoreanFinancialFormatter.formatAmount(450_000_000);
// { raw: 450000000, formatted: "4,500억원", scale: "hundredMillion" }

// Period formatting
const periodLabel = KoreanFinancialFormatter.formatPeriod({
  year: 2023,
  reportCode: "11011",
  fsDiv: "CFS",
  periodLabel: ""
});
// "2023년 연결 연간"

// Ratio formatting
const roe = KoreanFinancialFormatter.formatFinancialRatio("ROE", 0.1523);
// "ROE: 15.23%"

const per = KoreanFinancialFormatter.formatFinancialRatio("PER", 12.5, "배");
// "PER: 12.50배"
```

---

## Additional Supporting Types

### AccountMapping

For mapping DART account names to normalized English/Korean labels.

```typescript
// src/mapping/types.ts

export type AccountMapping = {
  /** DART account code (e.g., "ifrs_Revenue") */
  dartCode: string;

  /** Normalized Korean name */
  koreanName: string;

  /** Normalized English name */
  englishName: string;

  /** Category: "income-statement" | "balance-sheet" | "cash-flow" */
  category: "income-statement" | "balance-sheet" | "cash-flow";
};
```

**Example**:
```typescript
const revenueMapping: AccountMapping = {
  dartCode: "ifrs_Revenue",
  koreanName: "매출액",
  englishName: "Revenue",
  category: "income-statement"
};
```

---

## File Structure

```
src/shared/
├── types.ts           # ResolvedCompany, NormalizedAmount, PeriodRange
├── formatter.ts       # KoreanFinancialFormatter class
└── constants.ts       # Scale constants, report codes, etc.

src/mapping/
└── types.ts           # AccountMapping
```

---

## Tasks

1. **Create Core Types**:
   - [ ] Define `ResolvedCompany` in `src/shared/types.ts`
   - [ ] Define `NormalizedAmount` in `src/shared/types.ts`
   - [ ] Define `PeriodRange` in `src/shared/types.ts`

2. **Implement Formatter**:
   - [ ] Create `KoreanFinancialFormatter` class in `src/shared/formatter.ts`
   - [ ] Implement `formatAmount()` with scale logic
   - [ ] Implement `formatPeriod()` for period labels
   - [ ] Implement `formatRatio()` and `formatFinancialRatio()`

3. **Add Constants**:
   - [ ] Create `src/shared/constants.ts` with:
     - Scale thresholds (조, 억, 만)
     - Report code mappings (11011 → "Annual", etc.)
     - FS division mappings (CFS → "연결", OFS → "별도")

4. **Create Mapping Types**:
   - [ ] Define `AccountMapping` in `src/mapping/types.ts`

5. **Write Tests**:
   - [ ] Unit tests for `formatAmount()` with various scales
   - [ ] Test edge cases (zero, negative, very large numbers)
   - [ ] Test period formatting for all report codes
   - [ ] Test ratio formatting with different decimal places

---

## Test Cases

```typescript
// tests/unit/formatter.test.ts

describe("KoreanFinancialFormatter", () => {
  describe("formatAmount", () => {
    it("formats trillion won", () => {
      const result = KoreanFinancialFormatter.formatAmount(302_231_000_000_000);
      expect(result.formatted).toBe("302.2조원");
      expect(result.scale).toBe("trillion");
    });

    it("formats hundred million won", () => {
      const result = KoreanFinancialFormatter.formatAmount(4_500_000_000);
      expect(result.formatted).toBe("4,500억원");
      expect(result.scale).toBe("hundredMillion");
    });

    it("handles negative amounts", () => {
      const result = KoreanFinancialFormatter.formatAmount(-1_500_000_000);
      expect(result.formatted).toBe("-1,500억원");
    });

    it("handles zero", () => {
      const result = KoreanFinancialFormatter.formatAmount(0);
      expect(result.formatted).toBe("0원");
    });
  });

  describe("formatPeriod", () => {
    it("formats annual consolidated period", () => {
      const period: PeriodRange = {
        year: 2023,
        reportCode: "11011",
        fsDiv: "CFS",
        periodLabel: ""
      };
      const result = KoreanFinancialFormatter.formatPeriod(period);
      expect(result).toBe("2023년 연결 연간");
    });

    it("formats quarterly separate period", () => {
      const period: PeriodRange = {
        year: 2023,
        quarter: 3,
        reportCode: "11014",
        fsDiv: "OFS",
        periodLabel: ""
      };
      const result = KoreanFinancialFormatter.formatPeriod(period);
      expect(result).toBe("2023년 별도 3분기");
    });
  });
});
```

---

## Acceptance Criteria

- [ ] All core types defined and documented
- [ ] `KoreanFinancialFormatter` class implemented with all methods
- [ ] Amount formatting handles all scales correctly (조/억/만/원)
- [ ] Negative amounts formatted correctly
- [ ] Period formatting covers all report codes and fsDiv values
- [ ] Unit tests pass for all formatting functions
- [ ] TypeScript strict mode passes with no `any` types
- [ ] Documentation includes usage examples

---

## Deliverables

1. `src/shared/types.ts` - Core data types
2. `src/shared/formatter.ts` - Formatting utilities
3. `src/shared/constants.ts` - Scale and mapping constants
4. `src/mapping/types.ts` - Account mapping types
5. `tests/unit/formatter.test.ts` - Comprehensive unit tests

---

## Timeline

**Effort**: Large (2-3 days including tests)
**Parallelizable**: Partially (can work on types and formatter in parallel with [[phase-1-foundation/10-rate-limiter|rate limiter]] and [[phase-1-foundation/11-cache|cache]])

---

## Dependencies

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] - need project structure

---

## Blocks

- [[phase-1-foundation/04-corp-resolver|Corp Code Resolver]] - uses `ResolvedCompany`
- [[phase-2-core/06-opendart|OpenDART Client]] - uses all types
- [[phase-2-core/08-kis|KIS Client]] - uses `ResolvedCompany`

---

## Notes

- **Korean scale formatting is critical for user experience**. Raw WON numbers (302231000000000) are unreadable.
- **Consolidated vs Separate is a common source of confusion**. Always label clearly.
- **Formatter must handle edge cases**: zero, negative, very large (e.g., Samsung's 400조원+ revenue).
- Consider adding validation: throw error if `stockCode` is not 6 digits, `corpCode` not 8 digits.
