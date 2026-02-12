import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, '..', '..');
const schemaPath = join(root, 'schemas', 'comments-sidecar.schema.json');
const validDir = join(testDir, 'valid');
const invalidDir = join(testDir, 'invalid');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const loadJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

describe('comments-sidecar schema', () => {
  for (const file of readdirSync(validDir).filter((f) => f.endsWith('.json'))) {
    it(`accepts valid fixture: ${file}`, () => {
      const data = loadJson(join(validDir, file));
      const ok = validate(data);
      expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
    });
  }

  for (const file of readdirSync(invalidDir).filter((f) => f.endsWith('.json'))) {
    it(`rejects invalid fixture: ${file}`, () => {
      const data = loadJson(join(invalidDir, file));
      const ok = validate(data);
      expect(ok).toBe(false);
    });
  }

  it('allows unknown fields for forward-compatible preservation', () => {
    const data = loadJson(join(validDir, 'minimal-thread.json'));
    data.extra_top = { any: 'value' };
    data.threads[0].anchor.extra_anchor = 1;
    data.threads[0].messages[0].extra_message = true;

    const ok = validate(data);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
