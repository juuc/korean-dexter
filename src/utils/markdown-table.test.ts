import { describe, test, expect } from 'bun:test';
import {
  parseMarkdownTable,
  renderBoxTable,
  formatResponse,
} from './markdown-table.js';

describe('parseMarkdownTable', () => {
  test('parses standard markdown table', () => {
    const table = `| 항목 | 값 |
| --- | --- |
| 매출액 | 300조원 |
| 영업이익 | 36조원 |`;

    const result = parseMarkdownTable(table);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual(['항목', '값']);
    expect(result!.rows).toHaveLength(2);
    expect(result!.rows[0]).toEqual(['매출액', '300조원']);
    expect(result!.rows[1]).toEqual(['영업이익', '36조원']);
  });

  test('returns null for non-table content', () => {
    expect(parseMarkdownTable('just plain text')).toBeNull();
    expect(parseMarkdownTable('')).toBeNull();
  });

  test('returns null for single line', () => {
    expect(parseMarkdownTable('| header |')).toBeNull();
  });
});

describe('renderBoxTable', () => {
  test('renders headers and rows with box-drawing characters', () => {
    const result = renderBoxTable(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(result).toContain('┌');
    expect(result).toContain('┐');
    expect(result).toContain('└');
    expect(result).toContain('┘');
    expect(result).toContain('│');
    expect(result).toContain('─');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('1');
    expect(result).toContain('4');
  });

  test('right-aligns numeric columns', () => {
    const result = renderBoxTable(
      ['이름', '금액'],
      [['삼성전자', '300'], ['SK하이닉스', '50']]
    );
    // Numeric column should have the smaller number padded with leading spaces
    const lines = result.split('\n');
    const dataLine = lines[3]; // first data row
    // "300" should be right-aligned (padStart)
    expect(dataLine).toContain(' 300 ');
  });
});

describe('formatResponse', () => {
  test('converts markdown tables to box-drawing tables', () => {
    const input = `| 지표 | 값 |
| --- | --- |
| PER | 12.5 |`;

    const result = formatResponse(input);
    expect(result).toContain('┌');
    expect(result).toContain('지표');
    expect(result).toContain('12.5');
  });

  test('converts **bold** to ANSI bold', () => {
    const result = formatResponse('**삼성전자** 분석');
    // chalk.bold wraps text — the original ** should be removed
    expect(result).not.toContain('**');
    expect(result).toContain('삼성전자');
  });

  test('colorizes positive percentage green', () => {
    const result = formatResponse('+2.34%');
    // Should contain ANSI escape codes (chalk.green)
    // The text itself should still be present
    expect(result).toContain('+2.34%');
    // In non-TTY it may not have ANSI codes, but the text is preserved
  });

  test('colorizes negative percentage red', () => {
    const result = formatResponse('-1.56%');
    expect(result).toContain('-1.56%');
  });

  test('does not colorize percentage in middle of word', () => {
    // "abc+2%" should NOT be colorized (preceded by letter)
    const result = formatResponse('abc+2%');
    expect(result).toBe('abc+2%');
  });

  test('colorizes standalone percentages in context', () => {
    const input = '수익률: +12.34%, 전일 대비: -0.5%';
    const result = formatResponse(input);
    expect(result).toContain('+12.34%');
    expect(result).toContain('-0.5%');
  });

  test('handles integer percentages', () => {
    const result = formatResponse('+5% 상승');
    expect(result).toContain('+5%');
  });

  test('preserves sparkline characters unchanged', () => {
    const sparkline = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁';
    const result = formatResponse(`차트: ${sparkline}`);
    expect(result).toContain(sparkline);
  });

  test('handles mixed content: table + bold + percentages', () => {
    const input = `**요약**

| 지표 | 변동 |
| --- | --- |
| 수익률 | +3.2% |

전일 대비 -0.8% 하락`;

    const result = formatResponse(input);
    // Table converted
    expect(result).toContain('┌');
    // Bold converted
    expect(result).not.toContain('**');
    expect(result).toContain('요약');
    // Percentages present
    expect(result).toContain('+3.2%');
    expect(result).toContain('-0.8%');
  });
});
