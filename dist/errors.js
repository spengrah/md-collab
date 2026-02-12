export class MdCollabError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MdCollabError';
    }
}
export const error = (code, message) => {
    throw new MdCollabError(code, message);
};
//# sourceMappingURL=errors.js.map