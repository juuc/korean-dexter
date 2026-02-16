---
title: "Define Target User Persona"
issue: 20
phase: 1-foundation
priority: critical
status: planned
type: research
created: 2026-02-16
depends_on: []
blocks: ["[[phase-1-foundation/03-scaffold]]"]
tags: [research, user-persona, product-strategy]
estimated_effort: medium
---

# Issue #20: Define Target User Persona

## Problem

Korean Dexter could serve multiple user types with conflicting needs. We must choose a primary persona to guide product decisions: CLI vs library? English support? Required technical sophistication?

## Persona Candidates

### 1. Korean Individual Investors (개인투자자)

**Profile**:
- Age: 25-45
- Tech literacy: Medium (can use Naver Finance, basic Excel)
- English proficiency: Low to medium
- Current tools: Naver Finance, YouTube stock channels, KakaoTalk stock groups
- Pain points:
  - Information overload on Naver Finance (too many numbers, no synthesis)
  - Cannot quickly compare multiple companies
  - Don't understand financial statement implications
  - Rely on influencer opinions instead of data

**Example Use Case**:
"삼성전자와 SK하이닉스 중 어느 게 투자하기 좋을까?" → Korean Dexter compares ROE, debt ratios, profit margins, recent trends, and explains trade-offs.

**"10x Better" Moment**:
Gets reasoned investment thesis in 30 seconds vs spending 2 hours reading Naver Finance tables + YouTube videos.

**Technical Requirements**:
- Simple CLI with Korean prompts
- No coding required
- Accessible on Windows/Mac
- Free (API keys with free tiers)

---

### 2. Junior Financial Analysts (주니어 애널리스트)

**Profile**:
- Age: 25-35
- Role: Research associate at asset management firm, securities company, or corporate finance team
- Tech literacy: High (Excel, Python basics, Bloomberg/FnGuide)
- English proficiency: High
- Current tools: FnGuide, dart-fss, Excel macros, Bloomberg (if available)
- Pain points:
  - Spend 3-5 hours pulling data from multiple sources for a single analysis
  - Manual formatting of DART data into Excel
  - Senior analysts expect quick turnaround on ad-hoc questions
  - Tedious cross-referencing between DART filings and market data

**Example Use Case**:
"2023년 배터리 3사(LG에너지솔루션, 삼성SDI, SK온) ROE와 영업이익률 추이 비교해줘" → Korean Dexter pulls 3 years of data, calculates ratios, generates comparison table.

**"10x Better" Moment**:
Reduces 3-hour data pull + formatting task to 5-minute LLM query. Spends more time on insight generation, less on data wrangling.

**Technical Requirements**:
- CLI + potential Python library integration
- Export to CSV/Excel for further analysis
- Batch query support
- English and Korean queries

---

### 3. International Investors (Non-Korean)

**Profile**:
- Location: US, Europe, Singapore
- Interest: Exposure to Korean tech (Samsung, SK, Naver) or emerging KOSDAQ names
- Tech literacy: High (use Bloomberg, Reuters, FinTwit)
- English proficiency: Native
- Korean proficiency: Zero
- Current tools: Bloomberg (expensive, limited Korean coverage), Google Translate + Naver Finance (painful)
- Pain points:
  - Language barrier to Korean financial filings
  - Limited English-language analysis of Korean small/mid-caps
  - Naver Finance in Korean only
  - Bloomberg Korea coverage focuses on large-caps only

**Example Use Case**:
"What's Kakao's debt situation after the recent regulatory issues?" → Korean Dexter fetches latest DART filings, translates context, explains debt ratio trend.

**"10x Better" Moment**:
Access to Korean fundamental data in English without paying for Bloomberg or learning Korean.

**Technical Requirements**:
- English query support (MUST HAVE)
- English explanations of Korean financial terms
- Ticker-based queries (not Korean company names)
- Accessible API key registration (no Korean residency requirement)

