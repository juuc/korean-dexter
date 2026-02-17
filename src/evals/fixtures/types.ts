/**
 * A recorded set of API responses for a single company.
 */
export interface FixtureSet {
  readonly corpCode: string;
  readonly corpName: string;
  readonly recordedAt: string; // ISO 8601
  readonly responses: readonly FixtureResponse[];
}

export interface FixtureResponse {
  readonly endpoint: string; // e.g., "opendart/fnlttSinglAcnt"
  readonly params: Record<string, string>;
  readonly response: unknown; // Raw API response
}

/**
 * Index mapping company names/codes to fixture files.
 */
export interface FixtureIndex {
  readonly companies: readonly FixtureCompanyEntry[];
}

export interface FixtureCompanyEntry {
  readonly corpCode: string;
  readonly corpName: string;
  readonly fixturePath: string; // Relative path to fixture JSON file
}
