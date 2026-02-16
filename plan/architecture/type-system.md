---
title: Korean Dexter - Type System
status: planned
created: 2026-02-16
tags:
  - architecture
  - typescript
  - type-definitions
phase: planning
---

# Korean Dexter - Type System

Complete TypeScript type definitions for Korean Dexter, organized by domain.

## Core Types (Preserved from Dexter)

### Agent Configuration

```typescript
interface AgentConfig {
  /** LLM model to use (default: claude-3-5-sonnet-20241022) */
  model?: string;

  /** Model provider (default: anthropic) */
  modelProvider?: 'anthropic' | 'openai' | 'gemini';

  /** Maximum agent iterations (default: 10) */
  maxIterations?: number;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}
```

### Agent Events

```typescript
type AgentEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | ToolErrorEvent
  | ToolLimitEvent
  | ContextClearedEvent
  | AnswerStartEvent
  | DoneEvent;

interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

interface ToolStartEvent {
  type: 'tool_start';
  toolName: string;
  args: Record<string, any>;
}

interface ToolProgressEvent {
  type: 'tool_progress';
  toolName: string;
  progress: string;
}

interface ToolEndEvent {
  type: 'tool_end';
  toolName: string;
  result: ToolResult;
}

interface ToolErrorEvent {
  type: 'tool_error';
  toolName: string;
  error: string;
}

interface ToolLimitEvent {
  type: 'tool_limit';
  toolName: string;
  reason: 'max_calls_exceeded' | 'duplicate_call';
}

interface ContextClearedEvent {
  type: 'context_cleared';
  removedCount: number;
  remainingTokens: number;
}

interface AnswerStartEvent {
  type: 'answer_start';
}

interface DoneEvent {
  type: 'done';
  answer: string;
  toolCalls: ToolCallRecord[];
  iterations: number;
  totalTime: number;
  tokenUsage?: TokenUsage;
}
```

### Message Types

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}
```

### Token Usage

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}
```

### Run Context

```typescript
interface RunContext {
  query: string;
  scratchpad: Scratchpad;
  tokenCounter: TokenCounter;
  startTime: number;
  iteration: number;
}
```

### Scratchpad

```typescript
interface ScratchpadEntry {
  type: 'init' | 'tool_result' | 'thinking';
  timestamp: string; // ISO8601
  content?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: ToolResult;
}

interface Scratchpad {
  entries: ScratchpadEntry[];
  tokenCount: number;
  maxTokens: number;
}
```

### Tool System

```typescript
interface ToolResult {
  data: any;
  sourceUrls?: string[];
}

interface ToolCallRecord {
  tool: string;
  args: Record<string, any>;
  result: ToolResult;
}

interface ToolContext {
  toolName: string;
  args: Record<string, any>;
  result: ToolResult;
}

interface ToolLimitConfig {
  maxCallsPerTool: number; // default: 3
  similarityThreshold: number; // default: 0.7 (Jaccard)
}

interface RegisteredTool {
  name: string;
  tool: StructuredToolInterface;
  description: string;
}

interface StructuredToolInterface {
  name: string;
  description: string;
  schema: Record<string, any>; // JSON schema
  func: (args: Record<string, any>) => Promise<ToolResult>;
}
```

## Korean-Specific Types

### Company Resolution

```typescript
interface ResolvedCompany {
  /** 8-digit OpenDART corp_code */
  corpCode: string;

  /** Korean company name (official) */
  corpName: string;

  /** 6-digit stock ticker (null for unlisted) */
  stockCode: string | null;

  /** CEO name */
  ceoName: string;

  /** Industry classification code */
  industryCode: string;

  /** Establishment date (YYYYMMDD) */
  estDate: string;

  /** Market listing status */
  market: 'KOSPI' | 'KOSDAQ' | 'KONEX' | null;
}

interface CorpMapping {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

interface CorpCodeResult {
  /** Resolved 8-digit corp_code */
  corp_code: string;

  /** Official Korean company name */
  corp_name: string;

  /** 6-digit stock ticker (if listed) */
  stock_code?: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** How the match was found */
  matchType: 'exact_ticker' | 'exact_corpcode' | 'exact_name' | 'fuzzy_name';

  /** Alternative matches (if fuzzy search) */
  alternatives: Array<{
    corp_code: string;
    corp_name: string;
    stock_code?: string;
    confidence: number;
  }>;
}
```

### Financial Data

