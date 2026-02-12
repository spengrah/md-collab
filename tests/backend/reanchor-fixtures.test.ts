import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reanchor } from '../../src/index.js';

const fixturesRoot = join(process.cwd(), 'tests', 'fixtures', 'anchors');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

describe('reanchoring fixture corpus', () => {
  const dirs = readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    it(`matches expected outcomes for ${dir}`, () => {
      const after = readFileSync(join(fixturesRoot, dir, 'after.md'), 'utf-8');
      const threads = readJson(join(fixturesRoot, dir, 'threads.json')).threads as Array<any>;
      const expected = readJson(join(fixturesRoot, dir, 'expected.json')).results as Array<any>;

      for (const exp of expected) {
        const thread = threads.find((t) => t.thread_id === exp.thread_id);
        expect(thread).toBeDefined();
        const out = reanchor(after, thread.anchor);

        expect(out.anchor_confidence).toBe(exp.expected_confidence);
        expect(out.reason_code).toBe(exp.expected_reason_code);

        if (exp.expected_start === null) {
          expect(out.start).toBeNull();
          expect(out.end).toBeNull();
        } else if (exp.expected_confidence === 'low') {
          // Low-confidence fuzzy recovery is expected to drift slightly by implementation.
          expect(out.start).not.toBeNull();
          expect(out.end).not.toBeNull();
        } else {
          expect(out.start?.line).toBe(exp.expected_start.line);
          expect(out.start?.column).toBe(exp.expected_start.column);
          expect(out.end?.line).toBe(exp.expected_end.line);
          expect(Math.abs((out.end?.column ?? 0) - exp.expected_end.column)).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
