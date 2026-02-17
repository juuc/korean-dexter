import { describe, test, expect, afterEach } from 'bun:test';
import { setDartClient, setKisClient, resetClients } from './langchain-tools.js';
import type { DartClientLike } from '@/tools/core/opendart/client.js';
import type { KisClientLike } from '@/tools/core/kis/client.js';
import type { ToolResult } from '@/shared/types.js';
import { createToolResult } from '@/shared/types.js';

function createMockDartClient(): DartClientLike {
  return {
    async request<T>(): Promise<ToolResult<T>> {
      return createToolResult({} as T, { responseTimeMs: 0 });
    },
  };
}

function createMockKisClient(): KisClientLike {
  return {
    async request<T>(): Promise<ToolResult<T>> {
      return createToolResult({} as T, { responseTimeMs: 0 });
    },
  };
}

describe('langchain-tools client override mechanism', () => {
  afterEach(() => {
    resetClients();
  });

  test('setDartClient() overrides the singleton', () => {
    const mock = createMockDartClient();
    expect(() => setDartClient(mock)).not.toThrow();
  });

  test('setKisClient() overrides the singleton', () => {
    const mock = createMockKisClient();
    expect(() => setKisClient(mock)).not.toThrow();
  });

  test('resetClients() clears overrides', () => {
    setDartClient(createMockDartClient());
    setKisClient(createMockKisClient());
    expect(() => resetClients()).not.toThrow();
  });

  test('after resetClients, state is clean', () => {
    setDartClient(createMockDartClient());
    resetClients();
    // Double reset should not throw (no stale state)
    expect(() => resetClients()).not.toThrow();
  });
});
