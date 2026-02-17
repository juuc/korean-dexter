import { describe, test, expect } from 'bun:test';
import {
  estimateTokens,
  TOKEN_BUDGET,
  CONTEXT_THRESHOLD,
  KEEP_TOOL_USES,
} from './tokens.js';

describe('estimateTokens', () => {
  test('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('returns higher count for Korean text than English of same length', () => {
    // Same character count but Korean should produce more tokens
    const korean = '삼성전자주가분석보고서작성완료';
    const english = 'analyze stock report done';
    expect(estimateTokens(korean)).toBeGreaterThan(estimateTokens(english));
  });

  test('Korean financial sentence produces more tokens than English equivalent', () => {
    const korean = '삼성전자 2024년 연결재무제표';
    const english = 'Samsung 2024 consolidated';
    expect(estimateTokens(korean)).toBeGreaterThan(estimateTokens(english));
  });

  test('handles mixed Korean/English text', () => {
    const mixed = '삼성전자 Samsung 2024년 매출';
    const pureEnglish = 'Samsung Samsung 2024 revenue';
    // Mixed text with Korean should estimate more tokens than pure English of similar length
    expect(estimateTokens(mixed)).toBeGreaterThan(estimateTokens(pureEnglish));
  });

  test('pure English text uses English ratio', () => {
    const english = 'This is a test string for token estimation';
    // English: ~3.5 chars per token
    const expected = Math.ceil(english.length / 3.5);
    expect(estimateTokens(english)).toBe(expected);
  });

  test('pure Korean text (no spaces) uses Korean ratio', () => {
    const korean = '삼성전자주가분석보고서';
    // All Hangul, no spaces: entire string at 1.5 chars/token
    const expected = Math.ceil(korean.length / 1.5);
    expect(estimateTokens(korean)).toBe(expected);
  });
});

describe('Token constants', () => {
  test('TOKEN_BUDGET is 100_000', () => {
    expect(TOKEN_BUDGET).toBe(100_000);
  });

  test('CONTEXT_THRESHOLD is 70_000', () => {
    expect(CONTEXT_THRESHOLD).toBe(70_000);
  });

  test('KEEP_TOOL_USES is 3', () => {
    expect(KEEP_TOOL_USES).toBe(3);
  });
});
