import { describe, expect, it } from 'vitest';
import { serializeDeterministic } from '../../src/index.js';

describe('serializeDeterministic', () => {
  it('sorts top-level keys alphabetically', () => {
    const result = serializeDeterministic({ z: 1, a: 2, m: 3 });
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(['a', 'm', 'z']);
  });

  it('sorts keys in nested objects', () => {
    const result = serializeDeterministic({ b: { y: 1, x: 2 }, a: 0 });
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(['a', 'b']);
    expect(Object.keys(parsed.b)).toEqual(['x', 'y']);
  });

  it('preserves array element order', () => {
    const result = serializeDeterministic({ items: [3, 1, 2] });
    const parsed = JSON.parse(result);
    expect(parsed.items).toEqual([3, 1, 2]);
  });

  it('handles null values', () => {
    const result = serializeDeterministic({ a: null, b: 1 });
    const parsed = JSON.parse(result);
    expect(parsed.a).toBeNull();
    expect(parsed.b).toBe(1);
  });

  it('produces identical output for differently-ordered inputs', () => {
    const a = serializeDeterministic({ x: 1, a: 2 });
    const b = serializeDeterministic({ a: 2, x: 1 });
    expect(a).toBe(b);
  });

  it('ends with a trailing newline', () => {
    const result = serializeDeterministic({ a: 1 });
    expect(result.endsWith('\n')).toBe(true);
  });
});
