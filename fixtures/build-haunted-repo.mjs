#!/usr/bin/env node
/**
 * build-haunted-repo.mjs
 *
 * Builds fixtures/haunted-repo — a small TypeScript + fast-check repo with 15
 * commits and three planted regressions.  Every commit uses fixed author
 * identity and date so SHAs are reproducible across machines.
 *
 * PLANTED REGRESSIONS (confirmed after first run; kept constant):
 *
 *   prop-add-commutative   — broken at commit 6
 *                            SHA: 5268e5d25475f0968682244ac011f8bbcc77865d
 *                            add(a,b) starts returning a-b instead of a+b
 *                            remains broken for commits 6-15
 *
 *   prop-double-is-even    — broken at commit 9
 *                            SHA: dfde0232f2b9de5cf2c63d51f6c9f23ebe30182a
 *                            double(n) starts returning n*2+1 (always odd)
 *                            remains broken for commits 9-15
 *
 *   prop-abs-nonneg        — broken at commit 12
 *                            SHA: 1214aeb31aef7ae8f1a58a1d53dec9ac209aba4d
 *                            abs(n) starts returning n (no Math.abs)
 *                            remains broken for commits 12-15
 *
 * Run:  node fixtures/build-haunted-repo.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, 'haunted-repo');

// ── helpers ──────────────────────────────────────────────────────────────────

function git(...args) {
  execFileSync('git', args, {
    cwd: REPO,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Poltergeist Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@poltergeist.local',
      GIT_COMMITTER_NAME: 'Poltergeist Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@poltergeist.local',
    },
    stdio: 'pipe',
  });
}

function gitWithDate(isoDate, ...args) {
  execFileSync('git', args, {
    cwd: REPO,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Poltergeist Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@poltergeist.local',
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_NAME: 'Poltergeist Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@poltergeist.local',
      GIT_COMMITTER_DATE: isoDate,
    },
    stdio: 'pipe',
  });
}

function write(relPath, content) {
  const full = join(REPO, relPath);
  writeFileSync(full, content, 'utf8');
}

function commit(n, message) {
  // Fixed base date + n hours so each commit has a unique but reproducible timestamp
  const isoDate = `2024-10-31T${String(n).padStart(2, '0')}:00:00+00:00`;
  gitWithDate(isoDate, 'add', '-A');
  gitWithDate(isoDate, 'commit', '--allow-empty', '-m', message);
}

// ── tear down and recreate ────────────────────────────────────────────────────

if (existsSync(REPO)) {
  // On Windows, git worktree files can be read-only; force removal
  rmSync(REPO, { recursive: true, force: true });
}
mkdirSync(REPO, { recursive: true });

execFileSync('git', ['init', '-b', 'main'], { cwd: REPO, stdio: 'pipe' });
git('config', 'user.email', 'fixture@poltergeist.local');
git('config', 'user.name', 'Poltergeist Fixture');

// ── package.json — written once, never changed ───────────────────────────────

const packageJson = JSON.stringify(
  {
    name: 'haunted-repo',
    version: '1.0.0',
    type: 'module',
    scripts: { test: 'vitest run' },
    devDependencies: {
      'fast-check': '^3.22.0',
      typescript: '^5.5.0',
      vitest: '^2.1.0',
      '@types/node': '^20.0.0',
    },
  },
  null,
  2,
);

// ── tsconfig.json — written once ─────────────────────────────────────────────

const tsConfig = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*'],
  },
  null,
  2,
);

// ── vitest.config.ts — written once ──────────────────────────────────────────

const vitestConfig = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
`;

// ── source files at each commit state ────────────────────────────────────────

// Commits 1-5, 7-8, 10-11, 13-15: correct implementations
const mathCorrect = `\
// math.ts — correct implementations
export function add(a: number, b: number): number { return a + b; }
export function double(n: number): number { return n * 2; }
export function abs(n: number): number { return Math.abs(n); }
`;

// Commit 6+: add is broken (returns a - b).  double and abs still correct.
const mathBrokenAdd = `\
// math.ts — add broken (returns a - b)
export function add(a: number, b: number): number { return a - b; }
export function double(n: number): number { return n * 2; }
export function abs(n: number): number { return Math.abs(n); }
`;

// Commit 9+: add and double are broken.
const mathBrokenAddDouble = `\
// math.ts — add broken, double broken (returns n*2+1)
export function add(a: number, b: number): number { return a - b; }
export function double(n: number): number { return n * 2 + 1; }
export function abs(n: number): number { return Math.abs(n); }
`;

// Commit 12+: add, double, and abs are all broken.
const mathBrokenAll = `\
// math.ts — add broken, double broken, abs broken (returns n, not Math.abs(n))
export function add(a: number, b: number): number { return a - b; }
export function double(n: number): number { return n * 2 + 1; }
export function abs(n: number): number { return n; }
`;

// Property tests — static throughout all commits
const propTests = `\
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { add, double, abs } from '../math.js';

const seed = Number(process.env.FAST_CHECK_SEED) || Date.now();

describe('math properties', () => {
  it('prop-add-commutative', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => add(a, b) === add(b, a)),
      { seed },
    );
  });

  it('prop-double-is-even', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => double(n) % 2 === 0),
      { seed },
    );
  });

  it('prop-abs-nonneg', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => abs(n) >= 0),
      { seed },
    );
  });
});
`;

// ── build commits 1-15 ───────────────────────────────────────────────────────

mkdirSync(join(REPO, 'src', '__tests__'), { recursive: true });

// Commit 1 — initial project skeleton
write('package.json', packageJson);
write('tsconfig.json', tsConfig);
write('vitest.config.ts', vitestConfig);
write('src/math.ts', mathCorrect);
write('src/__tests__/math.test.ts', propTests);
commit(1, 'chore: initial project setup');

// Install dependencies and commit the lock file so worktree installs are deterministic
// On Windows, 'npm' is a .cmd/.ps1 wrapper and can't be spawned directly with execFileSync.
// Use process.execPath + npm-cli.js instead (same resolution strategy as runner.ts).
function resolveNpmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const p = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(p)) return p;
  throw new Error(
    `Cannot locate npm-cli.js. Set npm_execpath or ensure npm is installed alongside Node at ${process.execPath}`,
  );
}
const npmCli = resolveNpmCli();
execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: REPO,
  stdio: 'pipe',
});
write('.gitignore', 'node_modules/\ndist/\n');
commit(2, 'chore: add package-lock.json and .gitignore');

// Commits 3-5 — innocuous changes (comments, readme)
write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n');
commit(3, 'docs: add readme');

write('src/math.ts', mathCorrect.replace('// math.ts — correct implementations', '// math.ts — pure arithmetic helpers'));
commit(4, 'refactor: improve comment in math.ts');

write('src/math.ts', mathCorrect.replace('// math.ts — correct implementations', '// math.ts — arithmetic helpers (stable)'));
commit(5, 'style: tweak comment wording');

// Commit 6 — REGRESSION: prop-add-commutative broken from here on
write('src/math.ts', mathBrokenAdd);
commit(6, 'perf: micro-optimise add (bug introduced)');

// Commits 7-8 — unrelated changes
write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 7.\n');
commit(7, 'docs: update readme');

write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 8.\n');
commit(8, 'docs: update readme again');

// Commit 9 — REGRESSION: prop-double-is-even broken from here on
write('src/math.ts', mathBrokenAddDouble);
commit(9, 'perf: micro-optimise double (bug introduced)');

// Commits 10-11 — unrelated changes
write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 10.\n');
commit(10, 'docs: update readme');

write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 11.\n');
commit(11, 'docs: update readme');

// Commit 12 — REGRESSION: prop-abs-nonneg broken from here on
write('src/math.ts', mathBrokenAll);
commit(12, 'perf: micro-optimise abs (bug introduced)');

// Commits 13-15 — unrelated changes
write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 13.\n');
commit(13, 'docs: update readme');

write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 14.\n');
commit(14, 'docs: update readme');

write('README.md', '# haunted-repo\n\nFixture repo for Poltergeist bisect tests.\n\nCommit 15 — tip.\n');
commit(15, 'docs: final commit');

// ── print the commit log ──────────────────────────────────────────────────────

const log = execFileSync(
  'git',
  ['log', '--oneline', '--format=%H %s'],
  { cwd: REPO, encoding: 'utf8' },
);

console.log('haunted-repo built successfully.\n');
console.log('Commit log (newest first):');
console.log(log.trim());
