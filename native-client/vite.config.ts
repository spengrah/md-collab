import { defineConfig } from 'vite';

// Tauri 2 expects a dev server on a fixed port and dist output in `dist/`.
// CSP is enforced by Tauri config; Vite just bundles to ES2022 here.
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
  // Strip node: imports — anything importing `node:fs` is a bug; let Vite fail loudly.
  resolve: {
    conditions: ['browser', 'module', 'import', 'default'],
  },
});
