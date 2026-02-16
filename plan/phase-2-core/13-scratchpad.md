---
title: "Recalibrate Scratchpad Token Budget for Korean Data"
issue: 13
phase: 2-core
priority: high
status: planned
type: infra
created: 2026-02-16
depends_on:
  - "[[phase-2-core/07-prompts|Korean Prompts]]"
tags: [performance, optimization, tokens, scratchpad]
estimated_effort: medium
---

# Recalibrate Scratchpad Token Budget for Korean Data

Korean text is **2-3x more tokens than English** for the same semantic content. OpenDART API responses are verbose (Korean account names, company names, corporate governance data). This fundamentally changes the token economics of Dexter's scratchpad.

## The Problem

Dexter's scratchpad manages agent context to prevent exceeding Claude's context window. Current implementation:

```typescript
// Dexter's US market settings
const MAX_CONTEXT_TOKENS = 100_000; // Claude's ~200k context window
const TOOL_RESULT_SUMMARY_THRESHOLD = 5_000; // Summarize if tool result > 5k tokens
const MAX_CALLS_PER_TOOL = 3; // Prevent infinite loops
```

**Why this breaks for Korean:**

1. **Korean tokenization overhead**:
   - English: "Revenue" = 1 token
   - Korean: "매출액" = 2-3 tokens
   - English: "Samsung Electronics" = 2 tokens
   - Korean: "삼성전자주식회사" = 4-6 tokens

2. **OpenDART response verbosity**:
   - Company names are long: "삼성전자주식회사" vs "Samsung"
   - Account names are descriptive: "영업활동으로인한현금흐름" vs "Operating Cash Flow"
   - Full XBRL responses have 60-100+ line items with Korean names

3. **Measured token counts** (estimates):
   - OpenDART `fnlttSinglAcnt` (key accounts): ~3,000-5,000 tokens (English: ~1,500-2,000)
   - OpenDART `fnlttSinglAcntAll` (full XBRL): ~12,000-20,000 tokens (English: ~4,000-6,000)
   - KIS stock price response: ~800-1,200 tokens (English: ~400-600)

**Impact**: Korean Dexter would hit context limits faster, require more aggressive summarization, and potentially lose important details.

## Solution Strategy

### 1. Measure Actual Token Counts

**Before** changing any settings, measure real-world Korean API responses:

```typescript
import Anthropic from "@anthropic-ai/sdk";

async function measureTokenCount(text: string): Promise<number> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.countTokens({
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: text }]
  });
  return response.input_tokens;
}

// Measure real OpenDART responses
const samsungFinancials = await opendart.getFinancialStatements(...);
const tokenCount = await measureTokenCount(JSON.stringify(samsungFinancials));
console.log(`Samsung financials: ${tokenCount} tokens`);
```

**Test cases**:
- Samsung 2024 annual key accounts (fnlttSinglAcnt, CFS)
- Samsung 2024 annual full XBRL (fnlttSinglAcntAll, CFS)
- Samsung recent disclosures (past 30 days)
- Samsung current stock price (KIS)
- Samsung daily prices for 30 days (KIS)

### 2. Adjust Context Threshold

Based on measurements, lower the context threshold to prevent hitting Claude's hard limit:

```typescript
// Korean Dexter settings (AFTER measurement)
const MAX_CONTEXT_TOKENS = 70_000; // Reduced from 100k
// Leaves ~130k tokens for:
// - System prompt (~5-8k tokens in Korean)
// - User query history (~10-20k)
// - Response generation (~50-80k)
// - Safety buffer (~20-30k)
```

**Rationale**: Korean system prompt is longer (K-IFRS knowledge, number formatting rules, domain context), and Korean responses are longer. Need more headroom.

### 3. Implement Tool Result Compaction

Tools should return **structured summaries**, not raw API responses.

**Bad** (raw API dump):
```json
{
  "list": [
    {
      "corp_code": "00126380",
      "corp_name": "삼성전자주식회사",
      "stock_code": "005930",
      "account_nm": "매출액",
      "thstrm_amount": "302,231,438,000,000",
      "frmtrm_amount": "258,706,085,000,000",
      ...
    },
    // 50+ more line items
  ]
}
```

