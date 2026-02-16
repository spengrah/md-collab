import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// Step 1: Transpile-only for JS output (fast, ignores type errors)
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

// Step 2: Generate .d.ts files from source via tsc (--noCheck skips type errors)
execSync('npx tsc --emitDeclarationOnly --noCheck', { cwd: root, stdio: 'inherit' });

console.log('Built dist/ from src/*.ts (transpile-only JS + tsc declarations).');
