/**
 * runner.ts — runs a single fast-check property in a worktree.
 *
 * Vitest is invoked as:
 *   process.execPath <worktree>/node_modules/vitest/vitest.mjs run --reporter=json --testNamePattern <propertyId>
 *
 * Never uses npx or npm as the executable.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── types ─────────────────────────────────────────────────────────────────────

export type RunResult =
  | { status: 'passed' }
  | { status: 'failed'; counterexample: string }
  | { status: 'not-found' };

// Shape of relevant fields in Vitest's JSON reporter output.
interface VitestJson {
  success?: boolean;
  numTotalTests?: number;
  numFailedTests?: number;
  numPassedTests?: number;
  numPendingTests?: number; // tests skipped by --testNamePattern mismatch
  testResults?: Array<{
    assertionResults?: Array<{
      status?: string;
      failureMessages?: string[];
    }>;
    status?: string;
    message?: string;
  }>;
}

// ── npm-cli.js resolution ─────────────────────────────────────────────────────

/**
 * Resolves the absolute path to npm-cli.js.
 *
 * Priority:
 * 1. process.env.npm_execpath (set when this process was launched by npm).
 * 2. <nodeDir>/node_modules/npm/bin/npm-cli.js (Windows & bundled npm layouts).
 *
 * Throws a descriptive error if neither exists.
 */
export function resolveNpmCli(): string {
  const fromEnv = process.env['npm_execpath'];
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const fallback = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(fallback)) {
    return fallback;
  }
  throw new Error(
    `Cannot locate npm-cli.js. Set npm_execpath or ensure npm is installed alongside Node at ${process.execPath}`,
  );
}

// ── dependency installation ───────────────────────────────────────────────────

/**
 * Installs dependencies in `worktreePath` if `node_modules` is absent.
 * Uses process.execPath + npm-cli.js with a fixed argument list.
 * Called once per worktree before the first test run.
 */
export function installDependencies(worktreePath: string): void {
  if (existsSync(join(worktreePath, 'node_modules'))) {
    return; // already installed
  }
  const npmCli = resolveNpmCli();
  const result = spawnSync(
    process.execPath,
    [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: worktreePath, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `npm install failed in ${worktreePath}:\n${result.stderr ?? result.stdout ?? ''}`,
    );
  }
}

// ── result parsing ────────────────────────────────────────────────────────────

/**
 * Parses Vitest JSON output into a RunResult.
 *
 * Decision tree:
 * 1. JSON parse failure or signal exit → throw (infrastructure error).
 * 2. numTotalTests === 0 AND success === true  → not-found
 *    (the pattern matched no tests at all)
 * 3. numTotalTests === 0 AND success === false → failed with empty counterexample
 *    (suite-level failure: import error, syntax error, etc.)
 * 4. numFailedTests > 0 (numTotalTests > 0)   → failed with counterexample
 * 5. Otherwise                                → passed
 */
export function parseVitestOutput(stdout: string, stderr: string, exitCode: number | null, signal: string | null): RunResult {
  if (signal !== null) {
    throw new Error(`Vitest process killed by signal ${signal}. stderr: ${stderr}`);
  }

  let json: VitestJson = {};
  let parsed = false;
  try {
    // Vitest --reporter=json may print non-JSON lines before the JSON object.
    // Find the first '{' and parse from there.
    const start = stdout.indexOf('{');
    if (start !== -1) {
      json = JSON.parse(stdout.slice(start)) as VitestJson;
      parsed = true;
    }
  } catch {
    // fall through to error handling below
  }

  if (!parsed && exitCode !== 0) {
    throw new Error(`Vitest produced unparseable output (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`);
  }

  const numTotal   = json.numTotalTests   ?? 0;
  const numFailed  = json.numFailedTests  ?? 0;
  const numPending = json.numPendingTests ?? 0;
  const success    = json.success         ?? (exitCode === 0);

  // Vitest 2.x: when --testNamePattern matches no test, all tests are marked
  // "pending" (skipped) and numTotalTests equals numPendingTests.
  if (numTotal > 0 && numTotal === numPending && numFailed === 0) {
    return { status: 'not-found' };
  }

  if (numTotal === 0 && success) {
    return { status: 'not-found' };
  }

  if (numTotal === 0 && !success) {
    // Suite-level failure (e.g. import error): treat as failed run.
    const suiteMsg = json.testResults?.[0]?.message ?? '';
    return { status: 'failed', counterexample: suiteMsg };
  }

  if (numFailed > 0) {
    let counterexample = '';
    outer: for (const suite of json.testResults ?? []) {
      for (const assertion of suite.assertionResults ?? []) {
        if (assertion.status === 'failed' && assertion.failureMessages?.[0]) {
          counterexample = assertion.failureMessages[0];
          break outer;
        }
      }
    }
    return { status: 'failed', counterexample };
  }

  return { status: 'passed' };
}

// ── main entry point ──────────────────────────────────────────────────────────

/**
 * Runs a single property-based test in `worktreePath` and returns the result.
 *
 * @param worktreePath - absolute path to a git worktree with the target repo checked out.
 * @param propertyId   - Vitest --testNamePattern string selecting exactly one test.
 * @param seed         - integer seed passed as FAST_CHECK_SEED to the child process.
 */
export function runProperty(
  worktreePath: string,
  propertyId: string,
  seed: number,
): RunResult {
  const vitestBin = join(worktreePath, 'node_modules', 'vitest', 'vitest.mjs');

  const result = spawnSync(
    process.execPath,
    [
      vitestBin,
      'run',
      '--reporter=json',
      '--testNamePattern', propertyId, // separate arg — never shell-interpolated
    ],
    {
      cwd: worktreePath,
      env: { ...process.env, FAST_CHECK_SEED: String(seed) },
      encoding: 'utf8',
    },
  );

  return parseVitestOutput(
    result.stdout ?? '',
    result.stderr ?? '',
    result.status,
    result.signal,
  );
}
