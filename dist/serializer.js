const sortValue = (value) => {
    if (Array.isArray(value))
        return value.map(sortValue);
    if (value && typeof value === 'object') {
        const input = value;
        const out = {};
        for (const key of Object.keys(input).sort()) {
            out[key] = sortValue(input[key]);
        }
        return out;
    }
    return value;
};
export const serializeDeterministic = (value) => `${JSON.stringify(sortValue(value), null, 2)}\n`;
//# sourceMappingURL=serializer.js.map