/**
 * Eval dataset generation script.
 * Reads verified DART fixture data and generates Q&A pairs for evaluation.
 *
 * Usage: bun run scripts/generate-eval-dataset.ts
 */
import { parseRawAmount, formatAmount } from '../src/shared/formatter.js';
import { ACCOUNT_MAPPINGS } from '../src/tools/core/opendart/account-mapper.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Type Definitions
// ============================================================================

interface CsvRow {
  readonly question: string;
  readonly answer: string;
  readonly type: string;
  readonly scoringMethod: string;
  readonly tolerance: string;
}

interface FixtureIndex {
  readonly companies: ReadonlyArray<{
    readonly corpCode: string;
    readonly corpName: string;
    readonly fixturePath: string;
  }>;
}

interface FixtureResponse {
  readonly endpoint: string;
  readonly params: Record<string, string>;
  readonly response: Record<string, unknown>;
}

interface Fixture {
  readonly corpCode: string;
  readonly corpName: string;
  readonly responses: readonly FixtureResponse[];
}

interface FinancialItem {
  readonly fs_div: string;
  readonly sj_div: string;
  readonly account_nm: string;
  readonly thstrm_amount: string;
  readonly frmtrm_amount: string;
  readonly bfefrmtrm_amount: string;
}

interface YearlyAmounts {
  readonly y2024: number | null;
  readonly y2023: number | null;
  readonly y2022: number | null;
}

interface CompanyInfo {
  readonly ceo_nm: string;
  readonly acc_mt: string;
  readonly est_dt: string;
  readonly induty_code: string;
  readonly stock_code: string;
  readonly stock_name: string;
}

interface CompanyData {
  readonly displayName: string;
  readonly companyInfo: CompanyInfo;
  readonly financials: ReadonlyMap<string, YearlyAmounts>;
}

// ============================================================================
// Constants
// ============================================================================

const COMPARISON_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Same sector
  ['삼성전자', 'SK하이닉스'],     // 반도체
  ['현대자동차', '기아'],          // 자동차
  ['네이버', '카카오'],            // 플랫폼
  // Cross-sector
  ['삼성전자', '현대자동차'],
  ['KB금융', '삼성생명'],
  ['LG에너지솔루션', 'SK하이닉스'],
  ['삼성전자', 'KB금융'],
  ['현대자동차', 'LG에너지솔루션'],
  ['네이버', 'KB금융'],
  ['카카오', '기아'],
] as const;

const EDGE_CASES: ReadonlyArray<readonly [string, string]> = [
  ['삼성 매출은?', '삼성전자로 해석하여 약 300.87조원 (모호한 입력 처리)'],
  ['현대 영업이익은?', '현대자동차로 해석하여 약 14.22조원'],
  ['없는회사 실적은?', '해당 기업을 찾을 수 없습니다'],
  ['asdfghjk 매출은?', '해당 기업을 찾을 수 없습니다'],
  ['삼성전자 2025년 매출은?', '아직 공시되지 않은 데이터입니다'],
  ['삼성전자 주가 얼마야?', '주가 정보는 실시간 시세 조회가 필요합니다'],
  ['005930 매출은?', '삼성전자(005930) 매출 약 300.87조원'],
  ['비상장기업인 쿠팡의 매출은?', '한국 상장사가 아니므로 조회할 수 없습니다'],
  ['삼성전자 직원수는?', '재무제표에 포함되지 않는 정보입니다'],
  ['삼성전자 2019년 매출은?', '보유 데이터 범위(2022~2024)를 벗어납니다'],
  ['현대차 시가총액은?', '시가총액은 실시간 주가 기반 계산이 필요합니다'],
  ['삼성전자 매출 알려줘', '삼성전자 2024년 매출액은 약 300.87조원입니다'],
  ['하이닉스 영업이익은?', 'SK하이닉스로 해석하여 약 23.47조원'],
] as const;

/**
 * Return the correct Korean topic particle (은/는) based on the last syllable.
 * If the last character has a final consonant (받침), return '은'; otherwise '는'.
 */
