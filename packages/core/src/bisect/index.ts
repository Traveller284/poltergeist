/**
 * index.ts — public API for the bisect engine.
 *
 * Re-exports everything callers need. Internal modules (git.ts, runner.ts,
 * bisect.ts) should not be imported directly by outside code.
 */

export { bisect, BISECT_SEED, findFirstFailing } from './bisect.js';
export type { BisectInput, BisectResult, FindFirstFailingResult } from './bisect.js';
export type { CommitInfo } from './git.js';
export { type RunResult, runProperty, installDependencies, resolveNpmCli, parseVitestOutput } from './runner.js';
export { PropertyNotFoundError, InvalidRangeError, GoodCommitFailsError, BadCommitPassesError } from './errors.js';
