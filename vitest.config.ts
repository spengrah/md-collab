import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/obsidian-plugin/obsidian-shim.ts', import.meta.url)),
      // The native-client frontend's `app/core.ts` re-exports vendored core.
      // anchor.js does `import { createHash } from 'node:crypto'`; vitest runs
      // under Node so that resolves natively. This alias is here only to keep
      // jsdom-based tests honest if a test ever opts into the browser shim.
      'native-client-crypto-shim': fileURLToPath(
        new URL('./native-client/src/app/node-crypto-shim.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Tests under `tests/native-client/components/**` exercise DOM-rendering
    // components; they need jsdom. We scope the environment per-file via
    // `environmentMatchGlobs` so backend tests stay in node.
    environmentMatchGlobs: [
      ['tests/native-client/components/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: [
        'src/**/*.ts',
        'vscode-extension/src/**/*.ts',
        'obsidian-plugin/src/**/*.ts',
        'native-client/src/**/*.ts',
      ],
      exclude: ['src/cli.ts', 'native-client/src/app/generated/**'],
      thresholds: {
        statements: 50,
        lines: 50,
        functions: 75,
        branches: 70,
      },
    },
  },
});
