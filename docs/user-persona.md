# User Persona & Value Proposition: Korean Dexter

**Last Updated**: 2026-02-17
**Status**: Final recommendation based on validated assumptions

---

## Executive Summary

Korean Dexter targets **Korean individual investors (개인투자자)** as the primary persona, with **junior financial analysts** as a strong secondary market. The decision is based on validated API access (Assumption #6 skipped, focusing on Korean market), largest addressable market, and clear differentiation from existing tools.

**One-sentence pitch**: "The first conversational AI financial analyst for Korean stocks—ask questions in Korean, get reasoned analysis backed by real DART and KIS data in seconds."

---

## Primary Persona: Korean Individual Investor (개인투자자)

### Demographics

| Attribute | Profile |
|-----------|---------|
| **Age** | 25-45 years old |
| **Occupation** | Office workers, small business owners, self-employed professionals |
| **Tech Literacy** | Medium (comfortable with Naver Finance, KakaoTalk, basic Excel) |
| **English Proficiency** | Low to medium (prefers Korean interface) |
| **Investment Experience** | 1-5 years, mostly retail trading on Korean exchanges |
| **Monthly Income** | ₩3-8 million (middle class) |
| **Investment Portfolio** | ₩10-100 million (mostly Korean stocks, some ETFs) |

### Current Tools & Workflow

**Tools Used**:
- **Naver Finance** (primary) — view stock prices, basic financials
- **YouTube stock channels** — investment ideas, trend analysis
- **KakaoTalk stock groups** — peer opinions, hot tips
- **Securities firm mobile apps** — trading execution

**Typical Research Workflow** (Before Korean Dexter):
1. See a stock mentioned on YouTube or KakaoTalk
2. Look up basic info on Naver Finance (current price, market cap)
3. Browse financial tables without understanding implications
4. Search for more YouTube videos explaining the stock
5. Ask friends/online communities for opinions
6. Make investment decision based on sentiment, not data

**Time Spent**: 2-4 hours per stock, still uncertain about decision

### Pain Points

| Problem | Severity | Current Workaround |
|---------|----------|-------------------|
| **Information overload on Naver Finance** | HIGH | Give up, rely on influencer opinions |
| **Cannot interpret financial statements** | HIGH | Ignore fundamentals, focus on price momentum |
| **Tedious multi-company comparison** | MEDIUM | Manual spreadsheet copy-paste from Naver |
| **Don't understand "연결 vs 별도"** | MEDIUM | Assume all numbers are the same |
| **No synthesis across data sources** | HIGH | Miss connections between filings and price movements |
| **Distrust of influencer hype** | MEDIUM | Seek multiple sources, still confused |

**Quote**: "네이버 금융에 숫자는 많은데, 이게 좋은 건지 나쁜 건지 모르겠어요. 그냥 유튜브 보고 따라 사게 돼요."
*Translation: "Naver Finance has lots of numbers, but I don't know if they're good or bad. I just end up copying what I see on YouTube."*

### Goals & Motivations

**Primary Goal**: Make informed investment decisions without spending hours on research or relying solely on influencers.

**Success Metrics**:
- Understand why a stock's fundamentals are strong/weak
- Compare 2-3 stocks quickly (same sector comparison)
- Feel confident in investment thesis before buying
- Reduce time from research to decision

**Investment Philosophy**: Value-conscious, prefers fundamentals over speculation, but lacks tools to execute this approach efficiently.

### User Journey (After Korean Dexter)

**Scenario**: Researching "현대차 vs 기아" after hearing about strong automotive sector performance.

| Step | Before Korean Dexter | After Korean Dexter | Time Saved |
|------|---------------------|---------------------|------------|
| 1. Find basic info | Open Naver Finance twice, check prices manually | `현대차와 기아 현재 주가 알려줘` | 3 min |
| 2. Get financials | Navigate DART tables, copy to Excel | Automatic in context | 15 min |
| 3. Calculate ratios | Manual calculation or skip | Automatic (ROE, debt ratio, margins) | 10 min |
| 4. Compare trends | Build chart in Excel or skip | Korean Dexter synthesizes trends | 20 min |
| 5. Understand implications | Watch YouTube, read community posts | Korean Dexter explains: "기아 영업이익률 higher, but 현대차 has stronger EV pipeline" | 30 min |
| **Total** | **2-3 hours** | **2-5 minutes** | **~2.5 hours** |

**"10x Better" Moment**: Gets a reasoned investment thesis in 30 seconds instead of spending 2 hours reading Naver Finance tables and watching YouTube videos.

### Technical Requirements

- **Interface**: Simple CLI with Korean prompts, no coding required
- **Language**: Korean-first (both input and output)
- **Installation**: One-command setup on Mac/Windows (Bun + API keys)
- **Cost**: Free tier (using free OpenDART + KIS paper trading + Gemini)
- **Output Format**: Plain Korean text with tables, no technical jargon
- **Learning Curve**: Zero — just ask questions naturally

---

## Secondary Persona: Junior Financial Analyst (주니어 애널리스트)

### Demographics

| Attribute | Profile |
|-----------|---------|
| **Age** | 25-35 years old |
| **Occupation** | Research associate at asset management, securities firm, or corporate finance |
| **Tech Literacy** | High (Excel power user, Python basics, Bloomberg/FnGuide) |
| **English Proficiency** | High (reads English research reports) |
| **Experience** | 1-4 years in financial analysis |

### Current Tools & Workflow

**Tools Used**:
- **FnGuide** (if company pays) — professional data terminal
- **dart-fss** (Python library) — manual data extraction
- **Excel macros** — data formatting and ratio calculations
- **Bloomberg** (if available) — limited Korean coverage

**Typical Research Workflow**:
1. Senior analyst requests: "Compare battery sector ROE trends (3 companies, 5 years)"
2. Pull data from DART using dart-fss or manual download
3. Clean and format in Excel (handle missing data, 연결/별도)
4. Calculate ratios, build comparison tables
5. Format for PowerPoint deck
6. Repeat for next ad-hoc request

**Time Spent**: 3-5 hours per multi-company analysis

### Pain Points

| Problem | Severity | Current Workaround |
|---------|----------|-------------------|
| **Tedious data pull from multiple sources** | HIGH | Write custom Python scripts (time-consuming) |
| **Manual DART formatting into Excel** | HIGH | Copy-paste, regex cleaning, manual validation |
| **Senior expects quick turnaround on ad-hoc questions** | CRITICAL | Work late, sacrifice quality for speed |
| **No unified interface across DART + KIS + BOK** | MEDIUM | Maintain separate data pipelines |
| **Repetitive ratio calculations** | LOW | Excel templates (works but inflexible) |

**Quote**: "3시간짜리 데이터 작업이 5분으로 줄면 분석에 집중할 수 있어요."
*Translation: "If I could cut a 3-hour data task to 5 minutes, I could focus on actual analysis."*

### Goals & Motivations

**Primary Goal**: Spend less time on data wrangling, more time on insight generation.

**Success Metrics**:
- Reduce data pull time from hours to minutes
- Increase analysis quality (more time for interpretation)
- Handle more ad-hoc requests from seniors without overtime
- Build reputation for fast turnaround

**"10x Better" Moment**: Reduces 3-hour data pull + formatting task to 5-minute query. Delivers preliminary analysis in 30 minutes instead of next day.

### Technical Requirements

- **Interface**: CLI (fast) + potential Python library for automation
- **Language**: Korean and English queries (reads English reports)
- **Output Format**: Both prose (for quick checks) and structured (for Excel export)
- **Features**: Batch queries, CSV export, historical comparisons

---

## Tertiary Persona: International Investor (Conditional)

**Status**: Deprioritized for MVP due to uncertainty around API access requirements.

**Profile**: Non-Korean investors seeking English-language access to Korean fundamental data.

**Blocker**: If OpenDART/KIS require Korean residency (Assumption #6), this persona becomes unviable.

**Decision**: Validate international API access in Phase 4. If feasible, add English interface as a stretch goal.

---

## Problem Statement

**For Korean individual investors**, existing financial research tools either:
1. Show raw data without synthesis (Naver Finance)
2. Require expensive subscriptions and training (FnGuide)
3. Depend on unverified influencer opinions (YouTube, KakaoTalk)

**The result**: Investors make decisions based on sentiment instead of fundamentals, not because they don't care about data, but because **interpreting financial statements is too time-consuming and technical**.

**Korean Dexter solves this** by making fundamental analysis accessible through conversational AI—ask in Korean, get reasoned analysis backed by authoritative sources (OpenDART, KIS) in seconds.

---

## Competitive Analysis

### Existing Solutions

| Tool | Strengths | Weaknesses | Target User |
|------|-----------|------------|-------------|
| **Naver Finance** | Free, comprehensive, real-time, trusted by millions | No synthesis or reasoning, manual analysis required | Retail investors (data display only) |
| **FnGuide** | Institutional-grade data, analyst estimates | Expensive (₩수백만/year), steep learning curve | Professional analysts |
| **dart-fss** | Mature Python library, comprehensive DART coverage | Requires coding, no reasoning, DART-only | Python data analysts |
| **OpenDartReader** | Clean API, Pandas integration | Python-only, no cross-source synthesis | Python analysts |
| **FinanceDataReader** | Simple API, multi-source prices | No financial statements, no DART | Quant traders |
| **pykrx** | Official KRX data, investor flows | No corporate filings, no reasoning | Market microstructure analysts |
| **Bloomberg** | Global standard, comprehensive | Very expensive, limited Korean small/mid-cap coverage | Institutional investors |

### Differentiation Matrix

| Dimension | Naver Finance | FnGuide | dart-fss | Korean Dexter |
|-----------|---------------|---------|----------|---------------|
| **Data Access** | ✅✅✅ Excellent | ✅✅✅ Excellent | ✅✅ Good | ✅✅ Good |
| **Reasoning** | ❌ None | ❌ None | ❌ None | ✅✅✅ Excellent |
| **Multi-Source Synthesis** | ✅✅ Good | ✅✅✅ Excellent | ❌ DART only | ✅✅ Good (DART + KIS) |
| **Korean Language Support** | ✅✅ Native | ✅✅ Native | ✅ Basic | ✅✅ Native |
| **Accessibility** | ✅✅✅ Web portal | ✅ Professional tool | 🔴 Requires Python | ✅✅ Simple CLI |
| **Cost** | Free | ₩₩₩ Expensive | Free | Free |
| **Learning Curve** | Low | High | Medium-High | **Zero** |

**Key Insight**: Korean Dexter is the **only tool that combines reasoning + multi-source data + conversational interface** at zero cost.

---

## Value Proposition

### Core Differentiation

**"The first autonomous AI financial analyst for Korean markets."**

1. **Agentic Reasoning**: Not just data access—**understands** and **synthesizes** financial statements
2. **Multi-Source Synthesis**: Combines OpenDART (fundamentals) + KIS (market data) + future sources (BOK, KOSIS, BigKinds)
3. **Korean-Native**: Handles 조원/억원 scales, consolidated vs separate statements, K-IFRS conventions
4. **Accessible**: CLI tool, not a Python library—usable by non-programmers
5. **Contextual Memory**: Builds on prior queries in a session

### "Why Not Just Use..." Answers

**Q: Why not just use Naver Finance?**
A: Naver shows data tables. Korean Dexter explains **why the numbers matter**.
Example: "삼성전자 부채비율이 30%인데 이게 좋은 건가요?" → Korean Dexter compares to industry average, explains trend, contextualizes with business model.

**Q: Why not just ask ChatGPT about Korean stocks?**
A: ChatGPT has no real-time data access and hallucinates financial figures. Korean Dexter fetches **live data from authoritative sources** (OpenDART, KIS) and reasons on facts.

**Q: Why not use FnGuide?**
A: FnGuide costs hundreds of thousands of won per year and requires training. Korean Dexter is **free and conversational**.

**Q: Why not just use dart-fss in Python?**
A: dart-fss requires you to write code, parse DataFrames, and interpret manually. Korean Dexter lets you **ask in natural language** and get reasoned analysis.

### Unique Value Propositions by Persona

| Persona | Unique Value |
|---------|--------------|
| **Individual Investor** | "Naver Finance explains what. Korean Dexter explains why." |
| **Junior Analyst** | "Turn a 3-hour data task into a 5-minute query." |
| **International Investor** (future) | "Access Korean fundamentals in English without Bloomberg." |

---

## Key Differentiators

### 1. Reasoning Layer (The Core Differentiator)

**What competitors provide**: Raw data, tables, charts
**What Korean Dexter provides**: Synthesized analysis with context

**Example Query**: "삼성전자 최근 실적 분석해줘"

**Naver Finance Response**:
```
[Displays table]
매출액: 67.4조원
영업이익: 6.6조원
당기순이익: 5.7조원
```

**Korean Dexter Response**:
```
삼성전자 2024년 4분기 실적 분석

【재무 성과】
  매출액:     67.4조원 (전년 동기 대비 -12.5%)
  영업이익:   6.6조원 (전년 동기 대비 -34.2%)
  영업이익률: 9.8%

【주요 발견】
- 메모리 반도체 가격 하락으로 영업이익 감소
- 모바일 부문은 플래그십 판매 호조로 수익성 개선
- 외국인 보유율 56.2%로 여전히 높은 관심 유지

【투자 관점】
영업이익률 감소는 업황 사이클 반영. 다만 현금흐름 양호하고
부채비율 낮아 재무 건전성은 우수. 반도체 업황 회복 시기가
주가 반등의 핵심 변수.
```

### 2. Multi-Source Integration

Combines data that users currently piece together manually:
- **OpenDART**: Financial statements, disclosures, shareholding
- **KIS**: Stock prices, investor flows, trading volumes
- **Future**: BOK (economic indicators), KOSIS (industry stats), BigKinds (news sentiment)

**Example**: "현대차 배당수익률 알려줘"
→ Korean Dexter fetches dividend history (DART) + current price (KIS) → calculates yield → compares to sector average.

### 3. Korean Financial Domain Expertise

**Built-in knowledge**:
- 조원/억원/만원 automatic scaling (never shows raw won amounts)
- Consolidated (연결) vs Separate (별도) statement handling
- K-IFRS account name recognition with variants
- Fiscal year misalignment handling (Samsung Dec vs Shinhan Mar)
- Korean investor classifications (개인/외국인/기관)

**Competitors fail here**: dart-fss returns raw numbers; Naver Finance shows both 연결/별도 without explaining difference.

### 4. Zero Learning Curve

**Competitors require**:
- Python knowledge (dart-fss, OpenDartReader)
- Terminal training (FnGuide)
- Manual table interpretation (Naver Finance)

**Korean Dexter requires**: Nothing. Just ask questions.

### 5. Validated Production Quality

Unlike hobby projects or research prototypes:
- **375 passing tests**, 1,294 assertions
- **Phase 3 evaluation system** with 50-question dataset, dual scoring (numeric + LLM-as-judge)
- **Rate limiting** and **caching** built-in from day 1
- **Error recovery**: CFS unavailable → auto-fallback to OFS
- **Fixture replay system** for deterministic testing

---

## Growth Opportunities

### Short-Term Expansion (Phase 4, v1.1)

| Feature | User Benefit | Target Persona |
|---------|--------------|----------------|
| **Demo Mode** | Try Korean Dexter without API keys (cached data for 5-10 companies) | New users, international testers |
| **BOK Integration** | Correlate company performance with macro indicators (interest rates, GDP, USD/KRW) | Junior analysts, macro-aware investors |
| **KOSIS Integration** | Industry-level context (e.g., "IT sector employment up 15% → Naver/Kakao hiring signals") | Sector rotation investors |
| **BigKinds News** | Sentiment analysis from Korean news (replace YouTube/community guessing) | Individual investors |

### Medium-Term Expansion (v1.2-2.0)

| Feature | User Benefit | New Persona |
|---------|--------------|-------------|
| **English Interface** | Access Korean fundamentals in English | International investors |
| **Web UI** | No CLI installation required | Less technical individual investors |
| **Batch Export** | CSV/Excel output for further analysis | Junior analysts, quants |
| **Slack/Discord Bot** | Share analysis in investment communities | KakaoTalk → Slack communities |
| **Watchlist Monitoring** | "Alert me when 삼성전자 ROE drops below 10%" | Active traders |

### Long-Term Vision (v2.0+)

| Feature | User Benefit | Market Impact |
|---------|--------------|---------------|
| **Python/TypeScript Library** | Programmatic access for algo traders | Attract quant/engineer persona |
| **Skill System** | Custom analysis workflows (DCF valuation, peer comps) | Professional-grade analysis for retail users |
| **Multi-User Mode** | Team collaboration on research | Small asset management firms |
| **Paid Tier** | Premium features (real-time alerts, advanced analysis) | Monetization path |

---

## Success Metrics

### User Adoption (6 months post-launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users | 500-1,000 | Unique users running queries weekly |
| Queries per user | 10-20/month | Median queries per active user |
| Retention (30-day) | 40%+ | Users who return after first session |
| NPS (Net Promoter Score) | 40+ | "Would you recommend Korean Dexter?" |

### Quality Metrics (Ongoing)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Eval dataset accuracy | 85%+ | Numeric validation + LLM-as-judge |
| Query success rate | 90%+ | Queries that complete without errors |
| Average response time | <5 seconds | Time from query to final answer |
| User-reported errors | <5% | "Korean Dexter gave wrong answer" feedback |

### Engagement Indicators

| Signal | What It Means |
|--------|---------------|
| Users ask follow-up questions | High engagement, trust in answers |
| Users compare 3+ companies in one session | Using for real investment research |
| Users share results in KakaoTalk/online | Word-of-mouth growth |
| Users request new features (BOK, KOSIS) | Deepening usage, not just curiosity |

---

## Product Implications

### MVP Feature Set (Based on Primary Persona)

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Korean-language CLI | P0 | Primary persona is Korean individual investor |
| Company name fuzzy matching | P0 | Users type "삼성" not "005930" |
| 조원/억원 formatting | P0 | Korean financial convention |
| Consolidated-first policy | P0 | Avoid confusion between CFS/OFS |
| Multi-company comparison | P1 | Core use case: "A vs B 중 어느 게 나아?" |
| English interface | P3 | Deprioritized (tertiary persona) |
| CSV export | P3 | Junior analyst feature, not MVP |

### Non-Goals for MVP

- Web UI (CLI is sufficient)
- Real-time alerting (static queries only)
- Python library (CLI first, library later)
- Mobile app (desktop CLI focus)

### Post-MVP Roadmap Priorities

1. **Demo mode** (removes API key barrier for new users)
2. **BOK integration** (macro context for analyst persona)
3. **English interface** (if Assumption #6 validates international access)
4. **KOSIS integration** (industry context)
5. **Web UI** (expand beyond technical users)

---

## Validation Plan

### User Research (Next Steps)

| Activity | Target | Timeline |
|----------|--------|----------|
| User interviews | 10-15 individual investors | Week 1-2 |
| Beta testing | 20-30 early adopters | Phase 3 (after eval system) |
| Community feedback | Korean investment forums (네이버 카페, 디시인사이드 주식갤) | Ongoing |

### Key Validation Questions

**For Individual Investors**:
- What frustrates you most about Naver Finance?
- How much time do you spend researching before buying a stock?
- Would you trust AI-generated financial analysis if it cites sources?
- What would make you switch from YouTube to a CLI tool?

**For Junior Analysts**:
- What tasks take the most time in your workflow?
- What tools would you pay for vs expect free?
- How important is English vs Korean interface?
- Would you use a CLI tool at work or need a library?

---

## Conclusion

Korean Dexter targets the **largest underserved market in Korean finance**: individual investors who want fundamental analysis but lack the time, tools, or expertise to interpret financial statements effectively.

**The gap**: Naver Finance shows data. FnGuide is too expensive. YouTube is unreliable. **Korean Dexter synthesizes authoritative data into reasoned analysis in seconds.**

**Primary Persona**: Korean individual investor (25-45, medium tech literacy, frustrated with Naver Finance information overload)
**Secondary Persona**: Junior financial analyst (needs to speed up data wrangling)
**Key Differentiator**: First tool to combine agentic reasoning + multi-source Korean financial data + conversational interface at zero cost

**Next Steps**:
1. Validate with user interviews (10-15 investors)
2. Complete Phase 3 eval system (ensure quality meets persona expectations)
3. Beta test with 20-30 early adopters from Korean investment communities
4. Measure success: 500+ active users, 85%+ eval accuracy, 40%+ 30-day retention
