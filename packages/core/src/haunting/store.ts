/**
 * store.ts — persistence for Haunting records.
 * Full implementation in Task HS-2.
 */

import type { Haunting } from './haunting.js';

export interface ScanEntry {
  spec: string;
  propertyId: string;
  firstBadCommit: Haunting['firstBadCommit'];
  lastWords: string;
}

export interface PassingEntry {
  spec: string;
  propertyId: string;
}

export function loadStore(_outPath: string): Haunting[] {
  throw new Error('Not implemented yet — Task HS-2');
}

export function saveStore(_outPath: string, _hauntings: Haunting[]): void {
  throw new Error('Not implemented yet — Task HS-2');
}

export function mergeHauntings(
  _existing: Haunting[],
  _newEntries: ScanEntry[],
  _nowPassing: PassingEntry[],
  _now?: string,
): Haunting[] {
  throw new Error('Not implemented yet — Task HS-2');
}
