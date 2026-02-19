import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { SerializedTurn, SessionData } from './session-store.js';

// We test the pure conversion functions directly via imports,
// and test file-based logic via manual filesystem operations
// (module paths are hardcoded to ~/.korean-dexter/sessions/).

import {
  turnsToHistoryItems,
  turnsToDisplayEvents,
  generateSessionId,
} from './session-store.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeTurn(overrides: Partial<SerializedTurn> = {}): SerializedTurn {
  return {
    id: '1',
    query: '삼성전자 매출은?',
    answer: '삼성전자의 2024년 매출은 약 300조원입니다.',
    summary: '삼성전자 2024년 매출 약 300조원',
    status: 'complete',
    duration: 5200,
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    tokensPerSecond: 38.5,
    toolCalls: [
      { tool: 'get_financial_data', args: { ticker: '005930' }, result: '{"revenue": "300조원"}' },
    ],
    createdAt: '2026-02-18T10:00:00.000Z',
    ...overrides,
  };
}

function makeSession(turns: SerializedTurn[]): SessionData {
  return {
    version: 1,
    createdAt: '2026-02-18T09:00:00.000Z',
    updatedAt: '2026-02-18T10:00:00.000Z',
    turns,
  };
}

// ============================================================================
// generateSessionId tests
// ============================================================================

describe('generateSessionId', () => {
  test('matches YYYYMMDD-HHmmss-XXXX format', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^\d{8}-\d{6}-[a-z0-9]{4}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSessionId()));
    // With random suffix, collisions should be extremely rare
    expect(ids.size).toBeGreaterThanOrEqual(15);
  });

  test('starts with current date', () => {
    const id = generateSessionId();
    const now = new Date();
    const year = String(now.getFullYear());
    expect(id.startsWith(year)).toBe(true);
  });
});

// ============================================================================
// File-based round-trip tests (manual read/write to temp dir)
// ============================================================================

describe('session file round-trip', () => {
  const TEST_DIR = join(tmpdir(), `korean-dexter-test-${Date.now()}`);
  const SESSIONS_DIR = join(TEST_DIR, 'sessions');

  beforeEach(() => {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('write and read session data', () => {
    const session = makeSession([makeTurn()]);
    const filePath = join(SESSIONS_DIR, '20260218-090000-abcd.json');
    writeFileSync(filePath, JSON.stringify(session, null, 2));

    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;

    expect(raw.version).toBe(1);
    expect(raw.turns).toHaveLength(1);
    expect(raw.turns[0].query).toBe('삼성전자 매출은?');
    expect(raw.turns[0].toolCalls[0].tool).toBe('get_financial_data');
  });

  test('append turn to existing session', () => {
    const filePath = join(SESSIONS_DIR, '20260218-090000-abcd.json');
    const session = makeSession([makeTurn({ id: '1' })]);
    writeFileSync(filePath, JSON.stringify(session));

    // Simulate appendTurn logic
    const existing = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;
    const updated: SessionData = {
      ...existing,
      updatedAt: new Date().toISOString(),
      turns: [...existing.turns, makeTurn({ id: '2', query: '영업이익은?' })],
    };
    writeFileSync(filePath, JSON.stringify(updated));

    const result = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;
    expect(result.turns).toHaveLength(2);
    expect(result.turns[1].query).toBe('영업이익은?');
  });

  test('corrupt file returns null-equivalent', () => {
    const filePath = join(SESSIONS_DIR, '20260218-090000-bad1.json');
    writeFileSync(filePath, 'not valid json{{{');

    let parsed: SessionData | null = null;
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'version' in raw &&
        (raw as SessionData).version === 1
      ) {
        parsed = raw as SessionData;
      }
    } catch {
      parsed = null;
    }

    expect(parsed).toBeNull();
  });

  test('missing file is handled gracefully', () => {
    expect(existsSync(join(SESSIONS_DIR, 'nonexistent.json'))).toBe(false);
  });
});

