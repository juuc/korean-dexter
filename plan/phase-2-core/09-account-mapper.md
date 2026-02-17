---
title: "AccountMapper for K-IFRS Account Name Normalization"
issue: 9
phase: 2-core
priority: critical
status: done
type: feature
created: 2026-02-16
depends_on:
  - "[[phase-2-core/06-opendart|OpenDART Client]]"
tags: [k-ifrs, financial-data, normalization, core]
estimated_effort: large
---

# AccountMapper for K-IFRS Account Name Normalization

OpenDART returns financial statement line items with Korean account names that vary significantly across companies. The same financial concept has 2-5 different Korean names depending on company, industry, and reporting practices. AccountMapper normalizes these variations to canonical concept IDs.

## The Problem

**Example: Revenue**

Different companies report revenue with different Korean names:
- 삼성전자: "매출액"
- 신한지주: "영업수익"
- 현대차: "수익(매출액)"
- SK하이닉스: "매출"
- 포스코: "순매출액"

All mean "revenue" but have different Korean strings. Without normalization, the agent cannot reliably extract revenue across companies.

**This affects every financial metric**: operating income, net income, total assets, equity, liabilities, cash flows, etc.

## Solution: Hardcoded Mapping

Create a hardcoded AccountMapper with ~30-40 key K-IFRS concepts, each with 2-5 Korean name variants.

**Reference**: Python's `dart-fss` library has mature mappings (https://github.com/josw123/dart-fss)

```typescript
interface AccountMapping {
  conceptId: string;           // Canonical ID: "revenue", "operating_income"
  koreanNames: string[];       // List of Korean name variants
  englishName: string;         // English name for output
  category: AccountCategory;   // "income" | "balance" | "cashflow"
  statementType?: string;      // "IS" | "BS" | "CF" (optional)
}

type AccountCategory = "income" | "balance" | "cashflow";

const ACCOUNT_MAPPINGS: AccountMapping[] = [
  {
    conceptId: "revenue",
    koreanNames: ["매출액", "영업수익", "수익(매출액)", "매출", "순매출액"],
    englishName: "Revenue",
    category: "income",
    statementType: "IS"
  },
  {
    conceptId: "operating_income",
    koreanNames: ["영업이익", "영업이익(손실)"],
    englishName: "Operating Income",
    category: "income",
    statementType: "IS"
  },
  {
    conceptId: "net_income",
    koreanNames: [
      "당기순이익",
      "당기순이익(손실)",
      "분기순이익",
      "반기순이익"
    ],
    englishName: "Net Income",
    category: "income",
    statementType: "IS"
  },
  // ... 30-40 more mappings
];
```

## Key K-IFRS Concepts (MVP)

### Income Statement (손익계산서)

| Concept ID | Korean Names | English |
|------------|--------------|---------|
| `revenue` | 매출액, 영업수익, 수익(매출액), 매출, 순매출액 | Revenue |
| `cost_of_sales` | 매출원가, 영업비용 | Cost of Sales |
| `gross_profit` | 매출총이익 | Gross Profit |
| `operating_income` | 영업이익, 영업이익(손실) | Operating Income |
| `operating_expense` | 판매비와관리비, 판매비와일반관리비 | Operating Expense |
| `net_income` | 당기순이익, 당기순이익(손실), 분기순이익 | Net Income |
| `net_income_parent` | 지배기업소유주지분순이익, 지배주주순이익 | Net Income (Parent) |
| `ebitda` | 법인세비용차감전순이익 | EBITDA |
| `interest_expense` | 이자비용, 금융비용 | Interest Expense |
| `interest_income` | 이자수익, 금융수익 | Interest Income |
| `other_income` | 기타수익, 영업외수익 | Other Income |
| `other_expense` | 기타비용, 영업외비용 | Other Expense |
| `income_tax_expense` | 법인세비용 | Income Tax Expense |

### Balance Sheet (재무상태표)

