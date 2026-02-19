/**
 * ASCII sparkline chart using Unicode block characters.
 * Renders an array of numbers as a single line of varying-height bars.
 */

const SPARK_CHARS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'] as const;

/**
 * Render an array of numbers as a sparkline string.
 * Values are scaled to fit within 8 Unicode block character levels.
 *
 * @example
 * renderSparkline([1, 3, 5, 2, 8, 4]) // "▂▃▅▂█▄"
 */
export function renderSparkline(values: readonly number[], maxWidth = 60): string {
  if (values.length === 0) return '';
  if (values.length === 1) return SPARK_CHARS[4];

  // Downsample if too many points for terminal width
  const sampled = values.length > maxWidth ? downsample(values, maxWidth) : values;

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min;

  if (range === 0) return SPARK_CHARS[4].repeat(sampled.length);

  return sampled
    .map((v) => {
      const normalized = (v - min) / range;
      const index = Math.min(
        Math.round(normalized * (SPARK_CHARS.length - 1)),
        SPARK_CHARS.length - 1
      );
      return SPARK_CHARS[index];
    })
    .join('');
}

/**
 * Downsample an array to maxLength points using linear interpolation.
 * Preserves first and last values for accurate range display.
 */
function downsample(values: readonly number[], maxLength: number): readonly number[] {
  const step = (values.length - 1) / (maxLength - 1);
  const result: number[] = [];

  for (let i = 0; i < maxLength; i++) {
    const index = Math.min(Math.round(i * step), values.length - 1);
    result.push(values[index]);
  }

  return result;
}