// ============================================================================
// listSessions simulation tests
// ============================================================================

describe('listSessions logic', () => {
  const TEST_DIR = join(tmpdir(), `korean-dexter-list-${Date.now()}`);
  const SESSIONS_DIR = join(TEST_DIR, 'sessions');

  beforeEach(() => {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('reads multiple session files and sorts newest-first', () => {
    // Write three session files with different timestamps
    const sessions = [
      { id: '20260217-160000-aaaa', createdAt: '2026-02-17T16:00:00.000Z', query: '코스피 지수 추이' },
      { id: '20260219-143000-bbbb', createdAt: '2026-02-19T14:30:00.000Z', query: '삼성전자 매출은?' },
      { id: '20260218-091500-cccc', createdAt: '2026-02-18T09:15:00.000Z', query: 'SK하이닉스 영업이익' },
    ];

    for (const s of sessions) {
      const data = makeSession([makeTurn({ query: s.query })]);
      const sessionData: SessionData = { ...data, createdAt: s.createdAt };
      writeFileSync(join(SESSIONS_DIR, `${s.id}.json`), JSON.stringify(sessionData));
    }

    // Simulate listSessions logic: read files, parse, sort by ID desc
    const { readdirSync } = require('fs');
    const files = (readdirSync(SESSIONS_DIR) as string[]).filter((f: string) => f.endsWith('.json'));
    const summaries: Array<{ id: string; firstQuery: string }> = [];

    for (const file of files) {
      const text = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
      const data = JSON.parse(text) as SessionData;
      if (data.version === 1 && data.turns.length > 0) {
        summaries.push({ id: file.replace(/\.json$/, ''), firstQuery: data.turns[0].query });
      }
    }
    summaries.sort((a, b) => b.id.localeCompare(a.id));

    expect(summaries).toHaveLength(3);
    expect(summaries[0].id).toBe('20260219-143000-bbbb');
    expect(summaries[1].id).toBe('20260218-091500-cccc');
    expect(summaries[2].id).toBe('20260217-160000-aaaa');
  });

  test('skips corrupt and empty session files', () => {
    // Valid session
    writeFileSync(
      join(SESSIONS_DIR, '20260219-100000-good.json'),
      JSON.stringify(makeSession([makeTurn()]))
    );
    // Corrupt file
    writeFileSync(join(SESSIONS_DIR, '20260219-100001-bad1.json'), 'invalid json{{{');
    // Empty turns
    writeFileSync(
      join(SESSIONS_DIR, '20260219-100002-bad2.json'),
      JSON.stringify(makeSession([]))
    );

    const { readdirSync } = require('fs');
    const files = (readdirSync(SESSIONS_DIR) as string[]).filter((f: string) => f.endsWith('.json'));
    const validSessions: string[] = [];

    for (const file of files) {
      try {
        const text = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
        const data = JSON.parse(text) as SessionData;
        if (data.version === 1 && data.turns.length > 0) {
          validSessions.push(file.replace(/\.json$/, ''));
        }
      } catch {
        // skip
      }
    }

    expect(validSessions).toHaveLength(1);
    expect(validSessions[0]).toBe('20260219-100000-good');
  });
});

// ============================================================================
// migrateLegacySession simulation tests
// ============================================================================

describe('migrateLegacySession logic', () => {
  const TEST_DIR = join(tmpdir(), `korean-dexter-migrate-${Date.now()}`);
  const LEGACY_PATH = join(TEST_DIR, 'session.json');
  const SESSIONS_DIR = join(TEST_DIR, 'sessions');

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('migrates valid legacy session to sessions dir', () => {
    const session = makeSession([makeTurn()]);
    writeFileSync(LEGACY_PATH, JSON.stringify(session));

    // Simulate migration logic
    const text = readFileSync(LEGACY_PATH, 'utf-8');
    const data = JSON.parse(text) as SessionData;
    expect(data.version).toBe(1);
    expect(data.turns.length).toBeGreaterThan(0);

    mkdirSync(SESSIONS_DIR, { recursive: true });
    const migratedId = '20260218-090000-test';
    writeFileSync(join(SESSIONS_DIR, `${migratedId}.json`), JSON.stringify(data, null, 2));
    rmSync(LEGACY_PATH);

    // Verify: legacy file gone, session file exists
    expect(existsSync(LEGACY_PATH)).toBe(false);
    expect(existsSync(join(SESSIONS_DIR, `${migratedId}.json`))).toBe(true);

    const migrated = JSON.parse(readFileSync(join(SESSIONS_DIR, `${migratedId}.json`), 'utf-8')) as SessionData;
    expect(migrated.turns).toHaveLength(1);
    expect(migrated.turns[0].query).toBe('삼성전자 매출은?');
  });

  test('deletes empty legacy session without migrating', () => {
    writeFileSync(LEGACY_PATH, JSON.stringify(makeSession([])));

    // Simulate: empty session → delete, don't migrate
    const text = readFileSync(LEGACY_PATH, 'utf-8');
    const data = JSON.parse(text) as SessionData;
    expect(data.turns.length).toBe(0);

    rmSync(LEGACY_PATH);
    expect(existsSync(LEGACY_PATH)).toBe(false);
    expect(existsSync(SESSIONS_DIR)).toBe(false);
  });
});

// ============================================================================
// Conversion function tests
// ============================================================================

describe('turnsToHistoryItems', () => {
  test('converts turns to history items', () => {
    const turns = [makeTurn({ id: 'abc' })];
    const items = turnsToHistoryItems(turns);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('abc');
    expect(items[0].query).toBe('삼성전자 매출은?');
    expect(items[0].answer).toBe('삼성전자의 2024년 매출은 약 300조원입니다.');
    expect(items[0].status).toBe('complete');
    expect(items[0].duration).toBe(5200);
    expect(items[0].tokenUsage).toEqual({ inputTokens: 100, outputTokens: 200, totalTokens: 300 });
    expect(items[0].tokensPerSecond).toBe(38.5);
  });

  test('converts tool calls to display events', () => {
    const turns = [makeTurn()];
    const items = turnsToHistoryItems(turns);

    expect(items[0].events).toHaveLength(1);
    expect(items[0].events[0].completed).toBe(true);
    expect(items[0].events[0].event.type).toBe('tool_start');
  });

  test('handles empty turns', () => {
    expect(turnsToHistoryItems([])).toEqual([]);
  });

  test('handles turns without optional fields', () => {
    const turn = makeTurn({
      duration: undefined,
      tokenUsage: undefined,
      tokensPerSecond: undefined,
    });
    const items = turnsToHistoryItems([turn]);

    expect(items[0].duration).toBeUndefined();
    expect(items[0].tokenUsage).toBeUndefined();
    expect(items[0].tokensPerSecond).toBeUndefined();
  });
});

describe('turnsToDisplayEvents', () => {
  test('creates paired start/end events', () => {
    const toolCalls = [
      { tool: 'get_stock_price', args: { ticker: '005930' }, result: '{"price": 75000}' },
      { tool: 'get_financial_data', args: { corp_code: '00126380' }, result: '{"revenue": "300조원"}' },
    ];
    const events = turnsToDisplayEvents(toolCalls);

    expect(events).toHaveLength(2);

    // First tool call
    expect(events[0].event.type).toBe('tool_start');
    expect((events[0].event as { tool: string }).tool).toBe('get_stock_price');
    expect(events[0].completed).toBe(true);
    expect(events[0].endEvent?.type).toBe('tool_end');

    // Second tool call
    expect(events[1].event.type).toBe('tool_start');
    expect((events[1].event as { tool: string }).tool).toBe('get_financial_data');
    expect(events[1].completed).toBe(true);
  });

  test('handles empty tool calls', () => {
    expect(turnsToDisplayEvents([])).toEqual([]);
  });
});
