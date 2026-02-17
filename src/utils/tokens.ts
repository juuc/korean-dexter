/**
 * Token estimation utilities for context management.
 * Used to prevent exceeding LLM context window limits.
 *
 * Korean text averages ~1.5 chars per token vs ~3.5 for English.
 * Constants are calibrated for a Korean-heavy financial agent.
 */

/** Chars-per-token ratio for English text. */
const ENGLISH_RATIO = 3.5;

/** Chars-per-token ratio for Korean text (Hangul is denser in tokens). */
const KOREAN_RATIO = 1.5;

/** Regex matching Hangul syllables, Jamo, and compatibility Jamo. */
const KOREAN_CHAR_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;

/**
 * Estimate token count with language-aware ratio.
 *
 * For mixed text the function counts Korean characters separately and
 * applies the Korean ratio to them, English ratio to the rest.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;

  const koreanMatches = text.match(KOREAN_CHAR_RE);
  const koreanCharCount = koreanMatches ? koreanMatches.length : 0;
  const nonKoreanCharCount = text.length - koreanCharCount;

  return Math.ceil(
    koreanCharCount / KOREAN_RATIO + nonKoreanCharCount / ENGLISH_RATIO
  );
}

/**
 * Maximum token budget for context data in final answer generation.
 * Lowered from 150k to account for Korean text being ~2x denser in tokens.
 */
export const TOKEN_BUDGET = 100_000;

// ============================================================================
// Anthropic-style Context Management Constants
// ============================================================================

/**
 * Token threshold at which context clearing is triggered.
 * Lowered from 100k for Korean-heavy agent workloads.
 */
export const CONTEXT_THRESHOLD = 70_000;

/**
 * Number of most recent tool results to keep when clearing.
 * Reduced from 5 to 3 to stay within tighter Korean token budgets.
 */
export const KEEP_TOOL_USES = 3;