function topicParticle(word: string): '은' | '는' {
  const lastChar = word.charCodeAt(word.length - 1);
  // Korean syllable block range: 0xAC00 ~ 0xD7A3
  if (lastChar >= 0xac00 && lastChar <= 0xd7a3) {
    return (lastChar - 0xac00) % 28 === 0 ? '는' : '은';
  }
  return '은';
}

// Metric labels and their ACCOUNT_MAPPINGS conceptId
const METRIC_MAPPINGS = [
  { label: '매출액', conceptId: 'revenue' as const },
  { label: '영업이익', conceptId: 'operating_income' as const },
  { label: '당기순이익', conceptId: 'net_income' as const },
  { label: '자산총계', conceptId: 'total_assets' as const },
  { label: '부채총계', conceptId: 'total_liabilities' as const },
  { label: '자본총계', conceptId: 'total_equity' as const },
] as const;

// ============================================================================
// Fixture Loading
// ============================================================================

function loadFixtures(): readonly Fixture[] {
  const indexPath = join(__dirname, '..', 'src', 'evals', 'fixtures', 'data', 'index.json');
  const indexContent = readFileSync(indexPath, 'utf-8');
  const index: FixtureIndex = JSON.parse(indexContent);

  const fixtures: Fixture[] = [];
  for (const company of index.companies) {
    // Skip test company
    if (company.corpCode === '00000001') {
      continue;
    }

    const fixturePath = join(__dirname, '..', 'src', 'evals', 'fixtures', 'data', company.fixturePath);
    const fixtureContent = readFileSync(fixturePath, 'utf-8');
    const fixture: Fixture = JSON.parse(fixtureContent);
    fixtures.push(fixture);
  }

  return fixtures;
}

// ============================================================================
// Financial Data Extraction
// ============================================================================

function buildFinancialData(fixtures: readonly Fixture[]): ReadonlyMap<string, CompanyData> {
  const dataMap = new Map<string, CompanyData>();

  for (const fixture of fixtures) {
    // Extract company info
    const companyResponse = fixture.responses.find(r => r.endpoint === 'company');
    if (!companyResponse) {
      console.warn(`No company endpoint for ${fixture.corpName}`);
      continue;
    }

    const companyResp = companyResponse.response;
    const companyInfo: CompanyInfo = {
      ceo_nm: String(companyResp.ceo_nm ?? ''),
      acc_mt: String(companyResp.acc_mt ?? ''),
      est_dt: String(companyResp.est_dt ?? ''),
      induty_code: String(companyResp.induty_code ?? ''),
      stock_code: String(companyResp.stock_code ?? ''),
      stock_name: String(companyResp.stock_name ?? ''),
    };

    const displayName = companyInfo.stock_name;

    // Extract 2024 annual financials (reprt_code "11011")
    const financialResponse = fixture.responses.find(
      r => r.endpoint === 'fnlttSinglAcnt'
        && r.params.bsns_year === '2024'
        && r.params.reprt_code === '11011'
    );

    if (!financialResponse) {
      console.warn(`No 2024 annual financials for ${fixture.corpName}`);
      continue;
    }

    const financialResp = financialResponse.response;
    const list = financialResp.list as unknown[];
    if (!Array.isArray(list)) {
      console.warn(`Invalid list for ${fixture.corpName}`);
      continue;
    }

    // Build financials map
    const financials = new Map<string, YearlyAmounts>();

    for (const item of list) {
      const financialItem = item as FinancialItem;

      // Only CFS items
      if (financialItem.fs_div !== 'CFS') {
        continue;
      }

      // Match account_nm against ACCOUNT_MAPPINGS
      const accountNm = financialItem.account_nm;
      let matchedConceptId: string | null = null;

      for (const mapping of ACCOUNT_MAPPINGS) {
        const conceptId = mapping.conceptId;
        const koreanNames = mapping.koreanNames;

        // Exact match or trimmed/whitespace-stripped match
        if (koreanNames.includes(accountNm)) {
          matchedConceptId = conceptId;
          break;
        }
        const trimmed = accountNm.trim();
        if (koreanNames.includes(trimmed)) {
          matchedConceptId = conceptId;
          break;
        }
        const stripped = trimmed.replace(/\s/g, '');
        if (koreanNames.some(kn => kn.replace(/\s/g, '') === stripped)) {
          matchedConceptId = conceptId;
          break;
        }
      }

      if (!matchedConceptId) {
        continue;
      }

      // Skip if already exists (take first CFS match)
      if (financials.has(matchedConceptId)) {
        continue;
      }

      // Parse amounts
      const y2024 = parseRawAmount(financialItem.thstrm_amount);
      const y2023 = parseRawAmount(financialItem.frmtrm_amount);
      const y2022 = parseRawAmount(financialItem.bfefrmtrm_amount);

      financials.set(matchedConceptId, { y2024, y2023, y2022 });
    }

    dataMap.set(displayName, {
      displayName,
      companyInfo,
      financials,
    });
  }

  return dataMap;
}

