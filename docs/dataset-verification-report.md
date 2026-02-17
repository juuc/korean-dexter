# Dataset Verification Report

**Dataset**: `src/evals/dataset/finance_agent.csv`
**Verified**: 2026-02-17
**Total Questions**: 51

## 1. Summary Statistics

### By Category
| Category | Count | Percentage |
|----------|-------|------------|
| quantitative_retrieval | 13 | 25.5% |
| qualitative_retrieval | 6 | 11.8% |
| comparison | 6 | 11.8% |
| trends | 5 | 9.8% |
| price_volume | 6 | 11.8% |
| valuation | 5 | 9.8% |
| edge_cases | 10 | 19.6% |

### By Scoring Method
| Method | Count | Percentage |
|--------|-------|------------|
| numerical | 24 | 47.1% |
| llm_judge | 27 | 52.9% |

### Numerical Question Tolerances
- **조원 scale (0.01 tolerance)**: 13 questions (revenue, operating profit, net income)
- **원 scale (0.10 tolerance)**: 6 questions (stock prices)
- **배/% scale (0.05 tolerance)**: 5 questions (PER, PBR, dividend yield)

### Company Coverage
- **삼성전자**: 11 questions
- **SK하이닉스**: 7 questions
- **현대자동차**: 7 questions
- **네이버**: 5 questions
- **카카오**: 5 questions
- **기아**: 3 questions
- **KB금융**: 2 questions
- **삼성생명**: 2 questions
- **LG에너지솔루션**: 3 questions
- **쿠팡**: 1 question (edge case)

## 2. Issues Found

### CRITICAL - Data Freshness and Period Accuracy

#### Row 26: Incorrect 3-year trend data
```
삼성전자 최근 3년간 매출 추이는?
Answer: "2022년 302.23조원, 2023년 258.94조원, 2024년 302.23조원 (V자 회복)"
```
**Issue**: 2022 and 2024 both show 302.23조원, which is extremely unlikely. This appears to be copy-paste error.

**Fix Needed**:
- Verify actual 2022 Samsung Electronics revenue (should be different from 2024)
- 2022 was peak semiconductor cycle, 2024 is recovery - numbers should reflect this

#### Row 27: SK하이닉스 trend plausibility
```
Answer: "2022년 6.96조원, 2023년 -7.73조원 적자, 2024년 23.46조원 흑자전환"
```
**Status**: Plausible for memory chip cycle, but requires live verification

#### Row 28-30: All trend answers need verification
Current answers are placeholder-quality and must be verified with actual OpenDART data.

### HIGH - Period Mismatch Issues

#### Rows 2-13: All 2024 financials
```
삼성전자 2024년 매출액은?, 302.23조원
```
**Issue**: Today is 2026-02-17. The questions ask for "2024년" but:
- Q4 2024 financials would be disclosed in Q1 2025
- Full year 2024 audited statements appear in March 2025
- Current available data should be 2024 (verified), possibly early 2025

**Verification Needed**:
- Are these 2024 actual figures or estimates?
- Should questions be updated to "2024년 실제" vs "2025년 추정"?

#### Rows 31-41: "현재 주가" without timestamp
```
삼성전자 현재 주가는?, 55800원
```
**Issue**: "현재" is ambiguous. Stock prices need a reference date.

**Fix Needed**: Either:
1. Change question to "삼성전자 주가는? (2026년 2월 기준)"
2. Or accept tolerance of 0.10 (10%) accounts for daily volatility
3. Document that "현재" means "most recent available" not real-time

### MEDIUM - Magnitude and Unit Consistency

#### Row 31: 삼성전자 주가 55,800원
- **Status**: Plausible but LOW for Samsung Electronics (historically 50,000-90,000원 range)
- **Context**: Could be post-split or bear market scenario
- **Action**: Verify against actual 2024-2025 trading range

#### Row 32: SK하이닉스 211,500원
- **Status**: Plausible for premium memory chip valuation
- **Action**: Cross-check with actual data

#### Row 37-38: PER values
```
삼성전자 현재 PER은?, 11.2배
SK하이닉스 현재 PER은?, 4.8배
```
**Status**:
- Samsung 11.2x is reasonable for mature tech
- SK Hynix 4.8x seems LOW even for cyclical semiconductor
- **Action**: Verify these are actual values, not theoretical

#### Row 39: 현대차 PBR 0.52배
**Status**: Plausible for Korean automaker (historically trade below book value)

#### Row 41: 삼성전자 배당수익률 2.8%
**Status**: Plausible for Korean blue chip

