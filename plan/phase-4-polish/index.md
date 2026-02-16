# Phase 4: Polish & Extended Integrations

## Overview

**Timeline**: Week 8+
**Goal**: Polish the experience — demo mode for easy onboarding, and v1.1 API integrations for macro context.

## Purpose

Phase 4 transforms Korean Dexter from a technical proof-of-concept into a polished, user-friendly product. We solve the brutal onboarding problem (2+ API keys, Korean brokerage account) with demo mode, and extend analytical depth with macro-economic context (BOK, KOSIS, BigKinds).

## Key Objectives

1. **Demo Mode**: Pre-recorded data for 5-10 companies, zero API keys required
2. **BOK Integration**: Bank of Korea economic statistics (base rate, exchange rate, GDP, CPI)
3. **KOSIS Integration**: National statistics for industry-level context
4. **BigKinds Integration**: Korean news search replacing Exa/Tavily

## Issues in This Phase

| Issue | Title | Priority | Effort |
|-------|-------|----------|--------|
| [[phase-4-polish/19-demo-mode\|#19]] | Demo Mode with Cached Data | high | large |
| [[phase-4-polish/16-bok\|#16]] | BOK Economic Statistics Integration | medium | medium |
| [[phase-4-polish/17-kosis\|#17]] | KOSIS National Statistics Integration | medium | medium |
| [[phase-4-polish/18-bigkinds\|#18]] | BigKinds Korean News Search Integration | medium | medium |

## Dependencies

**Required from Phase 2**:
- All core agent functionality complete
- Working agent that can answer questions

**Optional**:
- [[phase-3-eval/12-eval-dataset|#12 Eval Dataset]] — demo mode answers can become eval fixtures

## Deliverables

### Demo Mode (#19)
- Pre-recorded data for 5-10 companies (삼성전자, SK하이닉스, 현대차, 카카오, 네이버)
- `DEMO_MODE=true` env var or `--demo` CLI flag
- Clear labeling: "Demo mode — using cached data from 2025-01-15"
- Demo questions pre-loaded for easy testing

### BOK Integration (#16)
- `getBaseInterestRate` tool (table 722Y001)
- `getExchangeRate` tool (USD/KRW, table 731Y003)
- `getGDPGrowth` tool (table 200Y002)
- `getConsumerPriceIndex` tool (CPI, table 021Y126)
- System prompt guidance for when to use macro data

### KOSIS Integration (#17)
- 10-20 pre-mapped industry datasets
- `getIndustryStats(industry, period)` tool
- LLM-assisted discovery of relevant stats

### BigKinds Integration (#18)
- `searchKoreanNews(query, dateRange)` tool
- `getNewsAnalysis(query)` tool (keyword trends, sentiment)
- Replaces Exa/Tavily for Korean context

## Success Criteria

- [ ] Demo mode works with zero API keys
- [ ] Demo mode covers 5-10 popular companies
- [ ] BOK tools return accurate macro data
- [ ] KOSIS tools return industry statistics
- [ ] BigKinds tools return Korean news context
- [ ] Agent knows when to use macro/news context
- [ ] All v1.1 integrations have rate limiting
- [ ] Documentation for demo mode and v1.1 APIs

## Timeline

- **Week 8**: Demo mode implementation
- **Week 9+**: v1.1 API integrations (BOK, KOSIS, BigKinds)

## Risks

See [[risks#api-key-barriers|API key registration barriers]] — mitigated by demo mode
See [[risks#kosis-discovery|KOSIS discovery challenge]] — mitigated by pre-mapping

## Notes

- Demo mode is critical for user acquisition — removes all onboarding friction
- v1.1 integrations are NOT required for MVP, but add significant analytical depth
- BOK/KOSIS/BigKinds have simpler registration than DART/KIS
- Demo mode data can be repurposed as eval fixtures
