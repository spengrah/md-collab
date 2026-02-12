export class MdCollabError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'MdCollabError';
  }
}

export const error = (code: string, message: string): never => {
  throw new MdCollabError(code, message);
};
