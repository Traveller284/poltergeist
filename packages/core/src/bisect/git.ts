/**
 * git.ts — thin wrapper around the git binary.
 *
 * Every function takes `cwd` as its first argument and shells out to `git`
 * using an explicit argument array.  No user-supplied values are ever
 * interpolated into shell strings.
 */

import { execFileSync } from 'node:child_process';

export interface CommitInfo {
  sha: string;     // full 40-char SHA
  author: string;  // author name
  email: string;   // author email
  date: string;    // ISO 8601 author date
  message: string; // full commit message body
}

// ── internal helper ───────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Resolves any git ref (SHA, branch, tag, HEAD, etc.) to a full 40-char SHA.
 */
export function resolveRef(cwd: string, ref: string): string {
  return git(cwd, ['rev-parse', '--verify', ref]).trim();
}

/**
 * Returns the first-parent commits strictly between `good` (exclusive) and
 * `bad` (inclusive), oldest first.
 *
 * Both `good` and `bad` must be full SHAs.
 */
export function commitsBetween(cwd: string, good: string, bad: string): string[] {
  const out = git(cwd, ['log', '--first-parent', '--format=%H', `${good}..${bad}`]);
  const shas = out.trim().split('\n').filter(Boolean);
  // git log returns newest-first; reverse to get oldest-first.
  return shas.reverse();
}

/**
 * Creates a git worktree at `worktreePath` checked out at `commit`.
 * Equivalent to: git worktree add --detach <worktreePath> <commit>
 */
export function addWorktree(cwd: string, worktreePath: string, commit: string): void {
  git(cwd, ['worktree', 'add', '--detach', worktreePath, commit]);
}

/**
 * Removes the worktree at `worktreePath` and unregisters it from the repo.
 * Uses --force to handle detached HEAD states.
 */
export function removeWorktree(cwd: string, worktreePath: string): void {
  try {
    git(cwd, ['worktree', 'remove', '--force', worktreePath]);
  } catch {
    // If the worktree directory is already gone, git may error; ignore.
  }
}

/**
 * Returns metadata for `sha`.
 */
export function getCommitInfo(cwd: string, sha: string): CommitInfo {
  // Use ASCII record separator (0x1E) to split fields safely.
  // %x1E is git's format escape for the byte 0x1E.
  const SEP = '\x1e';
  const fmt = '%H%x1E%an%x1E%ae%x1E%aI%x1E%B';
  const out = git(cwd, ['log', '-1', `--format=${fmt}`, sha]);
  const parts = out.split(SEP);
  if (parts.length < 5) {
    throw new Error(`Unexpected git log output for ${sha}: ${JSON.stringify(out)}`);
  }
  const [resolvedSha, author, email, date, ...messageParts] = parts as [string, string, string, string, ...string[]];
  return {
    sha: resolvedSha.trim(),
    author: author.trim(),
    email: email.trim(),
    date: date.trim(),
    message: messageParts.join(SEP).trim(),
  };
}

/**
 * Returns the full SHA of the first parent of `sha`.
 * For merge commits, this is the mainline parent.
 */
export function firstParent(cwd: string, sha: string): string {
  return git(cwd, ['rev-parse', '--verify', `${sha}^1`]).trim();
}

/**
 * Checks out `sha` inside a worktree (detached).
 * Use this to switch commits within an existing worktree.
 */
export function checkoutDetached(cwd: string, sha: string): void {
  git(cwd, ['checkout', '--detach', sha]);
}
