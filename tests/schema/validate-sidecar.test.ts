import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const root = process.cwd();
const schemaPath = join(root, 'schemas', 'comments-sidecar.schema.json');
const validDir = join(root, 'tests', 'schema', 'valid');
const invalidDir = join(root, 'tests', 'schema', 'invalid');

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
});
