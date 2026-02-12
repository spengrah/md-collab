import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixturesRoot = join(process.cwd(), 'tests', 'fixtures', 'anchors');
const requiredFiles = ['before.md', 'after.md', 'threads.json', 'expected.json'];

describe('anchor fixture corpus shape', () => {
  const dirs = readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it('contains required scenario fixture directories', () => {
    expect(dirs).toEqual(
      expect.arrayContaining([
        'anchor-insert-before-range',
        'anchor-delete-in-range',
        'anchor-paragraph-split',
        'anchor-duplicate-quote-disambiguation',
        'anchor-move-block',
        'anchor-heavy-rewrite-broken',
        'anchor-newline-normalization'
      ])
    );
  });

  for (const dir of dirs) {
    it(`${dir} has required files`, () => {
      for (const req of requiredFiles) {
        expect(existsSync(join(fixturesRoot, dir, req))).toBe(true);
      }
    });
  }
});
