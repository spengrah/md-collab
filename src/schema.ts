import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Sidecar } from './types.js';
import { error } from './errors.js';

const schemaPath = join(process.cwd(), 'schemas', 'comments-sidecar.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile<Sidecar>(schema);

export const parseSidecar = (json: string): Sidecar => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    error('SCHEMA_INVALID', 'invalid json');
  }

  if (!validate(parsed)) {
    error('SCHEMA_INVALID', ajv.errorsText(validate.errors));
  }
  return parsed;
};

export const validateSidecar = (data: unknown): data is Sidecar => validate(data) as boolean;
