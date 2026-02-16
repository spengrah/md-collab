import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/obsidian-plugin/obsidian-shim.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts', 'vscode-extension/src/**/*.ts', 'obsidian-plugin/src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: {
        statements: 50,
        lines: 50,
        functions: 75,
        branches: 70,
      },
    },
  },
});
