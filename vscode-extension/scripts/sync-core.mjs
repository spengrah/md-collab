import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = join(here, '..');
const projectRoot = join(extRoot, '..');

const sourceDist = join(projectRoot, 'dist');
const sourceSchemas = join(projectRoot, 'schemas');
const vendorRoot = join(extRoot, 'vendor');
const targetCore = join(vendorRoot, 'core');
const targetSchemas = join(vendorRoot, 'schemas');

if (!existsSync(sourceDist)) {
  throw new Error(`Missing backend dist at ${sourceDist}. Run project build first.`);
}
if (!existsSync(sourceSchemas)) {
  throw new Error(`Missing backend schemas at ${sourceSchemas}.`);
}

mkdirSync(vendorRoot, { recursive: true });
rmSync(targetCore, { recursive: true, force: true });
rmSync(targetSchemas, { recursive: true, force: true });
cpSync(sourceDist, targetCore, { recursive: true });
cpSync(sourceSchemas, targetSchemas, { recursive: true });

console.log('Synced backend core into vscode-extension/vendor');
