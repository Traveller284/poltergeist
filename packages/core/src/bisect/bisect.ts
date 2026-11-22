/**
 * bisect.ts — binary search driver.
 *
 * Finds the first commit at which a fast-check property fails by binary-
 * searching the first-parent history between goodCommit and badCommit.
 *
 * All test runs happen inside a temporary git worktree so the target repo's
 * working tree, index, and branches are never touched.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  resolveRef,
  commitsBetween,
  addWorktree,
  removeWorktree,
  getCommitInfo,
  checkoutDetached,
  type CommitInfo,
} from './git.js';
import { installDependencies, runProperty } from './runner.js';
import {
  PropertyNotFoundError,
  InvalidRangeError,
  GoodCommitFailsError,
  BadCommitPassesError,
} from './errors.js';

export { type CommitInfo };

// ── public types ──────────────────────────────────────────────────────────────

export interface BisectInput {
  repoPath: string;    // absolute path to the target git repo
  propertyId: string;  // Vitest --testNamePattern selecting one property
  goodCommit: string;  // ref where the property passes
  badCommit: string;   // ref where the property fails (descendant of goodCommit)
  seed?: number;       // override BISECT_SEED (default: 20241031); for testing only
}

export interface BisectResult {
  firstBadCommit: CommitInfo;
}

export const BISECT_SEED = 20241031;

// ── pure binary-search kernel ─────────────────────────────────────────────────

/**
 * Result returned by findFirstFailing.
 */
export interface FindFirstFailingResult {
  /** Index into `commits` of the first failing entry. */
  index: number;
  /** Number of times `isFailing` was called. */
  evaluations: number;
}

/**
 * Pure binary-search over `commits` to find the first index at which
 * `isFailing` returns true.
 *
 * Precondition (monotonicity, REQ-BE-10): isFailing(i) === false for all i < k
 * and isFailing(i) === true for all i >= k, for some k in [0, commits.length).
 * The caller is responsible for verifying that isFailing(0) is false and
 * isFailing(commits.length - 1) is true before calling this function.
 *
 * Returns the index of the first failing commit and the number of evaluations
 * performed.  With n commits the loop runs at most ceil(log2(n)) iterations.
 *
 * @param commits   Ordered array of commit identifiers (oldest-first).
 * @param isFailing Predicate: returns true when the property fails at that commit.
 */
export function findFirstFailing<T>(
  commits: readonly T[],
  isFailing: (commit: T) => boolean,
): FindFirstFailingResult {
  let lo = 0;
  let hi = commits.length - 1;
  let evaluations = 0;

  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    evaluations += 1;
    if (isFailing(commits[mid]!)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return { index: lo, evaluations };
}

// ── implementation ────────────────────────────────────────────────────────────

/**
 * Finds the first commit at which `propertyId` fails, given a known-good and
 * known-bad commit in `repoPath`.  Uses a temporary git worktree and a fixed
 * fast-check seed so results are deterministic.
 */
export async function bisect(input: BisectInput): Promise<BisectResult> {
  const { repoPath, propertyId } = input;
  const seed = input.seed ?? BISECT_SEED;

  // ── 1. Resolve refs to full SHAs ──────────────────────────────────────────
  const goodSha = resolveRef(repoPath, input.goodCommit);
  const badSha  = resolveRef(repoPath, input.badCommit);

  // ── 2. Guard: same SHA → empty range ──────────────────────────────────────
  if (goodSha === badSha) {
    throw new InvalidRangeError(goodSha);
  }

  // ── 3. Create temporary worktree ──────────────────────────────────────────
  const worktreePath = join(tmpdir(), `poltergeist-${randomUUID()}`);
  addWorktree(repoPath, worktreePath, badSha);

  try {
    // ── 4. Install dependencies once ────────────────────────────────────────
    installDependencies(worktreePath);

    // ── 5. Verify boundaries ────────────────────────────────────────────────

    // Check goodCommit
    checkoutDetached(worktreePath, goodSha);
    const goodResult = runProperty(worktreePath, propertyId, seed);
    if (goodResult.status === 'not-found') {
      throw new PropertyNotFoundError(propertyId, goodSha);
    }
    if (goodResult.status === 'failed') {
      throw new GoodCommitFailsError(goodSha);
    }

    // Check badCommit
    checkoutDetached(worktreePath, badSha);
    const badResult = runProperty(worktreePath, propertyId, seed);
    if (badResult.status === 'not-found') {
      throw new PropertyNotFoundError(propertyId, badSha);
    }
    if (badResult.status === 'passed') {
      throw new BadCommitPassesError(badSha);
    }

    // ── 6. Collect commit list (oldest-first, excluding goodSha) ────────────
    const commits = commitsBetween(repoPath, goodSha, badSha);
    // commits[0] is the first commit after goodSha; commits[last] is badSha.
    // The range is non-empty because goodSha !== badSha.

    // ── 7. Binary search via findFirstFailing ────────────────────────────────
    // The predicate wraps runProperty.  A not-found result is promoted to an
    // exception so the finally block can clean up the worktree.
    let notFoundAt: string | undefined;

    const { index } = findFirstFailing(commits, (sha) => {
      checkoutDetached(worktreePath, sha);
      const result = runProperty(worktreePath, propertyId, seed);
      if (result.status === 'not-found') {
        notFoundAt = sha;
        // Return true so the loop terminates immediately (lo === hi = mid).
        return true;
      }
      return result.status === 'failed';
    });

    if (notFoundAt !== undefined) {
      throw new PropertyNotFoundError(propertyId, notFoundAt);
    }

    // ── 8. index points to the first bad commit ───────────────────────────────
    const firstBadSha = commits[index]!;

    // ── 9. Fetch metadata ────────────────────────────────────────────────────
    const firstBadCommit = getCommitInfo(repoPath, firstBadSha);

    return { firstBadCommit };
  } finally {
    // ── 10. Unconditional worktree cleanup ───────────────────────────────────
    removeWorktree(repoPath, worktreePath);
    // Belt-and-suspenders: also remove the directory itself in case git
    // worktree remove did not fully clean up (e.g. on Windows with locked files).
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore — the worktree directory may already be gone
    }
  }
}
