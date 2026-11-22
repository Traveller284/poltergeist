/**
 * errors.ts — typed error classes for the bisect engine.
 */

/** Thrown when propertyId matches zero tests at any commit during bisection. */
export class PropertyNotFoundError extends Error {
  constructor(propertyId: string, commit: string) {
    super(`Property "${propertyId}" matched no tests at commit ${commit}`);
    this.name = 'PropertyNotFoundError';
  }
}

/** Thrown when goodCommit and badCommit resolve to the same SHA. */
export class InvalidRangeError extends Error {
  constructor(sha: string) {
    super(`goodCommit and badCommit both resolve to ${sha} — range is empty`);
    this.name = 'InvalidRangeError';
  }
}

/** Thrown when the property already fails at goodCommit. */
export class GoodCommitFailsError extends Error {
  constructor(commit: string) {
    super(`Property already fails at goodCommit ${commit}`);
    this.name = 'GoodCommitFailsError';
  }
}

/** Thrown when the property still passes at badCommit. */
export class BadCommitPassesError extends Error {
  constructor(commit: string) {
    super(`Property still passes at badCommit ${commit}`);
    this.name = 'BadCommitPassesError';
  }
}
