---
title: "Korean Dexter - Master Plan"
status: pre-development
created: 2026-02-16
tech_stack: [Bun, TypeScript, Claude, LangSmith]
data_sources: [OpenDART, KIS, BOK, KOSIS, BigKinds]
upstream: virattt/dexter
tags:
  - index
  - dashboard
---

# Korean Dexter - Master Plan

> An autonomous AI financial research agent for the Korean market.
> Ask a question in Korean -> Get a synthesized financial analysis with citations.

## Architecture

- [[architecture/overview|System Architecture]] - Agent loop, tool system, event streaming
- [[architecture/type-system|Type System]] - All TypeScript interfaces and types
- [[architecture/dexter-mapping|Dexter Mapping]] - What we keep/replace from upstream
- [[architecture/dependency-graph|Dependency Graph]] - Issue dependencies and critical path

## Phases

### Phase 1: Foundation (Week 1-2)
> Infrastructure, data model, core utilities

| Issue | Plan | Priority | Type |
|-------|------|----------|------|
| #1 | [[phase-1-foundation/01-assumptions\|Validate Assumptions]] | critical | research |
| #2 | [[phase-1-foundation/02-competitive-analysis\|Competitive Analysis]] | critical | research |
| #20 | [[phase-1-foundation/20-user-persona\|User Persona]] | critical | research |
| #3 | [[phase-1-foundation/03-scaffold\|Fork & Scaffold]] | critical | infra |
| #4 | [[phase-1-foundation/04-corp-resolver\|Corp Code Resolver]] | critical | feature |
| #5 | [[phase-1-foundation/05-data-model\|Cross-API Data Model]] | critical | infra |
| #10 | [[phase-1-foundation/10-rate-limiter\|Rate Limiter]] | critical | infra |
| #11 | [[phase-1-foundation/11-cache\|Caching Layer]] | critical | infra |

### Phase 2: Core Agent (Week 3-5)
> API clients, agent prompts, financial tools

| Issue | Plan | Priority | Type |
|-------|------|----------|------|
| #6 | [[phase-2-core/06-opendart\|OpenDART Client]] | critical | feature |
| #8 | [[phase-2-core/08-kis\|KIS Client]] | critical | feature |
| #9 | [[phase-2-core/09-account-mapper\|AccountMapper]] | critical | feature |
| #7 | [[phase-2-core/07-prompts\|Korean System Prompt]] | critical | feature |
| #13 | [[phase-2-core/13-scratchpad\|Scratchpad Recalibration]] | high | infra |
| #14 | [[phase-2-core/14-error-handling\|Error Handling]] | high | infra |
| #15 | [[phase-2-core/15-consolidated\|Consolidated vs Separate]] | high | feature |

### Phase 3: Evaluation (Week 6-7)
> Korean financial Q&A dataset, eval pipeline

| Issue | Plan | Priority | Type |
|-------|------|----------|------|
| #12 | [[phase-3-eval/12-eval-dataset\|Eval Dataset (200+)]] | critical | eval |

### Phase 4: Polish (Week 8+)
> Demo mode, v1.1 API integrations

| Issue | Plan | Priority | Type |
|-------|------|----------|------|
| #19 | [[phase-4-polish/19-demo-mode\|Demo Mode]] | high | feature |
| #16 | [[phase-4-polish/16-bok\|BOK Integration]] | medium | feature |
| #17 | [[phase-4-polish/17-kosis\|KOSIS Integration]] | medium | feature |
| #18 | [[phase-4-polish/18-bigkinds\|BigKinds Integration]] | medium | feature |

## Cross-Cutting Concerns

- [[risks|Risk Registry]] - All identified risks with mitigations
- [[architecture/dependency-graph|Critical Path]] - What blocks what

## Quick Links

- [GitHub Issues](https://github.com/juuc/korean-dexter/issues)
- [Upstream Dexter](https://github.com/virattt/dexter)
- [OpenDART API](https://opendart.fss.or.kr/guide/main.do)
- [KIS API Portal](https://apiportal.koreainvestment.com)