**BLOCKER RISK**: If OpenDART/KIS require Korean residency for API access, this persona is **dead**. Depends on [[phase-1-foundation/01-assumptions|Assumption #6]].

---

### 4. Korean Quant/Data Engineers (퀀트 개발자)

**Profile**:
- Age: 28-40
- Role: Quantitative analyst, algorithmic trader, data engineer at prop shop or hedge fund
- Tech literacy: Very high (Python, SQL, AWS, REST APIs)
- Current tools: dart-fss, pykrx, FinanceDataReader, custom scrapers
- Pain points:
  - Building data pipelines from scratch (DART API is verbose)
  - Rate limiting on free APIs
  - Data quality issues (missing data, format changes)
  - No unified interface across Korean financial data sources

**Example Use Case**:
Uses Korean Dexter as a library: `await dexter.query("Get 5-year ROE for KOSPI top 100")` → returns structured data for backtesting system.

**"10x Better" Moment**:
Replaces 500 lines of custom DART parsing code with a clean LLM agent interface.

**Technical Requirements**:
- Python/TypeScript library (not just CLI)
- Structured output (JSON, not prose)
- Programmatic access
- Rate limiting and caching built-in

---

## Decision Framework

| Criterion | Individual Investor | Junior Analyst | International | Quant/Engineer |
|-----------|---------------------|----------------|---------------|----------------|
| **Market Size** | 🟢 Large (millions) | 🟡 Medium (thousands) | 🟢 Large (global) | 🟡 Small (hundreds) |
| **Willingness to Pay** | 🔴 Low | 🟢 High | 🟢 High | 🟢 High |
| **Technical Barrier** | 🟢 Low (CLI) | 🟡 Medium | 🟡 Medium | 🔴 High (library) |
| **API Access Risk** | 🟢 Low | 🟢 Low | 🔴 **HIGH** (residency?) | 🟢 Low |
| **Differentiation** | 🟢 Strong vs Naver | 🟢 Strong vs FnGuide | 🟢 Strong vs Bloomberg | 🟡 Medium vs dart-fss |
| **MVP Feasibility** | 🟢 High | 🟢 High | 🔴 **Depends on Assumption #6** | 🟡 Medium |

---

## Recommendation (TBD After Assumption Validation)

### If Assumption #6 Passes (International Access OK)

**Primary Persona**: International Investors
**Secondary Persona**: Junior Analysts

**Rationale**:
- Strongest differentiation (no good alternative for English-language Korean fundamental analysis)
- Global market reach
- High willingness to pay (future monetization potential)
- Validates product-market fit beyond Korea

**Product Implications**:
- English-first interface (Korean support secondary)
- Ticker-based queries (`005930` not `삼성전자`)
- Explanations that contextualize Korean accounting practices for non-Koreans
- CLI tool (not library) for MVP

### If Assumption #6 Fails (Korean Residency Required)

**Primary Persona**: Korean Individual Investors
**Secondary Persona**: Junior Analysts

**Rationale**:
- Largest addressable market within Korea
- Clear pain point (Naver Finance information overload)
- Low technical barrier (CLI, not library)
- Strong word-of-mouth potential in Korean investment communities

**Product Implications**:
- Korean-first interface
- Company name queries (`삼성전자` not `005930`)
- Simple CLI optimized for non-technical users
- Focus on investment thesis generation, not data export

---

## Research Tasks

- [ ] Validate international API access ([[phase-1-foundation/01-assumptions|Assumption #6]])
- [ ] User interviews (5-10 people across personas)
  - Korean retail investors: What's frustrating about Naver Finance?
  - Junior analysts: What takes the most time in your workflow?
  - International investors: How do you research Korean stocks today?
- [ ] Competitive analysis cross-check ([[phase-1-foundation/02-competitive-analysis|Issue #2]]): Which persona has the weakest existing solutions?

---

## Acceptance Criteria

- [ ] Primary persona selected with justification
- [ ] Secondary persona identified (if applicable)
- [ ] `docs/target-user.md` created with:
  - Persona profile (demographics, pain points, current tools)
  - User journey map (before/after Korean Dexter)
  - Product implications (CLI vs library, English vs Korean, features)
  - Success metrics (how do we measure if we're solving their problem?)
- [ ] Decision rationale documented (why this persona over others)

---

## Deliverable

`docs/target-user.md` with persona definition and product strategy implications.

---

## Timeline

**Effort**: Medium (1-2 days including user interviews)
**Parallelizable**: Partially (research concurrent with [[phase-1-foundation/01-assumptions|assumptions]] and [[phase-1-foundation/02-competitive-analysis|competitive analysis]])

---

## Dependencies

- [[phase-1-foundation/01-assumptions|Assumption #6]] (international access) is critical input

---

## Blocks

- [[phase-1-foundation/03-scaffold|Fork & Scaffold]] — persona determines product architecture (CLI vs library, English vs Korean)
