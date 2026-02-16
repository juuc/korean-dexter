---
title: Korean Dexter - Component Mapping from Upstream
status: planned
created: 2026-02-16
tags:
  - architecture
  - migration
  - component-mapping
phase: planning
---

# Korean Dexter - Component Mapping from Upstream

Detailed mapping of what we keep, modify, and replace from upstream [virattt/dexter](https://github.com/virattt/dexter).

## KEEP AS-IS (No Changes)

These components are domain-agnostic and work perfectly for Korean market:

### Agent Loop Core (`src/agent/agent.ts`)

**Why keep**: The iterative tool-calling loop is language and data-source agnostic. The logic (LLM call → tool execution → scratchpad append → loop/break) works identically for Korean financial data.

**Functions preserved**:
- `runAgentLoop()`: Main iteration logic
- `shouldContinueLoop()`: Termination condition (max iterations or no tool calls)
- `buildMessages()`: Convert scratchpad to message history
- `executeTool()`: Tool invocation wrapper

**No changes needed**: Korean-specific logic lives in tools, not agent loop.

### Token Counter (`src/utils/token-counter.ts`)

**Why keep**: Token counting logic is model-specific, not domain-specific. Claude's tokenization works the same for Korean text.

**Functions preserved**:
- `countTokens()`: Estimate tokens in text
- `countMessageTokens()`: Estimate tokens in message array
- `shouldClearContext()`: Check if token budget exceeded

**Note**: We'll recalibrate the context threshold (default 100k) to account for Korean verbosity, but the logic stays the same.

### Scratchpad System (`src/scratchpad/scratchpad.ts`)

**Why keep**: Append-only JSONL format is language-agnostic. The scratchpad stores tool calls and results regardless of data source.

**Functions preserved**:
- `initScratchpad()`: Create new scratchpad file
- `appendEntry()`: Add entry (init, tool_result, thinking)
- `readScratchpad()`: Load entries from disk
- `clearOldEntries()`: Remove oldest entries when context exceeded

**File format unchanged**: `.dexter/scratchpad/{query-id}.jsonl`

### Event Types (`src/types/events.ts`)

**Why keep**: Event streaming API is presentation-layer concern, not data concern. Korean UI will consume the same event types.

**Types preserved**:
- `AgentEvent` union type
- `ThinkingEvent`, `ToolStartEvent`, `ToolEndEvent`, etc.
- `DoneEvent` with final answer and metadata

**Consumers updated**: React Ink UI will render Korean labels, but event structure unchanged.

### React Ink UI Components (`src/ui/`)

**Why keep structure**: Terminal UI framework (React Ink) is language-agnostic. We only need to translate labels.

**Components preserved**:
- `ChatUI`: Main interactive UI
- `ThinkingIndicator`: Animated spinner
- `ToolProgress`: Tool execution progress bar
- `AnswerDisplay`: Markdown rendering

**Changes**: Korean label strings only (e.g., "Thinking..." → "분석 중...", "Tool executing" → "도구 실행 중")

### Eval Runner Framework (`src/eval/run.ts`)

**Why keep**: Evaluation infrastructure (run queries, collect answers, compute metrics) is data-agnostic. Only the dataset and metrics change.

**Functions preserved**:
- `runEval()`: Execute eval suite
- `runQuery()`: Single query execution
- `collectResults()`: Aggregate results
- `computeMetrics()`: Calculate scores

**Changes**: Replace eval dataset (English → Korean), update metrics (add Korean-specific: amount formatting accuracy, account name mapping correctness)

### Skill System (`src/skills/`)

**Why keep**: Skill loading, registration, and injection logic is generic. Only skill content changes.

**Files preserved**:
- `loader.ts`: Discover and load SKILL.md files
- `registry.ts`: Register skills as tools
- `types.ts`: Skill metadata types

**Changes**: Replace skill content (DCF valuation adapted for Korean market, Korean-specific assumptions)

## MODIFY (Adapt for Korean Market)

These components need adjustments for Korean verbosity, data formats, or UI language:

### Scratchpad Token Budget (`src/scratchpad/scratchpad.ts`)

**What to modify**: Context threshold constant

**Why**: Korean financial text is 2-3x more verbose than English
- English: "Operating income increased 15% YoY to $1.2B"
- Korean: "영업이익은 전년 동기 대비 15% 증가한 12억 달러를 기록했습니다"

**Change**:
```typescript
// OLD
const CONTEXT_THRESHOLD = 100_000;

// NEW
const CONTEXT_THRESHOLD = 150_000; // +50% buffer for Korean verbosity
```

**Alternative approach**: Use adaptive threshold based on language detection.

### Agent Configuration (`src/agent/agent.ts`)

**What to modify**: Default iteration limit

**Why**: Korean financial queries may require more tool calls due to multi-step corp code resolution and data source fragmentation (OpenDART + KIS vs single Financial Datasets API).

**Change**:
```typescript
// OLD
const DEFAULT_MAX_ITERATIONS = 10;

// NEW
const DEFAULT_MAX_ITERATIONS = 12; // +20% for corp resolution overhead
```

### LLM Provider Config (`src/providers/`)

**What to modify**: Default model and prompt caching strategy

**Why**: Claude has better Korean language support than GPT-4, and Korean text benefits more from prompt caching (longer prompts).

**Change**:
```typescript
// OLD default
const DEFAULT_MODEL = 'gpt-4-turbo';

// NEW default
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
```

**Add**: Aggressive prompt caching for Korean system prompts (which are longer).

### CLI Labels (`src/cli.tsx`)

**What to modify**: All user-facing strings

**Examples**:
- "What would you like to know?" → "무엇을 분석해드릴까요?"
- "Thinking..." → "분석 중..."
- "Fetching financial data..." → "재무 데이터 조회 중..."
- "Analysis complete!" → "분석 완료!"

**Scope**: ~50 string literals across CLI components.

## REPLACE ENTIRELY

These components are tightly coupled to US market data and must be rewritten:

### All Financial Tools (`src/tools/finance/`)

**Why replace**: Upstream tools use Financial Datasets API (US market only). We need OpenDART + KIS for Korean market.

**Upstream tools to remove**:
- `search.ts` (Financial Datasets search)
- `income-statement.ts`
- `balance-sheet.ts`
- `cashflow-statement.ts`
- `prices.ts`
- `metrics.ts` (P/E, EPS, etc.)
- `filings.ts` (SEC Edgar)
- `insider-trades.ts`
- `analyst-estimates.ts`

**Replacement tools** (see [[../implementation/tool-design|Tool Design]]):

**Meta-Tools** (agent sees):
- `korean_financial_search`: Route to OpenDART/KIS sub-tools
- `korean_financial_metrics`: Compute ratios from raw data
- `read_korean_filings`: Full document retrieval

**Sub-Tools** (meta-tools use):
- `get_income_statements` (OpenDART)
- `get_balance_sheets` (OpenDART)
- `get_cashflow_statements` (OpenDART)
- `get_stock_prices` (KIS)
- `get_daily_volumes` (KIS)
- `get_investor_flows` (KIS)
- `get_disclosure_list` (OpenDART)
- `get_shareholding` (OpenDART)
- `get_executive_compensation` (OpenDART)
- `search_company` (corp code resolution)
- ... (18 total atomic tools)

**Key differences**:
- Corp code resolution layer (no direct ticker symbols in OpenDART)
- Account name mapping (Korean → standardized concepts)
- Amount normalization (조원/억원/만원 scales)
- Consolidated vs separate statements (CFS/OFS)

### System Prompts (`src/prompts.ts`)

**Why replace**: Upstream prompts assume US market context (SEC filings, GAAP, USD, analyst consensus).

**Upstream prompt structure**:
```
You are a financial analyst assistant.
Use tools to answer questions about stocks.
Data sources: Financial Datasets API (10-K, 10-Q, stock prices).
```

**New Korean prompt structure**:
```
You are a Korean stock market financial analyst.
Use tools to answer questions about KOSPI/KOSDAQ companies.
Data sources:
- OpenDART (재무제표, 공시, 지분)
- KIS API (주가, 거래량, 투자자별 매매)

Important context:
- Default to consolidated (연결) financials
- Use 조원/억원/만원 scales (never raw won)
- Resolve company names to corp_code before data fetches
- Cross-validate data between sources when possible
```

**Prompt engineering priorities**:
- Korean financial terminology (영업이익, 당기순이익, etc.)
- Korean market context (KOSPI/KOSDAQ, 코스닥, 재벌 structure)
- Data quality awareness (OpenDART lag, KIS real-time limits)
- Self-validation prompts (confidence scoring, data freshness checks)

### Evaluation Dataset (`src/eval/dataset/`)

**Why replace**: Upstream eval uses US stock questions (e.g., "What was Apple's revenue in Q3 2023?").

**Upstream dataset format**:
```json
{
  "question": "What was Apple's revenue in Q3 2023?",
  "expected_answer": "$81.8B",
  "category": "financial_metrics"
}
```

**New Korean dataset format**:
```json
{
  "question": "삼성전자의 2023년 3분기 매출은?",
  "expected_answer": "67조 4천억원",
  "category": "financial_metrics",
  "metadata": {
    "corp_code": "00126380",
    "stock_code": "005930",
    "period": "2023Q3",
    "data_source": "opendart"
  }
}
```

**Dataset requirements** (see [[../evaluation/eval-dataset|Eval Dataset Design]]):
- 100 Korean queries across categories: financials, ratios, disclosures, stock prices, comparisons
- Ground truth from actual OpenDART/KIS API responses
- Korean-specific metrics: amount formatting accuracy, account name mapping correctness

### Environment Variables (`.env.example`)

**Why replace**: Upstream uses Financial Datasets API key. We need OpenDART + KIS credentials.

**Upstream**:
```bash
FINANCIAL_DATASETS_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
```

**New**:
```bash
# LLM
ANTHROPIC_API_KEY=xxx
OPENAI_API_KEY=xxx  # optional fallback

# Data Sources
OPENDART_API_KEY=xxx  # from opendart.fss.or.kr
KIS_APP_KEY=xxx       # from koreainvestment.com
KIS_APP_SECRET=xxx
KIS_ACCOUNT_NUMBER=xxx  # for trading APIs (MVP: read-only, can be empty)

# Cache
CACHE_DIR=.dexter/cache
CACHE_REDIS_URL=  # optional, defaults to file cache
```

### Web Search (Keep Framework, Update for Korean)

**Upstream**: Exa + Tavily for web search

**Change**: Keep Exa/Tavily, add BigKinds (네이버 뉴스 API) for v1.1

**No immediate replacement needed**: Web search is v1.1 feature, but plan for Korean news sources.

## ADD NEW

Components that don't exist upstream but are required for Korean market:

### Corp Code Resolution (`src/mapping/corp-code-resolver.ts`)

**Why needed**: OpenDART uses 8-digit `corp_code`, not ticker symbols. Users will query with:
- Korean names: "삼성전자", "SK하이닉스"
- Ticker symbols: "005930", "000660"
- Mixed: "삼성전자(005930)"

**Functions**:
- `resolveCompany(query: string): Promise<CorpCodeResult>`
- `exactMatch(query: string): CorpMapping | null`
- `fuzzyMatch(query: string): CorpMapping[]`
- `updateCorpList(): Promise<void>` (daily refresh)

**See**: [[../implementation/corp-code-resolver|Corp Code Resolver Implementation]]

### Account Mapper (`src/mapping/account-mapper.ts`)

**Why needed**: OpenDART returns Korean account names ("당기순이익", "영업활동으로인한현금흐름"). We need standardized concept IDs for cross-company comparisons.

**Functions**:
- `mapAccount(koreanName: string, category: 'income'|'balance'|'cashflow'): string`
- `getKoreanNames(conceptId: string): string[]`
- `addMapping(conceptId: string, koreanNames: string[]): void`

**Data file**: `src/mapping/account-mappings.json` (300+ mappings)

**See**: [[../implementation/account-mapper|Account Mapper Implementation]]

### Korean Financial Formatter (`src/utils/korean-financial-formatter.ts`)

**Why needed**: Korean financial reporting uses 조원 (trillion), 억원 (hundred million), 만원 (ten thousand) scales. Raw won amounts are unreadable.

**Functions**:
- `format(amount: number, options?: FormatOptions): string`
- `parse(formatted: string): number`
- `autoScale(amount: number): '조원'|'억원'|'만원'|'원'`
- `normalize(amount: number): NormalizedAmount`

**Example**:
```typescript
format(1_234_567_890_000) // "1.23조원"
format(567_890_000) // "5.68억원"
```

### Rate Limiter (`src/infra/rate-limiter.ts`)

**Why needed**: OpenDART has 10k requests/day limit, KIS has 1 req/sec limit. Must enforce quotas to prevent API bans.

**Features**:
- Per-API quota tracking
- Sliding window rate limiting
- Automatic backoff on 429 errors
- Persistent quota state (survive process restart)

**Config**:
```typescript
{
  opendart: { maxPerSecond: 10, maxPerMinute: 600, dailyQuota: 10000 },
  kis: { maxPerSecond: 1, maxPerMinute: 60, dailyQuota: Infinity }
}
```

### Cache Layer (`src/infra/cache.ts`)

**Why needed**: Historical financial data is immutable. Cache permanently to reduce API usage.

**Caching strategy**:
- **Permanent**: Prior-year financials, closed-day stock prices
- **1 day TTL**: Current-day stock prices (until market close)
- **1 hour TTL**: Disclosure lists (new filings during day)
- **No cache**: Real-time quotes (future feature)

**Storage**: File-based (`.dexter/cache/`) with optional Redis backend.

### KIS Auth Manager (`src/infra/kis-auth.ts`)

**Why needed**: KIS API uses OAuth with 24-hour token expiry. Must auto-refresh tokens before expiration.

**Functions**:
- `getToken(): Promise<KISToken>`
- `refreshToken(): Promise<KISToken>`
- `isTokenValid(): boolean`
- `scheduleRefresh(): void` (background job)

**Token storage**: `.dexter/.kis-token.json` (gitignored)

### Hangul Utilities (`src/utils/hangul.ts`)

**Why needed**: Fuzzy search on Korean company names requires jamo decomposition for accurate matching.

**Functions**:
- `decompose(syllable: string): JamoDecomposition`
- `similarity(a: string, b: string): number` (jamo-aware Levenshtein)
- `fuzzyMatch(query: string, targets: string[]): Array<{text, score}>`

**Example**:
```typescript
fuzzyMatch("삼성", ["삼성전자", "삼성물산", "삼성SDI"])
// [
//   { text: "삼성전자", score: 0.95 },
//   { text: "삼성물산", score: 0.92 },
//   { text: "삼성SDI", score: 0.88 }
// ]
```

### Shared Types (`src/shared/`)

**New files**:
- `resolved-company.ts`: ResolvedCompany interface
- `normalized-amount.ts`: NormalizedAmount type + utilities
- `period-range.ts`: PeriodRange type + constructors
- `korean-tool-result.ts`: Extended ToolResult with Korean metadata

## Component Dependency Map

```
┌─────────────────────────────────────────────────────────────┐
│                      KEEP AS-IS                              │
├─────────────────────────────────────────────────────────────┤
│  agent.ts → token-counter.ts → scratchpad.ts               │
│  types/events.ts → ui/ (React Ink)                          │
│  eval/run.ts (framework only)                               │
│  skills/ (loader, registry)                                 │
└─────────────────────────────────────────────────────────────┘
                         ↓ uses ↓
┌─────────────────────────────────────────────────────────────┐
│                       MODIFY                                 │
├─────────────────────────────────────────────────────────────┤
│  scratchpad.ts (context threshold +50%)                     │
│  agent.ts (max iterations +20%)                             │
│  providers/ (default to Claude)                             │
│  cli.tsx (Korean labels)                                    │
└─────────────────────────────────────────────────────────────┘
                         ↓ uses ↓
┌─────────────────────────────────────────────────────────────┐
│                   REPLACE ENTIRELY                           │
├─────────────────────────────────────────────────────────────┤
│  prompts.ts (Korean financial analyst)                      │
│  tools/finance/ (OpenDART + KIS)                            │
│  eval/dataset/ (Korean Q&A)                                 │
│  .env.example (Korean API keys)                             │
└─────────────────────────────────────────────────────────────┘
                         ↓ uses ↓
┌─────────────────────────────────────────────────────────────┐
│                      ADD NEW                                 │
├─────────────────────────────────────────────────────────────┤
│  mapping/corp-code-resolver.ts                              │
│  mapping/account-mapper.ts                                  │
│  utils/korean-financial-formatter.ts                        │
│  utils/hangul.ts                                            │
│  infra/rate-limiter.ts                                      │
│  infra/cache.ts                                             │
│  infra/kis-auth.ts                                          │
│  shared/ (Korean-specific types)                            │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Priority

1. **ADD NEW foundations** (infra, mapping, utils) - [[dependency-graph|See Issue #3-#5, #10-#11]]
2. **REPLACE tools** (OpenDART, KIS) - [[dependency-graph|See Issue #6, #8]]
3. **REPLACE prompts** - [[dependency-graph|See Issue #7]]
4. **MODIFY agent config** (thresholds, iterations) - [[dependency-graph|See Issue #13]]
5. **MODIFY UI labels** - (Low priority, works in English initially)
6. **REPLACE eval dataset** - [[dependency-graph|See Issue #12]]

## Migration Strategy

**Phase 1: Parallel Development (Weeks 1-2)**
- Keep upstream Dexter functional in `main` branch
- Develop Korean components in `feature/korean-market` branch
- Run both eval suites to ensure no regression in agent loop logic

**Phase 2: Tool Swap (Week 3)**
- Replace tool registry (US tools → Korean tools)
- Keep same tool interface (StructuredToolInterface)
- Verify agent loop still works with new tools

**Phase 3: Prompt Refinement (Week 4)**
- Replace system prompts
- Iterate on Korean financial terminology
- Tune meta-tool routing prompts

**Phase 4: Eval & Polish (Week 5)**
- Run Korean eval suite
- Fix failures (likely: amount formatting, account mapping edge cases)
- UI translation

## Cross-References

- [[overview|Architecture Overview]] - System design
- [[type-system|Type System]] - All TypeScript interfaces
- [[dependency-graph|Dependency Graph]] - Implementation order
- [[../implementation/corp-code-resolver|Corp Code Resolver]] - NEW component design
- [[../implementation/opendart-client|OpenDART Client]] - REPLACE tool design
- [[../implementation/kis-client|KIS Client]] - REPLACE tool design
- [[../evaluation/eval-dataset|Eval Dataset]] - REPLACE dataset design
