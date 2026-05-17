// Browser-safe vendored core barrel.
//
// The vendored core (under `../../vendor/core/`) contains Node-only modules
// (`sidecar-file.js`, `cli.js`, and `schema.js`). The webview must NEVER
// import those — they use `node:fs` and `import.meta.url`/`fileURLToPath`,
// which do not work under Tauri's WKWebView.
//
// This barrel re-exports only the browser-safe subset. The schema shim
// (`core-schema-shim.ts`) provides CSP-safe replacements for `parseSidecar`,
// `validateSidecar`, and `validateSidecarResult` using AJV's standalone
// code-gen output (see `scripts/build-validator.mjs`).

export * from '../../vendor/core/types.js';
export * from '../../vendor/core/errors.js';
export * from '../../vendor/core/anchor.js';
export * from '../../vendor/core/reanchor.js';
export * from '../../vendor/core/diff-remap.js';
export * from '../../vendor/core/serializer.js';

export {
  parseSidecar,
  validateSidecar,
  validateSidecarResult,
  type SidecarValidationResult,
} from './core-schema-shim.js';
