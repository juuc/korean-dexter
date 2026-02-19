/**
 * Multi-session persistence — each conversation is saved as a separate file
 * under ~/.korean-dexter/sessions/{sessionId}.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { HistoryItem, DisplayEvent } from '../components/index.js';
import type { ToolStartEvent, ToolEndEvent } from '../agent/types.js';

// ============================================================================
// Types
// ============================================================================

export interface SerializedToolCall {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: string;
}

export interface SerializedTurn {
  readonly id: string;
  readonly query: string;
  readonly answer: string;
  readonly summary: string;
  readonly status: 'complete';
  readonly duration?: number;
  readonly tokenUsage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly tokensPerSecond?: number;
  readonly toolCalls: ReadonlyArray<SerializedToolCall>;
  readonly createdAt: string;
}

export interface SessionData {
  readonly version: 1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turns: ReadonlyArray<SerializedTurn>;
}

export interface SessionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turnCount: number;
  readonly firstQuery: string;
}

// ============================================================================
// Paths
// ============================================================================

const BASE_DIR = join(homedir(), '.korean-dexter');
const SESSIONS_DIR = join(BASE_DIR, 'sessions');
const LEGACY_SESSION_PATH = join(BASE_DIR, 'session.json');

function sessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

// ============================================================================
// Session ID generation
// ============================================================================

/**
 * Generate a timestamp-based session ID: YYYYMMDD-HHmmss-{random4}
 */
export function generateSessionId(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate parsed JSON as a valid SessionData object.
 */
function isValidSession(data: unknown): data is SessionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    (data as SessionData).version === 1 &&
    'turns' in data &&
    Array.isArray((data as SessionData).turns)
  );
}

// ============================================================================
// Core functions
// ============================================================================

/**
 * Load a specific session from disk. Returns null if missing or corrupt.
 */
export function loadSession(sessionId: string): SessionData | null {
  try {
    const filePath = sessionPath(sessionId);
    if (!existsSync(filePath)) return null;
    const text = readFileSync(filePath, 'utf-8');
    const data: unknown = JSON.parse(text);
    return isValidSession(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Write session data to disk for a specific session.
 */
export function saveSession(sessionId: string, session: SessionData): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  writeFileSync(sessionPath(sessionId), JSON.stringify(session, null, 2));
}

/**
 * Append a completed turn to a specific session file.
 */
export function appendTurn(sessionId: string, turn: SerializedTurn): void {
  const existing = loadSession(sessionId);
  const now = new Date().toISOString();
  const session: SessionData = existing
    ? { ...existing, updatedAt: now, turns: [...existing.turns, turn] }
    : { version: 1, createdAt: now, updatedAt: now, turns: [turn] };
  saveSession(sessionId, session);
}

// ============================================================================
// Multi-session management
// ============================================================================

/**
 * List all sessions sorted newest-first.
 * Scans the sessions directory and returns metadata for each valid session file.
 */
export function listSessions(): SessionSummary[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    try {
      const filePath = join(SESSIONS_DIR, file);
      const text = readFileSync(filePath, 'utf-8');
      const data: unknown = JSON.parse(text);
      if (!isValidSession(data) || data.turns.length === 0) continue;

      const id = file.replace(/\.json$/, '');
      summaries.push({
        id,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        turnCount: data.turns.length,
        firstQuery: data.turns[0].query,
      });
    } catch {
      // Skip corrupt files
    }
  }

  // Sort newest-first by filename (timestamp-based IDs sort naturally)
  return summaries.sort((a, b) => b.id.localeCompare(a.id));
}

// ============================================================================
// Legacy migration
// ============================================================================

/**
 * One-time migration: move old session.json → sessions/{id}.json
 * Idempotent — does nothing if legacy file doesn't exist.
 */
export function migrateLegacySession(): void {
  try {
    if (!existsSync(LEGACY_SESSION_PATH)) return;

    const text = readFileSync(LEGACY_SESSION_PATH, 'utf-8');
    const data: unknown = JSON.parse(text);
    if (!isValidSession(data) || data.turns.length === 0) {
      // Invalid or empty — just delete
      unlinkSync(LEGACY_SESSION_PATH);
      return;
    }

    // Generate an ID from the session's createdAt timestamp
    const created = new Date(data.createdAt);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const date = `${created.getFullYear()}${pad2(created.getMonth() + 1)}${pad2(created.getDate())}`;
    const time = `${pad2(created.getHours())}${pad2(created.getMinutes())}${pad2(created.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 6);
    const sessionId = `${date}-${time}-${rand}`;

    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    writeFileSync(sessionPath(sessionId), JSON.stringify(data, null, 2));
    unlinkSync(LEGACY_SESSION_PATH);
  } catch {
    // Best-effort migration — don't crash on failure
  }
}

// ============================================================================
// Conversion helpers
// ============================================================================

/**
 * Reconstruct minimal DisplayEvent[] from saved toolCalls.
 * Creates paired tool_start + tool_end events so the UI can render tool summaries.
 */
export function turnsToDisplayEvents(
  toolCalls: ReadonlyArray<SerializedToolCall>
): DisplayEvent[] {
  return toolCalls.map((tc, i) => {
    const toolId = `restored-tool-${i}`;
    const startEvent: ToolStartEvent = {
      type: 'tool_start',
      tool: tc.tool,
      args: tc.args,
    };
    const endEvent: ToolEndEvent = {
      type: 'tool_end',
      tool: tc.tool,
      args: tc.args,
      result: tc.result,
      duration: 0,
    };
    return {
      id: toolId,
      event: startEvent,
      completed: true,
      endEvent,
    };
  });
}

/**
 * Convert persisted turns into HistoryItem[] for the UI.
 */
export function turnsToHistoryItems(
  turns: ReadonlyArray<SerializedTurn>
): HistoryItem[] {
  return turns.map((turn) => ({
    id: turn.id,
    query: turn.query,
    events: turnsToDisplayEvents(turn.toolCalls),
    answer: turn.answer,
    status: 'complete' as const,
    duration: turn.duration,
    tokenUsage: turn.tokenUsage
      ? {
          inputTokens: turn.tokenUsage.inputTokens,
          outputTokens: turn.tokenUsage.outputTokens,
          totalTokens: turn.tokenUsage.totalTokens,
        }
      : undefined,
    tokensPerSecond: turn.tokensPerSecond,
  }));
}
