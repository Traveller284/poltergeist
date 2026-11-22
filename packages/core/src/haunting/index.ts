/**
 * index.ts — public API for the haunting-store module.
 */

export type { Haunting, HauntingStatus } from './haunting.js';
export { makeHaunting, banish } from './haunting.js';
export type { ScanEntry, PassingEntry } from './store.js';
export { loadStore, saveStore, mergeHauntings } from './store.js';
export { captureLastWords } from './last-words.js';
