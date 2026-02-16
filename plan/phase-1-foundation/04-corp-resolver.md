---
title: "Corp Code Resolver with Jamo-Aware Fuzzy Matching"
issue: 4
phase: 1-foundation
priority: critical
status: planned
type: feature
created: 2026-02-16
depends_on: ["[[phase-1-foundation/03-scaffold]]", "[[phase-1-foundation/05-data-model]]"]
blocks: ["[[phase-2-core/06-opendart]]", "[[phase-2-core/08-kis]]"]
tags: [feature, mapping, fuzzy-match, korean-nlp]
estimated_effort: xlarge
---

# Issue #4: Corp Code Resolver with Jamo-Aware Fuzzy Matching

## Problem

**THE HARDEST PROBLEM IN PHASE 1.**

OpenDART uses 8-digit `corp_code` but users type:
- Ticker symbols: `"005930"`
- Korean names: `"삼성전자"`, `"삼성"`
- Typos: `"삼셩전자"` (ㅅ vs ㅆ)
- English names: `"Samsung Electronics"`

We need fuzzy matching that understands Korean character structure (jamo decomposition).

---

## Types

```typescript
// src/mapping/types.ts

export type CorpMapping = {
  /** 8-digit corp_code from OpenDART */
  corp_code: string;

  /** Company name in Korean */
  corp_name: string;

  /** 6-digit stock code (KRX ticker) - may be empty for unlisted companies */
  stock_code: string;

  /** Last modification date (YYYYMMDD) */
  modify_date: string;
};

export type CorpCodeResult = {
  /** Resolved corp_code */
  corp_code: string;

  /** Resolved company name */
  corp_name: string;

  /** Resolved stock code (if available) */
  stock_code?: string;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Match type */
  matchType: "exact_ticker" | "exact_corpcode" | "exact_name" | "fuzzy_name";

  /** Alternative matches for disambiguation (when confidence < 1.0) */
  alternatives?: CorpCodeResult[];
};
```

---

## Lookup Strategy (Ordered by Specificity)

### 1. Exact Ticker Match (stock_code)

**Input**: `"005930"`, `"000660"`
**Logic**: Direct lookup in stock_code index
**Confidence**: 1.0

```typescript
if (/^\d{6}$/.test(input)) {
  const match = stockCodeIndex.get(input);
  if (match) {
    return { ...match, confidence: 1.0, matchType: "exact_ticker" };
  }
}
```

---

### 2. Exact Corp Code Match

**Input**: `"00126380"`, `"00164779"`
**Logic**: Direct lookup in corp_code index
**Confidence**: 1.0

```typescript
if (/^\d{8}$/.test(input)) {
  const match = corpCodeIndex.get(input);
  if (match) {
    return { ...match, confidence: 1.0, matchType: "exact_corpcode" };
  }
}
```

---

### 3. Exact Korean Name Match

**Input**: `"삼성전자"`, `"SK하이닉스"`
**Logic**: Normalize (lowercase, trim) and lookup in name index
**Confidence**: 1.0

```typescript
const normalized = normalizeKoreanName(input);
const matches = nameIndex.get(normalized);

if (matches && matches.length === 1) {
  return { ...matches[0], confidence: 1.0, matchType: "exact_name" };
} else if (matches && matches.length > 1) {
  // Multiple exact matches (e.g., "삼성" matches multiple companies)
  return {
    ...matches[0],
    confidence: 0.9,
    matchType: "exact_name",
    alternatives: matches.slice(1)
  };
}
```

**Normalization**:
```typescript
function normalizeKoreanName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")  // Remove whitespace
    .replace(/주식회사|㈜/g, "");  // Remove "주식회사", "㈜"
}
```

---

### 4. Fuzzy Korean Name Match (Jamo-Aware)

**Input**: `"삼셩전자"` (typo), `"삼성"` (partial)
**Logic**: Decompose Hangul into jamo, compute Levenshtein distance on jamo sequences
**Confidence**: Similarity score (0.0 - 1.0)

**Why Jamo-Aware**:
- `"삼성전자"` = ㅅ,ㅏ,ㅁ,ㅅ,ㅓ,ㅇ,ㅈ,ㅓ,ㄴ,ㅈ,ㅏ
- `"삼셩전자"` = ㅅ,ㅏ,ㅁ,ㅆ,ㅓ,ㅇ,ㅈ,ㅓ,ㄴ,ㅈ,ㅏ
- 1 jamo difference (ㅅ vs ㅆ) out of 11 = 90.9% similarity
- Character-level Levenshtein: 1 char difference out of 4 = 75% similarity
- **Jamo-aware matching is more forgiving of typos**

