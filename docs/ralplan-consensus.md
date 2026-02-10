# Ralplan Consensus: Korean Dexter

This document captures the planning consensus from three agent perspectives:
**Planner**, **Architect**, and **Critic**.

## Agents' Roles

- **Planner**: Created comprehensive 8-phase implementation plan
- **Architect**: Reviewed for technical feasibility, found critical gaps
- **Critic**: Evaluated for completeness, found blind spots and scope issues

## Where All 3 Agents AGREE

| Area | Consensus |
|---|---|
| Corp Code Resolver is the hardest problem | Needs jamo-aware fuzzy matching, confidence scoring, disambiguation |
| Rate limiting from day 1 | Must be baked into every API client, not deferred |
| Caching is non-optional | Two-tier (LRU + disk), immutable data cached permanently |
| Eval needs fixture replay | Never run evals against live APIs |
| Reasoning > plumbing | The differentiator is agentic reasoning, not data access |

## Architect's Additions (Adopted)

1. **Cross-API data model**: Shared types (ResolvedCompany, NormalizedAmount, PeriodRange)
2. **Scratchpad recalibration**: Korean data is 2-3x more verbose, tools must return compacted summaries
3. **AccountMapper**: ~30-40 K-IFRS metrics with hardcoded Korean name variants
4. **KIS token file locking**: Single-writer pattern for concurrent access

## Critic's Challenges (Adopted)

1. **Existing competitors exist**: korea-stock-mcp, dart-fss, OpenDartReader — must differentiate on reasoning
2. **4 APIs too many for MVP**: Cut to OpenDART + KIS only
3. **Consolidated vs Separate statements**: Fundamental data selection problem, not just formatting
4. **Fiscal year misalignment**: Samsung (Dec) vs Shinhan (Mar) need period normalization
5. **50-100 eval questions too few**: Target 200+ with stratified categories
6. **User onboarding is brutal**: Need demo mode with cached data
7. **Target user undefined**: Must answer "who uses this instead of Naver Finance?"

## Revised Plan: 4 Phases

### Phase 1: Foundation (Week 1-2)
- Fork Dexter, strip US tools
- Corp Code Resolver (exact + fuzzy with jamo, confidence scores)
- Cross-API data model
- AccountMapper
- Caching layer (LRU + disk SQLite)
- Rate limiter (token bucket, baked into every client)

### Phase 2: Core Agent (Week 3-5)
- OpenDART client (financials, disclosures, shareholding)
- KIS client (prices, OAuth token lifecycle)
- Agent prompts (Korean financial domain, K-IFRS, number formatting)
- Scratchpad recalibration
- Consolidated vs separate handling
- KoreanFinancialFormatter

### Phase 3: Eval System (Week 6-7)
- 200+ Korean Q&A dataset (stratified)
- Fixture replay system
- Dual scoring: numerical assertions + LLM-as-judge
- Live canary tests (weekly)
- LangSmith integration

### Phase 4: Polish (Week 8+)
- Demo mode (no API keys needed)
- BOK macro data (v1.1)
- KOSIS industry stats (v1.1)
- BigKinds news (v1.1)
- CLI localization

## 7 Assumptions to Validate Before Coding

1. OpenDART daily limit is sufficient
2. KIS API works with paper account
3. corpCode.xml format is stable
4. LLM reasons accurately about Korean finance
5. Scratchpad handles Korean data volume
6. Non-Korean users can register for APIs
7. Consolidated statements available for target companies

## Risk Registry

| Risk | Severity | Mitigation |
|---|---|---|
| OpenDART rate limit exhaustion | CRITICAL | Aggressive caching, request dedup, daily quota display |
| KIS OAuth token blocked | CRITICAL | Disk-persist token, singleton auth, file locking |
| Corp code wrong company | HIGH | Confidence scoring, disambiguation, user confirmation |
| XBRL account name inconsistency | HIGH | AccountMapper with 30+ metrics, 2-5 variants each |
| Korean number scale errors | HIGH | KoreanFinancialFormatter with edge case tests |
| Eval dataset stale answers | HIGH | Double verification, quarterly re-validation |
| LLM hallucination of Korean data | HIGH | Strict tool-use-first policy, validation |
