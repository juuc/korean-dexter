---
title: "Korean Financial Q&A Eval Dataset (200+ Questions)"
issue: 12
phase: 3-eval
priority: critical
status: planned
type: eval
created: 2026-02-16
depends_on:
  - "[[phase-2-core/07-prompts]]"
blocks: []
tags: [eval, dataset, korean, qa]
estimated_effort: xlarge
---

# Korean Financial Q&A Eval Dataset (200+ Questions)

## Objective

Build a comprehensive evaluation dataset of 200+ Korean financial questions with verified answers, stratified across 7 categories, using fixture replay for reproducibility and dual scoring for both exact numerical assertions and analytical reasoning.

## Background

Upstream Dexter's eval uses simple LLM-as-judge with a CSV dataset. For Korean Dexter, we need:
- **Korean-language questions** requiring Korean market knowledge
- **Dual scoring**: Exact numerical validation for quantitative questions, LLM-as-judge for analytical questions
- **Fixture replay**: Recorded API responses to ensure reproducibility and avoid rate limits
- **Stratified categories**: Balanced coverage across question types

## Stratified Question Categories

Target: 200+ questions with balanced distribution.

| Category | Description | Example | Target Count |
|----------|-------------|---------|--------------|
| **Company Financials** | Exact numerical queries on financial statements | "삼성전자 2024년 매출은?" | 40 |
| **Comparative Analysis** | Multi-company comparison requiring reasoning | "삼성전자 vs SK하이닉스 영업이익률 비교" | 30 |
| **Disclosure/Events** | Recent corporate announcements, filings | "최근 삼성전자 대규모 공시 내용은?" | 25 |
| **Shareholding** | Ownership structure, major shareholders | "삼성전자 최대주주 지분율?" | 25 |
| **Price/Volume** | Stock price movements, trading volume | "삼성전자 최근 한 달 주가 흐름" | 30 |
| **Ratio Analysis** | Financial indicators, trend analysis | "삼성전자 ROE 추이" | 25 |
| **Complex Reasoning** | Synthesis requiring multiple data sources | "삼성전자 투자 매력도 분석" | 25 |

## Dual Scoring System

### 1. Exact Numerical Assertions

For questions with definitive answers (financials, shareholding, prices):

```typescript
interface ExactScorer {
  // Check if agent's answer contains the correct number
  // Tolerance for rounding (e.g., 302.23조 vs 302조)
  // Scale normalization (조원/억원/만원)
  score(actual: string, expected: NumericAssertion): {
    score: 0 | 1;
    comment: string;
  };
}

interface NumericAssertion {
  value: number;
  unit: '조원' | '억원' | '만원' | '%' | '원';
  tolerance: number; // percentage, e.g., 0.01 for 1%
}
```

### 2. LLM-as-Judge

For analytical questions (comparative, reasoning):

```typescript
interface LLMJudge {
  // GPT judges if answer is substantive, accurate, well-reasoned
  score(actual: string, expected: string, question: string): {
    score: 0 | 1;
    comment: string;
  };
}
```

GPT prompt:
```
You are evaluating a Korean financial research agent's answer.

Question: {question}
Expected Answer: {expected}
Actual Answer: {actual}

Score 1 if the actual answer is:
- Factually accurate
- Substantively addresses the question
- Well-reasoned and coherent

Score 0 if the actual answer:
- Contains factual errors
- Misses key aspects of the question
- Is vague or poorly reasoned

Return JSON: { "score": 0 | 1, "comment": "<brief explanation>" }
```

## Fixture Replay System

**NEVER run evals against live APIs.** Record API responses as fixtures.

### Fixture Structure

```
/fixtures/
  eval-dataset/
    2025-01-15/  # date stamp
      samsung-electronics/
        financials-2024.json
        stock-price-recent.json
        disclosures-recent.json
        shareholders.json
      sk-hynix/
        financials-2024.json
        ...
```

### Fixture Recording Process

```bash
# 1. Author questions in CSV
# 2. Run fixture recorder (queries APIs, saves responses)
bun run record-fixtures --date 2025-01-15

# 3. Manually verify fixture data
# 4. Run eval against fixtures
bun run eval --fixtures fixtures/eval-dataset/2025-01-15
```

### Fixture Replay Implementation

```typescript
class FixtureReplay {
  private fixtures: Map<string, any>;

  constructor(fixtureDir: string) {
    // Load all JSON files from fixtureDir
  }

  // Intercept API calls, return fixture data
  replayDARTCall(method: string, params: any): any {
    const key = `${method}-${JSON.stringify(params)}`;
    return this.fixtures.get(key);
  }

  replayKISCall(method: string, params: any): any {
    const key = `${method}-${JSON.stringify(params)}`;
    return this.fixtures.get(key);
  }
}
```

