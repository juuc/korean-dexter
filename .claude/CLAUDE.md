# Korean Dexter - Project Instructions

This project uses **oh-my-claudecode (OMC)** for multi-agent orchestration. OMC is configured globally — do not duplicate its config here.

## Project Context

Korean Dexter is an autonomous AI financial research agent for the Korean market, forked from [virattt/dexter](https://github.com/virattt/dexter).

## Key References

- `docs/ralplan-consensus.md` — Planning consensus (Planner/Architect/Critic)
- `docs/api-reference.md` — OpenDART, KIS, BOK, KOSIS API documentation
- `.env.example` — Required API keys and registration URLs
- GitHub Issues — Full implementation plan with 20 detailed issues

## Tech Stack

- **Runtime**: Bun v1.0+
- **Language**: TypeScript (strict mode)
- **Testing**: Bun test runner / Jest
- **LLM**: Anthropic Claude (primary), OpenAI (optional)
- **Eval**: LangSmith + LLM-as-judge

## Data Sources (MVP)

- **OpenDART** (opendart.fss.or.kr) — financials, disclosures, shareholding
- **KIS API** (koreainvestment.com) — stock prices, volumes, investor flows

## Conventions

- Korean financial amounts: always use 조원/억원/만원 scales, never raw WON
- Default to consolidated (연결) financial statements, fall back to separate (별도)
- Corp code resolution: OpenDART uses 8-digit `corp_code`, not ticker symbols
- All API clients must embed rate limiting from day 1
- Cache immutable historical data permanently (prior-year financials, closed-day prices)
- Agent prompts in Korean; code/comments in English

## Git

- Remote uses SSH: `git@github.com-personal:juuc/korean-dexter.git`
