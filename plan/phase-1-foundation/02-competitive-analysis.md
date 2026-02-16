---
title: "Competitive Analysis"
issue: 2
phase: 1-foundation
priority: critical
status: planned
type: research
created: 2026-02-16
depends_on: []
blocks: ["[[phase-1-foundation/03-scaffold]]"]
tags: [research, competitive-analysis, differentiation]
estimated_effort: medium
---

# Issue #2: Competitive Analysis

## Problem

Before building Korean Dexter, we must understand the existing landscape of Korean financial tools and clearly articulate our differentiation. "Why not just use Naver Finance?"

## Competitive Landscape

### 1. dart-fss (Python Library)

**URL**: https://github.com/josw123/dart-fss

**Strengths**:
- Mature, well-tested OpenDART wrapper
- Comprehensive coverage of DART API endpoints
- Active maintenance
- Pandas integration for data analysis

**Weaknesses**:
- Data access only, zero reasoning capability
- Python-only (not accessible to non-Python users)
- Requires manual data interpretation
- No cross-API synthesis (DART only)

**Target User**: Python data analysts who want structured DART data access

**Comparison to Korean Dexter**: dart-fss gets the data, Korean Dexter *understands* the data.

---

### 2. korea-stock-mcp (MCP Server)

**URL**: https://github.com/[search for this]

**Strengths**:
- LLM-friendly MCP interface
- Designed for agentic workflows
- Modern architecture

**Weaknesses**:
- Limited scope (stock prices only?)
- No financial statement analysis
- Unclear if it integrates OpenDART

**Target User**: Developers building LLM applications with Korean stock data

**Comparison to Korean Dexter**: Similar architecture (MCP), but Korean Dexter targets comprehensive financial analysis, not just price data.

---

### 3. FinanceDataReader (Python Library)

**URL**: https://github.com/FinanceData/FinanceDataReader

**Strengths**:
- Simple, clean API
- Multi-source aggregation (KRX, Naver, etc.)
- Popular in Korean quant community

**Weaknesses**:
- No financial statements (stock prices only)
- No DART integration
- No reasoning layer

**Target User**: Korean quant traders and data scientists

**Comparison to Korean Dexter**: FinanceDataReader is for time-series price data, Korean Dexter is for fundamental analysis.

---

### 4. OpenDartReader (Python Library)

**URL**: https://github.com/FinanceData/OpenDartReader

**Strengths**:
- Clean OpenDART wrapper
- Pandas DataFrame output
- Well-documented

**Weaknesses**:
- Python-only
- Raw data access, no interpretation
- No cross-validation with market data

**Target User**: Python analysts doing fundamental research

**Comparison to Korean Dexter**: Same data source (OpenDART), but Korean Dexter adds LLM reasoning and multi-source synthesis.

---

### 5. pykrx (Python Library)

**URL**: https://github.com/sharebook-kr/pykrx

**Strengths**:
- Official KRX (Korea Exchange) data
- Comprehensive exchange-level data
- Investor flow data (외국인/기관)

**Weaknesses**:
- Exchange data only, no corporate filings
- No DART integration
- No reasoning

**Target User**: Korean traders analyzing market microstructure

**Comparison to Korean Dexter**: pykrx provides market data, Korean Dexter synthesizes fundamental + market analysis.

---

### 6. Naver Finance (Web Portal)

**URL**: https://finance.naver.com

**Strengths**:
- Comprehensive, free
- Real-time data
- Korean-language interface
- Trusted by millions of Korean investors

**Weaknesses**:
- No API (web scraping required)
- No reasoning or synthesis
- Manual analysis required
- Cannot answer "Why?" questions

**Target User**: Korean retail investors

**Comparison to Korean Dexter**: **THIS IS THE KEY COMPARISON**. Naver Finance *shows* data, Korean Dexter *synthesizes* analysis. "삼성전자 재무상태 어때?" → Naver shows tables, Korean Dexter explains: "부채비율 감소 추세, 영업이익률 업계 평균 대비 높음, 하지만 R&D 투자 증가로 단기 수익성 압박 가능성".

---

### 7. FnGuide DataGuide (Professional Terminal)

**URL**: https://www.fnguide.com/

**Strengths**:
- Institutional-grade data quality
- Comprehensive coverage
- Real-time analyst estimates
- Historical consensus data

