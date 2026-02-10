# Korean Dexter (한국형 Dexter)

An autonomous AI financial research agent for the Korean market — fork of [virattt/dexter](https://github.com/virattt/dexter).

## What Is This?

Korean Dexter takes complex financial questions about Korean companies and turns them into clear, step-by-step research plans. It autonomously queries Korean financial data sources, validates its own work, and iterates until reaching confident conclusions.

**Ask a question in Korean → Get a synthesized financial analysis with citations.**

## Data Sources

### Core (MVP)
- **[OpenDART](https://opendart.fss.or.kr)** — Financial statements, disclosures, shareholding, dividends, auditor opinions
- **[KIS API](https://apiportal.koreainvestment.com)** — Real-time & historical stock prices, trading volume, investor flows

### Planned (v1.1)
- **[BOK ECOS](https://ecos.bok.or.kr)** — Interest rates, exchange rates, GDP, macro-economic statistics
- **[KOSIS](https://kosis.kr)** — National statistics for industry-level context
- **[BigKinds](https://www.bigkinds.or.kr)** — Korean news big data analysis

## Architecture

```
User Question: "삼성전자 최근 실적 분석해줘"
     │
     ├─→ Corp Code Resolver (삼성전자 → 00126380)
     ├─→ OpenDART: 재무제표, 공시, 주주현황
     ├─→ KIS: 주가, 거래량, 시가총액
     │
     ├─→ Agent Planning & Reasoning (LLM)
     ├─→ Self-Validation
     │
     └─→ Synthesized Analysis with Citations
```

## Status

**Pre-development.** See [Issues](https://github.com/juuc/korean-dexter/issues) for the full implementation plan.

### Phase 1: Foundation
- [ ] Validate assumptions (#1)
- [ ] Competitive analysis (#2)
- [ ] Project scaffold (#3)
- [ ] Corp Code Resolver (#4)
- [ ] Cross-API data model (#5)
- [ ] Rate limiter (#10)
- [ ] Caching layer (#11)

### Phase 2: Core Agent
- [ ] OpenDART client (#6)
- [ ] KIS client (#8)
- [ ] AccountMapper (#9)
- [ ] System prompt (#7)
- [ ] Scratchpad recalibration (#13)
- [ ] Error handling (#14)
- [ ] Consolidated vs separate statements (#15)

### Phase 3: Evaluation
- [ ] Korean Q&A dataset — 200+ questions (#12)

### Phase 4: Polish
- [ ] Demo mode (#19)
- [ ] BOK integration (#16)
- [ ] KOSIS integration (#17)
- [ ] BigKinds integration (#18)

## Key Design Decisions

1. **MVP scope: OpenDART + KIS only.** BOK/KOSIS/BigKinds deferred to v1.1.
2. **Reasoning over plumbing.** The differentiator is agentic reasoning, not data access.
3. **Consolidated statements by default.** Fall back to separate only when unavailable.
4. **Korean number formatting.** Always use 조원/억원/만원, never raw WON amounts.
5. **200+ eval questions.** Dual scoring: exact numerical assertions + LLM-as-judge.

## Upstream

Forked from [virattt/dexter](https://github.com/virattt/dexter) — an autonomous financial research agent for US markets.

## API References

- [OpenDART API Guide](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS001)
- [KIS Open Trading API](https://apiportal.koreainvestment.com)
- [Korean Public APIs Collection](https://github.com/yybmion/public-apis-4Kr)

## License

MIT