**Algorithm**:
```typescript
function jamoAwareFuzzyMatch(
  input: string,
  corpus: CorpMapping[],
  threshold: number = 0.7
): CorpCodeResult[] {
  const inputJamo = decomposeHangul(input);

  const results = corpus.map(company => {
    const targetJamo = decomposeHangul(company.corp_name);
    const similarity = jamoLevenshteinSimilarity(inputJamo, targetJamo);

    return {
      corp_code: company.corp_code,
      corp_name: company.corp_name,
      stock_code: company.stock_code || undefined,
      confidence: similarity,
      matchType: "fuzzy_name" as const
    };
  })
  .filter(r => r.confidence >= threshold)
  .sort((a, b) => b.confidence - a.confidence);

  if (results.length === 0) return [];

  // Return top match + alternatives
  return [{
    ...results[0],
    alternatives: results.slice(1, 6)  // Top 5 alternatives
  }];
}

function decomposeHangul(text: string): string[] {
  // Use hangul-js library
  const Hangul = require('hangul-js');
  return Hangul.disassemble(text, true);  // Decompose into jamo array
}

function jamoLevenshteinSimilarity(a: string[], b: string[]): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - (distance / maxLength);
}

function levenshteinDistance(a: string[], b: string[]): number {
  // Standard Levenshtein algorithm
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  // substitution
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j] + 1       // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
```

---

### 5. English Name Match (Supplementary)

**Input**: `"Samsung"`, `"SK Hynix"`
**Logic**: Maintain supplementary English name mapping
**Confidence**: 1.0 (if exact), fuzzy (if approximate)

```typescript
const englishMapping = new Map<string, string>([
  ["samsung electronics", "00126380"],
  ["sk hynix", "00164779"],
  ["hyundai motor", "00164742"],
  // ... top 100 companies
]);

const normalized = input.toLowerCase().replace(/[^a-z\s]/g, "");
const corpCode = englishMapping.get(normalized);
```

**Note**: This is a manual mapping, maintained for top 100-200 companies only. Not comprehensive.

---

## Cache and Index Management

### Data Source

OpenDART provides `corpCode.xml` as a ZIP file:
- URL: `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={API_KEY}`
- Format: ZIP containing single XML file
- Size: ~90,000 companies
- Update frequency: Daily

### Cache Strategy

```typescript
// src/mapping/corp-code-resolver.ts

export class CorpCodeResolver {
  private corpCodeIndex: Map<string, CorpMapping>;
  private stockCodeIndex: Map<string, CorpMapping>;
  private nameIndex: Map<string, CorpMapping[]>;
  private corpus: CorpMapping[];
  private cacheFile: string = ".cache/corpCode.json";
  private cacheTTL: number = 24 * 60 * 60 * 1000;  // 24 hours

  async initialize(): Promise<void> {
    // Check cache freshness
    if (await this.isCacheValid()) {
      await this.loadFromCache();
    } else {
      await this.downloadAndParse();
      await this.saveToCache();
    }

    this.buildIndices();
  }

  private async isCacheValid(): Promise<boolean> {
    const stats = await fs.stat(this.cacheFile).catch(() => null);
    if (!stats) return false;

    const age = Date.now() - stats.mtimeMs;
    return age < this.cacheTTL;
  }

  private async downloadAndParse(): Promise<void> {
    // 1. Download ZIP from OpenDART
    const response = await fetch(
      `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`
    );
    const buffer = await response.arrayBuffer();

    // 2. Extract ZIP
    const zip = await JSZip.loadAsync(buffer);
    const xmlFile = Object.keys(zip.files)[0];
    const xmlContent = await zip.file(xmlFile)!.async("string");

    // 3. Parse XML
    const parser = new XMLParser();
    const parsed = parser.parse(xmlContent);

    // 4. Extract corp list
    this.corpus = parsed.result.list.map((item: any) => ({
      corp_code: item.corp_code,
      corp_name: item.corp_name,
      stock_code: item.stock_code || "",
      modify_date: item.modify_date
    }));
  }

  private buildIndices(): void {
    this.corpCodeIndex = new Map();
    this.stockCodeIndex = new Map();
    this.nameIndex = new Map();

    for (const company of this.corpus) {
      // Corp code index
      this.corpCodeIndex.set(company.corp_code, company);

      // Stock code index (only if stock_code exists)
      if (company.stock_code) {
        this.stockCodeIndex.set(company.stock_code, company);
      }

      // Name index (normalized)
      const normalized = normalizeKoreanName(company.corp_name);
      if (!this.nameIndex.has(normalized)) {
        this.nameIndex.set(normalized, []);
      }
      this.nameIndex.get(normalized)!.push(company);
    }
  }
}
```

---

## Disambiguation

When multiple candidates match:

```typescript
async resolve(input: string): Promise<CorpCodeResult> {
  const results = await this.findMatches(input);

  if (results.length === 0) {
    throw new Error(`No company found matching: ${input}`);
  }

  if (results.length === 1) {
    return results[0];
  }

  // Multiple matches - return to LLM for disambiguation
  return {
    ...results[0],
    confidence: 0.8,
    alternatives: results.slice(1)
  };
}
```

