/**
 * scan.ts — CLI entry point for `poltergeist scan`.
 *
 * Usage:
 *   node dist/cli/scan.js --repo <path> --good <ref> --bad <ref> --config <file> --out <file>
 *
 * On Windows, invoke via `node dist/cli/scan.js` (compiled with tsc).
 * No shebang or shell-specific syntax is used.
 */

import { readFileSync } from 'node:fs';

import { bisect, BISECT_SEED } from '../bisect/index.js';
import { GoodCommitFailsError, BadCommitPassesError } from '../bisect/errors.js';
import { captureLastWords } from '../haunting/last-words.js';
import { loadStore, saveStore, mergeHauntings } from '../haunting/store.js';
import type { ScanEntry, PassingEntry } from '../haunting/store.js';

// ── argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  repo: string;
  good: string;
  bad: string;
  config: string;
  out: string;
} {
  const get = (flag: string): string => {
    const idx = argv.indexOf(flag);
    if (idx === -1 || idx + 1 >= argv.length) {
      throw new Error(`Missing required argument: ${flag}`);
    }
    return argv[idx + 1]!;
  };
  return {
    repo:   get('--repo'),
    good:   get('--good'),
    bad:    get('--bad'),
    config: get('--config'),
    out:    get('--out'),
  };
}

// ── config file ───────────────────────────────────────────────────────────────

interface ConfigFile {
  checks: Array<{ spec: string; property: string }>;
}

function readConfig(configPath: string): ConfigFile {
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)['checks'])
  ) {
    throw new Error(`Config file ${configPath} must be a JSON object with a "checks" array`);
  }
  return parsed as ConfigFile;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig(args.config);
  const existing = loadStore(args.out);

  const newEntries: ScanEntry[] = [];
  const nowPassing: PassingEntry[] = [];
  let errors = 0;

  for (const check of config.checks) {
    const { spec, property: propertyId } = check;
    console.log(`\n[scan] ${spec} / ${propertyId}`);

    try {
      const bisectResult = await bisect({
        repoPath: args.repo,
        propertyId,
        goodCommit: args.good,
        badCommit: args.bad,
        seed: BISECT_SEED,
      });

      const lastWords = await captureLastWords(
        args.repo,
        bisectResult.firstBadCommit.sha,
        propertyId,
        BISECT_SEED,
      );

      newEntries.push({
        spec,
        propertyId,
        firstBadCommit: bisectResult.firstBadCommit,
        lastWords,
      });

      console.log(`  → first bad commit: ${bisectResult.firstBadCommit.sha.slice(0, 8)} (${bisectResult.firstBadCommit.author})`);
      if (lastWords) console.log(`  → last words: ${lastWords.slice(0, 120)}`);
    } catch (err) {
      if (err instanceof BadCommitPassesError || err instanceof GoodCommitFailsError) {
        // Property is not currently failing — treat as passing.
        console.log(`  → property passes (${(err as Error).constructor.name})`);
        nowPassing.push({ spec, propertyId });
      } else {
        console.error(`  ✗ error: ${(err as Error).message}`);
        errors += 1;
      }
    }
  }

  const merged = mergeHauntings(existing, newEntries, nowPassing);
  saveStore(args.out, merged);

  const active   = merged.filter((h) => h.status === 'haunting').length;
  const banished = merged.filter((h) => h.status === 'banished').length;
  console.log(`\n[scan] done — ${active} active, ${banished} banished, ${errors} error(s)`);
  console.log(`[scan] wrote ${args.out}`);

  if (errors > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('[scan] fatal:', (err as Error).message ?? err);
  process.exit(1);
});