// ============================================================================
// Question Generators
// ============================================================================

function generateQuantitativeQuestions(data: ReadonlyMap<string, CompanyData>): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  for (const [displayName, companyData] of data) {
    for (const { label, conceptId } of METRIC_MAPPINGS) {
      const yearlyAmounts = companyData.financials.get(conceptId);
      if (!yearlyAmounts) {
        continue;
      }

      // Generate for each year
      for (const [year, value] of [
        ['2024', yearlyAmounts.y2024],
        ['2023', yearlyAmounts.y2023],
        ['2022', yearlyAmounts.y2022],
      ] as const) {
        if (value === null) {
          continue;
        }

        const question = `${displayName} ${year}년 ${label}${topicParticle(label)}?`;
        const answer = formatAmount(value, { precision: 2 });

        rows.push({
          question,
          answer,
          type: 'quantitative_retrieval',
          scoringMethod: 'numerical',
          tolerance: '0.01',
        });
      }
    }
  }

  return rows;
}

function generateQualitativeQuestions(data: ReadonlyMap<string, CompanyData>): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  for (const [displayName, companyData] of data) {
    const info = companyData.companyInfo;

    // CEO
    rows.push({
      question: `${displayName} 대표이사는?`,
      answer: info.ceo_nm,
      type: 'qualitative_retrieval',
      scoringMethod: 'llm_judge',
      tolerance: '',
    });

    // Account month
    rows.push({
      question: `${displayName} 결산월은?`,
      answer: `${info.acc_mt}월`,
      type: 'qualitative_retrieval',
      scoringMethod: 'llm_judge',
      tolerance: '',
    });

    // Establishment date
    const estDt = info.est_dt;
    if (estDt && estDt.length === 8) {
      const year = estDt.slice(0, 4);
      const month = estDt.slice(4, 6);
      const day = estDt.slice(6, 8);
      const formatted = `${year}년 ${month}월 ${day}일`;

      rows.push({
        question: `${displayName} 설립일은?`,
        answer: formatted,
        type: 'qualitative_retrieval',
        scoringMethod: 'llm_judge',
        tolerance: '',
      });
    }
  }

  return rows;
}

function generateComparisonQuestions(data: ReadonlyMap<string, CompanyData>): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  const comparisonMetrics = [
    { label: '매출액', conceptId: 'revenue' as const },
    { label: '영업이익', conceptId: 'operating_income' as const },
    { label: '당기순이익', conceptId: 'net_income' as const },
    { label: '자산총계', conceptId: 'total_assets' as const },
  ];

  const years = ['2024', '2023'] as const;

  for (const [compA, compB] of COMPARISON_PAIRS) {
    const dataA = data.get(compA);
    const dataB = data.get(compB);
    if (!dataA || !dataB) {
      continue;
    }

    for (const year of years) {
      for (const { label, conceptId } of comparisonMetrics) {
        const yearlyA = dataA.financials.get(conceptId);
        const yearlyB = dataB.financials.get(conceptId);
        if (!yearlyA || !yearlyB) {
          continue;
        }

        const valueA = year === '2024' ? yearlyA.y2024 : yearlyA.y2023;
        const valueB = year === '2024' ? yearlyB.y2024 : yearlyB.y2023;

        if (valueA === null || valueB === null) {
          continue;
        }

        const formattedA = formatAmount(valueA, { precision: 2 });
        const formattedB = formatAmount(valueB, { precision: 2 });

        const winner = valueA > valueB ? compA : compB;
        const question = `${compA}와 ${compB} 중 ${year}년 ${label}이 더 높은 기업은?`;
        const answer = `${winner} (${formattedA} vs ${formattedB})`;

        rows.push({
          question,
          answer,
          type: 'comparison',
          scoringMethod: 'llm_judge',
          tolerance: '',
        });
      }
    }
  }

  return rows;
}

