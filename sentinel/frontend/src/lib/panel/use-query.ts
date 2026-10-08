"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { emptyQuerySnapshot, getQuerySnapshot, loadQuery, subscribeQuery, type QuerySnap } from "@/lib/panel/cache";

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: { refreshMs?: number },
) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refreshMs = options?.refreshMs ?? 0;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => undefined;
      return subscribeQuery(key, listener);
    },
    [key],
  );

  const getSnapshot = useCallback(() => (key ? getQuerySnapshot(key) : emptyQuerySnapshot()), [key]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, emptyQuerySnapshot) as QuerySnap<T>;

  useEffect(() => {
    if (!key) return;
    void loadQuery(key, () => fetcherRef.current(), false);
  }, [key]);

  useEffect(() => {
    if (!key || refreshMs <= 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadQuery(key, () => fetcherRef.current(), true);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [key, refreshMs]);

  const reload = useCallback(() => {
    if (!key) return Promise.resolve();
    return loadQuery(key, () => fetcherRef.current(), true);
  }, [key]);

  return {
    data: snap.data,
    error: snap.data === undefined ? snap.error : null,
    loading: Boolean(key) && snap.data === undefined && snap.status !== "error",
    refreshing: snap.refreshing,
    updatedAt: snap.updatedAt,
    reload,
  };
}
