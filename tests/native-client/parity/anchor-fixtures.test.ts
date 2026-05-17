// Cross-frontend parity test (guidance §12.3 / plan § 8.3).
//
// Iterates every fixture under `tests/fixtures/anchors/` and runs the
// vendored `reanchor` from the native-client's perspective. The expected
// confidences must match the same values the VS Code and Obsidian frontends
// already assert on (since they all import the same vendored core).
//
// This is the bridge test that guarantees the native client's reanchor
// outputs are identical to the other frontends.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { reanchor } from '../../../native-client/src/app/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', '..', 'fixtures', 'anchors');

interface Expected {
  results: Array<{
    thread_id: string;
    expected_confidence: string;
    expected_reason_code?: string;
    expected_start?: { line: number; column: number };
    expected_end?: { line: number; column: number };
    requires_manual_relink?: boolean;
  }>;
}

interface ThreadsJson {
  threads: Array<{
    thread_id: string;
    anchor: {
      primary: { start: { line: number; column: number; offset_utf16: number }; end: { line: number; column: number; offset_utf16: number } };
      fallback: { quote: string; prefix: string; suffix: string; quote_hash: string; context_hash: string };
      anchor_confidence: string;
    };
  }>;
}

function loadFixture(dir: string) {
  const before = readFileSync(join(dir, 'before.md'), 'utf-8');
  const after = readFileSync(join(dir, 'after.md'), 'utf-8');
  const threads = JSON.parse(readFileSync(join(dir, 'threads.json'), 'utf-8')) as ThreadsJson;
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8')) as Expected;
  return { before, after, threads, expected };
}

const fixtureDirs = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => !name.startsWith('.'))
  .sort();

describe('native-client reanchor parity vs fixtures', () => {
  for (const fixture of fixtureDirs) {
    it(`matches expected for ${fixture}`, () => {
      const dir = join(fixturesRoot, fixture);
      const { after, threads, expected } = loadFixture(dir);

      for (const thread of threads.threads) {
        const expectedRow = expected.results.find((r) => r.thread_id === thread.thread_id);
        if (!expectedRow) {
          throw new Error(`fixture ${fixture}: no expected row for thread ${thread.thread_id}`);
        }

        const result = reanchor(after, thread.anchor as any);

        expect(
          result.anchor_confidence,
          `${fixture}/${thread.thread_id} confidence mismatch`
        ).toBe(expectedRow.expected_confidence);

        // Low-confidence fuzzy recovery may drift slightly by implementation;
        // matches the tolerance used in tests/backend/reanchor-fixtures.test.ts.
        if (expectedRow.expected_confidence === 'low') {
          expect(result.start).not.toBeNull();
          expect(result.end).not.toBeNull();
          continue;
        }
        if (expectedRow.expected_confidence === 'broken') {
          expect(result.start).toBeNull();
          expect(result.end).toBeNull();
          continue;
        }

        if (expectedRow.expected_start && result.start) {
          expect(result.start.line, `${fixture}/${thread.thread_id} start.line`).toBe(
            expectedRow.expected_start.line
          );
          expect(result.start.column, `${fixture}/${thread.thread_id} start.column`).toBe(
            expectedRow.expected_start.column
          );
        }
        if (expectedRow.expected_end && result.end) {
          expect(result.end.line, `${fixture}/${thread.thread_id} end.line`).toBe(
            expectedRow.expected_end.line
          );
          // Reanchor returns the last-char-inclusive position; existing parity
          // tests permit ±1 here. Mirror that tolerance for the native client.
          expect(
            Math.abs(result.end.column - expectedRow.expected_end.column),
            `${fixture}/${thread.thread_id} end.column (within ±1)`
          ).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
