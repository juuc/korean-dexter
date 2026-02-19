/**
 * Build deterministic cache key from API parameters.
 * Must match the key format used by the seed scripts.
 * Format: "{api}:{endpoint}:{sorted_params_values}"
 */
export function buildCacheKey(
  api: string,
  endpoint: string,
  params: Record<string, string | number>
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramValues = sortedKeys.map((k) => params[k]).join('_');
  return `${api}:${endpoint}:${paramValues}`;
}
