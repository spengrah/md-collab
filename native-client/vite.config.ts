import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Tauri 2 expects a dev server on a fixed port and dist output in `dist/`.
// CSP is enforced by Tauri config; Vite just bundles to ES2022 here.
//
// The vendored core's anchor.js imports `node:crypto` for sha256. WKWebView
// has no node: imports, so we shim it via resolve.alias. Any other `node:*`
// imports remain unresolvable so the build fails loudly (mirrors the plan §
// 3.5 invariant).

const cryptoShim = fileURLToPath(new URL('./src/app/node-crypto-shim.ts', import.meta.url));

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  resolve: {
    conditions: ['browser', 'module', 'import', 'default'],
    alias: {
      'node:crypto': cryptoShim,
    },
  },
});
