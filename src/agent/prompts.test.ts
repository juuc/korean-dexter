import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock dependencies before importing prompts module
mock.module('../tools/registry.js', () => ({
  buildToolDescriptions: (_model: string) => '[Mocked tool descriptions]',
  getToolRegistry: (_model: string) => [],
  getTools: (_model: string) => [],
}));

mock.module('../skills/index.js', () => ({
  discoverSkills: () => [],
  buildSkillMetadataSection: () => '',
  getSkill: () => undefined,
  clearSkillCache: () => {},
}));

import {
  getCurrentDate,
  DEFAULT_SYSTEM_PROMPT,
  buildSystemPrompt,
  buildIterationPrompt,
  buildFinalAnswerPrompt,
  IDENTITY_SECTION,
  DOMAIN_KNOWLEDGE_SECTION,
  NUMBER_FORMATTING_RULES_SECTION,
  CONSOLIDATED_POLICY_SECTION,
  TABLE_FORMATTING_RULES_SECTION,
  RESPONSE_STYLE_SECTION,
  buildKoreanFinancialContext,
} from './prompts.js';

// ============================================================================
// getCurrentDate
// ============================================================================

describe('getCurrentDate', () => {
  test('returns Korean locale date string with year/month/day components', () => {
    const result = getCurrentDate();
    expect(result).toContain('년');
    expect(result).toContain('월');
    expect(result).toContain('일');
  });

  test('returns a non-empty string', () => {
    const result = getCurrentDate();
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DEFAULT_SYSTEM_PROMPT
// ============================================================================

describe('DEFAULT_SYSTEM_PROMPT', () => {
  test('contains Korean Dexter identity', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('한국 덱스터');
  });

  test('contains date information', () => {
    // Date is embedded at module load time
    expect(DEFAULT_SYSTEM_PROMPT).toContain('년');
  });
});

// ============================================================================
// Section Constants
// ============================================================================

describe('IDENTITY_SECTION', () => {
  test('contains Korean Dexter identity', () => {
    expect(IDENTITY_SECTION).toContain('한국 덱스터');
  });

  test('mentions financial research expertise', () => {
    // Should mention the agent's role in financial research
    expect(IDENTITY_SECTION).toMatch(/금융|재무|리서치|연구/);
  });
});

describe('DOMAIN_KNOWLEDGE_SECTION', () => {
  test('contains K-IFRS reference', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('K-IFRS');
  });

  test('contains financial statement types in Korean', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('손익계산서');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('재무상태표');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('현금흐름표');
  });

  test('contains key K-IFRS financial concepts', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('매출액');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('영업이익');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('당기순이익');
  });

  test('contains Korean market structure', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('KOSPI');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('KOSDAQ');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('KONEX');
  });

  test('contains Korean market structure labels', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('코스피');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('코스닥');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('코넥스');
  });

  test('contains investor classifications', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('외국인');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('기관');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('개인');
  });

  test('contains common financial metrics', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('PER');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('PBR');
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('ROE');
  });

  test('contains parent attribution concept', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('지배기업');
  });

  test('contains statement of changes in equity', () => {
    expect(DOMAIN_KNOWLEDGE_SECTION).toContain('자본변동표');
  });
});

describe('NUMBER_FORMATTING_RULES_SECTION', () => {
  test('contains Korean number scales', () => {
    expect(NUMBER_FORMATTING_RULES_SECTION).toContain('조원');
    expect(NUMBER_FORMATTING_RULES_SECTION).toContain('억원');
    expect(NUMBER_FORMATTING_RULES_SECTION).toContain('만원');
  });

  test('contains scale conversion examples', () => {
    // Should explain what 1조원 equals in raw won
    expect(NUMBER_FORMATTING_RULES_SECTION).toContain('1,000,000,000,000');
  });

  test('contains prohibition of raw won amounts', () => {
    // Should say NEVER write raw won amounts
    expect(NUMBER_FORMATTING_RULES_SECTION).toMatch(/NEVER|절대|금지/i);
  });
});

describe('CONSOLIDATED_POLICY_SECTION', () => {
  test('contains consolidated statement reference', () => {
    expect(CONSOLIDATED_POLICY_SECTION).toContain('연결');
  });

  test('contains CFS reference', () => {
    expect(CONSOLIDATED_POLICY_SECTION).toContain('CFS');
  });

  test('contains separate statement reference', () => {
    expect(CONSOLIDATED_POLICY_SECTION).toContain('별도');
  });

  test('emphasizes consolidated-first policy', () => {
    // Should indicate default/first/priority for consolidated
    expect(CONSOLIDATED_POLICY_SECTION).toMatch(/기본|우선|DEFAULT|default|먼저/i);
  });

  test('contains never-mix rule', () => {
    // Should warn about not mixing consolidated and separate
    expect(CONSOLIDATED_POLICY_SECTION).toMatch(/혼합|mix|섞/i);
  });
});

describe('TABLE_FORMATTING_RULES_SECTION', () => {
  test('contains compact header guidance', () => {
    expect(TABLE_FORMATTING_RULES_SECTION).toMatch(/compact|간결|짧/);
  });

  test('contains Korean financial abbreviations', () => {
    expect(TABLE_FORMATTING_RULES_SECTION).toMatch(/매출|영업이익|순이익/);
  });
});

describe('RESPONSE_STYLE_SECTION', () => {
  test('contains Korean language guidance', () => {
    expect(RESPONSE_STYLE_SECTION).toMatch(/한국어|Korean|전문/);
  });
});

