/**
 * bisect.property.test.ts
 *
 * Integration tests for bisect() against the haunted-repo fixture.
 * Each test name includes the REQ-BE-xx IDs it covers.
 *
 * Property-based tests for the pure binary-search kernel live in
 * findFirstFailing.property.test.ts.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  bisect,
  BISECT_SEED,
  PropertyNotFoundError,
  InvalidRangeError,
  GoodCommitFailsError,
  BadCommitPassesError,
} from '../index.js';
import { runProperty, installDependencies } from '../runner.js';
import { addWorktree, removeWorktree, firstParent } from '../git.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const REPO = join(WORKSPACE_ROOT, 'fixtures', 'haunted-repo');

// ── inlined fixture constants (Vite cannot import outside the project root) ───
const SHA_GOOD       = 'c5f949188dc7b3491b95e0b33f646b60249a84e9'; // commit 1
const SHA_ADD_BAD    = '5268e5d25475f0968682244ac011f8bbcc77865d'; // commit 6
const SHA_DOUBLE_BAD = 'dfde0232f2b9de5cf2c63d51f6c9f23ebe30182a'; // commit 9
const SHA_ABS_BAD    = '1214aeb31aef7ae8f1a58a1d53dec9ac209aba4d'; // commit 12
const SHA_TIP        = '686c3ce299c537eb47b7ead85fcea3561eebfe60'; // commit 15

// ── helpers ───────────────────────────────────────────────────────────────────

/** Snapshot of everything git tracks in a repo that must not change. */
interface RepoSnapshot {
  head: string;
  diffIndex: string;
  files: Record<string, string>; // relative path → objectname (blob SHA)
}

function snapshotRepo(repoPath: string): RepoSnapshot {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8' }).trim();
  let diffIndex = '';
  try {
    diffIndex = execFileSync('git', ['diff-index', 'HEAD'], { cwd: repoPath, encoding: 'utf8' }).trim();
  } catch {
    diffIndex = '<error>';
  }
  // git ls-files -s format: "<mode> <objectname> <stage>\t<path>"
  // -s and --format are mutually exclusive in git 2.54.
  const lsFiles = execFileSync('git', ['ls-files', '-s'], { cwd: repoPath, encoding: 'utf8' });
  const files: Record<string, string> = {};
  for (const line of lsFiles.trim().split('\n').filter(Boolean)) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const meta = line.slice(0, tab).trim().split(/\s+/);
    files[line.slice(tab + 1)] = meta[1] ?? '';
  }
  return { head, diffIndex, files };
}

// Three regressions we can test against
const REGRESSIONS = [
  { propertyId: 'prop-add-commutative', expectedFirstBad: SHA_ADD_BAD },
  { propertyId: 'prop-double-is-even',  expectedFirstBad: SHA_DOUBLE_BAD },
  { propertyId: 'prop-abs-nonneg',      expectedFirstBad: SHA_ABS_BAD },
] as const;

// ── REQ-BE-01: inputs accepted correctly ─────────────────────────────────────

describe('bisect input acceptance', () => {
  it('[REQ-BE-01] accepts repoPath, propertyId, goodCommit, badCommit and returns a result', async () => {
    const result = await bisect({
      repoPath: REPO,
      propertyId: 'prop-add-commutative',
      goodCommit: SHA_GOOD,
      badCommit: SHA_TIP,
    });
    expect(result).toHaveProperty('firstBadCommit');
    expect(result.firstBadCommit).toHaveProperty('sha');
    expect(result.firstBadCommit).toHaveProperty('author');
    expect(result.firstBadCommit).toHaveProperty('email');
    expect(result.firstBadCommit).toHaveProperty('date');
    expect(result.firstBadCommit).toHaveProperty('message');
  }, 120_000);
});

// ── REQ-BE-06: output shape ───────────────────────────────────────────────────

