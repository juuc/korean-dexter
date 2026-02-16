/**
 * Hangul jamo decomposition utilities for fuzzy Korean text matching.
 *
 * Decomposes Hangul syllables into their constituent jamo (consonants/vowels)
 * to enable character-level comparison for typo-tolerant name matching.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** Initial consonants (choseong) */
const CHO: readonly string[] = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** Medial vowels (jungseong) */
const JUNG: readonly string[] = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
];

/** Final consonants (jongseong) — index 0 is empty (no final consonant) */
const JONG: readonly string[] = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/**
 * Decompose a single Hangul syllable into its constituent jamo.
 * Non-Hangul characters are returned as-is in a single-element array.
 *
 * @example
 * decomposeHangul('삼') // ['ㅅ', 'ㅏ', 'ㅁ']
 * decomposeHangul('아') // ['ㅇ', 'ㅏ']
 * decomposeHangul('A')  // ['A']
 */
export function decomposeHangul(char: string): readonly string[] {
  const code = char.charCodeAt(0);

  if (code < HANGUL_START || code > HANGUL_END) {
    return [char];
  }

  const offset = code - HANGUL_START;
  const choIdx = Math.floor(offset / 588);
  const jungIdx = Math.floor((offset % 588) / 28);
  const jongIdx = offset % 28;

  const result: string[] = [CHO[choIdx], JUNG[jungIdx]];
  if (jongIdx !== 0) {
    result.push(JONG[jongIdx]);
  }

  return result;
}

/**
 * Decompose an entire string into jamo.
 * Each Hangul syllable becomes 2-3 jamo; other characters pass through.
 *
 * @example
 * decomposeString('삼성') // ['ㅅ', 'ㅏ', 'ㅁ', 'ㅅ', 'ㅓ', 'ㅇ']
 */
export function decomposeString(str: string): readonly string[] {
  const result: string[] = [];
  for (const char of str) {
    const jamo = decomposeHangul(char);
    for (const j of jamo) {
      result.push(j);
    }
  }
  return result;
}

/**
 * Compute Levenshtein distance on jamo-decomposed strings.
 * This gives finer-grained distance for Korean text since similar
 * syllables (삼/산) differ by only one jamo rather than being entirely different.
 */
export function jamoLevenshtein(a: string, b: string): number {
  const aJamo = decomposeString(a);
  const bJamo = decomposeString(b);

  const aLen = aJamo.length;
  const bLen = bJamo.length;

  // Optimization: if one string is empty, distance is the other's length
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Use two rows instead of full matrix for space efficiency
  let prevRow = new Array<number>(bLen + 1);
  let currRow = new Array<number>(bLen + 1);

  for (let j = 0; j <= bLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = aJamo[i - 1] === bJamo[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost  // substitution
      );
    }
    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[bLen];
}

/**
 * Compute similarity between two Korean strings using jamo decomposition.
 * Returns a value between 0.0 (completely different) and 1.0 (identical).
 *
 * @example
 * jamoSimilarity('삼성전자', '삼성전자') // 1.0
 * jamoSimilarity('삼성전자', '삼성젼자') // ~0.9 (one jamo difference)
 */
export function jamoSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const aJamo = decomposeString(a);
  const bJamo = decomposeString(b);
  const maxLen = Math.max(aJamo.length, bJamo.length);

  if (maxLen === 0) return 1.0;

  const distance = jamoLevenshtein(a, b);
  return 1.0 - distance / maxLen;
}
