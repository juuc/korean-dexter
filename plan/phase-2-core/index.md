---
title: "Phase 2: Core Agent"
phase: 2-core
status: planned
timeline: "Week 3-5"
created: 2026-02-16
---

# Phase 2: Core Agent

**Goal**: Build the core agent — API clients, financial tools, Korean system prompt, and agent intelligence.

**Timeline**: Week 3-5

**Dependencies**: Phase 1 (Foundation) must be complete.

## Overview

Phase 2 transforms the scaffolded project into a functional Korean financial research agent. This phase implements the two primary data sources (OpenDART for financial statements, KIS for market data), builds the two-layer tool architecture, and rewrites all prompts for Korean financial domain.

Critical challenge: Korean financial data is structurally different from US markets. Consolidated vs separate statements, K-IFRS account name variations, Korean number formatting, and token-heavy responses require specialized handling.

## Issues

### Critical Path (Must Complete First)

1. **[[phase-2-core/06-opendart|Issue #6: OpenDART API Client & Financial Statement Tools]]**
   - Priority: Critical, Effort: XLarge
   - Backbone of the system. All financial statements, disclosures, shareholding data.
   - Two-layer architecture: meta-tool → sub-tools
   - Consolidated/separate fallback logic, amount parsing, K-IFRS account names

2. **[[phase-2-core/08-kis|Issue #8: KIS API Client with OAuth Token Lifecycle]]**
   - Priority: Critical, Effort: Large
   - Real-time market data, stock prices, investor flows
   - OAuth token lifecycle management with disk persistence
   - Single-writer pattern for concurrent access

3. **[[phase-2-core/09-account-mapper|Issue #9: AccountMapper for K-IFRS Account Name Normalization]]**
   - Priority: Critical, Effort: Large
   - Normalize varying Korean account names to canonical concepts
   - Essential for reliable financial statement parsing
   - Hardcoded mapping with 30-40 key K-IFRS metrics

4. **[[phase-2-core/07-prompts|Issue #7: Korean Financial System Prompt & Agent Prompt Engineering]]**
   - Priority: Critical, Effort: Large
   - Complete rewrite of Dexter's prompts.ts for Korean domain
   - System prompt with K-IFRS knowledge, tool policies, number formatting rules
   - Korean language output with financial domain expertise

### Infrastructure & Optimization

5. **[[phase-2-core/13-scratchpad|Issue #13: Recalibrate Scratchpad Token Budget for Korean Data]]**
   - Priority: High, Effort: Medium
   - Korean text is 2-3x more tokens than English
   - Adjust context thresholds, implement tool result compaction

6. **[[phase-2-core/14-error-handling|Issue #14: Error Handling & Graceful Degradation]]**
   - Priority: High, Effort: Medium
   - Korean API-specific failure modes
   - Never fail silently, graceful degradation strategies

7. **[[phase-2-core/15-consolidated|Issue #15: Handle Consolidated vs Separate Financial Statements]]**
   - Priority: High, Effort: Medium
   - Fundamental data selection problem for Korean market
   - CFS-first policy, never mix statement types, metadata tracking

## Success Criteria

- [x] OpenDART client can fetch Samsung 2024 annual financials (both key and full)
- [x] KIS client can get real-time Samsung stock price
- [x] AccountMapper normalizes "매출액" → "revenue" reliably
- [x] Agent responds in Korean with proper 조원/억원/만원 formatting
- [ ] Token budget handles typical Korean financial query without context overflow
- [ ] Error messages are clear and actionable in Korean
- [ ] Consolidated statements preferred, separate as fallback, never mixed

## Risks

- **Korean token overhead**: May need to lower context threshold more aggressively
- **Account name variance**: Hardcoded mapper may miss edge cases
- **KIS token lifecycle**: OAuth re-issuance limits require careful disk persistence
- **Consolidated data availability**: Some companies only have separate statements