| Concept ID | Korean Names | English |
|------------|--------------|---------|
| `total_assets` | 자산총계 | Total Assets |
| `current_assets` | 유동자산 | Current Assets |
| `non_current_assets` | 비유동자산 | Non-Current Assets |
| `cash_and_equivalents` | 현금및현금성자산 | Cash and Cash Equivalents |
| `trade_receivables` | 매출채권, 매출채권및기타유동채권 | Trade Receivables |
| `inventories` | 재고자산 | Inventories |
| `total_liabilities` | 부채총계 | Total Liabilities |
| `current_liabilities` | 유동부채 | Current Liabilities |
| `non_current_liabilities` | 비유동부채 | Non-Current Liabilities |
| `borrowings` | 차입금, 단기차입금, 장기차입금 | Borrowings |
| `trade_payables` | 매입채무, 매입채무및기타유동채무 | Trade Payables |
| `total_equity` | 자본총계 | Total Equity |
| `equity_parent` | 지배기업소유주지분, 지배주주지분 | Equity (Parent) |
| `retained_earnings` | 이익잉여금 | Retained Earnings |
| `capital_stock` | 자본금 | Capital Stock |

### Cash Flow Statement (현금흐름표)

| Concept ID | Korean Names | English |
|------------|--------------|---------|
| `operating_cash_flow` | 영업활동현금흐름, 영업활동으로인한현금흐름 | Operating Cash Flow |
| `investing_cash_flow` | 투자활동현금흐름, 투자활동으로인한현금흐름 | Investing Cash Flow |
| `financing_cash_flow` | 재무활동현금흐름, 재무활동으로인한현금흐름 | Financing Cash Flow |
| `free_cash_flow` | 잉여현금흐름 | Free Cash Flow |

## Implementation

### 1. Core Mapper Class

```typescript
class AccountMapper {
  private mappings: Map<string, AccountMapping>;

  constructor() {
    this.mappings = new Map();
    this.loadMappings();
  }

  private loadMappings() {
    for (const mapping of ACCOUNT_MAPPINGS) {
      for (const koreanName of mapping.koreanNames) {
        this.mappings.set(koreanName, mapping);
      }
    }
  }

  /**
   * Normalize Korean account name to canonical concept ID
   */
  normalize(koreanName: string): string | null {
    const mapping = this.mappings.get(koreanName);
    return mapping ? mapping.conceptId : null;
  }

  /**
   * Get English name for Korean account name
   */
  toEnglish(koreanName: string): string | null {
    const mapping = this.mappings.get(koreanName);
    return mapping ? mapping.englishName : null;
  }

  /**
   * Get full mapping for concept ID
   */
  getMapping(conceptId: string): AccountMapping | null {
    return ACCOUNT_MAPPINGS.find(m => m.conceptId === conceptId) || null;
  }

  /**
   * Check if Korean name is recognized
   */
  isRecognized(koreanName: string): boolean {
    return this.mappings.has(koreanName);
  }

  /**
   * Get all concepts for a category
   */
  getConceptsByCategory(category: AccountCategory): AccountMapping[] {
    return ACCOUNT_MAPPINGS.filter(m => m.category === category);
  }
}

// Singleton instance
export const accountMapper = new AccountMapper();
```

### 2. Integration with OpenDART Client

```typescript
interface NormalizedFinancialAccount {
  conceptId: string;          // "revenue", "operating_income"
  englishName: string;        // "Revenue"
  koreanName: string;         // Original from API
  amount: number | null;      // Parsed amount
  unit: string;               // "KRW", displayed as 억원/조원
}

function normalizeFinancialStatements(
  rawAccounts: OpenDartAccount[]
): NormalizedFinancialAccount[] {
  return rawAccounts
    .map(account => {
      const conceptId = accountMapper.normalize(account.account_nm);
      if (!conceptId) {
        // Unknown account - log warning, skip or include raw
        console.warn(`Unknown account: ${account.account_nm}`);
        return null;
      }

      return {
        conceptId,
        englishName: accountMapper.toEnglish(account.account_nm)!,
        koreanName: account.account_nm,
        amount: parseDartAmount(account.thstrm_amount),
        unit: "KRW"
      };
    })
    .filter(Boolean);
}
```

### 3. Handling Unmapped Accounts

Not all account names will be in the mapping (edge cases, rare accounts). Strategy:

**Option A**: Skip unmapped accounts (conservative, may lose data)
**Option B**: Include raw Korean name with warning (permissive, may confuse agent)

