// TS-side mirror of the Rust IpcError envelope. We match on `code`, never on `message`.

export type IpcErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_PERMISSION_DENIED'
  | 'FS_IO'
  | 'WORKSPACE_INVALID'
  | 'PATH_INVALID'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export interface IpcErrorEnvelope {
  code: IpcErrorCode;
  path?: string;
  message: string;
}

const KNOWN_CODES: ReadonlySet<IpcErrorCode> = new Set([
  'FS_NOT_FOUND',
  'FS_PERMISSION_DENIED',
  'FS_IO',
  'WORKSPACE_INVALID',
  'PATH_INVALID',
  'NOT_IMPLEMENTED',
  'INTERNAL',
]);

export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly path?: string;

  constructor(envelope: IpcErrorEnvelope) {
    super(envelope.message);
    this.name = 'IpcError';
    this.code = envelope.code;
    this.path = envelope.path;
  }

  static isCode(err: unknown, code: IpcErrorCode): boolean {
    return err instanceof IpcError && err.code === code;
  }

  static from(value: unknown): IpcError {
    if (value instanceof IpcError) return value;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Partial<IpcErrorEnvelope>;
      if (typeof obj.code === 'string' && KNOWN_CODES.has(obj.code as IpcErrorCode)) {
        return new IpcError({
          code: obj.code as IpcErrorCode,
          path: obj.path,
          message: obj.message ?? `${obj.code}`,
        });
      }
    }
    return new IpcError({
      code: 'INTERNAL',
      message: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }
}
