// Tests for the browser-safe AJV-standalone schema shim.
//
// These tests run under vitest at the repo root. They exercise the generated
// validator that prebuild/predev/pretest builds via
// `native-client/scripts/build-validator.mjs`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const validFixturePath = join(
  repoRoot,
  'tests',
  'schema',
  'valid',
  'minimal-thread.json'
);

const importShim = async () => {
  // Late import so the generated file exists by the time vitest pulls it.
  return await import(
    join(repoRoot, 'native-client', 'src', 'app', 'core-schema-shim.ts').replaceAll('\\', '/')
  );
};

describe('core-schema-shim', () => {
  beforeAll(() => {
    // Sanity: the generated validator must exist. The root `pretest` script
    // runs `prepare-native-client` which builds it; if it's missing we fail
    // loudly so the CI signal is clear.
    const generatedPath = join(
      repoRoot,
      'native-client',
      'src',
      'app',
      'generated',
      'sidecar-validator.js'
    );
    try {
      readFileSync(generatedPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Generated validator missing at ${generatedPath}. Did the pretest hook fail to run 'npm run prepare-native-client'? Original error: ${err}`
      );
    }
  });

  it('parseSidecar accepts a valid fixture', async () => {
    const { parseSidecar } = await importShim();
    const raw = readFileSync(validFixturePath, 'utf-8');
    const sidecar = parseSidecar(raw);
    expect(sidecar.schema_version).toBe('0.1.0');
    expect(sidecar.threads).toHaveLength(1);
  });

  it('parseSidecar throws SCHEMA_INVALID on malformed JSON', async () => {
    const { parseSidecar } = await importShim();
    try {
      parseSidecar('not json {');
      throw new Error('expected parseSidecar to throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('SCHEMA_INVALID');
    }
  });

  it('parseSidecar throws SCHEMA_INVALID on schema violation', async () => {
    const { parseSidecar } = await importShim();
    const bad = JSON.stringify({ schema_version: '0.1.0', document: { path: '' }, threads: [] });
    try {
      parseSidecar(bad);
      throw new Error('expected parseSidecar to throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('SCHEMA_INVALID');
    }
  });

  it('validateSidecar returns true for valid', async () => {
    const { validateSidecar } = await importShim();
    const data = JSON.parse(readFileSync(validFixturePath, 'utf-8'));
    expect(validateSidecar(data)).toBe(true);
  });

  it('validateSidecarResult returns errors array for invalid', async () => {
    const { validateSidecarResult } = await importShim();
    const result = validateSidecarResult({ schema_version: 'wrong' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not require runtime eval (CSP-safe)', async () => {
    // Patch Function and eval to throw. If the shim ever falls back to a
    // runtime-compiled validator, these patches will trigger and the test
    // will fail.
    const originalFn = globalThis.Function;
    const originalEval = globalThis.eval;
    const trapFn = function () {
      throw new Error('Function constructor invoked');
    } as unknown as typeof globalThis.Function;
    // eslint-disable-next-line no-global-assign
    globalThis.Function = trapFn;
    // eslint-disable-next-line no-global-assign
    globalThis.eval = ((_: string) => {
      throw new Error('eval invoked');
    }) as unknown as typeof globalThis.eval;
    try {
      const { parseSidecar } = await importShim();
      const raw = readFileSync(validFixturePath, 'utf-8');
      const sidecar = parseSidecar(raw);
      expect(sidecar.schema_version).toBe('0.1.0');
    } finally {
      globalThis.Function = originalFn;
      globalThis.eval = originalEval;
    }
  });
});
