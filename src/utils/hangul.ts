/**
 * Check if a string contains Hangul (Korean) characters.
 */
export function isHangul(str: string): boolean {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/.test(str);
}

/**
 * Check if a string is predominantly Hangul.
 */
export function isPredominantlyHangul(str: string): boolean {
  const hangulChars = str.match(/[\uAC00-\uD7AF]/g);
  if (!hangulChars) return false;
  const nonSpaceLength = str.replace(/\s/g, '').length;
  return nonSpaceLength > 0 && hangulChars.length / nonSpaceLength > 0.5;
}
