// Sanity tests for the browser sha256 shim against known FIPS 180-4 vectors
// plus the canonical "hello" and emoji inputs.

import { describe, expect, it } from 'vitest';
import { createHash } from '../../../native-client/src/app/node-crypto-shim.js';

const sha256hex = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('node-crypto-shim createHash sha256', () => {
  it('empty string', () => {
    expect(sha256hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('"abc"', () => {
    expect(sha256hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('long string', () => {
    expect(
      sha256hex(
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
      )
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('emoji utf-8', () => {
    expect(sha256hex('🎉')).toBe(
      '6146299cd54818a0e659eb6ac88e80f6f8f70536bbbd962d36973f2d2323f26c'
    );
  });

  it('throws on non-sha256 algorithm', () => {
    expect(() => createHash('md5')).toThrow();
  });
});
