import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const entry of readdirSync(srcDir)) {
  if (!entry.endsWith('.ts')) continue;

  const sourcePath = join(srcDir, entry);
  const sourceText = readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      inlineSources: true,
    },
    fileName: sourcePath,
  });

  const jsName = entry.replace(/\.ts$/, '.js');
  const mapName = `${jsName}.map`;
  writeFileSync(join(distDir, jsName), `${transpiled.outputText}\n//# sourceMappingURL=${mapName}\n`);
  if (transpiled.sourceMapText) {
    writeFileSync(join(distDir, mapName), transpiled.sourceMapText);
  }
}

copyFileSync(join(root, 'scripts', 'index.d.ts'), join(distDir, 'index.d.ts'));

console.log('Built dist/ from src/*.ts (transpile-only) + type declarations.');
