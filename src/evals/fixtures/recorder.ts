import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenDartClient } from '@/tools/core/opendart/client.js';
import type { FixtureSet, FixtureResponse, FixtureIndex } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Record fixtures for multiple corp codes.
 * This will call real OpenDART APIs and save responses to fixture files.
 */
export async function recordFixtures(corpCodes: readonly string[]): Promise<void> {
  const client = new OpenDartClient();

  for (const corpCode of corpCodes) {
    console.log(`Recording fixtures for corp_code: ${corpCode}`);

    try {
      const fixtureSet = await recordFixtureSetForCorpCode(client, corpCode);

      // Save fixture file
      const fixturePath = join(__dirname, 'data', `${corpCode}.json`);
      writeFileSync(fixturePath, JSON.stringify(fixtureSet, null, 2), 'utf-8');
      console.log(`✓ Saved fixture to ${fixturePath}`);

      // Update index
      updateFixtureIndex(corpCode, fixtureSet.corpName);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to record fixtures for ${corpCode}: ${message}`);
    }
  }

  client.close();
}

/**
 * Record a fixture set for a single corp code.
 */
async function recordFixtureSetForCorpCode(
  client: OpenDartClient,
  corpCode: string
): Promise<FixtureSet> {
  const responses: FixtureResponse[] = [];

  // 1. Get company info
  const companyResult = await client.request<{ corp_name: string }>(
    'company',
    { corp_code: corpCode }
  );

  if (!companyResult.success || !companyResult.data) {
    throw new Error(`Failed to fetch company info: ${companyResult.error?.message}`);
  }

  const corpName = companyResult.data.corp_name;

  responses.push({
    endpoint: 'company',
    params: { corp_code: corpCode },
    response: companyResult.data,
  });

  // 2. Get latest annual financial statements (2024, 2023)
  for (const year of ['2024', '2023']) {
    const fnlttResult = await client.request(
      'fnlttSinglAcnt',
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: '11011', // Annual report
      }
    );

    if (fnlttResult.success && fnlttResult.data) {
      responses.push({
        endpoint: 'fnlttSinglAcnt',
        params: {
          corp_code: corpCode,
          bsns_year: year,
          reprt_code: '11011',
        },
        response: fnlttResult.data,
      });
      console.log(`  ✓ Recorded fnlttSinglAcnt for ${year}`);
    } else {
      console.log(`  ✗ Skipped fnlttSinglAcnt for ${year}: ${fnlttResult.error?.message}`);
    }
  }

  // 3. Get latest quarterly report (2024 Q3)
  const q3Result = await client.request(
    'fnlttSinglAcnt',
    {
      corp_code: corpCode,
      bsns_year: '2024',
      reprt_code: '11014', // Q3 report
    }
  );

  if (q3Result.success && q3Result.data) {
    responses.push({
      endpoint: 'fnlttSinglAcnt',
      params: {
        corp_code: corpCode,
        bsns_year: '2024',
        reprt_code: '11014',
      },
      response: q3Result.data,
    });
    console.log(`  ✓ Recorded fnlttSinglAcnt for 2024 Q3`);
  } else {
    console.log(`  ✗ Skipped fnlttSinglAcnt for 2024 Q3: ${q3Result.error?.message}`);
  }

  return {
    corpCode,
    corpName,
    recordedAt: new Date().toISOString(),
    responses,
  };
}

/**
 * Update the fixture index with a new entry.
 */
function updateFixtureIndex(corpCode: string, corpName: string): void {
  const indexPath = join(__dirname, 'data', 'index.json');

  let index: FixtureIndex = { companies: [] };

  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');
    index = JSON.parse(content) as FixtureIndex;
  }

  // Check if entry already exists
  const existingIndex = index.companies.findIndex(
    entry => entry.corpCode === corpCode
  );

  const newEntry = {
    corpCode,
    corpName,
    fixturePath: `${corpCode}.json`,
  };

  if (existingIndex >= 0) {
    // Update existing entry
    index = {
      companies: [
        ...index.companies.slice(0, existingIndex),
        newEntry,
        ...index.companies.slice(existingIndex + 1),
      ],
    };
  } else {
    // Add new entry
    index = {
      companies: [...index.companies, newEntry],
    };
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`✓ Updated fixture index`);
}