**LLM Disambiguation Prompt**:
```
User queried: "삼성"

Multiple matches found:
1. 삼성전자 (005930) - confidence: 0.95
2. 삼성SDI (006400) - confidence: 0.85
3. 삼성물산 (028260) - confidence: 0.85
4. 삼성생명 (032830) - confidence: 0.85

Based on the conversation context, which company is most likely?
If unclear, ask the user to clarify.
```

---

## Test Cases

```typescript
// tests/unit/corp-code-resolver.test.ts

describe("CorpCodeResolver", () => {
  let resolver: CorpCodeResolver;

  beforeAll(async () => {
    resolver = new CorpCodeResolver();
    await resolver.initialize();
  });

  describe("Exact ticker match", () => {
    it("resolves Samsung by ticker", async () => {
      const result = await resolver.resolve("005930");
      expect(result.corp_name).toBe("삼성전자");
      expect(result.corp_code).toBe("00126380");
      expect(result.confidence).toBe(1.0);
      expect(result.matchType).toBe("exact_ticker");
    });
  });

  describe("Exact corp_code match", () => {
    it("resolves Samsung by corp_code", async () => {
      const result = await resolver.resolve("00126380");
      expect(result.corp_name).toBe("삼성전자");
      expect(result.confidence).toBe(1.0);
      expect(result.matchType).toBe("exact_corpcode");
    });
  });

  describe("Exact name match", () => {
    it("resolves Samsung by exact Korean name", async () => {
      const result = await resolver.resolve("삼성전자");
      expect(result.corp_code).toBe("00126380");
      expect(result.confidence).toBe(1.0);
      expect(result.matchType).toBe("exact_name");
    });

    it("normalizes company name (removes 주식회사)", async () => {
      const result = await resolver.resolve("주식회사 삼성전자");
      expect(result.corp_code).toBe("00126380");
    });
  });

  describe("Fuzzy name match", () => {
    it("handles typo (ㅅ vs ㅆ)", async () => {
      const result = await resolver.resolve("삼셩전자");
      expect(result.corp_name).toBe("삼성전자");
      expect(result.confidence).toBeGreaterThan(0.85);
      expect(result.matchType).toBe("fuzzy_name");
    });

    it("handles partial name", async () => {
      const result = await resolver.resolve("삼성");
      expect(result.corp_name).toContain("삼성");
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives!.length).toBeGreaterThan(0);
    });
  });

  describe("Edge cases", () => {
    it("throws on non-existent company", async () => {
      await expect(resolver.resolve("존재하지않는회사")).rejects.toThrow();
    });

    it("handles empty input", async () => {
      await expect(resolver.resolve("")).rejects.toThrow();
    });

    it("handles delisted company", async () => {
      // Test with known delisted company
      // Should still resolve if in corpCode.xml
    });
  });

  describe("Performance", () => {
    it("100 exact lookups < 100ms", async () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await resolver.resolve("005930");
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it("fuzzy search across 90K corpus < 500ms", async () => {
      const start = Date.now();
      await resolver.resolve("삼셩");  // Fuzzy match
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
```

---

## Acceptance Criteria

- [ ] CorpCodeResolver class implemented
- [ ] Downloads and caches corpCode.xml from OpenDART
- [ ] Builds three indices: corpCode, stockCode, normalized name
- [ ] Cache TTL set to 24 hours with auto-refresh
- [ ] Exact ticker match works (6-digit stock_code)
- [ ] Exact corp_code match works (8-digit)
- [ ] Exact Korean name match works with normalization
- [ ] Jamo-aware fuzzy matching implemented using hangul-js
- [ ] Returns alternatives for disambiguation when confidence < 1.0
- [ ] All test cases pass (exact, fuzzy, edge cases, performance)
- [ ] 100 exact lookups < 100ms
- [ ] Fuzzy search < 500ms
- [ ] TypeScript strict mode with no `any` types

---

## Deliverables

1. `src/mapping/corp-code-resolver.ts` - Main resolver class
2. `src/mapping/types.ts` - CorpMapping and CorpCodeResult types
3. `src/utils/hangul.ts` - Jamo decomposition utilities
4. `tests/unit/corp-code-resolver.test.ts` - Comprehensive test suite
5. `.cache/corpCode.json` - Cached corp code data (gitignored)

---

## Timeline

**Effort**: X-Large (3-5 days)
**Critical**: This is the hardest piece of Phase 1. Budget extra time.

---

## Dependencies

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] - need project structure
- [[phase-1-foundation/05-data-model|Data Model]] - uses `ResolvedCompany` type

---

## Blocks

- [[phase-2-core/06-opendart|OpenDART Client]] - every DART call needs corp_code resolution
- [[phase-2-core/08-kis|KIS Client]] - needs stock_code from resolver

---

## Notes

- **Jamo-aware fuzzy matching is the innovation**. Other tools use exact match only.
- **Performance matters**: 90K companies, fuzzy search must be < 500ms.
- **Disambiguation to LLM**: Don't try to be too smart, return alternatives and let LLM decide.
- **Cache daily**: corpCode.xml changes infrequently but should stay fresh.
- Consider implementing English name mapping incrementally (start with top 100, expand later).