### MEDIUM - Qualitative Answer Formatting

#### Row 14: SK하이닉스 최대주주
```
Answer: "SK스퀘어 (지분 약 20%)"
```
**Issue**: Uses "약" (approximately) but should verify exact percentage from latest disclosure

#### Row 15: 삼성전자 대표이사
```
Answer: "경계현, 전영현"
```
**Issue**: Co-CEO structure accurate but names need verification (could change)

#### Row 49: 현대차 시가총액
```
Answer: "약 44.3조원"
```
**Issue**: Market cap = 주가 × 발행주식수
- If 현대차 주가 = 207,000원 (row 33)
- Expected shares ~214M to get 44.3조원
- **Action**: Verify calculation consistency

### LOW - Edge Case Coverage

#### Row 42-48: Ambiguous/error cases
**Status**: Good coverage of:
- Partial company names ("삼성" → "삼성전자")
- Non-existent companies
- Future dates (2025 when only 2024 available)
- Informal queries
- Ticker code lookup (005930)

**Suggestion**: Add more edge cases:
- Multiple entities with same prefix ("현대" could be 현대차/현대건설/현대중공업)
- Corp code vs ticker symbol confusion
- Quarter vs annual data requests
- 연결 vs 별도 statement disambiguation

#### Row 51: Unlisted company (쿠팡)
```
Answer: "한국 상장사가 아니므로 조회할 수 없습니다"
```
**Status**: Correct edge case, but consider:
- Coupang actually listed on NYSE (not KOSPI/KOSDAQ)
- Answer could be more helpful: "국내 시장에 상장되지 않았으며, NYSE 상장사입니다"

## 3. Answers Requiring Live Verification

### Must Verify with OpenDART API
| Row | Question | Why |
|-----|----------|-----|
| 2-13 | All 2024 financials | Confirm exact amounts from audited statements |
| 26 | 삼성전자 3년 매출 | Fix duplicate 2022=2024 error |
| 27 | SK하이닉스 3년 영업이익 | Verify actual profit/loss figures |
| 28 | 현대차 3년 매출 | Verify growth trajectory |
| 29 | 네이버 3년 매출 | Verify growth rates |
| 30 | 카카오 3년 매출 | Verify growth rates |

### Must Verify with KIS API
| Row | Question | Why |
|-----|----------|-----|
| 31-36 | Current stock prices | Need recent actual prices with date reference |
| 37-41 | Valuation metrics | PER/PBR/dividend yield need live calculation |
| 49 | 현대차 시가총액 | Cross-check with price × shares |

### Can Verify with Static Sources
| Row | Question | Source |
|-----|----------|--------|
| 14 | SK하이닉스 최대주주 | OpenDART shareholding disclosure |
| 15 | 삼성전자 대표이사 | Corporate governance disclosure |
| 16 | 현대차 본사 | Company info API |
| 19 | LG에너지 최대주주 | Shareholding disclosure |

## 4. Additional Observations

### Tolerance Values Analysis

#### 조원 scale (0.01 = 1% tolerance)
**Status**: Appropriate for annual financials
- Example: 302.23조원 ± 1% = 299.21 ~ 305.25조원
- Allows for rounding differences between 연결/별도 or Q4 adjustments

#### Stock prices (0.10 = 10% tolerance)
**Status**: Very generous, possibly too wide
- Example: 55,800원 ± 10% = 50,220 ~ 61,380원
- **Recommendation**: Consider 0.05 (5%) for less volatile large caps
- Keep 0.10 for small caps or during high volatility periods

#### Valuation metrics (0.05 = 5% tolerance)
**Status**: Appropriate for ratios
- PER 11.2배 ± 5% = 10.64 ~ 11.76배
- Allows for calculation method differences (trailing vs forward)

### Category Balance

**Well-covered**:
- Quantitative retrieval (25.5%)
- Edge cases (19.6%)
- Comparison (11.8%)

**Under-covered**:
- Trends (9.8%) - could add more multi-period analysis
- Valuation (9.8%) - could add more metrics (ROE, ROA, debt ratio)

**Missing categories**:
- Investor flow analysis (기관/외국인/개인 매매 동향)
- Disclosure events (공시 검색)
- Industry comparison (sector average vs company)
- Quarterly data (Q1-Q4 breakdown)

### Duplicate/Near-Duplicate Check

**No exact duplicates found.**

Near-duplicates (intentional variations):
- Rows 2-3: 삼성전자 매출/영업이익 (different metrics, OK)
- Rows 20-25: All comparisons (different company pairs, OK)
- Rows 42-48: Edge case variations (different error types, OK)

