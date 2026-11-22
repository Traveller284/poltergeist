/**
 * store.test.ts
 *
 * Unit and property-based tests for loadStore, saveStore, and mergeHauntings.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadStore, saveStore, mergeHauntings, type ScanEntry, type PassingEntry } from '../store.js';
import { makeHaunting, banish, type Haunting } from '../haunting.js';

const NUM_RUNS = 200;

// ── temp directory helper ─────────────────────────────────────────────────────

let tempDir = '';

function freshTempDir(): string {
  tempDir = join(tmpdir(), `poltergeist-store-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
});

// ── REQ-HS-03: saveStore / loadStore round-trip ───────────────────────────────

describe('saveStore / loadStore (REQ-HS-03)', () => {
  it('[REQ-HS-03] loadStore returns [] when file does not exist', () => {
    const dir = freshTempDir();
    expect(loadStore(join(dir, 'nonexistent.json'))).toEqual([]);
  });

  it('[REQ-HS-03] saveStore writes and loadStore reads back the same hauntings', () => {
    const dir = freshTempDir();
    const outPath = join(dir, 'hauntings.json');
    const h = makeHaunting('test-spec', 'prop-foo', {
      sha: 'a'.repeat(40), author: 'Alice', email: 'a@a.com',
      date: '2024-01-01T00:00:00.000Z', message: 'break it',
    }, 'some counterexample', '2024-01-02T00:00:00.000Z');

    saveStore(outPath, [h]);
    const loaded = loadStore(outPath);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(h);
  });

  it('[REQ-HS-03] saveStore is atomic — no .tmp file left behind', () => {
    const dir = freshTempDir();
    const outPath = join(dir, 'hauntings.json');
    saveStore(outPath, []);
    expect(existsSync(outPath + '.tmp')).toBe(false);
    expect(existsSync(outPath)).toBe(true);
  });

  it('[REQ-HS-03] saveStore creates parent directories', () => {
    const dir = freshTempDir();
    const outPath = join(dir, 'nested', 'deep', 'hauntings.json');
    saveStore(outPath, []);
    expect(existsSync(outPath)).toBe(true);
  });

  it('[REQ-HS-03] loadStore throws on malformed JSON', () => {
    const dir = freshTempDir();
    const outPath = join(dir, 'bad.json');
    writeFileSync(outPath, 'not json', 'utf8');
    expect(() => loadStore(outPath)).toThrow();
  });
});

// ── REQ-HS-06: mergeHauntings banishes resolved entries ──────────────────────

describe('mergeHauntings banishing (REQ-HS-06)', () => {
  it('[REQ-HS-06] banishes a haunting when its property appears in nowPassing', () => {
    const h = makeHaunting('s', 'prop-foo', {
      sha: 'a'.repeat(40), author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm',
    }, '', '2024-01-01T00:00:00Z');

    const result = mergeHauntings([h], [], [{ spec: 's', propertyId: 'prop-foo' }], '2024-02-01T00:00:00Z');

    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('banished');
    expect(result[0]!.banishedAt).toBe('2024-02-01T00:00:00Z');
    expect(result[0]!.id).toBe(h.id);
  });

  it('[REQ-HS-06] does not banish hauntings from other specs', () => {
    const h = makeHaunting('spec-A', 'prop-foo', {
      sha: 'a'.repeat(40), author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm',
    }, '', '2024-01-01T00:00:00Z');

    const result = mergeHauntings([h], [], [{ spec: 'spec-B', propertyId: 'prop-foo' }]);

    expect(result[0]!.status).toBe('haunting');
  });
});

// ── REQ-HS-07: mergeHauntings updates lastWords in-place ─────────────────────

describe('mergeHauntings in-place update (REQ-HS-07)', () => {
  it('[REQ-HS-07] updates lastWords without changing id or detectedAt', () => {
    const sha = 'b'.repeat(40);
    const h = makeHaunting('s', 'prop-bar', {
      sha, author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm',
    }, 'old counterexample', '2024-01-01T00:00:00Z');

    const entry: ScanEntry = {
      spec: 's', propertyId: 'prop-bar',
      firstBadCommit: { sha, author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm' },
      lastWords: 'new counterexample',
    };

    const result = mergeHauntings([h], [entry], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(h.id);
    expect(result[0]!.detectedAt).toBe(h.detectedAt);
    expect(result[0]!.lastWords).toBe('new counterexample');
  });

  it('[REQ-HS-07] appends a new haunting when sha differs', () => {
    const sha1 = 'c'.repeat(40);
    const sha2 = 'd'.repeat(40);
    const h = makeHaunting('s', 'prop-bar', {
      sha: sha1, author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm',
    }, '', '2024-01-01T00:00:00Z');

    const entry: ScanEntry = {
      spec: 's', propertyId: 'prop-bar',
      firstBadCommit: { sha: sha2, author: 'A', email: 'a@a', date: '2024-01-01T00:00:00Z', message: 'm' },
      lastWords: 'new words',
    };

    const result = mergeHauntings([h], [entry], []);

    // Both hauntings are retained.
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain(h.id);
  });
});

// ── REQ-HS-04: no duplicate IDs (property-based) ─────────────────────────────

describe('mergeHauntings no-duplicate IDs (REQ-HS-04)', () => {
  it('[REQ-HS-04] repeated merges with the same entries never produce duplicate ids', () => {
    // Build a small arbitrary ScanEntry
    const entryArb = fc.record({
      spec: fc.constantFrom('spec-a', 'spec-b'),
      propertyId: fc.constantFrom('prop-1', 'prop-2', 'prop-3'),
      firstBadCommit: fc.record({
        sha: fc.hexaString({ minLength: 40, maxLength: 40 }).map((s) => s.toLowerCase()),
        author: fc.string({ minLength: 1, maxLength: 20 }),
        email: fc.string({ minLength: 1, maxLength: 20 }),
        date: fc.constant('2024-01-01T00:00:00Z'),
        message: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      lastWords: fc.string({ maxLength: 50 }),
    });

    fc.assert(
      fc.property(
        fc.array(entryArb, { minLength: 0, maxLength: 6 }),
        fc.array(entryArb, { minLength: 0, maxLength: 6 }),
        (entries1, entries2) => {
          const merged1 = mergeHauntings([], entries1, []);
          const merged2 = mergeHauntings(merged1, entries2, []);
          const ids = merged2.map((h) => h.id);
          return ids.length === new Set(ids).size;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
