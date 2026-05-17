// Generate a CSP-safe AJV validator for the sidecar schema.
//
// AJV's default `compile(schema)` path uses `new Function(...)` at runtime,
// which Tauri's WKWebView blocks via the default CSP (`script-src 'self'`,
// no `unsafe-eval`). AJV's standalone code-gen runs at build time and emits
// a plain module that can be imported by the webview without any runtime
// code evaluation.
//
// Reference: https://ajv.js.org/standalone.html
//
// Output: native-client/src/app/generated/sidecar-validator.js
// The file is gitignored and regenerated on every prebuild / predev /
// pretypecheck via the corresponding npm script hook.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import standaloneCodeImport from 'ajv/dist/standalone/index.js';

const addFormats = addFormatsImport.default ?? addFormatsImport;
const standaloneCode = standaloneCodeImport.default ?? standaloneCodeImport;

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(here, '..');

const schemaPath = join(clientRoot, 'vendor', 'schemas', 'comments-sidecar.schema.json');
const outDir = join(clientRoot, 'src', 'app', 'generated');
const outFile = join(outDir, 'sidecar-validator.js');

const schemaRaw = readFileSync(schemaPath, 'utf-8');
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv2020({
  code: { source: true, esm: true },
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const moduleCode = standaloneCode(ajv, ajv.compile(schema));

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, moduleCode);

console.log(`[build-validator] wrote ${outFile} (${moduleCode.length} bytes)`);
