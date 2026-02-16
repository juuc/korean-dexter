# Phase 3: Evaluation System

## Overview

**Timeline**: Week 6-7
**Goal**: Build a comprehensive Korean financial Q&A evaluation system with 200+ questions, fixture replay, and dual scoring.

## Purpose

Phase 3 establishes a robust evaluation framework to measure Korean Dexter's accuracy and reliability on Korean financial queries. Unlike upstream Dexter's simple LLM-as-judge approach, we implement dual scoring for both exact numerical assertions and analytical reasoning.

## Key Objectives

1. **Korean Financial Q&A Dataset**: 200+ questions across 7 stratified categories
2. **Fixture Replay System**: Reproducible evals with recorded API responses
3. **Dual Scoring**: Exact numerical validation + LLM-as-judge for reasoning
4. **LangSmith Integration**: Track eval runs, scores, timing, and reference outputs
5. **Subset Sampling**: `--sample N` for rapid iteration

## Issues in This Phase

| Issue | Title | Priority | Effort |
|-------|-------|----------|--------|
| [[phase-3-eval/12-eval-dataset\|#12]] | Korean Financial Q&A Eval Dataset | critical | xlarge |

## Dependencies

**Required from Phase 2**:
- [[phase-2-core/07-prompts\|#7 Korean Prompts]] — working agent to validate answers
- [[phase-2-core/08-formatter\|#8 Korean Financial Formatter]] — consistent output format
- [[phase-1-foundation/09-dart\|#9 DART Client]] — data source for fixture creation
- [[phase-1-foundation/11-kis\|#11 KIS Client]] — data source for fixture creation

## Deliverables

- 200+ question CSV dataset with verified answers
- Fixture replay infrastructure (JSON snapshots)
- Dual scoring implementation (exact + LLM-judge)
- LangSmith integration for eval tracking
- React Ink terminal UI for eval progress
- Documentation: How to author questions, create fixtures, run evals

## Success Criteria

- [ ] 200+ questions with balanced category distribution
- [ ] All questions have verified reference answers
- [ ] Fixture replay works without API keys
- [ ] Dual scoring correctly identifies numerical vs. analytical questions
- [ ] LangSmith logs all eval runs with structured metadata
- [ ] `--sample N` flag works for subset testing
- [ ] Terminal UI shows real-time progress
- [ ] Documentation enables new question authoring

## Timeline

- **Week 6**: Question authoring, fixture recording, dual scoring implementation
- **Week 7**: LangSmith integration, terminal UI, documentation

## Risks

See [[risks#eval-dataset-stale|Eval dataset stale answers risk]]
See [[risks#llm-hallucination|LLM hallucination risk]]

## Notes

- Fixture replay is CRITICAL for reproducibility — never run evals against live APIs
- Korean questions require manual verification by a Korean speaker
- Dual scoring handles both quantitative precision and qualitative reasoning
- This eval system will guide all future improvements
