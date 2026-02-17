/**
 * Korean error message map for LLM-facing tool responses.
 * Maps error codes to Korean messages with suggested recovery actions.
 */

import type { ToolError } from '@/shared/types.js';

/**
 * Korean error response returned to the LLM.
 */
export interface KoreanToolError {
  readonly code: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

/** Error codes from ToolError plus forward-compatible codes */
type ErrorCode = ToolError['code'] | 'INVALID_INPUT' | 'TIMEOUT';

interface ErrorTemplate {
  readonly message: string;
  readonly suggestedAction?: string;
}

const ERROR_MAP: Readonly<Record<ErrorCode, ErrorTemplate>> = {
  NOT_FOUND: {
    message: '요청하신 데이터를 찾을 수 없습니다',
    suggestedAction: 'Try different period or report type',
  },
  RATE_LIMITED: {
    message: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요',
    suggestedAction: 'Wait and retry',
  },
  AUTH_EXPIRED: {
    message: 'API 인증이 만료되었습니다',
    suggestedAction: 'Re-authenticate',
  },
  INVALID_INPUT: {
    message: '잘못된 입력입니다',
    suggestedAction: 'Check parameters',
  },
  NETWORK_ERROR: {
    message: '네트워크 연결에 문제가 있습니다',
    suggestedAction: 'Retry',
  },
  API_ERROR: {
    message: 'API 오류가 발생했습니다',
    suggestedAction: 'Retry or use alternative',
  },
  TIMEOUT: {
    message: '요청 시간이 초과되었습니다',
    suggestedAction: 'Retry',
  },
  PARSE_ERROR: {
    message: '응답 데이터 처리 중 오류가 발생했습니다',
    suggestedAction: 'Report issue',
  },
};

/**
 * Tool-specific message overrides keyed by `${toolName}:${code}`.
 */
const TOOL_SPECIFIC_OVERRIDES: Readonly<Record<string, Partial<ErrorTemplate>>> = {
  'get_financial_statements:NOT_FOUND': {
    message: '요청하신 재무제표 데이터를 찾을 수 없습니다. 다른 기간 또는 보고서 유형을 시도해보세요',
  },
};

/**
 * Format an error code into a Korean error response for the LLM.
 *
 * @param code Error code (from ToolError or extended codes)
 * @param toolName Name of the tool that produced the error
 * @param details Optional English detail string from the original error
 */
export function formatKoreanError(
  code: string,
  toolName: string,
  details?: string
): KoreanToolError {
  const overrideKey = `${toolName}:${code}`;
  const override = TOOL_SPECIFIC_OVERRIDES[overrideKey];
  const template = ERROR_MAP[code as ErrorCode];

  const message = override?.message ?? template?.message ?? '알 수 없는 오류가 발생했습니다';
  const suggestedAction = override?.suggestedAction ?? template?.suggestedAction;

  const result: KoreanToolError = {
    code,
    message: details ? `${message} (${details})` : message,
    ...(suggestedAction ? { suggestedAction } : {}),
  };

  return result;
}
