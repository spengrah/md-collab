// Minimal signal-style reactive store. ~50 LOC; deliberately no Zustand or
// similar. We have a small surface (workspace state, current file, settings)
// and don't need framework machinery.

export type Subscriber<T> = (value: T) => void;

export interface Signal<T> {
  get(): T;
  set(next: T): void;
  update(updater: (prev: T) => T): void;
  subscribe(fn: Subscriber<T>): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<Subscriber<T>>();
  return {
    get() {
      return value;
    },
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of subs) fn(value);
    },
    update(updater) {
      this.set(updater(value));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
