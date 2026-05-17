// Mirror the project's dist/ + schemas/ into native-client/vendor/.
//
// Matches the obsidian-plugin / vscode-extension pattern: vendor is gitignored
// and regenerated on every sync. Unconditionally rebuilds the root project
// first (so the vendor is always synced from fresh dist output). The cost is
// ~1-3s of esbuild work; the safety guarantee is worth it.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(here, '..');
const projectRoot = join(clientRoot, '..');

const sourceDist = join(projectRoot, 'dist');
const sourceSchemas = join(projectRoot, 'schemas');
const vendorRoot = join(clientRoot, 'vendor');
const targetCore = join(vendorRoot, 'core');
const targetSchemas = join(vendorRoot, 'schemas');

// Always rebuild the root project first. This is the conservative pattern that
// catches drift between the source TS and the vendored output.
console.log('[sync-core] running root build...');
execSync('npm --prefix .. run build', {
  cwd: clientRoot,
  stdio: 'inherit',
});

if (!existsSync(sourceDist)) {
  throw new Error(`Missing backend dist at ${sourceDist}. Root build did not produce output.`);
}
if (!existsSync(sourceSchemas)) {
  throw new Error(`Missing backend schemas at ${sourceSchemas}.`);
}

mkdirSync(vendorRoot, { recursive: true });
rmSync(targetCore, { recursive: true, force: true });
rmSync(targetSchemas, { recursive: true, force: true });
cpSync(sourceDist, targetCore, { recursive: true });
cpSync(sourceSchemas, targetSchemas, { recursive: true });

console.log('[sync-core] mirrored dist/ + schemas/ into native-client/vendor');