**Good** (structured summary):
```json
{
  "summary": {
    "corp_name": "삼성전자",
    "year": "2024",
    "period": "annual",
    "fs_div": "CFS",
    "key_metrics": {
      "revenue": { "amount": 302.2, "unit": "조원", "yoy_change": "+16.8%" },
      "operating_income": { "amount": 54.3, "unit": "조원", "yoy_change": "+25.4%" },
      "net_income": { "amount": 42.1, "unit": "조원", "yoy_change": "+19.2%" }
    }
  },
  "raw_data_available": true, // Flag that full data exists if needed
  "token_count": 1200 // Include token count for monitoring
}
```

**Token savings**: ~70-80% reduction (20,000 tokens → 4,000 tokens)

**Implementation**:
```typescript
interface CompactToolResult {
  tool_name: string;
  summary: any; // Compact, structured representation
  metadata: {
    timestamp: string;
    token_count: number;
    has_full_data: boolean;
  };
  full_data?: any; // Optional, only if requested
}

function compactFinancialStatements(
  raw: OpenDartResponse
): CompactToolResult {
  const normalized = normalizeFinancialStatements(raw.list);

  // Extract only key metrics
  const keyMetrics = {
    revenue: normalized.find(a => a.conceptId === "revenue"),
    operating_income: normalized.find(a => a.conceptId === "operating_income"),
    net_income: normalized.find(a => a.conceptId === "net_income"),
    total_assets: normalized.find(a => a.conceptId === "total_assets"),
    total_equity: normalized.find(a => a.conceptId === "total_equity")
  };

  return {
    tool_name: "getFinancialStatements",
    summary: {
      corp_name: raw.list[0]?.corp_name?.replace("주식회사", ""),
      year: raw.list[0]?.bsns_year,
      period: mapReportCode(raw.list[0]?.reprt_code),
      fs_div: raw.list[0]?.fs_div,
      key_metrics: formatKeyMetrics(keyMetrics)
    },
    metadata: {
      timestamp: new Date().toISOString(),
      token_count: estimateTokens(keyMetrics), // ~1-2k tokens
      has_full_data: true
    }
    // full_data omitted unless agent explicitly requests it
  };
}
```

### 4. Adjust maxCallsPerTool

Korean financial queries often require multiple data sources:
- "삼성전자 실적과 주가 분석" needs: financials + stock price + investor flows
- "삼성 vs SK하이닉스 비교" needs: 2x financials + 2x stock prices

Dexter's `maxCallsPerTool = 3` might be too restrictive.

**Proposed**:
```typescript
const MAX_CALLS_PER_TOOL = 5; // Increased from 3
// Allow more calls for multi-company or multi-period queries
// Still prevents infinite loops
```

### 5. Intelligent Scratchpad Pruning

Current pruning: oldest tool results are dropped when context limit reached.

**Enhancement**: Prioritize by relevance to current query:

```typescript
interface ScratchpadEntry {
  tool_result: CompactToolResult;
  timestamp: number;
  relevance_score: number; // 0-1, calculated based on query similarity
}

function pruneScratpad(
  entries: ScratchpadEntry[],
  currentQuery: string,
  targetTokens: number
): ScratchpadEntry[] {
  // Calculate relevance scores using embedding similarity
  const scored = entries.map(e => ({
    ...e,
    relevance_score: calculateRelevance(e.tool_result, currentQuery)
  }));

  // Sort by relevance (high to low), then by recency
  scored.sort((a, b) => {
    if (Math.abs(a.relevance_score - b.relevance_score) > 0.1) {
      return b.relevance_score - a.relevance_score;
    }
    return b.timestamp - a.timestamp;
  });

  // Keep highest relevance entries until token budget met
  const kept: ScratchpadEntry[] = [];
  let totalTokens = 0;

  for (const entry of scored) {
    if (totalTokens + entry.tool_result.metadata.token_count <= targetTokens) {
      kept.push(entry);
      totalTokens += entry.tool_result.metadata.token_count;
    }
  }

  return kept;
}
```

