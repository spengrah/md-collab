const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortValue(input[key]);
    }
    return out;
  }
  return value;
};

export const serializeDeterministic = (value: unknown): string =>
  `${JSON.stringify(sortValue(value), null, 2)}\n`;