## 5. Recommendations

### Immediate Fixes Required

1. **Row 26**: Replace 2022 revenue with actual figure (not 302.23조원)
2. **Rows 31-41**: Add date context "(2024년 12월 기준)" or use live API
3. **Row 27-30**: Verify all trend data with OpenDART historical query

### Data Quality Improvements

1. **Add corp_code mapping**:
   ```csv
   question,answer,type,scoring_method,tolerance,corp_code
   삼성전자 2024년 매출액은?,302.23조원,quantitative_retrieval,numerical,0.01,00126380
   ```

2. **Add period metadata**:
   ```csv
   question,answer,type,scoring_method,tolerance,fiscal_year,report_type
   삼성전자 2024년 매출액은?,302.23조원,quantitative_retrieval,numerical,0.01,2024,11011
   ```

3. **Split "현재 주가" questions**:
   - Static dataset: Use specific date "2024년 12월 31일 종가"
   - Live eval: Mark as `requires_live_api: true`

### Coverage Enhancements

Add 10-15 questions for:
- **Quarterly data**: "삼성전자 2024년 3분기 매출은?"
- **Investor flows**: "삼성전자 최근 5일간 외국인 순매수는?"
- **Disclosure search**: "현대차 2024년 유상증자 공시 있었나?"
- **Industry metrics**: "반도체 업종 평균 PER 대비 삼성전자는?"

### Fixture Data Strategy

Current fixture (`00000001.json`) is minimal test data. For production eval:

1. **Create company-specific fixtures**:
   - `00126380.json` (Samsung Electronics)
   - `00164779.json` (SK Hynix)
   - etc.

2. **Include minimal response set** per company:
   - Company info
   - Latest annual financials (fnlttSinglAcnt)
   - Major shareholder (majorShareholder)
   - Stock price snapshot

3. **Update index.json**:
   ```json
   {
     "companies": [
       {"corpCode": "00126380", "corpName": "삼성전자", "ticker": "005930"},
       {"corpCode": "00164779", "corpName": "SK하이닉스", "ticker": "000660"}
     ]
   }
   ```

### Scoring Method Review

**Current split (47% numerical / 53% llm_judge) is balanced.**

Consider converting some llm_judge to numerical:
- Row 49 (시가총액): Could be numerical with 0.05 tolerance
- Row 50 (직원수): Could be numerical with 0.10 tolerance

Keep llm_judge for:
- Trend descriptions (rows 26-30)
- Comparison explanations (rows 20-25)
- Edge case error messages (rows 42-48)

## 6. Action Items

### High Priority (Before Production Use)
- [ ] Fix row 26 (삼성전자 2022 revenue duplication)
- [ ] Verify all 2024 financial figures with OpenDART API
- [ ] Add date references to all "현재" questions
- [ ] Verify trend data (rows 27-30) with actual historical data

### Medium Priority (Enhance Quality)
- [ ] Add corp_code column for traceability
- [ ] Review stock price tolerance (consider 0.05 for large caps)
- [ ] Create company-specific fixture files
- [ ] Add 10+ questions for missing categories

### Low Priority (Future Enhancement)
- [ ] Add quarterly data questions
- [ ] Add investor flow questions
- [ ] Add disclosure search questions
- [ ] Add industry comparison questions
- [ ] Consider splitting static vs live eval datasets

## 7. Validation Script Needed

Recommend creating `src/evals/scripts/validate-dataset.ts`:

```typescript
// Pseudo-code
async function validateDataset() {
  // 1. Load CSV
  // 2. For each quantitative_retrieval question:
  //    - Extract company name, metric, year
  //    - Query OpenDART API
  //    - Compare answer vs actual
  //    - Flag mismatches
  // 3. For price_volume questions:
  //    - Query KIS API for historical price
  //    - Check if answer within tolerance
  // 4. Generate validation report
}
```

This would catch data errors before they become eval failures.

---

## Conclusion

**Overall Assessment**: Dataset structure is solid with good category coverage and balanced scoring methods. However, **critical data verification is needed** before production use.

**Risk Level**: MEDIUM-HIGH
- Trend data (row 26) has confirmed error
- All financial figures are unverified against source APIs
- Stock prices lack date context

**Estimated Effort**: 4-6 hours to:
1. Run validation script against live APIs
2. Fix identified errors
3. Add fixture data for top 5 companies
4. Add 10 missing category questions

**Recommendation**: Do not use for production eval until High Priority items are completed.