## Implementation Tasks

1. **Token Measurement Harness**
   - Create `scripts/measure-tokens.ts`
   - Test cases for typical Korean API responses
   - Measure and log actual token counts
   - Compare with English equivalents (from Dexter)

2. **Update Scratchpad Constants**
   - Based on measurements, set new `MAX_CONTEXT_TOKENS`
   - Adjust `TOOL_RESULT_SUMMARY_THRESHOLD`
   - Update `MAX_CALLS_PER_TOOL`

3. **Implement Tool Result Compaction**
   - Create `compactFinancialStatements()`
   - Create `compactStockData()`
   - Create `compactDisclosures()`
   - Add token count estimation utility
   - Update all tool wrappers to return compact format

4. **Enhance Scratchpad Pruning**
   - Implement relevance scoring (simple keyword matching or embeddings)
   - Update pruning logic to use relevance
   - Add metrics: track how often pruning occurs, what gets dropped

5. **Testing**
   - Simulate context overflow with verbose Korean data
   - Verify compaction reduces tokens by ~70-80%
   - Test multi-company queries (doesn't hit limits)
   - Test that pruning keeps relevant data, drops irrelevant

6. **Monitoring**
   - Log token usage per tool call
   - Log scratchpad size over time
   - Alert if approaching context limit (>90% of MAX_CONTEXT_TOKENS)

## Success Criteria

- [ ] Token measurements completed for all major tool responses
- [ ] Context threshold set based on measurements (likely 60-70k)
- [ ] Tool result compaction implemented and tested
- [ ] Compaction reduces token count by 70%+ for financial statements
- [ ] Multi-company queries (3+ companies) don't hit context limits
- [ ] Scratchpad pruning keeps relevant data, drops old/irrelevant
- [ ] Integration test: complex query with 5+ tool calls completes without context overflow

## Example: Before vs After

**Before** (raw API responses):
```
Query: "삼성전자, SK하이닉스, 현대차 2024년 매출 비교"

Tool calls:
1. getFinancialStatements(Samsung) → 18,000 tokens
2. getFinancialStatements(SK Hynix) → 16,000 tokens
3. getFinancialStatements(Hyundai) → 17,000 tokens

Total: 51,000 tokens (just for 3 tool results!)
+ System prompt: ~8,000 tokens
+ Query history: ~5,000 tokens
= 64,000 tokens (approaching limit quickly)
```

**After** (compact summaries):
```
Query: "삼성전자, SK하이닉스, 현대차 2024년 매출 비교"

Tool calls:
1. getFinancialStatements(Samsung) → 3,500 tokens (compact)
2. getFinancialStatements(SK Hynix) → 3,200 tokens (compact)
3. getFinancialStatements(Hyundai) → 3,400 tokens (compact)

Total: 10,100 tokens (80% reduction!)
+ System prompt: ~8,000 tokens
+ Query history: ~5,000 tokens
= 23,100 tokens (plenty of headroom for more tool calls)
```

## Monitoring Metrics

Track in production:

```typescript
interface TokenMetrics {
  session_id: string;
  timestamp: string;
  query: string;
  tool_calls: {
    tool_name: string;
    raw_tokens: number;
    compact_tokens: number;
    reduction_pct: number;
  }[];
  scratchpad_tokens: number;
  total_context_tokens: number;
  context_usage_pct: number; // % of MAX_CONTEXT_TOKENS
  pruning_occurred: boolean;
}

// Alert if context_usage_pct > 90%
// Log average reduction_pct to validate compaction effectiveness
```

## References

- Dexter's scratchpad: `src/agent/scratchpad.ts`
- Anthropic token counting: https://docs.anthropic.com/en/docs/build-with-claude/token-counting
- Claude context window: 200k tokens (as of Claude 3.5 Sonnet)
- Korean Prompts: [[phase-2-core/07-prompts|Issue #7]]
