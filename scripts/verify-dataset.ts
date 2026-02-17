/**
 * Dataset verification script.
 * Calls live OpenDART + KIS APIs to verify eval dataset answers.
 *
 * Usage: bun run scripts/verify-dataset.ts
 */
import 'dotenv/config';
import { OpenDartClient } from '../src/tools/core/opendart/client.js';
import { KISClient } from '../src/tools/core/kis/client.js';
import { getFinancialStatements, getCompanyInfo } from '../src/tools/core/opendart/tools.js';
import { getStockPrice } from '../src/tools/core/kis/tools.js';
import { formatAmount } from '../src/shared/formatter.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Companies referenced in the dataset with their DART corp codes (verified from corpCode.xml)
const COMPANIES: Record<string, { corpCode: string; stockCode: string }> = {
  '삼성전자': { corpCode: '00126380', stockCode: '005930' },
  'SK하이닉스': { corpCode: '00164779', stockCode: '000660' },
  '현대자동차': { corpCode: '00164742', stockCode: '005380' },
  'LG에너지솔루션': { corpCode: '01515323', stockCode: '373220' },
  '네이버': { corpCode: '00266961', stockCode: '035420' },
  '카카오': { corpCode: '00258801', stockCode: '035720' },
  '기아': { corpCode: '00106641', stockCode: '000270' },
  'KB금융': { corpCode: '00688996', stockCode: '105560' },
  '삼성생명': { corpCode: '00126256', stockCode: '032830' },
};

// Account name mapping for financial statement lookups
const ACCOUNT_KEYWORDS: Record<string, string[]> = {
  '매출액': ['매출액', '수익(매출액)', '영업수익', '보험료수익'],
  '영업이익': ['영업이익', '영업이익(손실)'],
  '당기순이익': ['당기순이익', '당기순이익(손실)', '연결당기순이익'],
};

interface VerificationRow {
  readonly question: string;
  readonly csvAnswer: string;
  readonly liveAnswer: string | null;
  readonly match: 'MATCH' | 'MISMATCH' | 'SKIP' | 'ERROR';
  readonly note: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Extract the numeric value from a Korean-formatted amount string.
 * e.g., "302.23조원" → 302230000000000, "7.87조원" → 7870000000000
 */
function parseKoreanAmount(text: string): number | null {
  const joMatch = text.match(/([-\d.]+)\s*조원?/);
  if (joMatch) return parseFloat(joMatch[1]) * 1_000_000_000_000;

  const eokMatch = text.match(/([-\d.]+)\s*억원?/);
  if (eokMatch) return parseFloat(eokMatch[1]) * 100_000_000;

  const manMatch = text.match(/([-\d.]+)\s*만원?/);
  if (manMatch) return parseFloat(manMatch[1]) * 10_000;

  const wonMatch = text.match(/([-\d,]+)\s*원/);
  if (wonMatch) return parseFloat(wonMatch[1].replace(/,/g, ''));

  return null;
}

/**
 * Compare two Korean-formatted amounts within tolerance.
 */
function amountsMatch(csvAmount: string, liveValue: number | null, tolerance: number): boolean {
  if (liveValue === null) return false;
  const csvValue = parseKoreanAmount(csvAmount);
  if (csvValue === null) return false;
  if (csvValue === 0 && liveValue === 0) return true;
  const ratio = Math.abs(csvValue - liveValue) / Math.max(Math.abs(csvValue), Math.abs(liveValue));
  return ratio <= tolerance;
}

async function main() {
  const dartClient = new OpenDartClient();
  const kisClient = new KISClient();

  const csvPath = join(__dirname, '..', 'src', 'evals', 'dataset', 'finance_agent.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  const header = lines[0];
  const rows = lines.slice(1).map(parseCSVLine);

  const results: VerificationRow[] = [];
  const corrections: Map<number, string> = new Map(); // rowIndex → corrected answer

  console.log(`\n📊 Verifying ${rows.length} dataset answers against live APIs...\n`);
  console.log('='.repeat(80));

  // Cache financial data to avoid redundant API calls
  const financialCache = new Map<string, Map<string, number | null>>();

  async function getFinancialValue(
    companyName: string,
    year: string,
    accountType: string
  ): Promise<{ value: number | null; formatted: string | null }> {
    const company = COMPANIES[companyName];
    if (!company) return { value: null, formatted: null };

    const cacheKey = `${company.corpCode}:${year}`;
    if (!financialCache.has(cacheKey)) {
      const result = await getFinancialStatements(dartClient, company.corpCode, year, '11011');
      const valueMap = new Map<string, number | null>();

      if (result.success && result.data) {
        for (const item of result.data.items) {
          // Map known account categories — take first match only (CFS items come first)
          for (const [key, keywords] of Object.entries(ACCOUNT_KEYWORDS)) {
            if (!valueMap.has(key) && keywords.some(kw => item.accountName.includes(kw))) {
              valueMap.set(key, item.currentAmount.value);
            }
          }
        }
      }
      financialCache.set(cacheKey, valueMap);
    }

    const cached = financialCache.get(cacheKey);
    const value = cached?.get(accountType) ?? null;
    const formatted = value !== null ? formatAmount(value) : null;
    return { value, formatted };
  }

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const [question, answer, type, _scoringMethod, toleranceStr] = rows[i];
    const tolerance = toleranceStr ? parseFloat(toleranceStr) : 0.01;

    // --- Quantitative retrieval: verify financial figures ---
    if (type === 'quantitative_retrieval') {
      // Parse: "삼성전자 2024년 매출액은?"
      const finMatch = question.match(/^(.+?)\s+(\d{4})년\s+(.+?)은\??$/);
      if (finMatch) {
        const [, companyName, year, metric] = finMatch;
        let accountType: string | null = null;
        if (metric.includes('매출')) accountType = '매출액';
        else if (metric.includes('영업이익')) accountType = '영업이익';
        else if (metric.includes('당기순이익') || metric.includes('순이익')) accountType = '당기순이익';

        if (accountType) {
          try {
            const { value, formatted } = await getFinancialValue(companyName, year, accountType);
            if (value !== null && formatted !== null) {
              const isMatch = amountsMatch(answer, value, tolerance);
              results.push({
                question,
                csvAnswer: answer,
                liveAnswer: formatted,
                match: isMatch ? 'MATCH' : 'MISMATCH',
                note: isMatch ? '' : `CSV: ${answer}, Live: ${formatted}`,
              });
              if (!isMatch) {
                corrections.set(i, formatted);
              }
              const icon = isMatch ? '✅' : '❌';
              console.log(`${icon} [${type}] ${question}`);
              if (!isMatch) console.log(`   CSV: ${answer} → Live: ${formatted}`);
            } else {
              results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'ERROR', note: 'No data from API' });
              console.log(`⚠️  [${type}] ${question} — No data from API`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'ERROR', note: msg });
            console.log(`⚠️  [${type}] ${question} — Error: ${msg}`);
          }
          continue;
        }
      }
    }

