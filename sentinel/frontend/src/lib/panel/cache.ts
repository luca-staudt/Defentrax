export type QueryStatus = "idle" | "loading" | "ready" | "error";

export type QuerySnap<T = unknown> = {
  data?: T;
  error: string | null;
  status: QueryStatus;
  refreshing: boolean;
  updatedAt: number;
};

const EMPTY: QuerySnap = {
  error: null,
  status: "idle",
  refreshing: false,
  updatedAt: 0,
};

type Entry = {
  snap: QuerySnap;
  promise?: Promise<void>;
  again: boolean;
  fetcher?: () => Promise<unknown>;
  listeners: Set<() => void>;
};

const STALE_MS = 8000;
const entries = new Map<string, Entry>();

function ensure(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { snap: EMPTY, again: false, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function publish(entry: Entry, snap: QuerySnap) {
  entry.snap = snap;
  entry.listeners.forEach((listener) => listener());
}

export function emptyQuerySnapshot(): QuerySnap {
  return EMPTY;
}

export function subscribeQuery(key: string, listener: () => void) {
  const entry = ensure(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function getQuerySnapshot(key: string): QuerySnap {
  return ensure(key).snap;
}

export function loadQuery<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<void> {
  const entry = ensure(key);
  entry.fetcher = fetcher as () => Promise<unknown>;
  if (entry.promise) {
    if (force) entry.again = true;
    return entry.promise;
  }
  const fresh = entry.snap.status === "ready" && Date.now() - entry.snap.updatedAt < STALE_MS;
  if (!force && fresh) return Promise.resolve();

  const hasData = entry.snap.data !== undefined;
  publish(entry, {
    data: entry.snap.data,
    error: hasData ? entry.snap.error : null,
    status: hasData ? entry.snap.status : "loading",
    refreshing: hasData,
    updatedAt: entry.snap.updatedAt,
  });

  const promise = fetcher()
    .then((data) => {
      publish(entry, {
        data,
        error: null,
        status: "ready",
        refreshing: false,
        updatedAt: Date.now(),
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Request failed";
      publish(entry, {
        data: entry.snap.data,
        error: message,
        status: entry.snap.data !== undefined ? "ready" : "error",
        refreshing: false,
        updatedAt: entry.snap.updatedAt,
      });
    })
    .finally(() => {
      entry.promise = undefined;
      if (entry.again && entry.fetcher) {
        entry.again = false;
        void loadQuery(key, entry.fetcher, true);
      }
    });
  entry.promise = promise;
  return promise;
}

export function invalidateQueries(prefixes: string[]) {
  for (const [key, entry] of entries) {
    const hit = prefixes.some((prefix) => key === prefix || key.startsWith(prefix));
    if (!hit || !entry.fetcher) continue;
    entry.snap = { ...entry.snap, updatedAt: 0 };
    if (entry.listeners.size > 0) {
      void loadQuery(key, entry.fetcher, true);
    }
  }
}

export function patchQuery<T>(key: string, updater: (data: T) => T) {
  const entry = ensure(key);
  if (entry.snap.data === undefined) return;
  publish(entry, {
    ...entry.snap,
    data: updater(entry.snap.data as T),
    status: "ready",
    error: null,
    refreshing: false,
    updatedAt: Date.now(),
  });
}
