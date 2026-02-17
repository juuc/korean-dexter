import { describe, test, expect } from 'bun:test';
import { formatKoreanError, type KoreanToolError } from './error-messages.js';

describe('formatKoreanError', () => {
  test('NOT_FOUND for get_financial_statements returns Korean message', () => {
    const err = formatKoreanError('NOT_FOUND', 'get_financial_statements');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBeTruthy();
    expect(err.message).not.toMatch(/[a-z]/); // Should not contain lowercase English
  });

  test('NOT_FOUND for get_financial_statements mentions period hint', () => {
    const err = formatKoreanError('NOT_FOUND', 'get_financial_statements');
    expect(err.message).toContain('기간');
  });

  test('RATE_LIMITED returns rate limit Korean message', () => {
    const err = formatKoreanError('RATE_LIMITED', 'any_tool');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toContain('요청 한도');
  });

  test('AUTH_EXPIRED returns auth Korean message', () => {
    const err = formatKoreanError('AUTH_EXPIRED', 'any_tool');
    expect(err.code).toBe('AUTH_EXPIRED');
    expect(err.message).toContain('인증');
  });

  test('INVALID_INPUT returns input validation Korean message', () => {
    const err = formatKoreanError('INVALID_INPUT', 'any_tool');
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toContain('입력');
  });

  test('NETWORK_ERROR returns network Korean message', () => {
    const err = formatKoreanError('NETWORK_ERROR', 'any_tool');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toContain('네트워크');
  });

  test('API_ERROR returns API error Korean message', () => {
    const err = formatKoreanError('API_ERROR', 'any_tool');
    expect(err.code).toBe('API_ERROR');
    expect(err.message).toContain('API');
  });

  test('TIMEOUT returns timeout Korean message', () => {
    const err = formatKoreanError('TIMEOUT', 'any_tool');
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('시간');
  });

  test('PARSE_ERROR returns parse error Korean message', () => {
    const err = formatKoreanError('PARSE_ERROR', 'any_tool');
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toContain('데이터');
  });

  test('all known error codes return non-empty message', () => {
    const codes = [
      'NOT_FOUND',
      'RATE_LIMITED',
      'AUTH_EXPIRED',
      'INVALID_INPUT',
      'NETWORK_ERROR',
      'API_ERROR',
      'TIMEOUT',
      'PARSE_ERROR',
    ] as const;

    for (const code of codes) {
      const err = formatKoreanError(code, 'test_tool');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  test('unknown code returns generic Korean error message', () => {
    const err = formatKoreanError('SOME_UNKNOWN_CODE', 'any_tool');
    expect(err.code).toBe('SOME_UNKNOWN_CODE');
    expect(err.message).toBeTruthy();
  });

  test('suggestedAction is present for recoverable errors', () => {
    const recoverableCodes = [
      'NOT_FOUND',
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'API_ERROR',
      'TIMEOUT',
    ] as const;

    for (const code of recoverableCodes) {
      const err = formatKoreanError(code, 'test_tool');
      expect(err.suggestedAction).toBeTruthy();
    }
  });

  test('details are appended to message when provided', () => {
    const err = formatKoreanError('API_ERROR', 'any_tool', 'Connection refused');
    expect(err.message).toContain('API');
    // Details should be included somewhere in the result
    expect(JSON.stringify(err)).toContain('Connection refused');
  });
});