**Recommended**: Option A for MVP (skip), with logging for future mapping improvements.

```typescript
// Log unknown accounts for mapping improvements
const unknownAccounts = new Set<string>();

function trackUnknownAccount(koreanName: string) {
  if (!accountMapper.isRecognized(koreanName)) {
    unknownAccounts.add(koreanName);
    console.warn(`[AccountMapper] Unknown: ${koreanName}`);
  }
}

// Periodic report of unknown accounts
export function getUnknownAccounts(): string[] {
  return Array.from(unknownAccounts);
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe("AccountMapper", () => {
  it("normalizes revenue variants", () => {
    expect(accountMapper.normalize("매출액")).toBe("revenue");
    expect(accountMapper.normalize("영업수익")).toBe("revenue");
    expect(accountMapper.normalize("순매출액")).toBe("revenue");
  });

  it("converts to English", () => {
    expect(accountMapper.toEnglish("영업이익")).toBe("Operating Income");
    expect(accountMapper.toEnglish("당기순이익")).toBe("Net Income");
  });

  it("returns null for unknown accounts", () => {
    expect(accountMapper.normalize("존재하지않는계정")).toBeNull();
  });

  it("categorizes correctly", () => {
    const incomeAccounts = accountMapper.getConceptsByCategory("income");
    expect(incomeAccounts.length).toBeGreaterThan(0);
    expect(incomeAccounts.every(m => m.category === "income")).toBe(true);
  });
});
```

### 2. Integration Tests with Real Data

```typescript
it("normalizes Samsung 2024 financials", async () => {
  const rawAccounts = await opendart.getFinancialStatements(
    "00126380", // Samsung
    "2024",
    "11011",
    "CFS"
  );

  const normalized = normalizeFinancialStatements(rawAccounts);

  // Should have key accounts
  expect(normalized.find(a => a.conceptId === "revenue")).toBeDefined();
  expect(normalized.find(a => a.conceptId === "operating_income")).toBeDefined();
  expect(normalized.find(a => a.conceptId === "net_income")).toBeDefined();
});
```

## Implementation Tasks

1. **Research K-IFRS Mappings**
   - Study `dart-fss` library mappings
   - Collect real OpenDART responses from 10+ companies (different sectors)
   - Identify most common account name variants

2. **Create ACCOUNT_MAPPINGS Constant**
   - 30-40 key concepts
   - 2-5 Korean variants per concept
   - Categorize by income/balance/cashflow

3. **Implement AccountMapper Class**
   - `normalize()`, `toEnglish()`, `getMapping()`
   - `isRecognized()`, `getConceptsByCategory()`

4. **Integrate with OpenDART Client**
   - Add `normalizeFinancialStatements()` helper
   - Return both raw and normalized accounts
   - Track unknown accounts

5. **Unit Tests**
   - Test each major concept normalization
   - Test category filtering
   - Test unknown account handling

6. **Integration Tests**
   - Test with Samsung, Hyundai, Shinhan (different sectors)
   - Verify key accounts are normalized correctly

7. **Documentation**
   - Document all mapped concepts
   - Explain how to add new mappings
   - List known limitations

## Success Criteria

- [ ] 30-40 key K-IFRS concepts mapped
- [ ] Samsung financials normalize correctly (revenue, operating income, net income)
- [ ] Hyundai financials normalize correctly (different industry)
- [ ] Shinhan financials normalize correctly (financial sector, different account names)
- [ ] Unknown accounts are logged (not silently dropped)
- [ ] Unit tests cover all major concepts
- [ ] Integration tests pass with real API data

## Future Improvements (Post-MVP)

- **Industry-specific mappings**: Financial sector has unique accounts (순이자수익, 비이자수익)
- **Machine learning approach**: Train classifier on labeled data
- **User feedback loop**: Allow users to report mapping errors
- **Fuzzy matching**: Handle typos and minor variations

## References

- `dart-fss` mappings: https://github.com/josw123/dart-fss/blob/main/dart_fss/corp/account.py
- K-IFRS Standards: https://www.kasb.or.kr/
- OpenDART API: See [[phase-2-core/06-opendart|Issue #6]]
