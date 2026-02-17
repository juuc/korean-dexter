# Fixture System for Deterministic Eval Replay

This module provides a fixture recording and replay system for deterministic evaluation of the Korean Dexter agent. It allows you to record real API responses and replay them in tests without making actual API calls.

## Purpose

- **Deterministic Testing**: Replay exact API responses for consistent eval results
- **Cost Efficiency**: Avoid burning API quotas during eval development
- **Offline Development**: Test eval logic without network access
- **Reproducibility**: Share fixture data with team members for consistent testing

## Architecture

### Components

1. **Types** (`types.ts`) - TypeScript interfaces for fixture data structures
2. **Loader** (`loader.ts`) - Load fixtures from JSON files
3. **Recorder** (`recorder.ts`) - Record live API responses as fixtures
4. **Mock Clients** (`mock-clients.ts`) - Drop-in replacements for OpenDartClient and KISClient

### Data Storage

Fixtures are stored in `src/evals/fixtures/data/`:

```
data/
├── index.json          # Master index of all fixtures
├── 00126380.json       # Samsung Electronics fixture
└── 00164779.json       # Hyundai Motor fixture
```

## Usage

### Recording Fixtures

Record fixtures from live API calls:

```bash
# Record specific companies
bun scripts/record-fixtures.ts --corp-codes 00126380,00164779

# Record predefined list (Samsung, Hyundai)
bun scripts/record-fixtures.ts --all
```

The recorder will:
1. Call real OpenDART APIs for each company
2. Save responses to `data/{corp_code}.json`
3. Update `data/index.json` with the new entry

### Using Mock Clients in Tests

Replace real API clients with mock versions that return fixture data:

```typescript
import {
  loadFixtureSet,
  createMockOpenDartClient,
} from '@/evals/fixtures';

// Load fixture data
const samsungFixture = loadFixtureSet('00126380');
const fixtureSets = new Map([
  ['00126380', samsungFixture],
]);

// Create mock client
const mockClient = createMockOpenDartClient(fixtureSets);

// Use exactly like the real OpenDartClient
const result = await mockClient.request('company', {
  corp_code: '00126380',
});

console.log(result.data); // Returns fixture data, not real API response
```

### Loading Fixtures

```typescript
import { loadFixtureSet, loadFixtureIndex } from '@/evals/fixtures';

// Load a specific company's fixtures
const fixtureSet = loadFixtureSet('00126380');
if (fixtureSet) {
  console.log(fixtureSet.corpName); // "삼성전자"
  console.log(fixtureSet.responses.length); // Number of recorded API calls
}

// Load the index of all available fixtures
const index = loadFixtureIndex();
console.log(index.companies); // Array of all fixture entries
```

### Finding Specific Responses

```typescript
import { findFixtureResponse } from '@/evals/fixtures';

const response = findFixtureResponse(
  fixtureSet,
  'fnlttSinglAcnt',
  {
    corp_code: '00126380',
    bsns_year: '2024',
    reprt_code: '11011',
  }
);

if (response) {
  console.log(response); // Raw API response data
}
```

## Fixture Data Format

### FixtureSet

```typescript
{
  "corpCode": "00126380",
  "corpName": "삼성전자",
  "recordedAt": "2024-01-15T10:30:00.000Z",
  "responses": [
    {
      "endpoint": "company",
      "params": { "corp_code": "00126380" },
      "response": { "corp_name": "삼성전자", ... }
    },
    {
      "endpoint": "fnlttSinglAcnt",
      "params": {
        "corp_code": "00126380",
        "bsns_year": "2024",
        "reprt_code": "11011"
      },
      "response": { "status": "000", "list": [...] }
    }
  ]
}
```

### Index File

```typescript
{
  "companies": [
    {
      "corpCode": "00126380",
      "corpName": "삼성전자",
      "fixturePath": "00126380.json"
    }
  ]
}
```

## Mock Client Behavior

### OpenDartClient Mock

- Looks up fixture by `corp_code` parameter
- Matches endpoint and params (ignores `crtfc_key`)
- Returns `ToolResult<T>` with fixture data
- Returns `NOT_FOUND` error if no matching fixture exists

### KISClient Mock

- Looks up fixture by stock code parameter (`FID_INPUT_ISCD` or `fid_input_iscd`)
- Matches path and params
- Returns `ToolResult<T>` with fixture data
- Returns `NOT_FOUND` error if no matching fixture exists

## Best Practices

1. **Record Representative Data**: Include both success and error cases
2. **Version Control**: Commit fixture files to git for team sharing
3. **Update Regularly**: Re-record fixtures when APIs change
4. **Document Coverage**: Note which scenarios are covered in fixture data
5. **Minimal Fixtures**: Only record what you need for evals

## Example: Eval with Fixtures

```typescript
import {
  loadFixtureSet,
  createMockOpenDartClient,
} from '@/evals/fixtures';

async function runEval() {
  // Load all fixture sets
  const index = loadFixtureIndex();
  const fixtureSets = new Map();

  for (const entry of index.companies) {
    const fixtureSet = loadFixtureSet(entry.corpCode);
    if (fixtureSet) {
      fixtureSets.set(entry.corpCode, fixtureSet);
    }
  }

  // Create mock client
  const mockClient = createMockOpenDartClient(fixtureSets);

  // Run eval with mock client instead of real client
  const results = await evaluateAgent(mockClient);

  return results;
}
```

## API Reference

### `loadFixtureSet(corpCode: string): FixtureSet | null`

Load a fixture set for a specific corp code. Returns null if file doesn't exist.

### `loadFixtureIndex(): FixtureIndex`

Load the master index of all available fixtures.

### `findFixtureResponse(fixtureSet: FixtureSet, endpoint: string, params: Record<string, string>): unknown | null`

Find a matching response in a fixture set. Returns null if no match found.

### `createMockOpenDartClient(fixtureSets: Map<string, FixtureSet>): MockOpenDartClient`

Create a mock OpenDartClient that returns fixture data.

### `createMockKISClient(fixtureSets: Map<string, FixtureSet>): MockKISClient`

Create a mock KISClient that returns fixture data.

### `recordFixtures(corpCodes: readonly string[]): Promise<void>`

Record fixtures for multiple corp codes from live API calls.

## Testing

Run the fixture system tests:

```bash
bun test src/evals/fixtures/fixtures.test.ts
```

## Future Enhancements

- [ ] Add KIS API fixture recording support
- [ ] Support for partial param matching (wildcards)
- [ ] Fixture versioning and migration
- [ ] Automatic stale fixture detection
- [ ] Fixture diff tool for comparing responses
