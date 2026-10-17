type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type ListSnapshot<T> = {
  items: T[];
  loaded: boolean;
  saving: boolean;
  error: string | null;
};

/** One shared store per key: all mutations and the initial read use the same queue. */
export function createPersistentListStore<T>(
  storage: Storage,
  key: string,
  isItem: (value: unknown) => value is T,
  label: string,
) {
  let snapshot: ListSnapshot<T> = { items: [], loaded: false, saving: false, error: null };
  let hydrated = false;
  let dirty = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (patch: Partial<ListSnapshot<T>>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };

  const enqueue = (operation: () => Promise<boolean>): Promise<boolean> => {
    const pending = queue.then(operation, operation);
    queue = pending.catch(() => undefined);
    return pending;
  };

  const hydrate = async () => {
    if (hydrated) return true;
    try {
      const stored = await storage.getItem(key);
      const parsed: unknown = stored === null ? [] : JSON.parse(stored);
      if (!Array.isArray(parsed) || !parsed.every(isItem)) throw new Error('Invalid saved list');
      hydrated = true;
      publish({ items: [...new Set(parsed as T[])], loaded: true, error: null });
      return true;
    } catch {
      // Do not overwrite unreadable data with an empty list on the next tap.
      publish({ loaded: true, error: `Could not load your ${label}. Retry before making changes.` });
      return false;
    }
  };

  const persist = async () => {
    publish({ saving: true });
    try {
      await storage.setItem(key, JSON.stringify(snapshot.items));
      dirty = false;
      publish({ saving: false, error: null });
      return true;
    } catch {
      publish({ saving: false, error: `Your ${label} changes are only saved for this session. Retry to keep them on this device.` });
      return false;
    }
  };

  const update = (transform: (items: T[]) => T[]) => enqueue(async () => {
    if (!await hydrate()) return false;
    const items = transform(snapshot.items);
    if (!items.every(isItem)) return false;
    dirty = true;
    publish({ items: [...new Set(items)] });
    return persist();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // Focused screens share memory. Re-reading here could clobber pending changes.
    load: () => enqueue(hydrate),
    toggle: (item: T) => update(items => items.includes(item) ? items.filter(value => value !== item) : [...items, item]),
    replace: (items: T[]) => {
      const copy = [...items];
      return update(() => copy);
    },
    clear: () => update(() => []),
    retry: () => enqueue(async () => {
      if (!await hydrate()) return false;
      return dirty ? persist() : true;
    }),
  };
}
