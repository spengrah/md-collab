import { describe, expect, it, vi } from 'vitest';
import { signal } from '../../../native-client/src/app/store.js';

describe('signal', () => {
  it('returns initial value', () => {
    const s = signal(42);
    expect(s.get()).toBe(42);
  });

  it('set notifies subscribers exactly once per change', () => {
    const s = signal(0);
    const sub = vi.fn();
    s.subscribe(sub);
    s.set(1);
    s.set(2);
    expect(sub).toHaveBeenCalledTimes(2);
    expect(sub).toHaveBeenLastCalledWith(2);
  });

  it('set with same value is a no-op', () => {
    const s = signal('x');
    const sub = vi.fn();
    s.subscribe(sub);
    s.set('x');
    expect(sub).not.toHaveBeenCalled();
  });

  it('update is set with a function', () => {
    const s = signal({ count: 1 });
    s.update((prev) => ({ count: prev.count + 1 }));
    expect(s.get()).toEqual({ count: 2 });
  });

  it('unsubscribe removes the listener', () => {
    const s = signal(0);
    const sub = vi.fn();
    const off = s.subscribe(sub);
    s.set(1);
    off();
    s.set(2);
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