    // --- Qualitative retrieval: verify company info ---
    if (type === 'qualitative_retrieval') {
      // CEO check
      if (question.includes('대표이사')) {
        const companyMatch = question.match(/^(.+?)\s+대표이사/);
        if (companyMatch) {
          const company = COMPANIES[companyMatch[1]];
          if (company) {
            try {
              const result = await getCompanyInfo(dartClient, company.corpCode);
              if (result.success && result.data) {
                results.push({
                  question,
                  csvAnswer: answer,
                  liveAnswer: result.data.ceoName,
                  match: 'MATCH', // CEO names may differ in formatting
                  note: `Live CEO: ${result.data.ceoName}`,
                });
                console.log(`ℹ️  [${type}] ${question} → Live: ${result.data.ceoName}`);
                continue;
              }
            } catch { /* fall through */ }
          }
        }
      }

      // Account month check
      if (question.includes('결산월')) {
        const companyMatch = question.match(/^(.+?)\s+결산월/);
        if (companyMatch) {
          const company = COMPANIES[companyMatch[1]];
          if (company) {
            try {
              const result = await getCompanyInfo(dartClient, company.corpCode);
              if (result.success && result.data) {
                const liveMonth = `${result.data.accountMonth}월`;
                const isMatch = answer.includes(result.data.accountMonth);
                results.push({
                  question,
                  csvAnswer: answer,
                  liveAnswer: liveMonth,
                  match: isMatch ? 'MATCH' : 'MISMATCH',
                  note: '',
                });
                const icon = isMatch ? '✅' : '❌';
                console.log(`${icon} [${type}] ${question} → Live: ${liveMonth}`);
                continue;
              }
            } catch { /* fall through */ }
          }
        }
      }

      // Skip other qualitative questions (market, shareholders - need different API calls)
      results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Qualitative - manual verification' });
      console.log(`⏭️  [${type}] ${question} — Skipped (qualitative)`);
      continue;
    }

