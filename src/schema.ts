import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Sidecar } from './types.js';
import { error } from './errors.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(moduleDir, '..', 'schemas', 'comments-sidecar.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile<Sidecar>(schema);

export interface SidecarValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateSidecarResult = (data: unknown): SidecarValidationResult => {
  const valid = validate(data) as boolean;
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((entry) => {
    const location = entry.instancePath || '/';
    return `${location} ${entry.message ?? 'is invalid'}`.trim();
  });

  return { valid: false, errors };
};

export const parseSidecar = (json: string): Sidecar => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    error('SCHEMA_INVALID', 'invalid json');
  }

  const result = validateSidecarResult(parsed);
  if (!result.valid) {
    error('SCHEMA_INVALID', result.errors.join('; '));
  }
  return parsed;
};

export const validateSidecar = (data: unknown): data is Sidecar => validateSidecarResult(data).valid;
