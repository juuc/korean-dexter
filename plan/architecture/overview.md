---
title: Korean Dexter - Architecture Overview
status: planned
created: 2026-02-16
tags:
  - architecture
  - system-design
  - agent-loop
phase: planning
---

# Korean Dexter - Architecture Overview

Korean Dexter is an autonomous AI financial research agent for the Korean stock market, forked from [virattt/dexter](https://github.com/virattt/dexter). It adapts Dexter's proven agent loop architecture while replacing all data sources with Korean-specific APIs.

## High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INPUT                               │
│                   (Korean language query)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORP CODE RESOLVER                            │
│  Input: "삼성전자" / "005930" / mixed                            │
│  Output: { corpCode: "00126380", stockCode: "005930", ... }     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT LOOP (Core)                           │
│  ┌────────────────────────────────────────────────────┐         │
│  │  Iteration N (max 10):                             │         │
│  │    1. LLM call with tools bound                    │         │
│  │    2. If tool_calls → execute & append scratchpad  │         │
│  │    3. If no tool_calls → break loop                │         │
│  └────────────────────────────────────────────────────┘         │
│                                                                   │
│  Two-Layer Tool Architecture:                                    │
│  ┌─────────────────────────────────────────┐                    │
│  │ Meta-Tool: korean_financial_search      │                    │
│  │   ↓ (inner LLM routing)                 │                    │
│  │   ├─ get_financial_statements (OpenDART)│                    │
│  │   ├─ get_stock_prices (KIS)             │                    │
│  │   ├─ get_investor_flows (KIS)           │                    │
│  │   ├─ get_disclosure_list (OpenDART)     │                    │
│  │   └─ ... (18 atomic sub-tools)          │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                   │
│  Scratchpad: .dexter/scratchpad/{query-id}.jsonl                │
│    - Append-only JSONL (init, tool_result, thinking)            │
│    - Token budget: 100k context threshold                       │
│    - Soft limits: max 3 calls/tool, Jaccard 0.7 dedup           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATA FETCHING LAYER                            │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │    OpenDART      │  │      KIS API      │                     │
│  │  - Financials    │  │  - Stock prices   │                     │
│  │  - Disclosures   │  │  - Volumes        │                     │
│  │  - Shareholding  │  │  - Investor flows │                     │
│  └──────────────────┘  └──────────────────┘                     │
│           ↓                       ↓                               │
│  ┌─────────────────────────────────────────┐                    │
│  │     Infrastructure Layer                │                    │
│  │  - RateLimiter (per-API quotas)         │                    │
│  │  - CacheLayer (permanent for historical)│                    │
│  │  - KISAuthManager (token refresh)       │                    │
│  └─────────────────────────────────────────┘                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   REASONING & VALIDATION                         │
│  - AccountMapper: Map Korean account names to concepts          │
│  - KoreanFinancialFormatter: 조원/억원/만원 scales              │
│  - Self-validation: Detect low confidence, prompt re-try        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FINAL ANSWER GENERATION                       │
│  Separate LLM call using full scratchpad context                │
│  Output: Markdown formatted Korean analysis                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT STREAM OUTPUT                           │
│  AsyncGenerator<AgentEvent>:                                     │
│    - thinking, tool_start, tool_progress, tool_end              │
│    - tool_error, tool_limit, context_cleared                    │
│    - answer_start, done (with full metadata)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Agent Loop (Preserved from Dexter)

The agent loop is the heart of the system, using iterative tool-calling:

1. **Initialization**: Parse user query, initialize scratchpad
2. **Iteration Loop** (max 10):
   - Call LLM with tools bound + full scratchpad history
   - If LLM returns `tool_calls`: execute them, append results to scratchpad, continue
   - If LLM returns no `tool_calls`: break loop
3. **Final Answer Generation**: Separate LLM call using full scratchpad as context
4. **Output**: Stream events + final DoneEvent with answer, tool call records, token usage

**Key Features**:
- Soft limits prevent tool abuse (max 3 calls per tool, Jaccard similarity 0.7 for dedup)
- Context management: when token count exceeds 100k, oldest tool results cleared from memory (but preserved on disk)
- All intermediate reasoning captured in scratchpad for debugging and final synthesis

### Two-Layer Tool Architecture

**Outer Layer** (Agent sees):
- `korean_financial_search`: Meta-tool for all financial queries
- `korean_financial_metrics`: Meta-tool for computed metrics (ratios, growth rates)
- `read_korean_filings`: Meta-tool for full document retrieval

**Inner Layer** (Meta-tools route to):
- 18 atomic sub-tools: `get_income_statements`, `get_balance_sheets`, `get_cashflow_statements`, `get_stock_prices`, `get_daily_volumes`, `get_investor_flows`, `get_disclosure_list`, `get_shareholding`, `get_executive_compensation`, etc.
- Each meta-tool uses an INNER LLM call to select and invoke the appropriate sub-tool
- This keeps the outer agent loop clean and reduces token usage

### Scratchpad System

**Format**: Append-only JSONL files in `.dexter/scratchpad/`

**Entry Types**:
```typescript
{ type: 'init', timestamp: ISO8601, query: string }
{ type: 'tool_result', timestamp: ISO8601, toolName: string, args: object, result: ToolResult }
{ type: 'thinking', timestamp: ISO8601, content: string }
```

**Token Management**:
- Korean text is 2-3x more verbose than English → adjust budget accordingly
- Context threshold: 100k tokens (configurable)
- When exceeded: clear oldest tool results from memory (keep recent + high-relevance)
- All entries preserved on disk for final answer generation

### Event Streaming

The agent exposes an `AsyncGenerator<AgentEvent>` for real-time progress updates:

```typescript
type AgentEvent =
  | { type: 'thinking', content: string }
  | { type: 'tool_start', toolName: string, args: object }
  | { type: 'tool_progress', toolName: string, progress: string }
  | { type: 'tool_end', toolName: string, result: ToolResult }
  | { type: 'tool_error', toolName: string, error: string }
  | { type: 'tool_limit', toolName: string, reason: string }
  | { type: 'context_cleared', removedCount: number }
  | { type: 'answer_start' }
  | { type: 'done', answer: string, toolCalls: ToolCallRecord[], iterations: number, totalTime: number, tokenUsage?: TokenUsage }
```

Consumed by React Ink UI to render progress in terminal.

### CLI Entry Point

**Tech**: React Ink (terminal UI)

**Features**:
- Interactive mode: Start session, ask multiple questions
- Single-shot mode: `dexter ask "삼성전자 재무 분석"`
- Real-time event rendering (streaming tool progress, thinking steps)
- Korean language UI labels

### LLM Provider Abstraction

**Multi-Provider Support** (via prefix routing):
- `claude-*` → Anthropic
- `gpt-*` → OpenAI
- `gemini-*` → Google (future)

**Primary**: Claude (prompt caching for cost optimization)
**Optional**: OpenAI as fallback

**Separate "Fast Model"**: Used for sub-tasks in meta-tools (tool routing, simple queries) to reduce cost.

### Skill System

**Format**: Markdown files with YAML frontmatter

**Discovery**: 3 directories (builtin, user, project)

**MVP Skill**: DCF valuation adapted for Korean market
- Korean WACC estimation (corporate bond yields, equity risk premium)
- Terminal value using Korean market multiples
- Korean-specific growth assumptions (demographic factors, industry trends)

**Loading**: On-demand, injected as tool results when agent invokes `use_skill` tool

### Infrastructure Layer

**RateLimiter**: Per-API quotas (OpenDART: 10k/day, KIS: 1 req/sec)
**CacheLayer**: TTL for volatile data, permanent for immutable historical data
**KISAuthManager**: OAuth token refresh, automatic retry on 401

## Data Flow Example

**User Query**: "삼성전자의 2023년 영업이익률을 분석해줘"

1. **Corp Code Resolution**: "삼성전자" → `{ corpCode: "00126380", stockCode: "005930", corpName: "삼성전자", confidence: 1.0 }`
2. **Agent Iteration 1**: LLM decides to call `korean_financial_search`
3. **Meta-Tool Routing**: Inner LLM selects `get_income_statements(corpCode: "00126380", year: 2023, fsDiv: "CFS")`
4. **OpenDART API Call**: Fetch income statement, rate limited, cached if successful
5. **AccountMapper**: Map "영업이익" → `operating_income` concept
6. **Tool Result**: Return normalized data with metadata
7. **Scratchpad Append**: Record tool call + result (token counted)
8. **Agent Iteration 2**: LLM analyzes result, may call more tools or finish
9. **Final Answer**: Separate LLM call with full scratchpad → "삼성전자의 2023년 영업이익률은 10.2%로..." (markdown formatted)
10. **DoneEvent**: Stream final answer + metadata (tool calls: 1, iterations: 2, time: 3.2s, tokens: 15.2k)

## Cross-References

- [[type-system|Type System]] - All TypeScript interfaces
- [[dexter-mapping|Dexter Mapping]] - What we keep/modify/replace
- [[dependency-graph|Dependency Graph]] - Implementation order
- [[../implementation/corp-code-resolver|Corp Code Resolver Implementation]]
- [[../implementation/opendart-client|OpenDART Client Implementation]]
- [[../implementation/kis-client|KIS Client Implementation]]
- [[../evaluation/eval-dataset|Evaluation Dataset Design]]