```typescript
interface NormalizedAmount {
  /** Raw value in KRW (won) */
  raw: number;

  /** Display scale */
  scale: '조원' | '억원' | '만원' | '원';

  /** Formatted string (e.g., "12.5조원") */
  formatted: string;

  /** Currency code */
  currency: 'KRW';
}

interface PeriodRange {
  /** Fiscal year */
  year: number;

  /** Quarter (1-4), null for annual */
  quarter?: 1 | 2 | 3 | 4;

  /** OpenDART report code */
  reportCode: '11011' | '11012' | '11013' | '11014';

  /** Financial statement division */
  fsDiv: 'CFS' | 'OFS';

  /** Human-readable label (e.g., "2023년 4분기") */
  periodLabel: string;
}

interface AccountMapping {
  /** Standardized concept ID */
  conceptId: string;

  /** Known Korean account names */
  koreanNames: string[];

  /** English equivalent */
  englishName: string;

  /** Statement category */
  category: 'income' | 'balance' | 'cashflow';
}

interface KoreanToolResult extends ToolResult {
  metadata: {
    corpCode: string;
    corpName: string;
    period: PeriodRange;
    fsDiv: 'CFS' | 'OFS';
    dataSource: 'opendart' | 'kis';
  };
}
```

### Financial Statements (OpenDART)

```typescript
interface IncomeStatement {
  rcept_no: string; // Receipt number
  bsns_year: string; // Business year
  corp_code: string;
  sj_div: string; // Statement division
  sj_nm: string; // Statement name
  account_id: string;
  account_nm: string; // Korean account name
  account_detail: string;
  thstrm_nm: string; // This term name
  thstrm_amount: string; // Amount (string with commas)
  thstrm_add_amount?: string;
  frmtrm_nm?: string; // Previous term name
  frmtrm_amount?: string;
  frmtrm_add_amount?: string;
  bfefrmtrm_nm?: string; // Before previous term
  bfefrmtrm_amount?: string;
  ord: string; // Display order
  currency: string;
}

interface BalanceSheet {
  // Same structure as IncomeStatement
  rcept_no: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail: string;
  thstrm_nm: string;
  thstrm_amount: string;
  frmtrm_nm?: string;
  frmtrm_amount?: string;
  ord: string;
  currency: string;
}

interface CashflowStatement {
  // Same structure as IncomeStatement
  rcept_no: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail: string;
  thstrm_nm: string;
  thstrm_amount: string;
  frmtrm_nm?: string;
  frmtrm_amount?: string;
  bfefrmtrm_nm?: string;
  bfefrmtrm_amount?: string;
  ord: string;
  currency: string;
}

interface DisclosureItem {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  corp_cls: string; // Y: KOSPI, K: KOSDAQ, etc.
  report_nm: string; // Report name (Korean)
  rcept_no: string;
  flr_nm: string; // Filer name
  rcept_dt: string; // Receipt date (YYYYMMDD)
  rm: string; // Remarks
}

interface ShareholdingData {
  rcept_no: string;
  corp_code: string;
  isu_nm: string; // Issue name
  nm: string; // Shareholder name
  relate: string; // Relationship
  stock_knd: string; // Stock kind
  bsis_posesn_stock_co: string; // Beginning shares
  bsis_posesn_stock_qota_rt: string; // Beginning ratio
  trmend_posesn_stock_co: string; // Term end shares
  trmend_posesn_stock_qota_rt: string; // Term end ratio
  change_stock_co: string; // Changed shares
}
```

### Stock Data (KIS API)

```typescript
interface StockPrice {
  /** Stock code (6 digits) */
  stck_shrn_iscd: string;

  /** Business date (YYYYMMDD) */
  stck_bsop_date: string;

  /** Closing price */
  stck_clpr: string;

  /** Opening price */
  stck_oprc: string;

  /** High price */
  stck_hgpr: string;

  /** Low price */
  stck_lwpr: string;

  /** Accumulated trading volume */
  acml_vol: string;

  /** Accumulated trading value */
  acml_tr_pbmn: string;

  /** Previous closing price */
  prdy_vrss: string;

  /** Previous comparison ratio */
  prdy_vrss_sign: string;

  /** Change rate */
  prdy_ctrt: string;
}

interface InvestorFlow {
  /** Stock code */
  stck_shrn_iscd: string;

  /** Business date (YYYYMMDD) */
  stck_bsop_date: string;

  /** Individual net buy/sell */
  indv_nby_qty: string;

  /** Foreign net buy/sell */
  frgn_nby_qty: string;

  /** Institution net buy/sell */
  inst_nby_qty: string;

  /** Program net buy/sell */
  prgm_nby_qty: string;
}

interface KISAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
}
```

## Infrastructure Types

### Rate Limiting

