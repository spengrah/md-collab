// Browser-safe replacements for `src/schema.ts` exports.
//
// `src/schema.ts` uses `readFileSync` + `fileURLToPath` to load the schema
// at runtime and `ajv.compile(...)` to build the validator. Neither works
// under Tauri's WKWebView (no `node:fs`, no `unsafe-eval`).
//
// This shim imports the AJV-standalone-generated validator (built at
// `prebuild` / `predev` / `pretypecheck` time by
// `scripts/build-validator.mjs`) and exposes the same API surface
// (`parseSidecar`, `validateSidecar`, `validateSidecarResult`).
//
// The generated module is gitignored; if it's missing, the import will
// fail at bundle time with a clear error and a pointer to the build script.

import type { Sidecar } from '../../vendor/core/types.js';
import { error } from '../../vendor/core/errors.js';
// The generated validator is an ESM module exporting a default `validate`
// function (Sidecar => boolean) with an `errors` property populated on
// failure. We import it dynamically with a fallback in case the developer
// hasn't run `npm run build-validator` yet.
import { validate as compiledValidate } from './generated/sidecar-validator.js';

export interface SidecarValidationResult {
  valid: boolean;
  errors: string[];
}

interface AjvLikeError {
  instancePath?: string;
  message?: string;
}

interface AjvLikeValidator {
  (data: unknown): boolean;
  errors?: AjvLikeError[] | null;
}

const validator = compiledValidate as unknown as AjvLikeValidator;

export const validateSidecarResult = (data: unknown): SidecarValidationResult => {
  const valid = validator(data) as boolean;
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validator.errors ?? []).map((entry) => {
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
  return parsed as Sidecar;
};

export const validateSidecar = (data: unknown): data is Sidecar =>
  validateSidecarResult(data).valid;
