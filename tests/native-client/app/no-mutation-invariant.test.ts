// PR1 cross-frontend invariant: the native client must NOT introduce any
// sidecar/document mutation paths. Per plan § 8.2 (the
// `app.zero-sidecar-mutation-invariant` test), we scan both TS frontend
// sources and Rust backend sources for forbidden mutation names.
//
// Whitelist:
//   - `settings_save` / `settingsSave` — persists state.json, not a sidecar.
//   - `fs_open_sidecar_externally` / `fsOpenSidecarExternally` — launches
//     an external editor; no mutation crosses our IPC.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const TS_ROOT = join(repoRoot, 'native-client', 'src');
const RUST_ROOT = join(repoRoot, 'native-client', 'src-tauri', 'src');

// Patterns that indicate a mutation path. We grep for the *name*, not the
// behavior — false positives are caught by the whitelist.
const MUTATION_NAMES = [
  // Core mutation operations
  'applyReanchor',
  'createThread',
  'replyToThread',
  'resolveThread',
  'reopenThread',
  'proposeSuggestion',
  'acceptSuggestion',
  'rejectSuggestion',
  'applySuggestionToDocument',
  'editMessage',
  // Hypothetical Tauri write commands
  'fs_write_file_atomic',
  'fs_write_sidecar_atomic',
  'mdc_invoke',
];

const WHITELIST_SUBSTRINGS = ['settings_save', 'settingsSave', 'fs_open_sidecar_externally', 'fsOpenSidecarExternally'];

function walk(root: string, ext: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === 'generated' || name === 'vendor' || name === 'target' || name === 'node_modules' || name === 'gen') continue;
        visit(full);
      } else if (st.isFile() && ext.some((e) => name.endsWith(e))) {
        // Skip test files within sources.
        if (name.endsWith('.test.ts') || name.endsWith('.test.rs')) continue;
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

function searchFile(path: string, content: string): string[] {
  const findings: string[] = [];
  for (const name of MUTATION_NAMES) {
    if (content.includes(name)) {
      // Allow when the matched substring is within a whitelisted name.
      const whitelisted = WHITELIST_SUBSTRINGS.some((w) => name.includes(w) || w.includes(name));
      if (whitelisted) continue;
      // Otherwise, find the line number for the report.
      const idx = content.indexOf(name);
      const line = content.slice(0, idx).split('\n').length;
      findings.push(`${path}:${line}: ${name}`);
    }
  }
  return findings;
}

describe('native-client: zero sidecar mutation paths in PR1', () => {
  it('no TS frontend file references a mutation operation', () => {
    const findings: string[] = [];
    for (const file of walk(TS_ROOT, ['.ts'])) {
      const content = readFileSync(file, 'utf-8');
      findings.push(...searchFile(file, content));
    }
    expect(findings, findings.join('\n')).toHaveLength(0);
  });

  it('no Rust backend file references a mutation command', () => {
    const findings: string[] = [];
    for (const file of walk(RUST_ROOT, ['.rs'])) {
      const content = readFileSync(file, 'utf-8');
      // Cargo conventionally puts unit tests inline with `#[cfg(test)] mod tests`;
      // we still scan them — PR1 must not test a mutation path either.
      findings.push(...searchFile(file, content));
    }
    expect(findings, findings.join('\n')).toHaveLength(0);
  });
});