```typescript
interface RateLimitConfig {
  /** Maximum requests per second */
  maxPerSecond: number;

  /** Maximum requests per minute */
  maxPerMinute: number;

  /** Daily quota (total requests) */
  dailyQuota: number;
}

interface RateLimitState {
  /** Requests in current second */
  currentSecondCount: number;

  /** Requests in current minute */
  currentMinuteCount: number;

  /** Requests today */
  dailyCount: number;

  /** Window reset timestamps */
  secondResetAt: number;
  minuteResetAt: number;
  dayResetAt: number;
}

interface RateLimiterOptions {
  /** Identifier for rate limit bucket */
  key: string;

  /** Rate limit configuration */
  config: RateLimitConfig;

  /** Storage backend (memory or redis) */
  storage?: 'memory' | 'redis';
}
```

### Caching

```typescript
interface CacheEntry<T> {
  /** Cache key */
  key: string;

  /** Cached data */
  data: T;

  /** Cache creation timestamp */
  cachedAt: Date;

  /** Time-to-live (ms) or 'permanent' for immutable data */
  ttl: number | 'permanent';
}

interface CacheOptions {
  /** Default TTL in milliseconds */
  defaultTTL: number;

  /** Maximum cache size (number of entries) */
  maxSize?: number;

  /** Storage backend */
  storage: 'memory' | 'file' | 'redis';

  /** Storage path (for file backend) */
  storagePath?: string;
}

interface CacheKey {
  /** Data source */
  source: 'opendart' | 'kis';

  /** API endpoint */
  endpoint: string;

  /** Request parameters (sorted for consistency) */
  params: Record<string, string | number>;
}
```

### Authentication (KIS)

```typescript
interface KISToken {
  /** OAuth access token */
  accessToken: string;

  /** Token type (usually 'Bearer') */
  tokenType: string;

  /** Token expiration timestamp */
  expiresAt: Date;

  /** Token scope */
  scope: string;
}

interface KISAuthConfig {
  /** App key (from KIS developer portal) */
  appKey: string;

  /** App secret */
  appSecret: string;

  /** Account number (for trading APIs) */
  accountNumber?: string;

  /** Environment (real or virtual) */
  environment: 'real' | 'virtual';
}

interface KISAuthManager {
  /** Get current valid token (auto-refresh if expired) */
  getToken(): Promise<KISToken>;

  /** Manually refresh token */
  refreshToken(): Promise<KISToken>;

  /** Check if token is valid */
  isTokenValid(): boolean;
}
```

## API Response Types

### OpenDART API Responses

```typescript
interface OpenDARTResponse<T> {
  status: string; // "000" for success
  message: string;
  list?: T[];
}

interface OpenDARTError {
  status: string;
  message: string;
}
```

### KIS API Responses

```typescript
interface KISResponse<T> {
  rt_cd: string; // Return code ("0" for success)
  msg_cd: string; // Message code
  msg1: string; // Message
  output?: T;
  output1?: T;
  output2?: any;
}

interface KISError {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
}
```

## Utility Types

### Hangul Processing

```typescript
interface JamoDecomposition {
  initial: string; // 초성
  medial: string; // 중성
  final: string; // 종성
}

interface HangulMatcher {
  /** Decompose Hangul syllable into jamo */
  decompose(syllable: string): JamoDecomposition;

  /** Calculate similarity between two Korean strings */
  similarity(a: string, b: string): number;

  /** Fuzzy search in Korean text */
  fuzzyMatch(query: string, targets: string[]): Array<{ text: string; score: number }>;
}
```

### Financial Formatting

```typescript
interface FormatOptions {
  /** Use Korean scale (조원/억원/만원) */
  useKoreanScale: boolean;

  /** Decimal places */
  decimals: number;

  /** Include currency symbol */
  includeCurrency: boolean;

  /** Compact format (e.g., "12.5조" vs "12조 5000억") */
  compact: boolean;
}

interface KoreanFinancialFormatter {
  /** Format amount with Korean scale */
  format(amount: number, options?: Partial<FormatOptions>): string;

  /** Parse Korean-formatted amount to number */
  parse(formatted: string): number;

  /** Auto-detect appropriate scale */
  autoScale(amount: number): '조원' | '억원' | '만원' | '원';
}
```

## Cross-References

- [[overview|Architecture Overview]] - System architecture
- [[dexter-mapping|Dexter Mapping]] - Component mapping
- [[dependency-graph|Dependency Graph]] - Implementation dependencies
- [[../implementation/corp-code-resolver|Corp Code Resolver]] - ResolvedCompany implementation
- [[../implementation/opendart-client|OpenDART Client]] - API client types
- [[../implementation/kis-client|KIS Client]] - Stock data types