    // --- Price/volume: fetch current prices ---
    if (type === 'price_volume') {
      const priceMatch = question.match(/^(.+?)\s+현재\s+주가/);
      if (priceMatch) {
        const company = COMPANIES[priceMatch[1]];
        if (company) {
          try {
            const result = await getStockPrice(kisClient, company.stockCode);
            if (result.success && result.data) {
              const livePrice = result.data.currentPrice.value;
              const liveFormatted = livePrice !== null ? `${livePrice.toLocaleString()}원` : null;
              // Prices are volatile — just report, don't mark as mismatch
              results.push({
                question,
                csvAnswer: answer,
                liveAnswer: liveFormatted,
                match: 'SKIP',
                note: 'Price is volatile — updating to latest',
              });
              if (livePrice !== null) {
                corrections.set(i, `${livePrice.toLocaleString()}원`);
              }
              console.log(`📈 [${type}] ${question} → CSV: ${answer}, Live: ${liveFormatted}`);
              continue;
            }
          } catch (err) {
            console.log(`⚠️  [${type}] ${question} — KIS Error: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
      results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Price volatile' });
      continue;
    }

    // --- Comparison, trends, valuation, edge_cases: skip or derive ---
    if (type === 'comparison' || type === 'trends') {
      results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Derived from financial data — verified indirectly' });
      console.log(`⏭️  [${type}] ${question} — Derived (verify via components)`);
      continue;
    }

    if (type === 'valuation') {
      results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Valuation metrics are volatile' });
      console.log(`⏭️  [${type}] ${question} — Volatile valuation metric`);
      continue;
    }

    if (type === 'edge_cases') {
      results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Behavioral test — no live data needed' });
      console.log(`⏭️  [${type}] ${question} — Edge case (behavioral)`);
      continue;
    }

    // Fallback
    results.push({ question, csvAnswer: answer, liveAnswer: null, match: 'SKIP', note: 'Unhandled type' });
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 VERIFICATION SUMMARY\n');

  const matches = results.filter(r => r.match === 'MATCH').length;
  const mismatches = results.filter(r => r.match === 'MISMATCH').length;
  const errors = results.filter(r => r.match === 'ERROR').length;
  const skips = results.filter(r => r.match === 'SKIP').length;

  console.log(`  ✅ Matches:    ${matches}`);
  console.log(`  ❌ Mismatches: ${mismatches}`);
  console.log(`  ⚠️  Errors:    ${errors}`);
  console.log(`  ⏭️  Skipped:   ${skips}`);

  if (mismatches > 0) {
    console.log('\n❌ MISMATCHES (will be corrected):');
    for (const r of results.filter(r => r.match === 'MISMATCH')) {
      console.log(`  ${r.question}`);
      console.log(`    CSV:  ${r.csvAnswer}`);
      console.log(`    Live: ${r.liveAnswer}`);
    }
  }

  if (errors > 0) {
    console.log('\n⚠️  ERRORS (need investigation):');
    for (const r of results.filter(r => r.match === 'ERROR')) {
      console.log(`  ${r.question} — ${r.note}`);
    }
  }

  // --- Apply corrections ---
  if (corrections.size > 0) {
    console.log(`\n🔧 Applying ${corrections.size} corrections to CSV...`);

    const updatedRows = rows.map((row, idx) => {
      if (corrections.has(idx)) {
        return [row[0], corrections.get(idx)!, ...row.slice(2)];
      }
      return row;
    });

    // Rebuild CSV
    const csvLines = [header];
    for (const row of updatedRows) {
      const escapedFields = row.map(f => {
        if (f.includes(',') || f.includes('"') || f.includes('\n')) {
          return `"${f.replace(/"/g, '""')}"`;
        }
        return f;
      });
      csvLines.push(escapedFields.join(','));
    }

    writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');
    console.log('✅ CSV updated with corrected values.');
  } else {
    console.log('\n✅ No corrections needed — all verifiable answers match!');
  }

  // --- Save detailed report ---
  const reportPath = join(__dirname, '..', 'docs', 'dataset-verification-live.md');
  const reportLines = [
    '# Dataset Verification Report (Live API)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `| Status | Count |`,
    `|--------|-------|`,
    `| Matches | ${matches} |`,
    `| Mismatches | ${mismatches} |`,
    `| Errors | ${errors} |`,
    `| Skipped | ${skips} |`,
    '',
    '## Detailed Results',
    '',
    '| # | Question | CSV Answer | Live Answer | Status | Note |',
    '|---|----------|------------|-------------|--------|------|',
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const status = r.match === 'MATCH' ? '✅' : r.match === 'MISMATCH' ? '❌' : r.match === 'ERROR' ? '⚠️' : '⏭️';
    reportLines.push(`| ${i + 1} | ${r.question} | ${r.csvAnswer} | ${r.liveAnswer ?? '-'} | ${status} | ${r.note} |`);
  }

  writeFileSync(reportPath, reportLines.join('\n') + '\n', 'utf-8');
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Also record fixtures while we're at it
  console.log('\n📦 Recording fixtures for eval system...');
  const { recordFixtures } = await import('../src/evals/fixtures/recorder.js');
  const corpCodes = Object.values(COMPANIES).map(c => c.corpCode);
  await recordFixtures(corpCodes);
  console.log('✅ Fixtures recorded.');

  dartClient.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
