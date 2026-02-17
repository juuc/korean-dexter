/**
 * Corp Code Resolver — maps user input (ticker, name, corp_code) to OpenDART corp_code.
 *
 * Resolution strategy (ordered by priority):
 * 1. Exact ticker match (6-digit stock code) -> confidence 1.0
 * 2. Exact corp_code match (8-digit DART code) -> confidence 1.0
 * 3. Exact name match (normalized) -> confidence 1.0
 * 4. Fuzzy name match (jamo-aware Levenshtein) -> confidence = similarity
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { unzipSync } from 'fflate';
import type { CorpMapping, CorpCodeResult } from './types.js';
import { jamoSimilarity } from './jamo.js';

/** Minimum input length for fuzzy matching */
const MIN_FUZZY_INPUT_LENGTH = 2;

/** Minimum similarity threshold for fuzzy results */
const MIN_SIMILARITY_THRESHOLD = 0.5;

/** Maximum number of fuzzy alternatives to return */
const MAX_ALTERNATIVES = 5;

/**
 * Normalize a company name for exact matching.
 * Trims whitespace, collapses multiple spaces, and strips common suffixes.
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '')
    .trim();
}

/**
 * Converts a CorpMapping stock_code to the nullable format used in results.
 * Empty string (unlisted) becomes null.
 */
function stockCodeOrNull(stockCode: string): string | null {
  return stockCode === '' ? null : stockCode;
}

export class CorpCodeResolver {
  private readonly byTicker: Map<string, CorpMapping> = new Map();
  private readonly byCorpCode: Map<string, CorpMapping> = new Map();
  private readonly byName: Map<string, CorpMapping[]> = new Map();
  private mappings: CorpMapping[] = [];

  /** Load mappings from pre-parsed data (primarily for testing). */
  async loadFromData(mappings: ReadonlyArray<CorpMapping>): Promise<void> {
    this.mappings = [...mappings];
    this.buildIndices();
  }