// ============================================================================
// buildKoreanFinancialContext
// ============================================================================

describe('buildKoreanFinancialContext', () => {
  test('returns a non-empty string', () => {
    const result = buildKoreanFinancialContext();
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes domain knowledge', () => {
    const result = buildKoreanFinancialContext();
    expect(result).toContain('K-IFRS');
  });

  test('includes number formatting rules', () => {
    const result = buildKoreanFinancialContext();
    expect(result).toContain('조원');
    expect(result).toContain('억원');
  });

  test('includes consolidated policy', () => {
    const result = buildKoreanFinancialContext();
    expect(result).toContain('연결');
    expect(result).toContain('별도');
  });
});

// ============================================================================
// buildSystemPrompt
// ============================================================================

describe('buildSystemPrompt', () => {
  let systemPrompt: string;

  beforeEach(() => {
    systemPrompt = buildSystemPrompt('test-model');
  });

  test('contains Korean Dexter identity', () => {
    expect(systemPrompt).toContain('한국 덱스터');
  });

  test('contains current date', () => {
    expect(systemPrompt).toContain('년');
    expect(systemPrompt).toContain('월');
  });

  test('contains K-IFRS domain knowledge', () => {
    expect(systemPrompt).toContain('K-IFRS');
    expect(systemPrompt).toContain('손익계산서');
    expect(systemPrompt).toContain('재무상태표');
    expect(systemPrompt).toContain('현금흐름표');
  });

  test('contains number formatting rules', () => {
    expect(systemPrompt).toContain('조원');
    expect(systemPrompt).toContain('억원');
    expect(systemPrompt).toContain('만원');
  });

  test('contains consolidated-first policy', () => {
    expect(systemPrompt).toContain('연결');
    expect(systemPrompt).toContain('CFS');
    expect(systemPrompt).toContain('별도');
  });

  test('contains tool usage policy', () => {
    expect(systemPrompt).toContain('Tool');
  });

  test('contains table formatting rules', () => {
    expect(systemPrompt).toContain('|');
  });

  test('contains Korean market structure', () => {
    expect(systemPrompt).toContain('KOSPI');
    expect(systemPrompt).toContain('KOSDAQ');
  });

  test('contains investor classifications', () => {
    expect(systemPrompt).toContain('외국인');
    expect(systemPrompt).toContain('기관');
    expect(systemPrompt).toContain('개인');
  });

  test('contains response style guidance', () => {
    expect(systemPrompt).toMatch(/한국어|Korean|전문/);
  });

  // Negative tests
  test('does NOT contain raw USD or $ references', () => {
    expect(systemPrompt).not.toMatch(/\bUSD\b/);
    expect(systemPrompt).not.toContain('$');
  });

  test('does NOT contain SEC references', () => {
    expect(systemPrompt).not.toMatch(/\bSEC\b/);
  });

  test('does NOT contain US-GAAP references', () => {
    expect(systemPrompt).not.toContain('US-GAAP');
    expect(systemPrompt).not.toContain('US GAAP');
  });
});

// ============================================================================
// buildIterationPrompt
// ============================================================================

describe('buildIterationPrompt', () => {
  test('contains original query', () => {
    const result = buildIterationPrompt('삼성전자 매출 분석', '', null);
    expect(result).toContain('삼성전자 매출 분석');
  });

  test('contains tool results when provided', () => {
    const result = buildIterationPrompt(
      '삼성전자 분석',
      'Tool result: 매출 300조원',
      null
    );
    expect(result).toContain('Tool result: 매출 300조원');
  });

  test('contains tool usage status when provided', () => {
    const result = buildIterationPrompt(
      '삼성전자 분석',
      '',
      'Tool usage: 2/5 calls remaining'
    );
    expect(result).toContain('Tool usage: 2/5 calls remaining');
  });

  test('contains Korean-specific research guidance', () => {
    const result = buildIterationPrompt('삼성전자 분석', '', null);
    // Should contain guidance about Korean financial analysis
    expect(result).toMatch(/조원|억원|연결|한국/);
  });

  test('omits tool results section when empty', () => {
    const result = buildIterationPrompt('테스트 쿼리', '', null);
    // When fullToolResults is empty, should not include tool results header
    expect(result).not.toContain('Data retrieved from tool calls:');
  });

  test('omits tool usage status when null', () => {
    const result = buildIterationPrompt('테스트 쿼리', '', null);
    expect(result).not.toContain('Tool usage:');
  });
});

// ============================================================================
// buildFinalAnswerPrompt
// ============================================================================

describe('buildFinalAnswerPrompt', () => {
  test('contains original query', () => {
    const result = buildFinalAnswerPrompt(
      '삼성전자 실적 분석',
      'Context data here'
    );
    expect(result).toContain('삼성전자 실적 분석');
  });

  test('contains context data', () => {
    const result = buildFinalAnswerPrompt(
      '분석 요청',
      '매출: 300조원, 영업이익: 36조원'
    );
    expect(result).toContain('매출: 300조원, 영업이익: 36조원');
  });

  test('contains Korean synthesis instructions', () => {
    const result = buildFinalAnswerPrompt('분석 요청', 'data');
    // Should remind about Korean number formatting in final answer
    expect(result).toMatch(/조원|억원|만원/);
  });

  test('contains formatting reminder for final answer', () => {
    const result = buildFinalAnswerPrompt('분석 요청', 'data');
    // Should contain instructions about how to format the final answer
    expect(result).toMatch(/연결|별도|단위/);
  });
});
