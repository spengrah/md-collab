import { mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const entry of readdirSync(srcDir)) {
  if (entry.endsWith('.js') || entry.endsWith('.js.map')) {
    copyFileSync(join(srcDir, entry), join(distDir, entry));
  }
}

const typeStubPath = join(root, 'scripts', 'index.d.ts');
copyFileSync(typeStubPath, join(distDir, 'index.d.ts'));

console.log('Built dist/ from src/*.js + type declarations.');
