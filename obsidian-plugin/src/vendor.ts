// Re-export only the modules the plugin uses.
// Avoid re-exporting schema.js and cli.js which use import.meta.url
// (incompatible with CJS bundle format).
export * from '../vendor/core/diff-remap.js';
export * from '../vendor/core/operations.js';
export * from '../vendor/core/sidecar-file.js';
export * from '../vendor/core/revision.js';
export * from '../vendor/core/anchor.js';
export * from '../vendor/core/reanchor.js';
export * from '../vendor/core/types.js';
export * from '../vendor/core/errors.js';
export * from '../vendor/core/serializer.js';
