import { chdir, cwd } from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseSidecar } from '../../src/index.js';

describe('schema runtime loading', () => {
  it('does not depend on process.cwd for schema location', () => {
    const original = cwd();
    try {
      chdir('/tmp');
      const parsed = parseSidecar(`{
        "schema_version": "0.1.0",
        "document": {"path": "doc.md"},
        "threads": []
      }`);
      expect(parsed.schema_version).toBe('0.1.0');
    } finally {
      chdir(original);
    }
  });

  it('accepts unknown fields to preserve forward-compatible sidecar data', () => {
    const parsed = parseSidecar(`{
      "schema_version": "0.1.0",
      "document": {"path": "doc.md", "x_doc_extra": 1},
      "threads": [],
      "x_top_extra": {"a": true}
    }`);

    expect((parsed as any).x_top_extra).toBeDefined();
    expect((parsed as any).document.x_doc_extra).toBe(1);
  });
});
