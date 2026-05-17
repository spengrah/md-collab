// Tests for the IPC error envelope mapping.
//
// We don't have access to a real Tauri runtime in vitest, so we only exercise
// the error mapping surface (`IpcError.from`, `IpcError.isCode`). The actual
// `invoke()` wrappers are thin pass-throughs that are exercised indirectly by
// the components under test.

import { describe, expect, it } from 'vitest';
import { IpcError } from '../../../native-client/src/app/errors.js';

describe('IpcError.from', () => {
  it('maps a known FS_NOT_FOUND envelope', () => {
    const err = IpcError.from({
      code: 'FS_NOT_FOUND',
      path: '/tmp/missing',
      message: 'file not found: /tmp/missing',
    });
    expect(err).toBeInstanceOf(IpcError);
    expect(err.code).toBe('FS_NOT_FOUND');
    expect(err.path).toBe('/tmp/missing');
    expect(IpcError.isCode(err, 'FS_NOT_FOUND')).toBe(true);
    expect(IpcError.isCode(err, 'INTERNAL')).toBe(false);
  });

  it('maps NOT_IMPLEMENTED envelope', () => {
    const err = IpcError.from({ code: 'NOT_IMPLEMENTED', message: 'ssh' });
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(err.message).toBe('ssh');
  });

  it('downgrades unknown codes to INTERNAL', () => {
    const err = IpcError.from({ code: 'MYSTERY_CODE', message: 'huh' });
    expect(err.code).toBe('INTERNAL');
  });

  it('handles string inputs as INTERNAL', () => {
    const err = IpcError.from('exploded');
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('exploded');
  });

  it('passes IpcError through unchanged', () => {
    const original = new IpcError({ code: 'FS_IO', message: 'boom' });
    const mapped = IpcError.from(original);
    expect(mapped).toBe(original);
  });
});