  /**
   * Download corp code mappings from OpenDART API.
   * Fetches the corpCode.xml ZIP, decompresses, parses XML, and builds indices.
   */
  async loadFromApi(apiKey: string): Promise<void> {
    const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `OpenDART corpCode.xml download failed: ${response.status} ${response.statusText}`
      );
    }

    const zipBuffer = new Uint8Array(await response.arrayBuffer());
    const unzipped = unzipSync(zipBuffer);

    // Find the XML file inside the ZIP
    const xmlFileName = Object.keys(unzipped).find((name) => name.endsWith('.xml'));
    if (!xmlFileName) {
      throw new Error('No XML file found in corpCode.xml ZIP response');
    }

    const xmlContent = new TextDecoder('utf-8').decode(unzipped[xmlFileName]);
    this.mappings = parseCorpCodeXml(xmlContent);
    this.buildIndices();
  }

  /**
   * Load mappings from a JSON cache file on disk.
   * Returns true if cache was loaded successfully, false if file not found.
   */
  async loadFromCache(cachePath: string): Promise<boolean> {
    try {
      const raw = await readFile(cachePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return false;
      }

      this.mappings = parsed as CorpMapping[];
      this.buildIndices();
      return true;
    } catch {
      return false;
    }
  }

  /** Save current mappings to a JSON cache file on disk. */
  async saveToCache(cachePath: string): Promise<void> {
    const dir = dirname(cachePath);
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(this.mappings), 'utf-8');
  }

  /**
   * Resolve user input to a corp code result.
   *
   * Tries in order: exact ticker -> exact corp_code -> exact name -> fuzzy name.
   * Returns null if no match found.
   */
  resolve(input: string): CorpCodeResult | null {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return null;
    }

    // 1. Exact ticker match (6-digit stock code)
    if (/^\d{6}$/.test(trimmed)) {
      const mapping = this.byTicker.get(trimmed);
      if (mapping) {
        return {
          corp_code: mapping.corp_code,
          corp_name: mapping.corp_name,
          stock_code: stockCodeOrNull(mapping.stock_code),
          confidence: 1.0,
          matchType: 'exact_ticker',
          alternatives: [],
        };
      }
    }

    // 2. Exact corp_code match (8-digit DART code)
    if (/^\d{8}$/.test(trimmed)) {
      const mapping = this.byCorpCode.get(trimmed);
      if (mapping) {
        return {
          corp_code: mapping.corp_code,
          corp_name: mapping.corp_name,
          stock_code: stockCodeOrNull(mapping.stock_code),
          confidence: 1.0,
          matchType: 'exact_corpcode',
          alternatives: [],
        };
      }
    }

    // 3. Exact name match (normalized)
    const normalized = normalizeName(trimmed);
    const exactMatches = this.byName.get(normalized);
    if (exactMatches && exactMatches.length > 0) {
      // Prefer listed companies when multiple exact matches
      const sorted = [...exactMatches].sort((a, b) => {
        const aListed = a.stock_code !== '' ? 1 : 0;
        const bListed = b.stock_code !== '' ? 1 : 0;
        return bListed - aListed;
      });

      const best = sorted[0];
      const alternatives = sorted.slice(1).map((m) => ({
        corp_code: m.corp_code,
        corp_name: m.corp_name,
        stock_code: stockCodeOrNull(m.stock_code),
        similarity: 1.0,
      }));

      return {
        corp_code: best.corp_code,
        corp_name: best.corp_name,
        stock_code: stockCodeOrNull(best.stock_code),
        confidence: 1.0,
        matchType: 'exact_name',
        alternatives,
      };
    }

    // 4. Fuzzy name match (jamo-aware)
    if (normalized.length < MIN_FUZZY_INPUT_LENGTH) {
      return null;
    }

    const scored = this.mappings
      .map((m) => ({
        mapping: m,
        similarity: jamoSimilarity(normalized, normalizeName(m.corp_name)),
      }))
      .filter((entry) => entry.similarity > MIN_SIMILARITY_THRESHOLD)
      .sort((a, b) => {
        // Primary: higher similarity first
        if (b.similarity !== a.similarity) {
          return b.similarity - a.similarity;
        }
        // Secondary: listed companies first
        const aListed = a.mapping.stock_code !== '' ? 1 : 0;
        const bListed = b.mapping.stock_code !== '' ? 1 : 0;
        return bListed - aListed;
      });

    if (scored.length === 0) {
      return null;
    }

    const best = scored[0];
    const alternatives = scored.slice(1, MAX_ALTERNATIVES + 1).map((entry) => ({
      corp_code: entry.mapping.corp_code,
      corp_name: entry.mapping.corp_name,
      stock_code: stockCodeOrNull(entry.mapping.stock_code),
      similarity: entry.similarity,
    }));

    return {
      corp_code: best.mapping.corp_code,
      corp_name: best.mapping.corp_name,
      stock_code: stockCodeOrNull(best.mapping.stock_code),
      confidence: best.similarity,
      matchType: 'fuzzy_name',
      alternatives,
    };
  }

  /**
   * Search for companies by name prefix (for autocomplete).
   * Returns up to `limit` mappings whose normalized name starts with the prefix.
   */
  searchByPrefix(prefix: string, limit: number = 10): CorpMapping[] {
    const normalizedPrefix = normalizeName(prefix);
    if (normalizedPrefix.length === 0) {
      return [];
    }

    const results: CorpMapping[] = [];
    for (const mapping of this.mappings) {
      if (results.length >= limit) break;
      const normalizedName = normalizeName(mapping.corp_name);
      if (normalizedName.startsWith(normalizedPrefix)) {
        results.push(mapping);
      }
    }

    return results;
  }

  /** Number of loaded mappings. */
  get count(): number {
    return this.mappings.length;
  }

  /** Whether mappings have been loaded. */
  get isLoaded(): boolean {
    return this.mappings.length > 0;
  }

  /** Build lookup indices from the current mappings array. */
  private buildIndices(): void {
    this.byTicker.clear();
    this.byCorpCode.clear();
    this.byName.clear();

    for (const mapping of this.mappings) {
      // Index by ticker (only listed companies)
      if (mapping.stock_code !== '') {
        this.byTicker.set(mapping.stock_code, mapping);
      }

      // Index by corp_code
      this.byCorpCode.set(mapping.corp_code, mapping);

      // Index by normalized name (may have duplicates)
      const normalized = normalizeName(mapping.corp_name);
      const existing = this.byName.get(normalized);
      if (existing) {
        this.byName.set(normalized, [...existing, mapping]);
      } else {
        this.byName.set(normalized, [mapping]);
      }
    }
  }
}

/**
 * Parse OpenDART corpCode.xml content into CorpMapping array.
 * XML structure: <result><list><corp_code/><corp_name/><stock_code/><modify_date/></list>...</result>
 */
function parseCorpCodeXml(xml: string): CorpMapping[] {
  const results: CorpMapping[] = [];
  const listRegex = /<list>([\s\S]*?)<\/list>/g;
  let match: RegExpExecArray | null;

  while ((match = listRegex.exec(xml)) !== null) {
    const block = match[1];
    const corpCode = extractXmlTag(block, 'corp_code');
    const corpName = extractXmlTag(block, 'corp_name');
    const stockCode = extractXmlTag(block, 'stock_code');
    const modifyDate = extractXmlTag(block, 'modify_date');

    if (corpCode && corpName) {
      results.push({
        corp_code: corpCode,
        corp_name: corpName,
        stock_code: stockCode?.trim() ?? '',
        modify_date: modifyDate ?? '',
      });
    }
  }

  return results;
}

function extractXmlTag(block: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const match = regex.exec(block);
  return match ? match[1] : null;
}

/** Factory function to create a new CorpCodeResolver instance. */
export function createCorpCodeResolver(): CorpCodeResolver {
  return new CorpCodeResolver();
}
