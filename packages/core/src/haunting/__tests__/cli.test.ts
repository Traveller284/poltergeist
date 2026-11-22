/**
 * cli.test.ts
 *
 * Integration tests for `poltergeist scan` using the haunted-repo fixture.
 * Invokes the compiled CLI as `node dist/cli/scan.js` — no shell, Windows-safe.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadStore } from '../store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT    = join(__dirname, '..', '..', '..', '..', '..');
const REPO              = join(WORKSPACE_ROOT, 'fixtures', 'haunted-repo');
const CONFIG            = join(WORKSPACE_ROOT, 'fixtures', 'poltergeist.config.json');
const DIST_CLI          = join(__dirname, '..', '..', '..', 'dist', 'cli', 'scan.js');

// Known fixture values (inlined — Vite cannot import outside root)
const SHA_ADD_BAD    = '5268e5d25475f0968682244ac011f8bbcc77865d';
const SHA_DOUBLE_BAD = 'dfde0232f2b9de5cf2c63d51f6c9f23ebe30182a';
const SHA_ABS_BAD    = '1214aeb31aef7ae8f1a58a1d53dec9ac209aba4d';
const SHA_GOOD       = 'c5f949188dc7b3491b95e0b33f646b60249a84e9';
const SHA_TIP        = '686c3ce299c537eb47b7ead85fcea3561eebfe60';

let tempDir = '';
let outPath = '';

beforeAll(() => {
  tempDir = join(tmpdir(), `poltergeist-cli-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  outPath = join(tempDir, 'hauntings.json');

  // Ensure the CLI is compiled before running tests.
  // If dist/cli/scan.js is missing, compile now.
  if (!existsSync(DIST_CLI)) {
    const build = spawnSync(process.execPath, [
      join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsc'),
    ], { cwd: join(__dirname, '..', '..', '..'), encoding: 'utf8' });
    if (build.status !== 0) {
      throw new Error(`tsc build failed:\n${build.stderr}`);
    }
  }
});

afterAll(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── helper: run the CLI ───────────────────────────────────────────────────────

function runCli(out: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [DIST_CLI, '--repo', REPO, '--good', SHA_GOOD, '--bad', SHA_TIP, '--config', CONFIG, '--out', out],
    { encoding: 'utf8', timeout: 600_000 },
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// ── REQ-HS-09: scan produces correct hauntings ────────────────────────────────

describe('poltergeist scan (REQ-HS-09, REQ-HS-10)', () => {
  it(
    '[REQ-HS-09, REQ-HS-10] CLI exits 0 and writes hauntings.json with 3 hauntings',
    () => {
      const { status, stderr } = runCli(outPath);
      if (status !== 0) console.error('CLI stderr:', stderr);
      expect(status).toBe(0);
      expect(existsSync(outPath)).toBe(true);

      const hauntings = loadStore(outPath);
      expect(hauntings).toHaveLength(3);
      expect(hauntings.every((h) => h.status === 'haunting')).toBe(true);
    },
    900_000,
  );

  it(
    '[REQ-HS-09] each haunting has the correct firstBadCommit SHA',
    () => {
      const hauntings = loadStore(outPath);
      const shas = hauntings.map((h) => h.firstBadCommit.sha);
      expect(shas).toContain(SHA_ADD_BAD);
      expect(shas).toContain(SHA_DOUBLE_BAD);
      expect(shas).toContain(SHA_ABS_BAD);
    },
  );

  it(
    '[REQ-HS-08] each haunting has a non-empty lastWords',
    () => {
      const hauntings = loadStore(outPath);
      for (const h of hauntings) {
        expect(h.lastWords.length, `lastWords empty for ${h.propertyId}`).toBeGreaterThan(0);
      }
    },
  );

  it(
    '[REQ-HS-09] each haunting has a valid detectedAt timestamp',
    () => {
      const hauntings = loadStore(outPath);
      for (const h of hauntings) {
        expect(h.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(h.banishedAt).toBeNull();
      }
    },
  );
});

// ── REQ-HS-06 + REQ-HS-07: second scan is idempotent ─────────────────────────

describe('poltergeist scan idempotency (REQ-HS-06, REQ-HS-07)', () => {
  it(
    '[REQ-HS-06, REQ-HS-07] running scan a second time leaves hauntings unchanged',
    () => {
      const firstRun = loadStore(outPath);
      const { status } = runCli(outPath);
      expect(status).toBe(0);

      const secondRun = loadStore(outPath);
      expect(secondRun).toHaveLength(firstRun.length);

      // ids and detectedAt must be identical (no new hauntings were created).
      const firstIds = firstRun.map((h) => h.id).sort();
      const secondIds = secondRun.map((h) => h.id).sort();
      expect(secondIds).toEqual(firstIds);

      for (const h1 of firstRun) {
        const h2 = secondRun.find((h) => h.id === h1.id)!;
        expect(h2).toBeDefined();
        expect(h2.detectedAt).toBe(h1.detectedAt);
        expect(h2.firstBadCommit.sha).toBe(h1.firstBadCommit.sha);
      }
    },
    900_000,
  );
});