**Weaknesses**:
- Expensive (₩수백만/year)
- No AI reasoning
- Steep learning curve
- Designed for professional analysts, not accessible to retail

**Target User**: Professional buy-side/sell-side analysts

**Comparison to Korean Dexter**: FnGuide is authoritative data, Korean Dexter democratizes analysis. Korean Dexter won't match FnGuide's data breadth, but provides *accessible agentic reasoning* at near-zero cost.

---

## Differentiation Matrix

| Tool | Data Access | Reasoning | Multi-Source | Korean Support | Cost | Target User |
|------|-------------|-----------|--------------|----------------|------|-------------|
| dart-fss | ✅✅ | ❌ | ❌ | ✅ | Free | Python analysts |
| korea-stock-mcp | ✅ | ⚠️ | ❌ | ✅ | Free | LLM developers |
| FinanceDataReader | ✅ | ❌ | ⚠️ | ✅ | Free | Quant traders |
| OpenDartReader | ✅✅ | ❌ | ❌ | ✅ | Free | Python analysts |
| pykrx | ✅ | ❌ | ❌ | ✅ | Free | Market analysts |
| Naver Finance | ✅✅✅ | ❌ | ✅✅ | ✅✅ | Free | Retail investors |
| FnGuide | ✅✅✅ | ❌ | ✅✅✅ | ✅✅ | ₩₩₩ | Professionals |
| **Korean Dexter** | ✅✅ | ✅✅✅ | ✅✅ | ✅✅ | Free | Everyone |

**Key**: ❌ None, ⚠️ Limited, ✅ Basic, ✅✅ Good, ✅✅✅ Excellent

---

## Korean Dexter's Value Proposition

**"The first autonomous AI financial analyst for Korean markets."**

### Core Differentiation

1. **Agentic Reasoning**: Not just data access — *understands* and *synthesizes* financial statements
2. **Multi-Source Synthesis**: Combines OpenDART (fundamentals) + KIS (market data) + future sources
3. **Korean-Native**: Handles 조원/억원 scales, consolidated vs separate statements, Korean accounting standards
4. **Accessible**: CLI tool, not a Python library — usable by non-programmers
5. **Scratchpad Memory**: Maintains context across queries, builds on prior analysis

### "Why Not Just Use..." Answers

**Q: Why not just use Naver Finance?**
A: Naver shows data tables. Korean Dexter explains *why* the numbers matter. "삼성전자 부채비율이 30%인데 이게 좋은 건가요?" → Korean Dexter compares to industry average, explains trend, contextualizes with business model.

**Q: Why not just use dart-fss in Python?**
A: dart-fss requires you to write code, parse DataFrames, and interpret manually. Korean Dexter lets you ask in natural language and get reasoned analysis.

**Q: Why not just ask ChatGPT about Korean stocks?**
A: ChatGPT has no real-time data access and hallucinates financial figures. Korean Dexter fetches live data from authoritative sources (OpenDART, KIS) and reasons on facts.

**Q: Why not use FnGuide?**
A: FnGuide costs hundreds of thousands of won per year and requires training. Korean Dexter is free and conversational.

---

## Research Tasks

- [ ] Verify all competitor URLs and features
- [ ] Test dart-fss and OpenDartReader APIs to understand data formats
- [ ] Check if korea-stock-mcp includes OpenDART integration
- [ ] Document Naver Finance data breadth (baseline for "good enough")
- [ ] Research FnGuide pricing and feature set
- [ ] Identify any missed competitors (Korean fintech startups?)

---

## Acceptance Criteria

- [ ] `docs/competitive-analysis.md` created with:
  - Detailed competitor profiles (7+ tools)
  - Feature comparison matrix
  - Differentiation summary
  - "Why not just use X?" answers for top 3 competitors
- [ ] Differentiation validated with potential users (optional: user interviews)

---

## Deliverable

`docs/competitive-analysis.md` with comprehensive landscape analysis.

---

## Timeline

**Effort**: Medium (1-2 days)
**Parallelizable**: Yes (can run concurrently with [[phase-1-foundation/01-assumptions|assumptions validation]])

---

## Dependencies

None. This is research that informs strategy.

---

## Blocks

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] — understanding the landscape clarifies what we're building
