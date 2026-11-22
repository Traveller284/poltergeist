/**
 * last-words.ts — capture the shrunk counterexample at the first bad commit.
 *
 * Creates a throwaway worktree at `sha`, installs dependencies once, runs the
 * property, extracts the counterexample from the failure message, and cleans up.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { addWorktree, removeWorktree } from '../bisect/git.js';
import { installDependencies, runProperty } from '../bisect/runner.js';

/**
 * Runs `propertyId` at commit `sha` in a throwaway worktree and returns the
 * shrunk counterexample string.
 *
 * Returns "" when:
 * - the property passes (should not happen when called on the first bad commit,
 *   but handled defensively), or
 * - the run produced no failure message.
 *
 * Always cleans up the worktree, even on error.
 */
export async function captureLastWords(
  repoPath: string,
  sha: string,
  propertyId: string,
  seed: number,
): Promise<string> {
  const worktreePath = join(tmpdir(), `poltergeist-lw-${randomUUID()}`);
  addWorktree(repoPath, worktreePath, sha);

  try {
    installDependencies(worktreePath);
    const result = runProperty(worktreePath, propertyId, seed);

    if (result.status === 'failed') {
      return result.counterexample;
    }
    return '';
  } finally {
    removeWorktree(repoPath, worktreePath);
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
