/**
 * global-setup.ts — Vitest global setup
 *
 * Runs once before any test file is loaded. If fixtures/haunted-repo does not
 * exist (fresh clone or deliberate deletion), it builds it by running
 * fixtures/build-haunted-repo.mjs with the current Node binary.
 *
 * This means `cd packages/core && npm install && npx vitest run` works on a
 * fresh clone with no manual pre-step.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export default function setup(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // src/test-setup → up 4 levels → workspace root
  const workspaceRoot = join(__dirname, '..', '..', '..', '..');
  const fixtureRepo   = join(workspaceRoot, 'fixtures', 'haunted-repo');
  const buildScript   = join(workspaceRoot, 'fixtures', 'build-haunted-repo.mjs');

  if (existsSync(fixtureRepo)) {
    return; // already built, nothing to do
  }

  console.log('\n[global-setup] fixtures/haunted-repo not found — building now…');

  const result = spawnSync(process.execPath, [buildScript], {
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `fixtures/build-haunted-repo.mjs failed with exit code ${result.status ?? 'null'}`,
    );
  }

  console.log('[global-setup] fixture built.\n');
}
