import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const projectRoot = join(root, '..');
const fromDir = join(projectRoot, 'dist');
const toDir = join(root, 'vendor', 'core');

mkdirSync(toDir, { recursive: true });
for (const file of readdirSync(fromDir)) {
  if (!file.endsWith('.js') && !file.endsWith('.map') && !file.endsWith('.d.ts')) continue;
  copyFileSync(join(fromDir, file), join(toDir, file));
}
copyFileSync(join(projectRoot, 'schemas', 'comments-sidecar.schema.json'), join(root, 'vendor', 'comments-sidecar.schema.json'));
console.log('Synced core dist and schema into obsidian-plugin/vendor.');