## Question Authoring Process

1. **Author question** in Korean targeting a specific category
2. **Manually verify answer** against DART/KIS web UI
3. **Record API response** as fixture
4. **Add to CSV dataset** with question, expected answer, category, scoring type
5. **Run eval** to validate
6. **Iterate** based on results

## CSV Dataset Format

```csv
question,expected_answer,category,scoring_type,fixture_key
"삼성전자 2024년 매출은?","302.23조원",company_financials,exact,samsung-2024-revenue
"삼성전자 vs SK하이닉스 영업이익률 비교","삼성전자 15.2%, SK하이닉스 8.7%. 삼성전자가 약 2배 높음.",comparative_analysis,llm_judge,samsung-skhynix-margin-2024
...
```

## LangSmith Integration

Each eval run logged with:

```typescript
interface EvalRun {
  runId: string;
  timestamp: string;
  fixtureDate: string;
  sampleSize: number | 'all';
  results: {
    question: string;
    category: string;
    scoringType: 'exact' | 'llm_judge';
    expected: string;
    actual: string;
    score: 0 | 1;
    comment: string;
    latency: number; // ms
  }[];
  aggregates: {
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    avgLatency: number;
    byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  };
}
```

## CLI Interface

```bash
# Run full eval against fixtures
bun run eval --fixtures fixtures/eval-dataset/2025-01-15

# Run random sample of 20 questions
bun run eval --fixtures fixtures/eval-dataset/2025-01-15 --sample 20

# Run specific category
bun run eval --fixtures fixtures/eval-dataset/2025-01-15 --category comparative_analysis

# Record new fixtures
bun run record-fixtures --date 2025-02-01 --companies 삼성전자,SK하이닉스,현대차
```

## Terminal UI

React Ink progress display:

```
Korean Dexter Eval Run
Fixtures: 2025-01-15 | Sample: 50 / 200 | Mode: Random

Progress: ████████████░░░░░░░░ 60% (30/50)

Category Breakdown:
  Company Financials    ████████░░ 80% (8/10)
  Comparative Analysis  ██████░░░░ 60% (6/10)
  Disclosure/Events     ████████░░ 80% (8/10)

Current: "삼성전자 최근 한 달 주가 흐름" [price_volume]
```

## Implementation Steps

### 1. Question Authoring (Week 6, Days 1-2)

- [ ] Author 40 company financials questions
- [ ] Author 30 comparative analysis questions
- [ ] Author 25 disclosure/events questions
- [ ] Author 25 shareholding questions
- [ ] Author 30 price/volume questions
- [ ] Author 25 ratio analysis questions
- [ ] Author 25 complex reasoning questions

### 2. Fixture Recording (Week 6, Days 3-4)

- [ ] Implement fixture recorder script
- [ ] Record API responses for all questions
- [ ] Manually verify fixture data accuracy
- [ ] Version fixtures with date stamps

### 3. Dual Scoring Implementation (Week 6, Day 5)

- [ ] Implement ExactScorer with Korean number scale handling
- [ ] Implement LLMJudge with GPT
- [ ] Test scoring on sample questions

### 4. LangSmith Integration (Week 7, Day 1)

- [ ] Log eval runs to LangSmith
- [ ] Capture inputs, outputs, scores, timing
- [ ] Implement aggregate metrics

### 5. CLI & Terminal UI (Week 7, Day 2)

- [ ] Implement `--fixtures`, `--sample`, `--category` flags
- [ ] Build React Ink progress UI
- [ ] Test full eval workflow

### 6. Documentation (Week 7, Day 3)

- [ ] Write question authoring guide
- [ ] Document fixture recording process
- [ ] Document eval execution

## Acceptance Criteria

- [ ] 200+ questions across 7 categories
- [ ] All questions have verified reference answers
- [ ] Fixture replay works without API keys
- [ ] Dual scoring correctly differentiates exact vs. analytical
- [ ] LangSmith logs all eval runs
- [ ] `--sample N` flag works
- [ ] Terminal UI shows real-time progress
- [ ] Documentation complete

## Dependencies

- [[phase-2-core/07-prompts|#7 Korean Prompts]] — working agent to test against
- [[phase-2-core/08-formatter|#8 Korean Financial Formatter]] — consistent output
- [[phase-1-foundation/09-dart|#9 DART Client]] — data source
- [[phase-1-foundation/11-kis|#11 KIS Client]] — data source

## Related Risks

- [[risks#eval-dataset-stale|Eval dataset stale answers]] — quarterly re-validation
- [[risks#llm-hallucination|LLM hallucination]] — fixture replay prevents live API hallucination

## Notes

- Korean questions require manual verification by a Korean speaker
- Fixture replay is CRITICAL for reproducibility
- Dual scoring handles both precision and reasoning
- This eval system guides all future development