describe('bisect output shape', () => {
  it('[REQ-BE-06] firstBadCommit.sha is a full 40-char hex SHA', async () => {
    const result = await bisect({
      repoPath: REPO,
      propertyId: 'prop-add-commutative',
      goodCommit: SHA_GOOD,
      badCommit: SHA_TIP,
    });
    expect(result.firstBadCommit.sha).toMatch(/^[0-9a-f]{40}$/);
  }, 120_000);

  it('[REQ-BE-06] firstBadCommit.date is ISO 8601', async () => {
    const result = await bisect({
      repoPath: REPO,
      propertyId: 'prop-add-commutative',
      goodCommit: SHA_GOOD,
      badCommit: SHA_TIP,
    });
    expect(result.firstBadCommit.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  }, 120_000);
});

// ── REQ-BE-07 + REQ-BE-08: returned commit fails and its parent passes ────────
//
// We verify that the commit bisect() returns actually fails the property, and
// its first parent passes, by running the property in a fresh throwaway
// worktree.  We never modify the fixture repo's working tree.

describe('bisect correctness', () => {
  for (const { propertyId, expectedFirstBad } of REGRESSIONS) {
    it(
      `[REQ-BE-07, REQ-BE-08] returned commit fails and its parent passes — ${propertyId}`,
      async () => {
        const result = await bisect({
          repoPath: REPO,
          propertyId,
          goodCommit: SHA_GOOD,
          badCommit: SHA_TIP,
          seed: BISECT_SEED,
        });

        const foundSha = result.firstBadCommit.sha;
        expect(foundSha).toBe(expectedFirstBad);

        // Spin up a throwaway worktree to run the property without touching
        // the fixture repo's working tree.
        const wtPath = join(os.tmpdir(), `poltergeist-verify-${randomUUID()}`);
        addWorktree(REPO, wtPath, foundSha);
        try {
          installDependencies(wtPath);

          // REQ-BE-07: the returned commit must fail.
          const failResult = runProperty(wtPath, propertyId, BISECT_SEED);
          expect(failResult.status).toBe('failed');

          // REQ-BE-08: the parent must pass.
          const parentSha = firstParent(REPO, foundSha);
          execFileSync('git', ['checkout', '--detach', parentSha], { cwd: wtPath, stdio: 'pipe' });
          const passResult = runProperty(wtPath, propertyId, BISECT_SEED);
          expect(passResult.status).toBe('passed');
        } finally {
          removeWorktree(REPO, wtPath);
        }
      },
      300_000,
    );
  }
});

// ── REQ-BE-09: determinism ────────────────────────────────────────────────────

describe('bisect determinism', () => {
  it('[REQ-BE-09] two calls with identical inputs return the same SHA', async () => {
    const input = {
      repoPath: REPO,
      propertyId: 'prop-double-is-even',
      goodCommit: SHA_GOOD,
      badCommit: SHA_TIP,
      seed: BISECT_SEED,
    };
    const [r1, r2] = await Promise.all([bisect(input), bisect(input)]);
    expect(r1.firstBadCommit.sha).toBe(r2.firstBadCommit.sha);
  }, 300_000);
});

// ── REQ-BE-11: target repo working tree is never modified ─────────────────────

describe('bisect repo isolation', () => {
  it('[REQ-BE-11] target repo HEAD, index, and tracked files are unchanged after bisect', async () => {
    const before = snapshotRepo(REPO);

    await bisect({
      repoPath: REPO,
      propertyId: 'prop-abs-nonneg',
      goodCommit: SHA_GOOD,
      badCommit: SHA_TIP,
      seed: BISECT_SEED,
    });

    const after = snapshotRepo(REPO);

    expect(after.head).toBe(before.head);
    expect(after.diffIndex).toBe(before.diffIndex);
    expect(after.files).toEqual(before.files);
  }, 300_000);
});

// ── REQ-BE-12: PropertyNotFoundError when propertyId matches nothing ──────────

describe('bisect error: PropertyNotFoundError', () => {
  it('[REQ-BE-12] throws PropertyNotFoundError when propertyId matches no test', async () => {
    await expect(
      bisect({
        repoPath: REPO,
        propertyId: 'nonexistent-property-zzz',
        goodCommit: SHA_GOOD,
        badCommit: SHA_TIP,
      }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  }, 120_000);

  it('[REQ-BE-12] no worktree artifacts remain after PropertyNotFoundError', async () => {
    const before = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO, encoding: 'utf8',
    });
    const countBefore = (before.match(/^worktree /gm) ?? []).length;

    await expect(
      bisect({ repoPath: REPO, propertyId: 'nonexistent-property-zzz', goodCommit: SHA_GOOD, badCommit: SHA_TIP }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);

    const after = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO, encoding: 'utf8',
    });
    const countAfter = (after.match(/^worktree /gm) ?? []).length;
    expect(countAfter).toBe(countBefore);
  }, 120_000);
});

// ── REQ-BE-13: InvalidRangeError when good === bad ────────────────────────────

describe('bisect error: InvalidRangeError', () => {
  it('[REQ-BE-13] throws InvalidRangeError when goodCommit === badCommit', async () => {
    await expect(
      bisect({
        repoPath: REPO,
        propertyId: 'prop-add-commutative',
        goodCommit: SHA_TIP,
        badCommit: SHA_TIP,
      }),
    ).rejects.toBeInstanceOf(InvalidRangeError);
  });
});

// ── REQ-BE-14: GoodCommitFailsError when property already fails at goodCommit ─

describe('bisect error: GoodCommitFailsError', () => {
  it('[REQ-BE-14] throws GoodCommitFailsError when property fails at goodCommit', async () => {
    await expect(
      bisect({
        repoPath: REPO,
        propertyId: 'prop-add-commutative',
        goodCommit: SHA_ADD_BAD,
        badCommit: SHA_TIP,
        seed: BISECT_SEED,
      }),
    ).rejects.toBeInstanceOf(GoodCommitFailsError);
  }, 120_000);
});

// ── REQ-BE-15: BadCommitPassesError when property still passes at badCommit ───

describe('bisect error: BadCommitPassesError', () => {
  it('[REQ-BE-15] throws BadCommitPassesError when property passes at badCommit', async () => {
    // Use a commit between SHA_GOOD and SHA_ADD_BAD as badCommit.
    // Every commit in that range passes prop-add-commutative.
    const commits = execFileSync(
      'git', ['log', '--format=%H', `${SHA_GOOD}..${SHA_ADD_BAD}`],
      { cwd: REPO, encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean);
    // Oldest commit in the range (last in git log newest-first output) is commit 2.
    const commit2sha = commits[commits.length - 1]!;

    await expect(
      bisect({
        repoPath: REPO,
        propertyId: 'prop-add-commutative',
        goodCommit: SHA_GOOD,
        badCommit: commit2sha,
        seed: BISECT_SEED,
      }),
    ).rejects.toBeInstanceOf(BadCommitPassesError);
  }, 120_000);
});

// ── Safety net: ensure fixture repo HEAD is on main after all tests ───────────

afterAll(() => {
  try {
    execFileSync('git', ['checkout', 'main', '--'], { cwd: REPO, stdio: 'pipe' });
  } catch {
    // Ignore: the fixture may already be on main, or detached HEAD is acceptable.
  }
});
