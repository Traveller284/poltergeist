/**
 * fixture.test.ts
 *
 * Verifies that the haunted-repo fixture satisfies the monotonicity assumption
 * required by the bisect algorithm (REQ-BE-10): once a property fails at a
 * commit it must keep failing for all later commits in the range.
 *
 * These tests run the property directly in the fixture repo's working tree
 * (no worktree involved) using the same invocation strategy as runner.ts:
 * process.execPath + vitest.mjs, with FAST_CHECK_SEED set.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/core/src/bisect/__tests__ → up 5 levels → workspace root
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const FIXTURES = join(WORKSPACE_ROOT, 'fixtures');
const REPO = join(FIXTURES, 'haunted-repo');

// ── fixture constants (inlined from haunted-repo-commits.mjs) ─────────────────
// Inlined here to avoid Vite's outside-root import restriction.

/** SHA where prop-add-commutative first fails (commit 6). */
const SHA_ADD_BAD    = '5268e5d25475f0968682244ac011f8bbcc77865d';
/** SHA where prop-double-is-even first fails (commit 9). */
const SHA_DOUBLE_BAD = 'dfde0232f2b9de5cf2c63d51f6c9f23ebe30182a';
/** SHA where prop-abs-nonneg first fails (commit 12). */
const SHA_ABS_BAD    = '1214aeb31aef7ae8f1a58a1d53dec9ac209aba4d';
/** SHA of the last commit (commit 15, the tip). */
const SHA_TIP        = '686c3ce299c537eb47b7ead85fcea3561eebfe60';

// ── helpers ───────────────────────────────────────────────────────────────────

const SEED = 20241031;

/** Returns the list of commit SHAs from `from` (exclusive) through `to` (inclusive), oldest first. */
function commitRange(from: string, to: string): string[] {
  const out = execFileSync(
    'git',
    ['log', '--first-parent', '--format=%H', `${from}..${to}`],
    { cwd: REPO, encoding: 'utf8' },
  );
  return out.trim().split('\n').filter(Boolean).reverse();
}

/** Checks out `sha` in the REPO working tree and runs the named test.
 *  Returns true if the test failed (property is broken). */
function propertyFailsAt(sha: string, testName: string): boolean {
  // Checkout the commit in the fixture repo (this modifies its working tree,
  // but that is acceptable here because the fixture is not the "target repo"
  // being bisected — it is a test helper).
  execFileSync('git', ['checkout', '--detach', sha], { cwd: REPO, stdio: 'pipe' });

  const vitestBin = join(REPO, 'node_modules', 'vitest', 'vitest.mjs');
  const result = spawnSync(
    process.execPath,
    [vitestBin, 'run', '--reporter=json', '--testNamePattern', testName],
    {
      cwd: REPO,
      env: { ...process.env, FAST_CHECK_SEED: String(SEED) },
      encoding: 'utf8',
    },
  );

  let json: { numFailedTests?: number; numTotalTests?: number } = {};
  try {
    json = JSON.parse(result.stdout ?? '{}');
  } catch {
    // stdout may contain non-JSON preamble; try to find the JSON object
    const match = (result.stdout ?? '').match(/\{[\s\S]*\}/);
    if (match) json = JSON.parse(match[0]);
  }

  return (json.numFailedTests ?? 0) > 0;
}

// ── fixture presence guard ────────────────────────────────────────────────────

beforeAll(() => {
  if (!existsSync(REPO)) {
    throw new Error(
      `Fixture repo not found at ${REPO}. Run: node fixtures/build-haunted-repo.mjs`,
    );
  }
});

// ── monotonicity tests ────────────────────────────────────────────────────────

describe('fixture monotonicity (REQ-BE-10)', () => {
  it(
    '[REQ-BE-10] prop-add-commutative fails at its regression commit and all later commits',
    () => {
      const commits = [SHA_ADD_BAD, ...commitRange(SHA_ADD_BAD, SHA_TIP)];
      for (const sha of commits) {
        expect(
          propertyFailsAt(sha, 'prop-add-commutative'),
          `expected prop-add-commutative to fail at ${sha}`,
        ).toBe(true);
      }
    },
  );

  it(
    '[REQ-BE-10] prop-double-is-even fails at its regression commit and all later commits',
    () => {
      const commits = [SHA_DOUBLE_BAD, ...commitRange(SHA_DOUBLE_BAD, SHA_TIP)];
      for (const sha of commits) {
        expect(
          propertyFailsAt(sha, 'prop-double-is-even'),
          `expected prop-double-is-even to fail at ${sha}`,
        ).toBe(true);
      }
    },
  );

  it(
    '[REQ-BE-10] prop-abs-nonneg fails at its regression commit and all later commits',
    () => {
      const commits = [SHA_ABS_BAD, ...commitRange(SHA_ABS_BAD, SHA_TIP)];
      for (const sha of commits) {
        expect(
          propertyFailsAt(sha, 'prop-abs-nonneg'),
          `expected prop-abs-nonneg to fail at ${sha}`,
        ).toBe(true);
      }
    },
  );
});
