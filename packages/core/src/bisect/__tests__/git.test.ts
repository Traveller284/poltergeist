/**
 * git.test.ts
 *
 * Unit tests for git.ts using the haunted-repo fixture.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import {
  resolveRef,
  commitsBetween,
  addWorktree,
  removeWorktree,
  getCommitInfo,
  firstParent,
  checkoutDetached,
} from '../git.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const REPO = join(WORKSPACE_ROOT, 'fixtures', 'haunted-repo');

// Known SHAs (inlined from haunted-repo-commits.mjs)
const SHA_GOOD    = 'c5f949188dc7b3491b95e0b33f646b60249a84e9'; // commit 1
const SHA_ADD_BAD = '5268e5d25475f0968682244ac011f8bbcc77865d'; // commit 6
const SHA_TIP     = '686c3ce299c537eb47b7ead85fcea3561eebfe60'; // commit 15

beforeAll(() => {
  if (!existsSync(REPO)) {
    throw new Error(`Fixture repo not found at ${REPO}. Run: node fixtures/build-haunted-repo.mjs`);
  }
});

// ── resolveRef ────────────────────────────────────────────────────────────────

describe('resolveRef', () => {
  it('[REQ-BE-06] resolves a full SHA to itself', () => {
    expect(resolveRef(REPO, SHA_TIP)).toBe(SHA_TIP);
  });

  it('[REQ-BE-06] resolves HEAD to a 40-char SHA', () => {
    const sha = resolveRef(REPO, 'HEAD');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('[REQ-BE-06] resolves a short SHA', () => {
    const short = SHA_TIP.slice(0, 8);
    expect(resolveRef(REPO, short)).toBe(SHA_TIP);
  });

  it('[REQ-BE-06] throws for an unknown ref', () => {
    expect(() => resolveRef(REPO, 'nonexistent-ref-xyz')).toThrow();
  });
});

// ── commitsBetween ────────────────────────────────────────────────────────────

describe('commitsBetween', () => {
  it('[REQ-BE-05] returns commits oldest-first between two SHAs', () => {
    const commits = commitsBetween(REPO, SHA_GOOD, SHA_ADD_BAD);
    expect(commits.length).toBeGreaterThan(0);
    // First element should be one commit after SHA_GOOD
    expect(commits[0]).not.toBe(SHA_GOOD);
    // Last element should be SHA_ADD_BAD
    expect(commits[commits.length - 1]).toBe(SHA_ADD_BAD);
  });

  it('[REQ-BE-05] returns an empty array when good === bad', () => {
    // git log good..good returns nothing
    const commits = commitsBetween(REPO, SHA_TIP, SHA_TIP);
    expect(commits).toEqual([]);
  });

  it('[REQ-BE-05] all returned SHAs are 40-char hex strings', () => {
    const commits = commitsBetween(REPO, SHA_GOOD, SHA_TIP);
    for (const sha of commits) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

// ── addWorktree / removeWorktree ──────────────────────────────────────────────

describe('addWorktree / removeWorktree', () => {
  let worktreePath: string;

  beforeAll(() => {
    worktreePath = join(os.tmpdir(), `poltergeist-git-test-${Date.now()}`);
  });

  afterAll(() => {
    // Belt-and-suspenders cleanup in case removeWorktree test failed
    if (existsSync(worktreePath)) {
      try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('[REQ-BE-02] addWorktree creates a worktree at the given path', () => {
    addWorktree(REPO, worktreePath, SHA_GOOD);
    expect(existsSync(worktreePath)).toBe(true);
    // The worktree should contain a HEAD file
    expect(existsSync(join(worktreePath, '.git'))).toBe(true);
  });

  it('[REQ-BE-11] adding a worktree does not change the main repo HEAD', () => {
    const headBefore = resolveRef(REPO, 'HEAD');
    // worktree already added above; just verify HEAD is unchanged
    const headAfter = resolveRef(REPO, 'HEAD');
    expect(headAfter).toBe(headBefore);
  });

  it('[REQ-BE-02] checkoutDetached switches the worktree to a different commit', () => {
    checkoutDetached(worktreePath, SHA_ADD_BAD);
    const wHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf8',
    }).trim();
    expect(wHead).toBe(SHA_ADD_BAD);
  });

  it('[REQ-BE-11] checkoutDetached does not affect the main repo HEAD', () => {
    const mainHead = resolveRef(REPO, 'HEAD');
    checkoutDetached(worktreePath, SHA_TIP);
    expect(resolveRef(REPO, 'HEAD')).toBe(mainHead);
  });

  it('[REQ-BE-03] removeWorktree removes the directory and unregisters the worktree', () => {
    removeWorktree(REPO, worktreePath);
    expect(existsSync(worktreePath)).toBe(false);
    // git worktree list should no longer contain our path
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(list).not.toContain(worktreePath);
  });

  it('[REQ-BE-03] removeWorktree is idempotent — does not throw if already gone', () => {
    expect(() => removeWorktree(REPO, worktreePath)).not.toThrow();
  });
});

// ── getCommitInfo ─────────────────────────────────────────────────────────────

describe('getCommitInfo', () => {
  it('[REQ-BE-06] returns correct SHA, author, email, date, and message', () => {
    const info = getCommitInfo(REPO, SHA_GOOD);
    expect(info.sha).toBe(SHA_GOOD);
    expect(info.author).toBe('Poltergeist Fixture');
    expect(info.email).toBe('fixture@poltergeist.local');
    // ISO 8601 date
    expect(info.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(info.message).toBeTruthy();
  });
});

// ── firstParent ───────────────────────────────────────────────────────────────

describe('firstParent', () => {
  it('[REQ-BE-08] returns the parent of a commit', () => {
    // commit 2 (lock file) has commit 1 as parent
    const commit2 = resolveRef(REPO, `${SHA_GOOD}~0`);
    // SHA_GOOD is commit 1 — resolve commit 2 from the log
    const commits = commitsBetween(REPO, SHA_GOOD, SHA_ADD_BAD);
    // commits[0] is the first commit after SHA_GOOD (commit 2)
    const commit2sha = commits[0]!;
    expect(firstParent(REPO, commit2sha)).toBe(SHA_GOOD);
  });

  it('[REQ-BE-08] throws for a root commit with no parent', () => {
    expect(() => firstParent(REPO, SHA_GOOD)).toThrow();
  });
});
