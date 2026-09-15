/**
 * Persistence contract (plan §4.6, §6 T5).
 *
 *   bun test tests/console/persistence.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { SAVE_KEY, clear, load, parseRecord, save, type SaveRecord } from '../../src/console/persistence';
import type { TimeRecord } from '../../src/console/core/run';
import { newLog } from '../../src/sim/events';
import { CONSTANTS } from '../../src/sim/constants';
import { PRELUDE_HOURS } from '../../src/sim/time';

/** A Storage over a Map, as the browser's localStorage would behave. */
export class MemStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  [name: string]: unknown;
}

/** A Storage whose every method throws (private mode, quota, disabled). */
class BrokenStorage implements Storage {
  length = 0;
  clear(): void {
    throw new Error('disabled');
  }
  getItem(): string | null {
    throw new Error('disabled');
  }
  key(): string | null {
    throw new Error('disabled');
  }
  removeItem(): void {
    throw new Error('disabled');
  }
  setItem(): void {
    throw new Error('disabled');
  }
  [name: string]: unknown;
}

const time: TimeRecord = { t: PRELUDE_HOURS + 5, stampMs: 1_000, paused: false, speed: 24, carryMs: 12.5 };

function record(): SaveRecord {
  const log = newLog(7, 1_000);
  log.push({ type: 'routing.remove', ruleId: 'cf-summarizer-east', t: PRELUDE_HOURS + 5, wallMs: 2_000 });
  return { version: CONSTANTS.SIM_VERSION, seed: 7, log, time };
}

describe('persistence', () => {
  test('SAVE_KEY is the documented key', () => {
    expect(SAVE_KEY).toBe('spaghetti.console.run.v1');
  });

  test('round-trips through a MemStorage', () => {
    const storage = new MemStorage();
    const rec = record();
    expect(save(rec, storage)).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(load(storage)).toEqual(rec);
  });

  test('empty storage → null', () => {
    expect(load(new MemStorage())).toBeNull();
    expect(load(null)).toBeNull();
    expect(load(undefined)).toBeNull();
  });

  test('corrupt JSON → null', () => {
    const storage = new MemStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(load(storage)).toBeNull();
    storage.setItem(SAVE_KEY, '"a string"');
    expect(load(storage)).toBeNull();
    storage.setItem(SAVE_KEY, 'null');
    expect(load(storage)).toBeNull();
  });

  test('version mismatch → null', () => {
    const storage = new MemStorage();
    save({ ...record(), version: CONSTANTS.SIM_VERSION + 1 }, storage);
    expect(load(storage)).toBeNull();
    save(record(), storage);
    expect(load(storage, CONSTANTS.SIM_VERSION + 1)).toBeNull();
    expect(load(storage, CONSTANTS.SIM_VERSION)).not.toBeNull();
  });

  test('malformed shapes → null', () => {
    const good = record();
    expect(parseRecord(good)).toEqual(good);
    expect(parseRecord({ ...good, seed: 'x' })).toBeNull();
    expect(parseRecord({ ...good, log: [] })).toBeNull();
    expect(parseRecord({ ...good, log: [{ type: 'checkpoint', t: 1, hash: 'a' }] })).toBeNull();
    expect(parseRecord({ ...good, log: [good.log[0], { type: 'routing.remove' }] })).toBeNull();
    expect(parseRecord({ ...good, time: { ...time, speed: 7 } })).toBeNull();
    expect(parseRecord({ ...good, time: { ...time, paused: 'no' } })).toBeNull();
    expect(parseRecord({ ...good, time: { ...time, t: Number.NaN } })).toBeNull();
    expect(parseRecord({ ...good, time: undefined })).toBeNull();
  });

  test('clear forgets the run', () => {
    const storage = new MemStorage();
    save(record(), storage);
    clear(storage);
    expect(load(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });

  test('a storage that throws never throws out', () => {
    const broken = new BrokenStorage();
    expect(load(broken)).toBeNull();
    expect(save(record(), broken)).toBe(false);
    expect(() => clear(broken)).not.toThrow();
    expect(save(record(), null)).toBe(false);
  });
});