function describeTrend(v2022: number, v2023: number, v2024: number): string {
  const d1 = v2023 - v2022;
  const d2 = v2024 - v2023;

  // Check for 적자→흑자 or 흑자→적자 transitions
  if (v2023 < 0 && v2024 > 0) return '흑자전환';
  if (v2023 > 0 && v2024 < 0) return '적자전환';

  if (d1 > 0 && d2 > 0) return '지속 성장';
  if (d1 < 0 && d2 < 0) return '지속 감소';
  if (d1 < 0 && d2 > 0) return 'V자 회복';
  if (d1 > 0 && d2 < 0) return '하락 전환';
  return '변동';
}

function generateTrendQuestions(data: ReadonlyMap<string, CompanyData>): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  const trendMetrics = [
    { label: '매출액', conceptId: 'revenue' as const },
    { label: '영업이익', conceptId: 'operating_income' as const },
    { label: '당기순이익', conceptId: 'net_income' as const },
  ];

  for (const [displayName, companyData] of data) {
    for (const { label, conceptId } of trendMetrics) {
      const yearly = companyData.financials.get(conceptId);
      if (!yearly) {
        continue;
      }

      const { y2022, y2023, y2024 } = yearly;
      if (y2022 === null || y2023 === null || y2024 === null) {
        continue;
      }

      const formatted2022 = formatAmount(y2022, { precision: 1 });
      const formatted2023 = formatAmount(y2023, { precision: 1 });
      const formatted2024 = formatAmount(y2024, { precision: 1 });

      const trend = describeTrend(y2022, y2023, y2024);

      const question = `${displayName} 최근 3년간 ${label} 추이는?`;
      const answer = `2022년 ${formatted2022}, 2023년 ${formatted2023}, 2024년 ${formatted2024} (${trend})`;

      rows.push({
        question,
        answer,
        type: 'trends',
        scoringMethod: 'llm_judge',
        tolerance: '',
      });
    }
  }

  return rows;
}

function generateDerivedRatioQuestions(data: ReadonlyMap<string, CompanyData>): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  for (const [displayName, companyData] of data) {
    const financials = companyData.financials;

    const revenue = financials.get('revenue')?.y2024;
    const operatingIncome = financials.get('operating_income')?.y2024;
    const netIncome = financials.get('net_income')?.y2024;
    const totalLiabilities = financials.get('total_liabilities')?.y2024;
    const totalEquity = financials.get('total_equity')?.y2024;

    // Operating margin
    if (revenue != null && revenue !== 0 && operatingIncome != null) {
      const ratio = (operatingIncome / revenue) * 100;
      rows.push({
        question: `${displayName} 2024년 영업이익률은?`,
        answer: `약 ${ratio.toFixed(1)}%`,
        type: 'derived_ratios',
        scoringMethod: 'numerical',
        tolerance: '0.05',
      });
    }

    // Debt ratio
    if (totalEquity != null && totalEquity !== 0 && totalLiabilities != null) {
      const ratio = (totalLiabilities / totalEquity) * 100;
      rows.push({
        question: `${displayName} 2024년 부채비율은?`,
        answer: `약 ${ratio.toFixed(1)}%`,
        type: 'derived_ratios',
        scoringMethod: 'numerical',
        tolerance: '0.05',
      });
    }

    // Net margin
    if (revenue != null && revenue !== 0 && netIncome != null) {
      const ratio = (netIncome / revenue) * 100;
      rows.push({
        question: `${displayName} 2024년 순이익률은?`,
        answer: `약 ${ratio.toFixed(1)}%`,
        type: 'derived_ratios',
        scoringMethod: 'numerical',
        tolerance: '0.05',
      });
    }
  }

  return rows;
}

