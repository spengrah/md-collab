import { describe, expect, it } from 'vitest';
import { emptySidecar, hashText, sameRevision } from '../../src/index.js';
import type { SidecarRevisionToken } from '../../src/index.js';

describe('hashText', () => {
  it('returns a sha256-prefixed hex string', () => {
    const result = hashText('hello');
    expect(result.startsWith('sha256:')).toBe(true);
    expect(result.length).toBeGreaterThan('sha256:'.length);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashText('a')).not.toBe(hashText('b'));
  });

  it('is deterministic', () => {
    expect(hashText('same')).toBe(hashText('same'));
  });
});

describe('emptySidecar', () => {
  it('returns correct structure with given path', () => {
    const result = emptySidecar('/tmp/doc.md');
    expect(result.schema_version).toBe('0.1.0');
    expect(result.document.path).toBe('/tmp/doc.md');
    expect(result.threads).toEqual([]);
  });
});

describe('sameRevision', () => {
  const base: SidecarRevisionToken = {
    exists: true,
    mtimeMs: 1000,
    size: 42,
    hash: 'abc',
  };

  it('returns true for identical tokens', () => {
    expect(sameRevision({ ...base }, { ...base })).toBe(true);
  });

  it('returns false when exists differs', () => {
    expect(sameRevision(base, { ...base, exists: false })).toBe(false);
  });

  it('returns false when mtimeMs differs', () => {
    expect(sameRevision(base, { ...base, mtimeMs: 2000 })).toBe(false);
  });

  it('returns false when size differs', () => {
    expect(sameRevision(base, { ...base, size: 99 })).toBe(false);
  });

  it('returns false when hash differs', () => {
    expect(sameRevision(base, { ...base, hash: 'xyz' })).toBe(false);
  });

  it('returns true for two non-existent tokens', () => {
    const missing: SidecarRevisionToken = { exists: false, mtimeMs: null, size: null, hash: null };
    expect(sameRevision({ ...missing }, { ...missing })).toBe(true);
  });
});
