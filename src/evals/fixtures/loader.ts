import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureSet, FixtureIndex } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a fixture set for a specific corp code.
 * Returns null if the fixture file doesn't exist.
 */
export function loadFixtureSet(corpCode: string): FixtureSet | null {
  const fixturePath = join(__dirname, 'data', `${corpCode}.json`);

  if (!existsSync(fixturePath)) {
    return null;
  }

  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content) as FixtureSet;
}

/**
 * Load the fixture index from data/index.json.
 */
export function loadFixtureIndex(): FixtureIndex {
  const indexPath = join(__dirname, 'data', 'index.json');

  if (!existsSync(indexPath)) {
    return { companies: [] };
  }

  const content = readFileSync(indexPath, 'utf-8');
  return JSON.parse(content) as FixtureIndex;
}

/**
 * Find a matching response in a fixture set by endpoint and params.
 * Returns null if no matching response is found.
 */
export function findFixtureResponse(
  fixtureSet: FixtureSet,
  endpoint: string,
  params: Record<string, string>
): unknown | null {
  // Normalize endpoint by removing leading slash and .json suffix if present
  const normalizedEndpoint = endpoint
    .replace(/^\//, '')
    .replace(/\.json$/, '');

  for (const response of fixtureSet.responses) {
    const normalizedResponseEndpoint = response.endpoint
      .replace(/^\//, '')
      .replace(/\.json$/, '');

    if (normalizedResponseEndpoint === normalizedEndpoint) {
      // Check if params match
      if (paramsMatch(response.params, params)) {
        return response.response;
      }
    }
  }

  return null;
}

/**
 * Check if two param objects match (ignoring crtfc_key, appkey, appsecret, etc.).
 */
function paramsMatch(
  fixtureParams: Record<string, string>,
  requestParams: Record<string, string>
): boolean {
  // Keys to ignore when comparing params
  const ignoreKeys = new Set(['crtfc_key', 'appkey', 'appsecret', 'tr_id']);

  // Get all unique keys from both objects, excluding ignored keys
  const allKeys = new Set([
    ...Object.keys(fixtureParams).filter(k => !ignoreKeys.has(k)),
    ...Object.keys(requestParams).filter(k => !ignoreKeys.has(k)),
  ]);

  // Check if all keys have matching values
  for (const key of allKeys) {
    if (fixtureParams[key] !== requestParams[key]) {
      return false;
    }
  }

  return true;
}
