import { describe, test, expect, beforeAll } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFixtureSet,
  loadFixtureIndex,
  findFixtureResponse,
  createMockOpenDartClient,
  type FixtureSet,
} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Fixture System', () => {
  const testCorpCode = '00000001';
  const testFixture: FixtureSet = {
    corpCode: testCorpCode,
    corpName: 'Test Company',
    recordedAt: '2024-01-01T00:00:00.000Z',
    responses: [
      {
        endpoint: 'company',
        params: { corp_code: testCorpCode },
        response: { corp_name: 'Test Company', corp_code: testCorpCode },
      },
      {
        endpoint: 'fnlttSinglAcnt',
        params: {
          corp_code: testCorpCode,
          bsns_year: '2024',
          reprt_code: '11011',
        },
        response: {
          status: '000',
          message: 'Success',
          list: [
            { account_nm: '자산총계', thstrm_amount: '1000000000000' },
          ],
        },
      },
    ],
  };

  beforeAll(() => {
    // Create a test fixture file
    const fixturePath = join(__dirname, 'data', `${testCorpCode}.json`);
    writeFileSync(fixturePath, JSON.stringify(testFixture, null, 2), 'utf-8');
  });

  test('loadFixtureSet loads fixture file', () => {
    const fixtureSet = loadFixtureSet(testCorpCode);
    expect(fixtureSet).not.toBeNull();
    expect(fixtureSet?.corpCode).toBe(testCorpCode);
    expect(fixtureSet?.corpName).toBe('Test Company');
    expect(fixtureSet?.responses).toHaveLength(2);
  });

  test('loadFixtureSet returns null for non-existent fixture', () => {
    const fixtureSet = loadFixtureSet('99999999');
    expect(fixtureSet).toBeNull();
  });

  test('loadFixtureIndex loads index file', () => {
    const index = loadFixtureIndex();
    expect(index).toBeDefined();
    expect(index.companies).toBeInstanceOf(Array);
  });

  test('findFixtureResponse finds matching response', () => {
    const response = findFixtureResponse(
      testFixture,
      'company',
      { corp_code: testCorpCode }
    );
    expect(response).not.toBeNull();
    expect((response as { corp_name: string }).corp_name).toBe('Test Company');
  });

  test('findFixtureResponse ignores crtfc_key in params', () => {
    const response = findFixtureResponse(
      testFixture,
      'company',
      { corp_code: testCorpCode, crtfc_key: 'some-key' }
    );
    expect(response).not.toBeNull();
  });

  test('findFixtureResponse returns null for no match', () => {
    const response = findFixtureResponse(
      testFixture,
      'nonexistent',
      { corp_code: testCorpCode }
    );
    expect(response).toBeNull();
  });

  test('MockOpenDartClient returns fixture data', async () => {
    const fixtureSets = new Map([[testCorpCode, testFixture]]);
    const mockClient = createMockOpenDartClient(fixtureSets);

    const result = await mockClient.request('company', {
      corp_code: testCorpCode,
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect((result.data as { corp_name: string }).corp_name).toBe('Test Company');
  });

  test('MockOpenDartClient returns error for missing fixture', async () => {
    const fixtureSets = new Map([[testCorpCode, testFixture]]);
    const mockClient = createMockOpenDartClient(fixtureSets);

    const result = await mockClient.request('company', {
      corp_code: '99999999',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  test('MockOpenDartClient returns error for missing corp_code param', async () => {
    const fixtureSets = new Map([[testCorpCode, testFixture]]);
    const mockClient = createMockOpenDartClient(fixtureSets);

    const result = await mockClient.request('company', {});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toContain('corp_code parameter is required');
  });
});