function getEdgeCaseQuestions(): readonly CsvRow[] {
  return EDGE_CASES.map(([question, answer]) => ({
    question,
    answer,
    type: 'edge_cases',
    scoringMethod: 'llm_judge',
    tolerance: '',
  }));
}

// ============================================================================
// CSV Writing
// ============================================================================

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function writeCSV(rows: readonly CsvRow[], outputPath: string): void {
  const header = 'question,answer,type,scoring_method,tolerance';
  const lines = [header];

  for (const row of rows) {
    const fields = [
      escapeCSVField(row.question),
      escapeCSVField(row.answer),
      escapeCSVField(row.type),
      escapeCSVField(row.scoringMethod),
      escapeCSVField(row.tolerance),
    ];
    lines.push(fields.join(','));
  }

  writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log('\n📊 Generating eval dataset from fixture data...\n');
  console.log('='.repeat(80));

  // Load fixtures
  console.log('\n📦 Loading fixture data...');
  const fixtures = loadFixtures();
  console.log(`✅ Loaded ${fixtures.length} company fixtures`);

  // Build financial data
  console.log('\n🔨 Building financial data structures...');
  const data = buildFinancialData(fixtures);
  console.log(`✅ Processed ${data.size} companies`);

  // Generate questions
  console.log('\n❓ Generating questions...');

  const quantitative = generateQuantitativeQuestions(data);
  console.log(`  ✅ Quantitative: ${quantitative.length} questions`);

  const qualitative = generateQualitativeQuestions(data);
  console.log(`  ✅ Qualitative: ${qualitative.length} questions`);

  const comparison = generateComparisonQuestions(data);
  console.log(`  ✅ Comparison: ${comparison.length} questions`);

  const trends = generateTrendQuestions(data);
  console.log(`  ✅ Trends: ${trends.length} questions`);

  const ratios = generateDerivedRatioQuestions(data);
  console.log(`  ✅ Derived Ratios: ${ratios.length} questions`);

  const edgeCases = getEdgeCaseQuestions();
  console.log(`  ✅ Edge Cases: ${edgeCases.length} questions`);

  // Combine all rows
  const allRows = [
    ...quantitative,
    ...qualitative,
    ...comparison,
    ...trends,
    ...ratios,
    ...edgeCases,
  ];

  console.log(`\n📝 Total questions: ${allRows.length}`);

  // Check for duplicates
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of allRows) {
    if (seen.has(row.question)) {
      duplicates.push(row.question);
    }
    seen.add(row.question);
  }

  if (duplicates.length > 0) {
    console.warn(`\n⚠️  Found ${duplicates.length} duplicate questions (will keep first occurrence):`);
    for (const dup of duplicates.slice(0, 5)) {
      console.warn(`  - ${dup}`);
    }
    if (duplicates.length > 5) {
      console.warn(`  ... and ${duplicates.length - 5} more`);
    }
  }

  // Deduplicate
  const deduped: CsvRow[] = [];
  const seenQuestions = new Set<string>();
  for (const row of allRows) {
    if (!seenQuestions.has(row.question)) {
      deduped.push(row);
      seenQuestions.add(row.question);
    }
  }

  console.log(`✅ After deduplication: ${deduped.length} unique questions`);

  // Write CSV
  const outputPath = join(__dirname, '..', 'src', 'evals', 'dataset', 'finance_agent.csv');
  writeCSV(deduped, outputPath);

  console.log('\n' + '='.repeat(80));
  console.log(`\n✅ Dataset written to: ${outputPath}`);

  // Summary by type
  const byType = new Map<string, number>();
  for (const row of deduped) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  }

  console.log('\n📊 Breakdown by type:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\n✨ Done!\n');
}

main();
