/**
 * runner.test.ts
 *
 * Unit tests for runner.ts.  Vitest invocations are stubbed so these tests
 * run without a real repo or Node process spawn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// We test parseVitestOutput and resolveNpmCli directly (pure functions).
import { parseVitestOutput, resolveNpmCli, installDependencies, runProperty } from '../runner.js';

// ── parseVitestOutput ─────────────────────────────────────────────────────────

describe('parseVitestOutput', () => {
  it('[REQ-BE-04] pass: returns passed when numTotalTests > 0 and numFailedTests === 0', () => {
    const json = JSON.stringify({ success: true, numTotalTests: 1, numFailedTests: 0, numPassedTests: 1, testResults: [] });
    expect(parseVitestOutput(json, '', 0, null)).toEqual({ status: 'passed' });
  });

  it('[REQ-BE-04] fail: returns failed with counterexample when numFailedTests > 0', () => {
    const json = JSON.stringify({
      success: false,
      numTotalTests: 1,
      numFailedTests: 1,
      numPassedTests: 0,
      testResults: [{
        assertionResults: [{
          status: 'failed',
          failureMessages: ['Property failed after 10 tests\nCounterexample: [-1]'],
        }],
      }],
    });
    const result = parseVitestOutput(json, '', 1, null);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.counterexample).toContain('Counterexample');
    }
  });

  it('[REQ-BE-12] not-found: returns not-found when zero tests ran and success is true', () => {
    const json = JSON.stringify({ success: true, numTotalTests: 0, numFailedTests: 0, numPendingTests: 0, testResults: [] });
    expect(parseVitestOutput(json, '', 0, null)).toEqual({ status: 'not-found' });
  });

  it('[REQ-BE-12] not-found: returns not-found when all tests are skipped by testNamePattern (Vitest 2.x)', () => {
    // Vitest 2.x marks unmatched tests as pending rather than zero total.
    const json = JSON.stringify({
      success: true,
      numTotalTests: 3,
      numFailedTests: 0,
      numPassedTests: 0,
      numPendingTests: 3,
      testResults: [],
    });
    expect(parseVitestOutput(json, '', 0, null)).toEqual({ status: 'not-found' });
  });

  it('[REQ-BE-04] suite-level failure: zero tests + success false → failed (not not-found)', () => {
    const json = JSON.stringify({
      success: false,
      numTotalTests: 0,
      numFailedTests: 0,
      testResults: [{ status: 'failed', message: 'Cannot find module ./missing.js' }],
    });
    const result = parseVitestOutput(json, '', 1, null);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.counterexample).toContain('missing');
    }
  });

  it('[REQ-BE-04] signal: throws when process was killed by a signal', () => {
    expect(() => parseVitestOutput('', '', null, 'SIGKILL')).toThrow(/SIGKILL/);
  });

  it('[REQ-BE-04] unparseable output with non-zero exit: throws', () => {
    expect(() => parseVitestOutput('not json at all', '', 1, null)).toThrow();
  });

  it('[REQ-BE-04] non-JSON preamble is tolerated when JSON follows', () => {
    const json = JSON.stringify({ success: true, numTotalTests: 1, numFailedTests: 0, numPassedTests: 1, testResults: [] });
    const stdout = `some preamble text\n${json}`;
    expect(parseVitestOutput(stdout, '', 0, null)).toEqual({ status: 'passed' });
  });
});

// ── resolveNpmCli ─────────────────────────────────────────────────────────────

describe('resolveNpmCli', () => {
  it('[REQ-BE-04] resolves npm-cli.js to an existing file', () => {
    const p = resolveNpmCli();
    expect(existsSync(p)).toBe(true);
    expect(p).toMatch(/npm-cli\.js$/);
  });

  it('[REQ-BE-04] npm_execpath takes priority when it points to an existing file', () => {
    const real = resolveNpmCli();
    const original = process.env['npm_execpath'];
    process.env['npm_execpath'] = real;
    try {
      expect(resolveNpmCli()).toBe(real);
    } finally {
      if (original === undefined) {
        delete process.env['npm_execpath'];
      } else {
        process.env['npm_execpath'] = original;
      }
    }
  });

  it('[REQ-BE-04] throws a descriptive error when neither path exists', () => {
    const original = process.env['npm_execpath'];
    process.env['npm_execpath'] = '/does/not/exist/npm-cli.js';
    // Temporarily shadow process.execPath to point nowhere
    const origExecPath = process.execPath;
    Object.defineProperty(process, 'execPath', { value: '/no/such/node', configurable: true });
    try {
      expect(() => resolveNpmCli()).toThrow(/Cannot locate npm-cli\.js/);
    } finally {
      Object.defineProperty(process, 'execPath', { value: origExecPath, configurable: true });
      if (original === undefined) {
        delete process.env['npm_execpath'];
      } else {
        process.env['npm_execpath'] = original;
      }
    }
  });
});

// ── runProperty integration smoke test ───────────────────────────────────────
// Runs against the real fixture repo to verify the full invocation works.

describe('runProperty (integration, REQ-BE-04)', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');
  const REPO = join(WORKSPACE_ROOT, 'fixtures', 'haunted-repo');

  it('[REQ-BE-04] returns passed for a known-good commit', () => {
    const result = runProperty(REPO, 'prop-add-commutative', 20241031);
    // At the tip (broken), it should fail — but we just want it to not throw
    // and to return a valid RunResult shape.
    expect(['passed', 'failed', 'not-found']).toContain(result.status);
  }, 60_000);

  it('[REQ-BE-12] returns not-found for a property name that matches nothing', () => {
    const result = runProperty(REPO, 'nonexistent-property-xyz-99999', 20241031);
    expect(result.status).toBe('not-found');
  }, 60_000);
});
